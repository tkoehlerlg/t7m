---
name: hono-integration
description: >
  Set up t7mMiddleware in a Hono app. Covers c.transform(), c.transformMany(),
  extras object (includes, wrapper, debug, props), query-based includes
  (?include=), status codes, and response headers. Use when wiring t7m into
  Hono routes or returning transformed API responses from Hono handlers.
type: framework
library: t7m
library_version: '1.0.0'
requires:
  - build-transformer
sources:
  - 'tkoehlerlg/t7m:src/hono/middleware.ts'
  - 'tkoehlerlg/t7m:src/hono/augment.ts'
  - 'tkoehlerlg/t7m:src/hono/types.ts'
---

This skill builds on build-transformer. Read it first for how to create transformers.

# t7m — Hono Integration

## Setup

```typescript
import { Hono } from 'hono'
import { t7mMiddleware } from 't7m/hono'

const app = new Hono()

// Register middleware BEFORE routes
app.use(t7mMiddleware)

app.get('/users/:id', async (c) => {
	const user = await getUser(c.req.param('id'))
	return c.transform(user, userTransformer)
})
```

## Core Patterns

### Return transformed single object

```typescript
app.get('/users/:id', async (c) => {
	const user = await db.users.findUnique({ where: { id: c.req.param('id') } })
	return c.transform(user, userTransformer)
})
```

### Return transformed array

```typescript
app.get('/users', async (c) => {
	const users = await db.users.findMany()
	return c.transformMany(users, userTransformer)
})
```

### Pass props when transformer requires them

```typescript
app.get('/users/:id', async (c) => {
	const user = await getUser(c.req.param('id'))
	return c.transform(user, userTransformer, {
		props: { db, currentUserId: c.get('userId') },
	})
})
```

### Query-based includes with wrapper and status code

Clients request includes via `?include=posts,comments`. The middleware parses this automatically.

```typescript
app.post('/users', async (c) => {
	const body = await c.req.json()
	const user = await createUser(body)
	return c.transform(user, userTransformer, {
		wrapper: (data) => ({ success: true, data }),
		debug: true,
	}, 201, { 'X-Created-By': 'api' })
})
```

The full signature is `c.transform(input, transformer, extras?, status?, headers?)`.

## Common Mistakes

### CRITICAL Calling transformer directly instead of c.transform()

Wrong:

```typescript
app.get('/users/:id', async (c) => {
	const user = await getUser(c.req.param('id'))
	return c.json(await userTransformer.transform({ input: user }))
})
```

Correct:

```typescript
app.get('/users/:id', async (c) => {
	const user = await getUser(c.req.param('id'))
	return c.transform(user, userTransformer)
})
```

Calling the transformer directly bypasses query param parsing for includes and returns untyped JSON instead of a typed response.

Source: src/hono/middleware.ts

### CRITICAL Not registering middleware before routes

Wrong:

```typescript
app.get('/users', async (c) => c.transform(users, transformer))
app.use(t7mMiddleware)
```

Correct:

```typescript
app.use(t7mMiddleware)
app.get('/users', async (c) => c.transform(users, transformer))
```

Hono applies middleware in registration order — routes registered before t7mMiddleware won't have c.transform() available.

Source: src/hono/middleware.ts

### HIGH Wrapping c.transform() result in c.json()

Wrong:

```typescript
return c.json(await c.transform(user, transformer))
```

Correct:

```typescript
return c.transform(user, transformer)
```

c.transform() already returns a typed JSON response — wrapping in c.json() double-serializes the output.

Source: src/hono/middleware.ts

### HIGH Passing props as direct argument instead of in extras

Wrong:

```typescript
return c.transform(user, transformer, { db })
```

Correct:

```typescript
return c.transform(user, transformer, { props: { db } })
```

The third argument is the extras object containing `props`, `includes`, `wrapper`, and `debug` — not the props value directly.

Source: src/hono/types.ts

See also: elysia-integration/SKILL.md — if switching frameworks, Elysia returns plain data instead of Response
See also: production-readiness/SKILL.md — configure concurrency and caching before deployment
