# t7m - Transform 🔄

The ultimate transformer library for Elysia and Hono.

## Core Goals 📚

- Simplify output transformation
- Maximize security
- Provide maximum flexibility
- Type safe transformations

## Concept 🧠

### Why t7m?

I created t7m because I was tired of writing the same transformation code over and over again. I also wanted to make it type safe and secure. Try it out and let me know what you think!

### Where to use t7m?

I recommend using t7m for any API that returns data from a database. It is especially useful for APIs that use includes to return related data. I focused on a serverless environment while building this library but it should work for any environment.

## Installation 📦

```bash
npm install t7m
# or
bun add t7m
```

Ready to go! 🚀

## Usage 🧑‍🚀

### Basic Usage

```typescript
// DB User interface
interface User {
  id: number;
  name: string;
  email: string;
}

// Public User
type PublicUser = Omit<User, "id">;

class UserTransformer extends AbstractTransformer<User, PublicUser> {
  data(input: User): PublicUser {
    return {
      name: input.name,
      email: input.email,
    };
  }
}

const userTransformer = new UserTransformer();

const user: User = {
  id: 1,
  name: "John Doe",
  email: "john.doe@example.com",
};
const publicUser: PublicUser = await userTransformer.transform({ input: user }); // (:PublicUser is optional)

console.log(publicUser);
// Returns: { name: 'John Doe', email: 'john.doe@example.com' }
```

### Usage with Includes

```typescript
import { AbstractTransformer } from "t7m";

// DB User interface
interface User {
  id: number;
  name: string;
  email: string;
}

type Post = {
  id: number;
  title: string;
  content: string;
};

// Public User
type PublicUser = Omit<User, "id"> & {
  posts?: Post[];
};

class UserTransformer extends AbstractTransformer<User, PublicUser> {
  data(input: User): PublicUser {
    return {
      name: input.name,
      email: input.email,
    };
  }

  includesMap = {
    // Transformer can also be nested
    posts: (input: User) => new PostTransformer().transform({ object: post }),
    // posts: (input: User) => [{ title: 'Post 1', content: 'Content 1' }],
  };
}

const userTransformer = new UserTransformer();

const user: User = {
  id: 1,
  name: "John Doe",
  email: "john.doe@example.com",
};
const publicUser: PublicUser = await userTransformer.transform({
  input: user,
  includes: ["posts"],
}); // (:PublicUser is optional)

console.log(publicUser);
// Returns: { name: 'John Doe', email: 'john.doe@example.com', posts: [{ title: 'Post 1', content: 'Content 1' }] }
```

### Usage with Unsafe Includes

**Don't worry about the name "unsafe" - it's perfectly safe to use!** The term "unsafe" simply means these includes are not type-checked at compile time, but t7m handles them gracefully at runtime.

```typescript
// Using unsafeIncludes for dynamic includes that come from a query for example
const publicUser: PublicUser = await userTransformer.transform({
  input: user,
  includes: ["posts"], // Type-safe includes
  unsafeIncludes: ["comments", "likes"], // Runtime includes (not type-checked)
});

// t7m automatically:
// - Removes duplicates between includes and unsafeIncludes
// - Passes unhandled includes to your include functions as forwardedIncludes (third parameter)
// - Handles missing include functions gracefully
```

Unsafe includes are useful when:
- You need dynamic includes based on user input
  - e.g. You're working with queries that return includes as strings
  - e.g. You're working with legacy code that uses string-based includes

The library automatically deduplicates includes and passes any unhandled includes to your include functions as `forwardedIncludes`. This parameter contains includes that weren't found in your `includesMap`, allowing you to handle them dynamically or pass them to nested transformers.

### Usage with Props

You can use props to pass additional data to the transformer, for example a database connection. If you worry about performance on large datasets, I got you covered since all include functions run in parallel! Props can also be way more than just database connections with for example a redection parameter you can simply opt in or out for redacting sensitive data.

