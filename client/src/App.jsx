/**
 * App.jsx – Load Balancer Simulator
 * ─────────────────────────────────────────────────────────
 * Root component. Manages:
 *  - WebSocket connection lifecycle
 *  - Simulation state (via useSimulation hook)
 *  - Tab-based navigation: Live Simulation | Performance Comparison
 *  - Top navigation bar with connection status
 */

import React, { useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useSimulation } from './hooks/useSimulation';
import Dashboard from './components/Dashboard';
import ComparisonPanel from './components/ComparisonPanel';
import './App.css';

// ── Navigation tabs ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'live',       label: '⚡ Live Simulation' },
  { id: 'compare',    label: '📊 Performance Comparison' },
];

// ── Connection status badge ───────────────────────────────────────────────────

function ConnectionStatus({ status, retryCount }) {
  const cfg = {
    open:       { label: 'Connected',   cls: 'status-badge--connected' },
    connecting: { label: 'Connecting…', cls: 'status-badge--connecting' },
    closed:     { label: `Reconnecting (${retryCount})`, cls: 'status-badge--reconnecting' },
    error:      { label: 'Disconnected', cls: 'status-badge--error' },
  }[status] || { label: status, cls: '' };

  return (
    <div className={`status-badge ${cfg.cls}`}>
      <div className="status-badge__dot" />
      <span>{cfg.label}</span>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState('live');

  const sim = useSimulation();

  const { status: wsStatus, retryCount } = useWebSocket({
    onInit:            sim.ingestInit,
    onMetrics:         sim.ingestMetrics,
    onRequestComplete: sim.ingestRequest,
    onReset:           () => {},
    onAlgorithmChanged: () => {},
  });

  return (
    <div className="app">
      {/* ── Navigation bar ─────────────────────────────── */}
      <nav className="navbar" role="navigation" aria-label="Main navigation">
        {/* Brand */}
        <div className="navbar__brand">
          <div className="navbar__logo">⚖️</div>
          <div className="navbar__title-group">
            <span className="navbar__title">Load Balancer</span>
            <span className="navbar__subtitle">Distributed Systems Simulator</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="navbar__tabs" role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`navbar__tab ${activeTab === tab.id ? 'navbar__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: connection status */}
        <div className="navbar__right">
          <ConnectionStatus status={wsStatus} retryCount={retryCount} />
        </div>
      </nav>

      {/* ── Error banner ───────────────────────────────── */}
      {sim.error && (
        <div className="error-banner" role="alert">
          ⚠️ {sim.error}
          <button className="error-banner__dismiss" onClick={() => {}}>✕</button>
        </div>
      )}

      {/* ── Page content ────────────────────────────────── */}
      <main className="app__content" role="main">
        {activeTab === 'live' && (
          <Dashboard
            isRunning={sim.isRunning}
            servers={sim.servers}
            requestLog={sim.requestLog}
            timeSeries={sim.timeSeries}
            totalRequests={sim.totalRequests}
            totalErrors={sim.totalErrors}
            droppedRequests={sim.droppedRequests}
            uptime={sim.uptime}
            algorithm={sim.algorithm}
            serverCount={sim.serverCount}
            trafficPattern={sim.trafficPattern}
            ratePerSec={sim.ratePerSec}
            loading={sim.loading}
            onStart={sim.startSimulation}
            onStop={sim.stopSimulation}
            onReset={sim.resetSimulation}
            onApplyConfig={sim.applyConfig}
            onUpdateServer={sim.updateServer}
          />
        )}

        {activeTab === 'compare' && (
          <ComparisonPanel />
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="app__footer">
        <span>Load Balancer Simulator</span>
        <span>·</span>
        <span>React + Chart.js + Node.js</span>
        <span>·</span>
        <span>Round Robin · Least Connections · Weighted RR</span>
      </footer>
    </div>
  );
}
