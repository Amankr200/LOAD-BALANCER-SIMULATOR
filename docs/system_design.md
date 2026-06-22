# System Design – Load Balancer Simulator

## 1. Problem Statement

Modern distributed web applications must handle thousands of concurrent requests
across multiple server nodes. A **load balancer** sits in front of the server pool
and distributes incoming traffic to prevent any single server from becoming
overwhelmed. This project simulates and visualizes that process in real time.

---

## 2. Goals

| Goal | Description |
|---|---|
| **Functional** | Simulate 3 load balancing algorithms with configurable traffic |
| **Observable** | Live Chart.js dashboards for all server metrics |
| **Comparable** | Automated benchmarking to compare algorithm performance |
| **Educational** | Demonstrate concurrency principles and distributed systems concepts |

### Non-Goals
- Real HTTP traffic routing (this is a simulator)
- Production-grade auto-scaling
- Database-backed persistence

---

## 3. High-Level Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     Browser (React + Vite)                  │
│                                                            │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────┐  │
│  │  Dashboard   │   │  Comparison  │   │   Config      │  │
│  │  - Charts    │   │  - Benchmark │   │   - Controls  │  │
│  │  - ServerGrid│   │  - Winner    │   │   - Sliders   │  │
│  │  - Feed      │   │  - Tables    │   │   - Weights   │  │
│  └──────┬───────┘   └──────┬───────┘   └───────┬───────┘  │
│         │                  │                    │          │
│  useWebSocket (WS)  useSimulation (REST + State)          │
└──────────────────────────────────────────────────────────-─┘
          │                  │
          ▼ WebSocket        ▼ HTTP REST
┌─────────────────────────────────────────────────────────────┐
│              Node.js + Express Backend (Port 4000)          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Express REST API (/api/*)                │  │
│  │  POST /start  POST /stop  POST /config  GET /status  │  │
│  └────────────────────────┬─────────────────────────────┘  │
│                           │                                 │
│  ┌────────────────────────▼─────────────────────────────┐  │
│  │               LoadBalancer Engine                     │  │
│  │  ┌─────────────┐  ┌───────────────┐  ┌────────────┐ │  │
│  │  │ Round Robin │  │LeastConnections│  │  Weighted  │ │  │
│  │  └─────────────┘  └───────────────┘  └────────────┘ │  │
│  │                                                       │  │
│  │  ┌───────────────────────────────────────────────┐   │  │
│  │  │           ServerNode Pool [N nodes]           │   │  │
│  │  │   [Alpha] [Beta] [Gamma] [Delta] … [Kappa]   │   │  │
│  │  └───────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │          RequestSimulator (Traffic Generator)      │    │
│  │   Uniform | Burst | Spike | Ramp-Up patterns       │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │          WebSocket Server (ws library)             │    │
│  │   Broadcasts metrics every 500ms to all clients    │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Technology Choices

| Technology | Why Chosen |
|---|---|
| **React 18 + Vite** | Fast dev server, component model ideal for live data |
| **Chart.js 4 + react-chartjs-2** | Best-in-class browser charting, smooth animations |
| **Node.js + Express** | Non-blocking I/O maps naturally to concurrency simulation |
| **WebSocket (`ws`)** | Low-latency full-duplex for 500ms metric push |
| **Vanilla CSS** | Full design control; no Tailwind overhead |
| **uuid** | Unique request IDs for tracking and feed display |

---

## 5. Data Flow

```
RequestSimulator.tick()
    │
    │  (batch of N requests every 100ms)
    ▼
LoadBalancer.handleRequest(request)
    │
    ├──► algorithm.select(servers)  → returns ServerNode
    │
    └──► server.handleRequest(request)   [async, non-blocking]
              │
              ├── simulate latency (base + load penalty + jitter)
              ├── increment currentConnections
              ├── await sleep(latency)
              ├── record metrics (avgResponseTime, p95, throughput)
              └── emit result → LoadBalancer._pushLog()

LoadBalancer metricsTimer (every 500ms)
    │
    ├── snapshot = getSnapshot()
    ├── emit('metrics', snapshot)
    └──► wsHandler broadcasts to all WS clients

React useWebSocket hook receives message
    ├── type === 'metrics' → ingestMetrics()
    │       ├── setServers()
    │       ├── setTimeSeries()   (rolling 60s window)
    │       └── setTotalRequests/Errors/Dropped()
    └── Charts auto-re-render (useMemo on timeSeries)
```

---

## 6. Concurrency Model

The Node.js event loop is single-threaded, but I/O is non-blocking.

```
Tick 0ms:   handleRequest(req1), handleRequest(req2), handleRequest(req3)
            │                    │                    │
            ▼                    ▼                    ▼
            sleep(80ms)          sleep(130ms)         sleep(60ms)
            currentConns: 3      ←── all 3 in-flight simultaneously
            │
Tick 60ms:  req3 resolves  → currentConns: 2
Tick 80ms:  req1 resolves  → currentConns: 1
Tick 130ms: req2 resolves  → currentConns: 0
```

This simulates true multi-threaded concurrency without native threads, which
is exactly how Node.js handles real I/O (database queries, HTTP calls, etc.).

---

## 7. Scalability Considerations

| Concern | Current Approach | Production Approach |
|---|---|---|
| **Node count** | Up to 10 virtual nodes | Kubernetes pods via k8s API |
| **Metric storage** | In-memory ring buffer (60s) | Time-series DB (InfluxDB/Prometheus) |
| **WS clients** | Set<WebSocket> in memory | Redis pub/sub for multi-instance |
| **Algorithm extension** | New class + registry entry | Plugin system with dynamic loading |
| **Health checks** | Status flag on node | Active HTTP probes every 5s |

---

## 8. Key Design Decisions

1. **Event-driven metrics**: LoadBalancer emits events → wsHandler listens → broadcasts.
   This decouples the core engine from the transport layer. Swapping WebSocket for
   Server-Sent Events requires only changing wsHandler.js.

2. **Algorithm hot-swap**: setAlgorithm() replaces the algorithm instance without
   restarting servers. Useful for demo purposes (switch algorithm mid-simulation).

3. **Smooth Weighted Round Robin**: Using the Nginx variant (not naive WRR) avoids
   bursty traffic patterns – high-weight servers don't receive all requests consecutively.

4. **Probabilistic tick rounding**: RequestSimulator converts fractional requests/tick
   to integer batches using `floor + random < fraction` so the actual rate matches
   the configured rate over time without integer truncation error.
