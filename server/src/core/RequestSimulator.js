/**
 * RequestSimulator.js
 * ─────────────────────────────────────────────────────────
 * Generates synthetic HTTP request traffic directed at the LoadBalancer.
 *
 * Traffic patterns:
 *  ┌─────────────┬──────────────────────────────────────────────────────┐
 *  │ Uniform     │ Steady rate of N req/s – baseline for comparisons    │
 *  │ Burst       │ Alternates between high and low traffic in 3s blocks │
 *  │ Spike       │ Short sharp spike (2s) then quiet – stress test       │
 *  │ Ramp-Up     │ Linearly increases from 10% to 100% of target rate   │
 *  └─────────────┴──────────────────────────────────────────────────────┘
 *
 * Concurrency model:
 *  Uses setInterval to create request "ticks". Each tick fires a batch of
 *  concurrent requests (determined by the pattern's computed rate). The batch
 *  is dispatched via lb.handleRequest() which is non-blocking, so multiple
 *  in-flight requests co-exist simultaneously – simulating real concurrency.
 *
 * Usage:
 *  const sim = new RequestSimulator(lb);
 *  sim.start({ pattern: 'burst', ratePerSec: 40 });
 *  sim.stop();
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { EventEmitter } = require('events');

// How often (ms) to fire a request batch tick
const TICK_INTERVAL_MS = 100; // 10 ticks per second

class RequestSimulator extends EventEmitter {
  /**
   * @param {LoadBalancer} lb - The load balancer instance to send requests to
   */
  constructor(lb) {
    super();
    this.lb = lb;
    this._timer = null;
    this._running = false;
    this._ratePerSec = 20;     // Default: 20 req/s
    this._pattern = 'uniform'; // Default traffic pattern
    this._tickCount = 0;        // Elapsed ticks (for ramp-up calculation)
    this._rampDurationTicks = 100; // Ticks to reach full rate (10 seconds)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start generating traffic.
   * @param {object} opts
   * @param {string} opts.pattern    - 'uniform' | 'burst' | 'spike' | 'ramp-up'
   * @param {number} opts.ratePerSec - Target requests per second (1–500)
   */
  start(opts = {}) {
    if (this._running) this.stop(); // Stop previous run

    this._pattern = opts.pattern || 'uniform';
    this._ratePerSec = Math.min(500, Math.max(1, opts.ratePerSec || 20));
    this._tickCount = 0;
    this._running = true;

    this.emit('started', { pattern: this._pattern, ratePerSec: this._ratePerSec });

    this._timer = setInterval(() => this._tick(), TICK_INTERVAL_MS);
  }

  /**
   * Stop generating traffic.
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._running = false;
    this.emit('stopped');
  }

  /**
   * Update traffic parameters without full restart.
   * @param {object} opts - { pattern?, ratePerSec? }
   */
  update(opts = {}) {
    if (opts.pattern) this._pattern = opts.pattern;
    if (opts.ratePerSec !== undefined) {
      this._ratePerSec = Math.min(500, Math.max(1, opts.ratePerSec));
    }
  }

  /** Returns current simulation config. */
  getConfig() {
    return {
      running: this._running,
      pattern: this._pattern,
      ratePerSec: this._ratePerSec,
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Called every TICK_INTERVAL_MS. Computes the current batch size for this
   * tick based on the active traffic pattern, then fires that many requests
   * concurrently (all dispatched in the same synchronous loop iteration).
   */
  _tick() {
    this._tickCount++;

    // Determine how many requests to dispatch this tick
    const batchSize = this._computeBatchSize();
    if (batchSize <= 0) return;

    // Fire requests concurrently (non-blocking)
    for (let i = 0; i < batchSize; i++) {
      const request = this._buildRequest();
      this.lb.handleRequest(request);
    }
  }

  /**
   * Compute the number of requests to fire in this tick based on pattern.
   * Base rate: ratePerSec / (1000 / TICK_INTERVAL_MS) = ratePerSec / 10
   */
  _computeBatchSize() {
    // Base requests per tick (float, we use probabilistic rounding)
    const basePerTick = this._ratePerSec / (1000 / TICK_INTERVAL_MS);

    let multiplier = 1;

    switch (this._pattern) {
      case 'uniform':
        // Constant rate
        multiplier = 1;
        break;

      case 'burst':
        // 3-second bursts alternating between 3× and 0.2× of target rate
        // 3s × 10 ticks/s = 30 ticks per phase
        multiplier = (Math.floor(this._tickCount / 30) % 2 === 0) ? 3 : 0.2;
        break;

      case 'spike':
        // Short 2s spike every 10 seconds, otherwise 0.1× quiet rate
        // 10s × 10 ticks/s = 100 ticks per cycle; spike lasts 20 ticks
        multiplier = (this._tickCount % 100 < 20) ? 5 : 0.1;
        break;

      case 'ramp-up':
        // Linearly ramp from 10% to 100% over _rampDurationTicks
        const progress = Math.min(1, this._tickCount / this._rampDurationTicks);
        multiplier = 0.1 + progress * 0.9;
        break;

      default:
        multiplier = 1;
    }

    const exactCount = basePerTick * multiplier;

    // Probabilistic rounding: floor + probabilistic extra request
    // e.g. 2.7 → 2 requests + 70% chance of a 3rd request
    const floor = Math.floor(exactCount);
    const extra = Math.random() < (exactCount - floor) ? 1 : 0;
    return floor + extra;
  }

  /** Build a synthetic request object. */
  _buildRequest() {
    return {
      id: uuidv4(),
      size: Math.floor(Math.random() * 1024) + 64, // 64–1088 bytes
      priority: Math.random() > 0.9 ? 'high' : 'normal', // 10% high priority
      timestamp: Date.now(),
    };
  }
}

module.exports = RequestSimulator;
