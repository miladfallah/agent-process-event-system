# Spec Delta

## Purpose

Evaluates incoming events against active rules using an in-memory cache and persists rule matches with absolute historical accuracy.

## ADDED Requirements

### Requirement: Active Rule Evaluation
The system SHALL evaluate every successfully ingested event against all currently active rules held in an in-memory cache.

#### Scenario: Event matches a rule
- **WHEN** an event's payload satisfies an active rule's conditions
- **THEN** a RuleMatch is generated linking the event and the rule

#### Scenario: Event does not match any rule
- **WHEN** an event's payload satisfies no active rule's conditions
- **THEN** no RuleMatch is generated
- **THEN** the event is still durably stored

### Requirement: Historical Accuracy of Matches
The system SHALL embed an immutable snapshot of the exact rule state used during evaluation into the resulting RuleMatch.

#### Scenario: Rule changes after match
- **WHEN** a rule is modified or deleted after a RuleMatch was created
- **THEN** the historical RuleMatch retains the original rule conditions used at the time of evaluation

### Requirement: Atomic Processing Boundary
The system SHALL persist the Event, its generated RuleMatches, and internal counter updates within a single atomic database transaction.

#### Scenario: Partial failure during processing
- **WHEN** the system crashes after persisting the Event but before persisting RuleMatches
- **THEN** the entire transaction rolls back
- **THEN** the message broker redelivers the event to be processed cleanly

### Requirement: Eventual Consistency of Rule Cache
The system SHALL synchronize the active rule cache across all processing nodes upon rule updates, using both fast notifications and persistent polling.

#### Scenario: Global rule update
- **WHEN** a rule is created or modified
- **THEN** all processing nodes reload their cache to reflect the new rule state
