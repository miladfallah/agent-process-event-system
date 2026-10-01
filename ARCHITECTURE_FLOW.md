# Architecture & Execution Flow

This document provides a comprehensive, diagram-backed explanation of the implemented `agent-process-event-system`. It is designed to help engineers understand the system's runtime behavior, boundaries, and persistence mechanisms based on the actual source code.

---

## 1. System Overview

This project simulates a high-throughput sensor network evaluating incoming events against dynamic rules.
- **Agent Service**: Generates continuous synthetic event streams (`~5 events/sec` using Faker) and publishes them to RabbitMQ. It has no local database and is stateless.
- **RabbitMQ**: Message broker providing at-least-once delivery, decoupling Agents from Processors, and providing durable queues with delayed retry (`events.retry`) and dead-letter (`events.dlq`) topologies.
- **Process Service**: Consumes messages from RabbitMQ, evaluates them against in-memory cached rules, and manages transactions.
- **MongoDB**: The durable, strictly consistent **Source of Truth**. It persists Events, RuleMatches, and internal LeaderboardCounters inside atomic Multi-Document Transactions.
- **Redis**: A fast, **rebuildable Read Model** used for real-time Leaderboard projection (via Sorted Sets) and Pub/Sub notifications for rule invalidation.

```mermaid
flowchart TD
    subgraph Agent Tier
    A1[Agent 1]
    A2[Agent 2]
    end

    subgraph Messaging
    RMQ[RabbitMQ\n'events.topic']
    RetryQ[RabbitMQ Retry Queue\n'events.retry' TTL=5s]
    DLQ[RabbitMQ DLQ\n'events.dlq']
    end

    subgraph Process Service
    Consumer[RabbitMQ Consumer\nIngestionService]
    RuleEngine[Rule Engine\nIn-Memory Cache]
    CDC[CDC Worker\nCdcService]
    API[Reporting APIs\nReportingService]
    end

    subgraph Storage Tier
    Mongo[(MongoDB\nSource of Truth)]
    Redis[(Redis\nRebuildable Read Model & Pub/Sub)]
    end

    A1 -->|Publish Event| RMQ
    A2 -->|Publish Event| RMQ

    RMQ -->|Consume| Consumer
    Consumer -->|Evaluate| RuleEngine
    Consumer -->|Atomic Transaction| Mongo
    Consumer -.->|Transient Failure (attempts < 3)| RetryQ
    RetryQ -.->|TTL 5s Expired (DLX)| RMQ
    Consumer -.->|Malformed or Attempts >= 3| DLQ

    Mongo -- Change Stream --> CDC
    CDC -->|ZADD GT| Redis
    CDC -.->|Cold Start / Redis Reconnect Rebuild| Mongo

    API -->|Read Time-Range| Mongo
    API -->|Read Leaderboard| Redis

    Mongo -. Pub/Sub Invalidation .-> Redis
    Redis -. Notify Invalidated .-> RuleEngine
```

---

## 2. Project Structure

The codebase is organized as a NestJS monorepo containing two distinct applications:

```text
├── apps/
│   ├── agent-service/          # Lightweight event generator
│   │   ├── src/
│   │   │   ├── generator/      # Faker-based event generation logic (5 events/sec)
│   │   │   ├── publisher/      # RabbitMQ AMQP publishing logic with reconnection
│   │   │   ├── agent-service.module.ts
│   │   │   ├── agent-service.service.ts
│   │   │   └── main.ts
│   │   └── Dockerfile
│   └── process-service/        # Core processing monolith
│       ├── src/
│       │   ├── core/           # Cross-cutting concerns (Pino Logging)
│       │   │   └── logging/
│       │   ├── infrastructure/ # DB/Broker Adapters
│       │   │   ├── cache/      # Redis connection module (REDIS_CLIENT, REDIS_SUBSCRIBER)
│       │   │   ├── database/   # Mongoose Schemas (Event, Rule, RuleMatch, LeaderboardCounter)
│       │   │   └── messaging/  # amqplib topology setup (Exchanges, Queues, Retry, DLQ)
│       │   ├── modules/
│       │   │   ├── cdc/        # MongoDB Change Stream worker projecting to Redis with rebuild recovery
│       │   │   ├── engine/     # Rule Evaluator and MongoDB Transaction coordinator
│       │   │   ├── health/     # Terminus healthcheck endpoints
│       │   │   ├── ingestion/  # RMQ Consumer, bounded retry & DLQ handling
│       │   │   ├── reporting/  # REST APIs (Time-Range Cursor Pagination, Leaderboard ZREVRANGE)
│       │   │   └── rules/      # Rule CRUD & Redis Pub/Sub invalidation with polling fallback
│       │   ├── app.module.ts
│       │   └── main.ts
│       ├── test/
│       │   └── app.e2e-spec.ts # End-to-end tests (Zero-match, Multi-match, Idempotency, DLQ)
│       └── Dockerfile
├── scripts/
│   └── verify-index.ts         # Verifies candidate index performance via explain("executionStats")
└── docker-compose.yml          # Local infra definition (Mongo Replica Set, Redis, RMQ)
```

