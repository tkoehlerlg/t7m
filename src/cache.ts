// biome-ignore lint/suspicious/noExplicitAny: any is required for the generic type
export class Cache<R, FN extends (arg: any) => Promise<R>> {
	private readonly cacheOnObjectParams?: (keyof Parameters<FN>[0])[]

	constructor(
		public fn: FN,
		...on: Parameters<FN>[0] extends Record<string, unknown> ? (keyof Parameters<FN>[0])[] : []
	) {
		this.cacheOnObjectParams = on.length > 0 ? on : undefined
	}

	private cache = new Map<string, Promise<R>>()

	private objectCacheKey(keys: (keyof Parameters<FN>[0])[], arg: Parameters<FN>[0]): string {
		return keys
			.slice()
			.sort()
			.map(key => `${key.toString()}:${arg[key]}`)
			.join('-')
	}

	public run(arg: Parameters<FN>[0]): ReturnType<FN> {
		let cacheKey: string
		if (typeof arg !== 'object') {
			cacheKey = arg.toString()
		} else if (this.cacheOnObjectParams) {
			cacheKey = this.objectCacheKey(this.cacheOnObjectParams, arg)
		} else {
			cacheKey = this.objectCacheKey(Object.keys(arg) as (keyof Parameters<FN>[0])[], arg)
		}
		let promise = this.cache.get(cacheKey)
		if (!promise) {
			promise = this.fn(arg as Parameters<FN>[0])
			this.cache.set(cacheKey, promise)
		}
		return promise as ReturnType<FN>
	}
}
