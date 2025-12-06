/**
 * A type-safe promise cache for async functions.
 * Ensures calls with the same input resolve only once - concurrent calls share the same promise.
 *
 * @example
 * ```ts
 * const fetchUser = async (id: number) => db.users.findOne({ id });
 * const cached = new Cache(fetchUser);
 *
 * await cached.call(1); // Executes function
 * await cached.call(1); // Returns cached promise
 * ```
 *
 * @example With selective cache keys
 * ```ts
 * const cached = new Cache(fetchUser, 'id'); // Only cache on 'id' key
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: any is required for the generic type
export class Cache<R, FN extends (arg: any) => Promise<R> = (arg: any) => Promise<R>> {
	private readonly cacheOnObjectParams?: (keyof Parameters<FN>[0])[]

	/**
	 * Creates a new Cache instance.
	 * @param fn - The async function to cache
	 * @param on - For object args: keys to use for cache key (default: all keys)
	 */
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

	/**
	 * Calls the cached function, returning cached promise if available.
	 * @param arg - The argument to pass to the cached function
	 * @returns The promise from cache or a new execution
	 */
	public call(arg: Parameters<FN>[0]): ReturnType<FN> {
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

	/** Clears all cached promises. */
	clear = () => this.cache.clear()
}