```typescript
import { AbstractTransformer } from "t7m";

// DB User interface
interface User {
  id: number;
  name: string;
  email: string;
}

// DB Post interface
type Post = {
  id: number;
  title: string;
  content: string;
};

// Public Post
type PublicPost = Omit<Post, "id">;

// Public User
type PublicUser = Omit<User, "id"> & {
  posts?: PublicPost[];
};

// Basic Post Transformer
class PostTransformer extends AbstractTransformer<Post, PublicPost> {
  data(input: Post): PublicPost {
    return {
      title: input.title,
      content: input.content,
    };
  }
}

// User Transformer Props type
type UserTransformerProps = {
  db: {
    posts: Post[];
  };
};

class UserTransformer extends AbstractTransformer<
  User,
  PublicUser,
  UserTransformerProps
> {
  data(input: User, _props: UserTransformerProps): PublicUser {
    return {
      name: input.name,
      email: input.email,
    };
  }

  includesMap = {
    // Transformer can also be nested
    posts: async (input: User, props: UserTransformerProps, forwardedIncludes: string[]) =>
      new PostTransformer().transformMany({ inputs: props.db.posts }),
    // posts: (input: User) => [{ title: 'Post 1', content: 'Content 1' }],
  };
}

// Mock database
const posts: Post[] = [{ id: 1, title: "Post 1", content: "Content 1" }];
const db = { posts };

// Creating a user transformer instance
const userTransformer = new UserTransformer();

// Transforming a user
const user: User = {
  id: 1,
  name: "John Doe",
  email: "john.doe@example.com",
};
const publicUser: PublicUser = await userTransformer.transform({
  input: user,
  includes: ["posts"],
  unsafeIncludes: ["metadata"], // Optional: for dynamic includes like from a query
  props: { db },
});

console.log(publicUser);
// Returns: { name: 'John Doe', email: 'john.doe@example.com', posts: [{ title: 'Post 1', content: 'Content 1' }] }
```

### Hono 🔥

```typescript
import { Hono } from "hono";
import { t7mMiddleware } from "t7m/hono";

const app = new Hono();

app.use(t7mMiddleware());

app.call("/users", async (c) => {
  const users = await db.users;
  return c.transformMany(users, new UserTransformer(), { status: 200 }); // status is optional; maps to c.json(transformedUsers, 200)
  // c.transform for single objects
});
```

### Elysia 🦊

To be developed. (In the next week)

## Performance 🏎️

I maximized performance by letting all include functions run in parallel. Async requests can simply be made in both include and data functions, as all functions are allowed to be async aswell and run concurrently. Notably, the data function executes before all include functions, allowing you to use its data in your include functions. This is a common pattern when you need to fetch additional data based on the transformed data.

Performance can also be increased if transformers are used multiple times by declaring them as a const and reusing them.

## Security 🛡️

This package is not only a transformer for easier output transformation, but also a helper to prevent common security issues like exposing sensitive data or database ids. It helps you to prevent these issues by letting u describe how to transform your data and then using it everywhere. The idea is that you ask yourself if you have to transform any data if you shouldn't write a transformer for it so you always use them and thereby prevent forgetting to transform sensitive data right or transforming data differently in different places.

## Safety Features 🛡️

### Unsafe Includes - Actually Safe!

Despite the name, `unsafeIncludes` are completely safe to use. The "unsafe" designation simply means:
- **Not type-checked**: These includes aren't validated by TypeScript at compile time
- **Runtime handling**: They're processed dynamically during transformation
- **Graceful degradation**: Missing include functions won't crash your app

### Automatic Duplicate Handling

t7m automatically handles duplicate includes for you:
- Deduplicates between `includes` and `unsafeIncludes` arrays
- Ensures each include function runs only once per transformation
- Maintains performance by avoiding redundant operations

```typescript
// These duplicates are automatically handled
const result = await transformer.transform({
  input: user,
  includes: ["posts", "comments"],
  unsafeIncludes: ["posts", "metadata"], // "posts" won't run twice
});
```

### Error Handling

Include functions that throw errors are wrapped with descriptive error messages:
- Clear indication of which include function failed
- Original error message preserved
- Stack trace maintained for debugging

## Cache (Helper) 🗄️

### The Problem

When transforming data, you often need to enrich it with external information. Common examples:

- **Profile pictures** from your auth provider (Auth0, Clerk, Firebase)
- **User details** from an identity service
- **Related entities** from your database
- **Computed data** from external APIs

