/**
 * LoadBalancer.js
 * ─────────────────────────────────────────────────────────
 * Core load balancer engine.
 *
 * Responsibilities:
 *  1. Manages the pool of ServerNode instances
 *  2. Accepts incoming virtual requests and routes them via the active algorithm
 *  3. Collects per-request and aggregate metrics
 *  4. Supports hot-swapping of algorithms without restarting the simulation
 *  5. Emits metric snapshots every METRICS_INTERVAL ms for WebSocket broadcast
 *
 * Multi-server concurrency:
 *  handleRequest() is non-blocking – it fires off ServerNode.handleRequest()
 *  as an async Promise and returns immediately. Multiple concurrent calls
 *  are handled in parallel, simulating true multi-threaded server behaviour.
 */

'use strict';

const { EventEmitter } = require('events');
const ServerNode = require('./ServerNode');
const RoundRobin = require('../algorithms/roundRobin');
const LeastConnections = require('../algorithms/leastConnections');
const Weighted = require('../algorithms/weighted');

// How often (ms) to emit a metrics snapshot to WebSocket clients
const METRICS_INTERVAL = 500;

// Algorithm registry
const ALGORITHMS = {
  'round-robin': RoundRobin,
  'least-connections': LeastConnections,
  'weighted': Weighted,
};

// Default server configurations (used when pool is first created)
const DEFAULT_SERVERS = [
  { id: 'server-1', name: 'Node-Alpha',  weight: 3, baseLatency: 60,  maxConn: 50 },
  { id: 'server-2', name: 'Node-Beta',   weight: 2, baseLatency: 90,  maxConn: 50 },
  { id: 'server-3', name: 'Node-Gamma',  weight: 2, baseLatency: 120, maxConn: 40 },
  { id: 'server-4', name: 'Node-Delta',  weight: 1, baseLatency: 150, maxConn: 30 },
];

