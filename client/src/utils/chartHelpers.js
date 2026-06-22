/**
 * chartHelpers.js
 * ─────────────────────────────────────────────────────────
 * Utility functions for building Chart.js dataset configurations.
 * Centralises chart styling so all charts share the same color palette
 * and visual language.
 */

// ── Color palette (matches CSS variables) ─────────────────────────────────────
export const SERVER_COLORS = [
  { line: '#00d4ff', fill: 'rgba(0,212,255,0.08)',   point: '#00d4ff' },  // Cyan
  { line: '#a855f7', fill: 'rgba(168,85,247,0.08)',  point: '#a855f7' },  // Purple
  { line: '#22d3a8', fill: 'rgba(34,211,168,0.08)',  point: '#22d3a8' },  // Green
  { line: '#fb923c', fill: 'rgba(251,146,60,0.08)',  point: '#fb923c' },  // Orange
  { line: '#f87171', fill: 'rgba(248,113,113,0.08)', point: '#f87171' },  // Red
  { line: '#fbbf24', fill: 'rgba(251,191,36,0.08)',  point: '#fbbf24' },  // Yellow
  { line: '#60a5fa', fill: 'rgba(96,165,250,0.08)',  point: '#60a5fa' },  // Blue
  { line: '#34d399', fill: 'rgba(52,211,153,0.08)',  point: '#34d399' },  // Emerald
  { line: '#f472b6', fill: 'rgba(244,114,182,0.08)', point: '#f472b6' },  // Pink
  { line: '#818cf8', fill: 'rgba(129,140,248,0.08)', point: '#818cf8' },  // Indigo
];

// ── Shared Chart.js defaults ──────────────────────────────────────────────────
export const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  plugins: {
    legend: {
      labels: {
        color: '#94a3b8',
        font: { family: 'Inter', size: 12 },
        boxWidth: 12,
        padding: 16,
      },
    },
    tooltip: {
      backgroundColor: 'rgba(13,22,40,0.95)',
      borderColor: 'rgba(0,212,255,0.3)',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#94a3b8',
      padding: 12,
      cornerRadius: 8,
    },
  },
  scales: {
    x: {
      ticks: { color: '#475569', font: { size: 11 } },
      grid:  { color: 'rgba(255,255,255,0.03)' },
      border: { color: 'rgba(255,255,255,0.05)' },
    },
    y: {
      ticks: { color: '#475569', font: { size: 11 } },
      grid:  { color: 'rgba(255,255,255,0.05)' },
      border: { color: 'rgba(255,255,255,0.05)' },
    },
  },
};

// ── Dataset builder helpers ────────────────────────────────────────────────────

/**
 * Build a line chart dataset for a single server's time-series.
 * @param {string} label     - Dataset label (server name)
 * @param {number[]} data    - Array of y-values
 * @param {number} colorIdx  - Index into SERVER_COLORS
 */
export function buildLineDataset(label, data, colorIdx = 0) {
  const c = SERVER_COLORS[colorIdx % SERVER_COLORS.length];
  return {
    label,
    data,
    borderColor: c.line,
    backgroundColor: c.fill,
    pointBackgroundColor: c.point,
    pointRadius: 0,
    pointHoverRadius: 4,
    borderWidth: 2,
    tension: 0.4,
    fill: true,
  };
}

/**
 * Build a bar chart dataset for a single metric across servers.
 * @param {string}   label
 * @param {number[]} data
 * @param {string[]} colors - Per-bar background colors
 */
export function buildBarDataset(label, data, colors) {
  return {
    label,
    data,
    backgroundColor: colors || data.map((_, i) => SERVER_COLORS[i % SERVER_COLORS.length].fill),
    borderColor:     colors
      ? colors.map(c => c.replace('0.08', '0.8').replace('0.15', '0.8'))
      : data.map((_, i) => SERVER_COLORS[i % SERVER_COLORS.length].line),
    borderWidth: 2,
    borderRadius: 6,
    borderSkipped: false,
  };
}

/**
 * Build a doughnut chart dataset for load distribution.
 * @param {string[]} labels
 * @param {number[]} data
 */
export function buildDoughnutDataset(labels, data) {
  return {
    labels,
    datasets: [{
      data,
      backgroundColor: data.map((_, i) => SERVER_COLORS[i % SERVER_COLORS.length].fill.replace('0.08', '0.6')),
      borderColor:     data.map((_, i) => SERVER_COLORS[i % SERVER_COLORS.length].line),
      borderWidth: 2,
      hoverOffset: 8,
    }],
  };
}

/**
 * Extract a rolling time-series for a specific server metric.
 * @param {object[]} timeSeries  - Array of { ts, servers: [{id, ...}] }
 * @param {string}   serverId
 * @param {string}   metric      - 'connections' | 'throughput' | 'cpuLoad' | 'avgResponseTime'
 * @param {number}   maxPoints
 */
export function extractServerTimeSeries(timeSeries, serverId, metric, maxPoints = 60) {
  const slice = timeSeries.slice(-maxPoints);
  return slice.map(point => {
    const server = point.servers?.find(s => s.id === serverId);
    return server?.[metric] ?? 0;
  });
}

/**
 * Generate timestamp labels for a time-series (HH:MM:SS).
 * @param {object[]} timeSeries
 * @param {number}   maxPoints
 */
export function buildTimeLabels(timeSeries, maxPoints = 60) {
  return timeSeries.slice(-maxPoints).map(point => {
    const d = new Date(point.ts);
    return `${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  });
}

/**
 * Compute load variance (standard deviation) across server connection counts.
 * Used in the comparison panel to show how evenly load is spread.
 */
export function computeLoadVariance(servers) {
  if (!servers?.length) return 0;
  const values = servers.map(s => s.currentConnections);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance).toFixed(2);
}

/**
 * Get a status color for a server based on its status field.
 */
export function getStatusColor(status) {
  switch (status) {
    case 'healthy':    return '#22d3a8';
    case 'busy':       return '#fbbf24';
    case 'overloaded': return '#f87171';
    case 'offline':    return '#475569';
    default:           return '#94a3b8';
  }
}

/**
 * Format uptime milliseconds as human-readable "Xm Ys"
 */
export function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
