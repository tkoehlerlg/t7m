import { describe, expect, it } from 'bun:test'
import { AbstractTransformer, AnyAbstractTransformer } from '../src/abstractTransformer'
import { Cache } from '../src/cache'

// ─── Test Data Types ────────────────────────────────────────────────

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

// ─── Mock Data ──────────────────────────────────────────────────────

const authors: Author[] = [
	{ id: 1, name: 'Alice', email: 'alice@test.com' },
	{ id: 2, name: 'Bob', email: 'bob@test.com' },
	{ id: 3, name: 'Charlie', email: 'charlie@test.com' },
]

const posts: Post[] = [
	{ id: 1, title: 'First Post', authorId: 1 },
	{ id: 2, title: 'Second Post', authorId: 1 },
	{ id: 3, title: 'Bobs Post', authorId: 2 },
	{ id: 4, title: 'Charlies Post', authorId: 3 },
]

const comments: Comment[] = [
	{ id: 1, postId: 1, authorId: 2, text: 'Great post!' },
	{ id: 2, postId: 1, authorId: 3, text: 'I agree!' },
	{ id: 3, postId: 3, authorId: 1, text: 'Nice one Bob' },
	{ id: 4, postId: 4, authorId: 1, text: 'Good stuff Charlie' },
]

// ─── Fetch Tracking ─────────────────────────────────────────────────

let authorFetchCount = 0
let postFetchCount = 0
let commentFetchCount = 0

const resetFetchCounts = () => {
	authorFetchCount = 0
	postFetchCount = 0
	commentFetchCount = 0
}

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

