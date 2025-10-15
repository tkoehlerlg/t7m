import type { Env } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { AnyAbstractTransformer, IncludesOf, InputOf, OutputOf, PropsOf } from '../typeHelper'
import type { HeaderRecord } from './types'

export const t7mMiddleware = <TEnv extends Env>() =>
	createMiddleware<TEnv>(async (c, next) => {
		const { include } = c.req.query()

		c.transform = async function <T extends AnyAbstractTransformer>(
			input: InputOf<T>,
			transformer: T,
			extras: {
				includes?: IncludesOf<T>[]
				wrapper?: (data: OutputOf<T>) => object
				debug?: boolean
			} & (PropsOf<T> extends undefined ? { props: never } : { props: PropsOf<T> }),
			status?: ContentfulStatusCode,
			headers?: HeaderRecord
		) {
			const { props, includes, wrapper, debug } = extras
			if (debug) console.log('[T7M] Transforming (One): \n', JSON.stringify(input, null, 2).substring(0, 300))
			const processedIncludes = includes || include?.split(',')
			if (debug && processedIncludes) console.log('[T7M] Includes Received:', processedIncludes)
			const transformed = await transformer._transform({
				input,
				props,
				unsafeIncludes: processedIncludes,
			})
			if (debug)
				console.log('[T7M] Transformed (One) ✅: \n', JSON.stringify(transformed, null, 2).substring(0, 300))
			const response = wrapper ? wrapper(transformed) : transformed
			if (debug && wrapper)
				console.log('[T7M] Response (One, Wrapped) ✅: \n', JSON.stringify(response, null, 2).substring(0, 300))
			// @ts-expect-error Hono's json method has complex overloads that don't align with our return type
			return c.json(response, status, headers)
		}

		c.transformMany = async function <T extends AnyAbstractTransformer>(
			inputs: InputOf<T>[],
			transformer: T,
			extras: {
				includes?: IncludesOf<T>[]
				wrapper?: (data: OutputOf<T>[]) => object
				debug?: boolean
			} & (PropsOf<T> extends undefined ? { props: never } : { props: PropsOf<T> }),
			status?: ContentfulStatusCode,
			headers?: HeaderRecord
		) {
			const { props, includes, wrapper, debug } = extras
			if (debug) console.log('[T7M] Transforming many: \n', JSON.stringify(inputs, null, 2).substring(0, 300))
			const processedIncludes = includes || include?.split(',')
			if (debug && processedIncludes) console.log('[T7M] Includes Received:', processedIncludes)
			const transformed = await transformer._transformMany({
				inputs,
				props,
				unsafeIncludes: processedIncludes,
			})
			if (debug)
				console.log('[T7M] Transformed (Many) ✅: \n', JSON.stringify(transformed, null, 2).substring(0, 300))
			const response = wrapper ? wrapper(transformed) : transformed
			if (debug && wrapper)
				console.log(
					'[T7M] Response (Many, Wrapped) ✅: \n',
					JSON.stringify(response, null, 2).substring(0, 300)
				)
			return c.json(response, status, headers)
		}

		await next()
	})
