# t7m Reference — Includes, Props, Cache, Nested Transformers

## Includes

Includes add optional related data to your output. Define handlers in `includesMap` — they only run when requested and execute in parallel via `Promise.all`.

```typescript
interface UserWithPosts extends PublicUser {
	posts?: { title: string }[]  // Must be optional (?)
}

class UserTransformer extends AbstractTransformer<User, UserWithPosts, { db: Database }> {
	async data(input: User, _props: { db: Database }): Promise<UserWithPosts> {
		return { name: input.name, email: input.email }
	}

	// Each function receives (input, props, forwardedIncludes)
	includesMap = {
		posts: async (input: User, props, forwardedIncludes) =>
			new PostTransformer().transformMany({
				inputs: await props.db.getPostsByUserId(input.id),
				unsafeIncludes: forwardedIncludes,
			}),
	}
}

await transformer.transform({ input: user, includes: ['posts'], props: { db } })
```

**Include constraint:** Only optional properties of `TOutput` can appear in `includesMap`. This is enforced at the type level via `OnlyPossiblyUndefined<TOutput>`.

### Unsafe Includes and Forwarding

For dynamic includes from user input (e.g., query strings), use `unsafeIncludes`. They're not type-checked but handled gracefully at runtime. Unhandled includes (not in your `includesMap`) are passed to include functions as `forwardedIncludes`, so you can forward them to nested transformers.

```typescript
await transformer.transform({
	input: user,
	includes: ['posts'],            // Type-safe
	unsafeIncludes: queryIncludes,   // Runtime includes from user input
	props: { db },
})
```

## Props

Props are the 3rd generic parameter on `AbstractTransformer`. They're available in both `data(input, props)` and include functions.

```typescript
interface TransformProps extends Record<string, unknown> {
	db: Database
	redactEmail: boolean
}

// AbstractTransformer<Input, Output, Props>
class UserTransformer extends AbstractTransformer<User, PublicUser, TransformProps> {
	data(input: User, props: TransformProps): PublicUser {
		return {
			name: input.name,
			email: props.redactEmail ? '***' : input.email,
		}
	}
}
```

**Conditional requirement:**
- No Props type defined (default) → `props` cannot be passed to `transform()`
- Props type defined → `props` is **required** in `transform()` and `transformMany()`

## Cache

Cache wraps any function and ensures calls with the same input resolve only once. Concurrent calls share the same promise.

```typescript
import { AbstractTransformer, Cache } from 't7m'

class CommentTransformer extends AbstractTransformer<Comment, PublicComment> {
	cache = {
		userProfile: new Cache((userId: string) => auth.getUser(userId)),
	}

	data(input: Comment): PublicComment {
		return { id: input.id, content: input.content }
	}

	includesMap = {
		author: async (input: Comment) => {
			// 20 comments with same userId = 1 auth call
			const user = await this.cache.userProfile.call(input.userId)
			return { name: user.name }
		},
	}
}
```

### Zero-Argument Functions

Useful for deferring transformer instantiation (e.g., avoiding circular dependencies):

```typescript
transformers = {
	child: new Cache(() => new ChildTransformer()),
}

includesMap = {
	children: (input) => this.transformers.child.call().transformMany({ inputs: input.children }),
}
```

### Object Arguments with Selective Keys

For object arguments, specify which keys to use for the cache key:

```typescript
const cached = new Cache(
	(params: { id: number; timestamp: number }) => db.users.findOne({ id: params.id }),
	'id' // Only cache on 'id', ignore 'timestamp'
)
// Multiple keys: new Cache(fn, 'id', 'type')
```

### Cache Lifecycle

- Cache lives on the transformer instance — reuse one instance per request
- No TTL. The Hono middleware clears caches after each response
- When calling `transform()`/`transformMany()` directly, call `clearCache()` yourself
- `clearCacheOnTransform` is set on `AbstractTransformer` via `super()`, **not** on `Cache`
- `transformMany()` processes all items in parallel via `Promise.all`, so duplicate cache calls across items are deduplicated