---

## 3. Complete Event Lifecycle

The following sequence diagram details the complete journey of a single event from generation to persistence and RabbitMQ acknowledgment.

```mermaid
sequenceDiagram
    participant A as Agent Service
    participant RMQ as RabbitMQ (events.process)
    participant C as IngestionService
    participant E as EngineService
    participant R as EvaluatorService
    participant DB as MongoDB (Replica Set)

    A->>A: Generate Faker payload
    A->>A: Wrap with UUID & timestamp
    A->>RMQ: Publish to 'events.topic'
    
    RMQ->>C: Deliver Message
    C->>C: Validate Envelope (eventId, schemaVersion, agentId)
    
    alt Invalid / Malformed Envelope
        C->>RMQ: NACK (requeue=false) -> routes to 'events.dlx' -> 'events.dlq'
    else Valid Envelope
        C->>E: processEvent(payload)
        E->>R: evaluate(payload, activeRulesCache)
        
        alt 0 Rules Match (Zero-Match Requirement)
            R-->>E: []
            E->>DB: Start Session & Transaction
            E->>DB: Insert Event (eventModel.create)
            Note over E,DB: No RuleMatches created, no LeaderboardCounters updated
            E->>DB: Commit Transaction
            E-->>C: Success
            C->>RMQ: ACK
        else 1..N Rules Match
            R-->>E: [RuleA, RuleB]
            E->>DB: Start Session & Transaction
            E->>DB: Insert Event (eventModel.create)
            E->>DB: Insert RuleMatches (ruleMatchModel.insertMany with RuleSnapshot)
            E->>DB: $inc LeaderboardCounters (updateOne with upsert: true)
            
            alt Transaction Success
                E->>DB: Commit Transaction
                E-->>C: Success
                C->>RMQ: ACK
            else Duplicate eventId (E11000)
                DB-->>E: DuplicateKeyError (code: 11000)
                E->>DB: Abort Transaction
                E-->>C: throw DUPLICATE_EVENT
                Note over C: Idempotent Success: message previously committed
                C->>RMQ: ACK
            else Transient Error (e.g. Mongo network timeout)
                DB-->>E: Error
                E->>DB: Abort Transaction
                E-->>C: throw Error
                alt retryCount < 3
                    C->>RMQ: Publish to 'events.retry.exchange' with x-retry-count + 1
                    C->>RMQ: ACK original message
                else retryCount >= 3
                    C->>RMQ: NACK (requeue=false) -> routes to 'events.dlq'
                end
            end
        end
    end
```

---

## 4. RabbitMQ Flow

The `MessagingModule` and `IngestionService` implement a bounded retry topology with a dead-letter exchange (DLX) and delayed retry queue. **No unbounded `NACK(requeue=true)` infinite poison loops exist.**

### Topology Configuration
- **Main Exchange**: `events.topic` (type: `topic`, durable: `true`)
- **Main Queue**: `events.process` (durable: `true`)
  - Bound to `events.topic` on `event.#`
  - Dead Letter Exchange: `events.dlx` with routing key `dlq.routing.key`
- **Delayed Retry Exchange**: `events.retry.exchange` (type: `direct`, durable: `true`)
- **Delayed Retry Queue**: `events.retry` (durable: `true`)
  - Bound to `events.retry.exchange` on `retry`
  - `messageTtl`: 5000ms (5 seconds backoff delay)
  - `deadLetterExchange`: `events.topic`
  - `deadLetterRoutingKey`: `event.process.retry` (caught by `event.#` binding on `events.process`)
