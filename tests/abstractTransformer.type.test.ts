// Type-level tests for AbstractTransformer
import { AbstractTransformer } from '../src/abstractTransformer'

// Helper type for testing type equality
type Expect<T extends true> = T
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

// Test data types
interface User {
    id: number
    name: string
    email: string
    role: 'admin' | 'user'
}

interface Article {
    id: string
    title: string
    content: string
    authorId: number
    tags: string[]
}

interface PublicUser {
    name: string
    email: string
    avatar?: string
    profile?: {
        bio: string
        location: string
    }
    stats?: {
        posts: number
        followers: number
    }
}

interface PublicArticle {
    title: string
    excerpt: string
    author?: PublicUser
    tags?: string[]
    metadata?: {
        readTime: number
        wordCount: number
    }
}

// Test: Basic transformer type inference
class BasicTransformer extends AbstractTransformer<User, PublicUser> {
    protected data(input: User): PublicUser {
        return {
            name: input.name,
            email: input.email,
        }
    }
    
    protected override includesMap = {}
}

const basicInstance = new BasicTransformer()
const basicResult = basicInstance.transform({ input: { id: 1, name: 'test', email: 'test@test.com', role: 'user' } })

// Type tests for basic transformer
type test_BasicResult = Expect<Equal<typeof basicResult, PublicUser>>
type test_BasicTransformParams = Expect<Equal<Parameters<typeof basicInstance.transform>[0], {
    input: User
    includes?: never[]
    props?: undefined
}>>

// Test: Transformer with optional includes
class UserTransformerWithIncludes extends AbstractTransformer<User, PublicUser> {
    protected data(input: User): PublicUser {
        return {
            name: input.name,
            email: input.email,
        }
    }
    
    protected override includesMap = {
        avatar: (input: User) => `https://avatar.com/${input.id}`,
        profile: (input: User) => ({
            bio: `User ${input.name}`,
            location: 'Unknown',
        }),
        stats: (input: User) => ({
            posts: 0,
            followers: 0,
        }),
    }
}

const includesInstance = new UserTransformerWithIncludes()

// Type tests for includes
type test_IncludesKeys = Expect<Equal<Parameters<typeof includesInstance.transform>[0]['includes'], ('avatar' | 'profile' | 'stats')[] | undefined>>

// Test that non-optional properties cannot be included
interface StrictUser {
    id: number
    name: string // required
    email: string // required
    bio?: string // optional
}

class StrictTransformer extends AbstractTransformer<User, StrictUser> {
    protected data(input: User): StrictUser {
        return {
            id: input.id,
            name: input.name,
            email: input.email,
        }
    }
    
    protected override includesMap = {
        bio: (input: User) => `Bio for ${input.name}`,
        // The following would cause a type error:
        // name: (input: User) => input.name, // Error: 'name' is not optional
    }
}

const strictInstance = new StrictTransformer()
type test_StrictIncludes = Expect<Equal<Parameters<typeof strictInstance.transform>[0]['includes'], ('bio')[] | undefined>>

// Test: Transformer with required props
interface TransformProps extends Record<string, unknown> {
    locale: string
    timezone: string
}

class PropsTransformer extends AbstractTransformer<User, PublicUser, TransformProps> {
    protected data(input: User, props: TransformProps): PublicUser {
        return {
            name: input.name,
            email: input.email,
        }
    }
    
    protected override includesMap = {
        profile: (input: User, props: TransformProps) => ({
            bio: `User from ${props.locale}`,
            location: props.timezone,
        }),
    }
}

const propsInstance = new PropsTransformer()

// Type tests for props
type test_PropsRequired = Expect<Equal<Parameters<typeof propsInstance.transform>[0], {
    input: User
    includes?: ('profile' | 'avatar' | 'stats')[]
    props: TransformProps // Required, not optional
}>>

// Test: Complex nested transformation
interface ComplexOutput {
    id: string
    data: {
        title: string
        content: string
    }
    author?: PublicUser
    relatedArticles?: PublicArticle[]
    analytics?: {
        views: number
        likes: number
        shares: number
    }
}

class ComplexTransformer extends AbstractTransformer<Article, ComplexOutput, { includeAnalytics: boolean }> {
    protected data(input: Article, props: { includeAnalytics: boolean }): ComplexOutput {
        return {
            id: input.id,
            data: {
                title: input.title,
                content: input.content,
            }
        }
    }
    
    protected override includesMap = {
        author: (input: Article) => ({
            name: 'Author Name',
            email: 'author@example.com',
        }),
        relatedArticles: (input: Article) => [],
        analytics: (input: Article, props) => 
            props.includeAnalytics 
                ? { views: 100, likes: 10, shares: 5 }
                : { views: 0, likes: 0, shares: 0 },
    }
}

// Test: Multiple includes combination
const complexInstance = new ComplexTransformer()
const complexResult = complexInstance.transform({
    input: { id: '1', title: 'Test', content: 'Content', authorId: 1, tags: [] },
    props: { includeAnalytics: true },
    includes: ['author', 'analytics'],
})

type test_ComplexIncludes = Expect<Equal<typeof complexResult['author'], PublicUser | undefined>>
type test_ComplexAnalytics = Expect<Equal<typeof complexResult['analytics'], { views: number; likes: number; shares: number } | undefined>>

// Test: Transform many preserves types
const manyResults = includesInstance.transformMany({
    inputs: [
        { id: 1, name: 'User1', email: 'user1@test.com', role: 'user' as const },
        { id: 2, name: 'User2', email: 'user2@test.com', role: 'admin' as const },
    ],
    includes: ['avatar'],
})

type test_TransformManyResult = Expect<Equal<typeof manyResults, PublicUser[]>>

// Test: Empty includes behavior
class EmptyIncludesTransformer extends AbstractTransformer<User, PublicUser> {
    protected data(input: User): PublicUser {
        return {
            name: input.name,
            email: input.email,
        }
    }
    
    protected override includesMap = {} // No includes defined
}

const emptyIncludesInstance = new EmptyIncludesTransformer()
type test_EmptyIncludes = Expect<Equal<Parameters<typeof emptyIncludesInstance.transform>[0]['includes'], never[] | undefined>>

// Export type tests to ensure they're evaluated
export type TypeTests = {
    basicResult: test_BasicResult
    basicTransformParams: test_BasicTransformParams
    includesKeys: test_IncludesKeys
    strictIncludes: test_StrictIncludes
    propsRequired: test_PropsRequired
    complexIncludes: test_ComplexIncludes
    complexAnalytics: test_ComplexAnalytics
    transformManyResult: test_TransformManyResult
    emptyIncludes: test_EmptyIncludes
}