/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it } from 'bun:test'
import { AbstractTransformer } from '../src/abstractTransformer'
import { Cache } from '../src/cache'

// Test data types

interface Item {
	id: number
	name: string
	category: string
}

interface ItemOutput {
	label: string
	tags?: string[]
	extra?: string
	nested?: { value: number }
}

describe('AbstractTransformer - Gap Coverage', () => {
	const testItem: Item = {
		id: 1,
		name: 'Widget',
		category: 'tools',
	}

	const testItems: Item[] = [
		testItem,
		{ id: 2, name: 'Gadget', category: 'electronics' },
		{ id: 3, name: 'Gizmo', category: 'tools' },
	]

	// MARK: _transformMany

	describe('_transformMany() direct call', () => {
		it('should transform multiple inputs and return all results', async () => {
			class SimpleTransformer extends AbstractTransformer<Item, ItemOutput> {
				data(input: Item): ItemOutput {
					return { label: input.name }
				}

				includesMap = {}
			}

			const transformer = new SimpleTransformer()
			const results = await transformer._transformMany({
				inputs: testItems,
				props: undefined,
			})

			expect(results).toHaveLength(3)
			expect(results[0]).toEqual({ label: 'Widget' })
			expect(results[1]).toEqual({ label: 'Gadget' })
			expect(results[2]).toEqual({ label: 'Gizmo' })
		})

		it('should clear cache after _transformMany by default', async () => {
			let fetchCount = 0
			const fetcher = async (id: number) => {
				fetchCount++
				return { tag: `tag-${id}` }
			}

			class CachedTransformer extends AbstractTransformer<Item, ItemOutput> {
				cache = {
					tagFetcher: new Cache(fetcher),
				}

				data(input: Item): ItemOutput {
					return { label: input.name }
				}

				includesMap = {
					tags: async (input: Item) => {
						const result = await this.cache.tagFetcher.call(input.id)
						return [result.tag]
					},
				}
			}

			const transformer = new CachedTransformer()

			// First _transformMany call
			await transformer._transformMany({
				inputs: [testItem],
				props: undefined,
				includes: ['tags'],
			})
			expect(fetchCount).toBe(1)

			// Second _transformMany call - cache should have been cleared
			await transformer._transformMany({
				inputs: [testItem],
				props: undefined,
				includes: ['tags'],
			})
			expect(fetchCount).toBe(2)
		})

		it('should not clear cache in _transformMany when clearCacheOnTransform is false', async () => {
			let fetchCount = 0
			const fetcher = async (id: number) => {
				fetchCount++
				return { tag: `tag-${id}` }
			}

			class PersistentTransformer extends AbstractTransformer<Item, ItemOutput> {
				constructor() {
					super({ clearCacheOnTransform: false })
				}

				cache = {
					tagFetcher: new Cache(fetcher),
				}

				data(input: Item): ItemOutput {
					return { label: input.name }
				}

				includesMap = {
					tags: async (input: Item) => {
						const result = await this.cache.tagFetcher.call(input.id)
						return [result.tag]
					},
				}
			}

			const transformer = new PersistentTransformer()

			await transformer._transformMany({
				inputs: [testItem],
				props: undefined,
				includes: ['tags'],
			})
			expect(fetchCount).toBe(1)

			// Cache persists, so no additional fetch
			await transformer._transformMany({
				inputs: [testItem],
				props: undefined,
				includes: ['tags'],
			})
			expect(fetchCount).toBe(1)
		})

		it('should call onBeforeTransform and onAfterTransform to manage child transformer cache', async () => {
			let childFetchCount = 0
			const childFetcher = async (id: number) => {
				childFetchCount++
				return { value: id }
			}

			class ChildTransformer extends AbstractTransformer<Item, ItemOutput> {
				cache = {
					valueFetcher: new Cache(childFetcher),
				}

				data(input: Item): ItemOutput {
					return { label: input.name }
				}

				includesMap = {
					nested: async (input: Item) => {
						const result = await this.cache.valueFetcher.call(input.id)
						return { value: result.value }
					},
				}
			}

			class ParentTransformer extends AbstractTransformer<Item, ItemOutput> {
				childTransformer = new ChildTransformer()

				transformers = {
					child: this.childTransformer,
				}

				data(input: Item): ItemOutput {
					return { label: input.name }
				}

				includesMap = {
					tags: async (input: Item) => {
						const childResult = await this.childTransformer._transform({
							input,
							props: undefined,
							includes: ['nested'],
						})
						return [String(childResult.nested?.value)]
					},
				}
			}

			const parent = new ParentTransformer()

			// During _transformMany, child's clearCacheOnTransform should be temporarily disabled
			// so that the child does not clear its own cache mid-batch
			const results = await parent._transformMany({
				inputs: [testItem, testItem],
				props: undefined,
				includes: ['tags'],
			})

			expect(results).toHaveLength(2)
			expect(results[0]!.tags).toEqual(['1'])
			expect(results[1]!.tags).toEqual(['1'])

			// The child fetcher should have been called only once since cache is shared
			// and clearCacheOnTransform was disabled for child during the parent batch
			expect(childFetchCount).toBe(1)
		})
	})

	// MARK: unsafeIncludes

	describe('unsafeIncludes', () => {
		class IncludeTransformer extends AbstractTransformer<Item, ItemOutput> {
			data(input: Item): ItemOutput {
				return { label: input.name }
			}

			includesMap = {
				tags: (input: Item) => [input.category],
				extra: (input: Item) => `extra-${input.id}`,
			}
		}

		it('should resolve unsafeIncludes that match includesMap keys', async () => {
			const transformer = new IncludeTransformer()
			const result = await transformer.transform({
				input: testItem,
				unsafeIncludes: ['tags'],
			})

			expect(result.tags).toEqual(['tools'])
		})

		it('should combine typed includes and unsafeIncludes', async () => {
			const transformer = new IncludeTransformer()
			const result = await transformer.transform({
				input: testItem,
				includes: ['tags'],
				unsafeIncludes: ['extra'],
			})

			expect(result.tags).toEqual(['tools'])
			expect(result.extra).toBe('extra-1')
		})

		it('should ignore unsafeIncludes that do not match any includesMap key', async () => {
			const transformer = new IncludeTransformer()
			const result = await transformer.transform({
				input: testItem,
				unsafeIncludes: ['nonExistentKey'],
			})

			expect(result).toEqual({ label: 'Widget' })
			expect(result.tags).toBeUndefined()
		})

		it('should support unsafeIncludes in transformMany', async () => {
			const transformer = new IncludeTransformer()
			const results = await transformer.transformMany({
				inputs: testItems,
				unsafeIncludes: ['extra'],
			})

			expect(results[0]!.extra).toBe('extra-1')
			expect(results[1]!.extra).toBe('extra-2')
			expect(results[2]!.extra).toBe('extra-3')
		})

		it('should support unsafeIncludes in _transform', async () => {
			const transformer = new IncludeTransformer()
			const result = await transformer._transform({
				input: testItem,
				props: undefined,
				unsafeIncludes: ['tags'],
			})

			expect(result.tags).toEqual(['tools'])
		})

		it('should support unsafeIncludes in _transformMany', async () => {
			const transformer = new IncludeTransformer()
			const results = await transformer._transformMany({
				inputs: testItems,
				props: undefined,
				unsafeIncludes: ['extra'],
			})

			expect(results[0]!.extra).toBe('extra-1')
			expect(results[1]!.extra).toBe('extra-2')
			expect(results[2]!.extra).toBe('extra-3')
		})
	})

	// MARK: Duplicate includes deduplication

	describe('Duplicate includes deduplication', () => {
		it('should run each include function only once even if duplicated', async () => {
			let tagsCallCount = 0

			class CountingTransformer extends AbstractTransformer<Item, ItemOutput> {
				data(input: Item): ItemOutput {
					return { label: input.name }
				}

				includesMap = {
					tags: (input: Item) => {
						tagsCallCount++
						return [input.category]
					},
				}
			}

			const transformer = new CountingTransformer()
			const result = await transformer.transform({
				input: testItem,
				includes: ['tags', 'tags', 'tags'],
			})

			expect(result.tags).toEqual(['tools'])
			expect(tagsCallCount).toBe(1)
		})

		it('should deduplicate across typed includes and unsafeIncludes', async () => {
			let extraCallCount = 0

			class CountingTransformer extends AbstractTransformer<Item, ItemOutput> {
				data(input: Item): ItemOutput {
					return { label: input.name }
				}

				includesMap = {
					extra: (input: Item) => {
						extraCallCount++
						return `extra-${input.id}`
					},
				}
			}

			const transformer = new CountingTransformer()
			const result = await transformer.transform({
				input: testItem,
				includes: ['extra'],
				unsafeIncludes: ['extra'],
			})

			expect(result.extra).toBe('extra-1')
			expect(extraCallCount).toBe(1)
		})
	})

	// MARK: data() throwing

	describe('data() throwing (async rejection)', () => {
		it('should propagate a rejected promise from async data()', async () => {
			class FailingDataTransformer extends AbstractTransformer<Item, ItemOutput> {
				async data(_input: Item): Promise<ItemOutput> {
					throw new Error('Database connection failed')
				}

				includesMap = {}
			}

			const transformer = new FailingDataTransformer()

			await expect(
				transformer.transform({ input: testItem })
			).rejects.toThrow('Database connection failed')
		})

		it('should propagate a rejected promise from data() in transformMany', async () => {
			class FailingDataTransformer extends AbstractTransformer<Item, ItemOutput> {
				async data(_input: Item): Promise<ItemOutput> {
					return Promise.reject(new Error('Service unavailable'))
				}

				includesMap = {}
			}

			const transformer = new FailingDataTransformer()

			await expect(
				transformer.transformMany({ inputs: testItems })
			).rejects.toThrow('Service unavailable')
		})

		it('should propagate a rejected promise from data() in _transform', async () => {
			class FailingDataTransformer extends AbstractTransformer<Item, ItemOutput> {
				async data(_input: Item): Promise<ItemOutput> {
					throw new Error('Unexpected failure')
				}

				includesMap = {}
			}

			const transformer = new FailingDataTransformer()

			await expect(
				transformer._transform({ input: testItem, props: undefined })
			).rejects.toThrow('Unexpected failure')
		})

		it('should propagate a rejected promise from data() in _transformMany', async () => {
			class FailingDataTransformer extends AbstractTransformer<Item, ItemOutput> {
				async data(_input: Item): Promise<ItemOutput> {
					throw new Error('Batch failure')
				}

				includesMap = {}
			}

			const transformer = new FailingDataTransformer()

			await expect(
				transformer._transformMany({ inputs: testItems, props: undefined })
			).rejects.toThrow('Batch failure')
		})
	})

	// MARK: data() returning null

	describe('data() returning null', () => {
		it('should skip includes when data() returns null', async () => {
			let includeWasCalled = false

			class NullDataTransformer extends AbstractTransformer<Item, any> {
				data(_input: Item): any {
					return null
				}

				includesMap = {
					tags: (_input: Item) => {
						includeWasCalled = true
						return ['should-not-appear']
					},
				}
			}

			const transformer = new NullDataTransformer()
			const result = await transformer.transform({
				input: testItem,
				includes: ['tags'] as any,
			})

			expect(result).toBeNull()
			expect(includeWasCalled).toBe(false)
		})

		it('should skip includes when data() returns a non-object primitive', async () => {
			let includeWasCalled = false

			class PrimitiveDataTransformer extends AbstractTransformer<Item, any> {
				data(_input: Item): any {
					return 42
				}

				includesMap = {
					tags: (_input: Item) => {
						includeWasCalled = true
						return ['should-not-appear']
					},
				}
			}

			const transformer = new PrimitiveDataTransformer()
			const result = await transformer.transform({
				input: testItem,
				includes: ['tags'] as any,
			})

			expect(result).toBe(42)
			expect(includeWasCalled).toBe(false)
		})
	})

	// MARK: Non-Error rejection in includes

	describe('Non-Error rejection in includes', () => {
		it('should wrap a thrown string in the error message', async () => {
			class StringThrowTransformer extends AbstractTransformer<Item, ItemOutput> {
				data(input: Item): ItemOutput {
					return { label: input.name }
				}

				includesMap = {
					tags: () => {
						throw 'something went wrong'
					},
				}
			}

			const transformer = new StringThrowTransformer()

			await expect(
				transformer.transform({ input: testItem, includes: ['tags'] })
			).rejects.toThrow("[T7M] Error in include function 'tags': something went wrong")
		})

		it('should wrap a thrown number in the error message', async () => {
			class NumberThrowTransformer extends AbstractTransformer<Item, ItemOutput> {
				data(input: Item): ItemOutput {
					return { label: input.name }
				}

				includesMap = {
					tags: () => {
						throw 404
					},
				}
			}

			const transformer = new NumberThrowTransformer()

			await expect(
				transformer.transform({ input: testItem, includes: ['tags'] })
			).rejects.toThrow("[T7M] Error in include function 'tags': 404")
		})

		it('should wrap a thrown object in the error message using String()', async () => {
			class ObjectThrowTransformer extends AbstractTransformer<Item, ItemOutput> {
				data(input: Item): ItemOutput {
					return { label: input.name }
				}

				includesMap = {
					extra: () => {
						throw { code: 'FAIL', detail: 'bad input' }
					},
				}
			}

			const transformer = new ObjectThrowTransformer()

			await expect(
				transformer.transform({ input: testItem, includes: ['extra'] })
			).rejects.toThrow("[T7M] Error in include function 'extra': [object Object]")
		})

		it('should use error.message when an Error instance is thrown', async () => {
			class ErrorThrowTransformer extends AbstractTransformer<Item, ItemOutput> {
				data(input: Item): ItemOutput {
					return { label: input.name }
				}

				includesMap = {
					tags: () => {
						throw new TypeError('Cannot read property of undefined')
					},
				}
			}

			const transformer = new ErrorThrowTransformer()

			await expect(
				transformer.transform({ input: testItem, includes: ['tags'] })
			).rejects.toThrow("[T7M] Error in include function 'tags': Cannot read property of undefined")
		})

		it('should wrap a rejected promise with a non-Error value', async () => {
			class AsyncStringThrowTransformer extends AbstractTransformer<Item, ItemOutput> {
				data(input: Item): ItemOutput {
					return { label: input.name }
				}

				includesMap = {
					tags: async () => {
						return Promise.reject('async failure')
					},
				}
			}

			const transformer = new AsyncStringThrowTransformer()

			await expect(
				transformer.transform({ input: testItem, includes: ['tags'] })
			).rejects.toThrow("[T7M] Error in include function 'tags': async failure")
		})
	})

	// MARK: Forwarded includes (otherIncludes)

	describe('Forwarded includes (otherIncludes)', () => {
		it('should pass includes not in includesMap as forwardedIncludes to include functions', async () => {
			let capturedForwardedIncludes: string[] = []

			class ForwardingTransformer extends AbstractTransformer<Item, ItemOutput> {
				data(input: Item): ItemOutput {
					return { label: input.name }
				}

				includesMap = {
					tags: (_input: Item, _props: undefined, forwardedIncludes: string[]) => {
						capturedForwardedIncludes = forwardedIncludes
						return ['resolved']
					},
				}
			}

			const transformer = new ForwardingTransformer()
			await transformer.transform({
				input: testItem,
				includes: ['tags'],
				unsafeIncludes: ['childIncludeA', 'childIncludeB'],
			})

			expect(capturedForwardedIncludes).toEqual(['childIncludeA', 'childIncludeB'])
		})

		it('should forward only includes that are NOT in includesMap', async () => {
			let capturedForwarded: string[] = []

			class PartialIncludesTransformer extends AbstractTransformer<Item, ItemOutput> {
				data(input: Item): ItemOutput {
					return { label: input.name }
				}

				includesMap = {
					tags: (_input: Item, _props: undefined, forwardedIncludes: string[]) => {
						capturedForwarded = forwardedIncludes
						return ['tag']
					},
					extra: () => 'extra-value',
				}
			}

			const transformer = new PartialIncludesTransformer()
			await transformer.transform({
				input: testItem,
				includes: ['tags', 'extra'],
				unsafeIncludes: ['unknownA', 'unknownB'],
			})

			// 'tags' and 'extra' are in includesMap, so only 'unknownA' and 'unknownB' are forwarded
			expect(capturedForwarded).toEqual(['unknownA', 'unknownB'])
		})

		it('should pass empty forwardedIncludes when all includes are in includesMap', async () => {
			let capturedForwarded: string[] | null = null

			class AllKnownTransformer extends AbstractTransformer<Item, ItemOutput> {
				data(input: Item): ItemOutput {
					return { label: input.name }
				}

				includesMap = {
					tags: (_input: Item, _props: undefined, forwardedIncludes: string[]) => {
						capturedForwarded = forwardedIncludes
						return ['tag']
					},
				}
			}

			const transformer = new AllKnownTransformer()
			await transformer.transform({
				input: testItem,
				includes: ['tags'],
			})

			expect(capturedForwarded).toEqual([])
		})

		it('should allow include functions to use forwardedIncludes for sub-transformer calls', async () => {
			interface ParentOutput {
				label: string
				childData?: { sublabel: string; detail?: string }
			}

			class ChildTransformer extends AbstractTransformer<Item, { sublabel: string; detail?: string }> {
				data(input: Item) {
					return { sublabel: `sub-${input.name}` }
				}

				includesMap = {
					detail: (input: Item) => `detail-${input.id}`,
				}
			}

			class ParentTransformer extends AbstractTransformer<Item, ParentOutput> {
				private child = new ChildTransformer()

				data(input: Item): ParentOutput {
					return { label: input.name }
				}

				includesMap = {
					childData: async (input: Item, _props: undefined, forwardedIncludes: string[]) => {
						return this.child.transform({
							input,
							includes: forwardedIncludes as any,
						})
					},
				}
			}

			const transformer = new ParentTransformer()

			// 'childData' is in parent includesMap; 'detail' is not, so it's forwarded
			const result = await transformer.transform({
				input: testItem,
				includes: ['childData'],
				unsafeIncludes: ['detail'],
			})

			expect(result.childData).toEqual({
				sublabel: 'sub-Widget',
				detail: 'detail-1',
			})
		})
	})
})
