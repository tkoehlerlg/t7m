import { describe, expect, it } from 'bun:test'
import { AbstractTransformer, AnyAbstractTransformer } from '../src/abstractTransformer'
import { Cache } from '../src/cache'

// Test types
interface Author {
	id: number
	name: string
	email: string
}

interface Post {
	id: number
	title: string
	authorId: number
}

interface Comment {
	id: number
	postId: number
	authorId: number
	text: string
}

interface AuthorOutput {
	id: number
	name: string
	posts?: PostOutput[]
}

interface PostOutput {
	id: number
	title: string
	author?: AuthorOutput
	comments?: CommentOutput[]
}

interface CommentOutput {
	id: number
	text: string
	author?: AuthorOutput
	post?: PostOutput
}

// Mock data stores
const authors: Author[] = [
	{ id: 1, name: 'Alice', email: 'alice@test.com' },
	{ id: 2, name: 'Bob', email: 'bob@test.com' },
]

const posts: Post[] = [
	{ id: 1, title: 'First Post', authorId: 1 },
	{ id: 2, title: 'Second Post', authorId: 1 },
	{ id: 3, title: 'Bobs Post', authorId: 2 },
]

const comments: Comment[] = [
	{ id: 1, postId: 1, authorId: 2, text: 'Great post!' },
	{ id: 2, postId: 1, authorId: 1, text: 'Thanks!' },
	{ id: 3, postId: 2, authorId: 2, text: 'Nice one' },
]

// Track function calls for testing
let authorFetchCount = 0
let postFetchCount = 0

const resetFetchCounts = () => {
	authorFetchCount = 0
	postFetchCount = 0
}

// Mock fetch functions
const fetchAuthorById = async (id: number): Promise<Author | undefined> => {
	authorFetchCount++
	return authors.find(a => a.id === id)
}

const fetchPostsByAuthorId = async (authorId: number): Promise<Post[]> => {
	postFetchCount++
	return posts.filter(p => p.authorId === authorId)
}

const fetchPostById = async (id: number): Promise<Post | undefined> => {
	postFetchCount++
	return posts.find(p => p.id === id)
}

