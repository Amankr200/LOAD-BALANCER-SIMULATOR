/**
 * TrafficControls.jsx
 * ─────────────────────────────────────────────────────────
 * Simulation control panel:
 *  - Start / Stop / Reset buttons
 *  - Traffic pattern selector
 *  - Requests/sec slider
 *  - Server count selector
 *  - Algorithm selector (with descriptions)
 *  - Per-server weight sliders (for Weighted mode)
 */

import React, { useState, useCallback } from 'react';
import './TrafficControls.css';

const TRAFFIC_PATTERNS = [
  { key: 'uniform',  label: '⟶ Uniform',  desc: 'Steady constant rate' },
  { key: 'burst',    label: '⚡ Burst',     desc: '3s high / 3s low cycles' },
  { key: 'spike',    label: '📈 Spike',     desc: 'Short spikes every 10s' },
  { key: 'ramp-up',  label: '🚀 Ramp-Up',  desc: 'Linearly increases to target' },
];

const ALGORITHMS = [
  { key: 'round-robin',        label: 'Round Robin',           icon: '🔄' },
  { key: 'least-connections',  label: 'Least Connections',     icon: '⚖️' },
  { key: 'weighted',           label: 'Weighted Round Robin',  icon: '🏋️' },
];

export default function TrafficControls({
  isRunning,
  algorithm,
  serverCount,
  trafficPattern,
  ratePerSec,
  servers,
  loading,
  onStart,
  onStop,
  onReset,
  onApplyConfig,
  onUpdateServer,
}) {
  // Local draft state (applied on "Apply" or immediately for some controls)
  const [draftAlgo,    setDraftAlgo]    = useState(algorithm);
  const [draftCount,   setDraftCount]   = useState(serverCount);
  const [draftPattern, setDraftPattern] = useState(trafficPattern);
  const [draftRate,    setDraftRate]    = useState(ratePerSec);

  const handleApply = useCallback(() => {
    onApplyConfig({
      algorithm:   draftAlgo,
      serverCount: draftCount,
      pattern:     draftPattern,
      ratePerSec:  draftRate,
    });
  }, [draftAlgo, draftCount, draftPattern, draftRate, onApplyConfig]);

  return (
    <div className="traffic-controls">

      {/* ── Simulation Controls ───────────────────────────── */}
      <section className="ctrl-section glass-card">
        <div className="ctrl-section__title">Simulation Control</div>
        <div className="ctrl-buttons">
          {!isRunning ? (
            <button
              id="btn-start"
              className="btn btn-success"
              onClick={onStart}
              disabled={loading}
            >
              ▶ Start Simulation
            </button>
          ) : (
            <button
              id="btn-stop"
              className="btn btn-danger"
              onClick={onStop}
              disabled={loading}
            >
              ⏹ Stop
            </button>
          )}
          <button
            id="btn-reset"
            className="btn btn-ghost"
            onClick={onReset}
            disabled={loading}
          >
            ↺ Reset
          </button>
        </div>

        {/* Status badge */}
        <div className="ctrl-status">
          <div className={`ctrl-status__dot ${isRunning ? 'ctrl-status__dot--running' : ''}`} />
          <span>{isRunning ? 'Simulation Running' : 'Simulation Stopped'}</span>
        </div>
      </section>

      {/* ── Algorithm Selector ────────────────────────────── */}
      <section className="ctrl-section glass-card">
        <div className="ctrl-section__title">Load Balancing Algorithm</div>
        <div className="algo-selector">
          {ALGORITHMS.map(algo => (
            <button
              key={algo.key}
              id={`algo-${algo.key}`}
              className={`algo-btn ${draftAlgo === algo.key ? 'algo-btn--active' : ''}`}
              onClick={() => setDraftAlgo(algo.key)}
            >
              <span className="algo-btn__icon">{algo.icon}</span>
              <span className="algo-btn__label">{algo.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Traffic Pattern ───────────────────────────────── */}
      <section className="ctrl-section glass-card">
        <div className="ctrl-section__title">Traffic Pattern</div>
        <div className="pattern-grid">
          {TRAFFIC_PATTERNS.map(p => (
            <button
              key={p.key}
              id={`pattern-${p.key}`}
              className={`pattern-btn ${draftPattern === p.key ? 'pattern-btn--active' : ''}`}
              onClick={() => setDraftPattern(p.key)}
            >
              <span className="pattern-btn__label">{p.label}</span>
              <span className="pattern-btn__desc">{p.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Rate & Server Count sliders ───────────────────── */}
      <section className="ctrl-section glass-card">
        <div className="ctrl-section__title">Traffic Parameters</div>

        <div className="slider-group">
          <div className="slider-label-row">
            <label htmlFor="slider-rate">Requests / sec</label>
            <span className="slider-value glow-cyan">{draftRate}</span>
          </div>
          <input
            id="slider-rate"
            type="range"
            min="1" max="200" step="1"
            value={draftRate}
            onChange={e => setDraftRate(Number(e.target.value))}
          />
          <div className="slider-ticks"><span>1</span><span>100</span><span>200</span></div>
        </div>

        <div className="slider-group">
          <div className="slider-label-row">
            <label htmlFor="slider-servers">Server Count</label>
            <span className="slider-value glow-purple">{draftCount}</span>
          </div>
          <input
            id="slider-servers"
            type="range"
            min="2" max="8" step="1"
            value={draftCount}
            onChange={e => setDraftCount(Number(e.target.value))}
          />
          <div className="slider-ticks"><span>2</span><span>5</span><span>8</span></div>
        </div>
      </section>

      {/* ── Per-Server Weights (Weighted mode only) ───────── */}
      {draftAlgo === 'weighted' && servers?.length > 0 && (
        <section className="ctrl-section glass-card">
          <div className="ctrl-section__title">Server Weights</div>
          <div className="weights-list">
            {servers.map((server, i) => (
              <div key={server.id} className="weight-row">
                <span className="weight-server-name">{server.name}</span>
                <input
                  id={`weight-${server.id}`}
                  type="range"
                  min="1" max="10" step="1"
                  defaultValue={server.weight}
                  onChange={e => onUpdateServer(server.id, { weight: Number(e.target.value) })}
                  style={{ flex: 1 }}
                />
                <span className="weight-value">{server.weight}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Apply button ──────────────────────────────────── */}
      <button
        id="btn-apply"
        className="btn btn-primary"
        onClick={handleApply}
        disabled={loading}
        style={{ width: '100%' }}
      >
        ✓ Apply Configuration
      </button>
    </div>
  );
}