- **Dead Letter Exchange (DLX)**: `events.dlx` (type: `direct`, durable: `true`)
- **Dead Letter Queue (DLQ)**: `events.dlq` (durable: `true`)
  - Bound to `events.dlx` on `dlq.routing.key`

```mermaid
flowchart TD
    Pub[Agent Publisher] -->|'event.sensor'| Topic[Exchange: 'events.topic']
    Topic -->|'event.#'| MainQ[Queue: 'events.process']
    
    MainQ -->|Consume| Worker[IngestionService Consumer]
    
    Worker -->|Success or Duplicate| Ack[ACK: Message Removed]
    
    Worker -->|Malformed Event\nInvalid Schema| NackMalformed[NACK requeue=false]
    NackMalformed --> DLX[Exchange: 'events.dlx']
    
    Worker -->|Transient Error| CheckRetries{retryCount < 3?}
    CheckRetries -->|Yes| PublishRetry[Publish to 'events.retry.exchange'\nHeader: x-retry-count + 1\nACK original message]
    PublishRetry --> RetryQ[Queue: 'events.retry'\nTTL: 5000ms]
    RetryQ -->|TTL Expires (Dead Letter)| Topic
    
    CheckRetries -->|No (Exhausted)| NackExhausted[NACK requeue=false]
    NackExhausted --> DLX
    
    DLX -->|'dlq.routing.key'| DLQ[Queue: 'events.dlq']
```

---

## 5. MongoDB Transaction & Idempotency

Idempotency is guaranteed by ensuring that the `Event` insertion, all corresponding `RuleMatches`, and all `LeaderboardCounters` increments occur within the **exact same atomic session/transaction**.

If a crash occurs *after* MongoDB commits but *before* RabbitMQ receives the ACK, RabbitMQ will redeliver the message. The unique index on `eventId` triggers an `E11000 Duplicate Key Error` upon the second insert. The application recognizes that the entire transaction already committed, aborts the redundant session, and ACKs the redelivered message.

```mermaid
flowchart TD
    Recv[Receive Message from RMQ] --> StartTX[Start Mongo Session & Transaction]
    StartTX --> InsEv[Insert Event\nUnique Index: eventId]
    
    InsEv -->|Success| CheckMatch{Rules Matched?}
    CheckMatch -->|0 Matches| Commit[Commit Transaction]
    CheckMatch -->|1..N Matches| InsRM[Insert RuleMatches\nUnique Compound Index: eventId + ruleId]
    InsRM --> IncLC[$inc LeaderboardCounters\nAtomic in same session]
    IncLC --> Commit
    Commit --> Ack[RabbitMQ ACK]
    
    InsEv -->|Error E11000\nDuplicate eventId| AbortDup[Abort Transaction]
    AbortDup --> Recog[Recognize as Already Committed Event]
    Recog --> Ack
    
    InsEv -->|Other Mongo Error| AbortErr[Abort Transaction]
    AbortErr --> RetryFlow[Route to Retry Queue / DLQ]
```

> [!IMPORTANT]
> This pattern is safe ONLY because `Event`, `RuleMatches`, and `LeaderboardCounters` are written atomically. If they were written across separate operations, a crash between operations would leave partial state and cause silent data corruption upon duplicate ACK.

---

## 6. Rule Engine Flow

Rules are stored durably in MongoDB. To process high-volume events without per-event database queries, the `EngineService` maintains an in-memory active rules cache.

- When a rule is Created, Updated, or Deleted via REST API, the mutation is committed to MongoDB first.
- An invalidation timestamp is published to Redis channel `rules:invalidated`.
- All running Process Service instances listen to this channel and asynchronously refresh their cache.
- A **30-second polling fallback** runs continuously to recover from missed Pub/Sub notifications during network partitions or Redis restarts.

