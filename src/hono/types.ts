import { TypedResponse } from 'hono'
import type { ResponseHeader } from 'hono/utils/headers'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { BaseMime } from 'hono/utils/mime'
import type { InvalidJSONValue, JSONParsed, JSONValue, SimplifyDeepArray } from 'hono/utils/types'
import { AnyAbstractTransformer, IncludesOf, InputOf, OutputOf, PropsOf } from '../typeHelper'

export type HeaderRecord =
	| Record<'Content-Type', BaseMime>
	| Record<ResponseHeader, string | string[]>
	| Record<string, string | string[]>

export type JSONRespondReturn<
	T extends JSONValue | SimplifyDeepArray<unknown> | InvalidJSONValue,
	U extends ContentfulStatusCode,
> = Response &
	TypedResponse<
		SimplifyDeepArray<T> extends JSONValue
			? JSONValue extends SimplifyDeepArray<T>
				? never
				: JSONParsed<T>
			: never,
		U,
		'json'
	>

export interface TransformRespond {
	<
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
	): Promise<JSONRespondReturn<O, U>>
}

export interface TransformManyRespond {
	<
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
	): Promise<JSONRespondReturn<O, U>>
}
