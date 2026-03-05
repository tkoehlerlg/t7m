# CLAUDE.md — t7m

TypeScript library for API output transformation. Dual export: `t7m` (core) + `t7m/hono` (middleware).

## Commands

| Command | Action |
|---------|--------|
| `bun test` | Run tests |
| `bun run build` | Build (tsc declarations + bun bundle) |
| `bun run lint` | Biome lint + check |
| `bun run format` | Biome format --write |
| `bun run typecheck` | tsc --noEmit |
| `bun run prepublishOnly` | format + build + test |

## Code Style (Biome)

- **Indent**: Tabs (width 4)
- **Quotes**: Single
- **Semicolons**: None
- **Line width**: 120 chars
- **Line endings**: LF
- **Arrow parens**: asNeeded (`x => x`, not `(x) => x`)
- **Trailing commas**: ES5
- **noExplicitAny**: warn — use `// biome-ignore lint/suspicious/noExplicitAny: reason` when needed

## Architecture

```
src/
├── abstractTransformer.ts    # Core transformer base class
├── types.ts                  # InputOf, OutputOf, PropsOf, IncludesOf
├── index.ts                  # Entry: t7m
├── lib/
│   ├── cache.ts              # Cache utility
│   ├── semaphore.ts          # Async semaphore for concurrency control
│   ├── types.ts              # OnlyPossiblyUndefined helper
│   └── log.ts                # Shared logging utility
├── hono/
│   ├── middleware.ts          # t7mMiddleware
│   ├── augment.ts             # Hono Context type augmentation
│   ├── types.ts               # Hono-specific types
│   └── index.ts               # Entry: t7m/hono
└── elysia/
    ├── plugin.ts              # Elysia plugin
    ├── types.ts               # Elysia-specific types
    └── index.ts               # Entry: t7m/elysia

tests/                         # Bun test runner
dist/                          # Build output (git-ignored)
```

## Critical Gotchas

### 1. `transform()` vs `_transform()`

- `transform()` / `transformMany()`: Public API. Props conditionally required.
- `_transform()` / `_transformMany()`: Used by Hono middleware. Props always required. Handles cache lifecycle.
- Don't confuse them — the Hono middleware calls `_transform()`, not `transform()`.

### 2. All transform methods take a params OBJECT

```typescript
// ✅ CORRECT
await transformer.transform({ input: user })
await transformer.transform({ input: user, includes: ['posts'], props: { db } })

// ❌ WRONG
await transformer.transform(user)
await transformer.transform(user, { includes: ['posts'] })
```

### 3. Cache uses `.call()`, not `.get()`

```typescript
// ✅ CORRECT
const user = await this.cache.userProfile.call(input.userId)
const child = this.transformers.child.call()  // zero-arg

// ❌ WRONG
this.cache.userProfile.get(input.userId)
```

### 4. `transformers` is a Record, not an array

```typescript
// ✅ CORRECT — Record<string, Transformer | Cache<() => Transformer>>
transformers = { author: this.authorTransformer }
transformers = { author: new Cache(() => new AuthorTransformer()) }

// ❌ WRONG
transformers = [this.authorTransformer]
```

### 5. `clearCacheOnTransform` is on AbstractTransformer, not Cache

```typescript
// ✅ CORRECT
constructor() {
  super({ clearCacheOnTransform: false })
}

// ❌ WRONG
new Cache(fn, { clearCacheOnTransform: false })
```

### 6. Access modifiers matter

- `data(input, props)` → `protected abstract` — never call from outside
- `includesMap` → `protected readonly` — initialize in class body
- `cache` → `public readonly`
- `transformers` → `public` (not readonly)

### 7. Includes only work with optional output properties

```typescript
type Output = {
  name: string       // Required — CANNOT be in includesMap
  avatar?: string    // Optional — CAN be in includesMap
}
// Enforced by OnlyPossiblyUndefined<TOutput>
```

### 8. Props conditional requirement

```typescript
// No Props type (default) → props cannot be passed
await transformer.transform({ input: user })

// Props type defined → props is REQUIRED
await transformer.transform({ input: user, props: { db } })
```

### 9. `concurrency` only applies to `transformMany` / `_transformMany`

- `concurrency` in constructor limits parallel items in batch methods only
- `transform()` and `_transform()` (single item) are NOT throttled by `concurrency`
- Per-include limits (`includesConcurrency`) apply to ALL transform methods
- The semaphore is instance-level: shared across all concurrent calls on the same instance

```typescript
// concurrency: 5 limits transformMany to 5 parallel items
// Does NOT limit concurrent transform() calls
class MyTransformer extends AbstractTransformer<In, Out> {
  constructor() {
    super({ concurrency: 5 })
  }

  // Per-include limits apply everywhere (transform + transformMany)
  includesConcurrency = {
    posts: 3,
  }
}
```

### 10. `includesConcurrency` is a class property, not constructor config

```typescript
// ✅ CORRECT — class property (like includesMap)
includesConcurrency = {
  posts: 3,
}

// ❌ WRONG — not a constructor param
constructor() {
  super({ includesConcurrency: { posts: 3 } }) // Does not exist
}
```

## Testing

- **Runner**: Bun (`bun test`)
- **Location**: `tests/`
- **Performance**: Thresholds loosened for CI (1000 items < 120ms)

## Git

- **Commit format**: `type: description` (lowercase) — e.g., `fix: loosen perf test threshold`
- **Main branch**: `main`
- **CI**: GitHub Actions, publishes on `v*` tags
