/**
 * leastConnections.js
 * ─────────────────────────────────────────────────────────
 * Least Connections load balancing algorithm.
 *
 * Strategy:
 *   Each incoming request is routed to the server currently handling
 *   the fewest active connections (i.e. the least busy server).
 *
 * Pros:  Naturally adapts to variable request durations; prevents hot-spots
 * Cons:  Requires connection tracking; slight overhead per selection O(n)
 *
 * Tie-breaking:
 *   When multiple servers share the minimum connection count, the one with
 *   the lower index (first registered) is selected for determinism.
 */

'use strict';

class LeastConnections {
  constructor() {
    this.name = 'Least Connections';
    this.description =
      'Routes to the server with fewest active connections. Best for variable-length requests.';
  }

  /**
   * Select the server with the fewest active connections.
   *
   * @param {ServerNode[]} servers - Array of available server nodes
   * @returns {ServerNode|null}    - Selected server, or null if none available
   */
  select(servers) {
    // Exclude offline servers
    const available = servers.filter(s => s.status !== 'offline');
    if (available.length === 0) return null;

    // Linear scan to find minimum – O(n) but n is small (≤10 nodes)
    let selected = available[0];
    let minConnections = available[0].currentConnections;

    for (let i = 1; i < available.length; i++) {
      const server = available[i];
      if (server.currentConnections < minConnections) {
        minConnections = server.currentConnections;
        selected = server;
      }
    }

    return selected;
  }

  /**
   * Reset internal state (no stateful counters in this algorithm).
   */
  reset() {
    // No internal state to reset – connection counts live on ServerNode instances
  }

  /**
   * Returns debug state (connection snapshot at time of call).
   * @param {ServerNode[]} servers
   */
  getState(servers = []) {
    return {
      connectionSnapshot: servers.map(s => ({
        id: s.id,
        connections: s.currentConnections,
      })),
    };
  }
}

module.exports = LeastConnections;