class LoadBalancer extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.algorithm  - Algorithm key ('round-robin' | 'least-connections' | 'weighted')
   * @param {number} opts.serverCount - Number of servers to spawn (2–10)
   */
  constructor(opts = {}) {
    super();

    // ── Algorithm ─────────────────────────────────────────────────────────
    const algoKey = opts.algorithm || 'round-robin';
    this.algorithmKey = algoKey;
    this.algorithm = this._createAlgorithm(algoKey);

    // ── Server pool ───────────────────────────────────────────────────────
    const serverCount = Math.min(10, Math.max(2, opts.serverCount || 4));
    this.servers = this._buildServerPool(serverCount);

    // ── Aggregate metrics ─────────────────────────────────────────────────
    this.totalRequests = 0;      // Lifetime requests routed
    this.totalErrors = 0;        // Lifetime failed requests
    this.droppedRequests = 0;    // Requests with no available server
    this._requestLog = [];       // Recent requests for the feed (max 100)
    this._maxLogSize = 100;

    // Time-series data for charts (rolling 60-second window at 0.5s resolution)
    this._timeSeries = [];       // [{ ts, servers: [{id, connections, throughput, cpuLoad}] }]
    this._maxSeriesPoints = 120; // 60s × 2 points/s

    // ── Metrics broadcast timer ───────────────────────────────────────────
    this._metricsTimer = null;
    this._startMetricsLoop();

    // Simulation start time (for uptime calculation)
    this._startedAt = Date.now();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Route an incoming virtual request to a server using the active algorithm.
   * Non-blocking: returns immediately; processing happens asynchronously.
   *
   * @param {object} request - { id, size?, priority? }
   */
  handleRequest(request) {
    this.totalRequests++;

    // Select a server
    const server = this.algorithm.select(this.servers);

    if (!server) {
      // No servers available – drop the request
      this.droppedRequests++;
      const logEntry = {
        id: request.id,
        serverId: null,
        serverName: 'DROPPED',
        latency: 0,
        success: false,
        error: 'No server available',
        timestamp: Date.now(),
      };
      this._pushLog(logEntry);
      this.emit('request-dropped', logEntry);
      return;
    }

    // Delegate to server (async, non-blocking)
    server.handleRequest(request).then(result => {
      if (!result.success) this.totalErrors++;

      const logEntry = {
        ...result,
        algorithm: this.algorithmKey,
      };
      this._pushLog(logEntry);
      this.emit('request-complete', logEntry);
    });
  }

  /**
   * Switch to a different load balancing algorithm (hot-swap).
   * The current algorithm's state is discarded; the new one starts fresh.
   *
   * @param {string} algoKey - One of 'round-robin', 'least-connections', 'weighted'
   */
  setAlgorithm(algoKey) {
    if (!ALGORITHMS[algoKey]) {
      throw new Error(`Unknown algorithm: "${algoKey}". Valid: ${Object.keys(ALGORITHMS).join(', ')}`);
    }
    this.algorithmKey = algoKey;
    this.algorithm = this._createAlgorithm(algoKey);
    this.emit('algorithm-changed', { algorithm: algoKey });
  }

  /**
   * Rebuild the server pool with a new count (preserves algorithm state).
   * @param {number} count - Number of servers (2–10)
   */
  setServerCount(count) {
    const n = Math.min(10, Math.max(2, count));
    this.servers = this._buildServerPool(n);
    this.algorithm.reset(); // Reset algorithm state since pool changed
    this.emit('servers-changed', { count: n });
  }

  /**
   * Update configuration for a specific server (weight, baseLatency, status).
   * @param {string} serverId
   * @param {object} updates - { weight?, baseLatency?, offline? }
   */
  updateServer(serverId, updates) {
    const server = this.servers.find(s => s.id === serverId);
    if (!server) return;

    if (updates.weight !== undefined) server.setWeight(updates.weight);
    if (updates.offline !== undefined) server.setOffline(updates.offline);
    if (updates.baseLatency !== undefined) server.baseLatency = updates.baseLatency;

    // Reset weighted algorithm so new weights take effect immediately
    if (updates.weight !== undefined && this.algorithmKey === 'weighted') {
      this.algorithm.reset();
    }
  }

  /**
   * Reset all server metrics and algorithm state.
   */
  reset() {
    this.servers.forEach(s => s.reset());
    this.algorithm.reset();
    this.totalRequests = 0;
    this.totalErrors = 0;
    this.droppedRequests = 0;
    this._requestLog = [];
    this._timeSeries = [];
    this._startedAt = Date.now();
    this.emit('reset');
  }

  /**
   * Returns a full snapshot of current state (for REST /api/status).
   */
  getSnapshot() {
    return {
      algorithm: this.algorithmKey,
      algorithmName: this.algorithm.name,
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      droppedRequests: this.droppedRequests,
      uptime: Date.now() - this._startedAt,
      servers: this.servers.map(s => s.getMetrics()),
      recentRequests: this._requestLog.slice(-20),
      timeSeries: this._timeSeries.slice(-60),
    };
  }

  /**
   * Clean up timers (call when shutting down).
   */
  destroy() {
    if (this._metricsTimer) clearInterval(this._metricsTimer);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Create and return a fresh algorithm instance. */
  _createAlgorithm(key) {
    const AlgoClass = ALGORITHMS[key] || RoundRobin;
    return new AlgoClass();
  }

  /** Build a server pool from DEFAULT_SERVERS (up to `count` entries, cycling). */
  _buildServerPool(count) {
    const servers = [];
    const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa'];
    const latencies = [60, 90, 120, 150, 80, 100, 70, 130, 110, 95];
    const weights = [3, 2, 2, 1, 3, 2, 3, 1, 2, 2];

    for (let i = 0; i < count; i++) {
      servers.push(
        new ServerNode({
          id: `server-${i + 1}`,
          name: `Node-${names[i % names.length]}`,
          weight: weights[i % weights.length],
          baseLatency: latencies[i % latencies.length],
          maxConn: 50,
        })
      );
    }
    return servers;
  }

  /** Push a request log entry (ring-buffer). */
  _pushLog(entry) {
    this._requestLog.push(entry);
    if (this._requestLog.length > this._maxLogSize) {
      this._requestLog.shift();
    }
  }

  /** Append a time-series data point. */
  _recordTimeSeries() {
    const point = {
      ts: Date.now(),
      servers: this.servers.map(s => {
        const m = s.getMetrics();
        return {
          id: m.id,
          name: m.name,
          connections: m.currentConnections,
          throughput: m.throughput,
          cpuLoad: m.cpuLoad,
          avgResponseTime: m.avgResponseTime,
          status: m.status,
        };
      }),
    };
    this._timeSeries.push(point);
    if (this._timeSeries.length > this._maxSeriesPoints) {
      this._timeSeries.shift();
    }
  }

  /** Start the recurring metrics broadcast loop. */
  _startMetricsLoop() {
    this._metricsTimer = setInterval(() => {
      this._recordTimeSeries();
      const snapshot = this.getSnapshot();
      this.emit('metrics', snapshot);
    }, METRICS_INTERVAL);
  }
}

module.exports = LoadBalancer;
