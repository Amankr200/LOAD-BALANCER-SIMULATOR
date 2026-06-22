# Load Balancer Simulator

> **Distributed Systems Visualization** | React.js · Chart.js · Node.js · WebSocket

An interactive simulation of load balancing algorithms with real-time Chart.js visualizations, concurrency demonstration across virtual server nodes, and a performance comparison dashboard.

---

## ✨ Features

| Feature | Description |
|---|---|
| **3 Algorithms** | Round Robin, Least Connections, Weighted Round Robin (Nginx smooth variant) |
| **Real-time Charts** | Live updating line, bar, and doughnut charts via Chart.js |
| **Concurrency Simulation** | Multiple simultaneous in-flight requests per server |
| **4 Traffic Patterns** | Uniform, Burst, Spike, Ramp-Up |
| **Performance Comparison** | Automated benchmark runner comparing all 3 algorithms |
| **Live Request Feed** | Color-coded scrolling log of every routed request |
| **Server Configuration** | Per-server weight, latency, online/offline toggling |
| **WebSocket Streaming** | Metrics pushed every 500ms, no polling |

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- npm v9+

### 1. Start the Backend

```bash
cd server
npm install
npm start
# Server running at http://localhost:4000
# WebSocket at ws://localhost:4000
```

### 2. Start the Frontend

```bash
cd client
npm install
npm run dev
# Frontend running at http://localhost:5173
```

### 3. Open in Browser

Navigate to [http://localhost:5173](http://localhost:5173)

---

## 📁 Project Structure

```
LOAD BALANCER SIMULATOR/
├── client/                     ← React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx       Main live simulation view
│   │   │   ├── ServerGrid.jsx      Animated server node cards
│   │   │   ├── MetricsChart.jsx    Chart.js visualizations
│   │   │   ├── ComparisonPanel.jsx Algorithm benchmark dashboard
│   │   │   ├── TrafficControls.jsx Simulation controls sidebar
│   │   │   └── RequestFeed.jsx     Live request log
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js     WS connection + reconnect
│   │   │   └── useSimulation.js    Central state management
│   │   └── utils/
│   │       └── chartHelpers.js     Chart.js dataset builders
│   └── package.json
│
├── server/                     ← Node.js + Express backend
│   ├── src/
│   │   ├── core/
│   │   │   ├── LoadBalancer.js     Core routing engine
│   │   │   ├── ServerNode.js       Virtual server with concurrency
│   │   │   └── RequestSimulator.js Traffic pattern generator
│   │   ├── algorithms/
│   │   │   ├── roundRobin.js       O(1) circular selection
│   │   │   ├── leastConnections.js O(n) min-scan selection
│   │   │   └── weighted.js         O(n) smooth weighted RR
│   │   ├── routes/api.js           REST endpoints
│   │   └── websocket/wsHandler.js  WS broadcast + heartbeat
│   ├── index.js                Express entry point
│   └── package.json
│
└── docs/
    ├── system_design.md        Architecture overview
    ├── HLD.md                  High-Level Design
    └── LLD.md                  Low-Level Design (class diagrams, pseudocode)
```

---

## 🧠 Algorithms Explained

### Round Robin
```
Servers: [A, B, C, D]
Traffic: req1→A, req2→B, req3→C, req4→D, req5→A, ...
```
- Complexity: **O(1)**
- Best for: homogeneous servers, uniform workloads

### Least Connections
```
State: A=3, B=1, C=5, D=2 connections
Next:  route to B (minimum)
```
- Complexity: **O(n)**
- Best for: variable request durations

### Weighted Round Robin (Smooth)
```
Weights: A=5, B=1, C=1 → A gets 5/7 ≈ 71% of traffic
Sequence: A, A, B, A, C, A, A (interleaved, not bursty)
```
- Complexity: **O(n)**
- Best for: heterogeneous server capacities

---

## 🔌 API Reference

```
GET  /api/status          Full metrics snapshot
GET  /api/algorithms      Available algorithms list
POST /api/start           Start simulation   { pattern, ratePerSec }
POST /api/stop            Stop simulation
POST /api/config          Update config      { algorithm, serverCount, pattern, ratePerSec }
POST /api/reset           Reset all metrics
POST /api/server/:id      Update server      { weight, offline, baseLatency }
```

WebSocket: `ws://localhost:4000` — metrics pushed every **500ms**

---

## 📊 Performance Metrics Tracked

- **Throughput** – requests/second (1s sliding window)
- **Avg Response Time** – mean latency in ms
- **P95 / P99 Latency** – tail latency percentiles
- **Load Variance (σ)** – standard deviation of connections across servers
- **CPU Load** – approximate utilization (0–100%)
- **Peak Connections** – historical maximum concurrent connections
- **Error Rate** – % of failed requests
- **Dropped Requests** – requests with no available server

---

## 📐 Documentation

| Document | Contents |
|---|---|
| [System Design](docs/system_design.md) | Architecture, data flow, design decisions |
| [HLD](docs/HLD.md) | Component diagram, protocols, key flows |
| [LLD](docs/LLD.md) | Class diagrams, algorithm pseudocode, WS schema, state machine |

---

## 🛠 Tech Stack

- **Frontend**: React 18, Vite, Chart.js 4, react-chartjs-2, Vanilla CSS
- **Backend**: Node.js, Express, `ws` (WebSocket), `uuid`
- **Design**: Dark glassmorphism theme, JetBrains Mono + Inter fonts
- **Architecture**: Event-driven (EventEmitter), async/await concurrency

---

*Resume project demonstrating distributed systems, concurrent programming, real-time data visualization, and full-stack JavaScript development.*