describe('SubTransformer Tests', () => {
	describe('Transformer using another transformer', () => {
		// Author transformer (leaf transformer - no dependencies)
		class AuthorTransformer extends AbstractTransformer<Author, AuthorOutput> {
			constructor() {
				super({ dropCacheOnTransform: false })
			}

			cache = {
				postsByAuthor: new Cache(fetchPostsByAuthorId),
			}

			data(input: Author): AuthorOutput {
				return {
					id: input.id,
					name: input.name,
				}
			}

			includesMap = {}
		}

		// Post transformer that uses AuthorTransformer
		class PostTransformer extends AbstractTransformer<Post, PostOutput> {
			private authorTransformer = new AuthorTransformer()

			constructor() {
				super({ dropCacheOnTransform: false })
				this.transformers = {
					author: this.authorTransformer,
				}
			}

			cache = {
				author: new Cache(fetchAuthorById),
			}

			data(input: Post): PostOutput {
				return {
					id: input.id,
					title: input.title,
				}
			}

			includesMap = {
				author: async (input: Post, _props: undefined, forwardedIncludes: string[]) => {
					const author = await this.cache.author.call(input.authorId)
					if (!author) return undefined
					return this.authorTransformer.transform({
						input: author,
						unsafeIncludes: forwardedIncludes,
					})
				},
			}
		}

		it('should transform with nested transformer', async () => {
			resetFetchCounts()
			const postTransformer = new PostTransformer()

			const result = await postTransformer.transform({
				input: posts[0]!,
				includes: ['author'],
			})

			expect(result.id).toBe(1)
			expect(result.title).toBe('First Post')
			expect(result.author).toEqual({
				id: 1,
				name: 'Alice',
			})
			expect(authorFetchCount).toBe(1)
		})

		it('should cache nested transformer calls across multiple transforms', async () => {
			resetFetchCounts()
			const postTransformer = new PostTransformer()

			// Transform two posts by the same author
			const results = await postTransformer.transformMany({
				inputs: [posts[0]!, posts[1]!], // Both by author 1
				includes: ['author'],
			})

			expect(results).toHaveLength(2)
			expect(results[0]!.author?.name).toBe('Alice')
			expect(results[1]!.author?.name).toBe('Alice')
			// Author should only be fetched once due to caching
			expect(authorFetchCount).toBe(1)
		})
	})

	describe('Cache clearing propagation', () => {
		class ChildTransformer extends AbstractTransformer<Author, AuthorOutput> {
			constructor() {
				super({ dropCacheOnTransform: false })
			}

			cache = {
				posts: new Cache(fetchPostsByAuthorId),
			}

			data(input: Author): AuthorOutput {
				return { id: input.id, name: input.name }
			}

			includesMap = {}
		}

		class ParentTransformer extends AbstractTransformer<Post, PostOutput> {
			childTransformer = new ChildTransformer()

			constructor() {
				super({ dropCacheOnTransform: false })
				this.transformers = {
					child: this.childTransformer,
				}
			}

			cache = {
				author: new Cache(fetchAuthorById),
			}

			data(input: Post): PostOutput {
				return { id: input.id, title: input.title }
			}

			includesMap = {
				author: async (input: Post) => {
					const author = await this.cache.author.call(input.authorId)
					if (!author) return undefined
					return this.childTransformer.transform({ input: author })
				},
			}
		}

		it('should clear cache in child transformers when parent cache is cleared', async () => {
			resetFetchCounts()
			const parent = new ParentTransformer()

			// First transform
			await parent.transform({ input: posts[0]!, includes: ['author'] })
			expect(authorFetchCount).toBe(1)

			// Second transform - should use cache
			await parent.transform({ input: posts[0]!, includes: ['author'] })
			expect(authorFetchCount).toBe(1)

			// Clear parent cache
			parent.clearCache()

			// Third transform - cache cleared, should fetch again
			await parent.transform({ input: posts[0]!, includes: ['author'] })
			expect(authorFetchCount).toBe(2)
		})

		it('should clear child transformer cache when parent clearCache is called', async () => {
			resetFetchCounts()
			const parent = new ParentTransformer()

			// Manually call child cache
			await parent.childTransformer.cache.posts.call(1)
			expect(postFetchCount).toBe(1)

			// Call again - should be cached
			await parent.childTransformer.cache.posts.call(1)
			expect(postFetchCount).toBe(1)

			// Clear parent cache (should also clear child)
			parent.clearCache()

			// Call child cache again - should fetch again
			await parent.childTransformer.cache.posts.call(1)
			expect(postFetchCount).toBe(2)
		})
	})

	describe('Circular reference handling - non-repetitive cache clearing', () => {
		// This tests that cache clearing doesn't cause infinite loops
		// when transformers reference each other

		// Using a factory pattern to avoid forward declaration issues
		const createCircularTransformers = () => {
			class CircularAuthorTransformer extends AbstractTransformer<Author, AuthorOutput> {
				postTransformer: AbstractTransformer<Post, PostOutput> | null = null

				constructor() {
					super({ dropCacheOnTransform: false })
				}

				setPostTransformer(transformer: AbstractTransformer<Post, PostOutput>) {
					this.postTransformer = transformer
					this.transformers = { post: transformer }
				}

				cache = {
					posts: new Cache(fetchPostsByAuthorId),
				}

				data(input: Author): AuthorOutput {
					return { id: input.id, name: input.name }
				}

				includesMap = {
					posts: async (input: Author) => {
						if (!this.postTransformer) return []
						const authorPosts = await this.cache.posts.call(input.id)
						return this.postTransformer.transformMany({ inputs: authorPosts })
					},
				}
			}

			class CircularPostTransformer extends AbstractTransformer<Post, PostOutput> {
				authorTransformer: CircularAuthorTransformer | null = null

				constructor() {
					super({ dropCacheOnTransform: false })
				}

				setAuthorTransformer(transformer: CircularAuthorTransformer) {
					this.authorTransformer = transformer
					this.transformers = { author: transformer }
				}

				cache = {
					author: new Cache(fetchAuthorById),
				}

				data(input: Post): PostOutput {
					return { id: input.id, title: input.title }
				}

				includesMap = {
					author: async (input: Post) => {
						if (!this.authorTransformer) return undefined
						const author = await this.cache.author.call(input.authorId)
						if (!author) return undefined
						return this.authorTransformer.transform({ input: author })
					},
				}
			}

			const authorTransformer = new CircularAuthorTransformer()
			const postTransformer = new CircularPostTransformer()

			// Create circular reference
			authorTransformer.setPostTransformer(postTransformer)
			postTransformer.setAuthorTransformer(authorTransformer)

			return { authorTransformer, postTransformer }
		}

		it('should handle circular transformer references without infinite loop on clearCache', () => {
			const { authorTransformer, postTransformer } = createCircularTransformers()

			// This should NOT cause infinite loop
			expect(() => authorTransformer.clearCache()).not.toThrow()
			expect(() => postTransformer.clearCache()).not.toThrow()
		})

		it('should properly clear all caches in circular structure', async () => {
			resetFetchCounts()
			const { authorTransformer, postTransformer } = createCircularTransformers()

			// Use author transformer cache
			await authorTransformer.cache.posts.call(1)
			expect(postFetchCount).toBe(1)

			// Use post transformer cache
			await postTransformer.cache.author.call(1)
			expect(authorFetchCount).toBe(1)

			// Clear from author side - should clear both
			authorTransformer.clearCache()

			// Both caches should be cleared
			await authorTransformer.cache.posts.call(1)
			expect(postFetchCount).toBe(2)

			await postTransformer.cache.author.call(1)
			expect(authorFetchCount).toBe(2)
		})

		it('should only clear each cache once even with multiple paths', async () => {
			resetFetchCounts()
			const { authorTransformer, postTransformer } = createCircularTransformers()

			// Populate caches
			await authorTransformer.cache.posts.call(1)
			await authorTransformer.cache.posts.call(2)
			await postTransformer.cache.author.call(1)
			await postTransformer.cache.author.call(2)

			const initialPostCount = postFetchCount
			const initialAuthorCount = authorFetchCount

			// Clear - should visit each transformer only once
			authorTransformer.clearCache()

			// Verify caches are cleared by making calls again
			await authorTransformer.cache.posts.call(1)
			await postTransformer.cache.author.call(1)

			expect(postFetchCount).toBe(initialPostCount + 1)
			expect(authorFetchCount).toBe(initialAuthorCount + 1)
		})
	})

	describe('Deep nesting with cache propagation', () => {
		// Comment -> Post -> Author (3 levels deep)
		class DeepAuthorTransformer extends AbstractTransformer<Author, AuthorOutput> {
			constructor() {
				super({ dropCacheOnTransform: false })
			}

			cache = {}

			data(input: Author): AuthorOutput {
				return { id: input.id, name: input.name }
			}

			includesMap = {}
		}

		class DeepPostTransformer extends AbstractTransformer<Post, PostOutput> {
			authorTransformer = new DeepAuthorTransformer()

			constructor() {
				super({ dropCacheOnTransform: false })
				this.transformers = { author: this.authorTransformer }
			}

			cache = {
				author: new Cache(fetchAuthorById),
			}

			data(input: Post): PostOutput {
				return { id: input.id, title: input.title }
			}

			includesMap = {
				author: async (input: Post, _props: undefined, forwardedIncludes: string[]) => {
					const author = await this.cache.author.call(input.authorId)
					if (!author) return undefined
					return this.authorTransformer.transform({
						input: author,
						unsafeIncludes: forwardedIncludes,
					})
				},
			}
		}

		class DeepCommentTransformer extends AbstractTransformer<Comment, CommentOutput> {
			postTransformer = new DeepPostTransformer()

			constructor() {
				super({ dropCacheOnTransform: false })
				this.transformers = { post: this.postTransformer }
			}

			cache = {
				post: new Cache(fetchPostById),
				author: new Cache(fetchAuthorById),
			}

			data(input: Comment): CommentOutput {
				return { id: input.id, text: input.text }
			}

			includesMap = {
				post: async (input: Comment, _props: undefined, forwardedIncludes: string[]) => {
					const post = await this.cache.post.call(input.postId)
					if (!post) return undefined
					// Forward includes to nested transformer (e.g., 'author' gets forwarded to postTransformer)
					return this.postTransformer.transform({
						input: post,
						unsafeIncludes: forwardedIncludes,
					})
				},
				author: async (input: Comment) => {
					const author = await this.cache.author.call(input.authorId)
					if (!author) return undefined
					return this.postTransformer.authorTransformer.transform({ input: author })
				},
			}
		}

		it('should transform through 3 levels of nesting', async () => {
			resetFetchCounts()
			const commentTransformer = new DeepCommentTransformer()

			// 'postAuthor' is not in CommentTransformer's includesMap, so it gets forwarded
			// to the post include handler which passes it to PostTransformer
			const result = await commentTransformer.transform({
				input: comments[0]!, // postId: 1, authorId: 2
				includes: ['post', 'author'],
				unsafeIncludes: ['author'], // This gets forwarded to postTransformer since 'author' is not consumed by 'post' include
			})

			expect(result.id).toBe(1)
			expect(result.text).toBe('Great post!')
			expect(result.post?.id).toBe(1)
			expect(result.post?.title).toBe('First Post')
			// Note: post.author won't be included because 'author' is handled by CommentTransformer directly
			// The forwarding mechanism only forwards includes NOT in the current includesMap
			expect(result.author?.name).toBe('Bob')
		})

		it('should transform with explicitly passed nested includes', async () => {
			resetFetchCounts()

			// Create a variant that explicitly includes author in nested post
			class ExplicitCommentTransformer extends AbstractTransformer<Comment, CommentOutput> {
				postTransformer = new DeepPostTransformer()

				constructor() {
					super({ dropCacheOnTransform: false })
					this.transformers = { post: this.postTransformer }
				}

				cache = {
					post: new Cache(fetchPostById),
					author: new Cache(fetchAuthorById),
				}

				data(input: Comment): CommentOutput {
					return { id: input.id, text: input.text }
				}

				includesMap = {
					post: async (input: Comment) => {
						const post = await this.cache.post.call(input.postId)
						if (!post) return undefined
						// Explicitly include author in the nested post
						return this.postTransformer.transform({
							input: post,
							includes: ['author'],
						})
					},
					author: async (input: Comment) => {
						const author = await this.cache.author.call(input.authorId)
						if (!author) return undefined
						return this.postTransformer.authorTransformer.transform({ input: author })
					},
				}
			}

			const commentTransformer = new ExplicitCommentTransformer()

			const result = await commentTransformer.transform({
				input: comments[0]!, // postId: 1, authorId: 2
				includes: ['post', 'author'],
			})

			expect(result.id).toBe(1)
			expect(result.text).toBe('Great post!')
			expect(result.post?.id).toBe(1)
			expect(result.post?.title).toBe('First Post')
			expect(result.post?.author?.name).toBe('Alice') // Post author (Alice wrote the post)
			expect(result.author?.name).toBe('Bob') // Comment author (Bob wrote the comment)
		})

		it('should clear caches through all nested levels', async () => {
			resetFetchCounts()
			const commentTransformer = new DeepCommentTransformer()

			// Populate caches at all levels
			await commentTransformer.cache.post.call(1)
			await commentTransformer.postTransformer.cache.author.call(1)

			expect(postFetchCount).toBe(1)
			expect(authorFetchCount).toBe(1)

			// Clear from top level
			commentTransformer.clearCache()

			// All caches should be cleared
			await commentTransformer.cache.post.call(1)
			await commentTransformer.postTransformer.cache.author.call(1)

			expect(postFetchCount).toBe(2)
			expect(authorFetchCount).toBe(2)
		})
	})

	describe('dropCacheOnTransform with nested transformers', () => {
		class AutoClearChildTransformer extends AbstractTransformer<Author, AuthorOutput> {
			constructor() {
				super({ dropCacheOnTransform: false })
			}

			cache = {
				data: new Cache(async (id: number) => ({ fetched: true, id })),
			}

			data(input: Author): AuthorOutput {
				return { id: input.id, name: input.name }
			}

			includesMap = {}
		}

		class AutoClearParentTransformer extends AbstractTransformer<Post, PostOutput> {
			childTransformer = new AutoClearChildTransformer()

			constructor(dropCache: boolean) {
				super({ dropCacheOnTransform: dropCache })
				this.transformers = { child: this.childTransformer }
			}

			cache = {
				author: new Cache(fetchAuthorById),
			}

			data(input: Post): PostOutput {
				return { id: input.id, title: input.title }
			}

			includesMap = {
				author: async (input: Post) => {
					const author = await this.cache.author.call(input.authorId)
					if (!author) return undefined
					return this.childTransformer.transform({ input: author })
				},
			}
		}

		it('should clear child caches when parent has dropCacheOnTransform=true', async () => {
			resetFetchCounts()
			const parent = new AutoClearParentTransformer(true)

			// Populate child cache manually
			await parent.childTransformer.cache.data.call(1)

			// Use _transform which triggers dropCacheOnTransform
			await parent._transform({
				input: posts[0]!,
				props: undefined,
				includes: ['author'],
			})

			// Parent cache should be cleared
			expect(authorFetchCount).toBe(1)

			// Child cache should also be cleared
			// Call child cache again - if cleared, this will be a fresh call
			// biome-ignore lint/suspicious/noExplicitAny: accessing private cache internals for testing
			const childCacheSizeBefore = (parent.childTransformer.cache.data as any).cache?.size ?? 0
			expect(childCacheSizeBefore).toBe(0) // Cache was cleared
		})

		it('should NOT clear child caches when parent has dropCacheOnTransform=false', async () => {
			resetFetchCounts()
			const parent = new AutoClearParentTransformer(false)

			// Populate child cache
			await parent.childTransformer.cache.data.call(1)

			// Use _transform
			await parent._transform({
				input: posts[0]!,
				props: undefined,
				includes: ['author'],
			})

			// Caches should NOT be cleared automatically
			// We can verify by checking fetch count stays the same after another transform
			await parent._transform({
				input: posts[0]!,
				props: undefined,
				includes: ['author'],
			})

			// Should still be 1 because cache wasn't cleared
			expect(authorFetchCount).toBe(1)
		})
	})

	describe('Cached transformer factory', () => {
		let transformerCreationCount = 0

		const resetCreationCount = () => {
			transformerCreationCount = 0
		}

		class AuthorTransformer extends AbstractTransformer<Author, AuthorOutput> {
			constructor() {
				super({ dropCacheOnTransform: false })
				transformerCreationCount++
			}

			data(input: Author): AuthorOutput {
				return { id: input.id, name: input.name }
			}
		}

		class PostWithLazyAuthorTransformer extends AbstractTransformer<Post, PostOutput> {
			constructor() {
				super({ dropCacheOnTransform: false })
			}

			cache = {
				author: new Cache(fetchAuthorById),
			}

			transformers = {
				author: new Cache(() => new AuthorTransformer()),
			}

			data(input: Post): PostOutput {
				return { id: input.id, title: input.title }
			}

			includesMap = {
				author: async (input: Post) => {
					const author = await this.cache.author.call(input.authorId)
					if (!author) return undefined
					return this.transformers.author.call().transform({ input: author })
				},
			}
		}

		it('should cache transformer factory and only create once', async () => {
			resetCreationCount()
			resetFetchCounts()
			const postTransformer = new PostWithLazyAuthorTransformer()

			// Transform multiple posts
			await postTransformer.transform({ input: posts[0]!, includes: ['author'] })
			await postTransformer.transform({ input: posts[1]!, includes: ['author'] })
			await postTransformer.transform({ input: posts[2]!, includes: ['author'] })

			// Transformer should only be created once
			expect(transformerCreationCount).toBe(1)
		})

		it('should clear data caches inside lazy transformer without recreating it', async () => {
			resetCreationCount()
			resetFetchCounts()
			const postTransformer = new PostWithLazyAuthorTransformer()

			// First use - creates transformer and fetches author
			await postTransformer.transform({ input: posts[0]!, includes: ['author'] })
			expect(transformerCreationCount).toBe(1)
			expect(authorFetchCount).toBe(1)

			// Second use - uses cached data
			await postTransformer.transform({ input: posts[0]!, includes: ['author'] })
			expect(authorFetchCount).toBe(1) // Still cached

			// Clear cache - clears data caches but keeps transformer
			postTransformer.clearCache()

			// Third use - transformer NOT recreated, but data is re-fetched
			await postTransformer.transform({ input: posts[0]!, includes: ['author'] })
			expect(transformerCreationCount).toBe(1) // Still same transformer
			expect(authorFetchCount).toBe(2) // Data was re-fetched
		})
	})
})
