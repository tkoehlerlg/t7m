/**
 * Limits concurrent async operations to a fixed number.
 * Tasks exceeding the limit are queued and run as slots free up.
 *
 * Transformers have built-in concurrency control via the `concurrency` option —
 * use this class directly only when you need standalone concurrency limiting outside of transformers.
 *
 * @example
 * ```ts
 * const semaphore = new Semaphore(5)
 * const results = await Promise.all(
 *     urls.map(url => semaphore.run(() => fetch(url)))
 * )
 * ```
 */
class Semaphore {
	private queue: (() => void)[] = []
	private active = 0

	constructor(private readonly limit: number) {
		if (!Number.isInteger(limit) || limit < 1) throw new Error('Semaphore limit must be a positive integer')
	}

	/**
	 * Executes `fn` when a concurrency slot is available, queuing if at capacity.
	 * @param fn - The async (or sync) function to execute
	 * @returns The resolved return value of `fn`
	 */
	async run<T>(fn: () => T | Promise<T>): Promise<T> {
		while (this.active >= this.limit) {
			await new Promise<void>(resolve => this.queue.push(resolve))
		}
		this.active++
		try {
			return await fn()
		} finally {
			this.active--
			this.queue.shift()?.()
		}
	}
}

export { Semaphore }
