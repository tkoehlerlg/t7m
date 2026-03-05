import { afterAll, afterEach, beforeAll, describe, expect, it, spyOn } from 'bun:test'
import { Hono } from 'hono'
import { AbstractTransformer } from '../src'
import { t7mMiddleware } from '../src/hono'

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

describe('t7mMiddleware', () => {
	const consoleSpy = spyOn(console, 'log')

	afterEach(() => {
		consoleSpy.mockClear()
	})

	// -------------------------------------------------------
	// 1. c.transform() basic
	// -------------------------------------------------------
	describe('c.transform() basic', () => {
		it('should transform a single input and return a JSON response', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/user', async c => {
				return c.transform(testUser, transformer, {})
			})

			const res = await app.request('/user')

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
	// 2. c.transformMany() basic
	// -------------------------------------------------------
	describe('c.transformMany() basic', () => {
		it('should transform an array of inputs and return a JSON array response', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/users', async c => {
				return c.transformMany(testUsers, transformer, {})
			})

			const res = await app.request('/users')

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
		it('should parse comma-separated includes from the URL query for c.transform()', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/user', async c => {
				return c.transform(testUser, transformer, {})
			})

			const res = await app.request('/user?include=avatar')

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toEqual({
				name: 'Alice',
				email: 'alice@example.com',
				avatar: 'https://avatar.example.com/1',
			})
		})

		it('should parse comma-separated includes from the URL query for c.transformMany()', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/users', async c => {
				return c.transformMany(testUsers, transformer, {})
			})

			const res = await app.request('/users?include=avatar')

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
		it('should use explicit includes from extras instead of URL query for c.transform()', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/user', async c => {
				// Explicitly pass empty includes -- should override the URL query
				return c.transform(testUser, transformer, { includes: [] })
			})

			// URL has ?include=avatar, but extras.includes=[] should take priority
			const res = await app.request('/user?include=avatar')

			expect(res.status).toBe(200)
			const body = await res.json()
			// Avatar should NOT be present because explicit includes=[] overrides the URL
			expect(body.avatar).toBeUndefined()
		})

		it('should use explicit includes from extras for c.transformMany()', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/users', async c => {
				return c.transformMany(testUsers, transformer, { includes: ['avatar'] })
			})

			// No URL includes, but explicit includes should still work
			const res = await app.request('/users')

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
		it('should wrap the transformed output for c.transform()', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/user', async c => {
				return c.transform(testUser, transformer, {
					wrapper: (data: PublicUser) => ({ data }),
				})
			})

			const res = await app.request('/user')

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toEqual({
				data: {
					name: 'Alice',
					email: 'alice@example.com',
				},
			})
		})

		it('should wrap the transformed output for c.transformMany()', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/users', async c => {
				return c.transformMany(testUsers, transformer, {
					wrapper: (data: PublicUser[]) => ({ data }),
				})
			})

			const res = await app.request('/users')

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
		it('should return a custom status code for c.transform()', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.post('/user', async c => {
				return c.transform(testUser, transformer, {}, 201)
			})

			const res = await app.request('/user', { method: 'POST' })

			expect(res.status).toBe(201)
			const body = await res.json()
			expect(body).toEqual({ name: 'Alice', email: 'alice@example.com' })
		})

		it('should return a custom status code for c.transformMany()', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.post('/users', async c => {
				return c.transformMany(testUsers, transformer, {}, 201)
			})

			const res = await app.request('/users', { method: 'POST' })

			expect(res.status).toBe(201)
			const body = await res.json()
			expect(body).toHaveLength(2)
		})
	})

	// -------------------------------------------------------
	// 7. headers option
	// -------------------------------------------------------
	describe('headers option', () => {
		it('should include custom headers in the response for c.transform()', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/user', async c => {
				return c.transform(testUser, transformer, {}, 200, {
					'X-Custom-Header': 'custom-value',
				})
			})

			const res = await app.request('/user')

			expect(res.status).toBe(200)
			expect(res.headers.get('X-Custom-Header')).toBe('custom-value')
		})

		it('should include custom headers in the response for c.transformMany()', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/users', async c => {
				return c.transformMany(testUsers, transformer, {}, 200, {
					'X-Total-Count': '2',
				})
			})

			const res = await app.request('/users')

			expect(res.status).toBe(200)
			expect(res.headers.get('X-Total-Count')).toBe('2')
		})
	})

	// -------------------------------------------------------
	// 8. debug option
	// -------------------------------------------------------
	describe('debug option', () => {
		beforeAll(() => {
			process.env.T7M_DEBUG = 'true'
		})
		afterAll(() => {
			delete process.env.T7M_DEBUG
		})

		it('should call console.log when debug is true for c.transform()', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/user', async c => {
				return c.transform(testUser, transformer, { debug: true })
			})

			await app.request('/user')

			// The middleware logs multiple times: Transforming, Transformed, Response
			expect(consoleSpy).toHaveBeenCalled()
			const calls = consoleSpy.mock.calls
			// At least 3 logs: "Transforming (One)", "Transformed (One)", "Response (One)"
			expect(calls.length).toBeGreaterThanOrEqual(3)
		})

		it('should call console.log when debug is true for c.transformMany()', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/users', async c => {
				return c.transformMany(testUsers, transformer, { debug: true })
			})

			await app.request('/users')

			expect(consoleSpy).toHaveBeenCalled()
			const calls = consoleSpy.mock.calls
			// At least 3 logs: "Transforming (Many)", "Transformed (Many)", "Response (Many)"
			expect(calls.length).toBeGreaterThanOrEqual(3)
		})

		it('should not call console.log when debug is false', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/user', async c => {
				return c.transform(testUser, transformer, { debug: false })
			})

			await app.request('/user')

			expect(consoleSpy).not.toHaveBeenCalled()
		})

		it('should log includes when debug is true and includes are present', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/user', async c => {
				return c.transform(testUser, transformer, { debug: true, includes: ['avatar'] })
			})

			await app.request('/user')

			expect(consoleSpy).toHaveBeenCalled()
			// Should have at least 4 calls (extra one for "Includes Received:")
			const calls = consoleSpy.mock.calls
			expect(calls.length).toBeGreaterThanOrEqual(4)
		})
	})

	// -------------------------------------------------------
	// 8b. debug gate without T7M_DEBUG env var
	// -------------------------------------------------------
	describe('debug gate without T7M_DEBUG env var', () => {
		it('should not call console.log when debug is true but T7M_DEBUG is not set', async () => {
			delete process.env.T7M_DEBUG

			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/user', async c => {
				return c.transform(testUser, transformer, { debug: true })
			})

			await app.request('/user')

			expect(consoleSpy).not.toHaveBeenCalled()
		})

		it('should still transform correctly when debug is true but T7M_DEBUG is not set', async () => {
			delete process.env.T7M_DEBUG

			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/user', async c => {
				return c.transform(testUser, transformer, { debug: true, includes: ['avatar'] })
			})

			const res = await app.request('/user')

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toEqual({
				name: 'Alice',
				email: 'alice@example.com',
				avatar: 'https://avatar.example.com/1',
			})
			expect(consoleSpy).not.toHaveBeenCalled()
		})
	})

	// -------------------------------------------------------
	// 9. Props forwarding
	// -------------------------------------------------------
	describe('props forwarding', () => {
		it('should forward props to the transformer for c.transform()', async () => {
			const transformer = new UserTransformerWithProps()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/user', async c => {
				return c.transform(testUser, transformer, {
					props: { prefix: 'Dr.' },
				})
			})

			const res = await app.request('/user')

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toEqual({
				name: 'Dr. Alice',
				email: 'alice@example.com',
			})
		})

		it('should forward props to the transformer for c.transformMany()', async () => {
			const transformer = new UserTransformerWithProps()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/users', async c => {
				return c.transformMany(testUsers, transformer, {
					props: { prefix: 'Mr.' },
				})
			})

			const res = await app.request('/users')

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body[0]).toEqual({ name: 'Mr. Alice', email: 'alice@example.com' })
			expect(body[1]).toEqual({ name: 'Mr. Bob', email: 'bob@example.com' })
		})

		it('should forward props to include functions', async () => {
			const transformer = new UserTransformerWithProps()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/user', async c => {
				return c.transform(testUser, transformer, {
					props: { prefix: 'staff' },
					includes: ['avatar'],
				})
			})

			const res = await app.request('/user')

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body.avatar).toBe('https://avatar.example.com/staff/1')
		})
	})

	// -------------------------------------------------------
	// 10. No includes
	// -------------------------------------------------------
	describe('no includes', () => {
		it('should work correctly without any includes for c.transform()', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/user', async c => {
				return c.transform(testUser, transformer, {})
			})

			const res = await app.request('/user')

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toEqual({
				name: 'Alice',
				email: 'alice@example.com',
			})
			expect(body.avatar).toBeUndefined()
		})

		it('should work correctly without any includes for c.transformMany()', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/users', async c => {
				return c.transformMany(testUsers, transformer, {})
			})

			const res = await app.request('/users')

			expect(res.status).toBe(200)
			const body = await res.json()
			expect(body).toHaveLength(2)
			expect(body[0].avatar).toBeUndefined()
			expect(body[1].avatar).toBeUndefined()
		})

		it('should not include optional fields when no URL query and no explicit includes', async () => {
			const transformer = new UserTransformer()
			const app = new Hono()
			app.use('*', t7mMiddleware)
			app.get('/user', async c => {
				return c.transform(testUser, transformer, {})
			})

			// No ?include= query parameter
			const res = await app.request('/user')

			const body = await res.json()
			expect(Object.keys(body)).toEqual(['name', 'email'])
		})
	})
})
