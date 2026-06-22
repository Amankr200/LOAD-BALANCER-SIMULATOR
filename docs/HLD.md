# High-Level Design (HLD)
## Load Balancer Simulator

---

## 1. Overview

The Load Balancer Simulator is a **full-stack web application** that demonstrates
distributed load balancing concepts through interactive real-time visualization.
It consists of two main subsystems:

| Subsystem | Technology | Responsibility |
|---|---|---|
| **Frontend SPA** | React 18 + Vite + Chart.js | UI, visualization, user interaction |
| **Backend Server** | Node.js + Express + ws | Simulation engine, REST API, WebSocket |

---

## 2. Component Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (SPA)                             │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                        App.jsx                               │  │
│  │  ┌─────────────────┐      ┌──────────────────────────────┐  │  │
│  │  │  useWebSocket   │      │      useSimulation           │  │  │
│  │  │  - WS client    │      │  - servers state             │  │  │
│  │  │  - auto-reconnect│     │  - requestLog state          │  │  │
│  │  │  - msg routing  │      │  - timeSeries state          │  │  │
│  │  └─────────────────┘      │  - REST API calls            │  │  │
│  │                           └──────────────────────────────┘  │  │
│  │                                                              │  │
│  │  ┌─────────────────────────────────────────────────────┐    │  │
│  │  │              Tab: Live Simulation                   │    │  │
│  │  │  ┌───────────────┐  ┌───────────────────────────┐  │    │  │
│  │  │  │TrafficControls│  │        Dashboard           │  │    │  │
│  │  │  │- Algorithm    │  │  ┌──────────────────────┐  │  │    │  │
│  │  │  │  selector     │  │  │    MetricsSummaryBar  │  │  │    │  │
│  │  │  │- Pattern btns │  │  └──────────────────────┘  │  │    │  │
│  │  │  │- Rate slider  │  │  ┌──────────────────────┐  │  │    │  │
│  │  │  │- Server count │  │  │      ServerGrid      │  │  │    │  │
│  │  │  │- Weight ctrl  │  │  │   [Card] [Card] ...  │  │  │    │  │
│  │  │  └───────────────┘  │  └──────────────────────┘  │  │    │  │
│  │  │                     │  ┌──────────────────────┐  │  │    │  │
│  │  │                     │  │   LiveLineChart       │  │  │    │  │
│  │  │                     │  │   ConnectionBarChart  │  │  │    │  │
│  │  │                     │  │   LoadDoughnutChart   │  │  │    │  │
│  │  │                     │  └──────────────────────┘  │  │    │  │
│  │  │                     │  ┌──────────────────────┐  │  │    │  │
│  │  │                     │  │    RequestFeed       │  │  │    │  │
│  │  │                     │  └──────────────────────┘  │  │    │  │
│  │  │                     └───────────────────────────┘  │    │  │
│  │  └─────────────────────────────────────────────────────┘    │  │
│  │                                                              │  │
│  │  ┌─────────────────────────────────────────────────────┐    │  │
│  │  │          Tab: Performance Comparison                │    │  │
│  │  │  ComparisonPanel                                    │    │  │
│  │  │  - Runs 3 × 6s benchmark                           │    │  │
│  │  │  - Summary table                                    │    │  │
│  │  │  - 4 comparison bar charts                         │    │  │
│  │  │  - WinnerCard with scoring                         │    │  │
│  │  └─────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
          │ WebSocket (metrics push, 500ms)
          │ HTTP REST (control commands)
          ▼
