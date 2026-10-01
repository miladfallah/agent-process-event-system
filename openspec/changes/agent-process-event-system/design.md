# Design

## Context

The system must evaluate a constant stream of sensor events (5 events/second per Agent) against active business rules. HTTP/WebSocket protocols are not preferred. A MongoDB cluster acts as the primary data store, with Redis supporting fast leaderboard projections. The primary technical constraints surround preventing double-counting, preventing data loss, and ensuring historical accuracy despite network partitions and process crashes.

## Goals / Non-Goals

**Goals:**
- Provide resilient ingestion and processing semantics.
- Decouple rule evaluation from database queries.
- Ensure the Redis leaderboard is an eventually consistent, rebuildable read-model projection.
- Recover predictably from process crashes, network loss, and duplicate messages.

**Non-Goals:**
- Implementing Kafka or full Event Sourcing architectures.
- Building custom UI dashboards for the reports.
- Massive dynamic scalability beyond what is required for the assignment.
- Complex user authentication or authorization models.
- Custom Dead Letter Queue (DLQ) inspection APIs; RabbitMQ Management UI is sufficient.

## Decisions

### 1. Messaging Infrastructure: RabbitMQ Topic Exchange
**Decision:** Use RabbitMQ with a Topic Exchange and Durable Queues for Agent-to-Process communication.
**Reason:** RabbitMQ natively provides manual acknowledgements, backpressure (prefetch), and Dead Letter routing for failed messages. This satisfies the requirement to avoid HTTP/WS while providing reliable at-least-once delivery.
**Tradeoff:** Higher infrastructure complexity than simple HTTP endpoints.

### 2. Idempotency & MongoDB Transactions
**Decision:** Execute Event insertion, all corresponding RuleMatch insertions, and internal LeaderboardCounter increments within a single MongoDB transaction.
**Reason:** To achieve effectively-once business processing. A unique index on `eventId` ensures that if RabbitMQ redelivers a message, the transaction immediately throws `E11000 Duplicate Key`. The application catches this, ACKs the message, and aborts the duplicate transaction, preventing duplicate RuleMatches or double-counted increments. The duplicate-event `E11000 -> ACK` behavior is valid *only* because successful existence of the event implies the complete transaction previously committed.
**Tradeoff:** Requires MongoDB to run as a Replica Set and incurs slight transaction overhead.

### 3. Redis Leaderboard Projection (CDC via Change Streams)
**Decision:** Use MongoDB Change Streams to project durable absolute counts into Redis using `ZADD leaderboard:rule:{ruleId} GT {absoluteCount} {agentId}`.
**Reason:** MongoDB `LeaderboardCounter` is the absolute Source of Truth. The Change Stream provides resumable, at-least-once delivery of count updates. The CDC worker translates these to effectively-once/idempotent updates in Redis by applying the absolute count. The `GT` (Greater Than) flag is crucial: it prevents stale or out-of-order counter updates (e.g., from concurrent processing or retries) from regressing a newer, higher score back to a lower one.
**Tradeoff:** Introduces a background CDC worker, but resolves the classic non-idempotent `ZINCRBY` double-counting flaw.

### 4. Rule Engine Cache Synchronization
**Decision:** Maintain an in-memory active rule cache inside the Process Service. Sync via Redis Pub/Sub invalidations, backed by a persistent MongoDB polling fallback.
**Reason:** Ensures eventual consistency of the rule cache across nodes. Pub/Sub is fast but lacks delivery guarantees; polling ensures recovery from missed messages during network partitions.
**Tradeoff:** Increased code complexity to manage cache invalidation.

### 5. Report API #1 Pagination & Index
**Decision:** Return occurrence timestamps grouped per Agent, paginated via a time-based cursor (`occurredAt`).
**Reason:** An Agent generating 5 events/sec can produce ~432,000 events in 24 hours. A single unbounded response would cause extreme memory pressure and timeouts. Paginating by time strictly bounds the response size while preserving the required per-Agent grouping structure.
**Candidate Index:** `{ ruleId: 1, occurredAt: 1, agentId: 1 }`. This index order supports the equality check on `ruleId`, the range query on `occurredAt`, and covers the `agentId` for the response. Its actual performance must be verified during implementation.

### 6. Agent Behavior (RabbitMQ Outage)
**Decision:** The Agent will use bounded publish retries with exponential backoff. Upon retry exhaustion, the event is logged and dropped.
**Reason:** The assignment explicitly specifies that the Agent has no database. Consequently, in the event of a prolonged RabbitMQ outage or Agent restart, unpublished generated events will be lost. Zero data loss across the Agent-Broker boundary cannot be guaranteed without introducing local persistent storage, which violates the assignment constraint.