```mermaid
flowchart TD
    subgraph Rule Management (REST)
    Admin[Admin] -->|POST / PUT / DELETE| API[Rules Controller]
    API -->|1. Persist Mutation| MongoRule[(MongoDB Rules\nSource of Truth)]
    API -->|2. Publish 'rules:invalidated'| RedisPub[(Redis Pub/Sub)]
    end

    subgraph Process Service Local Cache
    RedisPub -.->|Subscribe 'rules:invalidated'| Listener[Invalidation Listener]
    Fallback[30s Polling Fallback Interval] -.-> Listener
    Listener -->|Fetch Active Rules| MongoRule
    Listener -->|Update| Cache[Active Rules Cache]
    end

    subgraph In-Memory Evaluation
    Event[Incoming Event] --> Eval[EvaluatorService]
    Cache --> Eval
    Eval -->|GT / LT / EQ evaluation| Result[Matched Rules Array]
    end
```

---

## 7. Historical Rule Correctness

When a rule matches an event, a deep snapshot (`JSON.parse(JSON.stringify(rule))`) of the exact rule definition is stored directly inside the `RuleMatch` document.

If an administrator later modifies or deletes that rule, historical reporting queries continue to reflect the exact conditions under which the match originally occurred.

```mermaid
flowchart LR
    E1[Event: temp=85\nTime: 10:00] --> Eval1[Evaluator]
    R1[Rule v1: temp > 80] --> Eval1
    Eval1 --> RM1[RuleMatch 1\nContains ruleSnapshot: temp > 80]
    
    Update[Admin Updates Rule to temp > 100] -.-> R2[Rule v2: temp > 100]
    
    E2[Event: temp=85\nTime: 11:00] --> Eval2[Evaluator]
    R2 --> Eval2
    Eval2 -.->|No Match| Drop[Stored as Event only\nZero RuleMatches]
    
    RM1 -.->|Historical reports show original snapshot| API[Report API #1]
```

---

## 8. Report API #1 Flow (Time Range)

The Time-Range endpoint (`GET /reports/time-range/:ruleId`) retrieves occurrences from MongoDB within a maximum 24-hour window, paginated via a time-based cursor (`occurredAt`).

### Candidate Index Verification
The schema defines a candidate compound index:
```javascript
{ ruleId: 1, occurredAt: 1, agentId: 1 }
```
- **Verification Tool**: `scripts/verify-index.ts` runs `explain("executionStats")` on this exact query with projection `{ agentId: 1, occurredAt: 1, _id: 0 }`.
- **Purpose**: Verifies whether MongoDB performs an index scan (`IXSCAN`) and whether the projection allows a fully index-covered scan (`totalDocsExamined: 0`).
- *Note: This index is a candidate whose actual execution statistics should be verified under real data distributions using the verification script.*

```mermaid
flowchart TD
    Client[Client] --> API[ReportingController]
    API --> Val{Validate\nendTime - startTime <= 24h}
    
    Val -->|Invalid| Err[400 Bad Request]
    Val -->|Valid| Query[Build Query:\nruleId + occurredAt in range\ncursor > last occurredAt\nSort: occurredAt ASC\nLimit: 100]
    
    Query --> DB[(MongoDB rulematches)]
    DB -->|Candidate Index Scan| RM[Fetch RuleMatches]
    RM --> Group[Group Occurrences by agentId in Memory]
    Group --> Resp[Return JSON + nextCursor]
```

---

## 9. Report API #2 / Leaderboard Flow

The system maintains a clean separation between the synchronous, durable write path (MongoDB) and the asynchronous, high-speed read path (Redis).

```mermaid
flowchart LR
    subgraph Write Path (Synchronous & Durable)
    RM[RuleMatch Logic] -->|Multi-Doc Transaction| LC[(MongoDB LeaderboardCounters\nSource of Truth)]
    end

    subgraph Projection Path (Asynchronous CDC)
    LC -- Change Stream --> CDC[CDC Worker\nCdcService]
    CDC -->|ZADD leaderboard:rule:ID GT count agentId| Redis[(Redis Sorted Set\nRead Model)]
    end

    subgraph Read Path (Synchronous & Fast)
    Client[Client] --> API[ReportingController /leaderboard/:ruleId]
    API -->|ZREVRANGE 0 -1 WITHSCORES| Redis
    API --> Client
    end
```

---

## 10. CDC Failure, Recovery & Resumability

The `CdcService` listens to MongoDB Change Streams on `LeaderboardCounters`.

