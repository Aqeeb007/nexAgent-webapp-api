# NexAgent — webapp-api

AI Agent Platform backend (mini OpenAI Assistants + Zapier + LangGraph). This repo is the NestJS
API. Full context lives in [docs/](./docs) — read the relevant file before starting work, don't
re-derive it from scratch:

- [docs/PRODUCT_VISION.md](./docs/PRODUCT_VISION.md) — the long-term "why", full feature list,
  what this project is meant to teach. Reference only — not the current build target.
- [docs/MVP_REQUIREMENTS.md](./docs/MVP_REQUIREMENTS.md) — **the current build target.** Exact MVP
  feature list, MVP tech stack, MVP definition of done, explicit out-of-scope list.
- [docs/ROADMAP.md](./docs/ROADMAP.md) — phase-by-phase checklist with live status. Treat this as
  the task list. Update checkboxes as work lands.
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — module layout, request flow for chat +
  tool-calling, cross-cutting decisions (DI, config, multi-tenancy).
- [docs/DATABASE_SCHEMA.md](./docs/DATABASE_SCHEMA.md) — every table, built and planned, with
  column-level conventions to match.
- [docs/CONVENTIONS.md](./docs/CONVENTIONS.md) — stack facts and coding conventions actually in use
  in this repo (pnpm, Drizzle not Prisma, module structure, etc).

## The one rule that matters most

**MVP first.** Don't reach for Kubernetes, microservices, Kafka, a workflow engine, RAG/vector DB,
or a full observability stack until the MVP flow in
[docs/MVP_REQUIREMENTS.md](./docs/MVP_REQUIREMENTS.md#mvp-definition-of-done) works end to end. If
a request seems to call for one of these, flag it and point back to this file rather than building
it.

## Current status (see docs/ROADMAP.md for detail)

Phase 1 (Auth + Organizations) in progress: `users`, `organizations`, `organization_members`
tables exist; no auth endpoints, no RBAC role column, no API modules yet.

## Stack at a glance

NestJS + TypeScript · Drizzle ORM + PostgreSQL · pnpm · JWT auth (planned) · Redis (planned) ·
OpenAI API (planned) · Next.js frontend (separate app, not in this repo).

## Commands

```bash
pnpm start:dev      # run API in watch mode
pnpm test           # unit tests
pnpm test:e2e        # e2e tests
pnpm db:generate     # generate a Drizzle migration from schema changes
pnpm db:migrate      # apply migrations
pnpm db:studio       # browse the DB
```
