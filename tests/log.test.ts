import { afterAll, afterEach, beforeAll, describe, expect, it, spyOn } from 'bun:test'
import { log } from '../src/lib/log'

describe('log', () => {
	const originalEnv = process.env.T7M_DEBUG
	const consoleSpy = spyOn(console, 'log')

	beforeAll(() => {
		process.env.T7M_DEBUG = 'true'
	})
	afterEach(() => {
		consoleSpy.mockClear()
	})
	afterAll(() => {
		if (originalEnv !== undefined) process.env.T7M_DEBUG = originalEnv
		else delete process.env.T7M_DEBUG
		consoleSpy.mockRestore()
	})

	it('should not throw on circular references and use String() fallback', () => {
		const circular: Record<string, unknown> = { name: 'test' }
		circular.self = circular

		expect(() => log('Circular:', circular)).not.toThrow()
		expect(consoleSpy).toHaveBeenCalled()
		// Verify the catch branch produced the String() fallback
		const args = consoleSpy.mock.calls[0]
		const output = args.join(' ')
		expect(output).toContain('[object Object]')
	})

	it('should handle normal objects with JSON serialization', () => {
		log('Normal:', { key: 'value' })
		expect(consoleSpy).toHaveBeenCalled()
		const args = consoleSpy.mock.calls[0]
		const output = args.join(' ')
		expect(output).toContain('"key"')
		expect(output).toContain('"value"')
	})
})
