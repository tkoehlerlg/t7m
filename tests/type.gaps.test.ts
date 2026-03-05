// Type-level gap tests for AbstractTransformer
// These are compile-time only assertions - no runtime tests.

import type { IncludesOf, InputOf, OutputOf, PropsOf } from '../src'
import { AbstractTransformer, type IncludeFunction } from '../src/abstractTransformer'

// Helper types for testing type equality
type Expect<T extends true> = T
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

// ─── Test Data Types ────────────────────────────────────────────────

interface Item {
	id: number
	name: string
	categoryId: number
}

interface ItemOutput {
	id: number
	name: string
	category?: string
	tags?: string[]
}

interface ItemProps extends Record<string, unknown> {
	locale: string
}

// ─── 1. unsafeIncludes parameter type ───────────────────────────────
// Verify that transform() and transformMany() accept unsafeIncludes: string[]

class ItemTransformer extends AbstractTransformer<Item, ItemOutput, ItemProps> {
	data(input: Item, props: ItemProps): ItemOutput {
		return { id: input.id, name: input.name }
	}

	includesMap = {
		category: (input: Item, props: ItemProps) => `Category ${input.categoryId}`,
		tags: (input: Item) => ['tag1', 'tag2'],
	}
}

const itemTransformer = new ItemTransformer()

// transform accepts unsafeIncludes
const _unsafeIncludesResult = itemTransformer.transform({
	input: { id: 1, name: 'Item', categoryId: 10 },
	props: { locale: 'en' },
	unsafeIncludes: ['nested.field', 'other'],
})

type test_UnsafeIncludesResult = Expect<Equal<typeof _unsafeIncludesResult, Promise<ItemOutput>>>

// transformMany accepts unsafeIncludes
const _unsafeManyResult = itemTransformer.transformMany({
	inputs: [{ id: 1, name: 'Item', categoryId: 10 }],
	props: { locale: 'en' },
	unsafeIncludes: ['nested.field'],
})

type test_UnsafeManyResult = Expect<Equal<typeof _unsafeManyResult, Promise<ItemOutput[]>>>

// Both includes and unsafeIncludes can be passed simultaneously
const _combinedResult = itemTransformer.transform({
	input: { id: 1, name: 'Item', categoryId: 10 },
	props: { locale: 'en' },
	includes: ['category'],
	unsafeIncludes: ['nested.field'],
})

type test_CombinedResult = Expect<Equal<typeof _combinedResult, Promise<ItemOutput>>>

// ─── 2. _transform and _transformMany signatures ────────────────────

// _transform parameter type
const _genericTransformResult = itemTransformer._transform({
	input: { id: 1, name: 'Item', categoryId: 10 },
	props: { locale: 'en' },
	includes: ['category'],
	unsafeIncludes: ['nested.field'],
})

type test_GenericTransformReturn = Expect<Equal<typeof _genericTransformResult, Promise<ItemOutput>>>

// _transformMany parameter type
const _genericManyResult = itemTransformer._transformMany({
	inputs: [{ id: 1, name: 'Item', categoryId: 10 }],
	props: { locale: 'en' },
	includes: ['tags'],
	unsafeIncludes: ['deep.nested'],
})

type test_GenericManyReturn = Expect<Equal<typeof _genericManyResult, Promise<ItemOutput[]>>>

// _transform requires props when Props is not undefined
type TransformParams = Parameters<typeof itemTransformer._transform>[0]
type test_TransformParamsHasProps = Expect<Equal<TransformParams['props'], ItemProps>>
type test_TransformParamsHasInput = Expect<Equal<TransformParams['input'], Item>>
type test_TransformParamsHasIncludes = Expect<Equal<TransformParams['includes'], ('category' | 'tags')[] | undefined>>
type test_TransformParamsHasUnsafe = Expect<Equal<TransformParams['unsafeIncludes'], string[] | undefined>>

// _transformMany requires props when Props is not undefined
type TransformManyParams = Parameters<typeof itemTransformer._transformMany>[0]
type test_ManyParamsHasProps = Expect<Equal<TransformManyParams['props'], ItemProps>>
type test_ManyParamsHasInputs = Expect<Equal<TransformManyParams['inputs'], Item[]>>

// When Props is undefined, _transform accepts props as undefined
class NoPropsTransformer extends AbstractTransformer<Item, ItemOutput> {
	data(input: Item): ItemOutput {
		return { id: input.id, name: input.name }
	}
}

const noPropsTransformer = new NoPropsTransformer()

