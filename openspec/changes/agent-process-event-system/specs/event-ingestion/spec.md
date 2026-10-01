# Spec Delta

## Purpose

Handles the reception, validation, and durable storage of raw sensor events via a message broker and database, ensuring effectively-once semantics.

## ADDED Requirements

### Requirement: Durable Event Ingestion
The system SHALL durably store received events in the primary data store before acknowledging successful receipt to the message broker.

#### Scenario: Successful ingestion
- **WHEN** a valid event is received from the message broker
- **THEN** the event is persisted to the database
- **THEN** the message is acknowledged to the broker

#### Scenario: Broker acknowledgement on failure
- **WHEN** event persistence fails due to a database outage
- **THEN** the message is NOT acknowledged to the broker

### Requirement: Atomic Processing Boundary
The system SHALL process an event by inserting the Event, inserting all corresponding RuleMatches, and incrementing all corresponding durable LeaderboardCounters within the exact same atomic database transaction.

#### Scenario: Transaction failure and retry
- **WHEN** the system crashes or a transaction fails before committing
- **THEN** the broker redelivers the unacknowledged message, allowing the entire atomic block to be safely re-attempted

### Requirement: Effectively-once Processing
The system SHALL prevent duplicate storage or duplicate processing of the same event if it is redelivered by the message broker, relying on a unique identifier to abort the duplicate transaction.

#### Scenario: Duplicate event redelivery
- **WHEN** an event with a previously seen eventId is redelivered
- **THEN** the database transaction immediately aborts via a duplicate key error
- **THEN** the system acknowledges the message to the broker without applying further side effects

### Requirement: Event Validation
The system SHALL reject malformed events that do not conform to the expected envelope or payload schema.

#### Scenario: Malformed event payload
- **WHEN** an event missing required fields (e.g., eventId) is received
- **THEN** the event is routed to a Dead Letter Queue (DLQ) for operational inspection
- **THEN** the message is acknowledged to remove it from the retry loop
