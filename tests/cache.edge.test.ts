import { describe, expect, it } from 'bun:test'
import { Cache } from '../src/lib/cache'

describe('Cache edge cases', () => {
	describe('Rejected promise caching', () => {
		it('should cache a rejected promise and return it on subsequent calls', async () => {
			let callCount = 0
			const fn = async () => {
				callCount++
				throw new Error('fail')
			}
			const cache = new Cache(fn)

			const promise1 = cache.call()
			const promise2 = cache.call()

			expect(promise1).toBe(promise2)
			expect(callCount).toBe(1)

			await expect(promise1).rejects.toThrow('fail')
			await expect(promise2).rejects.toThrow('fail')
		})

		it('should not re-execute function after rejection', async () => {
			let callCount = 0
			const fn = async (key: string) => {
				callCount++
				throw new Error('rejected')
			}
			const cache = new Cache(fn)

			await expect(cache.call('a')).rejects.toThrow('rejected')
			await expect(cache.call('a')).rejects.toThrow('rejected')
			await expect(cache.call('a')).rejects.toThrow('rejected')

			expect(callCount).toBe(1)
		})
	})

	describe('Boolean arguments', () => {
		it('should cache true and false as separate keys', async () => {
			let callCount = 0
			const fn = async (b: boolean) => {
				callCount++
				return b ? 'yes' : 'no'
			}
			const cache = new Cache(fn)

			const r1 = await cache.call(true)
			const r2 = await cache.call(false)
			const r3 = await cache.call(true)
			const r4 = await cache.call(false)

			expect(r1).toBe('yes')
			expect(r2).toBe('no')
			expect(r3).toBe('yes')
			expect(r4).toBe('no')
			expect(callCount).toBe(2)
		})
	})

	describe('Cache key collision: null vs "null"', () => {
		it('should treat null as default-key due to nullish coalescing, not colliding with string "null"', async () => {
			let callCount = 0
			const fn = async (arg: unknown) => {
				callCount++
				return arg
			}
			const cache = new Cache(fn as (arg: any) => any)

			const r1 = await cache.call(null)
			const r2 = await cache.call('null')

			// null ?? 'default-key' maps null to 'default-key', while "null".toString() is "null"
			// So they do NOT collide
			expect(r1).toBeNull()
			expect(r2).toBe('null')
			expect(callCount).toBe(2)
		})

		it('should collide null and undefined since both map to default-key', async () => {
			let callCount = 0
			const fn = async (arg: unknown) => {
				callCount++
				return arg
			}
			const cache = new Cache(fn as (arg: any) => any)

			const r1 = await cache.call(null)
			const r2 = await cache.call(undefined)

			// Both null and undefined trigger ?? 'default-key', so they share a cache entry
			expect(r1).toBeNull()
			expect(r2).toBeNull() // returns cached null, not undefined
			expect(callCount).toBe(1)
		})
	})

	describe('Cache key collision: undefined vs "undefined"', () => {
		it('should treat undefined as default-key due to nullish coalescing, not colliding with string "undefined"', async () => {
			let callCount = 0
			const fn = async (arg: unknown) => {
				callCount++
				return arg
			}
			const cache = new Cache(fn as (arg: any) => any)

			const r1 = await cache.call(undefined)
			const r2 = await cache.call('undefined')

			// undefined ?? 'default-key' maps to 'default-key', while "undefined".toString() is "undefined"
			// So they do NOT collide
			expect(r1).toBeUndefined()
			expect(r2).toBe('undefined')
			expect(callCount).toBe(2)
		})
	})

	describe('Nested object serialization collision', () => {
		it('should collide objects with different nested values due to [object Object] serialization', async () => {
			let callCount = 0
			const fn = async (obj: { id: number; data: object }) => {
				callCount++
				return obj
			}
			const cache = new Cache(fn)

			const obj1 = { id: 1, data: { foo: 'bar' } }
			const obj2 = { id: 1, data: { foo: 'baz' } }

			const r1 = await cache.call(obj1)
			const r2 = await cache.call(obj2)

			// Both nested objects serialize to "[object Object]", so cache keys collide
			expect(r1).toBe(obj1)
			expect(r2).toBe(obj1) // returns cached obj1, not obj2
			expect(callCount).toBe(1)
		})
	})

	describe('clear() on empty cache', () => {
		it('should not throw when clearing an empty cache', () => {
			const fn = async () => 'result'
			const cache = new Cache(fn)

			expect(() => cache.clear()).not.toThrow()
		})

		it('should not throw when clearing an already-cleared cache', async () => {
			const fn = async () => 'result'
			const cache = new Cache(fn)

			await cache.call()
			cache.clear()

			expect(() => cache.clear()).not.toThrow()
		})
	})

	describe('Falsy return value caching', () => {
		it('should cache 0 as a return value', () => {
			let callCount = 0
			const fn = (n: number) => {
				callCount++
				return 0
			}
			const cache = new Cache(fn)

			const r1 = cache.call(1)
			const r2 = cache.call(1)

			expect(r1).toBe(0)
			expect(r2).toBe(0)
			expect(callCount).toBe(1)
		})

		it('should cache false as a return value', () => {
			let callCount = 0
			const fn = (n: number) => {
				callCount++
				return false
			}
			const cache = new Cache(fn)

			const r1 = cache.call(1)
			const r2 = cache.call(1)

			expect(r1).toBe(false)
			expect(r2).toBe(false)
			expect(callCount).toBe(1)
		})

		it('should cache empty string as a return value', () => {
			let callCount = 0
			const fn = (n: number) => {
				callCount++
				return ''
			}
			const cache = new Cache(fn)

			const r1 = cache.call(1)
			const r2 = cache.call(1)

			expect(r1).toBe('')
			expect(r2).toBe('')
			expect(callCount).toBe(1)
		})

		it('should cache null as a return value from a non-nullish argument', () => {
			let callCount = 0
			const fn = (n: number) => {
				callCount++
				return null
			}
			const cache = new Cache(fn)

			const r1 = cache.call(1)
			const r2 = cache.call(1)

			expect(r1).toBeNull()
			expect(r2).toBeNull()
			expect(callCount).toBe(1)
		})
	})

	describe('Synchronous function caching', () => {
		it('should cache result of a sync function', () => {
			let callCount = 0
			const fn = (n: number) => {
				callCount++
				return n * 2
			}
			const cache = new Cache(fn)

			const r1 = cache.call(5)
			const r2 = cache.call(5)

			expect(r1).toBe(10)
			expect(r2).toBe(10)
			expect(callCount).toBe(1)
		})

		it('should cache different keys independently for sync functions', () => {
			let callCount = 0
			const fn = (s: string) => {
				callCount++
				return s.toUpperCase()
			}
			const cache = new Cache(fn)

			const r1 = cache.call('hello')
			const r2 = cache.call('world')
			const r3 = cache.call('hello')

			expect(r1).toBe('HELLO')
			expect(r2).toBe('WORLD')
			expect(r3).toBe('HELLO')
			expect(callCount).toBe(2)
		})

		it('should cache sync function with zero arguments', () => {
			let callCount = 0
			const fn = () => {
				callCount++
				return 42
			}
			const cache = new Cache(fn)

			const r1 = cache.call()
			const r2 = cache.call()

			expect(r1).toBe(42)
			expect(r2).toBe(42)
			expect(callCount).toBe(1)
		})
	})
})
