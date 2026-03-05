import { describe, expect, it } from 'bun:test'
import { AbstractTransformer } from '../src/abstractTransformer'

interface Item {
	id: number
}

interface ItemOutput {
	id: number
	resolved?: string
}

describe('Concurrency - transformMany item throttle', () => {
	it('should limit concurrent transformMany items', async () => {
		let active = 0
		let maxActive = 0

		class ThrottledTransformer extends AbstractTransformer<Item, ItemOutput> {
			constructor() {
				super({ concurrency: 3 })
			}

			async data(input: Item): Promise<ItemOutput> {
				active++
				maxActive = Math.max(maxActive, active)
				await new Promise(r => setTimeout(r, 20))
				active--
				return { id: input.id }
			}
		}

		const transformer = new ThrottledTransformer()
		const inputs = Array.from({ length: 10 }, (_, i) => ({ id: i }))

		const results = await transformer.transformMany({ inputs })

		expect(results).toHaveLength(10)
		expect(maxActive).toBeLessThanOrEqual(3)
		expect(maxActive).toBeGreaterThan(1) // actually ran in parallel
	})

	it('should serialize with concurrency: 1', async () => {
		let active = 0
		let maxActive = 0

		class SerialTransformer extends AbstractTransformer<Item, ItemOutput> {
			constructor() {
				super({ concurrency: 1 })
			}

			async data(input: Item): Promise<ItemOutput> {
				active++
				maxActive = Math.max(maxActive, active)
				await new Promise(r => setTimeout(r, 10))
				active--
				return { id: input.id }
			}
		}

		const transformer = new SerialTransformer()
		const inputs = Array.from({ length: 5 }, (_, i) => ({ id: i }))

		const results = await transformer.transformMany({ inputs })

		expect(results).toHaveLength(5)
		expect(maxActive).toBe(1) // strictly serial
	})

	it('should not throttle when concurrency is not set', async () => {
		let active = 0
		let maxActive = 0

		class UnthrottledTransformer extends AbstractTransformer<Item, ItemOutput> {
			async data(input: Item): Promise<ItemOutput> {
				active++
				maxActive = Math.max(maxActive, active)
				await new Promise(r => setTimeout(r, 20))
				active--
				return { id: input.id }
			}
		}

		const transformer = new UnthrottledTransformer()
		const inputs = Array.from({ length: 10 }, (_, i) => ({ id: i }))

		const results = await transformer.transformMany({ inputs })

		expect(results).toHaveLength(10)
		expect(maxActive).toBe(10) // all ran in parallel
	})

	it('should also throttle _transformMany', async () => {
		let active = 0
		let maxActive = 0

		class ThrottledTransformer extends AbstractTransformer<Item, ItemOutput> {
			constructor() {
				super({ concurrency: 2 })
			}

			async data(input: Item): Promise<ItemOutput> {
				active++
				maxActive = Math.max(maxActive, active)
				await new Promise(r => setTimeout(r, 20))
				active--
				return { id: input.id }
			}
		}

		const transformer = new ThrottledTransformer()
		const inputs = Array.from({ length: 6 }, (_, i) => ({ id: i }))

		const results = await transformer._transformMany({ inputs, props: undefined })

		expect(results).toHaveLength(6)
		expect(maxActive).toBeLessThanOrEqual(2)
	})
})

