class Semaphore {
	private queue: (() => void)[] = []
	private active = 0

	constructor(private readonly limit: number) {
		if (limit < 1) throw new Error('Semaphore limit must be at least 1')
	}

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
