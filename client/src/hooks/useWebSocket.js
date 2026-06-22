/**
 * useWebSocket.js
 * ─────────────────────────────────────────────────────────
 * Custom React hook for managing a WebSocket connection to the backend.
 *
 * Features:
 *  - Auto-connects on mount, cleans up on unmount
 *  - Automatic reconnection with exponential back-off (max 5 retries)
 *  - Exposes connection status, last message, and a send() helper
 *  - Routes incoming messages by 'type' field into a dispatcher Map
 *
 * Usage:
 *  const { status, send } = useWebSocket('ws://localhost:4000', {
 *    onMetrics: (payload) => setMetrics(payload),
 *    onInit:    (payload) => setInitialState(payload),
 *  });
 */

import { useEffect, useRef, useCallback, useState } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL
  || (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + 'localhost:4000';
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;

/**
 * @param {object} handlers - Map of { onMetrics, onInit, onRequestComplete, onReset, onAlgorithmChanged }
 * @returns {{ status: string, send: Function, retryCount: number }}
 */
export function useWebSocket(handlers = {}) {
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const timerRef = useRef(null);
  const handlersRef = useRef(handlers);

  // Keep handlers ref up-to-date without triggering re-connects
  handlersRef.current = handlers;

  const [status, setStatus] = useState('connecting'); // 'connecting' | 'open' | 'closed' | 'error'
  const [retryCount, setRetryCount] = useState(0);

  const connect = useCallback(() => {
    // Don't connect if already open
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('open');
        retryRef.current = 0;
        setRetryCount(0);
        console.log('[WS] Connected to', WS_URL);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          // Route by message type
          switch (msg.type) {
            case 'init':
              handlersRef.current.onInit?.(msg.payload);
              break;
            case 'metrics':
              handlersRef.current.onMetrics?.(msg.payload);
              break;
            case 'request-complete':
              handlersRef.current.onRequestComplete?.(msg.payload);
              break;
            case 'request-dropped':
              handlersRef.current.onRequestDropped?.(msg.payload);
              break;
            case 'algorithm-changed':
              handlersRef.current.onAlgorithmChanged?.(msg.payload);
              break;
            case 'reset':
              handlersRef.current.onReset?.(msg.payload);
              break;
            default:
              break;
          }
        } catch (e) {
          console.warn('[WS] Failed to parse message:', e);
        }
      };

      ws.onclose = () => {
        setStatus('closed');
        wsRef.current = null;

        // Attempt reconnection with exponential backoff
        if (retryRef.current < MAX_RETRIES) {
          const delay = BASE_BACKOFF_MS * Math.pow(2, retryRef.current);
          retryRef.current++;
          setRetryCount(retryRef.current);
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${retryRef.current}/${MAX_RETRIES})`);
          timerRef.current = setTimeout(connect, delay);
        } else {
          setStatus('error');
          console.error('[WS] Max reconnection attempts reached');
        }
      };

      ws.onerror = () => {
        // onclose will fire after onerror, so we don't need to reconnect here
        setStatus('error');
      };
    } catch (e) {
      setStatus('error');
    }
  }, []); // No deps – connect is stable

  useEffect(() => {
    connect();

    return () => {
      // Cleanup on unmount
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnection on intentional close
        wsRef.current.close();
      }
    };
  }, [connect]);

  /**
   * Send a message to the server.
   * @param {object} data - Will be JSON.stringify'd
   */
  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { status, send, retryCount };
}
