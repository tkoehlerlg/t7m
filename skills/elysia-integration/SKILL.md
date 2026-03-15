---
name: elysia-integration
description: >
  Set up t7mPlugin in an Elysia app. Covers transform(), transformMany(),
  extras object (includes, wrapper, debug, props), query-based includes
  (?include=), plain data return (not Response). Key difference from Hono:
  no status codes in transform, extras optional when no props. Use when
  wiring t7m into Elysia routes.
type: framework
library: t7m
library_version: '1.0.0'
requires:
  - build-transformer
sources:
  - 'tkoehlerlg/t7m:src/elysia/plugin.ts'
  - 'tkoehlerlg/t7m:src/elysia/types.ts'
---

This skill builds on build-transformer. Read it first for how to create transformers.

# t7m — Elysia Integration

## Setup

```typescript
import { Elysia } from 'elysia'
import { t7mPlugin } from 't7m/elysia'

const app = new Elysia()
	.use(t7mPlugin())
	.get('/users/:id', async ({ transform, params }) => {
		const user = await getUser(params.id)
		return transform(user, userTransformer)
	})
```

## Core Patterns

### Return transformed single object

```typescript
app.get('/users/:id', async ({ transform, params }) => {
	const user = await db.users.findUnique({ where: { id: params.id } })
	return transform(user, userTransformer)
})
```

### Return transformed array

```typescript
app.get('/users', async ({ transformMany }) => {
	const users = await db.users.findMany()
	return transformMany(users, userTransformer)
})
```

### Pass props when transformer requires them

```typescript
app.get('/users/:id', async ({ transform, params, store }) => {
	const user = await getUser(params.id)
	return transform(user, userTransformer, {
		props: { db, currentUserId: store.userId },
	})
})
```

### Query-based includes with wrapper

Clients request includes via `?include=posts,comments`. The plugin parses this automatically.

```typescript
app.get('/users/:id', async ({ transform, params }) => {
	const user = await getUser(params.id)
	return transform(user, userTransformer, {
		wrapper: (data) => ({ success: true, data }),
		debug: true,
	})
})
```

When the transformer has no Props type, extras is optional — you can call `transform(user, transformer)` without the third argument.

## Common Mistakes

### HIGH Expecting a Response object like Hono

Wrong:

```typescript
app.get('/users/:id', async ({ transform, params }) => {
	const user = await getUser(params.id)
	const response = await transform(user, transformer)
	return new Response(JSON.stringify(response))
})
```

Correct:

```typescript
app.get('/users/:id', async ({ transform, params }) => {
	const user = await getUser(params.id)
	return transform(user, transformer)
})
```

Elysia's transform() returns plain data — Elysia handles serialization. Wrapping in Response double-serializes.

Source: src/elysia/plugin.ts

### HIGH Trying to set status codes in transform call

Wrong:

```typescript
return transform(user, transformer, { status: 201 })
```

Correct:

```typescript
set.status = 201
return transform(user, transformer)
```

Unlike Hono, Elysia's transform has no status parameter. Use Elysia's `set.status` instead.

Source: src/elysia/plugin.ts

### MEDIUM Passing empty extras when no props needed

Wrong:

```typescript
return transform(user, transformer, {})
```

Correct:

```typescript
return transform(user, transformer)
```

When the transformer has no Props type, extras is optional. Passing an empty object is unnecessary noise.

Source: src/elysia/types.ts

### HIGH Passing props directly instead of in extras

Wrong:

```typescript
return transform(user, transformer, { db })
```

Correct:

```typescript
return transform(user, transformer, { props: { db } })
```

The third argument is the extras object containing `props`, `includes`, `wrapper`, and `debug` — not the props value directly.

Source: src/elysia/types.ts

See also: hono-integration/SKILL.md — if switching frameworks, Hono returns typed Response and supports status codes in transform
See also: production-readiness/SKILL.md — configure concurrency and caching before deployment
