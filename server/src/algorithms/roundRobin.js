/**
 * roundRobin.js
 * ─────────────────────────────────────────────────────────
 * Classic Round Robin load balancing algorithm.
 *
 * Strategy:
 *   Each incoming request is assigned to the next server in a circular
 *   sequence, regardless of current load.
 *
 * Pros:  Simple, fair for uniform workloads, zero overhead
 * Cons:  Ignores server load; can cause imbalance with variable request sizes
 *
 * Complexity: O(1) per request (counter increment + modulo)
 */

'use strict';

class RoundRobin {
  constructor() {
    this.name = 'Round Robin';
    this.description =
      'Cycles through servers in order. Simple and fair for uniform workloads.';
    // Index of the next server to receive a request
    this._counter = 0;
  }

  /**
   * Select a server from the pool using Round Robin.
   *
   * @param {ServerNode[]} servers - Array of available server nodes
   * @returns {ServerNode|null}    - Selected server, or null if none available
   */
  select(servers) {
    // Filter out offline servers only (keep overloaded ones – RR is load-agnostic)
    const available = servers.filter(s => s.status !== 'offline');
    if (available.length === 0) return null;

    // Wrap counter within available pool size
    const index = this._counter % available.length;
    this._counter = (this._counter + 1) % available.length;

    return available[index];
  }

  /**
   * Reset internal state (called on simulation reset).
   */
  reset() {
    this._counter = 0;
  }

  /**
   * Returns a human-readable summary of the current state.
   */
  getState() {
    return { counter: this._counter };
  }
}

module.exports = RoundRobin;
