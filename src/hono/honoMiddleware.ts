import type { Env } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AbstractTransformer } from '../abstractTransformer'
import { OnlyPossiblyUndefined } from '../typeHelper'
import type { HeaderRecord } from './types'

export const t7mMiddleware = <TEnv extends Env>() =>
	createMiddleware<TEnv>(async (c, next) => {
		const { include } = c.req.query()

		c.transform = async function <
			TInput,
			TOutput,
			Props extends Record<string, unknown> | undefined,
			Includes extends keyof OnlyPossiblyUndefined<TOutput> = keyof OnlyPossiblyUndefined<TOutput>,
			U extends ContentfulStatusCode = ContentfulStatusCode,
		>(
			object: TInput,
			transformer: AbstractTransformer<TInput, TOutput, Props, Includes>,
			extras: {
				props?: Props
				includes?: (Includes | string)[]
				status?: U
				headers?: HeaderRecord
			}
		) {
			const { props, includes, status, headers } = extras
			const processedIncludes = includes || include?.split(',')
			const transformed = await transformer._transform({
				input: object,
				props: props as Props,
				unsafeIncludes: processedIncludes,
			})
			// @ts-expect-error Hono's json method has complex overloads that don't align with our return type
			return c.json(transformed, status, headers)
		}

		c.transformMany = async function <
			TInput,
			TOutput,
			Props extends Record<string, unknown> | undefined,
			Includes extends keyof OnlyPossiblyUndefined<TOutput> = keyof OnlyPossiblyUndefined<TOutput>,
			U extends ContentfulStatusCode = ContentfulStatusCode,
		>(
			objects: TInput[],
			transformer: AbstractTransformer<TInput, TOutput, Props, Includes>,
			extras: {
				props?: Props
				includes?: (Includes | string)[]
				status?: U
				headers?: HeaderRecord
			}
		) {
			const { props, includes, status, headers } = extras
			const processedIncludes = includes || include?.split(',')
			const transformed = await transformer._transformMany({
				inputs: objects,
				props: props as Props,
				unsafeIncludes: processedIncludes,
			})
			return c.json(transformed, status, headers)
		}

		await next()
	})
