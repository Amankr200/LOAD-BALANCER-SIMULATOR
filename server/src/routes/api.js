/**
 * api.js – REST API Routes
 * ─────────────────────────────────────────────────────────
 * Provides HTTP endpoints for controlling the load balancer simulation.
 *
 * Endpoints:
 *  GET  /api/status      → Current snapshot of all server metrics
 *  POST /api/start       → Start the request simulator
 *  POST /api/stop        → Stop the request simulator
 *  POST /api/config      → Update algorithm, server count, traffic pattern
 *  POST /api/reset       → Reset all metrics to zero
 *  POST /api/server/:id  → Update individual server (weight, latency, offline)
 *  GET  /api/algorithms  → List available algorithms
 *  GET  /api/compare     → Run a 5-second comparison of all algorithms
 */

'use strict';

const express = require('express');
const router = express.Router();

/**
 * Attach the API routes to the Express app.
 * Dependency injection: lb (LoadBalancer) and sim (RequestSimulator)
 * are passed in at startup and shared via closure.
 *
 * @param {LoadBalancer}       lb  - Core load balancer engine
 * @param {RequestSimulator}   sim - Traffic generator
 * @returns {express.Router}
 */
function createApiRouter(lb, sim) {

  // ── GET /api/status ────────────────────────────────────────────────────────
  // Returns full snapshot: server metrics, recent requests, time-series data
  router.get('/status', (req, res) => {
    res.json({
      success: true,
      data: lb.getSnapshot(),
      simulator: sim.getConfig(),
    });
  });

  // ── GET /api/algorithms ────────────────────────────────────────────────────
  // Returns the list of available algorithms with descriptions
  router.get('/algorithms', (req, res) => {
    res.json({
      success: true,
      data: [
        {
          key: 'round-robin',
          name: 'Round Robin',
          description: 'Cycles through servers in order. Simple and fair for uniform workloads.',
          complexity: 'O(1)',
          bestFor: 'Homogeneous servers with similar processing times',
        },
        {
          key: 'least-connections',
          name: 'Least Connections',
          description: 'Routes to the server with fewest active connections.',
          complexity: 'O(n)',
          bestFor: 'Variable-length requests with heterogeneous processing times',
        },
        {
          key: 'weighted',
          name: 'Weighted Round Robin',
          description: 'Routes proportionally to server weight. Nginx smooth variant.',
          complexity: 'O(n)',
          bestFor: 'Heterogeneous servers with different hardware capacities',
        },
      ],
    });
  });

  // ── POST /api/start ────────────────────────────────────────────────────────
  // Start the request simulator with provided configuration
  router.post('/start', (req, res) => {
    const { pattern = 'uniform', ratePerSec = 20 } = req.body || {};

    try {
      sim.start({ pattern, ratePerSec: Number(ratePerSec) });
      res.json({
        success: true,
        message: 'Simulation started',
        config: sim.getConfig(),
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ── POST /api/stop ─────────────────────────────────────────────────────────
  // Stop the request simulator (servers keep their metrics)
  router.post('/stop', (req, res) => {
    sim.stop();
    res.json({ success: true, message: 'Simulation stopped' });
  });

  // ── POST /api/config ───────────────────────────────────────────────────────
  // Update algorithm, server count, and/or traffic pattern on the fly
  router.post('/config', (req, res) => {
    const { algorithm, serverCount, pattern, ratePerSec } = req.body || {};

    const changes = [];

    try {
      if (algorithm) {
        lb.setAlgorithm(algorithm);
        changes.push(`algorithm → ${algorithm}`);
      }

      if (serverCount !== undefined) {
        lb.setServerCount(Number(serverCount));
        changes.push(`serverCount → ${serverCount}`);
      }

      if (pattern || ratePerSec !== undefined) {
        sim.update({
          pattern: pattern || undefined,
          ratePerSec: ratePerSec !== undefined ? Number(ratePerSec) : undefined,
        });
        changes.push(`traffic → ${pattern || '-'} @ ${ratePerSec || '-'} req/s`);
      }

      res.json({
        success: true,
        message: `Applied: ${changes.join(', ')}`,
        snapshot: lb.getSnapshot(),
        simulator: sim.getConfig(),
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ── POST /api/reset ────────────────────────────────────────────────────────
  // Reset all server metrics and algorithm state. Stops simulation first.
  router.post('/reset', (req, res) => {
    sim.stop();
    lb.reset();
    res.json({ success: true, message: 'Simulation reset' });
  });

  // ── POST /api/server/:id ───────────────────────────────────────────────────
  // Update a specific server's configuration (weight, latency, online/offline)
  router.post('/server/:id', (req, res) => {
    const { id } = req.params;
    const { weight, baseLatency, offline } = req.body || {};

    const server = lb.servers.find(s => s.id === id);
    if (!server) {
      return res.status(404).json({ success: false, error: `Server "${id}" not found` });
    }

    lb.updateServer(id, {
      weight: weight !== undefined ? Number(weight) : undefined,
      baseLatency: baseLatency !== undefined ? Number(baseLatency) : undefined,
      offline: offline !== undefined ? Boolean(offline) : undefined,
    });

    res.json({
      success: true,
      message: `Server ${id} updated`,
      server: server.getMetrics(),
    });
  });

  return router;
}

module.exports = { createApiRouter };
