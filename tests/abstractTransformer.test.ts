/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it } from 'bun:test'
import { AbstractTransformer } from '../src/abstractTransformer'

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
})
