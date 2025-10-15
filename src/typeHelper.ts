import { AbstractTransformer } from './abstractTransformer'

// biome-ignore lint/suspicious/noExplicitAny: using `any` for type parameter extraction - precision not required for conditional type inference
export type AnyAbstractTransformer = AbstractTransformer<any, any, any, any>

// biome-ignore lint/suspicious/noExplicitAny: using `any` for type parameter extraction - precision not required for conditional type inference
export type InputOf<T> = T extends AbstractTransformer<infer I, any, any, any> ? I : never
// biome-ignore lint/suspicious/noExplicitAny: using `any` for type parameter extraction - precision not required for conditional type inference
export type OutputOf<T> = T extends AbstractTransformer<any, infer O, any, any> ? O : never
// biome-ignore lint/suspicious/noExplicitAny: using `any` for type parameter extraction - precision not required for conditional type inference
export type PropsOf<T> = T extends AbstractTransformer<any, any, infer P, any> ? P : never
// biome-ignore lint/suspicious/noExplicitAny: using `any` for type parameter extraction - precision not required for conditional type inference
export type IncludesOf<T> = T extends AbstractTransformer<any, any, any, infer Inc> ? Inc : never
