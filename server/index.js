/**
 * index.js – Load Balancer Simulator Server
 * ─────────────────────────────────────────────────────────
 * Entry point for the Express + WebSocket backend.
 *
 * Startup sequence:
 *  1. Create LoadBalancer and RequestSimulator instances
 *  2. Configure Express middleware (CORS, JSON parsing)
 *  3. Mount REST API routes at /api
 *  4. Create HTTP server and attach WebSocket server
 *  5. Listen on PORT (default 4000)
 *
 * Architecture note:
 *  The LoadBalancer emits 'metrics' events every 500ms which are picked up
 *  by wsHandler.js and broadcast to all connected WebSocket clients.
 *  This decouples the core engine from the transport layer.
 */

'use strict';

const http = require('http');
const express = require('express');
const cors = require('cors');

const LoadBalancer = require('./src/core/LoadBalancer');
const RequestSimulator = require('./src/core/RequestSimulator');
const { createApiRouter } = require('./src/routes/api');
const { attachWebSocket } = require('./src/websocket/wsHandler');

const PORT = process.env.PORT || 4000;

// ── Bootstrap ───────────────────────────────────────────────────────────────

// Create core engine instances
const lb = new LoadBalancer({ algorithm: 'round-robin', serverCount: 4 });
const sim = new RequestSimulator(lb);

// ── Express app ─────────────────────────────────────────────────────────────
const app = express();

// CORS – allow frontend dev server (Vite default: 5173) and any origin in dev
app.use(cors({
  // Allow localhost in dev + any *.vercel.app preview/production URL in prod
  origin: function (origin, callback) {
    const allowedLocals = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
    ];
    if (!origin || allowedLocals.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin "${origin}" not allowed`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Parse JSON request bodies
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', createApiRouter(lb, sim));

// Health check / root route
app.get('/', (req, res) => {
  res.json({
    name: 'Load Balancer Simulator API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      status:     'GET  /api/status',
      algorithms: 'GET  /api/algorithms',
      start:      'POST /api/start',
      stop:       'POST /api/stop',
      config:     'POST /api/config',
      reset:      'POST /api/reset',
      server:     'POST /api/server/:id',
    },
    websocket: `ws://localhost:${PORT}`,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` });
});

// ── HTTP + WebSocket Server ───────────────────────────────────────────────────
const server = http.createServer(app);
attachWebSocket(server, lb);

// ── Start listening ────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║      🚀  Load Balancer Simulator – Server Ready          ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  REST API  → http://localhost:${PORT}                      ║`);
  console.log(`║  WebSocket → ws://localhost:${PORT}                        ║`);
  console.log('║  Press Ctrl+C to stop                                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down gracefully...');
  sim.stop();
  lb.destroy();
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  sim.stop();
  lb.destroy();
  server.close(() => process.exit(0));
});
