/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it } from 'bun:test'
import { AbstractTransformer } from '../src/abstractTransformer'
import { Cache } from '../src/cache'

// Test data types
interface User {
	id: number
	name: string
	email: string
	role: string
}

interface PublicUser {
	name: string
	email: string
	avatar?: string
	// biome-ignore lint/suspicious/noExplicitAny: Just for this test case
	metadata?: Record<string, any>
}

interface TransformProps extends Record<string, unknown> {
	includeAvatar: boolean
	avatarSize: number
}

// Basic transformer without props or includes
class BasicUserTransformer extends AbstractTransformer<User, PublicUser> {
	data(input: User): PublicUser {
		return {
			name: input.name,
			email: input.email,
		}
	}

	includesMap = {}
}

// Transformer with optional includes
class UserTransformerWithIncludes extends AbstractTransformer<User, PublicUser> {
	data(input: User): PublicUser {
		return {
			name: input.name,
			email: input.email,
		}
	}

	includesMap = {
		avatar: (input: User) => `https://avatar.com/${input.id}`,
		metadata: (input: User) => ({ role: input.role, id: input.id }),
	}
}

// Transformer with props
class UserTransformerWithProps extends AbstractTransformer<User, PublicUser, TransformProps> {
	data(input: User, props: TransformProps): PublicUser {
		const result: PublicUser = {
			name: input.name,
			email: input.email,
		}

		if (props.includeAvatar) {
			result.avatar = `https://avatar.com/${input.id}?size=${props.avatarSize}`
		}

		return result
	}

	includesMap = {
		metadata: (input: User, props: TransformProps) => ({
			role: input.role,
			avatarSize: props.avatarSize,
		}),
	}
}

