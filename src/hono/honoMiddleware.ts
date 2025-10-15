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
			} & (PropsOf<T> extends undefined ? { props: never } : { props: PropsOf<T> }),
			status?: ContentfulStatusCode,
			headers?: HeaderRecord
		) {
			const { props, includes, wrapper } = extras
			const processedIncludes = includes || include?.split(',')
			const transformed = await transformer._transform({
				input,
				props,
				unsafeIncludes: processedIncludes,
			})
			const response = wrapper ? wrapper(transformed) : transformed
			// @ts-expect-error Hono's json method has complex overloads that don't align with our return type
			return c.json(response, status, headers)
		}

		c.transformMany = async function <T extends AnyAbstractTransformer>(
			inputs: InputOf<T>[],
			transformer: T,
			extras: {
				includes?: IncludesOf<T>[]
				wrapper?: (data: OutputOf<T>[]) => object
			} & (PropsOf<T> extends undefined ? { props: never } : { props: PropsOf<T> }),
			status?: ContentfulStatusCode,
			headers?: HeaderRecord
		) {
			const { props, includes, wrapper } = extras
			const processedIncludes = includes || include?.split(',')
			const transformed = await transformer._transformMany({
				inputs,
				props,
				unsafeIncludes: processedIncludes,
			})
			const response = wrapper ? wrapper(transformed) : transformed
			return c.json(response, status, headers)
		}

		await next()
	})
