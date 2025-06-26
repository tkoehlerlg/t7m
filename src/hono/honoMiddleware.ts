import type { Env } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AbstractTransformer } from '../abstractTransformer'
import type { HeaderRecord } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

export const t7mMiddleware = <TEnv extends Env>() =>
    createMiddleware<TEnv>(async (c, next) => {
        const { include } = c.req.query()

        c.transform = async function <TInput, TOutput, U extends ContentfulStatusCode = ContentfulStatusCode>(
            object: TInput,
            transformer: AbstractTransformer<TInput, TOutput, any, any>,
            status?: U,
            headers?: HeaderRecord
        ) {
            const includes = include?.split(',')
            const transformed = await transformer.transform({ input: object, includes: includes as any })
            // @ts-expect-error Hono's json method has complex overloads that don't align with our return type
            return c.json(transformed, status, headers)
        }

        c.transformMany = async function <TInput, TOutput, U extends ContentfulStatusCode = ContentfulStatusCode>(
            objects: TInput[],
            transformer: AbstractTransformer<TInput, TOutput, any, any>,
            status?: U,
            headers?: HeaderRecord
        ) {
            const includes = include?.split(',')
            const transformed = await transformer.transformMany({ inputs: objects, includes: includes as any })
            return c.json(transformed, status, headers)
        }

        await next()
    })
