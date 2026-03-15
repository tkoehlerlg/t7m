---
name: production-readiness
description: >
  Configure t7m for production. Covers concurrency limits (constructor option
  for transformMany), includesConcurrency (class property for per-include
  throttling), Cache maxSize, clearCacheOnTransform tuning, Cloudflare Workers
  subrequest limits. Use before deploying t7m to production or Cloudflare.
type: lifecycle
library: t7m
library_version: '1.0.0'
requires:
  - build-transformer
sources:
  - 'tkoehlerlg/t7m:src/abstractTransformer.ts'
  - 'tkoehlerlg/t7m:src/lib/cache.ts'
  - 'tkoehlerlg/t7m:src/lib/semaphore.ts'
---

This skill builds on build-transformer. Read it first for how to create transformers.

# t7m — Production Readiness

## Setup

A production-ready transformer with concurrency limits, per-include throttling, and bounded caches:

```typescript
import { AbstractTransformer, Cache } from 't7m'

class UserTransformer extends AbstractTransformer<UserInput, UserOutput, Props> {
	constructor() {
		super({
			concurrency: 10,
			clearCacheOnTransform: true,
		})
	}

	includesConcurrency = {
		posts: 3,
		followers: 5,
	}

	cache = {
		profile: new Cache((id: string) => fetchProfile(id), { maxSize: 200 }),
	}

	protected data(input: UserInput, props: Props) {
		return { id: input.id, name: input.name }
	}

	protected readonly includesMap = {
		posts: async (input: UserInput, props: Props) => {
			return fetchPosts(input.id)
		},
		followers: async (input: UserInput, props: Props) => {
			return fetchFollowers(input.id)
		},
	}
}
```

## Core Patterns

### Concurrency limits for batch transforms

`concurrency` in the constructor limits parallel items in `transformMany` / `_transformMany`. It does NOT limit single `transform()` calls.

```typescript
class UserTransformer extends AbstractTransformer<UserInput, UserOutput> {
	constructor() {
		// Process max 10 users in parallel during transformMany
		super({ concurrency: 10 })
	}

	protected data(input: UserInput) {
		return { id: input.id, name: input.name }
	}
}

// This respects concurrency: 10
await transformer.transformMany({ inputs: users })

// This does NOT — each call runs independently
await Promise.all(users.map(u => transformer.transform({ input: u })))
```

### Per-include concurrency

`includesConcurrency` is a class property that limits concurrent executions of specific include functions. Applies to ALL transform methods (both single and batch).

```typescript
class PostTransformer extends AbstractTransformer<PostInput, PostOutput> {
	// Limit concurrent API calls per include type
	includesConcurrency = {
		author: 3,
		comments: 5,
	}

	protected readonly includesMap = {
		author: async (input: PostInput) => fetchAuthor(input.authorId),
		comments: async (input: PostInput) => fetchComments(input.id),
	}

	protected data(input: PostInput) {
		return { title: input.title }
	}
}
```

### Bounded caches

Set `maxSize` to prevent unbounded cache growth. Oldest entries are evicted when the limit is exceeded.

```typescript
cache = {
	userProfile: new Cache(
		(userId: string) => db.users.findUnique({ where: { id: userId } }),
		{ maxSize: 500 },
	),
	expensiveComputation: new Cache(
		(input: { type: string; region: string }) => compute(input),
		{ on: ['type', 'region'], maxSize: 100 },
	),
}
```

### Cloudflare Workers deployment

Cloudflare Workers have strict subrequest limits (6 concurrent, 50 total per invocation). Set `concurrency` low enough that your batch transforms stay within this budget.

```typescript
class ApiTransformer extends AbstractTransformer<ApiInput, ApiOutput> {
	constructor() {
		// Cloudflare: 6 concurrent / 50 total subrequests, keep concurrency low
		super({ concurrency: 5 })
	}

	includesConcurrency = {
		relatedItems: 2,
	}
}
```

## Common Mistakes

### CRITICAL No concurrency limit on Cloudflare Workers

Wrong:

```typescript
class UserTransformer extends AbstractTransformer<UserInput, UserOutput> {
	constructor() {
		super()
	}
}
// transformMany with 100 users = 100 parallel subrequests = Cloudflare error
```

Correct:

```typescript
class UserTransformer extends AbstractTransformer<UserInput, UserOutput> {
	constructor() {
		super({ concurrency: 5 })
	}
}
```

Cloudflare Workers have strict subrequest limits (6 concurrent, 50 total per invocation). Without concurrency limits, transformMany fires all items in parallel and exceeds this limit.

Source: maintainer interview

### HIGH Using Promise.all instead of transformMany for batches

Wrong:

```typescript
// concurrency: 5 is set but has no effect here
await Promise.all(users.map(u => transformer.transform({ input: u })))
```

Correct:

```typescript
// concurrency: 5 limits parallel processing
await transformer.transformMany({ inputs: users })
```

`concurrency` only throttles `transformMany` / `_transformMany`. Single `transform()` calls run independently and bypass the concurrency limit.

Source: src/abstractTransformer.ts

### HIGH Unbounded cache without maxSize on high-cardinality keys

Wrong:

```typescript
cache = {
	userProfile: new Cache((id: string) => fetchUser(id)),
}
```

Correct:

```typescript
cache = {
	userProfile: new Cache((id: string) => fetchUser(id), { maxSize: 500 }),
}
```

Without `maxSize`, the cache grows without limit. High-cardinality keys (user IDs, session tokens) cause memory issues in long-running processes.

Source: src/lib/cache.ts

See also: build-transformer/SKILL.md — for transformer creation patterns
