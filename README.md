# Agent-Process Event System

## Architecture Overview

This project satisfies the high-throughput sensor event processing assignment by utilizing:
- **Agent Service**: A lightweight Faker-based event generator running independently, identifying itself via `AGENT_ID`.
- **Process Service**: A NestJS monolith that consumes events from RabbitMQ, evaluates them against an active in-memory Rules Engine, and reliably persists the results.
- **RabbitMQ**: The message broker decoupling the agents from the processor, providing at-least-once delivery, backpressure, and DLQ topologies.
- **MongoDB**: The durable Source of Truth. It leverages multi-document transactions to ensure that the Event, RuleMatches, and internal LeaderboardCounters are saved in an atomic, effectively-once operation.
- **Redis**: A fast read-model used for real-time leaderboards and Pub/Sub invalidations.
- **CDC Worker**: A background worker tailing MongoDB Change Streams to asynchronously and idempotently project leaderboard counts into Redis using absolute scores (`ZADD GT`).

## Project Setup

This project uses Docker Compose to provide all infrastructure required.

```bash
# Start infrastructure and services
docker-compose up --build
```

### Accessing Services
- **Process API**: `http://localhost:3000`
- **RabbitMQ Management**: `http://localhost:15672` (guest / guest)
- **MongoDB**: `mongodb://localhost:27017`

## API Usage

### Health Check
```bash
curl http://localhost:3000/health
```

### Rule CRUD
**Create a Rule:**
```bash
curl -X POST http://localhost:3000/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High Temp Warning",
    "conditions": [
      { "field": "value", "operator": "GT", "value": 80 }
    ],
    "isActive": true
  }'
```

**Get Active Rules:**
```bash
curl http://localhost:3000/rules
```

### Reporting APIs
**Time-Range Report (API #1):**
Retrieve events for a specific rule within a 24-hour window, grouped by agent.
```bash
curl "http://localhost:3000/reports/time-range/<RULE_ID>?startTime=2026-10-01T00:00:00Z&endTime=2026-10-01T23:59:59Z"
```

**Leaderboard Report (API #2):**
Retrieve the all-time leaderboard of agents triggering a specific rule.
```bash
curl http://localhost:3000/reports/leaderboard/<RULE_ID>
```

## Running Tests

Tests verify idempotency, MongoDB transaction integrity under simulated crashes, and CDC idempotency.

```bash
# Install dependencies
npm install

# Run E2E Tests
npm run test:e2e
```
