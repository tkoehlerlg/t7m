import type { OnlyPossiblyUndefined } from './typeHelper'

/**
 * Include function type.
 * @template TInput The type of the input object.
 * @template TOutput The type of the output object.
 * @template K The key of the output object to include.
 * @template Props The type of the props object.
 */
export type IncludeFunction<TInput, TOutput, K extends keyof TOutput, Props> = (
    input: TInput,
    props: Props
) => TOutput[K]

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
    Includes extends keyof OnlyPossiblyUndefined<TOutput> = keyof OnlyPossiblyUndefined<TOutput>
> {
    /**
     * Abstract method that must be implemented by subclasses to provide the core transformation logic.
     * @param input The input object to transform.
     * @param props Optional props object for additional parameters.
     * @returns The transformed output object.
     */
    protected abstract data(input: TInput, props: Props): TOutput

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

    /**
     * Transforms a single input object.
     * @param params The parameters for the transformation.
     * @returns The transformed output object.
     */
    public transform(
        params: {
            input: TInput
            includes?: Includes[]
        } & (Props extends undefined ? { props?: Props } : { props: Props })
    ): TOutput {
        const { input, props, includes } = params
        return this._transform(input, props as Props, includes)
    }

    /**
     * Transforms multiple input objects.
     * @param params The parameters for the transformation.
     * @returns The transformed output objects.
     */
    public transformMany(
        params: {
            inputs: TInput[]
            includes?: Includes[]
        } & (Props extends undefined ? { props?: Props } : { props: Props })
    ): TOutput[] {
        const { inputs, props, includes } = params
        return inputs.map(input => this._transform(input, props as Props, includes))
    }

    /**
     * Transforms a single input object.
     * @param input The input object to transform.
     * @param props Optional props object for additional parameters.
     * @param includes Optional array of includes to transform.
     * @returns The transformed output object.
     */
    private _transform(input: TInput, props: Props, includes?: Includes[]): TOutput {
        const data = this.data(input, props)
        if (includes && includes.length > 0) {
            const validIncludes = includes.filter(include => include in this.includesMap)
            for (const include of validIncludes) {
                data[include] = this.includesMap[include](input, props)
            }
        }
        return data
    }
}
