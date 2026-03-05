import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test'
import { log } from '../src/lib/log'

describe('log', () => {
	const originalEnv = process.env.T7M_DEBUG

	beforeAll(() => {
		process.env.T7M_DEBUG = 'true'
	})
	afterAll(() => {
		if (originalEnv !== undefined) process.env.T7M_DEBUG = originalEnv
		else delete process.env.T7M_DEBUG
	})

	it('should not throw on circular references', () => {
		const circular: Record<string, unknown> = { name: 'test' }
		circular.self = circular

		const consoleSpy = mock(() => {})
		const original = console.log
		console.log = consoleSpy

		expect(() => log('Circular:', circular)).not.toThrow()
		expect(consoleSpy).toHaveBeenCalled()

		console.log = original
	})

	it('should handle normal objects', () => {
		const consoleSpy = mock(() => {})
		const original = console.log
		console.log = consoleSpy

		log('Normal:', { key: 'value' })
		expect(consoleSpy).toHaveBeenCalled()
		const args = consoleSpy.mock.calls[0]
		const output = args.join(' ')
		expect(output).toContain('value')

		console.log = original
	})
})