### Delivery Semantics & Idempotent Projection
- **Change Stream Guarantee**: At-least-once, resumable stream. The `resumeToken` provides **resumability**, NOT exactly-once execution. If the worker restarts, replayed events may be redelivered.
- **Redis Projection Guarantee**: Idempotent and effectively-once via Redis `ZADD ... GT`. The `GT` (Greater Than) flag ensures that an out-of-order or replayed change event containing an older count will never overwrite a higher count already in Redis.

### Cold Start & Redis Recovery
If Redis is flushed, restarted, or if `resumeToken` is missing:
1. `CdcService` executes `rebuildFromMongo()`, reading all durable `LeaderboardCounters` from MongoDB and setting them into Redis via `ZADD ... GT`.
2. It then initiates the Change Stream watch. Even if new events arrive during rebuild, `ZADD ... GT` guarantees monotonic score progression.

```mermaid
sequenceDiagram
    participant M as MongoDB LeaderboardCounters
    participant C as CDC Worker
    participant R as Redis

    Note over C,R: Cold Start or Redis Flushed (No resumeToken found)
    C->>M: find().lean() (rebuildFromMongo)
    M-->>C: Returns all durable counters
    C->>R: ZADD leaderboard:rule:ID GT count agentId
    
    Note over C: Initiate Change Stream
    C->>M: watch([], { fullDocument: 'updateLookup' })
    
    M-->>C: Change Event (agent: A, count: 10)
    C->>R: ZADD leaderboard:rule:ID GT 10 agent:A
    C->>R: SET cdc:resumeToken <token1>
    
    Note over C: Worker Crashes & Restarts
    C->>R: GET cdc:resumeToken (returns <token1>)
    C->>M: watch([], { resumeAfter: <token1> })
    M-->>C: Replays Change Event (agent: A, count: 10)
    C->>R: ZADD leaderboard:rule:ID GT 10 agent:A (GT prevents decrement or duplicate)
```

---

## 11. Failure Scenarios

```mermaid
flowchart TD
    subgraph Process Crashes
    Crash[Process Crash]
    Crash --> B4Commit[Crash Before Mongo Commit]
    Crash --> AftCommit[Crash After Mongo Commit,\nBefore RabbitMQ ACK]
    
    B4Commit --> B4Recov[Mongo auto-rolls back session.\nRabbitMQ redelivers message.\nProcessed cleanly on restart.]
    AftCommit --> AftRecov[RabbitMQ redelivers message.\nMongo throws E11000 on duplicate eventId.\nCaught gracefully -> ACKed without duplicate side-effects.]
    end

    subgraph Storage Outages
    Outage[Storage Dependency Outage]
    Outage --> NoRedis[Redis Unavailable]
    Outage --> NoMongo[MongoDB Unavailable]
    
    NoRedis --> RedisImpact[Ingestion continues uninterrupted in MongoDB.\nRule CRUD succeeds durably in Mongo.\nPub/Sub error is caught and logged.\nCache recovers via 30s polling fallback.\nCDC retries projection once Redis recovers.]
    NoMongo --> MongoImpact[Ingestion stops committing.\nMessages sent to retry queue with backoff.\nExhausted retries route to DLQ.\nNo partial state is created.]
    end
```

---

## 12. Docker Architecture

The actual `docker-compose.yml` topography configures the multi-container environment.

```mermaid
flowchart TD
    subgraph docker-compose Network
        A1["agent_1 (Agent Service)\nAGENT_ID=agent-1"]
        A2["agent_2 (Agent Service)\nAGENT_ID=agent-2"]
        
        P1["process_service (Process Service)\nPort 3000"]
        
        RMQ["agent_rabbitmq (RabbitMQ 3.13-management-alpine)\nPorts: 5672 (AMQP), 15672 (Management)"]
        
        M1["agent_mongodb (MongoDB 7.0)\nSingle-Node Replica Set rs0\nPort: 27017"]
        
        R1["agent_redis (Redis 7.2-alpine)\nPort: 6379"]
    end
    
    A1 -->|amqp:5672| RMQ
    A2 -->|amqp:5672| RMQ
    
    P1 -->|amqp:5672| RMQ
    P1 -->|mongodb:27017| M1
    P1 -->|redis:6379| R1
```

---

## 13. Testing Flow

The test suite covers unit and end-to-end integration flows:

### Unit Tests
- **`evaluator.service.spec.ts`**: Pure unit tests covering `GT`, `LT`, `EQ` operator logic, multi-rule evaluation, zero-match evaluations, and missing payload fields.

