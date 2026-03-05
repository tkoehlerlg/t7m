# t7m Hono Integration

## Setup

```typescript
import { Hono } from 'hono'
import { t7mMiddleware } from 't7m/hono'

const app = new Hono()
app.use(t7mMiddleware)
```

The middleware adds `c.transform()` and `c.transformMany()` to the Hono context.

## Route Patterns

### Single Object

```typescript
app.get('/users/:id', async (c) => {
	const user = await db.users.findOne(c.req.param('id'))
	return c.transform(user, new UserTransformer(), {}, 200)
})
```

### Array of Objects

```typescript
app.get('/users', async (c) => {
	const users = await db.users.findMany()
	return c.transformMany(users, new UserTransformer(), {}, 200)
})
```

## Automatic Query Parameter Parsing

The middleware automatically reads `?include=` from the query string and passes them as includes to the transformer. No additional code needed.

```
GET /users?include=posts,comments
// Automatically applies includes: ["posts", "comments"]
```

## The Extras Object (3rd Parameter)

The extras object supports these options:

| Option | Type | Description |
|--------|------|-------------|
| `includes` | `IncludesOf<T>[]` | Compile-time type-safe includes (used **instead of** query params). Both flow through the same internal path — the type safety is at the Hono API boundary. |
| `wrapper` | `(data) => O` | Wrap the response (e.g., `{ data: result }`) |
| `debug` | `boolean` | Enable colored console logging |
| `props` | `PropsOf<T>` | Props to pass to the transformer |

### With Props

When your transformer defines a Props type, pass `props` in the extras object:

```typescript
app.get('/users', async (c) => {
	const users = await db.users.findMany()
	return c.transformMany(users, new UserTransformer(), {
		props: { db, redactEmail: false },
	}, 200)
})
```

### With Wrapper and Debug

```typescript
app.get('/users', async (c) => {
	const users = await db.users.findMany()
	return c.transformMany(users, new UserTransformer(), {
		wrapper: (data) => ({ data, count: data.length }),
		debug: true,
	}, 200)
})
```

### With Type-Safe Includes

When you pass `includes` in extras, they override query params:

```typescript
app.get('/users', async (c) => {
	const users = await db.users.findMany()
	return c.transformMany(users, new UserTransformer(), {
		includes: ['posts', 'avatar'],
		props: { db },
	}, 200)
})
```

## Custom Headers

Pass custom HTTP headers as the 5th parameter:

```typescript
return c.transform(user, new UserTransformer(), {}, 200, {
	'X-Custom-Header': 'value',
})
```

## How It Works Internally

The middleware calls `_transform()` / `_transformMany()` (not `transform()` / `transformMany()`). These internal methods handle the cache lifecycle automatically — clearing caches after each response. You don't need to manage this yourself when using the middleware.
