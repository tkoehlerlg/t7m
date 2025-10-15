import type { OnlyPossiblyUndefined } from './types'

/**
 * Include function type.
 * @template TInput The type of the input object.
 * @template TOutput The type of the output object.
 * @template K The key of the output object to include.
 * @template Props The type of the props object.
 */
export type IncludeFunction<TInput, TOutput, K extends keyof TOutput, Props> = (
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
export abstract class AbstractTransformer<
	TInput,
	TOutput,
	Props extends Record<string, unknown> | undefined = undefined,
	Includes extends keyof OnlyPossiblyUndefined<TOutput> = keyof OnlyPossiblyUndefined<TOutput>,
> {
	/**
	 * Abstract method that must be implemented by subclasses to provide the core transformation logic.
	 * @param input The input object to transform.
	 * @param props Optional props object for additional parameters.
	 * @returns The transformed output object.
	 */
	protected abstract data(input: TInput, props: Props): TOutput | Promise<TOutput>

	/**
	 * Map of include functions for each possible include.
	 * @template K The key of the output object to include.
	 * @template Props The type of the props object.
	 */
	protected readonly includesMap: {
		[K in Includes]: IncludeFunction<TInput, TOutput, K, Props>
	} = Object.create(null) as {
		[K in Includes]: IncludeFunction<TInput, TOutput, K, Props>
	}

	// Transform functions

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
		return Promise.all(inputs.map(input => this.__transform(input, props as Props, combinedIncludes)))
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
		return this.__transform(input, props, combinedIncludes)
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
		return Promise.all(inputs.map(input => this.__transform(input, props, combinedIncludes)))
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
					try {
						;(data[include] as TOutput[Includes]) = await this.includesMap[include](
							input,
							props,
							otherIncludes
						)
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
