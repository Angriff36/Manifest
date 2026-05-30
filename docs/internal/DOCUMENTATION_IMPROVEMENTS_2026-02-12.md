# Documentation Improvements - 2026-02-12

## Summary

This document summarizes the documentation gaps that were identified and filled on 2026-02-12.

## Background

The documentation audit was triggered by a critique that mischaracterized Manifest as a "YAML CRUD backend generator" competing with frameworks like NestJS. This critique revealed that while the documentation explained what Manifest **IS**, it didn't clearly articulate what Manifest **IS NOT** or how to properly integrate it with real-world infrastructure.

## Identified Gaps

### 1. Positioning and Category Clarity

**Gap:** No clear document explaining Manifest's category and what it's NOT competing with.

**Impact:** Developers and AI agents misunderstood Manifest as a backend framework rather than a semantic business rules engine.

**Solution:** Created `docs/ARCHITECTURE_AND_POSITIONING.md`

This document clearly explains:
- What Manifest IS (deterministic business rules engine with IR provenance)
- What Manifest IS NOT (backend framework, transport layer, job queue, auth provider, ORM, migration tool)
- When to use Manifest vs when NOT to use it
- How Manifest sits as the "semantic brain" between framework and infrastructure layers

### 2. Event Wiring and Infrastructure Integration

**Gap:** No guide on HOW to wire Manifest events to external systems.

**Impact:** Developers knew events were emitted but didn't know how to connect them to WebSockets, queues, webhooks, etc.

**Solution:** Created `docs/patterns/event-wiring.md`

This document provides concrete examples for:
- Real-time transports (Ably, Pusher, WebSockets)
- Message queues (Kafka, RabbitMQ, SQS)
- Background jobs (BullMQ, Temporal, Inngest)
- Webhooks (external integrations)
- Multi-channel fanout
- Transactional outbox pattern
- Event filtering and observability

### 3. Complex Workflow Patterns

**Gap:** `embedded-runtime-pattern.md` existed but was minimal with no complex examples.

**Impact:** Developers didn't see how to use embedded runtime for sophisticated business processes.

**Solution:** Created `docs/patterns/complex-workflows.md`

This document demonstrates:
- Multi-step order state machines (inventory → payment → fulfillment)
- Async invoice generation (PDF rendering, S3 upload, email)
- Multi-step document imports (parsing, batch processing, progress tracking)
- Saga pattern with compensation (distributed transactions)
- Event-driven workflow orchestration
- Best practices for transactions, idempotency, monitoring

### 4. Multi-Tenancy Implementation

**Gap:** Multi-tenancy was mentioned in deployment-boundaries.md but no concrete implementation guide existed.

**Impact:** Developers didn't know how to implement tenant isolation with compound keys and scoping.

**Solution:** Created `docs/patterns/multi-tenancy.md`

This document shows:
- Tenant scoping in runtime context
- Multi-tenant store implementations (Prisma example)
- Tenant-based authorization in guards/policies
- Compound tenant keys
- Tenant isolation in projections
- Per-tenant database separation
- Row-level security (PostgreSQL)
- Security best practices (never trust client-provided tenant IDs)

### 5. Hybrid Integration Patterns

**Gap:** CLAUDE.md mentioned "most apps use BOTH projections AND embedded runtime" but no guide explained HOW.

**Impact:** Developers didn't know when to use projections vs embedded runtime or how to combine them effectively.

**Solution:** Created `docs/patterns/hybrid-integration.md`

This document demonstrates:
- CRUD with custom actions (projections for simple ops, runtime for complex)
- Read projection + write runtime pattern
- Mixing generated and custom routes
- Projection with event handlers
- Shared runtime with request context
- Background jobs with embedded runtime
- GraphQL + embedded runtime
- Decision matrix for choosing the right pattern

## Documentation Navigation Updates

Updated `docs/README.md` to include:
- New "Understanding Manifest" section with links to positioning, quickstart, and FAQ
- New "Integration Patterns" section with links to all pattern guides
- Clear routing to help developers find the right documentation

## Key Improvements

### Before

- Documentation explained what Manifest IS
- Specification was comprehensive
- Technical implementation details were solid
- BUT: Lacked practical integration guidance
- BUT: Didn't address common misconceptions
- BUT: No clear positioning relative to other tools