```typescript
constructor() {
	super({ clearCacheOnTransform: false }) // Disable auto-clear
}

// When not using the Hono middleware, clear cache manually
transformer.clearCache()
```

## Nested Transformers

Register nested transformers in `transformers` for cache clearing propagation. The parent clears all caches only after transformation completes.

```typescript
class PostTransformer extends AbstractTransformer<Post, PublicPost> {
	authorTransformer = new AuthorTransformer()

	// Record<string, Transformer | Cache<() => Transformer>>
	transformers = { author: this.authorTransformer }

	includesMap = {
		author: async (input) =>
			this.authorTransformer.transform({ input: await getAuthor(input.authorId) }),
	}
}
```

Circular references between transformers are handled safely — cache clearing uses cycle detection.

## Access Modifiers

| Member | Modifier | Notes |
|--------|----------|-------|
| `data(input, props)` | `protected abstract` | Never call from outside the class |
| `includesMap` | `protected readonly` | Initialize in the class body |
| `cache` | `public readonly` | Record of Cache instances |
| `transformers` | `public` (not readonly) | Record of nested transformers |

## `transform()` vs `_transform()`

- `transform()` / `transformMany()`: **Public API.** Props conditionally required. Use these in your application code.
- `_transform()` / `_transformMany()`: Used by Hono middleware internally. Props always required. Handles cache lifecycle (before/after hooks). Don't call these directly — the middleware does it for you.

## Type Utilities

Extract type information from transformer instances:

```typescript
import type { InputOf, OutputOf, PropsOf, IncludesOf } from 't7m'

type UserInput = InputOf<UserTransformer>     // User
type UserOutput = OutputOf<UserTransformer>   // PublicUser
type UserProps = PropsOf<UserTransformer>     // { db: Database }
type UserInc = IncludesOf<UserTransformer>    // 'posts' | 'avatar'
```

## Concurrency Control

By default, `transformMany` processes all items and includes in parallel via `Promise.all`. This is fast, but can overwhelm external services with rate limits or connection ceilings.

### When You Need This

- **Cloudflare Workers**: Hard limit of 6 concurrent subrequests per request
- **Auth providers** (Clerk, Auth0): Rate limits on API calls
- **Third-party APIs**: Connection ceilings, rate limiting

### When You Don't

- **Database with connection pooling** (e.g., Neon): The pool manages concurrency for you — no flood of parallel connections
- **In-memory lookups**: No external calls, no limits
- **Already-cached calls**: t7m's `Cache` deduplicates — 100 items with 20 unique authors = 20 actual calls

### Item-Level Concurrency

Limit how many items `transformMany` / `_transformMany` process in parallel:

```typescript
class CommentTransformer extends AbstractTransformer<Comment, PublicComment> {
	constructor() {
		super({ concurrency: 5 }) // 5 items at a time
	}
}
```

Does **not** apply to `transform()` / `_transform()` (single item — nothing to throttle).

### Per-Include Concurrency

Limit how many times a specific include runs concurrently. Unlike `concurrency`, per-include limits apply to **all** transform methods — both `transform()` and `transformMany()`:

```typescript
class CommentTransformer extends AbstractTransformer<Comment, PublicComment> {
	includesConcurrency = {
		author: 3, // Max 3 concurrent author lookups
	}

	includesMap = {
		author: async (input: Comment) => {
			const user = await auth.getUser(input.userId)
			return { name: user.name }
		},
	}
}
```

`includesConcurrency` is a **class property** (like `includesMap`), not a constructor param.

### Combined

```typescript
class CommentTransformer extends AbstractTransformer<Comment, PublicComment> {
	constructor() {
		super({ concurrency: 10 }) // 10 items in parallel
	}

	includesConcurrency = {
		author: 5, // Max 5 concurrent auth calls
	}

	// ...includesMap, cache, etc.
}
```

Limits are instance-level — shared across all calls on the same transformer instance.
