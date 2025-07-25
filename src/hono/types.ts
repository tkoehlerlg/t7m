import { TypedResponse } from 'hono'
import type { ResponseHeader } from 'hono/utils/headers'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { BaseMime } from 'hono/utils/mime'
import type { InvalidJSONValue, JSONParsed, JSONValue, SimplifyDeepArray } from 'hono/utils/types'
import type { AbstractTransformer } from '../abstractTransformer'
import { OnlyPossiblyUndefined } from '../typeHelper'

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
		TInput,
		TOutput extends JSONValue | Record<string, unknown> | InvalidJSONValue,
		Props extends Record<string, unknown> | undefined,
		Includes extends keyof OnlyPossiblyUndefined<TOutput> = keyof OnlyPossiblyUndefined<TOutput>,
		U extends ContentfulStatusCode = ContentfulStatusCode,
	>(
		object: TInput,
		transformer: AbstractTransformer<TInput, TOutput, Props, Includes>,
		extras: {
			props?: Props
			includes?: Includes[]
			status?: U
			headers?: HeaderRecord
		}
	): Promise<JSONRespondReturn<TOutput, U>>
}

export interface TransformManyRespond {
	<
		TInput,
		TOutput extends JSONValue | Record<string, unknown> | InvalidJSONValue,
		Props extends Record<string, unknown> | undefined,
		Includes extends keyof OnlyPossiblyUndefined<TOutput> = keyof OnlyPossiblyUndefined<TOutput>,
		U extends ContentfulStatusCode = ContentfulStatusCode,
	>(
		objects: TInput[],
		transformer: AbstractTransformer<TInput, TOutput, Props, Includes>,
		extras: {
			props?: Props
			includes?: Includes[]
			status?: U
			headers?: HeaderRecord
		}
	): Promise<JSONRespondReturn<TOutput[], U>>
}
