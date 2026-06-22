/**
 * useSimulation.js
 * ─────────────────────────────────────────────────────────
 * Central state management hook for the simulation UI.
 *
 * Manages:
 *  - Live server metrics (from WebSocket)
 *  - Request log feed (rolling 100-entry list)
 *  - Time-series data for charts (rolling 60s window)
 *  - Simulation config (algorithm, traffic pattern, rate, serverCount)
 *  - Control actions (start, stop, reset, update config)
 *
 * All HTTP control commands go to the REST API.
 * Live metric updates arrive via WebSocket (passed in as 'wsData').
 */

import { useState, useCallback, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Maximum request log entries to keep in memory
const MAX_LOG_ENTRIES = 100;
// Maximum time-series points (60s at 0.5s resolution)
const MAX_TS_POINTS = 120;

/**
 * @returns {object} Simulation state + control actions
 */
export function useSimulation() {
  // ── Simulation state ───────────────────────────────────────────────────
  const [isRunning, setIsRunning] = useState(false);
  const [servers, setServers] = useState([]);
  const [requestLog, setRequestLog] = useState([]);
  const [timeSeries, setTimeSeries] = useState([]);
  const [totalRequests, setTotalRequests] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [droppedRequests, setDroppedRequests] = useState(0);
  const [uptime, setUptime] = useState(0);

  // ── Config state ───────────────────────────────────────────────────────
  const [algorithm, setAlgorithm] = useState('round-robin');
  const [serverCount, setServerCount] = useState(4);
  const [trafficPattern, setTrafficPattern] = useState('uniform');
  const [ratePerSec, setRatePerSec] = useState(20);

  // ── UI state ───────────────────────────────────────────────────────────
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const pendingLogRef = useRef([]);

  // ── WebSocket data ingestion ───────────────────────────────────────────

  /**
   * Called by App.jsx when a 'metrics' WS message arrives.
   * Updates all live state from the server snapshot.
   */
  const ingestMetrics = useCallback((payload) => {
    if (!payload) return;
    setServers(payload.servers || []);
    setTotalRequests(payload.totalRequests || 0);
    setTotalErrors(payload.totalErrors || 0);
    setDroppedRequests(payload.droppedRequests || 0);
    setUptime(payload.uptime || 0);

    // Update time-series rolling window
    if (payload.timeSeries?.length > 0) {
      setTimeSeries(prev => {
        const combined = [...prev];
        const lastTs = combined.length > 0 ? combined[combined.length - 1].ts : 0;
        // Only append genuinely new points
        for (const point of payload.timeSeries) {
          if (point.ts > lastTs) combined.push(point);
        }
        // Trim to rolling window
        return combined.slice(-MAX_TS_POINTS);
      });
    }

    // Flush any pending log entries
    if (payload.recentRequests?.length > 0) {
      setRequestLog(prev => {
        const combined = [...prev, ...payload.recentRequests];
        return combined.slice(-MAX_LOG_ENTRIES);
      });
    }
  }, []);

  /**
   * Called on WS 'init' – initial full snapshot on connect.
   */
  const ingestInit = useCallback((payload) => {
    if (!payload) return;
    ingestMetrics(payload);
    setAlgorithm(payload.algorithm || 'round-robin');
  }, [ingestMetrics]);

  /**
   * Called on WS 'request-complete' – append to feed.
   */
  const ingestRequest = useCallback((result) => {
    setRequestLog(prev => {
      const updated = [...prev, result];
      return updated.slice(-MAX_LOG_ENTRIES);
    });
  }, []);

  // ── REST API control actions ───────────────────────────────────────────

  const apiCall = useCallback(async (method, path, body) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!data.success && data.error) {
        setError(data.error);
      }
      return data;
    } catch (e) {
      setError(`Connection failed: ${e.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const startSimulation = useCallback(async () => {
    const res = await apiCall('POST', '/start', {
      pattern: trafficPattern,
      ratePerSec,
    });
    if (res?.success) setIsRunning(true);
  }, [apiCall, trafficPattern, ratePerSec]);

  const stopSimulation = useCallback(async () => {
    const res = await apiCall('POST', '/stop');
    if (res?.success) setIsRunning(false);
  }, [apiCall]);

  const resetSimulation = useCallback(async () => {
    const res = await apiCall('POST', '/reset');
    if (res?.success) {
      setIsRunning(false);
      setRequestLog([]);
      setTimeSeries([]);
      setTotalRequests(0);
      setTotalErrors(0);
      setDroppedRequests(0);
      setUptime(0);
    }
  }, [apiCall]);

  const applyConfig = useCallback(async (updates) => {
    const payload = {};
    if (updates.algorithm)    payload.algorithm    = updates.algorithm;
    if (updates.serverCount)  payload.serverCount  = updates.serverCount;
    if (updates.pattern)      payload.pattern      = updates.pattern;
    if (updates.ratePerSec !== undefined) payload.ratePerSec = updates.ratePerSec;

    await apiCall('POST', '/config', payload);

    // Update local state
    if (updates.algorithm)   setAlgorithm(updates.algorithm);
    if (updates.serverCount) setServerCount(updates.serverCount);
    if (updates.pattern)     setTrafficPattern(updates.pattern);
    if (updates.ratePerSec !== undefined) setRatePerSec(updates.ratePerSec);
  }, [apiCall]);

  const updateServer = useCallback(async (serverId, updates) => {
    await apiCall('POST', `/server/${serverId}`, updates);
  }, [apiCall]);

  return {
    // State
    isRunning,
    servers,
    requestLog,
    timeSeries,
    totalRequests,
    totalErrors,
    droppedRequests,
    uptime,
    // Config
    algorithm,
    serverCount,
    trafficPattern,
    ratePerSec,
    // UI
    error,
    loading,
    // Ingestion (called by App from WS handlers)
    ingestMetrics,
    ingestInit,
    ingestRequest,
    // Actions
    startSimulation,
    stopSimulation,
    resetSimulation,
    applyConfig,
    updateServer,
  };
}
