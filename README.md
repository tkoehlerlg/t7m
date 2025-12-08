# t7m - Transform 🔄

The ultimate transformer library for Elysia and Hono.

## Core Goals 📚

- Simplify output transformation
- Maximize security
- Provide maximum flexibility
- Type safe transformations

## Concept 🧠

### The Problem

Your database models contain sensitive data you shouldn't expose (IDs, passwords, internal flags). Every API endpoint needs to:
1. Strip sensitive fields
2. Optionally include related data (user's posts, comment's author)
3. Do this consistently everywhere

Without structure, you end up with transformation logic scattered across your codebase—easy to forget a field, expose something you shouldn't, or handle includes inconsistently.

### The Solution

t7m gives you a single place to define how each model transforms to its public form. Type-safe, consistent, with built-in support for optional includes and caching.

### Where to use t7m?

Any API returning database data. Especially useful for APIs with includes (related data). Built with serverless in mind, but works anywhere.

## Contents

- [Quick Start](#quick-start)
- [API Overview](#api-overview)
- [AbstractTransformer](#abstracttransformer)
- [Cache](#cache)
- [Framework Integration](#framework-integration)
- [Performance & Security](#performance--security)
- [Author](#author)

## API Overview

**AbstractTransformer:**
| Method | Description |
|--------|-------------|
| `data(input, props?)` | Core transformation logic (required) |
| `includesMap` | Define include handlers (optional) |
| `cache` | Define caches for data fetching (optional) |
| `transformers` | Register nested transformers for cache clearing (optional) |
| `transform({input, includes?, props?})` | Transform single object |
| `transformMany({inputs, includes?, props?})` | Transform array |
| `clearCache()` | Clear all caches |

**Cache:**
| Method | Description |
|--------|-------------|
| `new Cache(fn, ...keys?)` | Create cache (0 or 1 arg function) |
| `call(...args)` | Call cached function |
| `clear()` | Clear cache |

## Quick Start

```bash
npm install t7m
# or
bun add t7m
```

## AbstractTransformer

### Basic Usage

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

Includes let you optionally add related data to your output (like posts for a user, or author for a comment). Define handlers in `includesMap`—they only run when requested. All include functions run in parallel.

```typescript
// Third generic = Props type (passed to data and include functions)
class UserTransformer extends AbstractTransformer<User, PublicUser, { db: Database }> {
  data(input: User): PublicUser {
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

### Unsafe Includes

For dynamic includes from user input (e.g., query strings), use `unsafeIncludes`. They're not type-checked but handled gracefully at runtime:

```typescript
await transformer.transform({
  input: user,
  includes: ["posts"],           // Type-safe
  unsafeIncludes: queryIncludes, // Runtime includes
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

## Cache

### The Problem

When transforming data, you often need to enrich it with external information—profile pictures from Auth0, user details from an identity service, or related entities from your database.

Imagine transforming 100 comments where 20 are from the same user. A naive implementation would call your auth provider 100 times. You only need to fetch each unique user once!

### The Solution

`Cache` wraps any function and ensures calls with the same input resolve only once. Concurrent calls share the same promise—no duplicate requests, no race conditions.

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

Cache also supports 0-arg functions—useful for deferring transformer instantiation (e.g., to avoid circular dependencies or reduce startup cost):

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

### Object Arguments & Selective Keys

For object arguments, specify which keys to use for the cache key:

```typescript
const cached = new Cache(
  (params: { id: number; timestamp: number }) => db.users.findOne({ id: params.id }),
  "id" // Only cache on 'id', ignore 'timestamp'
);

await cached.call({ id: 1, timestamp: 100 });
await cached.call({ id: 1, timestamp: 200 }); // Cache hit!
```

### Cache Auto-Clear

By default, caches clear after each `transform`/`transformMany` call. Disable with:

```typescript
class MyTransformer extends AbstractTransformer<Input, Output> {
  constructor() {
    super({ dropCacheOnTransform: false });
  }
}
```

## Framework Integration

### Hono 🔥

```typescript
import { Hono } from "hono";
import { t7mMiddleware } from "t7m/hono";

const app = new Hono();

app.use(t7mMiddleware());

app.get("/users", async (c) => {
  const users = await db.users;
  return c.transformMany(users, new UserTransformer(), {}, 200);
  // c.transform(user, new UserTransformer(), {}, 200) for single objects
});
```

### Elysia 🦊

Coming soon.

## Performance & Security

**Performance:**
- All include functions run in parallel
- Async supported in both `data` and include functions
- Reuse transformer instances for better performance

**Security:**
- Prevents exposing sensitive data (like database IDs) by design
- Consistent transformation everywhere—no accidental data leaks
- Use transformers as the single source of truth for your API output

**Safety Features:**
- `unsafeIncludes` are safe—just not type-checked
- Automatic duplicate handling between `includes` and `unsafeIncludes`
- Include errors are wrapped with descriptive messages

## Author

Props to me for writing this here ^^. If you'd like to learn more about me just go to my github profile: https://github.com/tkoehlerlg or google me (Torben Köhler, the redhead) and send me a message on LinkedIn or whatever we will use in the future.

## License

[MIT+NSR](LICENSE)
