import type { AnyAbstractTransformer } from '../abstractTransformer'
import type { IncludesOf, InputOf, OutputOf, PropsOf } from '../typeHelper'

type Extras<T extends AnyAbstractTransformer, O> = {
	includes?: IncludesOf<T>[]
	wrapper?: (data: OutputOf<T>) => O
	debug?: boolean
} & (PropsOf<T> extends undefined ? { props?: never } : { props: PropsOf<T> })

type ManyExtras<T extends AnyAbstractTransformer, O> = {
	includes?: IncludesOf<T>[]
	wrapper?: (data: OutputOf<T>[]) => O
	debug?: boolean
} & (PropsOf<T> extends undefined ? { props?: never } : { props: PropsOf<T> })

export interface TransformFn {
	// Overload: extras optional when no props needed
	<T extends AnyAbstractTransformer, O = OutputOf<T>>(
		input: InputOf<T>,
		transformer: T,
		...args: PropsOf<T> extends undefined ? [extras?: Extras<T, O>] : [extras: Extras<T, O>]
	): Promise<O>
}

export interface TransformManyFn {
	// Overload: extras optional when no props needed
	<T extends AnyAbstractTransformer, O = OutputOf<T>[]>(
		inputs: InputOf<T>[],
		transformer: T,
		...args: PropsOf<T> extends undefined ? [extras?: ManyExtras<T, O>] : [extras: ManyExtras<T, O>]
	): Promise<O>
}
