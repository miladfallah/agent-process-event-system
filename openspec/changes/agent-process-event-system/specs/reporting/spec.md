# Spec Delta

## Purpose

Provides highly optimized read models and APIs for both historical time-range queries and all-time leaderboards of rule occurrences.

## ADDED Requirements

### Requirement: Time-Range Occurrences Report
The system SHALL provide an API to query the occurrence timestamps of a specific rule grouped by agent, constrained to a maximum 24-hour window, returning results via a bounded, paginated response.

#### Scenario: Valid time-range query with pagination
- **WHEN** a client requests occurrences for Rule A between T1 and T2 (where T2-T1 <= 24h)
- **THEN** the system returns a bounded subset of timestamps grouped by agent, along with a cursor to fetch the next page of results

#### Scenario: Time-range exceeding limit
- **WHEN** a client requests occurrences for a window strictly greater than 24 hours
- **THEN** the system rejects the request with a validation error

### Requirement: All-Time Leaderboard Report
The system SHALL provide an API to query the total historical occurrences of a specific rule per agent, returning them ordered by highest count.

#### Scenario: Leaderboard query
- **WHEN** a client requests the leaderboard for Rule A
- **THEN** the system returns a descending ordered list of agents and their total occurrence counts

### Requirement: Leaderboard Projection Isolation
The system SHALL project durable leaderboard counters into a fast read model without coupling the ingestion flow to the read model's availability.

#### Scenario: Read model availability failure
- **WHEN** the fast read model (Redis) is temporarily offline
- **THEN** event ingestion and durable counting continue uninterrupted
- **THEN** the read model eventually synchronizes once it recovers via the resumable Change Stream