### End-to-End Tests
- **`apps/process-service/test/app.e2e-spec.ts`**:
  1. **Rule Creation**: Verifies REST endpoints and schema validation.
  2. **Zero-Match Event Persistence**: Injects an event matching 0 active rules; verifies the `Event` document is persisted in MongoDB while 0 `RuleMatches` are created.
  3. **Multiple-Match Event**: Injects an event matching multiple rules; verifies multiple `RuleMatches` are created and corresponding `LeaderboardCounters` are atomically incremented.
  4. **Idempotency on Redelivery**: Injects the duplicate `eventId`; verifies the transaction safely aborts via `E11000`, the message is ACKed, and counters are not double-counted.
  5. **DLQ Routing**: Injects a malformed envelope; verifies it is rejected without infinite retry and arrives in `events.dlq`.

### Index Performance Verification
- **`scripts/verify-index.ts`**: Connects to MongoDB, runs `explain("executionStats")` on the Report #1 candidate index, and logs `winningPlan`, `totalKeysExamined`, `totalDocsExamined`, and covered query status.

---

## 14. End-to-End Mental Model

The following comprehensive diagram illustrates the complete data flow, branches, and boundaries:

```mermaid
flowchart TD
    subgraph Agent Tier
    Faker[Faker Event Generator\n~5 events/sec] --> Wrap[Envelope Wrapper\neventId, agentId, occurredAt]
    Wrap --> Pub[RMQ Publisher]
    end

    subgraph RabbitMQ Broker
    Pub -->|Publish| EX[Exchange: events.topic]
    EX -->|event.#| MainQ[Queue: events.process]
    
    RetryQ[Queue: events.retry\nTTL 5000ms] -->|TTL Expired DLX| EX
    DLQ[Queue: events.dlq]
    end

    subgraph Process Service - Ingestion
    MainQ -->|Consume| Cons[IngestionService]
    Cons --> Val{Valid Envelope?}
    Val -->|Malformed| NackDLQ[NACK requeue=false] --> DLQ
    Val -->|Valid| Engine[EngineService.processEvent]
    end

    subgraph Rule Engine & Cache
    Cache[(In-Memory Active Rules Cache)] --> Eval[EvaluatorService]
    Engine --> Eval
    Admin[Admin CRUD] -->|Persist| MongoRules[(MongoDB rules)]
    Admin -.->|Publish Invalidation| RedisPub[(Redis Pub/Sub)]
    RedisPub -.-> Cache
    Poll[30s Polling Fallback] -.-> Cache
    end

    subgraph MongoDB Atomic Transaction
    Eval --> Session[Start Transaction Session]
    Session --> InsEv[1. Insert Event]
    
    InsEv --> Branch{Rule Matches?}
    Branch -->|0 Matches| Commit[Commit Transaction]
    Branch -->|1..N Matches| InsRM[2. Insert RuleMatches + Snapshots]
    InsRM --> IncLC[3. $inc LeaderboardCounters]
    IncLC --> Commit
    
    Commit --> ACK[RabbitMQ ACK]
    
    InsEv -->|Duplicate eventId E11000| AbortDup[Abort Transaction] --> ACK
    Session -->|Transient Error| AbortErr[Abort Transaction]
    AbortErr --> RetryCheck{retryCount < 3?}
    RetryCheck -->|Yes| ToRetry[Publish to events.retry.exchange] --> RetryQ
    RetryCheck -->|No| ToDLQ[NACK requeue=false] --> DLQ
    end

    subgraph CDC & Redis Read Model
    IncLC -- Change Stream --> CDCWorker[CdcService]
    CDCWorker -->|ZADD GT count agentId| RedisZSet[(Redis Sorted Set\nleaderboard:rule:ID)]
    end

    subgraph Reporting APIs
    Client1[Client] -->|GET /reports/time-range/:ruleId| Rep1[Time-Range Report]
    Rep1 -->|Candidate Index Query + Cursor| InsRM
    
    Client2[Client] -->|GET /reports/leaderboard/:ruleId| Rep2[Leaderboard Report]
    Rep2 -->|ZREVRANGE 0 -1 WITHSCORES| RedisZSet
    end
```

---
*Verified and synchronized against the actual source code repository.*
