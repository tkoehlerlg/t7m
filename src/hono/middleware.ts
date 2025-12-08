import { createMiddleware } from 'hono/factory'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { AnyAbstractTransformer } from '../abstractTransformer'
import { IncludesOf, InputOf, OutputOf, PropsOf } from '../typeHelper'
import type { HeaderRecord, JSONRespondReturn } from './types'

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

export const t7mMiddleware = createMiddleware(async (c, next) => {
	const { include } = c.req.query()
	const { include: includues } = c.req.queries()

	c.transform = async function <
		T extends AnyAbstractTransformer,
		O extends { data: OutputOf<T> } | OutputOf<T> = OutputOf<T>,
		U extends ContentfulStatusCode = ContentfulStatusCode,
	>(
		input: InputOf<T>,
		transformer: T,
		extras: {
			includes?: IncludesOf<T>[]
			wrapper?: (data: OutputOf<T>) => O
			debug?: boolean
		} & (PropsOf<T> extends undefined ? { props?: never } : { props: PropsOf<T> }),
		status?: U,
		headers?: HeaderRecord
	): Promise<JSONRespondReturn<O, U>> {
		const { includes, wrapper, debug, props } = extras
		if (debug) log('Transforming (One):\n', input, transformer.constructor.name)
		const processedIncludes = includes || includues || include?.split(',')
		if (debug && processedIncludes) log('Includes Received:', processedIncludes, transformer.constructor.name)
		const transformed: OutputOf<T> = await transformer._transform({
			input,
			props,
			unsafeIncludes: processedIncludes,
		})
		if (debug) log('Transformed (One) ✅:\n', transformed, transformer.constructor.name)
		const response: O = wrapper ? wrapper(transformed) : transformed
		if (debug) log('Response (One) ✅:\n', response, transformer.constructor.name)
		// @ts-expect-error Hono's json method has complex overloads that don't align with our return type
		return c.json(response, status, headers)
	}

	c.transformMany = async function <
		T extends AnyAbstractTransformer,
		O extends { data: OutputOf<T>[] } | OutputOf<T>[] = OutputOf<T>[],
		U extends ContentfulStatusCode = ContentfulStatusCode,
	>(
		inputs: InputOf<T>[],
		transformer: T,
		extras: {
			includes?: IncludesOf<T>[]
			wrapper?: (data: OutputOf<T>[]) => O
			debug?: boolean
		} & (PropsOf<T> extends undefined ? { props?: never } : { props: PropsOf<T> }),
		status?: U,
		headers?: HeaderRecord
	): Promise<JSONRespondReturn<O, U>> {
		const { includes, wrapper, debug, props } = extras
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
		return c.json(response, status, headers)
	}

	await next()
})
