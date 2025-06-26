import type { TransformRespond, TransformManyRespond } from './types'

declare module 'hono' {
    interface Context {
        transform: TransformRespond
        transformMany: TransformManyRespond
    }
}
