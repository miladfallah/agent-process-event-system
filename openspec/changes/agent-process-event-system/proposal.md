# Proposal

## Why

This system aims to reliably ingest sensor events from distributed Agents, evaluate them against active business rules, and provide fast reporting capabilities. The architecture satisfies the assignment requirements cleanly and efficiently using NestJS, RabbitMQ, MongoDB, and Redis, focusing on data integrity, fault recovery, and effectively-once processing logic without introducing unnecessary infrastructure.

## What Changes

- Create a new **Agent Service** that generates 5 sensor events/second using Faker.
- Create a new **Process Service** that evaluates these events against active rules and persists the results.
- Implement a **RabbitMQ topic-based message bus** connecting Agents and Process with delayed retry routing, DLQ, and manual acknowledgements.
- Establish **MongoDB** as the durable Source of Truth for raw Events, Rules, RuleMatches, and Leaderboard Counters.
- Introduce **Effectively-once processing** by wrapping Event insertion, RuleMatch insertions, and counter increments in a single atomic MongoDB transaction, guarded by a unique index on `eventId`.
- Introduce an **In-memory Rule Cache** synchronized globally via Redis Pub/Sub invalidations and persistent polling fallback to prevent stale evaluations.
- Construct a **Change Data Capture (CDC)** worker via MongoDB Change Streams to project durable leaderboard counters into a fast Redis Sorted Set read-model using idempotent absolute score updates (`ZADD ... GT`).
- Expose **Reporting APIs** for querying occurrence timestamps by bounded time range (API #1) and an all-time leaderboard of rule matches per Agent (API #2).
- Establish a complete Docker Compose topology including services, databases, RabbitMQ, and health checks.

## Capabilities

### New Capabilities

- `event-ingestion`: Handles the reception, validation, and durable storage of raw sensor events via RabbitMQ and MongoDB.
- `rule-evaluation`: Maintains an active in-memory rule cache and matches incoming events predictably.
- `rules-crud`: Provides management APIs (Create, Read, Update, Delete) for system rules with comprehensive validation and pagination.
- `reporting`: Provides optimized read models and APIs for both historical time-range queries and all-time leaderboards.

### Modified Capabilities

None. (New project architecture).

## Impact

- **Architecture:** Introduces RabbitMQ and MongoDB Change Streams.
- **Data:** Establishes explicit boundaries between payload data and transport envelopes to support idempotency tracking.
- **Operations:** Requires MongoDB to run as a Replica Set to support multi-document transactions and Change Streams.
- **Resilience:** Safely handles broker, database, cache, or application process crashes through transactional processing and idempotent projections.
