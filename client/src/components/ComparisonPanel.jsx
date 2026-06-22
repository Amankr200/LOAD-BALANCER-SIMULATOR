/**
 * ComparisonPanel.jsx
 * ─────────────────────────────────────────────────────────
 * Algorithm Performance Comparison Dashboard.
 *
 * Runs all 3 algorithms for 5 seconds each, collects metrics,
 * then renders side-by-side comparison charts showing:
 *  - Throughput (req/s)
 *  - Average Response Time (ms)
 *  - Load Variance (std deviation of connections)
 *  - P95 Latency
 *  - Error Rate
 *
 * Includes an "algorithm winner" recommendation card.
 */

import React, { useState, useCallback } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend,
} from 'chart.js';
import { SERVER_COLORS, CHART_DEFAULTS, computeLoadVariance } from '../utils/chartHelpers';
import './ComparisonPanel.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const ALGO_LABELS = {
  'round-robin':       'Round Robin',
  'least-connections': 'Least Connections',
  'weighted':          'Weighted RR',
};

const ALGO_COLORS = [
  { bg: 'rgba(0,212,255,0.5)',   border: '#00d4ff' },
  { bg: 'rgba(168,85,247,0.5)', border: '#a855f7' },
  { bg: 'rgba(34,211,168,0.5)', border: '#22d3a8' },
];

// ── Comparison run logic ──────────────────────────────────────────────────────

