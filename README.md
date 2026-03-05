# t7m

[![npm version](https://img.shields.io/npm/v/t7m.svg)](https://www.npmjs.com/package/t7m) ![TypeScript 5+](https://img.shields.io/badge/TypeScript-5%2B-blue.svg) [![license](https://img.shields.io/badge/license-MIT--NSR-green.svg)](LICENSE)

APIs shouldn't return raw database models. Sensitive fields leak, related data loads slowly, and the same async call runs over and over.

t7m is a transformer layer that fixes this: one class per model controls what gets exposed, loads includes in parallel, and caches repeated calls.

Works with Hono (Elysia coming soon). No overhead — 1,000 objects with includes in under 100ms.

*t7m = t(ransfor)m - 7 letters between t and m*

## Quick Start

```bash
npm install t7m
# or
bun add t7m
```

```typescript
import { AbstractTransformer } from "t7m";

type User = { id: number; name: string; email: string; password: string };
type PublicUser = Omit<User, "id" | "password">;

class UserTransformer extends AbstractTransformer<User, PublicUser> {
  data(input: User): PublicUser {
    return { name: input.name, email: input.email };
  }
}

const transformer = new UserTransformer();
const user: User = { id: 1, name: "Alice", email: "alice@example.com", password: "secret" };
const result = await transformer.transform({ input: user });
// { name: "Alice", email: "alice@example.com" } - sensitive fields stripped!
```

## Why t7m?

### The Problem

Database models contain sensitive data you shouldn't expose (IDs, passwords, internal flags). Every API endpoint needs to strip fields, optionally include related data, and do this consistently. Without structure, transformation logic scatters across your codebase - easy to forget a field, expose something you shouldn't, or handle includes inconsistently.

### The Solution

t7m gives you a single place to define how each model transforms to its public form. Type-safe, consistent, with built-in support for optional includes and caching. Works anywhere - built with serverless in mind.

## Basic Usage

### Defining a Transformer

Extend `AbstractTransformer` and implement the `data` method:

```typescript
import { AbstractTransformer } from "t7m";

interface User {
  id: number;
  name: string;
  email: string;
}

type PublicUser = Omit<User, "id">;

// AbstractTransformer<Input, Output>
class UserTransformer extends AbstractTransformer<User, PublicUser> {
  data(input: User): PublicUser {
    return {
      name: input.name,
      email: input.email,
    };
  }
}

const transformer = new UserTransformer();

const user: User = { id: 1, name: "John Doe", email: "john.doe@example.com" };
const publicUser = await transformer.transform({ input: user });
// { name: 'John Doe', email: 'john.doe@example.com' }
```

### Includes

Includes let you optionally add related data to your output (like posts for a user, or author for a comment). Define handlers in `includesMap` - they only run when requested. All include functions run in parallel.

```typescript
// Third generic = Props type (passed to data and include functions)
interface UserWithPosts extends PublicUser {
  posts?: { title: string }[];
}

class UserTransformer extends AbstractTransformer<User, UserWithPosts, { db: Database }> {
  // data() can be async
  async data(input: User): Promise<UserWithPosts> {
    return { name: input.name, email: input.email };
  }

  includesMap = {
    posts: async (input: User, props) =>
      new PostTransformer().transformMany({ inputs: await props.db.getPostsByUserId(input.id) }),
  };
}

const transformer = new UserTransformer();
const publicUser = await transformer.transform({
  input: user,
  includes: ["posts"],
  props: { db },
});
// { name: "John", email: "...", posts: [{ title: "Hello" }, ...] }
```

### Props

Props are available in both `data(input, props)` and include functions `(input, props, forwardedIncludes)`. Common uses:
- Database connections
- Feature flags (e.g., `redactSensitiveData: boolean`)
- Request context

When your transformer defines a Props type, `props` becomes **required** in `transform()` and `transformMany()`. When no Props type is defined (the default), `props` cannot be passed.

### Unsafe Includes

For dynamic includes from user input (e.g., query strings), use `unsafeIncludes`. They're not type-checked but handled gracefully at runtime:

```typescript
await transformer.transform({
  input: user,
  includes: ["posts"],           // Type-safe
  unsafeIncludes: queryIncludes, // Runtime includes
  props: { db },
});
```

t7m automatically deduplicates includes. Unhandled includes (not in your `includesMap`) are passed to include functions as `forwardedIncludes`, so you can forward them to nested transformers:

```typescript
includesMap = {
  posts: async (input: User, props, forwardedIncludes) =>
    new PostTransformer().transformMany({
      inputs: await props.db.getPostsByUserId(input.id),
      unsafeIncludes: forwardedIncludes, // Forward "author", "comments", etc.
    }),
};

// Request includes: ["posts", "author"]
// → "posts" handled by UserTransformer (this includesMap)
// → "author" not in UserTransformer's includesMap, so forwarded to PostTransformer
```

## Type Utilities

t7m exports utility types for extracting type information from transformer instances. Useful for writing generic functions and framework integrations.

| Type | Description |
|------|-------------|
| `InputOf<T>` | Extract the input type from a transformer |
| `OutputOf<T>` | Extract the output type from a transformer |
| `PropsOf<T>` | Extract the props type from a transformer |
| `IncludesOf<T>` | Extract the available include keys from a transformer |

```typescript
import type { InputOf, OutputOf } from "t7m";

type UserInput = InputOf<UserTransformer>;   // User
type UserOutput = OutputOf<UserTransformer>; // PublicUser
```

## Cache

When transforming data, you often need to enrich it with external information. Cache wraps any function and ensures calls with the same input resolve only once. Concurrent calls share the same promise - no duplicate requests, no race conditions.

**Keep in mind:**
- Cache lives on the transformer instance — reuse one instance per request, don't create a new one each call
- There's no TTL. The Hono middleware clears caches after each response; when calling `transform()`/`transformMany()` directly, call `clearCache()` yourself (see [Cache Auto-Clear](#cache-auto-clear))

### Basic Usage

```typescript
import { AbstractTransformer, Cache } from "t7m";

class CommentTransformer extends AbstractTransformer<Comment, PublicComment> {
  cache = {
    userProfile: new Cache((userId: string) => auth.getUser(userId)),
  };

  data(input: Comment): PublicComment {
    return { id: input.id, content: input.content };
  }

  includesMap = {
    author: async (input: Comment) => {
      // Cached! 20 comments with same userId = 1 auth call
      const user = await this.cache.userProfile.call(input.userId);
      return { name: user.name, avatarUrl: user.picture };
    },
  };
}

// 100 comments, 20 unique users = only 20 auth calls!
const transformer = new CommentTransformer();
await transformer.transformMany({ inputs: comments, includes: ["author"] });
```

### Zero-Argument Functions

Cache supports 0-arg functions - useful for deferring transformer instantiation (e.g., to avoid circular dependencies or reduce startup cost):

```typescript
class ParentTransformer extends AbstractTransformer<Parent, PublicParent> {
  transformers = {
    child: new Cache(() => new ChildTransformer()),
  };

  includesMap = {
    children: (input) => this.transformers.child.call().transformMany({ inputs: input.children }),
  };
}
```

### Object Arguments and Selective Keys

For object arguments, specify which keys to use for the cache key:

```typescript
const cached = new Cache(
  (params: { id: number; timestamp: number }) => db.users.findOne({ id: params.id }),
  "id" // Only cache on 'id', ignore 'timestamp'
);

await cached.call({ id: 1, timestamp: 100 });
await cached.call({ id: 1, timestamp: 200 }); // Cache hit!
```

You can specify multiple keys: `new Cache(fn, "id", "type")`

### Cache Auto-Clear

By default, caches clear after each transformation when using the framework middleware. When using `transform()`/`transformMany()` directly, call `clearCache()` manually. Disable auto-clear with:

```typescript
class MyTransformer extends AbstractTransformer<Input, Output> {
  constructor() {
    super({ clearCacheOnTransform: false });
  }
}
```

### Nested Transformer Cache Clearing

Register nested transformers in `transformers` for cache clearing propagation. Parent clears all caches only after transformation completes - handled internally:

```typescript
class PostTransformer extends AbstractTransformer<Post, PublicPost> {
  authorTransformer = new AuthorTransformer();

  transformers = { author: this.authorTransformer };

  includesMap = {
    author: async (input) => this.authorTransformer.transform({ input: await getAuthor(input.authorId) }),
  };
}
```

Circular references between transformers are handled safely - cache clearing uses cycle detection to prevent infinite loops.

## Framework Integration

### Hono

#### Setup

```typescript
import { Hono } from "hono";
import { t7mMiddleware } from "t7m/hono";

const app = new Hono();
app.use(t7mMiddleware);
```

Basic route usage:

```typescript
app.get("/users", async (c) => {
  const users = await db.users;
  return c.transformMany(users, new UserTransformer(), {}, 200);
  // c.transform(user, new UserTransformer(), {}, 200) for single objects
});
```

#### Automatic Query Parameter Parsing

The middleware automatically reads `?include=` from the query string and passes them as includes to the transformer.

```
GET /users?include=posts,comments
// Automatically applies includes: ["posts", "comments"]
```

No additional code needed - just use the middleware.

#### Extras

The third parameter (`extras`) supports these options:

| Option | Type | Description |
|--------|------|-------------|
| `includes` | `IncludesOf<T>[]` | Type-safe includes (used instead of query params) |
| `wrapper` | `(data) => T` | Wrap the response (e.g., `{ data: result }`) |
| `debug` | `boolean` | Enable colored console logging for debugging |
| `props` | `PropsOf<T>` | Props to pass to the transformer |

Example with wrapper and debug:

```typescript
app.get("/users", async (c) => {
  const users = await db.users;
  return c.transformMany(users, new UserTransformer(), {
    wrapper: (data) => ({ data, count: data.length }),
    debug: true,
  }, 200);
});
```

Custom HTTP `headers` can be passed as the 5th parameter.

### Elysia

Elysia integration is in development.

## Performance

### Parallel Includes

All include functions run concurrently via `Promise.all`. If you have 3 includes that each take 50ms, the total is ~50ms, not 150ms.

### Cache Deduplication

Cache eliminates redundant calls by sharing the same promise across concurrent lookups:

```
100 comments, 20 unique authors
├─ Without cache:  100 auth.getUser() calls
└─ With cache:      20 auth.getUser() calls (5x reduction)
```

Concurrent calls with the same input don't even wait — they share a single in-flight promise, so there are no race conditions and no duplicate work.

### Benchmarks (from test suite)

| Scenario | Result |
|----------|--------|
| 1,000 objects + 2 includes each | < 100ms |
| 10,000 cached primitive lookups | microseconds per lookup |
| Cached vs uncached (1ms async op, 1,000 calls) | ~1ms cached vs ~1,000ms uncached |

## API Reference

### AbstractTransformer

| Member | Type | Description |
|--------|------|-------------|
| `data(input, props)` | `protected abstract` | Core transformation logic (must implement). Can return `TOutput` or `Promise<TOutput>`. |
| `includesMap` | `protected` | Map of include handlers. Each handler receives `(input, props, forwardedIncludes)`. |
| `cache` | `public readonly` | Record of Cache instances for data fetching. |
| `transformers` | `public` | Register nested transformers for cache clearing propagation. |
| `transform({input, includes?, unsafeIncludes?, props?*})` | `public` | Transform a single object. |
| `transformMany({inputs, includes?, unsafeIncludes?, props?*})` | `public` | Transform an array of objects. |
| `clearCache()` | `public` | Clear all caches (including nested transformers). |

\*`props` is required when the transformer defines a Props type, optional otherwise.

### Cache

| Method | Description |
|--------|-------------|
| `new Cache(fn, ...keys)` | Create a cache. `fn` must take 0 or 1 argument. `keys` specifies which object properties to use as cache key (optional, accepts multiple keys). |
| `call(...args)` | Call the cached function. Same-input calls return cached result. Concurrent calls share the same promise. |
| `clear()` | Clear all cached results. |

## Author

Created and maintained by [Torben Köhler](https://github.com/tkoehlerlg). Feel free to reach out via [GitHub](https://github.com/tkoehlerlg) or [LinkedIn](https://www.linkedin.com/in/torben-k%C3%B6hler-b79ab724a/).

## License

[MIT-NSR](LICENSE)
