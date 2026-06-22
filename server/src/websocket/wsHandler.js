/**
 * wsHandler.js
 * ─────────────────────────────────────────────────────────
 * WebSocket server handler.
 *
 * Responsibilities:
 *  - Manages connected WebSocket clients
 *  - Listens for LoadBalancer 'metrics' events and broadcasts to all clients
 *  - Handles client messages (subscribe to specific event channels)
 *  - Provides connection health via ping/pong heartbeat
 *
 * Message format (server → client):
 *  {
 *    type: 'metrics' | 'request-complete' | 'algorithm-changed' | 'ping',
 *    payload: { ... }
 *  }
 */

'use strict';

const WebSocket = require('ws');

// Ping interval to detect stale connections
const PING_INTERVAL_MS = 30_000;

/**
 * Attach WebSocket handling to an existing HTTP server.
 *
 * @param {http.Server} httpServer - The Node.js HTTP server to attach WS to
 * @param {LoadBalancer} lb        - The load balancer instance to subscribe to
 * @returns {WebSocket.Server}     - The created WebSocket server
 */
function attachWebSocket(httpServer, lb) {
  const wss = new WebSocket.Server({ server: httpServer });

  // Set of active clients
  const clients = new Set();

  // ── Connection handler ─────────────────────────────────────────────────
  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    clients.add(ws);

    console.log(`[WS] Client connected (total: ${clients.size})`);

    // Send immediate snapshot on connect
    const snapshot = lb.getSnapshot();
    safeSend(ws, { type: 'init', payload: snapshot });

    // ── Incoming messages from client ────────────────────────────────────
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        handleClientMessage(ws, msg, lb);
      } catch (e) {
        console.warn('[WS] Invalid message:', raw.toString());
      }
    });

    // ── Pong response (connection alive) ──────────────────────────────────
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // ── Disconnection ─────────────────────────────────────────────────────
    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WS] Client disconnected (total: ${clients.size})`);
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
      clients.delete(ws);
    });
  });

  // ── Broadcast LoadBalancer metrics to all connected clients ─────────────
  lb.on('metrics', (snapshot) => {
    broadcast(clients, { type: 'metrics', payload: snapshot });
  });

  lb.on('request-complete', (result) => {
    broadcast(clients, { type: 'request-complete', payload: result });
  });

  lb.on('request-dropped', (result) => {
    broadcast(clients, { type: 'request-dropped', payload: result });
  });

  lb.on('algorithm-changed', (info) => {
    broadcast(clients, { type: 'algorithm-changed', payload: info });
  });

  lb.on('reset', () => {
    broadcast(clients, { type: 'reset', payload: {} });
  });

  // ── Heartbeat ping loop ─────────────────────────────────────────────────
  const pingTimer = setInterval(() => {
    for (const ws of clients) {
      if (!ws.isAlive) {
        // Connection is dead – terminate
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, PING_INTERVAL_MS);

  wss.on('close', () => clearInterval(pingTimer));

  console.log('[WS] WebSocket server initialized');
  return wss;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Handle a message received from a WebSocket client.
 * @param {WebSocket} ws
 * @param {object}   msg - Parsed JSON message
 * @param {LoadBalancer} lb
 */
function handleClientMessage(ws, msg, lb) {
  switch (msg.type) {
    case 'ping':
      safeSend(ws, { type: 'pong', payload: { ts: Date.now() } });
      break;

    case 'get-snapshot':
      safeSend(ws, { type: 'init', payload: lb.getSnapshot() });
      break;

    default:
      console.warn('[WS] Unknown client message type:', msg.type);
  }
}

/**
 * Broadcast a message to all connected clients.
 * @param {Set<WebSocket>} clients
 * @param {object}         data
 */
function broadcast(clients, data) {
  const serialized = JSON.stringify(data);
  for (const ws of clients) {
    safeSend(ws, serialized, true /* already serialized */);
  }
}

/**
 * Safe JSON send – catches errors on dead connections.
 * @param {WebSocket} ws
 * @param {object|string} data
 * @param {boolean} alreadySerialized
 */
function safeSend(ws, data, alreadySerialized = false) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    const payload = alreadySerialized ? data : JSON.stringify(data);
    ws.send(payload);
  } catch (e) {
    console.error('[WS] Send error:', e.message);
  }
}

module.exports = { attachWebSocket };