async function runComparison(onProgress) {
  const algorithms = ['round-robin', 'least-connections', 'weighted'];
  const results = {};

  for (let i = 0; i < algorithms.length; i++) {
    const algo = algorithms[i];
    onProgress({ phase: 'running', algorithm: algo, index: i, total: algorithms.length });

    // Configure and start
    await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ algorithm: algo, pattern: 'uniform', ratePerSec: 40 }),
    });

    await fetch(`${API_BASE}/reset`, { method: 'POST' });

    await fetch(`${API_BASE}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: 'uniform', ratePerSec: 40 }),
    });

    // Run for 6 seconds
    await new Promise(r => setTimeout(r, 6000));

    // Collect snapshot
    const res = await fetch(`${API_BASE}/status`);
    const json = await res.json();
    const snap = json.data;

    await fetch(`${API_BASE}/stop`, { method: 'POST' });

    // Compute aggregate stats
    const servers = snap.servers || [];
    const totalProcessed = servers.reduce((s, sv) => s + sv.processedRequests, 0);
    const avgResponseTime = servers.length
      ? servers.reduce((s, sv) => s + sv.avgResponseTime, 0) / servers.length
      : 0;
    const p95 = servers.length
      ? Math.max(...servers.map(sv => sv.p95Latency || 0))
      : 0;
    const variance = computeLoadVariance(servers);
    const errorRate = snap.totalRequests > 0
      ? ((snap.totalErrors / snap.totalRequests) * 100).toFixed(2)
      : 0;
    const throughput = totalProcessed / 6; // 6-second window

    results[algo] = {
      algo,
      label: ALGO_LABELS[algo],
      throughput: Math.round(throughput),
      avgResponseTime: Math.round(avgResponseTime),
      p95,
      variance: parseFloat(variance),
      errorRate: parseFloat(errorRate),
      totalProcessed,
      servers,
    };

    // Small pause between runs
    await new Promise(r => setTimeout(r, 1000));
  }

  return results;
}

// ── Comparison bar chart ──────────────────────────────────────────────────────

function ComparisonBarChart({ results, metric, title, unit = '' }) {
  const algos = Object.values(results);
  const labels = algos.map(r => r.label);
  const data   = algos.map(r => r[metric]);

  const chartData = {
    labels,
    datasets: [{
      label: title,
      data,
      backgroundColor: ALGO_COLORS.map(c => c.bg),
      borderColor:     ALGO_COLORS.map(c => c.border),
      borderWidth: 2,
      borderRadius: 8,
      borderSkipped: false,
    }],
  };

  const options = {
    ...CHART_DEFAULTS,
    plugins: {
      ...CHART_DEFAULTS.plugins,
      legend: { display: false },
      tooltip: {
        ...CHART_DEFAULTS.plugins.tooltip,
        callbacks: {
          label: ctx => ` ${ctx.parsed.y}${unit}`,
        },
      },
    },
    scales: {
      x: { ...CHART_DEFAULTS.scales.x },
      y: {
        ...CHART_DEFAULTS.scales.y,
        beginAtZero: true,
        title: { display: true, text: `${title} ${unit}`, color: '#475569', font: { size: 11 } },
      },
    },
  };

  return (
    <div className="cmp-chart glass-card">
      <div className="cmp-chart__title">{title}</div>
      <div style={{ height: 160 }}>
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
}

// ── Winner card ───────────────────────────────────────────────────────────────

function WinnerCard({ results }) {
  const algos = Object.values(results);

  // Score: higher throughput → better, lower latency → better, lower variance → better
  const scores = algos.map(r => {
    const maxThroughput = Math.max(...algos.map(a => a.throughput)) || 1;
    const maxVariance   = Math.max(...algos.map(a => a.variance))   || 1;
    const maxLatency    = Math.max(...algos.map(a => a.avgResponseTime)) || 1;

    const throughputScore = (r.throughput / maxThroughput) * 40;
    const latencyScore    = ((maxLatency - r.avgResponseTime) / maxLatency) * 35;
    const varianceScore   = ((maxVariance - r.variance) / maxVariance) * 25;

    return { algo: r.algo, label: r.label, score: throughputScore + latencyScore + varianceScore };
  });

  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0];

  const descriptions = {
    'round-robin':       'Performed best at steady uniform load with consistent distribution.',
    'least-connections': 'Excelled with dynamic request lengths, preventing server overload.',
    'weighted':          'Efficiently utilized server capacity differences for balanced throughput.',
  };

  return (
    <div className="winner-card glass-card">
      <div className="winner-card__crown">🏆</div>
      <div className="winner-card__algo glow-cyan">{winner.label}</div>
      <div className="winner-card__title">Best Overall Algorithm</div>
      <p className="winner-card__desc">{descriptions[winner.algo]}</p>
      <div className="winner-scores">
        {scores.map((s, i) => (
          <div key={s.algo} className="winner-score-row">
            <span className="winner-rank">{['🥇','🥈','🥉'][i]}</span>
            <span className="winner-name">{s.label}</span>
            <div className="winner-bar-track">
              <div className="winner-bar-fill" style={{ width: `${s.score}%` }} />
            </div>
            <span className="winner-score-val">{s.score.toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Comparison Panel ─────────────────────────────────────────────────────

export default function ComparisonPanel() {
  const [phase, setPhase] = useState('idle');       // 'idle' | 'running' | 'done'
  const [progress, setProgress] = useState(null);   // { algorithm, index, total }
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleRun = useCallback(async () => {
    setPhase('running');
    setResults(null);
    setError(null);
    try {
      const res = await runComparison((p) => setProgress(p));
      setResults(res);
      setPhase('done');
    } catch (e) {
      setError(e.message);
      setPhase('idle');
    }
  }, []);

  return (
    <div className="comparison-panel">
      <div className="cmp-header">
        <div>
          <h2 className="cmp-title">Algorithm Comparison</h2>
          <p className="cmp-subtitle">
            Benchmarks all 3 algorithms under identical conditions (40 req/s, 6s each)
          </p>
        </div>
        <button
          id="btn-run-comparison"
          className="btn btn-primary"
          onClick={handleRun}
          disabled={phase === 'running'}
        >
          {phase === 'running' ? '⏳ Running…' : '▶ Run Benchmark'}
        </button>
      </div>

      {/* ── Progress indicator ─────────────────────────────── */}
      {phase === 'running' && progress && (
        <div className="cmp-progress glass-card">
          <div className="cmp-progress__label">
            Testing <strong className="glow-cyan">{ALGO_LABELS[progress.algorithm]}</strong>…
          </div>
          <div className="cmp-progress__steps">
            {['round-robin', 'least-connections', 'weighted'].map((algo, i) => (
              <div key={algo} className={`cmp-step ${i < progress.index ? 'cmp-step--done' : i === progress.index ? 'cmp-step--active' : ''}`}>
                <div className="cmp-step__dot" />
                <span>{ALGO_LABELS[algo]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────── */}
      {error && (
        <div className="cmp-error glass-card">
          ⚠️ {error}
        </div>
      )}

      {/* ── Results ───────────────────────────────────────── */}
      {results && (
        <div className="cmp-results fade-in">
          {/* Summary table */}
          <div className="cmp-table-wrapper glass-card">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th>Algorithm</th>
                  <th>Throughput</th>
                  <th>Avg Latency</th>
                  <th>P95 Latency</th>
                  <th>Load Variance</th>
                  <th>Error Rate</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(results).map((r, i) => (
                  <tr key={r.algo}>
                    <td>
                      <span style={{ color: ALGO_COLORS[i].border, fontWeight: 700 }}>
                        {r.label}
                      </span>
                    </td>
                    <td className="font-mono glow-cyan">{r.throughput} req/s</td>
                    <td className="font-mono">{r.avgResponseTime} ms</td>
                    <td className="font-mono">{r.p95} ms</td>
                    <td className="font-mono">{r.variance}</td>
                    <td className="font-mono" style={{ color: r.errorRate > 1 ? '#f87171' : '#22d3a8' }}>
                      {r.errorRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Charts grid */}
          <div className="cmp-charts-grid">
            <ComparisonBarChart results={results} metric="throughput"      title="Throughput"         unit=" req/s" />
            <ComparisonBarChart results={results} metric="avgResponseTime" title="Avg Response Time"  unit=" ms" />
            <ComparisonBarChart results={results} metric="p95"             title="P95 Latency"        unit=" ms" />
            <ComparisonBarChart results={results} metric="variance"        title="Load Variance (σ)"  unit="" />
          </div>

          {/* Winner */}
          <WinnerCard results={results} />
        </div>
      )}

      {/* ── Idle state ────────────────────────────────────── */}
      {phase === 'idle' && !results && (
        <div className="cmp-idle glass-card">
          <div className="cmp-idle__icon">⚡</div>
          <h3>Ready to Benchmark</h3>
          <p>Click "Run Benchmark" to automatically test all 3 algorithms and compare their performance.</p>
          <div className="cmp-idle__chips">
            <span className="badge badge-cyan">Round Robin</span>
            <span className="badge badge-purple">Least Connections</span>
            <span className="badge badge-green">Weighted RR</span>
          </div>
        </div>
      )}
    </div>
  );
}
