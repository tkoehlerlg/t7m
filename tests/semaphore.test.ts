import { describe, expect, it } from 'bun:test'
import { Semaphore } from '../src/lib/semaphore'

describe('Semaphore', () => {
	it('should limit concurrency to the specified value', async () => {
		const semaphore = new Semaphore(2)
		let active = 0
		let maxActive = 0

		const task = () =>
			semaphore.run(async () => {
				active++
				maxActive = Math.max(maxActive, active)
				await new Promise(r => setTimeout(r, 50))
				active--
			})

		await Promise.all([task(), task(), task(), task(), task()])

		expect(maxActive).toBe(2)
	})

	it('should resolve all tasks', async () => {
		const semaphore = new Semaphore(2)
		const results: number[] = []

		const task = (n: number) =>
			semaphore.run(async () => {
				await new Promise(r => setTimeout(r, 10))
				results.push(n)
				return n
			})

		const returned = await Promise.all([task(1), task(2), task(3), task(4)])

		expect(returned).toEqual([1, 2, 3, 4])
		expect(results).toHaveLength(4)
	})

	it('should propagate errors without breaking the queue', async () => {
		const semaphore = new Semaphore(1)

		const failingTask = semaphore.run(async () => {
			throw new Error('fail')
		})

		await expect(failingTask).rejects.toThrow('fail')

		// Semaphore should still work after error
		const result = await semaphore.run(async () => 'ok')
		expect(result).toBe('ok')
	})

	it('should throw for limit less than 1', () => {
		expect(() => new Semaphore(0)).toThrow('Semaphore limit must be a positive integer')
		expect(() => new Semaphore(-1)).toThrow('Semaphore limit must be a positive integer')
	})

	it('should throw for non-integer limit', () => {
		expect(() => new Semaphore(1.5)).toThrow('Semaphore limit must be a positive integer')
		expect(() => new Semaphore(NaN)).toThrow('Semaphore limit must be a positive integer')
		expect(() => new Semaphore(Infinity)).toThrow('Semaphore limit must be a positive integer')
	})

	it('should handle synchronous return values', async () => {
		const semaphore = new Semaphore(3)
		const result = await semaphore.run(async () => 42)
		expect(result).toBe(42)
	})

	it('should throw when queue exceeds maxQueue', async () => {
		const semaphore = new Semaphore(1, 5)
		let release!: () => void
		const barrier = new Promise<void>(r => {
			release = r
		})

		// Fill the active slot
		const blocker = semaphore.run(() => barrier)

		// Queue 5 tasks (maxQueue: 5) — should succeed
		const queued = Array.from({ length: 5 }, (_, i) => semaphore.run(async () => i))

		// 6th queued task should throw
		expect(() => semaphore.run(async () => 'overflow')).toThrow('[T7M] Semaphore queue is full')

		// Unblock and let everything finish
		release()
		await blocker
		await Promise.all(queued)
	})

	it('should allow unlimited queue when maxQueue is not set', async () => {
		const semaphore = new Semaphore(1)
		let release!: () => void
		const barrier = new Promise<void>(r => {
			release = r
		})

		const blocker = semaphore.run(() => barrier)

		// Queue many tasks — should not throw
		const queued = Array.from({ length: 100 }, (_, i) => semaphore.run(async () => i))

		release()
		await blocker
		const results = await Promise.all(queued)
		expect(results).toHaveLength(100)
	})

	it('should throw for invalid maxQueue values', () => {
		expect(() => new Semaphore(1, 0)).toThrow('Semaphore maxQueue must be a positive integer')
		expect(() => new Semaphore(1, -1)).toThrow('Semaphore maxQueue must be a positive integer')
		expect(() => new Semaphore(1, 1.5)).toThrow('Semaphore maxQueue must be a positive integer')
	})
})