Imagine you're transforming a list of 100 comments. If 20 of those comments are from the same user, a naive implementation would call your auth provider 100 times - once per comment. But you really only need to fetch each unique user once!

This leads to:
- **Rate limiting** from external services (auth providers often have strict limits)
- **Unnecessary latency** from redundant network calls
- **Wasted resources** on duplicate database queries

### The Solution

`Cache` wraps any async function and ensures calls with the same input resolve only once. Concurrent calls share the same promise - no duplicate requests, no race conditions.

### Real-World Example: Profile Pictures

```typescript
import { AbstractTransformer, Cache } from "t7m";

// Your auth provider client
const auth = new AuthClient();

// DB Comment type
interface Comment {
  id: number;
  userId: string;
  content: string;
}

// Public Comment with enriched user data
interface PublicComment {
  id: number;
  content: string;
  author?: {
    name: string;
    avatarUrl: string;
  };
}

class CommentTransformer extends AbstractTransformer<Comment, PublicComment> {
  // Cache for fetching user profiles - keyed by userId
  cache = {
    userProfile: new Cache((userId: string) => auth.getUser(userId)),
  };

  data(input: Comment): PublicComment {
    return {
      id: input.id,
      content: input.content,
    };
  }

  includesMap = {
    author: async (input: Comment) => {
      // This is cached! If 20 comments have the same userId,
      // we only call auth.getUser() ONCE
      const user = await this.cache.userProfile.call(input.userId);
      return {
        name: user.name,
        avatarUrl: user.picture,
      };
    },
  };
}

// Transform 100 comments - but only fetch each unique user once!
const transformer = new CommentTransformer();
const publicComments = await transformer.transformMany({
  inputs: comments, // 100 comments, 20 unique users
  includes: ["author"],
});
// Result: Only 20 auth provider calls instead of 100!
```

### Cache Auto-Clear

By default, the transformer clears all caches after each `transform`/`transformMany` call. This prevents stale data between requests. You can disable this:

```typescript
class MyTransformer extends AbstractTransformer<Input, Output> {
  constructor() {
    super({ dropCacheOnTransform: false }); // Keep cache between transforms
  }
}

// Or manually clear when needed
transformer.clearCache();
```

### Basic Usage

```typescript
import { Cache } from "t7m";

// Cache an async function
const fetchUser = async (id: number) => db.users.findOne({ id });
const cachedFetchUser = new Cache(fetchUser);

// First call - executes the function
const user1 = await cachedFetchUser.call(1);

// Second call with same arg - returns cached promise
const user2 = await cachedFetchUser.call(1); // No DB query!
```

### Object Arguments

For object arguments, the cache key is generated from all object keys (sorted for consistency):

```typescript
const fetchUserByEmail = async (params: { email: string; tenantId: number }) =>
  db.users.findOne(params);
const cached = new Cache(fetchUserByEmail);

// Same cache hit regardless of key order
await cached.call({ email: "a@b.com", tenantId: 1 });
await cached.call({ tenantId: 1, email: "a@b.com" }); // Cache hit!
```

### Selective Cache Keys

Use rest params to specify which keys to use for the cache key:

```typescript
const fetchUser = async (params: { id: number; timestamp: number }) =>
  db.users.findOne({ id: params.id });

// Only cache on 'id', ignore 'timestamp'
const cached = new Cache(fetchUser, "id");

await cached.call({ id: 1, timestamp: 100 });
await cached.call({ id: 1, timestamp: 200 }); // Cache hit! (timestamp ignored)
```

### Concurrent Request Deduplication

The cache returns the same promise instance for concurrent calls:

```typescript
// All three calls share the same promise - only ONE auth call!
const [user1, user2, user3] = await Promise.all([
  cachedFetchUser.call("user-123"),
  cachedFetchUser.call("user-123"),
  cachedFetchUser.call("user-123"),
]);
```

## Props

Some props to me for writing this here ^^. If you'd like to learn more about me just go to my github profile: https://github.com/tkoehlerlg or google me (Torben Köhler, the redhead) and send me a message on LinkedIn or whatever we will use in the future.

## License

[MIT+NSR](LICENSE)
