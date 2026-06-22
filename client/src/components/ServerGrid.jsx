/**
 * ServerGrid.jsx
 * ─────────────────────────────────────────────────────────
 * Renders animated cards for each virtual server node.
 * Each card shows: status, connections, CPU load, avg response time, throughput.
 */

import React, { memo } from 'react';
import { getStatusColor, SERVER_COLORS } from '../utils/chartHelpers';
import './ServerGrid.css';

// ── Single Server Card ────────────────────────────────────────────────────────

const ServerCard = memo(function ServerCard({ server, index }) {
  const color = SERVER_COLORS[index % SERVER_COLORS.length];
  const connectionPct = Math.min(100, (server.currentConnections / server.maxConnections) * 100);
  const cpuPct = Math.min(100, server.cpuLoad);
  const statusColor = getStatusColor(server.status);

  const statusBadgeClass = {
    healthy:    'badge-green',
    busy:       'badge-yellow',
    overloaded: 'badge-red',
    offline:    'badge-muted',
  }[server.status] || 'badge-muted';

  return (
    <div
      className={`server-card glass-card fade-in ${server.status === 'overloaded' ? 'server-card--overloaded' : ''}`}
      style={{ '--server-color': color.line }}
    >
      {/* Header */}
      <div className="server-card__header">
        <div className="server-card__identity">
          <div className="status-dot" style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
          <span className="server-card__name">{server.name}</span>
        </div>
        <div className="flex gap-8 items-center">
          <span className={`badge ${statusBadgeClass}`}>{server.status}</span>
          <span className="badge badge-muted">W:{server.weight}</span>
        </div>
      </div>

      {/* Connection bar */}
      <div className="server-card__metric-row">
        <div className="flex justify-between" style={{ marginBottom: 6 }}>
          <span className="stat-label">Active Connections</span>
          <span className="stat-value" style={{ fontSize: 15 }}>
            <span style={{ color: color.line }}>{server.currentConnections}</span>
            <span className="stat-unit">/{server.maxConnections}</span>
          </span>
        </div>
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{
              width: `${connectionPct}%`,
              background: `linear-gradient(90deg, ${color.line}88, ${color.line})`,
            }}
          />
        </div>
      </div>

      {/* CPU Load bar */}
      <div className="server-card__metric-row">
        <div className="flex justify-between" style={{ marginBottom: 6 }}>
          <span className="stat-label">CPU Load</span>
          <span className="stat-value" style={{ fontSize: 15 }}>
            <span style={{ color: cpuPct > 80 ? '#f87171' : cpuPct > 60 ? '#fbbf24' : color.line }}>
              {cpuPct}
            </span>
            <span className="stat-unit">%</span>
          </span>
        </div>
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{
              width: `${cpuPct}%`,
              background: cpuPct > 80
                ? 'linear-gradient(90deg, #c53030, #f87171)'
                : cpuPct > 60
                  ? 'linear-gradient(90deg, #b45309, #fbbf24)'
                  : `linear-gradient(90deg, ${color.line}88, ${color.line})`,
            }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="server-card__stats">
        <div className="stat-box">
          <span className="stat-label">Throughput</span>
          <span className="stat-value" style={{ fontSize: 18, color: color.line }}>
            {server.throughput}
            <span className="stat-unit" style={{ fontSize: 11 }}>/s</span>
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Avg Latency</span>
          <span className="stat-value" style={{ fontSize: 18 }}>
            {server.avgResponseTime}
            <span className="stat-unit" style={{ fontSize: 11 }}>ms</span>
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Processed</span>
          <span className="stat-value" style={{ fontSize: 18 }}>
            {server.processedRequests.toLocaleString()}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">P95 Latency</span>
          <span className="stat-value" style={{ fontSize: 18 }}>
            {server.p95Latency}
            <span className="stat-unit" style={{ fontSize: 11 }}>ms</span>
          </span>
        </div>
      </div>

      {/* Bottom accent line */}
      <div className="server-card__accent" style={{ background: color.line }} />
    </div>
  );
});

// ── Grid ──────────────────────────────────────────────────────────────────────

export default function ServerGrid({ servers }) {
  if (!servers?.length) {
    return (
      <div className="server-grid server-grid--empty">
        <div className="empty-state">
          <div className="empty-state__icon">🖥️</div>
          <p>Connecting to servers…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="server-grid" style={{ gridTemplateColumns: `repeat(${Math.min(servers.length, 4)}, 1fr)` }}>
      {servers.map((server, i) => (
        <ServerCard key={server.id} server={server} index={i} />
      ))}
    </div>
  );
}
