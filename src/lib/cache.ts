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
 * @example With selective cache keys and maxSize
 * ```ts
 * const cached = new Cache(fetchUser, { on: ['id'], maxSize: 100 });
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: any is required for the generic type
class Cache<FN extends (() => any) | ((arg: any) => any)> {
	private readonly cacheOnObjectParams?: (keyof Parameters<FN>[0])[]
	private readonly maxSize?: number

	/**
	 * Creates a new Cache instance.
	 * @param fn - The function to cache
	 * @param options - Optional configuration
	 * @param options.on - For object args: keys to use for cache key (default: all keys)
	 * @param options.maxSize - Maximum cache entries. Oldest evicted when exceeded. Must be a positive integer.
	 */
	constructor(
		readonly fn: FN,
		options?: {
			on?: Parameters<FN>[0] extends Record<string, unknown> ? (keyof Parameters<FN>[0])[] : never
			maxSize?: number
		}
	) {
		const on = options?.on
		this.cacheOnObjectParams = on && on.length > 0 ? on : undefined
		if (options?.maxSize !== undefined) {
			if (!Number.isInteger(options.maxSize) || options.maxSize < 1) {
				throw new Error(`[T7M] Cache maxSize must be a positive integer, got ${options.maxSize}`)
			}
			this.maxSize = options.maxSize
		}
	}

	private cache = new Map<string, ReturnType<FN>>()

	private objectCacheKey(keys: (keyof Parameters<FN>[0])[], arg: Parameters<FN>[0]): string {
		return keys
			.slice()
			.sort()
			.map(key => `${key.toString()}:${JSON.stringify(arg[key])}`)
			.join('|')
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
			cacheKey = `${typeof arg}:${String(arg)}`
		} else if (this.cacheOnObjectParams) {
			cacheKey = this.objectCacheKey(this.cacheOnObjectParams, arg)
		} else {
			cacheKey = this.objectCacheKey(Object.keys(arg) as (keyof Parameters<FN>[0])[], arg)
		}
		if (!this.cache.has(cacheKey)) {
			const result = (this.fn as (...args: Parameters<FN>) => ReturnType<FN>)(...args)
			this.cache.set(cacheKey, result as ReturnType<FN>)

			// Evict oldest entry when maxSize is exceeded
			if (this.maxSize && this.cache.size > this.maxSize) {
				const firstKey = this.cache.keys().next().value
				if (firstKey !== undefined) this.cache.delete(firstKey)
			}

			// Auto-evict rejected promises so transient failures don't become permanent
			// biome-ignore lint/suspicious/noExplicitAny: need to check if result is thenable
			if (result && typeof (result as any).catch === 'function') {
				;(result as Promise<unknown>).catch(() => {
					this.cache.delete(cacheKey)
				})
			}
		}
		return this.cache.get(cacheKey) as ReturnType<FN>
	}

	/** Clears all cached promises. */
	clear = () => this.cache.clear()
}

// MARK: Export
export { Cache }
// biome-ignore lint/suspicious/noExplicitAny: any is required for the generic type
export type AnyCache = Cache<any>
