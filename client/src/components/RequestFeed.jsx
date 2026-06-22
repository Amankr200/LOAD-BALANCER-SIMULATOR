/**
 * RequestFeed.jsx
 * ─────────────────────────────────────────────────────────
 * Scrollable real-time log of routed requests.
 * Color-coded by destination server, showing:
 *  - Request ID (truncated)
 *  - Assigned server name
 *  - Latency in ms
 *  - Timestamp
 *  - Success/failure status
 */

import React, { useEffect, useRef, memo } from 'react';
import { SERVER_COLORS } from '../utils/chartHelpers';
import './RequestFeed.css';

// Server ID → color index mapping (memoised)
const colorIndexCache = new Map();
function getColorForServer(serverId, servers) {
  if (!colorIndexCache.has(serverId)) {
    const idx = servers.findIndex(s => s.id === serverId);
    colorIndexCache.set(serverId, idx >= 0 ? idx : 0);
  }
  return SERVER_COLORS[colorIndexCache.get(serverId) % SERVER_COLORS.length];
}

// ── Single log row ────────────────────────────────────────────────────────────

const FeedRow = memo(function FeedRow({ entry, servers }) {
  const isDropped = !entry.serverId || entry.serverName === 'DROPPED';
  const color = isDropped ? null : getColorForServer(entry.serverId, servers);
  const time = new Date(entry.timestamp);
  const timeStr = `${String(time.getMinutes()).padStart(2,'0')}:${String(time.getSeconds()).padStart(2,'0')}.${String(time.getMilliseconds()).padStart(3,'0')}`;
  const shortId = (entry.requestId || entry.id || '').slice(0, 8);

  return (
    <div className={`feed-row ${isDropped ? 'feed-row--dropped' : ''} ${!entry.success ? 'feed-row--error' : ''}`}>
      {/* Status dot */}
      <div
        className="feed-row__dot"
        style={{
          background: isDropped ? '#f87171' : !entry.success ? '#fb923c' : color?.line,
          boxShadow: isDropped ? '0 0 6px #f87171' : !entry.success ? '0 0 6px #fb923c' : `0 0 6px ${color?.line}`,
        }}
      />

      {/* Request ID */}
      <span className="feed-row__id font-mono">{shortId}</span>

      {/* Arrow */}
      <span className="feed-row__arrow">→</span>

      {/* Server name */}
      <span
        className="feed-row__server"
        style={{ color: isDropped ? '#f87171' : color?.line }}
      >
        {entry.serverName || 'DROPPED'}
      </span>

      {/* Spacer */}
      <div className="feed-row__spacer" />

      {/* Latency */}
      <span className="feed-row__latency">
        {entry.latency > 0 ? `${entry.latency}ms` : '—'}
      </span>

      {/* Time */}
      <span className="feed-row__time">{timeStr}</span>
    </div>
  );
});

// ── Feed container ────────────────────────────────────────────────────────────

export default function RequestFeed({ requestLog, servers }) {
  const containerRef = useRef(null);
  const isAutoScrollRef = useRef(true);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (isAutoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [requestLog]);

  // Detect manual scroll up → pause auto-scroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    isAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 32;
  };

  const recentLog = requestLog.slice(-80);
  const total = requestLog.length;
  const errors = requestLog.filter(r => !r.success).length;
  const errorRate = total > 0 ? ((errors / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="request-feed glass-card">
      {/* Header */}
      <div className="request-feed__header">
        <span className="request-feed__title">Live Request Feed</span>
        <div className="flex gap-8 items-center">
          <span className="badge badge-cyan">{total} total</span>
          {errors > 0 && <span className="badge badge-red">{errorRate}% err</span>}
        </div>
      </div>

      {/* Column headers */}
      <div className="feed-header-row">
        <span>Status</span>
        <span>Request ID</span>
        <span>→</span>
        <span>Server</span>
        <div style={{ flex: 1 }} />
        <span>Latency</span>
        <span>Time</span>
      </div>

      {/* Scrollable log */}
      <div className="feed-scroll" ref={containerRef} onScroll={handleScroll}>
        {recentLog.length === 0 ? (
          <div className="feed-empty">
            <span>Start the simulation to see requests…</span>
          </div>
        ) : (
          recentLog.map((entry, i) => (
            <FeedRow
              key={(entry.requestId || entry.id || i) + i}
              entry={entry}
              servers={servers}
            />
          ))
        )}
      </div>
    </div>
  );
}
