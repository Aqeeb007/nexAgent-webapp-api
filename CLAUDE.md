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

**MVP first, then the documented V2 order — don't skip ahead of it.** The MVP flow in
[docs/MVP_REQUIREMENTS.md](./docs/MVP_REQUIREMENTS.md#mvp-definition-of-done) is complete and
live-verified, and Phase 5 (RAG) is now done too (see status below), so the "don't build this yet"
list is: Kubernetes, microservices, Kafka, a workflow engine, Background Jobs/BullMQ, or a full
observability stack, until the phases ahead of them in
[docs/ROADMAP.md#post-mvp-progression-v2-and-beyond](./docs/ROADMAP.md#post-mvp-progression-v2-and-beyond)
are done. If a request seems to call for something further down that list than the current phase,
flag it and point back to this file rather than building it.

## Current status (see docs/ROADMAP.md for detail)

MVP complete and live-verified: Phases 1–3 (Auth + Organizations, Agent Builder, Tool Builder) and
Phase 6 (chat + tool-calling loop, WebSocket streaming) are done. **Phase 5 — Knowledge Base
(RAG)** is also done and live-verified (2026-09-06): upload PDF → chunk → embed (pgvector) → store
→ search, wired into agent chat — see
[docs/ROADMAP.md](./docs/ROADMAP.md#phase-5--knowledge-base-rag) for detail. Local dev Postgres now
runs via `docker compose up -d` (`docker-compose.yml`, `pgvector/pgvector:pg16`) instead of a
native install, to get the pgvector extension binary. Next up per the post-MVP progression: the
Workflow Engine.

## Stack at a glance

NestJS + TypeScript · Drizzle ORM + PostgreSQL with pgvector (via Docker locally) · pnpm · JWT auth ·
Redis (planned) · OpenAI API · Next.js frontend (separate app, not in this repo).

## Commands

```bash
docker compose up -d # start local Postgres (pgvector/pgvector:pg16, port 5433)
pnpm start:dev      # run API in watch mode
pnpm test           # unit tests
pnpm test:e2e        # e2e tests
pnpm db:generate     # generate a Drizzle migration from schema changes
pnpm db:migrate      # apply migrations
pnpm db:studio       # browse the DB
```
