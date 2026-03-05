import { createMiddleware } from 'hono/factory'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AnyAbstractTransformer } from '../abstractTransformer'
import { log } from '../lib/log'
import type { IncludesOf, InputOf, OutputOf, PropsOf } from '../types'
import type { HeaderRecord, JSONRespondReturn } from './types'

export const t7mMiddleware = createMiddleware(async (c, next) => {
	const { include } = c.req.query()

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
