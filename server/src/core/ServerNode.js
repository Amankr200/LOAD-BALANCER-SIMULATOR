/**
 * ServerNode.js
 * ─────────────────────────────────────────────────────────
 * Represents a single virtual server node in the load balancer pool.
 *
 * Responsibilities:
 *  - Tracks active connections, processed requests, and response latency
 *  - Simulates request processing with configurable base latency + jitter
 *  - Provides real-time CPU and memory utilization approximations
 *  - Supports health-check state transitions (healthy / overloaded / offline)
 *
 * Concurrency model:
 *  Each call to handleRequest() is an async Promise that resolves after
 *  the simulated processing delay. Multiple simultaneous calls represent
 *  concurrent request handling on the same node.
 */

'use strict';

const { EventEmitter } = require('events');

class ServerNode extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.id          - Unique identifier (e.g. "server-1")
   * @param {string} opts.name        - Human-readable label (e.g. "Node-A")
   * @param {number} opts.weight      - Routing weight for weighted algorithms (1–10)
   * @param {number} opts.baseLatency - Base response time in ms (default 80)
   * @param {number} opts.maxConn     - Connection limit before node is flagged overloaded
   */
  constructor({ id, name, weight = 1, baseLatency = 80, maxConn = 50 }) {
    super();

    // ── Identity ──────────────────────────────────────────────────────────
    this.id = id;
    this.name = name;
    this.weight = weight;         // Used by Weighted algorithm

    // ── Capacity ──────────────────────────────────────────────────────────
    this.maxConnections = maxConn;
    this.baseLatency = baseLatency;

    // ── Live counters (reset-able) ────────────────────────────────────────
    this.currentConnections = 0;  // Active in-flight requests
    this.processedRequests = 0;   // Total requests handled since reset
    this.totalLatency = 0;        // Cumulative latency for avg calculation
    this.errors = 0;              // Failed requests

    // ── Derived metrics (updated after each request) ──────────────────────
    this.avgResponseTime = 0;
    this.peakConnections = 0;
    this.throughput = 0;          // req/s – computed externally by LoadBalancer
    this.cpuLoad = 0;             // 0–100 approximation based on concurrency
    this.memoryUsage = 0;         // 0–100 approximation

    // ── Health state ──────────────────────────────────────────────────────
    // Possible values: 'healthy' | 'overloaded' | 'offline'
    this.status = 'healthy';

    // Latency history ring-buffer (last 100 samples) for P95/P99
    this._latencyHistory = [];
    this._maxHistorySize = 100;

    // Throughput sliding window
    this._requestTimestamps = [];
    this._throughputWindowMs = 1000; // 1-second window
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Simulate handling one HTTP request.
   * Returns a promise that resolves with the request result after the
   * simulated processing duration.
   *
   * @param {object} request - { id, size, priority }
   * @returns {Promise<object>} result - { requestId, serverId, latency, success }
   */
  async handleRequest(request) {
    // Acquire "connection slot"
    this.currentConnections++;
    if (this.currentConnections > this.peakConnections) {
      this.peakConnections = this.currentConnections;
    }

    // Update health status based on load
    this._updateStatus();

    const startTime = Date.now();

    try {
      // ── Simulate processing delay ──────────────────────────────────────
      const latency = this._simulateLatency();
      await this._sleep(latency);

      // ── Record metrics ────────────────────────────────────────────────
      this.processedRequests++;
      this.totalLatency += latency;
      this.avgResponseTime = Math.round(this.totalLatency / this.processedRequests);

      // Push to latency history ring-buffer
      this._pushLatency(latency);

      // Record timestamp for throughput calculation
      this._requestTimestamps.push(Date.now());

      // Update derived metrics
      this._updateCpuLoad();
      this._updateMemoryUsage();

      return {
        requestId: request.id,
        serverId: this.id,
        serverName: this.name,
        latency,
        success: true,
        timestamp: startTime,
      };
    } catch (err) {
      this.errors++;
      return {
        requestId: request.id,
        serverId: this.id,
        serverName: this.name,
        latency: Date.now() - startTime,
        success: false,
        error: err.message,
      };
    } finally {
      // Release connection slot
      this.currentConnections = Math.max(0, this.currentConnections - 1);
      this._updateStatus();
    }
  }

  /**
   * Returns a plain-object snapshot of current metrics – safe to JSON.stringify.
   */
  getMetrics() {
    this._pruneTimestamps();
    const throughput = this._requestTimestamps.length; // req in last 1s

    return {
      id: this.id,
      name: this.name,
      weight: this.weight,
      status: this.status,
      currentConnections: this.currentConnections,
      processedRequests: this.processedRequests,
      avgResponseTime: this.avgResponseTime,
      peakConnections: this.peakConnections,
      cpuLoad: this._computeCpuLoad(),
      memoryUsage: this.memoryUsage,
      throughput,
      errors: this.errors,
      p95Latency: this._percentile(95),
      p99Latency: this._percentile(99),
      maxConnections: this.maxConnections,
    };
  }

  /**
   * Reset all counters – called on simulation reset.
   */
  reset() {
    this.currentConnections = 0;
    this.processedRequests = 0;
    this.totalLatency = 0;
    this.errors = 0;
    this.avgResponseTime = 0;
    this.peakConnections = 0;
    this.cpuLoad = 0;
    this.memoryUsage = 0;
    this.status = 'healthy';
    this._latencyHistory = [];
    this._requestTimestamps = [];
  }

  /**
   * Adjust server weight (used by weighted algorithm config updates).
   * @param {number} newWeight
   */
  setWeight(newWeight) {
    this.weight = Math.max(1, Math.min(10, newWeight));
  }

  /**
   * Toggle server offline/online (simulates node failure).
   */
  setOffline(offline) {
    this.status = offline ? 'offline' : 'healthy';
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Simulates a realistic response latency using base + jitter + load factor.
   * Load factor increases latency when server is heavily utilized.
   */
  _simulateLatency() {
    const loadFactor = this.currentConnections / this.maxConnections;
    const loadPenalty = loadFactor * this.baseLatency * 2; // up to 2x base under full load
    const jitter = (Math.random() - 0.5) * this.baseLatency * 0.4; // ±20% jitter
    return Math.max(10, Math.round(this.baseLatency + loadPenalty + jitter));
  }

  /** Update health status based on current connection count. */
  _updateStatus() {
    if (this.status === 'offline') return;
    const ratio = this.currentConnections / this.maxConnections;
    if (ratio >= 0.9) {
      this.status = 'overloaded';
    } else if (ratio >= 0.7) {
      this.status = 'busy';
    } else {
      this.status = 'healthy';
    }
  }

  /** Approximate CPU load based on connection ratio + randomness. */
  _computeCpuLoad() {
    const base = (this.currentConnections / this.maxConnections) * 85;
    const noise = Math.random() * 10 - 5;
    return Math.min(100, Math.max(0, Math.round(base + noise)));
  }

  _updateCpuLoad() {
    this.cpuLoad = this._computeCpuLoad();
  }

  /** Approximate memory usage – grows slowly with processed requests. */
  _updateMemoryUsage() {
    const base = 20 + (this.processedRequests % 200) * 0.15;
    const connectionLoad = (this.currentConnections / this.maxConnections) * 30;
    this.memoryUsage = Math.min(100, Math.round(base + connectionLoad));
  }

  /** Push latency sample into ring-buffer. */
  _pushLatency(latency) {
    this._latencyHistory.push(latency);
    if (this._latencyHistory.length > this._maxHistorySize) {
      this._latencyHistory.shift();
    }
  }

  /** Calculate percentile from latency history. */
  _percentile(p) {
    if (this._latencyHistory.length === 0) return 0;
    const sorted = [...this._latencyHistory].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  /** Remove timestamps outside the sliding window. */
  _pruneTimestamps() {
    const cutoff = Date.now() - this._throughputWindowMs;
    this._requestTimestamps = this._requestTimestamps.filter(t => t > cutoff);
  }

  /** Promise-based sleep utility. */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ServerNode;