describe('AbstractTransformer', () => {
	const testUser: User = {
		id: 1,
		name: 'John Doe',
		email: 'john@example.com',
		role: 'admin',
	}

	const testUsers: User[] = [
		testUser,
		{
			id: 2,
			name: 'Jane Smith',
			email: 'jane@example.com',
			role: 'user',
		},
	]

	describe('Basic transformation', async () => {
		const transformer = new BasicUserTransformer()

		it('should transform a single input', async () => {
			const result = await transformer.transform({ input: testUser })

			expect(result).toEqual({
				name: 'John Doe',
				email: 'john@example.com',
			})
		})

		it('should transform multiple inputs', async () => {
			const results = await transformer.transformMany({ inputs: testUsers })

			expect(results).toHaveLength(2)
			expect(results[0]).toEqual({
				name: 'John Doe',
				email: 'john@example.com',
			})
			expect(results[1]).toEqual({
				name: 'Jane Smith',
				email: 'jane@example.com',
			})
		})
	})

	describe('Transformation with includes', () => {
		const transformer = new UserTransformerWithIncludes()

		it('should transform without includes', async () => {
			const result = await transformer.transform({ input: testUser })

			expect(result).toEqual({
				name: 'John Doe',
				email: 'john@example.com',
			})
			expect(result.avatar).toBeUndefined()
			expect(result.metadata).toBeUndefined()
		})

		it('should transform with single include', async () => {
			const result = await transformer.transform({
				input: testUser,
				includes: ['avatar'],
			})

			expect(result).toEqual({
				name: 'John Doe',
				email: 'john@example.com',
				avatar: 'https://avatar.com/1',
			})
			expect(result.metadata).toBeUndefined()
		})

		it('should transform with multiple includes', async () => {
			const result = await transformer.transform({
				input: testUser,
				includes: ['avatar', 'metadata'],
			})

			expect(result).toEqual({
				name: 'John Doe',
				email: 'john@example.com',
				avatar: 'https://avatar.com/1',
				metadata: { role: 'admin', id: 1 },
			})
		})

		it('should transform many with includes', async () => {
			const results = await transformer.transformMany({
				inputs: testUsers,
				includes: ['avatar'],
			})

			expect(results).toHaveLength(2)
			expect(results[0]!.avatar).toBe('https://avatar.com/1')
			expect(results[1]!.avatar).toBe('https://avatar.com/2')
		})
	})

	describe('Transformation with props', () => {
		const transformer = new UserTransformerWithProps()

		it('should require props', async () => {
			const result = await transformer.transform({
				input: testUser,
				props: { includeAvatar: true, avatarSize: 100 },
			})

			expect(result).toEqual({
				name: 'John Doe',
				email: 'john@example.com',
				avatar: 'https://avatar.com/1?size=100',
			})
		})

		it('should handle props conditionally', async () => {
			const result = await transformer.transform({
				input: testUser,
				props: { includeAvatar: false, avatarSize: 100 },
			})

			expect(result).toEqual({
				name: 'John Doe',
				email: 'john@example.com',
			})
			expect(result.avatar).toBeUndefined()
		})

		it('should pass props to includes', async () => {
			const result = await transformer.transform({
				input: testUser,
				props: { includeAvatar: true, avatarSize: 200 },
				includes: ['metadata'],
			})

			expect(result.metadata).toEqual({
				role: 'admin',
				avatarSize: 200,
			})
		})

		it('should transform many with props', async () => {
			const results = await transformer.transformMany({
				inputs: testUsers,
				props: { includeAvatar: true, avatarSize: 50 },
			})

			expect(results).toHaveLength(2)
			expect(results[0]!.avatar).toBe('https://avatar.com/1?size=50')
			expect(results[1]!.avatar).toBe('https://avatar.com/2?size=50')
		})
	})

	describe('Type constraints', () => {
		it('should only allow includes for optional properties', () => {
			// This test validates that the type system correctly restricts
			// includes to only optional properties of the output type
			const transformer = new UserTransformerWithIncludes()

			// TypeScript should allow these
			transformer.transform({ input: testUser, includes: ['avatar'] })
			transformer.transform({ input: testUser, includes: ['metadata'] })
			transformer.transform({
				input: testUser,
				includes: ['avatar', 'metadata'],
			})

			// The type system prevents includes for non-optional properties
			// The type system prevents includes for non-optional properties
			// For example: transformer.transform({ input: testUser, includes: ['name'] }) would error
		})
	})

	describe('Edge cases', () => {
		it('should handle empty includes array', async () => {
			const transformer = new UserTransformerWithIncludes()
			const result = await transformer.transform({
				input: testUser,
				includes: [],
			})

			expect(result).toEqual({
				name: 'John Doe',
				email: 'john@example.com',
			})
		})

		it('should handle empty inputs array', async () => {
			const transformer = new BasicUserTransformer()
			const results = await transformer.transformMany({ inputs: [] })

			expect(results).toEqual([])
		})
	})

	describe('Cache integration', () => {
		// Helper to track function calls
		const createMockFetcher = () => {
			let callCount = 0
			const fn = async (userId: number) => {
				callCount++
				return { avatarUrl: `https://avatar.com/${userId}` }
			}
			return { fn, getCallCount: () => callCount }
		}

		it('should cache async calls within transformMany', async () => {
			const mockFetcher = createMockFetcher()

			class CachedTransformer extends AbstractTransformer<User, PublicUser> {
				cache = {
					avatarFetcher: new Cache(mockFetcher.fn),
				}

				data(input: User): PublicUser {
					return { name: input.name, email: input.email }
				}

				includesMap = {
					avatar: async (input: User) => {
						const result = await this.cache.avatarFetcher.call(input.id)
						return result.avatarUrl
					},
				}
			}

			const transformer = new CachedTransformer()

			// Transform 3 users where 2 have the same id
			const users: User[] = [
				{ id: 1, name: 'User 1', email: 'u1@test.com', role: 'user' },
				{ id: 2, name: 'User 2', email: 'u2@test.com', role: 'user' },
				{ id: 1, name: 'User 1 again', email: 'u1b@test.com', role: 'admin' },
			]

			const results = await transformer.transformMany({
				inputs: users,
				includes: ['avatar'],
			})

			expect(results).toHaveLength(3)
			expect(results[0]!.avatar).toBe('https://avatar.com/1')
			expect(results[1]!.avatar).toBe('https://avatar.com/2')
			expect(results[2]!.avatar).toBe('https://avatar.com/1')
			// Only 2 fetcher calls (ids 1 and 2), not 3
			expect(mockFetcher.getCallCount()).toBe(2)
		})

		it('should clear cache after _transform by default', async () => {
			const mockFetcher = createMockFetcher()

			class CachedTransformer extends AbstractTransformer<User, PublicUser> {
				cache = {
					avatarFetcher: new Cache(mockFetcher.fn),
				}

				data(input: User): PublicUser {
					return { name: input.name, email: input.email }
				}

				includesMap = {
					avatar: async (input: User) => {
						const result = await this.cache.avatarFetcher.call(input.id)
						return result.avatarUrl
					},
				}
			}

			const transformer = new CachedTransformer()

			// First transform
			await transformer._transform({ input: testUser, props: undefined, includes: ['avatar'] })
			expect(mockFetcher.getCallCount()).toBe(1)

			// Second transform - cache should be cleared, so fetcher called again
			await transformer._transform({ input: testUser, props: undefined, includes: ['avatar'] })
			expect(mockFetcher.getCallCount()).toBe(2)
		})

		it('should keep cache when clearCacheOnTransform is false', async () => {
			const mockFetcher = createMockFetcher()

			class PersistentCacheTransformer extends AbstractTransformer<User, PublicUser> {
				constructor() {
					super({ clearCacheOnTransform: false })
				}

				cache = {
					avatarFetcher: new Cache(mockFetcher.fn),
				}

				data(input: User): PublicUser {
					return { name: input.name, email: input.email }
				}

				includesMap = {
					avatar: async (input: User) => {
						const result = await this.cache.avatarFetcher.call(input.id)
						return result.avatarUrl
					},
				}
			}

			const transformer = new PersistentCacheTransformer()

			// First transform
			await transformer._transform({ input: testUser, props: undefined, includes: ['avatar'] })
			expect(mockFetcher.getCallCount()).toBe(1)

			// Second transform - cache should persist, so no new fetcher call
			await transformer._transform({ input: testUser, props: undefined, includes: ['avatar'] })
			expect(mockFetcher.getCallCount()).toBe(1)
		})

		it('should manually clear cache with clearCache()', async () => {
			const mockFetcher = createMockFetcher()

			class PersistentCacheTransformer extends AbstractTransformer<User, PublicUser> {
				constructor() {
					super({ clearCacheOnTransform: false })
				}

				cache = {
					avatarFetcher: new Cache(mockFetcher.fn),
				}

				data(input: User): PublicUser {
					return { name: input.name, email: input.email }
				}

				includesMap = {
					avatar: async (input: User) => {
						const result = await this.cache.avatarFetcher.call(input.id)
						return result.avatarUrl
					},
				}
			}

			const transformer = new PersistentCacheTransformer()

			// First transform
			await transformer._transform({ input: testUser, props: undefined, includes: ['avatar'] })
			expect(mockFetcher.getCallCount()).toBe(1)

			// Clear cache manually
			transformer.clearCache()

			// Third transform - cache cleared, so fetcher called again
			await transformer._transform({ input: testUser, props: undefined, includes: ['avatar'] })
			expect(mockFetcher.getCallCount()).toBe(2)
		})
	})
})