type NoPropsTransformParams = Parameters<typeof noPropsTransformer._transform>[0]
type test_NoPropsTransformProps = Expect<Equal<NoPropsTransformParams['props'], undefined>>

// ─── 3. IncludeFunction type ────────────────────────────────────────

// Verify the IncludeFunction type signature matches expected shape
// biome-ignore lint/correctness/noUnusedVariables: type-level test assertion
type ExpectedCategoryIncludeFn = (
	input: Item,
	props: ItemProps,
	forwardedIncludes: string[]
) => Promise<string | undefined> | (string | undefined)

type ActualCategoryIncludeFn = IncludeFunction<Item, ItemOutput, 'category', ItemProps>

type test_IncludeFnInput = Expect<Equal<Parameters<ActualCategoryIncludeFn>[0], Item>>
type test_IncludeFnProps = Expect<Equal<Parameters<ActualCategoryIncludeFn>[1], ItemProps>>
type test_IncludeFnForwarded = Expect<Equal<Parameters<ActualCategoryIncludeFn>[2], string[]>>

// Return type matches the output type for the given key
type test_IncludeFnReturn = Expect<
	Equal<ReturnType<ActualCategoryIncludeFn>, Promise<string | undefined> | (string | undefined)>
>

// IncludeFunction for array includes
type ActualTagsIncludeFn = IncludeFunction<Item, ItemOutput, 'tags', ItemProps>
type test_TagsIncludeFnReturn = Expect<
	Equal<ReturnType<ActualTagsIncludeFn>, Promise<string[] | undefined> | (string[] | undefined)>
>

// ─── 4. Combining includes and unsafeIncludes ───────────────────────

// Both can be passed simultaneously to transform
const _bothResult = itemTransformer.transform({
	input: { id: 1, name: 'Item', categoryId: 10 },
	props: { locale: 'en' },
	includes: ['category', 'tags'],
	unsafeIncludes: ['author.name', 'author.posts'],
})

type test_BothResultType = Expect<Equal<typeof _bothResult, Promise<ItemOutput>>>

// Both can be passed to transformMany
const _bothManyResult = itemTransformer.transformMany({
	inputs: [{ id: 1, name: 'Item', categoryId: 10 }],
	props: { locale: 'en' },
	includes: ['tags'],
	unsafeIncludes: ['deeply.nested.field'],
})

type test_BothManyResultType = Expect<Equal<typeof _bothManyResult, Promise<ItemOutput[]>>>

// Both can be passed to _transform
const _bothGenericResult = itemTransformer._transform({
	input: { id: 1, name: 'Item', categoryId: 10 },
	props: { locale: 'en' },
	includes: ['category'],
	unsafeIncludes: ['extra'],
})

type test_BothGenericResultType = Expect<Equal<typeof _bothGenericResult, Promise<ItemOutput>>>

// Both can be passed to _transformMany
const _bothGenericManyResult = itemTransformer._transformMany({
	inputs: [{ id: 1, name: 'Item', categoryId: 10 }],
	props: { locale: 'en' },
	includes: ['category', 'tags'],
	unsafeIncludes: ['extra.nested'],
})

type test_BothGenericManyResultType = Expect<Equal<typeof _bothGenericManyResult, Promise<ItemOutput[]>>>

// ─── Export type tests to ensure they are evaluated ─────────────────

export type TypeGapTests = {
	unsafeIncludesResult: test_UnsafeIncludesResult
	unsafeManyResult: test_UnsafeManyResult
	combinedResult: test_CombinedResult
	genericTransformReturn: test_GenericTransformReturn
	genericManyReturn: test_GenericManyReturn
	transformParamsHasProps: test_TransformParamsHasProps
	transformParamsHasInput: test_TransformParamsHasInput
	transformParamsHasIncludes: test_TransformParamsHasIncludes
	transformParamsHasUnsafe: test_TransformParamsHasUnsafe
	manyParamsHasProps: test_ManyParamsHasProps
	manyParamsHasInputs: test_ManyParamsHasInputs
	noPropsTransformProps: test_NoPropsTransformProps
	includeFnInput: test_IncludeFnInput
	includeFnProps: test_IncludeFnProps
	includeFnForwarded: test_IncludeFnForwarded
	includeFnReturn: test_IncludeFnReturn
	tagsIncludeFnReturn: test_TagsIncludeFnReturn
	bothResultType: test_BothResultType
	bothManyResultType: test_BothManyResultType
	bothGenericResultType: test_BothGenericResultType
	bothGenericManyResultType: test_BothGenericManyResultType
}
