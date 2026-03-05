---
name: build-transformer
description: Build t7m transformers for API output transformation. Use when creating new transformers, adding includes, configuring cache, or wiring transformers into Hono routes.
---

# Building a t7m Transformer

t7m is a TypeScript transformer layer for APIs. One class per model controls what gets exposed, loads includes in parallel, and caches repeated calls.

## Quick Start

```typescript
import { AbstractTransformer } from 't7m'

// 1. Define your input and output types
interface User {
	id: number
	name: string
	email: string
	password: string
}

interface PublicUser {
	name: string
	email: string
}

// 2. Extend AbstractTransformer<Input, Output>
class UserTransformer extends AbstractTransformer<User, PublicUser> {
	// 3. Implement data() — the core transformation
	data(input: User): PublicUser {
		return {
			name: input.name,
			email: input.email,
		}
	}
}

// 4. Use it
const transformer = new UserTransformer()
const result = await transformer.transform({ input: user })
```

## Critical Rules

These are the most common mistakes. Follow them exactly.

### All transform methods take a params OBJECT

```typescript
// CORRECT
await transformer.transform({ input: user })
await transformer.transform({ input: user, includes: ['posts'], props: { db } })

// WRONG — never pass positional arguments
await transformer.transform(user)
```

### Includes only work with optional output properties

```typescript
type Output = {
	name: string    // Required — CANNOT be in includesMap
	avatar?: string // Optional — CAN be in includesMap
}
// Enforced by OnlyPossiblyUndefined<TOutput>
```

### Cache uses `.call()`, not `.get()`

```typescript
// CORRECT
const user = await this.cache.userProfile.call(input.userId)

// WRONG
this.cache.userProfile.get(input.userId)
```

### `transformers` is a Record, not an array

```typescript
// CORRECT
transformers = { author: this.authorTransformer }

// WRONG
transformers = [this.authorTransformer]
```

### `clearCacheOnTransform` is on AbstractTransformer, not Cache

```typescript
// CORRECT — pass to super()
constructor() {
	super({ clearCacheOnTransform: false })
}

// WRONG
new Cache(fn, { clearCacheOnTransform: false })
```

## Detailed Patterns

- For includes, props, cache, nested transformers, and access modifiers, see [reference.md](reference.md)
- For Hono middleware integration and route patterns, see [hono.md](hono.md)
