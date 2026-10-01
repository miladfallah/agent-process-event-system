# Spec Delta

## Purpose

Provides management capabilities for creating, reading, updating, and deleting active business rules used to evaluate incoming events.

## ADDED Requirements

### Requirement: Rule Creation and Validation
The system SHALL allow authorized clients to create new rules containing conditions with supported operators (e.g., GT, LT, EQ).

#### Scenario: Valid rule creation
- **WHEN** a client submits a structurally valid rule with supported operators
- **THEN** the rule is persisted as active
- **THEN** an invalidation signal is broadcast to processing nodes

#### Scenario: Invalid operator
- **WHEN** a client submits a rule with an unsupported operator
- **THEN** the system rejects the request with a validation error

### Requirement: Rule Modification
The system SHALL allow clients to update the conditions or active status of existing rules.

#### Scenario: Rule deactivation
- **WHEN** a client updates an active rule to be inactive
- **THEN** future events are no longer evaluated against this rule
- **THEN** existing historical matches for this rule remain intact

### Requirement: Rule Pagination
The system SHALL return lists of rules using a paginated response structure.

#### Scenario: Requesting a page of rules
- **WHEN** a client requests a list of rules with limit and offset parameters
- **THEN** the system returns a subset of rules alongside total count metadata
