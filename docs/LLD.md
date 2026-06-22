# Low-Level Design (LLD)
## Load Balancer Simulator

---

## 1. Class Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         EventEmitter                              │
│                   (Node.js built-in)                              │
└──────────────────────┬───────────────────────────────────────────┘
                       │ extends
           ┌───────────┴──────────────┐
           │                          │
    ┌──────▼────────┐      ┌──────────▼──────────┐
    │  ServerNode   │      │    LoadBalancer      │
    ├───────────────┤      ├─────────────────────┤
    │ id: string    │      │ algorithmKey: string │
    │ name: string  │◄─────│ algorithm: Algorithm │
    │ weight: number│(pool)│ servers: ServerNode[]│
    │ baseLatency   │      │ totalRequests        │
    │ maxConnections│      │ totalErrors          │
    │ currentConns  │      │ _timeSeries: []      │
    │ processedReqs │      │ _requestLog: []      │
    ├───────────────┤      ├─────────────────────┤
    │ handleRequest()│     │ handleRequest()      │
    │ getMetrics()  │      │ setAlgorithm()       │
    │ reset()       │      │ setServerCount()     │
    │ setWeight()   │      │ updateServer()       │
    │ setOffline()  │      │ reset()              │
    │ _simulateLat()│      │ getSnapshot()        │
    │ _percentile() │      │ destroy()            │
    └───────────────┘      └─────────┬───────────┘
                                     │ uses
                           ┌─────────▼───────────┐
                           │   <<interface>>      │
                           │   Algorithm          │
                           ├─────────────────────┤
                           │ name: string         │
                           │ description: string  │
                           ├─────────────────────┤
                           │ select(servers[])    │
                           │ reset()              │
                           │ getState()           │
                           └──────────┬──────────┘
                                      │ implements
                        ┌─────────────┼─────────────┐
                 ┌──────▼──────┐ ┌────▼────────┐ ┌──▼──────────┐
                 │ RoundRobin  │ │  Least      │ │  Weighted   │
                 ├─────────────┤ │ Connections │ ├─────────────┤
                 │ _counter: n │ ├─────────────┤ │ _currWeights│
                 ├─────────────┤ │ (stateless) │ │   Map<id,n> │
                 │ select()    │ ├─────────────┤ ├─────────────┤
                 │ reset()     │ │ select()    │ │ select()    │
                 └─────────────┘ │ reset()     │ │ reset()     │
                                 └─────────────┘ └─────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     RequestSimulator                             │
├─────────────────────────────────────────────────────────────────┤
│ lb: LoadBalancer                                                 │
│ _timer: IntervalID                                               │
│ _running: boolean                                                │
│ _ratePerSec: number                                              │
│ _pattern: string                                                 │
│ _tickCount: number                                               │
├─────────────────────────────────────────────────────────────────┤
│ start({ pattern, ratePerSec })                                   │
│ stop()                                                           │
│ update({ pattern?, ratePerSec? })                                │
│ _tick()                                                          │
│ _computeBatchSize() → number                                     │
│ _buildRequest() → { id, size, priority, timestamp }             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Algorithm Pseudocode

### 2.1 Round Robin

```
state: counter = 0

select(servers):
  available = servers.filter(s → s.status != 'offline')
  if available.isEmpty: return null

  index = counter % available.length
  counter = (counter + 1) % available.length
  return available[index]

Complexity: O(1) time, O(1) space
```

### 2.2 Least Connections

```
select(servers):
  available = servers.filter(s → s.status != 'offline')
  if available.isEmpty: return null

  selected = available[0]
  minConn  = available[0].currentConnections

  for i = 1 to available.length:
    if available[i].currentConnections < minConn:
      minConn  = available[i].currentConnections
      selected = available[i]

  return selected

Complexity: O(n) time, O(1) space
```

### 2.3 Smooth Weighted Round Robin (Nginx variant)

