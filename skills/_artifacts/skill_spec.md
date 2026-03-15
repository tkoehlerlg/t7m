# t7m — Skill Spec

t7m is a TypeScript library for transforming API output with type-safe includes, caching, and concurrency control. It ships as a framework-agnostic core with optional Hono middleware and Elysia plugin integrations.

## Domains

| Domain | Description | Skills |
| --- | --- | --- |
| framework-integration | Setting up t7m in a Hono or Elysia app | hono-integration, elysia-integration |
| transformer-authoring | Building transformers with data, includes, props, cache | build-transformer |
| production-ops | Tuning for production — concurrency, caching, Cloudflare | production-readiness |

## Skill Inventory

| Skill | Type | Domain | What it covers | Failure modes |
| --- | --- | --- | --- | --- |
| hono-integration | framework | framework-integration | t7mMiddleware, c.transform(), extras, query params, status codes | 4 |
| elysia-integration | framework | framework-integration | t7mPlugin, transform(), extras, query params, plain data return | 3 |
| build-transformer | core | transformer-authoring | AbstractTransformer, data(), includes, props, cache, nested transformers, concurrency | 6 |
| production-readiness | lifecycle | production-ops | concurrency limits, cache maxSize, clearCacheOnTransform, Cloudflare constraints | 3 |

## Failure Mode Inventory

### Hono Integration (4 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
| --- | --- | --- | --- | --- |
| 1 | Calling transformer.transform() instead of c.transform() | CRITICAL | src/hono/middleware.ts | — |
| 2 | Passing props as third argument instead of in extras | HIGH | src/hono/middleware.ts | — |
| 3 | Not registering middleware before routes | CRITICAL | src/hono/middleware.ts | — |
| 4 | Returning c.transform result inside c.json() | HIGH | src/hono/middleware.ts | — |

### Elysia Integration (3 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
| --- | --- | --- | --- | --- |
| 1 | Expecting a Response object like Hono | HIGH | src/elysia/plugin.ts | — |
| 2 | Passing extras when no props needed | MEDIUM | src/elysia/types.ts | — |
| 3 | Trying to set status codes in transform return | HIGH | src/elysia/plugin.ts | — |

### Build Transformer (6 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
| --- | --- | --- | --- | --- |
| 1 | Passing positional args instead of object | CRITICAL | CLAUDE.md | — |
| 2 | Using cache.get() instead of cache.call() | CRITICAL | CLAUDE.md | — |
| 3 | Putting required properties in includesMap | CRITICAL | CLAUDE.md | — |
| 4 | Passing clearCacheOnTransform to Cache constructor | HIGH | CLAUDE.md | — |
| 5 | Using transformers as an array | HIGH | CLAUDE.md | — |
| 6 | Setting includesConcurrency in constructor | HIGH | CLAUDE.md | — |

### Production Readiness (3 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
| --- | --- | --- | --- | --- |
| 1 | No concurrency limit on Cloudflare Workers | CRITICAL | maintainer interview | — |
| 2 | Expecting concurrency to limit single transform calls | HIGH | CLAUDE.md | — |
| 3 | Unbounded cache without maxSize | HIGH | src/lib/cache.ts | — |

## Tensions

| Tension | Skills | Agent implication |
| --- | --- | --- |
| Simplicity vs production safety | build-transformer ↔ production-readiness | Agent generates working transformers with zero production config |
| Type safety vs flexibility | build-transformer ↔ hono-integration | Agent adds type casts to bypass constraints instead of restructuring |

## Cross-References

| From | To | Reason |
| --- | --- | --- |
| hono-integration | build-transformer | Framework setup requires understanding transformer structure |
| elysia-integration | build-transformer | Same — transformer knowledge needed for route wiring |
| build-transformer | production-readiness | Transformers need production tuning before deployment |
| hono-integration | elysia-integration | Understanding differences prevents cross-contamination |

## Subsystems & Reference Candidates

| Skill | Subsystems | Reference candidates |
| --- | --- | --- |
| hono-integration | — | — |
| elysia-integration | — | — |
| build-transformer | — | — |
| production-readiness | — | — |

## Recommended Skill File Structure

- **Core skills:** build-transformer
- **Framework skills:** hono-integration, elysia-integration (each has `requires: [build-transformer]`)
- **Lifecycle skills:** production-readiness
- **Composition skills:** none needed (Hono and Elysia are peer deps, not companions)
- **Reference files:** none needed (API surface is small)

## Composition Opportunities

| Library | Integration points | Composition skill needed? |
| --- | --- | --- |
| Hono | t7mMiddleware, c.transform() | No — covered by hono-integration skill |
| Elysia | t7mPlugin, transform() | No — covered by elysia-integration skill |
