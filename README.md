# t7m - Transformer 🔄

The ultimate transformer library for Elysia and Hono.

## Core Goals 📚

- Simplify output transformation
- Maximize security
- Provide maximum flexibility
- Type safe transformations

## Concept 🧠

### Why t7m?

### Where to use t7m?

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
    id: number
    name: string
    email: string
}

// Public User
type PublicUser = Omit<User, 'id'>

class UserTransformer extends AbstractTransformer<User, PublicUser> {
    protected data(input: User): PublicUser {
        return {
            name: input.name,
            email: input.email,
        }
    }
}

const userTransformer = new UserTransformer()

const user: User = {
    id: 1,
    name: 'John Doe',
    email: 'john.doe@example.com',
}
const publicUser: PublicUser = await userTransformer.transform({ input: user }) // (:PublicUser is optional)

console.log(publicUser)
// Returns: { name: 'John Doe', email: 'john.doe@example.com' }
```

### Usage with Includes

```typescript
import { AbstractTransformer } from 't7m'

// DB User interface
interface User {
    id: number
    name: string
    email: string
}

type Post = {
    id: number
    title: string
    content: string
}

// Public User
type PublicUser = Omit<User, 'id'> & {
    posts?: Post[]
}

class UserTransformer extends AbstractTransformer<User, PublicUser> {
    protected data(input: User): PublicUser {
        return {
            name: input.name,
            email: input.email,
        }
    }

    protected includesMap = {
        // Transformer can also be nested
        posts: (input: User) => new PostTransformer().transform({ object: post }),
        // posts: (input: User) => [{ title: 'Post 1', content: 'Content 1' }],
    }
}

const userTransformer = new UserTransformer()

const user: User = {
    id: 1,
    name: 'John Doe',
    email: 'john.doe@example.com',
}
const publicUser: PublicUser = await userTransformer.transform({ input: user, includes: ['posts'] }) // (:PublicUser is optional)

console.log(publicUser)
// Returns: { name: 'John Doe', email: 'john.doe@example.com', posts: [{ title: 'Post 1', content: 'Content 1' }] }
```

### Usage with Props

You can use props to pass additional data to the transformer, for example a database connection. If you worry about performance on large datasets, I got you covered since all include functions run in parallel! Props can also be way more than just database connections with for example a redection parameter you can simply opt in or out for redacting sensitive data.

```typescript
import { AbstractTransformer } from 't7m'

// DB User interface
interface User {
    id: number
    name: string
    email: string
}

// DB Post interface
type Post = {
    id: number
    title: string
    content: string
}

// Public Post
type PublicPost = Omit<Post, 'id'>

// Public User
type PublicUser = Omit<User, 'id'> & {
    posts?: PublicPost[]
}

// Basic Post Transformer
class PostTransformer extends AbstractTransformer<Post, PublicPost> {
    protected data(input: Post): PublicPost {
        return {
            title: input.title,
            content: input.content,
        }
    }
}

// User Transformer Props type
type UserTransformerProps = {
    db: {
        posts: Post[]
    }
}

class UserTransformer extends AbstractTransformer<User, PublicUser, UserTransformerProps> {
    protected data(input: User, _props: UserTransformerProps): PublicUser {
        return {
            name: input.name,
            email: input.email,
        }
    }

    protected includesMap = {
        // Transformer can also be nested
        posts: async (input: User, props: UserTransformerProps) =>
            new PostTransformer().transformMany({ inputs: props.db.posts }),
        // posts: (input: User) => [{ title: 'Post 1', content: 'Content 1' }],
    }
}

// Mock database
const posts: Post[] = [{ id: 1, title: 'Post 1', content: 'Content 1' }]
const db = { posts }

// Creating a user transformer instance
const userTransformer = new UserTransformer()

// Transforming a user
const user: User = {
    id: 1,
    name: 'John Doe',
    email: 'john.doe@example.com',
}
const publicUser: PublicUser = await userTransformer.transform({
    input: user,
    includes: ['posts'],
    props: { db },
})

console.log(publicUser)
// Returns: { name: 'John Doe', email: 'john.doe@example.com', posts: [{ title: 'Post 1', content: 'Content 1' }] }
```

### Hono 🔥

```typescript
import { Hono } from 'hono'
import { t7mMiddleware } from 't7m/hono'

const app = new Hono()

app.use(t7mMiddleware())

app.get('/users', async c => {
    const users = await db.users
    return c.transformMany(users, new UserTransformer(), { status: 200 }) // status is optional; maps to c.json(transformedUsers, 200)
    // c.transform for single objects
})
```

### Elysia 🦊

To be developed. (In the next week)

## Performance 🏎️

I maximized performance by letting all include functions run in parallel. Async requests can simply be made in both include and data functions, as all functions are allowed to be async aswell and run concurrently. Notably, the data function executes before all include functions, allowing you to use its data in your include functions. This is a common pattern when you need to fetch additional data based on the transformed data.

Performance can also be increased if transformers are used multiple times by declaring them as a const and reusing them.

## Security 🛡️

This package is not only a transformer for easier output transformation, but also a helper to prevent common security issues like exposing sensitive data or database ids. It helps you to prevent these issues by letting u describe how to transform your data and then using it everywhere. The idea is that you ask yourself if you have to transform any data if you shouldn't write a transformer for it so you always use them and thereby prevent forgetting to transform sensitive data right or transforming data differently in different places.

## Props

Some props to me for writing this here ^^. If you'd like to learn more about me just go to my github profile: https://github.com/tkoehlerlg or google me (Torben Köhler, the redhead) and send me a message on LinkedIn or whatever we will use in the future.

## License

[MIT+NSR](LICENSE)