```
state: currentWeights = Map<serverId, number>

select(servers):
  available = servers.filter(s → s.status != 'offline')
  if available.isEmpty: return null

  // Initialize missing entries
  for each server in available:
    if server.id not in currentWeights:
      currentWeights[server.id] = 0

  totalWeight = sum(available.map(s → s.weight))

  // Step 1: increase each current weight by configured weight
  for each server in available:
    currentWeights[server.id] += server.weight

  // Step 2: pick server with highest current weight
  selected = server with max currentWeights value

  // Step 3: reduce winner's weight by total sum
  currentWeights[selected.id] -= totalWeight

  return selected

Example (weights [5, 1, 1]):
  Tick 1: CW[A=5, B=1, C=1] → pick A (5), A-=7 → CW[A=-2, B=1, C=1]
  Tick 2: CW[A=3, B=2, C=2] → pick A (3), A-=7 → CW[A=-4, B=2, C=2]
  Tick 3: CW[A=1, B=3, C=3] → pick B (3), B-=7 → CW[A=1, B=-4, C=3]
  Tick 4: CW[A=6, B=-3, C=4]→ pick A (6), A-=7 → CW[A=-1, B=-3, C=4]
  Tick 5: CW[A=4, B=-2, C=5]→ pick C (5), C-=7 → CW[A=4, B=-2, C=-2]
  Tick 6: CW[A=9, B=-1, C=-1]→ pick A (9), A-=7 → CW[A=2, B=-1, C=-1]
  Tick 7: CW[A=7, B=0, C=0] → pick A (7), A-=7 → CW[A=0, B=0, C=0]
  Sequence: A A B A C A A → A gets 5/7 ≈ 71.4% ✓

Complexity: O(n) time, O(n) space (weight map)
```

---

## 3. ServerNode Latency Simulation

```
_simulateLatency():
  loadFactor  = currentConnections / maxConnections   // 0.0 – 1.0
  loadPenalty = loadFactor × baseLatency × 2          // 0 – 2× base under full load
  jitter      = (random() - 0.5) × baseLatency × 0.4  // ±20% randomness
  return max(10, round(baseLatency + loadPenalty + jitter))

Example (baseLatency=80, currentConns=25, maxConns=50):
  loadFactor  = 0.5
  loadPenalty = 0.5 × 80 × 2 = 80ms
  jitter      = ±16ms
  result      ≈ 80 + 80 ± 16 = 144–176ms
```

---

## 4. RequestSimulator Batch Size Calculation

```
TICK_INTERVAL_MS = 100  (10 ticks per second)

_computeBatchSize():
  basePerTick = ratePerSec / 10

  multiplier = {
    uniform:  1.0
    burst:    tickCount % 60 < 30 ? 3.0 : 0.2   (3s/3s alternating)
    spike:    tickCount % 100 < 20 ? 5.0 : 0.1  (2s spike, 8s quiet)
    ramp-up:  0.1 + min(1, tickCount/100) × 0.9
  }

  exactCount = basePerTick × multiplier
  batchSize  = floor(exactCount) + (random() < frac(exactCount) ? 1 : 0)
  return batchSize

Example (ratePerSec=40, pattern=burst, tick=15 [in burst phase]):
  basePerTick = 40/10 = 4
  multiplier  = 3
  exactCount  = 12
  batchSize   = 12  (no fractional part)
```

---

## 5. WebSocket Message Schema

```typescript
// Server → Client (all messages)
interface WSMessage {
  type: 'init' | 'metrics' | 'request-complete' | 'request-dropped' | 'algorithm-changed' | 'reset' | 'pong';
  payload: MetricsPayload | RequestResult | AlgorithmInfo | {};
}

interface MetricsPayload {
  algorithm:        string;
  algorithmName:    string;
  totalRequests:    number;
  totalErrors:      number;
  droppedRequests:  number;
  uptime:           number;          // ms since start
  servers:          ServerMetrics[];
  recentRequests:   RequestResult[]; // last 20 requests
  timeSeries:       TimeSeriesPoint[];
}

interface ServerMetrics {
  id:                string;
  name:              string;
  weight:            number;
  status:            'healthy' | 'busy' | 'overloaded' | 'offline';
  currentConnections:number;
  processedRequests: number;
  avgResponseTime:   number; // ms
  peakConnections:   number;
  cpuLoad:           number; // 0-100
  memoryUsage:       number; // 0-100
  throughput:        number; // req/s (1s sliding window)
  errors:            number;
  p95Latency:        number; // ms
  p99Latency:        number; // ms
  maxConnections:    number;
}

interface RequestResult {
  requestId:    string;
  serverId:     string | null;
  serverName:   string;
  latency:      number; // ms
  success:      boolean;
  timestamp:    number; // Unix ms
  algorithm:    string;
}

interface TimeSeriesPoint {
  ts:      number; // Unix ms
  servers: Array<{
    id:             string;
    name:           string;
    connections:    number;
    throughput:     number;
    cpuLoad:        number;
    avgResponseTime:number;
    status:         string;
  }>;
}
```

