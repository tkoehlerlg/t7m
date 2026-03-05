import { describe, expect, it } from 'bun:test'
import { AbstractTransformer } from '../src/abstractTransformer'

interface UserInput {
	id: number
	name: string
	secret: string
}

interface UserOutput {
	name: string
	avatar?: string
}

class SimpleTransformer extends AbstractTransformer<UserInput, UserOutput> {
	data(input: UserInput): UserOutput {
		return {
			name: input.name,
		}
	}

	includesMap = {
		avatar: (input: UserInput) => `https://avatar.com/${input.id}`,
	}
}

describe('Prototype property injection', () => {
	const input: UserInput = { id: 1, name: 'Alice', secret: 'hunter2' }

	it('should ignore ?include=constructor and not leak raw input', async () => {
		const transformer = new SimpleTransformer()
		const result = await transformer.transform({
			input,
			unsafeIncludes: ['constructor'],
		})

		expect(result).toEqual({ name: 'Alice' })
		// constructor must not be an own property on the result
		expect(Object.hasOwn(result, 'constructor')).toBe(false)
		expect(JSON.stringify(result)).not.toContain('hunter2')
	})

	it('should ignore ?include=toString and not corrupt output', async () => {
		const transformer = new SimpleTransformer()
		const result = await transformer.transform({
			input,
			unsafeIncludes: ['toString'],
		})

		expect(result).toEqual({ name: 'Alice' })
		expect(typeof result.toString).toBe('function')
		expect(result.toString()).toBe('[object Object]')
	})

	it('should ignore ?include=__proto__ without error or pollution', async () => {
		const transformer = new SimpleTransformer()
		const result = await transformer.transform({
			input,
			unsafeIncludes: ['__proto__'],
		})

		expect(result).toEqual({ name: 'Alice' })
		expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
	})

	it('should ignore ?include=hasOwnProperty and not corrupt output', async () => {
		const transformer = new SimpleTransformer()
		const result = await transformer.transform({
			input,
			unsafeIncludes: ['hasOwnProperty'],
		})

		expect(result).toEqual({ name: 'Alice' })
		expect(typeof result.hasOwnProperty).toBe('function')
	})

	it('should ignore ?include=valueOf and not corrupt output', async () => {
		const transformer = new SimpleTransformer()
		const result = await transformer.transform({
			input,
			unsafeIncludes: ['valueOf'],
		})

		expect(result).toEqual({ name: 'Alice' })
		expect(typeof result.valueOf).toBe('function')
		expect(result.valueOf()).toEqual({ name: 'Alice' })
	})

	it('should still resolve legitimate includes alongside prototype names', async () => {
		const transformer = new SimpleTransformer()
		const result = await transformer.transform({
			input,
			includes: ['avatar'],
			unsafeIncludes: ['constructor', '__proto__'],
		})

		expect(result).toEqual({ name: 'Alice', avatar: 'https://avatar.com/1' })
		expect(JSON.stringify(result)).not.toContain('hunter2')
	})
})
