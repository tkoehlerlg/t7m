# t7m Elysia Integration

## Setup

```typescript
import { Elysia } from 'elysia'
import { t7mPlugin } from 't7m/elysia'

const app = new Elysia()
app.use(t7mPlugin())
```

The plugin injects `transform()` and `transformMany()` into every route handler via Elysia's `derive`.

## Route Patterns

### Single Object

```typescript
app.get('/users/:id', async ({ transform, params }) => {
	const user = await db.users.findOne(params.id)
	return transform(user, new UserTransformer())
})
```

### Array of Objects

```typescript
app.get('/users', async ({ transformMany }) => {
	const users = await db.users.findMany()
	return transformMany(users, new UserTransformer())
})
```

## Automatic Query Parameter Parsing

The plugin automatically reads `?include=` from the query string and passes them as includes to the transformer. No additional code needed.

```
GET /users?include=posts,comments
// Automatically applies includes: ["posts", "comments"]
```

## The Extras Object (3rd Parameter)

The extras object supports these options:

| Option | Type | Description |
|--------|------|-------------|
| `includes` | `IncludesOf<T>[]` | Compile-time type-safe includes (used **instead of** query params). Both flow through the same internal path — the type safety is at the API boundary. |
| `wrapper` | `(data) => T` | Wrap the response (e.g., `{ data: result }`) |
| `debug` | `boolean` | Enable colored console logging |
| `props` | `PropsOf<T>` | Props to pass to the transformer |

The extras parameter is **optional when your transformer has no Props type** — no empty `{}` needed.

### With Props

When your transformer defines a Props type, pass `props` in the extras object:

```typescript
app.get('/users', async ({ transformMany }) => {
	const users = await db.users.findMany()
	return transformMany(users, new UserTransformer(), {
		props: { db, redactEmail: false },
	})
})
```

### With Wrapper and Debug

```typescript
app.get('/users', async ({ transformMany }) => {
	const users = await db.users.findMany()
	return transformMany(users, new UserTransformer(), {
		wrapper: (data) => ({ data, count: data.length }),
		debug: true,
	})
})
```

### With Type-Safe Includes

When you pass `includes` in extras, they override query params:

```typescript
app.get('/users', async ({ transformMany }) => {
	const users = await db.users.findMany()
	return transformMany(users, new UserTransformer(), {
		includes: ['posts', 'avatar'],
		props: { db },
	})
})
```

## Key Difference from Hono

Elysia handlers return plain data — no `c.json()` equivalent. The plugin's `transform()` returns the transformed object directly. For status codes and headers, use Elysia's `set`:

```typescript
app.get('/users/:id', async ({ transform, set, params }) => {
	const user = await db.users.findOne(params.id)
	if (!user) {
		set.status = 404
		return { error: 'Not found' }
	}
	return transform(user, new UserTransformer())
})
```

## How It Works Internally

The plugin calls `_transform()` / `_transformMany()` (not `transform()` / `transformMany()`). These internal methods handle the cache lifecycle automatically — clearing caches after each response. You don't need to manage this yourself when using the plugin.
