import type { TransformManyRespond, TransformRespond } from './types'

declare module 'hono' {
    interface Context {
        transform: TransformRespond
        transformMany: TransformManyRespond
    }
}
