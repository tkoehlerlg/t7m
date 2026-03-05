import Elysia from 'elysia'
import type { AnyAbstractTransformer } from '../abstractTransformer'
import { log } from '../log'
import type { IncludesOf, OutputOf, PropsOf } from '../typeHelper'
import type { TransformFn, TransformManyFn } from './types'

export const t7mPlugin = () =>
	new Elysia({ name: 't7m' }).derive({ as: 'global' }, ({ query }) => {
		const include = (query as Record<string, string | undefined>)?.include

		const transform: TransformFn = async <T extends AnyAbstractTransformer, O = OutputOf<T>>(
			...args: [
				input: unknown,
				transformer: T,
				extras?: {
					includes?: IncludesOf<T>[]
					wrapper?: (data: OutputOf<T>) => O
					debug?: boolean
				} & (PropsOf<T> extends undefined ? { props?: never } : { props: PropsOf<T> }),
			]
		): Promise<O> => {
			const [input, transformer, extras] = args
			const { includes, wrapper, debug, props } = extras ?? {}
			if (debug) log('Transforming (One):\n', input, transformer.constructor.name)
			const processedIncludes = includes || include?.split(',')
			if (debug && processedIncludes) log('Includes Received:', processedIncludes, transformer.constructor.name)
			const transformed: OutputOf<T> = await transformer._transform({
				input,
				props,
				unsafeIncludes: processedIncludes,
			})
			if (debug) log('Transformed (One) ✅:\n', transformed, transformer.constructor.name)
			const response: O = wrapper ? wrapper(transformed) : transformed
			if (debug) log('Response (One) ✅:\n', response, transformer.constructor.name)
			return response
		}

		const transformMany: TransformManyFn = async <T extends AnyAbstractTransformer, O = OutputOf<T>[]>(
			...args: [
				inputs: unknown[],
				transformer: T,
				extras?: {
					includes?: IncludesOf<T>[]
					wrapper?: (data: OutputOf<T>[]) => O
					debug?: boolean
				} & (PropsOf<T> extends undefined ? { props?: never } : { props: PropsOf<T> }),
			]
		): Promise<O> => {
			const [inputs, transformer, extras] = args
			const { includes, wrapper, debug, props } = extras ?? {}
			if (debug) log('Transforming (Many):\n', inputs, transformer.constructor.name)
			const processedIncludes = includes || include?.split(',')
			if (debug && processedIncludes) log('Includes Received:', processedIncludes, transformer.constructor.name)
			const transformed: OutputOf<T>[] = await transformer._transformMany({
				inputs,
				props,
				unsafeIncludes: processedIncludes,
			})
			if (debug) log('Transformed (Many) ✅:\n', transformed, transformer.constructor.name)
			const response: O = wrapper ? wrapper(transformed) : (transformed as O)
			if (debug) log('Response (Many) ✅:\n', response, transformer.constructor.name)
			return response
		}

		return { transform, transformMany }
	})
