/**
 * MetricsChart.jsx
 * ─────────────────────────────────────────────────────────
 * Real-time Chart.js visualizations:
 *  1. Line chart – requests/connections per server over time
 *  2. Bar chart  – current connection distribution
 *  3. Doughnut   – overall load share
 */

import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  buildLineDataset, buildBarDataset, buildDoughnutDataset,
  buildTimeLabels, extractServerTimeSeries,
  CHART_DEFAULTS, SERVER_COLORS,
} from '../utils/chartHelpers';
import './MetricsChart.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler
);

// ── Line Chart – Live Connections/Throughput ──────────────────────────────────

export function LiveLineChart({ timeSeries, servers, metric = 'connections', title }) {
  const { data, options } = useMemo(() => {
    const labels = buildTimeLabels(timeSeries, 60);
    const datasets = servers.map((server, i) =>
      buildLineDataset(
        server.name,
        extractServerTimeSeries(timeSeries, server.id, metric, 60),
        i
      )
    );

    const yLabel = {
      connections:     'Active Connections',
      throughput:      'Requests/sec',
      cpuLoad:         'CPU Load (%)',
      avgResponseTime: 'Response Time (ms)',
    }[metric] || metric;

    const opts = {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { ...CHART_DEFAULTS.plugins.legend, position: 'top' },
        title: { display: false },
      },
      scales: {
        x: {
          ...CHART_DEFAULTS.scales.x,
          ticks: {
            ...CHART_DEFAULTS.scales.x.ticks,
            maxTicksLimit: 8,
            maxRotation: 0,
          },
        },
        y: {
          ...CHART_DEFAULTS.scales.y,
          beginAtZero: true,
          title: {
            display: true,
            text: yLabel,
            color: '#475569',
            font: { size: 11 },
          },
        },
      },
    };

    return { data: { labels, datasets }, options: opts };
  }, [timeSeries, servers, metric]);

  return (
    <div className="chart-container">
      <div className="chart-title">{title}</div>
      <div className="chart-canvas-wrapper">
        {timeSeries.length > 1
          ? <Line data={data} options={options} />
          : <div className="chart-placeholder">Waiting for data…</div>
        }
      </div>
    </div>
  );
}

// ── Bar Chart – Connection Distribution ───────────────────────────────────────

export function ConnectionBarChart({ servers }) {
  const { data, options } = useMemo(() => {
    const labels = servers.map(s => s.name);
    const values = servers.map(s => s.currentConnections);
    const colors = servers.map((_, i) => {
      const c = SERVER_COLORS[i % SERVER_COLORS.length];
      return c.fill.replace('0.08', '0.55');
    });
    const borderColors = servers.map((_, i) => SERVER_COLORS[i % SERVER_COLORS.length].line);

    const dataset = buildBarDataset('Active Connections', values, colors);
    dataset.borderColor = borderColors;

    const opts = {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
      },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x },
        y: {
          ...CHART_DEFAULTS.scales.y,
          beginAtZero: true,
          title: { display: true, text: 'Connections', color: '#475569', font: { size: 11 } },
        },
      },
    };

    return {
      data: { labels, datasets: [dataset] },
      options: opts,
    };
  }, [servers]);

  return (
    <div className="chart-container">
      <div className="chart-title">Connection Distribution</div>
      <div className="chart-canvas-wrapper chart-canvas-wrapper--sm">
        {servers.length > 0
          ? <Bar data={data} options={options} />
          : <div className="chart-placeholder">No servers</div>
        }
      </div>
    </div>
  );
}

// ── Doughnut – Load Share ─────────────────────────────────────────────────────

export function LoadDoughnutChart({ servers }) {
  const chartData = useMemo(() => {
    const labels = servers.map(s => s.name);
    const data   = servers.map(s => s.processedRequests || 0);
    return buildDoughnutDataset(labels, data);
  }, [servers]);

  const options = {
    ...CHART_DEFAULTS,
    plugins: {
      ...CHART_DEFAULTS.plugins,
      legend: {
        ...CHART_DEFAULTS.plugins.legend,
        position: 'bottom',
      },
    },
    cutout: '65%',
  };

  const total = servers.reduce((sum, s) => sum + (s.processedRequests || 0), 0);

  return (
    <div className="chart-container">
      <div className="chart-title">Request Distribution</div>
      <div className="chart-canvas-wrapper chart-canvas-wrapper--sm" style={{ position: 'relative' }}>
        {total > 0
          ? <>
              <Doughnut data={chartData} options={options} />
              <div className="doughnut-center">
                <div className="doughnut-center__value">{total.toLocaleString()}</div>
                <div className="doughnut-center__label">total</div>
              </div>
            </>
          : <div className="chart-placeholder">No requests yet</div>
        }
      </div>
    </div>
  );
}

// ── Response Time Line Chart ──────────────────────────────────────────────────

export function ResponseTimeChart({ timeSeries, servers }) {
  return (
    <LiveLineChart
      timeSeries={timeSeries}
      servers={servers}
      metric="avgResponseTime"
      title="Avg Response Time (ms)"
    />
  );
}

// ── CPU Load Chart ────────────────────────────────────────────────────────────

export function CpuLoadChart({ timeSeries, servers }) {
  return (
    <LiveLineChart
      timeSeries={timeSeries}
      servers={servers}
      metric="cpuLoad"
      title="CPU Load Over Time (%)"
    />
  );
}
