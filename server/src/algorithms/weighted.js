/**
 * weighted.js
 * ─────────────────────────────────────────────────────────
 * Weighted Round Robin load balancing algorithm.
 *
 * Strategy:
 *   Servers are assigned traffic proportional to their configured weight.
 *   A server with weight=3 receives ~3× as many requests as weight=1.
 *
 * Implementation detail:
 *   Uses the "smooth weighted round robin" technique (Nginx variant) which
 *   avoids bursting all high-weight requests together. Each selection:
 *     1. Increases each server's "current weight" by its configured weight
 *     2. Picks the server with the highest current weight
 *     3. Decreases the winner's current weight by the total weight sum
 *
 *   This produces a smooth, interleaved sequence even for large weight
 *   differences (e.g. weights [5,1,1] → A,A,A,B,A,A,C rather than AAAAABBC).
 *
 * Pros:  Handles heterogeneous server capacities; smooth distribution
 * Cons:  Requires weight configuration; doesn't react to live load
 *
 * Complexity: O(n) per selection
 */

'use strict';

class Weighted {
  constructor() {
    this.name = 'Weighted Round Robin';
    this.description =
      'Routes proportionally to server weight. Ideal for heterogeneous server capacities.';

    // currentWeight map: serverId → running weight accumulator
    this._currentWeights = new Map();
  }

  /**
   * Select a server using smooth weighted round robin.
   *
   * @param {ServerNode[]} servers - Array of available server nodes
   * @returns {ServerNode|null}    - Selected server, or null if none available
   */
  select(servers) {
    // Exclude offline servers
    const available = servers.filter(s => s.status !== 'offline');
    if (available.length === 0) return null;

    // ── Step 1: Ensure currentWeights map has entries for all servers ──
    for (const server of available) {
      if (!this._currentWeights.has(server.id)) {
        this._currentWeights.set(server.id, 0);
      }
    }

    // ── Step 2: Calculate total weight ────────────────────────────────
    const totalWeight = available.reduce((sum, s) => sum + s.weight, 0);

    // ── Step 3: Increase each server's current weight by its configured weight
    for (const server of available) {
      const prev = this._currentWeights.get(server.id) || 0;
      this._currentWeights.set(server.id, prev + server.weight);
    }

    // ── Step 4: Pick server with highest current weight ────────────────
    let selected = available[0];
    let maxCurrent = this._currentWeights.get(available[0].id);

    for (let i = 1; i < available.length; i++) {
      const cw = this._currentWeights.get(available[i].id);
      if (cw > maxCurrent) {
        maxCurrent = cw;
        selected = available[i];
      }
    }

    // ── Step 5: Decrease winner's weight by total weight sum ───────────
    this._currentWeights.set(
      selected.id,
      this._currentWeights.get(selected.id) - totalWeight
    );

    return selected;
  }

  /**
   * Reset smooth-weighting accumulators (called on simulation reset or
   * when server pool changes).
   */
  reset() {
    this._currentWeights.clear();
  }

  /**
   * Returns current weight accumulators for debugging.
   */
  getState() {
    return {
      currentWeights: Object.fromEntries(this._currentWeights),
    };
  }
}

module.exports = Weighted;
