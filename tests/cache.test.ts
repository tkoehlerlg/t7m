import { describe, expect, it } from 'bun:test'
import { Cache } from '../src/cache'

describe('Cache', () => {
	// Helper to create a mock async function with invocation counter
	const createMockFn = <T, R>(returnValue: (arg: T) => R) => {
		let callCount = 0
		const fn = async (arg: T): Promise<R> => {
			callCount++
			return returnValue(arg)
		}
		return {
			fn,
			getCallCount: () => callCount,
		}
	}

	describe('Primitive arguments', () => {
		it('should cache result for primitive string arg', async () => {
			const mock = createMockFn((s: string) => `result-${s}`)
			const cache = new Cache(mock.fn)

			const result1 = await cache.run('test')
			const result2 = await cache.run('test')

			expect(result1).toBe('result-test')
			expect(result2).toBe('result-test')
		})

		it('should cache result for primitive number arg', async () => {
			const mock = createMockFn((n: number) => n * 2)
			const cache = new Cache(mock.fn)

			const result1 = await cache.run(5)
			const result2 = await cache.run(5)

			expect(result1).toBe(10)
			expect(result2).toBe(10)
		})

		it('should call function only once for same primitive arg', async () => {
			const mock = createMockFn((s: string) => `result-${s}`)
			const cache = new Cache(mock.fn)

			await cache.run('test')
			await cache.run('test')
			await cache.run('test')

			expect(mock.getCallCount()).toBe(1)
		})

		it('should handle empty string', async () => {
			const mock = createMockFn((s: string) => `result-${s}`)
			const cache = new Cache(mock.fn)

			const result = await cache.run('')
			expect(result).toBe('result-')
			expect(mock.getCallCount()).toBe(1)
		})

		it('should handle negative numbers', async () => {
			const mock = createMockFn((n: string | number | symbol | object) => (n as number) * 2)
			const cache = new Cache(mock.fn)

			await cache.run(-5)
			await cache.run(-5)

			expect(mock.getCallCount()).toBe(1)
		})

		it('should cache symbol arg', async () => {
			const sym = Symbol('test')
			const mock = createMockFn((s: string | number | symbol | object) => s.toString())
			const cache = new Cache(mock.fn)

			await cache.run(sym)
			await cache.run(sym)

			expect(mock.getCallCount()).toBe(1)
		})
	})

	describe('Object arguments', () => {
		it('should cache result for object arg using all keys', async () => {
			const mock = createMockFn((obj: { a: number; b: string }) => `${obj.a}-${obj.b}`)
			const cache = new Cache(mock.fn)

			const result1 = await cache.run({ a: 1, b: 'hello' })
			const result2 = await cache.run({ a: 1, b: 'hello' })

			expect(result1).toBe('1-hello')
			expect(result2).toBe('1-hello')
		})

		it('should call function only once for same object arg', async () => {
			const mock = createMockFn((obj: { a: number; b: string }) => `${obj.a}-${obj.b}`)
			const cache = new Cache(mock.fn)

			await cache.run({ a: 1, b: 'hello' })
			await cache.run({ a: 1, b: 'hello' })

			expect(mock.getCallCount()).toBe(1)
		})

		it('should call function separately for different object args', async () => {
			const mock = createMockFn((obj: { a: number; b: string }) => `${obj.a}-${obj.b}`)
			const cache = new Cache(mock.fn)

			await cache.run({ a: 1, b: 'hello' })
			await cache.run({ a: 2, b: 'hello' })
			await cache.run({ a: 1, b: 'world' })

			expect(mock.getCallCount()).toBe(3)
		})

		it('should cache same object regardless of key order', async () => {
			const mock = createMockFn((obj: { a: number; b: string }) => `${obj.a}-${obj.b}`)
			const cache = new Cache(mock.fn)

			await cache.run({ a: 1, b: 'hello' })
			await cache.run({ b: 'hello', a: 1 })

			expect(mock.getCallCount()).toBe(1)
		})

		it('should handle null values in objects', async () => {
			const mock = createMockFn((obj: { a: number; b: unknown }) => `${obj.a}-${obj.b}`)
			const cache = new Cache(mock.fn)

			await cache.run({ a: 1, b: null })
			await cache.run({ a: 1, b: null })

			expect(mock.getCallCount()).toBe(1)
		})

		it('should handle undefined values in objects', async () => {
			const mock = createMockFn((obj: { a: number; b: unknown }) => `${obj.a}-${obj.b}`)
			const cache = new Cache(mock.fn)

			await cache.run({ a: 1, b: undefined })
			await cache.run({ a: 1, b: undefined })

			expect(mock.getCallCount()).toBe(1)
		})

		it('should handle nested objects', async () => {
			const mock = createMockFn((obj: { id: number; data: object }) => obj.id)
			const cache = new Cache(mock.fn)

			await cache.run({ id: 1, data: { foo: 'bar' } })
			await cache.run({ id: 1, data: { foo: 'bar' } })

			// Note: nested objects serialize to "[object Object]" so both hit same cache
			expect(mock.getCallCount()).toBe(1)
		})
	})

	describe('Object arguments with on parameter', () => {
		it('should use only specified keys with on parameter', async () => {
			const mock = createMockFn((obj: { id: number; name: string; timestamp: number }) => obj.id)
			const cache = new Cache(mock.fn, 'id')

			const result1 = await cache.run({ id: 1, name: 'test', timestamp: 100 })
			const result2 = await cache.run({ id: 1, name: 'test', timestamp: 200 })

			expect(result1).toBe(1)
			expect(result2).toBe(1)
			expect(mock.getCallCount()).toBe(1)
		})

		it('should ignore non-specified keys with on parameter', async () => {
			const mock = createMockFn((obj: { id: number; name: string; extra: string }) => `${obj.id}-${obj.name}`)
			const cache = new Cache(mock.fn, 'id', 'name')

			await cache.run({ id: 1, name: 'test', extra: 'a' })
			await cache.run({ id: 1, name: 'test', extra: 'b' })
			await cache.run({ id: 1, name: 'test', extra: 'c' })

			expect(mock.getCallCount()).toBe(1)
		})
	})

	describe('Promise behavior', () => {
		it('should return same promise instance for cached calls', async () => {
			const mock = createMockFn((s: string) => `result-${s}`)
			const cache = new Cache(mock.fn)

			const promise1 = cache.run('test')
			const promise2 = cache.run('test')

			expect(promise1).toBe(promise2)
		})

		it('should handle concurrent calls with same arg with single invocation', async () => {
			const mock = createMockFn((s: string) => `result-${s}`)
			const cache = new Cache(mock.fn)

			const [result1, result2, result3] = await Promise.all([
				cache.run('concurrent'),
				cache.run('concurrent'),
				cache.run('concurrent'),
			])

			expect(result1).toBe('result-concurrent')
			expect(result2).toBe('result-concurrent')
			expect(result3).toBe('result-concurrent')
			expect(mock.getCallCount()).toBe(1)
		})
	})
})
