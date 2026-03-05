import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { Elysia } from 'elysia'
import { AbstractTransformer, Cache } from '../src'
import { t7mPlugin } from '../src/elysia'

// --- Test types ---

interface User {
	id: number
	name: string
	email: string
	role: 'admin' | 'user'
}

interface PublicUser {
	name: string
	email: string
	avatar?: string
}

interface TransformProps extends Record<string, unknown> {
	prefix: string
}

// --- Transformers ---

class UserTransformer extends AbstractTransformer<User, PublicUser> {
	data(input: User): PublicUser {
		return {
			name: input.name,
			email: input.email,
		}
	}

	includesMap = {
		avatar: (input: User) => `https://avatar.example.com/${input.id}`,
	}
}

class UserTransformerWithProps extends AbstractTransformer<User, PublicUser, TransformProps> {
	data(input: User, props: TransformProps): PublicUser {
		return {
			name: `${props.prefix} ${input.name}`,
			email: input.email,
		}
	}

	includesMap = {
		avatar: (input: User, props: TransformProps) => `https://avatar.example.com/${props.prefix}/${input.id}`,
	}
}

// --- Test data ---

const testUser: User = {
	id: 1,
	name: 'Alice',
	email: 'alice@example.com',
	role: 'admin',
}

const testUsers: User[] = [
	testUser,
	{
		id: 2,
		name: 'Bob',
		email: 'bob@example.com',
		role: 'user',
	},
]