---

## 6. REST API Contract

### POST /api/start
```json
// Request
{ "pattern": "burst", "ratePerSec": 60 }

// Response 200
{ "success": true, "message": "Simulation started", "config": { "running": true, "pattern": "burst", "ratePerSec": 60 } }
```

### POST /api/config
```json
// Request
{ "algorithm": "weighted", "serverCount": 6, "pattern": "spike", "ratePerSec": 100 }

// Response 200
{ "success": true, "message": "Applied: algorithm → weighted, serverCount → 6, ...", "snapshot": {...}, "simulator": {...} }
```

### POST /api/server/:id
```json
// Request
{ "weight": 5, "offline": false, "baseLatency": 50 }

// Response 200
{ "success": true, "message": "Server server-2 updated", "server": { "id": "server-2", ... } }
```

---

## 7. Simulation State Machine

```
                      ┌─────────────────────────────────────┐
                      │           STATES                     │
                      └─────────────────────────────────────┘

     ┌────────────┐
     │   IDLE     │◄──────────────────────────────────────────┐
     │ (default)  │                                           │
     └─────┬──────┘                                           │
           │ POST /api/start                                   │
           ▼                                                   │
     ┌────────────┐   POST /api/stop                    ┌─────┴──────┐
     │  RUNNING   │────────────────────────────────────►│  STOPPED   │
     │            │   POST /api/reset               ┌──►│            │
     │  setInterval│────────────────────────────────┤   └─────┬──────┘
     │  100ms ticks│                                │         │
     └─────┬──────┘                                │   POST /api/reset
           │                                        │         │
           │ POST /api/config                       │         ▼
           │ (algorithm/serverCount)                │   ┌────────────┐
           ▼                                        └───│   RESET    │
     ┌────────────┐                                     │  (metrics  │
     │ RECONFIGURING│                                   │  cleared)  │
     │ (mid-run)  │                                     └────────────┘
     └─────┬──────┘
           │ (immediately continues running)
           ▼
     ┌────────────┐
     │  RUNNING   │
     │ (new config)│
     └────────────┘
```

---

## 8. Performance Characteristics

| Operation | Time Complexity | Space Complexity |
|---|---|---|
| Round Robin select | O(k) where k = offline servers scan | O(1) |
| Least Connections select | O(n) | O(1) |
| Weighted RR select | O(n) | O(n) (weight map) |
| handleRequest() | O(1) dispatch + async wait | O(1) |
| getMetrics() snapshot | O(n × h) where h = history size | O(n) |
| WebSocket broadcast | O(c) where c = connected clients | O(1) |
| Time-series append | O(1) amortized (ring buffer) | O(120) = O(1) |
| Percentile calculation | O(h log h) (sort history) | O(h) |

---

## 9. Error Handling

| Scenario | Handling |
|---|---|
| All servers offline | handleRequest() records dropped; emits 'request-dropped' |
| Algorithm key invalid | setAlgorithm() throws; API returns 400 |
| WS client disconnect | ws.terminate() + clients.delete(); reconnect not needed |
| WS send on closed socket | safeSend() checks readyState; catches errors silently |
| REST API crash | Express 500 handler returns { success: false, error } |
| SimulatorStart while running | stop() called first; fresh start |
