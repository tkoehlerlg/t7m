import type { AnyCache, Cache } from './lib/cache'
import { Semaphore } from './lib/semaphore'
import type { OnlyPossiblyUndefined } from './lib/types'

/**
 * Include function type.
 * @template TInput The type of the input object.
 * @template TOutput The type of the output object.
 * @template K The key of the output object to include.
 * @template Props The type of the props object.
 */
type IncludeFunction<TInput, TOutput, K extends keyof TOutput, Props> = (
	input: TInput,
	props: Props,
	forwardedIncludes: string[]
) => Promise<TOutput[K]> | TOutput[K]

/**
 * Abstract transformer class.
 * @template TInput The type of the input object.
 * @template TOutput The type of the output object.
 * @template Props The type of the props object.
 * @template Includes The type of the includes object.
 */
abstract class AbstractTransformer<
	TInput,
	TOutput,
	Props extends Record<string, unknown> | undefined = undefined,
	Includes extends keyof OnlyPossiblyUndefined<TOutput> = keyof OnlyPossiblyUndefined<TOutput>,
> {
	protected readonly clearCacheOnTransform: boolean
	private readonly semaphore?: Semaphore

	// MARK: Constructor
	/**
	 * Creates a new transformer instance.
	 * @param params - Configuration options for the transformer.
	 * @param params.clearCacheOnTransform - Whether to clear the cache after each transform call. Defaults to `true`.
	 * @param params.concurrency - Maximum number of items to process in parallel in `transformMany` / `_transformMany`. Defaults to unlimited. Does not apply to single-item `transform` / `_transform`.
	 */
	constructor(params?: { clearCacheOnTransform?: boolean; concurrency?: number }) {
		this.clearCacheOnTransform = params?.clearCacheOnTransform ?? true
		if (params?.concurrency !== undefined) {
			try {
				this.semaphore = new Semaphore(params.concurrency)
			} catch {
				throw new Error(`[T7M] concurrency must be a positive integer, got ${params.concurrency}`)
			}
		}
	}

	// MARK: Data
	/**
	 * Abstract method that must be implemented by subclasses to provide the core transformation logic.
	 * @param input The input object to transform.
	 * @param props Optional props object for additional parameters.
	 * @returns The transformed output object.
	 */
	protected abstract data(input: TInput, props: Props): TOutput | Promise<TOutput>

	// MARK: Includes
	/**
	 * Map of include functions for each possible include.
	 * @template K The key of the output object to include.
	 * @template Props The type of the props object.
	 */
	protected readonly includesMap: Partial<{
		[K in Includes]: IncludeFunction<TInput, TOutput, K, Props>
	}> = {}

	/**
	 * Concurrency limits for individual include functions.
	 * When set, limits the number of concurrent invocations of a specific include function across all items.
	 * Include keys not listed here remain unlimited.
	 * @example
	 * ```ts
	 * protected readonly includesConcurrency = {
	 *   posts: 3,   // max 3 concurrent 'posts' include calls
	 *   avatar: 2,  // max 2 concurrent 'avatar' include calls
	 * }
	 * ```
	 */
	protected readonly includesConcurrency: Partial<{
		[K in Includes]: number
	}> = {}

	private _includeSemaphores?: Partial<Record<Includes, Semaphore>>

	private get includeSemaphores(): Partial<Record<Includes, Semaphore>> {
		if (!this._includeSemaphores) {
			this._includeSemaphores = {} as Partial<Record<Includes, Semaphore>>
			for (const key of Object.keys(this.includesConcurrency) as Includes[]) {
				const limit = this.includesConcurrency[key]
				if (limit !== undefined) {
					try {
						this._includeSemaphores[key] = new Semaphore(limit)
					} catch {
						throw new Error(
							`[T7M] includesConcurrency limit for '${String(key)}' must be a positive integer, got ${limit}`
						)
					}
				}
			}
		}
		return this._includeSemaphores
	}

	// MARK: Cache
	readonly cache: Record<string, AnyCache> = {}

	public clearCache = () => this._clearCache()

	private _clearCache = (clearedFor: Set<AnyAbstractTransformer> = new Set()) => {
		if (clearedFor.has(this)) return
		Object.keys(this.cache).forEach(key => this.cache[key]?.clear())
		clearedFor.add(this)
		Object.keys(this.transformers).forEach(key => {
			const transformer = this.transformers[key]!
			if ('call' in transformer) return transformer.call()._clearCache(clearedFor)
			transformer._clearCache(clearedFor)
		})
	}

	// MARK: Transformer
	transformers: Record<string, AnyAbstractTransformer | Cache<() => AnyAbstractTransformer>> = {}

	// Tracks how many _transform/_transformMany calls are currently active on this node (or any ancestor).
	// Cache is only cleared when this reaches 0, preventing premature clearing during concurrent transforms.
	private activeTransforms = 0

	private adjustActiveTransforms = (delta: 1 | -1, visited: Set<AnyAbstractTransformer> = new Set()) => {
		if (visited.has(this)) return
		visited.add(this)
		this.activeTransforms += delta
		Object.keys(this.transformers).forEach(key => {
			const transformer = this.transformers[key]!
			if ('call' in transformer) {
				transformer.call().adjustActiveTransforms(delta, visited)
			} else transformer.adjustActiveTransforms(delta, visited)
		})
	}

	private runTransform(input: TInput, props: Props, includes: (Includes | string)[]): Promise<TOutput> {
		const exec = () => this.__transform(input, props, includes)
		return this.semaphore ? this.semaphore.run(exec) : exec()
	}

	/**
	 * Transforms a single input object.
	 * @param params The parameters for the transformation.
	 * @returns The transformed output object.
	 */
	public async transform(
		params: {
			input: TInput
			includes?: Includes[]
			unsafeIncludes?: string[]
		} & (Props extends undefined ? { props?: never } : { props: Props })
	): Promise<TOutput> {
		const { input, props, includes, unsafeIncludes } = params
		const combinedIncludes = [...(includes || []), ...(unsafeIncludes || [])]
		return this.__transform(input, props as Props, combinedIncludes)
	}

	/**
	 * Transforms multiple input objects.
	 * @param params The parameters for the transformation.
	 * @returns The transformed output objects.
	 */
	public async transformMany(
		params: {
			inputs: TInput[]
			includes?: Includes[]
			unsafeIncludes?: string[]
		} & (Props extends undefined ? { props?: never } : { props: Props })
	): Promise<TOutput[]> {
		const { inputs, props, includes, unsafeIncludes } = params
		const combinedIncludes = [...(includes || []), ...(unsafeIncludes || [])]
		return Promise.all(inputs.map(input => this.runTransform(input, props as Props, combinedIncludes)))
	}

	// Generic functions
	/**
	 * Transforms a single input object. (Easier to use in generic functions)
	 * @param params The parameters for the transformation.
	 * @returns The transformed output object.
	 */
	public async _transform(params: {
		input: TInput
		props: Props
		includes?: Includes[]
		unsafeIncludes?: string[]
	}): Promise<TOutput> {
		const { input, props, includes, unsafeIncludes } = params
		const combinedIncludes = [...(includes || []), ...(unsafeIncludes || [])]
		this.adjustActiveTransforms(1)
		try {
			return await this.__transform(input, props, combinedIncludes)
		} finally {
			this.adjustActiveTransforms(-1)
			if (this.activeTransforms === 0 && this.clearCacheOnTransform) this.clearCache()
		}
	}

	/**
	 * Transforms multiple input objects. (Easier to use in generic functions)
	 * @param params The parameters for the transformation.
	 * @returns The transformed output objects.
	 */
	public async _transformMany(params: {
		inputs: TInput[]
		props: Props
		includes?: Includes[]
		unsafeIncludes?: string[]
	}): Promise<TOutput[]> {
		const { inputs, props, includes, unsafeIncludes } = params
		const combinedIncludes = [...(includes || []), ...(unsafeIncludes || [])]
		this.adjustActiveTransforms(1)
		try {
			return await Promise.all(inputs.map(input => this.runTransform(input, props, combinedIncludes)))
		} finally {
			this.adjustActiveTransforms(-1)
			if (this.activeTransforms === 0 && this.clearCacheOnTransform) this.clearCache()
		}
	}

	// Internal transformation function

	/**
	 * Transforms a single input object.
	 * @param input The input object to transform.
	 * @param props Optional props object for additional parameters.
	 * @param includes Optional array of includes to transform.
	 * @returns The transformed output object.
	 */
	private async __transform(input: TInput, props: Props, includes: (Includes | string)[] = []): Promise<TOutput> {
		const data: TOutput = await this.data(input, props)
		// Remove duplicates
		includes = Array.from(new Set(includes))
		// Handle includes
		if (includes.length > 0 && typeof data === 'object' && data !== null) {
			const otherIncludes = includes.filter(include => !(include in this.includesMap))
			const validIncludes = includes
				.filter(include => include in this.includesMap)
				.map(include => include as Includes)
			await Promise.all(
				validIncludes.map(async include => {
					if (!this.includesMap[include]) throw new Error(`Include function not found in includesMap`)
					try {
						const includeFn = this.includesMap[include]!
						const exec = () => includeFn(input, props, otherIncludes)
						const semaphore = this.includeSemaphores[include]
						;(data[include] as TOutput[Includes]) = await (semaphore ? semaphore.run(exec) : exec())
					} catch (error) {
						// Re-throw the error to maintain the expected behavior
						throw new Error(
							`[T7M] Error in include function '${String(include)}': ${error instanceof Error ? error.message : String(error)}`
						)
					}
				})
			)
		}
		return data
	}
}

// MARK: Export
export { AbstractTransformer, type IncludeFunction }
// biome-ignore lint/suspicious/noExplicitAny: any is required for the generic type
export type AnyAbstractTransformer = AbstractTransformer<any, any, any, any>