describe('t7mPlugin (Elysia)', () => {
	const consoleSpy = spyOn(console, 'log')

	afterEach(() => {
		consoleSpy.mockClear()
	})

	// -------------------------------------------------------
	// 1. transform() basic
	// -------------------------------------------------------
	describe('transform() basic', () => {
		it('should transform a single input and return JSON', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia()
				.use(t7mPlugin())
				.get('/user', ({ transform }) => transform(testUser, transformer, {}))

			const res = await app.handle(new Request('http://localhost/user'))

			expect(res.status).toBe(200)
			expect(res.headers.get('content-type')).toContain('application/json')
			const body = await res.json()
			expect(body).toEqual({
				name: 'Alice',
				email: 'alice@example.com',
			})
		})
	})

	// -------------------------------------------------------
	// 2. transformMany() basic
	// -------------------------------------------------------
	describe('transformMany() basic', () => {
		it('should transform an array of inputs and return a JSON array', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia()
				.use(t7mPlugin())
				.get('/users', ({ transformMany }) => transformMany(testUsers, transformer, {}))

			const res = await app.handle(new Request('http://localhost/users'))

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toHaveLength(2)
			expect(body[0]).toEqual({ name: 'Alice', email: 'alice@example.com' })
			expect(body[1]).toEqual({ name: 'Bob', email: 'bob@example.com' })
		})
	})

	// -------------------------------------------------------
	// 3. ?include= query parameter parsing
	// -------------------------------------------------------
	describe('?include= query parameter parsing', () => {
		it('should parse comma-separated includes from the URL query for transform()', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia()
				.use(t7mPlugin())
				.get('/user', ({ transform }) => transform(testUser, transformer, {}))

			const res = await app.handle(new Request('http://localhost/user?include=avatar'))

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toEqual({
				name: 'Alice',
				email: 'alice@example.com',
				avatar: 'https://avatar.example.com/1',
			})
		})

		it('should parse comma-separated includes from the URL query for transformMany()', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia()
				.use(t7mPlugin())
				.get('/users', ({ transformMany }) => transformMany(testUsers, transformer, {}))

			const res = await app.handle(new Request('http://localhost/users?include=avatar'))

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body[0].avatar).toBe('https://avatar.example.com/1')
			expect(body[1].avatar).toBe('https://avatar.example.com/2')
		})
	})

	// -------------------------------------------------------
	// 4. Explicit includes option takes priority
	// -------------------------------------------------------
	describe('explicit includes option', () => {
		it('should use explicit includes from extras instead of URL query for transform()', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia()
				.use(t7mPlugin())
				.get('/user', ({ transform }) => transform(testUser, transformer, { includes: [] }))

			const res = await app.handle(new Request('http://localhost/user?include=avatar'))

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body.avatar).toBeUndefined()
		})

		it('should use explicit includes from extras for transformMany()', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia()
				.use(t7mPlugin())
				.get('/users', ({ transformMany }) => transformMany(testUsers, transformer, { includes: ['avatar'] }))

			const res = await app.handle(new Request('http://localhost/users'))

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body[0].avatar).toBe('https://avatar.example.com/1')
			expect(body[1].avatar).toBe('https://avatar.example.com/2')
		})
	})

	// -------------------------------------------------------
	// 5. wrapper option
	// -------------------------------------------------------
	describe('wrapper option', () => {
		it('should wrap the transformed output for transform()', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia().use(t7mPlugin()).get('/user', ({ transform }) =>
				transform(testUser, transformer, {
					wrapper: (data: PublicUser) => ({ data }),
				})
			)

			const res = await app.handle(new Request('http://localhost/user'))

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toEqual({
				data: {
					name: 'Alice',
					email: 'alice@example.com',
				},
			})
		})

		it('should wrap the transformed output for transformMany()', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia().use(t7mPlugin()).get('/users', ({ transformMany }) =>
				transformMany(testUsers, transformer, {
					wrapper: (data: PublicUser[]) => ({ data }),
				})
			)

			const res = await app.handle(new Request('http://localhost/users'))

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toEqual({
				data: [
					{ name: 'Alice', email: 'alice@example.com' },
					{ name: 'Bob', email: 'bob@example.com' },
				],
			})
		})
	})

	// -------------------------------------------------------
	// 6. status option
	// -------------------------------------------------------
	describe('status option', () => {
		it('should return a custom status code for transform()', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia().use(t7mPlugin()).post('/user', ({ transform, set }) => {
				set.status = 201
				return transform(testUser, transformer, {})
			})

			const res = await app.handle(new Request('http://localhost/user', { method: 'POST' }))

			expect(res.status).toBe(201)
			const body = await res.json()
			expect(body).toEqual({ name: 'Alice', email: 'alice@example.com' })
		})

		it('should return a custom status code for transformMany()', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia().use(t7mPlugin()).post('/users', ({ transformMany, set }) => {
				set.status = 201
				return transformMany(testUsers, transformer, {})
			})

			const res = await app.handle(new Request('http://localhost/users', { method: 'POST' }))

			expect(res.status).toBe(201)
			const body = await res.json()
			expect(body).toHaveLength(2)
		})
	})

	// -------------------------------------------------------
	// 7. headers option
	// -------------------------------------------------------
	describe('headers option', () => {
		it('should include custom headers in the response for transform()', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia().use(t7mPlugin()).get('/user', ({ transform, set }) => {
				set.headers['X-Custom-Header'] = 'custom-value'
				return transform(testUser, transformer, {})
			})

			const res = await app.handle(new Request('http://localhost/user'))

			expect(res.status).toBe(200)
			expect(res.headers.get('X-Custom-Header')).toBe('custom-value')
		})

		it('should include custom headers in the response for transformMany()', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia().use(t7mPlugin()).get('/users', ({ transformMany, set }) => {
				set.headers['X-Total-Count'] = '2'
				return transformMany(testUsers, transformer, {})
			})

			const res = await app.handle(new Request('http://localhost/users'))

			expect(res.status).toBe(200)
			expect(res.headers.get('X-Total-Count')).toBe('2')
		})
	})

	// -------------------------------------------------------
	// 8. debug option
	// -------------------------------------------------------
	describe('debug option', () => {
		it('should call console.log when debug is true for transform()', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia()
				.use(t7mPlugin())
				.get('/user', ({ transform }) => transform(testUser, transformer, { debug: true }))

			await app.handle(new Request('http://localhost/user'))

			expect(consoleSpy).toHaveBeenCalled()
			const calls = consoleSpy.mock.calls
			expect(calls.length).toBeGreaterThanOrEqual(3)
		})

		it('should call console.log when debug is true for transformMany()', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia()
				.use(t7mPlugin())
				.get('/users', ({ transformMany }) => transformMany(testUsers, transformer, { debug: true }))

			await app.handle(new Request('http://localhost/users'))

			expect(consoleSpy).toHaveBeenCalled()
			const calls = consoleSpy.mock.calls
			expect(calls.length).toBeGreaterThanOrEqual(3)
		})

		it('should not call console.log when debug is false', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia()
				.use(t7mPlugin())
				.get('/user', ({ transform }) => transform(testUser, transformer, { debug: false }))

			await app.handle(new Request('http://localhost/user'))

			expect(consoleSpy).not.toHaveBeenCalled()
		})

		it('should log includes when debug is true and includes are present', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia()
				.use(t7mPlugin())
				.get('/user', ({ transform }) =>
					transform(testUser, transformer, { debug: true, includes: ['avatar'] })
				)

			await app.handle(new Request('http://localhost/user'))

			expect(consoleSpy).toHaveBeenCalled()
			const calls = consoleSpy.mock.calls
			expect(calls.length).toBeGreaterThanOrEqual(4)
		})
	})

	// -------------------------------------------------------
	// 9. Props forwarding
	// -------------------------------------------------------
	describe('props forwarding', () => {
		it('should forward props to the transformer for transform()', async () => {
			const transformer = new UserTransformerWithProps()
			const app = new Elysia().use(t7mPlugin()).get('/user', ({ transform }) =>
				transform(testUser, transformer, {
					props: { prefix: 'Dr.' },
				})
			)

			const res = await app.handle(new Request('http://localhost/user'))

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toEqual({
				name: 'Dr. Alice',
				email: 'alice@example.com',
			})
		})

		it('should forward props to the transformer for transformMany()', async () => {
			const transformer = new UserTransformerWithProps()
			const app = new Elysia().use(t7mPlugin()).get('/users', ({ transformMany }) =>
				transformMany(testUsers, transformer, {
					props: { prefix: 'Mr.' },
				})
			)

			const res = await app.handle(new Request('http://localhost/users'))

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body[0]).toEqual({ name: 'Mr. Alice', email: 'alice@example.com' })
			expect(body[1]).toEqual({ name: 'Mr. Bob', email: 'bob@example.com' })
		})

		it('should forward props to include functions', async () => {
			const transformer = new UserTransformerWithProps()
			const app = new Elysia().use(t7mPlugin()).get('/user', ({ transform }) =>
				transform(testUser, transformer, {
					props: { prefix: 'staff' },
					includes: ['avatar'],
				})
			)

			const res = await app.handle(new Request('http://localhost/user'))

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body.avatar).toBe('https://avatar.example.com/staff/1')
		})
	})

	// -------------------------------------------------------
	// 10. No includes
	// -------------------------------------------------------
	describe('no includes', () => {
		it('should work correctly without any includes for transform()', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia()
				.use(t7mPlugin())
				.get('/user', ({ transform }) => transform(testUser, transformer, {}))

			const res = await app.handle(new Request('http://localhost/user'))

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toEqual({
				name: 'Alice',
				email: 'alice@example.com',
			})
			expect(body.avatar).toBeUndefined()
		})

		it('should work correctly without any includes for transformMany()', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia()
				.use(t7mPlugin())
				.get('/users', ({ transformMany }) => transformMany(testUsers, transformer, {}))

			const res = await app.handle(new Request('http://localhost/users'))

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toHaveLength(2)
			expect(body[0].avatar).toBeUndefined()
			expect(body[1].avatar).toBeUndefined()
		})

		it('should not include optional fields when no URL query and no explicit includes', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia()
				.use(t7mPlugin())
				.get('/user', ({ transform }) => transform(testUser, transformer, {}))

			const res = await app.handle(new Request('http://localhost/user'))

			const body = await res.json()
			expect(Object.keys(body)).toEqual(['name', 'email'])
		})
	})

	// -------------------------------------------------------
	// 11. Optional extras
	// -------------------------------------------------------
	describe('optional extras', () => {
		it('should allow calling transform without extras when no props needed', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia().use(t7mPlugin()).get('/user', ({ transform }) => transform(testUser, transformer))

			const res = await app.handle(new Request('http://localhost/user'))

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toEqual({ name: 'Alice', email: 'alice@example.com' })
		})

		it('should allow calling transformMany without extras when no props needed', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia()
				.use(t7mPlugin())
				.get('/users', ({ transformMany }) => transformMany(testUsers, transformer))

			const res = await app.handle(new Request('http://localhost/users'))

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toHaveLength(2)
		})

		it('should still parse ?include= from query when extras omitted', async () => {
			const transformer = new UserTransformer()
			const app = new Elysia().use(t7mPlugin()).get('/user', ({ transform }) => transform(testUser, transformer))

			const res = await app.handle(new Request('http://localhost/user?include=avatar'))

			const body = await res.json()
			expect(body.avatar).toBe('https://avatar.example.com/1')
		})
	})

	// -------------------------------------------------------
	// 12. Cache lifecycle (_transform vs transform)
	// -------------------------------------------------------
	describe('cache lifecycle', () => {
		it('should clear cache between transform calls (proves _transform is used, not transform)', async () => {
			let fetchCount = 0

			class CachingTransformer extends AbstractTransformer<User, PublicUser> {
				cache = {
					lookup: new Cache((id: number) => {
						fetchCount++
						return `resolved-${id}`
					}),
				}

				async data(input: User): Promise<PublicUser> {
					await this.cache.lookup.call(input.id)
					return { name: input.name, email: input.email }
				}

				includesMap = {
					avatar: (input: User) => `https://avatar.example.com/${input.id}`,
				}
			}

			const transformer = new CachingTransformer()
			const app = new Elysia().use(t7mPlugin()).get('/user', ({ transform }) => transform(testUser, transformer))

			// First request — cache miss, fetchCount = 1
			await app.handle(new Request('http://localhost/user'))
			expect(fetchCount).toBe(1)

			// Second request — if _transform is used, cache was cleared, so fetchCount = 2
			// If transform() were used instead, cache would NOT be cleared, fetchCount would stay 1
			await app.handle(new Request('http://localhost/user'))
			expect(fetchCount).toBe(2)
		})

		it('should clear cache between transformMany calls', async () => {
			let fetchCount = 0

			class CachingTransformer extends AbstractTransformer<User, PublicUser> {
				cache = {
					lookup: new Cache((id: number) => {
						fetchCount++
						return `resolved-${id}`
					}),
				}

				async data(input: User): Promise<PublicUser> {
					await this.cache.lookup.call(input.id)
					return { name: input.name, email: input.email }
				}
			}

			const transformer = new CachingTransformer()
			const app = new Elysia()
				.use(t7mPlugin())
				.get('/users', ({ transformMany }) => transformMany(testUsers, transformer))

			// First request — 2 cache misses (Alice + Bob)
			await app.handle(new Request('http://localhost/users'))
			expect(fetchCount).toBe(2)

			// Second request — cache cleared by _transformMany, so 2 more misses
			await app.handle(new Request('http://localhost/users'))
			expect(fetchCount).toBe(4)
		})
	})
})
