# Tasks

## 1. Project Scaffolding & Docker Setup

- [x] 1.1 Scaffold the NestJS monorepo containing `agent-service` and `process-service` and verify build succeeds.
- [x] 1.2 Create `docker-compose.yml` including MongoDB (configured as a single-node replica set), Redis, and RabbitMQ, and verify all containers start and report healthy status.
- [x] 1.3 Configure Dockerfiles for both Agent and Process services and verify they build correctly.
- [x] 1.4 Setup environment variables for `AGENT_ID` support and verify Agent boots with the correct identifier.

## 2. Infrastructure & Data Models

- [x] 2.1 Implement MongoDB connection and `Events`, `Rules`, `RuleMatches`, and `LeaderboardCounters` Mongoose/TypeORM schemas, verifying connection strings.
- [x] 2.2 Create MongoDB Unique Index on `eventId` and Compound Unique Index on `{eventId, ruleId}` for `RuleMatches` and verify using MongoDB shell.
- [x] 2.3 Add candidate MongoDB Compound Index `{ruleId: 1, occurredAt: 1, agentId: 1}` on `RuleMatches`.
- [x] 2.4 Setup RabbitMQ connection module with topic exchanges, durable queues, and DLQ topologies and verify connectivity.
- [x] 2.5 Setup Redis connection module and verify ping responds successfully.

## 3. Rules Engine & Rules CRUD

- [x] 3.1 Implement Rules CRUD REST endpoints (Create, Read, Update, Delete) with DTO validation and pagination, verifying via integration tests.
- [x] 3.2 Implement Rule evaluation logic (GT, LT, EQ) and verify via pure unit tests.
- [x] 3.3 Implement Rule snapshot extraction mechanism and verify the snapshot deeply copies the exact state via unit test.
- [x] 3.4 Implement Redis Pub/Sub invalidation publisher on rule modification and persistent polling fallback, verifying nodes update their caches.

## 4. Event Ingestion (Process Service)

- [x] 4.1 Implement RabbitMQ consumer with manual ACK and backpressure handling.
- [x] 4.2 Implement event validation to reject malformed envelopes (missing `eventId`, `schemaVersion`), routing them to DLQ and verifying via integration tests.
- [x] 4.3 Implement MongoDB Transaction logic that inserts Event, evaluates rules in-memory, inserts RuleMatches, and `$inc`s LeaderboardCounters atomically.
- [x] 4.4 Verify effectively-once logic by sending the exact same `eventId` twice to RabbitMQ, ensuring the transaction safely aborts (E11000) and the message is ACKed without double-incrementing counters.

## 5. Agent Service

- [x] 5.1 Implement Faker-based event generator running at ~5 events/sec.
- [x] 5.2 Implement event envelope wrapper (assigning UUIDs and Timestamps).
- [x] 5.3 Implement RabbitMQ publisher with bounded reconnect/retry logic. Verify that after retry exhaustion, the event is logged and dropped (avoiding local storage).

## 6. CDC Worker & Redis Projection

- [x] 6.1 Implement MongoDB Change Stream listener on the `LeaderboardCounters` collection.
- [x] 6.2 Implement `ZADD ... GT` logic projecting absolute counts into Redis and saving `resumeToken`, verifying via integration test that older counts cannot overwrite newer ones.
- [x] 6.3 Verify idempotent projection by manually restarting the CDC worker and ensuring replay doesn't alter the score negatively or double-count.

## 7. Reporting APIs

- [x] 7.1 Implement API #1 (Time Range Report) with 24-hour validation and cursor-based pagination on `occurredAt` to bound response size.
- [x] 7.2 Verify the candidate index for API #1 using `explain("executionStats")` on a large dataset and adjust if necessary.
- [x] 7.3 Implement API #2 (Leaderboard Report) querying Redis Sorted Set `ZREVRANGE` and verify accurate ordering via integration tests.

## 8. End-to-End Validation & Observability

- [x] 8.1 Implement structured JSON logging (e.g., Pino) containing `eventId` correlation and verify log outputs.
- [x] 8.2 Expose `/health` endpoints checking Mongo, Redis, and RMQ status and verify HTTP 200 responses.
- [x] 8.3 Write and execute the full E2E test suite (Agent -> RMQ -> Process -> Reports) verifying complete data flow.
- [x] 8.4 Simulate a Process crash before RabbitMQ ACK and verify via E2E that redelivered messages uphold the complete atomic transaction invariant safely.