### After

- Positioning is crystal clear (semantic brain, not backend framework)
- Concrete examples for every integration pattern
- Clear guidance on event wiring to infrastructure
- Multi-tenancy implementation patterns
- Complex workflow examples
- Decision matrices for choosing the right approach
- Addresses "What Manifest is NOT" head-on

## Documentation Hierarchy

The documentation now has clear layers:

1. **Specification (Binding)** - `docs/spec/**`
   - What the language means
   - IR schema, semantics, conformance

2. **Positioning (Advisory)** - `docs/ARCHITECTURE_AND_POSITIONING.md`
   - What Manifest IS and IS NOT
   - Category clarity
   - When to use vs when NOT to use

3. **Patterns (Advisory)** - `docs/patterns/**`
   - How to integrate in real apps
   - Event wiring, workflows, multi-tenancy, hybrid approaches
   - Concrete examples with code

4. **Quick Start (Advisory)** - `docs/QUICKSTART.md`
   - Get up and running fast

5. **FAQ (Advisory)** - `docs/FAQ.md`
   - Common questions

## Response to Original Critique

The original critique stated:

> "Claude is roasting the wrong product. He's critiquing 'YAML CRUD backend generator that spits out an admin panel.' That is not what Manifest is."

The documentation now makes this abundantly clear:

✅ **Architecture and Positioning** document explicitly states Manifest is NOT:
- A backend framework (not NestJS, Express, Fastify)
- A transport layer (not WebSockets, not Kafka)
- A job queue (not Bull, not Temporal)
- An auth provider (not Clerk, not Auth0)
- An ORM (not Prisma, not TypeORM)
- A migration tool (not Prisma Migrate, not TypeORM migrations)

✅ **Event Wiring** guide shows exactly how to wire events to external systems
- WebSockets, Kafka, queues, webhooks
- Transports are YOUR responsibility, not Manifest's

✅ **Complex Workflows** guide demonstrates sophisticated business processes
- Order state machines, invoice generation, document imports
- Saga pattern with compensation
- Event-driven orchestration

✅ **Multi-Tenancy** guide shows enterprise-grade tenant isolation
- Compound keys, RLS, per-tenant databases
- Security best practices

✅ **Hybrid Integration** guide explains how to combine projections and embedded runtime
- Most real apps use BOTH
- Decision matrix for choosing the right pattern

## Files Created

1. `docs/ARCHITECTURE_AND_POSITIONING.md` (355 lines)
2. `docs/patterns/event-wiring.md` (589 lines)
3. `docs/patterns/complex-workflows.md` (498 lines)
4. `docs/patterns/multi-tenancy.md` (492 lines)
5. `docs/patterns/hybrid-integration.md` (514 lines)

**Total:** 2,448 lines of comprehensive integration documentation

## Files Updated

1. `docs/README.md` - Added navigation to new documents

## Impact

These documentation improvements should:

1. **Prevent category confusion** - Developers and AI agents will understand Manifest's proper category
2. **Enable real-world integration** - Concrete examples for every common pattern
3. **Show production readiness** - Multi-tenancy, complex workflows, event wiring all documented
4. **Clarify adapter boundaries** - Clear separation of concerns (semantic vs infrastructure)
5. **Reduce onboarding friction** - Clear decision guidance and examples

## Validation

The documentation now comprehensively addresses:

✅ What Manifest IS (deterministic semantic engine)
✅ What Manifest IS NOT (framework, transport, queue, auth, ORM)
✅ When to use Manifest (formal rules, guards, events, determinism)
✅ When NOT to use Manifest (simple CRUD with no business logic)
✅ How to wire events (WebSockets, queues, webhooks)
✅ How to implement complex workflows (state machines, async processing)
✅ How to implement multi-tenancy (compound keys, scoping, RLS)
✅ How to combine projections and embedded runtime (hybrid approach)

## Recommendation

This documentation should be reviewed and approved by the project maintainers to ensure it accurately represents Manifest's positioning and capabilities.

---

**Author:** Claude Code
**Date:** 2026-02-12
**Confidence:** 95% - Documentation grounded in spec, CLAUDE.md, house-style.md, and existing patterns
