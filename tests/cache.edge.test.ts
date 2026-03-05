import { describe, expect, it } from 'bun:test'
import { Cache } from '../src/lib/cache'

describe('Cache edge cases', () => {
	describe('Rejected promise caching', () => {
		it('should share the same rejected promise for concurrent calls before rejection settles', async () => {
			let callCount = 0
			const fn = async () => {
				callCount++
				throw new Error('fail')
			}
			const cache = new Cache(fn)

			const promise1 = cache.call()
			const promise2 = cache.call()

			// Before rejection settles, concurrent calls share the same promise
			expect(promise1).toBe(promise2)
			expect(callCount).toBe(1)

			await expect(promise1).rejects.toThrow('fail')
			await expect(promise2).rejects.toThrow('fail')
		})

		it('should auto-evict rejected promise and retry on next call', async () => {
			let callCount = 0
			const fn = async (_key: string) => {
				callCount++
				if (callCount <= 1) throw new Error('transient')
				return 'recovered'
			}
			const cache = new Cache(fn)

			// First call fails
			await expect(cache.call('a')).rejects.toThrow('transient')
			expect(callCount).toBe(1)

			// After rejection settles, the entry is evicted — next call retries
			const result = await cache.call('a')
			expect(result).toBe('recovered')
			expect(callCount).toBe(2)
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

	describe('Nested object serialization', () => {
		it('should NOT collide objects with different nested values thanks to JSON serialization', async () => {
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

			// JSON.stringify properly serializes nested objects, so cache keys do NOT collide
			expect(r1).toBe(obj1)
			expect(r2).toBe(obj2)
			expect(callCount).toBe(2)
		})
	})

	describe('Primitive type-aware cache keys', () => {
		it('should NOT collide number 42 and string "42"', async () => {
			let callCount = 0
			const fn = async (arg: unknown) => {
				callCount++
				return arg
			}
			const cache = new Cache(fn as (arg: any) => any)

			const r1 = await cache.call(42)
			const r2 = await cache.call('42')

			expect(r1).toBe(42)
			expect(r2).toBe('42')
			expect(callCount).toBe(2)
		})

		it('should NOT collide boolean true and string "true"', async () => {
			let callCount = 0
			const fn = async (arg: unknown) => {
				callCount++
				return arg
			}
			const cache = new Cache(fn as (arg: any) => any)

			const r1 = await cache.call(true)
			const r2 = await cache.call('true')

			expect(r1).toBe(true)
			expect(r2).toBe('true')
			expect(callCount).toBe(2)
		})
	})

	describe('Object delimiter injection', () => {
		it('should NOT collide objects with delimiter-like values', async () => {
			let callCount = 0
			const fn = async (obj: Record<string, unknown>) => {
				callCount++
				return obj
			}
			const cache = new Cache(fn)

			const obj1 = { a: '1|b:2' }
			const obj2 = { a: '1', b: '2' }

			const r1 = await cache.call(obj1)
			const r2 = await cache.call(obj2)

			expect(r1).toBe(obj1)
			expect(r2).toBe(obj2)
			expect(callCount).toBe(2)
		})
	})

	describe('Nested object distinction', () => {
		it('should NOT collide objects with different nested data', async () => {
			let callCount = 0
			const fn = async (obj: { data: { x: number } }) => {
				callCount++
				return obj
			}
			const cache = new Cache(fn)

			const obj1 = { data: { x: 1 } }
			const obj2 = { data: { x: 2 } }

			const r1 = await cache.call(obj1)
			const r2 = await cache.call(obj2)

			expect(r1).toBe(obj1)
			expect(r2).toBe(obj2)
			expect(callCount).toBe(2)
		})
	})

	describe('maxSize eviction', () => {
		it('should evict oldest entry when cache exceeds maxSize', async () => {
			let callCount = 0
			const fn = async (key: string) => {
				callCount++
				return `value-${key}`
			}
			const cache = new Cache(fn, { maxSize: 3 })

			await cache.call('a')
			await cache.call('b')
			await cache.call('c')
			expect(callCount).toBe(3)

			// Adding 4th entry should evict 'a' (oldest)
			await cache.call('d')
			expect(callCount).toBe(4)

			// 'a' was evicted, so calling it again re-executes the function
			await cache.call('a')
			expect(callCount).toBe(5)

			// 'c' and 'd' should still be cached
			await cache.call('c')
			await cache.call('d')
			expect(callCount).toBe(5)
		})

		it('should work correctly with maxSize = 1', async () => {
			let callCount = 0
			const fn = async (key: number) => {
				callCount++
				return key * 10
			}
			const cache = new Cache(fn, { maxSize: 1 })

			await cache.call(1)
			expect(callCount).toBe(1)

			// Same key is still cached
			await cache.call(1)
			expect(callCount).toBe(1)

			// New key evicts old
			await cache.call(2)
			expect(callCount).toBe(2)

			// Old key is gone
			await cache.call(1)
			expect(callCount).toBe(3)
		})

		it('should not limit cache size when maxSize is not set', async () => {
			let callCount = 0
			const fn = async (key: number) => {
				callCount++
				return key
			}
			const cache = new Cache(fn)

			// Add many entries without maxSize
			for (let i = 0; i < 100; i++) {
				await cache.call(i)
			}
			expect(callCount).toBe(100)

			// All should still be cached
			for (let i = 0; i < 100; i++) {
				await cache.call(i)
			}
			expect(callCount).toBe(100)
		})
	})

	describe('maxSize constructor validation', () => {
		it('should throw for maxSize = 0', () => {
			const fn = async (key: string) => key
			expect(() => new Cache(fn, { maxSize: 0 })).toThrow('positive integer')
		})

		it('should throw for negative maxSize', () => {
			const fn = async (key: string) => key
			expect(() => new Cache(fn, { maxSize: -1 })).toThrow('positive integer')
		})

		it('should throw for non-integer maxSize', () => {
			const fn = async (key: string) => key
			expect(() => new Cache(fn, { maxSize: 1.5 })).toThrow('positive integer')
		})

		it('should throw for NaN maxSize', () => {
			const fn = async (key: string) => key
			expect(() => new Cache(fn, { maxSize: NaN })).toThrow('positive integer')
		})

		it('should throw for Infinity maxSize', () => {
			const fn = async (key: string) => key
			expect(() => new Cache(fn, { maxSize: Infinity })).toThrow('positive integer')
		})

		it('should accept valid positive integer maxSize', () => {
			const fn = async (key: string) => key
			expect(() => new Cache(fn, { maxSize: 1 })).not.toThrow()
			expect(() => new Cache(fn, { maxSize: 100 })).not.toThrow()
		})

		it('should work with on and maxSize combined', async () => {
			let callCount = 0
			const fn = async (obj: { id: number; ts: number }) => {
				callCount++
				return obj.id
			}
			const cache = new Cache(fn, { on: ['id'], maxSize: 2 })

			await cache.call({ id: 1, ts: 100 })
			await cache.call({ id: 1, ts: 200 }) // cache hit (on: ['id'])
			expect(callCount).toBe(1)

			await cache.call({ id: 2, ts: 300 })
			await cache.call({ id: 3, ts: 400 }) // evicts id:1 (maxSize: 2)
			expect(callCount).toBe(3)

			await cache.call({ id: 1, ts: 500 }) // cache miss (evicted)
			expect(callCount).toBe(4)
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