const fetchCommentsByPostId = async (postId: number): Promise<Comment[]> => {
	commentFetchCount++
	return comments.filter(c => c.postId === postId)
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('SubTransformer Deep Tests', () => {
	// ─── 1. 3-way circular references: A → B → C → A ───────────────
	describe('3-way circular references (A → B → C → A)', () => {
		const createTriangularTransformers = () => {
			class TriAuthorTransformer extends AbstractTransformer<Author, AuthorOutput> {
				postTransformer: AbstractTransformer<Post, PostOutput> | null = null

				constructor() {
					super({ clearCacheOnTransform: false })
				}

				setPostTransformer(t: AbstractTransformer<Post, PostOutput>) {
					this.postTransformer = t
					this.transformers = { post: t }
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

			class TriPostTransformer extends AbstractTransformer<Post, PostOutput> {
				commentTransformer: AbstractTransformer<Comment, CommentOutput> | null = null

				constructor() {
					super({ clearCacheOnTransform: false })
				}

				setCommentTransformer(t: AbstractTransformer<Comment, CommentOutput>) {
					this.commentTransformer = t
					this.transformers = { comment: t }
				}

				cache = {
					comments: new Cache(fetchCommentsByPostId),
				}

				data(input: Post): PostOutput {
					return { id: input.id, title: input.title }
				}

				includesMap = {
					comments: async (input: Post) => {
						if (!this.commentTransformer) return []
						const postComments = await this.cache.comments.call(input.id)
						return this.commentTransformer.transformMany({ inputs: postComments })
					},
				}
			}

			class TriCommentTransformer extends AbstractTransformer<Comment, CommentOutput> {
				authorTransformer: TriAuthorTransformer | null = null

				constructor() {
					super({ clearCacheOnTransform: false })
				}

				setAuthorTransformer(t: TriAuthorTransformer) {
					this.authorTransformer = t
					this.transformers = { author: t }
				}

				cache = {
					author: new Cache(fetchAuthorById),
				}

				data(input: Comment): CommentOutput {
					return { id: input.id, text: input.text }
				}

				includesMap = {
					author: async (input: Comment) => {
						if (!this.authorTransformer) return undefined
						const author = await this.cache.author.call(input.authorId)
						if (!author) return undefined
						return this.authorTransformer.transform({ input: author })
					},
				}
			}

			const authorT = new TriAuthorTransformer()
			const postT = new TriPostTransformer()
			const commentT = new TriCommentTransformer()

			// Wire up: Author → Post → Comment → Author
			authorT.setPostTransformer(postT)
			postT.setCommentTransformer(commentT)
			commentT.setAuthorTransformer(authorT)

			return { authorT, postT, commentT }
		}

		it('should handle 3-way circular clearCache without infinite loop', () => {
			const { authorT, postT, commentT } = createTriangularTransformers()

			// None of these should hang or throw
			expect(() => authorT.clearCache()).not.toThrow()
			expect(() => postT.clearCache()).not.toThrow()
			expect(() => commentT.clearCache()).not.toThrow()
		})

		it('should clear all caches across the 3-way circular graph', async () => {
			resetFetchCounts()
			const { authorT, postT, commentT } = createTriangularTransformers()

			// Populate caches at each node
			await authorT.cache.posts.call(1)
			await postT.cache.comments.call(1)
			await commentT.cache.author.call(2)

			expect(postFetchCount).toBe(1)
			expect(commentFetchCount).toBe(1)
			expect(authorFetchCount).toBe(1)

			// Clear from Author (should propagate: Author → Post → Comment → Author, stops)
			authorT.clearCache()

			// All caches should be invalidated
			await authorT.cache.posts.call(1)
			await postT.cache.comments.call(1)
			await commentT.cache.author.call(2)

			expect(postFetchCount).toBe(2)
			expect(commentFetchCount).toBe(2)
			expect(authorFetchCount).toBe(2)
		})

		it('should transform through the full 3-way chain', async () => {
			resetFetchCounts()
			const { authorT } = createTriangularTransformers()

			// Author → includes posts → each post includes comments → each comment includes author
			// We only go one level deep each time to avoid infinite recursion in includes
			const result = await authorT.transform({
				input: authors[0]!, // Alice
				includes: ['posts'],
			})

			expect(result.id).toBe(1)
			expect(result.name).toBe('Alice')
			expect(result.posts).toHaveLength(2)
			expect(result.posts![0]!.title).toBe('First Post')
			expect(result.posts![1]!.title).toBe('Second Post')
		})

		it('should transform with nested includes across the chain', async () => {
			resetFetchCounts()
			const { postT } = createTriangularTransformers()

			// Post → includes comments
			const result = await postT.transform({
				input: posts[0]!, // First Post (postId: 1)
				includes: ['comments'],
			})

			expect(result.id).toBe(1)
			expect(result.comments).toHaveLength(2)
			expect(result.comments![0]!.text).toBe('Great post!')
			expect(result.comments![1]!.text).toBe('I agree!')
		})
	})

	// ─── 2. _transformMany with nested transformers ─────────────────
	describe('_transformMany with nested transformers', () => {
		class BatchAuthorTransformer extends AbstractTransformer<Author, AuthorOutput> {
			constructor() {
				super({ clearCacheOnTransform: false })
			}

			cache = {}

			data(input: Author): AuthorOutput {
				return { id: input.id, name: input.name }
			}

			includesMap = {}
		}

		class BatchPostTransformer extends AbstractTransformer<Post, PostOutput> {
			authorTransformer = new BatchAuthorTransformer()

			constructor() {
				super({ clearCacheOnTransform: false })
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

		it('should propagate includes through _transformMany into nested transformers', async () => {
			resetFetchCounts()
			const postTransformer = new BatchPostTransformer()

			const results = await postTransformer._transformMany({
				inputs: [posts[0]!, posts[1]!, posts[2]!],
				props: undefined,
				includes: ['author'],
			})

			expect(results).toHaveLength(3)
			expect(results[0]!.author?.name).toBe('Alice')
			expect(results[1]!.author?.name).toBe('Alice')
			expect(results[2]!.author?.name).toBe('Bob')
		})

		it('should share cache across _transformMany batch for nested transformers', async () => {
			resetFetchCounts()
			const postTransformer = new BatchPostTransformer()

			// posts[0] and posts[1] share authorId: 1
			await postTransformer._transformMany({
				inputs: [posts[0]!, posts[1]!, posts[2]!],
				props: undefined,
				includes: ['author'],
			})

			// Author 1 (Alice) cached across first two, Author 2 (Bob) fetched once
			expect(authorFetchCount).toBe(2)
		})

		it('should handle _transformMany with empty inputs', async () => {
			const postTransformer = new BatchPostTransformer()

			const results = await postTransformer._transformMany({
				inputs: [],
				props: undefined,
				includes: ['author'],
			})

			expect(results).toEqual([])
		})

		it('should handle _transformMany with unsafeIncludes propagating to nested transformers', async () => {
			resetFetchCounts()
			const postTransformer = new BatchPostTransformer()

			// 'posts' is not in PostTransformer's includesMap, so it becomes a forwarded include
			// passed down to the author transformer via forwardedIncludes
			const results = await postTransformer._transformMany({
				inputs: [posts[0]!],
				props: undefined,
				includes: ['author'],
				unsafeIncludes: ['posts'],
			})

			expect(results).toHaveLength(1)
			expect(results[0]!.author?.name).toBe('Alice')
			// The 'posts' unsafeInclude is forwarded but AuthorTransformer has no includesMap entry for it,
			// so author.posts remains undefined
			expect(results[0]!.author?.posts).toBeUndefined()
		})
	})

	// ─── 3. Include function returning undefined ────────────────────
	describe('Include function returning undefined', () => {
		class UndefinedAuthorTransformer extends AbstractTransformer<Author, AuthorOutput> {
			constructor() {
				super({ clearCacheOnTransform: false })
			}

			data(input: Author): AuthorOutput {
				return { id: input.id, name: input.name }
			}

			includesMap = {}
		}

		class UndefinedPostTransformer extends AbstractTransformer<Post, PostOutput> {
			authorTransformer = new UndefinedAuthorTransformer()

			constructor() {
				super({ clearCacheOnTransform: false })
				this.transformers = { author: this.authorTransformer }
			}

			cache = {
				author: new Cache(fetchAuthorById),
			}

			data(input: Post): PostOutput {
				return { id: input.id, title: input.title }
			}

			includesMap = {
				author: async (input: Post) => {
					// Simulate author not found (e.g. deleted user)
					const author = await this.cache.author.call(input.authorId)
					if (!author) return undefined
					return this.authorTransformer.transform({ input: author })
				},
				comments: async (_input: Post): Promise<CommentOutput[] | undefined> => {
					// Explicitly return undefined to signal "no data"
					return undefined
				},
			}
		}

		it('should set the include key to undefined when the include function returns undefined for author', async () => {
			resetFetchCounts()
			const postTransformer = new UndefinedPostTransformer()

			// Use a post with an authorId that does not exist
			const orphanPost: Post = { id: 99, title: 'Orphan', authorId: 999 }

			const result = await postTransformer.transform({
				input: orphanPost,
				includes: ['author'],
			})

			expect(result.id).toBe(99)
			expect(result.title).toBe('Orphan')
			expect(result.author).toBeUndefined()
		})

		it('should set the include key to undefined when the include function explicitly returns undefined', async () => {
			const postTransformer = new UndefinedPostTransformer()

			const result = await postTransformer.transform({
				input: posts[0]!,
				includes: ['comments'],
			})

			expect(result.id).toBe(1)
			expect(result.title).toBe('First Post')
			expect(result.comments).toBeUndefined()
		})

		it('should handle mix of defined and undefined includes in a single transform', async () => {
			resetFetchCounts()
			const postTransformer = new UndefinedPostTransformer()

			// author will resolve (exists), comments will be undefined
			const result = await postTransformer.transform({
				input: posts[0]!, // authorId: 1 (Alice exists)
				includes: ['author', 'comments'],
			})

			expect(result.id).toBe(1)
			expect(result.author).toBeDefined()
			expect(result.author!.name).toBe('Alice')
			expect(result.comments).toBeUndefined()
		})

		it('should handle undefined includes in _transformMany batch', async () => {
			resetFetchCounts()
			const postTransformer = new UndefinedPostTransformer()

			const orphanPost: Post = { id: 99, title: 'Orphan', authorId: 999 }

			const results = await postTransformer._transformMany({
				inputs: [posts[0]!, orphanPost],
				props: undefined,
				includes: ['author'],
			})

			expect(results).toHaveLength(2)
			// First post has a valid author
			expect(results[0]!.author).toBeDefined()
			expect(results[0]!.author!.name).toBe('Alice')
			// Orphan post has no author
			expect(results[1]!.author).toBeUndefined()
		})
	})
})
