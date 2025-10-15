import type { Env } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { AnyAbstractTransformer, IncludesOf, InputOf, OutputOf, PropsOf } from '../typeHelper'
import type { HeaderRecord } from './types'

const T7M_PREFIX = '\x1b[36m[T7M]\x1b[0m'

const log = (message: string, data?: unknown, transformerName?: string) => {
	const nameTag = transformerName ? `\x1b[33m[${transformerName}]\x1b[0m` : ''
	if (data !== undefined) {
		const jsonData = typeof data === 'string' ? data : JSON.stringify(data, null, 2).substring(0, 300)
		console.log(T7M_PREFIX, nameTag, message, jsonData)
	} else {
		console.log(T7M_PREFIX, nameTag, message)
	}
}

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
			if (debug) log('Transforming (One):\n', input, transformer.constructor.name)
			const processedIncludes = includes || include?.split(',')
			if (debug && processedIncludes) log('Includes Received:', processedIncludes, transformer.constructor.name)
			const transformed = await transformer._transform({
				input,
				props,
				unsafeIncludes: processedIncludes,
			})
			if (debug) log('Transformed (One) ✅:\n', transformed, transformer.constructor.name)
			const response = wrapper ? wrapper(transformed) : transformed
			if (debug && wrapper) log('Response (One, Wrapped) ✅:\n', response, transformer.constructor.name)
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
			if (debug) log('Transforming (Many):\n', inputs, transformer.constructor.name)
			const processedIncludes = includes || include?.split(',')
			if (debug && processedIncludes) log('Includes Received:', processedIncludes, transformer.constructor.name)
			const transformed = await transformer._transformMany({
				inputs,
				props,
				unsafeIncludes: processedIncludes,
			})
			if (debug) log('Transformed (Many) ✅:\n', transformed, transformer.constructor.name)
			const response = wrapper ? wrapper(transformed) : transformed
			if (debug && wrapper) log('Response (Many, Wrapped) ✅:\n', response, transformer.constructor.name)
			return c.json(response, status, headers)
		}

		await next()
	})
