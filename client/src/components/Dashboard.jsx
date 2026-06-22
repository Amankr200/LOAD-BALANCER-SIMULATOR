/**
 * Dashboard.jsx
 * ─────────────────────────────────────────────────────────
 * Main live simulation view – composes:
 *  - Traffic controls sidebar
 *  - Server grid
 *  - Live metrics charts
 *  - Request feed
 *  - Top-level stat summary bar
 */

import React from 'react';
import ServerGrid from './ServerGrid';
import RequestFeed from './RequestFeed';
import TrafficControls from './TrafficControls';
import { LiveLineChart, ConnectionBarChart, LoadDoughnutChart } from './MetricsChart';
import { formatUptime, computeLoadVariance } from '../utils/chartHelpers';
import './Dashboard.css';

// ── Top metrics bar ───────────────────────────────────────────────────────────

function MetricsSummaryBar({ totalRequests, totalErrors, droppedRequests, uptime, algorithm, servers }) {
  const throughput = servers.reduce((s, sv) => s + (sv.throughput || 0), 0);
  const errorRate  = totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(1) : '0.0';
  const variance   = computeLoadVariance(servers);
  const algoLabels = { 'round-robin': 'Round Robin', 'least-connections': 'Least Connections', 'weighted': 'Weighted RR' };

  return (
    <div className="metrics-bar">
      <div className="metrics-bar__item">
        <span className="stat-label">Algorithm</span>
        <span className="stat-value glow-cyan" style={{ fontSize: 16 }}>{algoLabels[algorithm] || algorithm}</span>
      </div>
      <div className="metrics-bar__divider" />
      <div className="metrics-bar__item">
        <span className="stat-label">Total Requests</span>
        <span className="stat-value" style={{ fontSize: 16 }}>{totalRequests.toLocaleString()}</span>
      </div>
      <div className="metrics-bar__divider" />
      <div className="metrics-bar__item">
        <span className="stat-label">Throughput</span>
        <span className="stat-value glow-green" style={{ fontSize: 16 }}>
          {throughput}<span className="stat-unit">/s</span>
        </span>
      </div>
      <div className="metrics-bar__divider" />
      <div className="metrics-bar__item">
        <span className="stat-label">Error Rate</span>
        <span className="stat-value" style={{ fontSize: 16, color: parseFloat(errorRate) > 1 ? '#f87171' : '#22d3a8' }}>
          {errorRate}<span className="stat-unit">%</span>
        </span>
      </div>
      <div className="metrics-bar__divider" />
      <div className="metrics-bar__item">
        <span className="stat-label">Load Variance σ</span>
        <span className="stat-value" style={{ fontSize: 16 }}>{variance}</span>
      </div>
      <div className="metrics-bar__divider" />
      <div className="metrics-bar__item">
        <span className="stat-label">Dropped</span>
        <span className="stat-value" style={{ fontSize: 16, color: droppedRequests > 0 ? '#fb923c' : 'inherit' }}>
          {droppedRequests}
        </span>
      </div>
      <div className="metrics-bar__divider" />
      <div className="metrics-bar__item">
        <span className="stat-label">Uptime</span>
        <span className="stat-value" style={{ fontSize: 16 }}>{formatUptime(uptime)}</span>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard({
  isRunning, servers, requestLog, timeSeries,
  totalRequests, totalErrors, droppedRequests, uptime,
  algorithm, serverCount, trafficPattern, ratePerSec,
  loading,
  onStart, onStop, onReset, onApplyConfig, onUpdateServer,
}) {
  return (
    <div className="dashboard">
      {/* ── Top metrics bar ──────────────────────────────── */}
      <MetricsSummaryBar
        totalRequests={totalRequests}
        totalErrors={totalErrors}
        droppedRequests={droppedRequests}
        uptime={uptime}
        algorithm={algorithm}
        servers={servers}
      />

      {/* ── Main content area ────────────────────────────── */}
      <div className="dashboard__layout">

        {/* ── Sidebar: controls ────────────────────────── */}
        <aside className="dashboard__sidebar">
          <TrafficControls
            isRunning={isRunning}
            algorithm={algorithm}
            serverCount={serverCount}
            trafficPattern={trafficPattern}
            ratePerSec={ratePerSec}
            servers={servers}
            loading={loading}
            onStart={onStart}
            onStop={onStop}
            onReset={onReset}
            onApplyConfig={onApplyConfig}
            onUpdateServer={onUpdateServer}
          />
        </aside>

        {/* ── Main area ────────────────────────────────── */}
        <main className="dashboard__main">

          {/* Server cards grid */}
          <section className="dashboard__section">
            <div className="section-heading">
              <span>Virtual Server Nodes</span>
              <span className="badge badge-cyan">{servers.length} active</span>
            </div>
            <ServerGrid servers={servers} />
          </section>

          {/* Charts row */}
          <section className="dashboard__charts-row">
            {/* Main line chart (full width) */}
            <div className="dashboard__chart-wide">
              <LiveLineChart
                timeSeries={timeSeries}
                servers={servers}
                metric="connections"
                title="Active Connections Over Time"
              />
            </div>
          </section>

          {/* Charts row 2 */}
          <section className="dashboard__charts-row">
            <div style={{ flex: 1.4 }}>
              <LiveLineChart
                timeSeries={timeSeries}
                servers={servers}
                metric="avgResponseTime"
                title="Response Time (ms)"
              />
            </div>
            <div style={{ flex: 0.8 }}>
              <ConnectionBarChart servers={servers} />
            </div>
            <div style={{ flex: 0.8 }}>
              <LoadDoughnutChart servers={servers} />
            </div>
          </section>

          {/* Request feed */}
          <section>
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <span>Live Request Feed</span>
            </div>
            <RequestFeed requestLog={requestLog} servers={servers} />
          </section>
        </main>
      </div>
    </div>
  );
}