describe('Concurrency - per-include throttle', () => {
	it('should limit concurrent calls for a specific include', async () => {
		let active = 0
		let maxActive = 0

		class IncludeThrottledTransformer extends AbstractTransformer<Item, ItemOutput> {
			data(input: Item): ItemOutput {
				return { id: input.id }
			}

			includesMap = {
				resolved: async (input: Item) => {
					active++
					maxActive = Math.max(maxActive, active)
					await new Promise(r => setTimeout(r, 20))
					active--
					return `resolved-${input.id}`
				},
			}

			includesConcurrency = {
				resolved: 2,
			}
		}

		const transformer = new IncludeThrottledTransformer()
		const inputs = Array.from({ length: 10 }, (_, i) => ({ id: i }))

		const results = await transformer.transformMany({
			inputs,
			includes: ['resolved'],
		})

		expect(results).toHaveLength(10)
		expect(results[0]!.resolved).toBe('resolved-0')
		expect(results[9]!.resolved).toBe('resolved-9')
		expect(maxActive).toBeLessThanOrEqual(2)
		expect(maxActive).toBeGreaterThan(1)
	})

	it('should not throttle includes without concurrency config', async () => {
		let active = 0
		let maxActive = 0

		class UnthrottledIncludeTransformer extends AbstractTransformer<Item, ItemOutput> {
			data(input: Item): ItemOutput {
				return { id: input.id }
			}

			includesMap = {
				resolved: async (input: Item) => {
					active++
					maxActive = Math.max(maxActive, active)
					await new Promise(r => setTimeout(r, 20))
					active--
					return `resolved-${input.id}`
				},
			}
		}

		const transformer = new UnthrottledIncludeTransformer()
		const inputs = Array.from({ length: 10 }, (_, i) => ({ id: i }))

		const results = await transformer.transformMany({
			inputs,
			includes: ['resolved'],
		})

		expect(results).toHaveLength(10)
		expect(maxActive).toBe(10)
	})

	it('should allow combining item concurrency and include concurrency', async () => {
		let itemActive = 0
		let maxItemActive = 0
		let includeActive = 0
		let maxIncludeActive = 0

		class CombinedThrottleTransformer extends AbstractTransformer<Item, ItemOutput> {
			constructor() {
				super({ concurrency: 3 })
			}

			async data(input: Item): Promise<ItemOutput> {
				itemActive++
				maxItemActive = Math.max(maxItemActive, itemActive)
				await new Promise(r => setTimeout(r, 10))
				itemActive--
				return { id: input.id }
			}

			includesMap = {
				resolved: async (input: Item) => {
					includeActive++
					maxIncludeActive = Math.max(maxIncludeActive, includeActive)
					await new Promise(r => setTimeout(r, 20))
					includeActive--
					return `resolved-${input.id}`
				},
			}

			includesConcurrency = {
				resolved: 2,
			}
		}

		const transformer = new CombinedThrottleTransformer()
		const inputs = Array.from({ length: 10 }, (_, i) => ({ id: i }))

		const results = await transformer.transformMany({
			inputs,
			includes: ['resolved'],
		})

		expect(results).toHaveLength(10)
		expect(maxItemActive).toBeLessThanOrEqual(3)
		expect(maxIncludeActive).toBeLessThanOrEqual(2)
		expect(maxItemActive).toBeGreaterThan(1) // actually ran items in parallel
		expect(maxIncludeActive).toBeGreaterThan(1) // actually ran includes in parallel
	})
})

describe('Concurrency - error handling', () => {
	it('should release semaphore slot when data() throws', async () => {
		let active = 0
		let maxActive = 0

		class ErrorTransformer extends AbstractTransformer<Item, ItemOutput> {
			constructor() {
				super({ concurrency: 2 })
			}

			async data(input: Item): Promise<ItemOutput> {
				active++
				maxActive = Math.max(maxActive, active)
				await new Promise(r => setTimeout(r, 10))
				active--
				if (input.id === 3) throw new Error('data error')
				return { id: input.id }
			}
		}

		const transformer = new ErrorTransformer()
		const inputs = Array.from({ length: 6 }, (_, i) => ({ id: i }))

		await expect(transformer.transformMany({ inputs })).rejects.toThrow('data error')
		expect(maxActive).toBeLessThanOrEqual(2)
	})

	it('should release include semaphore slot when include throws', async () => {
		let active = 0
		let maxActive = 0

		class IncludeErrorTransformer extends AbstractTransformer<Item, ItemOutput> {
			data(input: Item): ItemOutput {
				return { id: input.id }
			}

			includesMap = {
				resolved: async (input: Item) => {
					active++
					maxActive = Math.max(maxActive, active)
					await new Promise(r => setTimeout(r, 10))
					active--
					if (input.id === 2) throw new Error('include error')
					return `resolved-${input.id}`
				},
			}

			includesConcurrency = {
				resolved: 1,
			}
		}

		const transformer = new IncludeErrorTransformer()
		const inputs = Array.from({ length: 4 }, (_, i) => ({ id: i }))

		await expect(transformer.transformMany({ inputs, includes: ['resolved'] })).rejects.toThrow('include error')
		expect(maxActive).toBeLessThanOrEqual(1)
	})
})

describe('Concurrency - validation', () => {
	it('should throw for invalid concurrency values', () => {
		expect(() => {
			class Bad extends AbstractTransformer<Item, ItemOutput> {
				constructor() {
					super({ concurrency: 0 })
				}
				data(input: Item): ItemOutput {
					return { id: input.id }
				}
			}
			new Bad()
		}).toThrow()

		expect(() => {
			class Bad extends AbstractTransformer<Item, ItemOutput> {
				constructor() {
					super({ concurrency: -1 })
				}
				data(input: Item): ItemOutput {
					return { id: input.id }
				}
			}
			new Bad()
		}).toThrow()

		expect(() => {
			class Bad extends AbstractTransformer<Item, ItemOutput> {
				constructor() {
					super({ concurrency: 1.5 })
				}
				data(input: Item): ItemOutput {
					return { id: input.id }
				}
			}
			new Bad()
		}).toThrow()
	})
})
