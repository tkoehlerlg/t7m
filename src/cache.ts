/**
 * A type-safe function cache.
 * Caches results by input - subsequent calls with the same input return the cached result.
 * For async functions, concurrent calls share the same promise.
 *
 * Requirements:
 * - The function must have exactly one argument
 *
 * @example
 * ```ts
 * const fetchUser = async (id: number) => db.users.findOne({ id });
 * const cached = new Cache(fetchUser);
 *
 * await cached.call(1); // Executes function
 * await cached.call(1); // Returns cached result
 * ```
 *
 * @example With selective cache keys
 * ```ts
 * const cached = new Cache(fetchUser, 'id'); // Only cache on 'id' key
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: any is required for the generic type
class Cache<FN extends (() => any) | ((arg: any) => any)> {
	private readonly cacheOnObjectParams?: (keyof Parameters<FN>[0])[]

	/**
	 * Creates a new Cache instance.
	 * @param fn - The function to cache
	 * @param on - For object args: keys to use for cache key (default: all keys)
	 */
	constructor(
		readonly fn: FN,
		...on: Parameters<FN>[0] extends Record<string, unknown> ? (keyof Parameters<FN>[0])[] : []
	) {
		this.cacheOnObjectParams = on.length > 0 ? on : undefined
	}

	private cache = new Map<string, ReturnType<FN>>()

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
	public call(...args: Parameters<FN>): ReturnType<FN> {
		const arg = args[0] ?? 'default-key'
		let cacheKey: string
		if (typeof arg !== 'object') {
			cacheKey = arg.toString()
		} else if (this.cacheOnObjectParams) {
			cacheKey = this.objectCacheKey(this.cacheOnObjectParams, arg)
		} else {
			cacheKey = this.objectCacheKey(Object.keys(arg) as (keyof Parameters<FN>[0])[], arg)
		}
		let result = this.cache.get(cacheKey)
		if (!result) {
			result = (this.fn as (...args: Parameters<FN>) => ReturnType<FN>)(...args)
			this.cache.set(cacheKey, result as ReturnType<FN>)
		}
		return result as ReturnType<FN>
	}

	/** Clears all cached promises. */
	clear = () => this.cache.clear()
}

// MARK: Export
export { Cache }
// biome-ignore lint/suspicious/noExplicitAny: any is required for the generic type
export type AnyCache = Cache<any>
