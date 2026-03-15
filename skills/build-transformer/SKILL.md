---
name: build-transformer
description: >
  Create t7m transformers with AbstractTransformer. Covers data() method,
  includesMap (optional output properties only), props (conditionally required),
  Cache with .call(), nested transformers record, clearCacheOnTransform,
  concurrency and includesConcurrency. Use when building or modifying any
  transformer class.
type: core
library: t7m
library_version: '1.0.0'
sources:
  - 'tkoehlerlg/t7m:src/abstractTransformer.ts'
  - 'tkoehlerlg/t7m:src/lib/cache.ts'
  - 'tkoehlerlg/t7m:src/lib/semaphore.ts'
  - 'tkoehlerlg/t7m:src/types.ts'
---

# t7m — Build Transformer

## Setup

```typescript
import { AbstractTransformer } from 't7m'

type UserInput = { id: string; firstName: string; lastName: string; avatarUrl: string | null }
type UserOutput = { id: string; fullName: string; avatar?: string }

class UserTransformer extends AbstractTransformer<UserInput, UserOutput> {
	protected data(input: UserInput) {
		return {
			id: input.id,
			fullName: `${input.firstName} ${input.lastName}`,
		}
	}
}

const userTransformer = new UserTransformer()
const result = await userTransformer.transform({ input: user })
```

All transform methods take a single params object: `{ input, includes?, props? }`.

## Core Patterns

### Add optional includes

Includes resolve optional output properties on demand. Only properties marked `?` in the output type can be includes.

```typescript
type PostOutput = { title: string; author?: AuthorOutput }

class PostTransformer extends AbstractTransformer<PostInput, PostOutput> {
	protected data(input: PostInput) {
		return { title: input.title }
	}

	protected readonly includesMap = {
		author: async (input: PostInput) => {
			const author = await db.users.findUnique({ where: { id: input.authorId } })
			return authorTransformer.transform({ input: author })
		},
	}
}

// Request includes when transforming
const post = await postTransformer.transform({ input: post, includes: ['author'] })
```

### Add required props

When a transformer needs external dependencies, define a Props type. Props become required in transform calls.

```typescript
type Props = { db: Database; currentUserId: string }

class UserTransformer extends AbstractTransformer<UserInput, UserOutput, Props> {
	protected data(input: UserInput, props: Props) {
		return {
			id: input.id,
			fullName: input.name,
			isCurrentUser: input.id === props.currentUserId,
		}
	}
}

// Props is now REQUIRED
await userTransformer.transform({ input: user, props: { db, currentUserId: '123' } })
```

### Set up caching

Cache uses `.call()` to invoke cached functions. Caches auto-clear between transform batches by default.

```typescript
import { AbstractTransformer, Cache } from 't7m'

class PostTransformer extends AbstractTransformer<PostInput, PostOutput> {
	cache = {
		authorProfile: new Cache((userId: string) => db.users.findUnique({ where: { id: userId } })),
	}

	protected async data(input: PostInput) {
		const author = await this.cache.authorProfile.call(input.authorId)
		return { title: input.title, authorName: author.name }
	}
}
```

Cache options: `{ on?: (keyof arg)[], maxSize?: number }`. Use `on` to specify cache key fields for object arguments.

### Nest transformers

Use the `transformers` record (not an array) to compose transformers. Nested transformer caches propagate clearing.

```typescript
class PostTransformer extends AbstractTransformer<PostInput, PostOutput> {
	transformers = {
		author: new AuthorTransformer(),
	}

	protected readonly includesMap = {
		author: async (input: PostInput) => {
			const author = await getAuthor(input.authorId)
			return this.transformers.author.transform({ input: author })
		},
	}

	protected data(input: PostInput) {
		return { title: input.title }
	}
}
```

You can also wrap nested transformers in Cache for lazy instantiation: `transformers = { author: new Cache(() => new AuthorTransformer()) }`.

## Common Mistakes

### CRITICAL Passing positional arguments to transform

Wrong:

```typescript
await transformer.transform(user)
await transformer.transform(user, { includes: ['posts'] })
```

Correct:

```typescript
await transformer.transform({ input: user })
await transformer.transform({ input: user, includes: ['posts'] })
```

All transform methods take a single params object — not positional arguments.

Source: src/abstractTransformer.ts

### CRITICAL Using cache.get() instead of cache.call()

Wrong:

```typescript
const user = await this.cache.userProfile.get(input.userId)
```

Correct:

```typescript
const user = await this.cache.userProfile.call(input.userId)
```

Cache exposes `.call()` to invoke the cached function. `.get()` does not exist.

Source: src/lib/cache.ts

### CRITICAL Putting required properties in includesMap

Wrong:

```typescript
type Output = { name: string; avatar: string }
// avatar is required — cannot be an include
includesMap = { avatar: async () => '...' }
```

Correct:

```typescript
type Output = { name: string; avatar?: string }
// avatar is optional — can be an include
includesMap = { avatar: async () => '...' }
```

Includes only work with optional output properties. This is enforced by `OnlyPossiblyUndefined<TOutput>` at the type level.

Source: src/lib/types.ts

### HIGH Passing clearCacheOnTransform to Cache constructor

Wrong:

```typescript
new Cache(fn, { clearCacheOnTransform: false })
```

Correct:

```typescript
class MyTransformer extends AbstractTransformer<In, Out> {
	constructor() {
		super({ clearCacheOnTransform: false })
	}
}
```

`clearCacheOnTransform` is an AbstractTransformer constructor option. Cache options are `{ on?, maxSize? }`.

Source: src/abstractTransformer.ts

### HIGH Using transformers as an array

Wrong:

```typescript
transformers = [this.authorTransformer]
```

Correct:

```typescript
transformers = { author: this.authorTransformer }
```

`transformers` is a `Record<string, AnyAbstractTransformer | Cache<() => AnyAbstractTransformer>>`, not an array.

Source: src/abstractTransformer.ts

### HIGH Setting includesConcurrency in constructor

Wrong:

```typescript
constructor() {
	super({ includesConcurrency: { posts: 3 } })
}
```

Correct:

```typescript
includesConcurrency = { posts: 3 }
```

`includesConcurrency` is a class property (like `includesMap`), not a constructor parameter.

Source: src/abstractTransformer.ts

### HIGH Tension: simplicity vs production safety

Default transformer config (no concurrency limits, `clearCacheOnTransform: true`) works for development but causes issues under load or on Cloudflare. Agents optimizing for clean code tend to skip production config because the defaults "just work" in dev.

See also: production-readiness/SKILL.md § Common Mistakes

See also: hono-integration/SKILL.md — for using transformers in Hono routes
See also: elysia-integration/SKILL.md — for using transformers in Elysia routes