┌────────────────────────────────────────────────────────────────────┐
│                        BACKEND SERVER                              │
│                                                                    │
│  index.js (Express + HTTP + ws)                                    │
│  │                                                                 │
│  ├── REST Routes (/api/*)                                          │
│  │   ├── GET  /api/status       ← Full snapshot                   │
│  │   ├── GET  /api/algorithms   ← Available algorithms            │
│  │   ├── POST /api/start        ← Start simulator                 │
│  │   ├── POST /api/stop         ← Stop simulator                  │
│  │   ├── POST /api/config       ← Update algo/pattern/rate        │
│  │   ├── POST /api/reset        ← Reset all metrics               │
│  │   └── POST /api/server/:id   ← Per-server config               │
│  │                                                                 │
│  ├── LoadBalancer (core engine)                                    │
│  │   ├── Algorithm (hot-swappable)                                 │
│  │   │   ├── RoundRobin         ← O(1) circular selection         │
│  │   │   ├── LeastConnections   ← O(n) min-scan selection         │
│  │   │   └── Weighted           ← O(n) smooth weighted RR         │
│  │   │                                                             │
│  │   └── ServerNode Pool                                           │
│  │       ├── handleRequest()    ← Async, simulates concurrency    │
│  │       ├── getMetrics()       ← Snapshot for broadcast          │
│  │       └── reset()                                              │
│  │                                                                 │
│  ├── RequestSimulator                                              │
│  │   ├── Uniform    ← Constant rate                               │
│  │   ├── Burst      ← 3s high / 3s low                            │
│  │   ├── Spike      ← Short spikes every 10s                      │
│  │   └── Ramp-Up    ← Linear increase to target rate              │
│  │                                                                 │
│  └── WebSocket Handler                                             │
│      ├── Broadcasts every 500ms                                    │
│      ├── Ping/pong heartbeat                                       │
│      └── Handles client reconnection                               │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. Communication Protocols

### 3.1 REST API (HTTP/JSON)

Used for **control operations** that change simulation state.

```
Method   Endpoint              Body                     Purpose
─────────────────────────────────────────────────────────────────────
GET      /api/status           -                        Full snapshot
POST     /api/start            {pattern, ratePerSec}    Start simulator
POST     /api/stop             -                        Stop simulator
POST     /api/config           {algorithm, serverCount, Update config
                                pattern, ratePerSec}
POST     /api/reset            -                        Reset metrics
POST     /api/server/:id       {weight, offline}        Server config
GET      /api/algorithms       -                        Algorithm list
```

### 3.2 WebSocket (ws://)

Used for **live metric streaming** (push, not pull).

```
Server → Client messages:

  { type: "init",              payload: <full snapshot> }   ← on connect
  { type: "metrics",           payload: <full snapshot> }   ← every 500ms
  { type: "request-complete",  payload: <request result> }  ← per request
  { type: "algorithm-changed", payload: { algorithm } }     ← on hot-swap
  { type: "reset",             payload: {} }                ← on reset

Client → Server messages:

  { type: "ping" }             ← client keepalive
  { type: "get-snapshot" }     ← request immediate snapshot
```

---

## 4. Deployment Topology

```
Development (local):

  Browser (localhost:5173)
       │
       ├── GET /api/*   → localhost:4000
       └── WS           → ws://localhost:4000

  npm run dev   (in client/)  → Vite dev server
  node index.js (in server/)  → Express + ws
```

---

## 5. Key Flows

### Flow 1: Simulation Start

```
User clicks "Start"
  → TrafficControls → onStart()
  → useSimulation.startSimulation()
  → POST /api/start { pattern, ratePerSec }
  → Express route handler
  → RequestSimulator.start()
  → setInterval 100ms ticks begin
  → each tick: LoadBalancer.handleRequest() × N
  → LoadBalancer metricsTimer emits 'metrics' every 500ms
  → wsHandler broadcasts to all clients
  → React useWebSocket receives 'metrics'
  → ingestMetrics() updates state
  → Components re-render with new data
```

### Flow 2: Algorithm Hot-Swap

```
User clicks "Weighted RR" → Apply
  → POST /api/config { algorithm: 'weighted' }
  → LoadBalancer.setAlgorithm('weighted')
  → old algorithm instance discarded
  → new Weighted() instance created (fresh accumulators)
  → emit 'algorithm-changed'
  → wsHandler broadcasts to clients
  → Next request immediately uses new algorithm
```

### Flow 3: Comparison Benchmark

```
User clicks "Run Benchmark"
  → ComparisonPanel.handleRun()
  → For each algorithm (RR, LC, Weighted):
      1. POST /api/config  { algorithm, pattern: 'uniform', rate: 40 }
      2. POST /api/reset
      3. POST /api/start
      4. await 6000ms
      5. GET  /api/status  → collect snapshot
      6. POST /api/stop
      7. Compute: throughput, avgLatency, p95, variance
  → Render ComparisonBarChart × 4
  → Score all 3 algorithms → show WinnerCard
```
