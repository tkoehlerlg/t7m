/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect } from 'bun:test'
import { AbstractTransformer } from '../src/abstractTransformer'

// Advanced test scenarios for AbstractTransformer

interface ComplexInput {
    id: string
    data: {
        primary: string
        secondary?: string
        nested: {
            value: number
            metadata?: Record<string, any>
        }
    }
    timestamps: {
        created: Date
        updated?: Date
    }
}

interface ComplexOutput {
    id: string
    primary: string
    computed?: number
    formatted?: string
    enriched?: {
        source: string
        processed: boolean
        details?: any
    }
}

interface AdvancedProps extends Record<string, unknown> {
    format: 'short' | 'long'
    includeComputed: boolean
    enrichmentLevel: number
}

// Test transformer with complex logic
class AdvancedTransformer extends AbstractTransformer<ComplexInput, ComplexOutput, AdvancedProps> {
    protected data(input: ComplexInput, props: AdvancedProps): ComplexOutput {
        const base: ComplexOutput = {
            id: input.id,
            primary: props.format === 'short' ? input.data.primary.substring(0, 10) : input.data.primary,
        }

        if (props.includeComputed && input.data.nested.value > 0) {
            base.computed = input.data.nested.value * props.enrichmentLevel
        }

        return base
    }

    protected override includesMap = {
        formatted: (input: ComplexInput, props: AdvancedProps) => {
            const date = input.timestamps.created
            return props.format === 'short' ? date.toLocaleDateString() : date.toISOString()
        },
        enriched: (input: ComplexInput, props: AdvancedProps) => ({
            source: input.id,
            processed: true,
            details: props.enrichmentLevel > 5 ? { level: 'high', metadata: input.data.nested.metadata } : undefined,
        }),
    }
}

describe('AbstractTransformer - Advanced Tests', () => {
    const testInput: ComplexInput = {
        id: 'test-123',
        data: {
            primary: 'This is a long primary string that will be truncated',
            secondary: 'Secondary data',
            nested: {
                value: 42,
                metadata: { key: 'value' },
            },
        },
        timestamps: {
            created: new Date('2024-01-01'),
            updated: new Date('2024-01-15'),
        },
    }

    describe('Complex prop-based transformations', () => {
        const transformer = new AdvancedTransformer()

        it('should handle short format with computed values', async () => {
            const result = await transformer.transform({
                input: testInput,
                props: {
                    format: 'short',
                    includeComputed: true,
                    enrichmentLevel: 2,
                },
            })

            expect(result.primary).toBe('This is a ')
            expect(result.computed).toBe(84) // 42 * 2
        })

        it('should handle long format without computed values', async () => {
            const result = await transformer.transform({
                input: testInput,
                props: {
                    format: 'long',
                    includeComputed: false,
                    enrichmentLevel: 2,
                },
            })

            expect(result.primary).toBe('This is a long primary string that will be truncated')
            expect(result.computed).toBeUndefined()
        })

        it('should apply enrichment based on level', async () => {
            const lowLevel = await transformer.transform({
                input: testInput,
                props: {
                    format: 'short',
                    includeComputed: false,
                    enrichmentLevel: 3,
                },
                includes: ['enriched'],
            })

            const highLevel = await transformer.transform({
                input: testInput,
                props: {
                    format: 'short',
                    includeComputed: false,
                    enrichmentLevel: 10,
                },
                includes: ['enriched'],
            })

            expect(lowLevel.enriched?.details).toBeUndefined()
            expect(highLevel.enriched?.details).toEqual({
                level: 'high',
                metadata: { key: 'value' },
            })
        })
    })

    describe('Performance considerations', () => {
        it('should efficiently handle large batch transformations', () => {
            const transformer = new AdvancedTransformer()
            const largeInputSet = Array.from({ length: 1000 }, (_, i) => ({
                ...testInput,
                id: `test-${i}`,
                data: {
                    ...testInput.data,
                    nested: {
                        value: i,
                        metadata: { index: i },
                    },
                },
            }))

            const start = performance.now()
            const results = transformer.transformMany({
                inputs: largeInputSet,
                props: {
                    format: 'short',
                    includeComputed: true,
                    enrichmentLevel: 1,
                },
                includes: ['formatted', 'enriched'],
            })
            const duration = performance.now() - start

            expect(results).toHaveLength(1000)
            expect(duration).toBeLessThan(100) // Should complete in under 100ms

            // Verify first and last results
            expect(results[0]?.id).toBe('test-0')
            expect(results[0]?.computed).toBeUndefined() // value is 0, so condition fails
            expect(results[0]?.formatted).toBeDefined()
            expect(results[0]?.enriched).toBeDefined()
            expect(results[999]?.id).toBe('test-999')
            expect(results[999]?.computed).toBe(999) // 999 * 1 = 999
            expect(results[999]?.formatted).toBeDefined()
            expect(results[999]?.enriched).toBeDefined()
        })
    })

    describe('Include function error handling', () => {
        class ErrorProneTransformer extends AbstractTransformer<ComplexInput, ComplexOutput, AdvancedProps> {
            protected data(input: ComplexInput, _props: AdvancedProps): ComplexOutput {
                return {
                    id: input.id,
                    primary: input.data.primary,
                }
            }

            protected override includesMap = {
                computed: (input: ComplexInput) => {
                    // Intentionally access potentially undefined property
                    return input.data.nested.metadata!.missingKey.value * 2
                },
                formatted: (input: ComplexInput) => {
                    if (!input.timestamps.updated) {
                        throw new Error('Updated timestamp required for formatting')
                    }
                    return input.timestamps.updated.toISOString()
                },
            }
        }

        it('should handle errors in include functions gracefully', () => {
            const transformer = new ErrorProneTransformer()

            // Test with input that will cause errors
            const problematicInput: ComplexInput = {
                ...testInput,
                data: {
                    ...testInput.data,
                    nested: {
                        value: 10,
                        // metadata is undefined, will cause error
                    },
                },
                timestamps: {
                    created: new Date(),
                    // updated is undefined, will cause error in formatted
                },
            }

            // Should not throw when includes aren't used
            expect(() => {
                transformer.transform({
                    input: problematicInput,
                    props: {
                        format: 'short',
                        includeComputed: false,
                        enrichmentLevel: 1,
                    },
                })
            }).not.toThrow()

            // Should throw when problematic includes are used
            expect(() => {
                transformer.transform({
                    input: problematicInput,
                    props: {
                        format: 'short',
                        includeComputed: false,
                        enrichmentLevel: 1,
                    },
                    includes: ['computed'],
                })
            }).toThrow()
        })
    })

    describe('Memoization and caching patterns', () => {
        class MemoizedTransformer extends AbstractTransformer<ComplexInput, ComplexOutput> {
            private callCount = 0
            private includeCallCounts = {
                computed: 0,
                formatted: 0,
            }

            protected data(input: ComplexInput): ComplexOutput {
                this.callCount++
                return {
                    id: input.id,
                    primary: input.data.primary,
                }
            }

            protected override includesMap = {
                computed: (input: ComplexInput) => {
                    this.includeCallCounts.computed++
                    return input.data.nested.value * 2
                },
                formatted: (input: ComplexInput) => {
                    this.includeCallCounts.formatted++
                    return input.timestamps.created.toISOString()
                },
            }

            getCallCounts() {
                return {
                    data: this.callCount,
                    includes: { ...this.includeCallCounts },
                }
            }
        }

        it('should call transformation functions correct number of times', () => {
            const transformer = new MemoizedTransformer()
            const inputs = [testInput, { ...testInput, id: 'test-456' }]

            // Transform multiple times with same includes
            transformer.transformMany({
                inputs,
                includes: ['computed', 'formatted'],
            })

            const counts = transformer.getCallCounts()
            expect(counts.data).toBe(2) // Called once per input
            expect(counts.includes.computed).toBe(2) // Called once per input
            expect(counts.includes.formatted).toBe(2) // Called once per input
        })
    })

    describe('Type narrowing and discrimination', () => {
        interface UserInput {
            type: 'user'
            userId: string
            profile: { name: string; age: number }
        }

        interface AdminInput {
            type: 'admin'
            adminId: string
            permissions: string[]
            profile: { name: string; department: string }
        }

        type AccountInput = UserInput | AdminInput

        interface AccountOutput {
            id: string
            name: string
            accountType: 'user' | 'admin'
            details?: {
                info: string
                extra?: any
            }
        }

        class DiscriminatedTransformer extends AbstractTransformer<AccountInput, AccountOutput> {
            protected data(input: AccountInput): AccountOutput {
                const base = {
                    id: input.type === 'user' ? input.userId : input.adminId,
                    name: input.profile.name,
                    accountType: input.type,
                }

                return base as AccountOutput
            }

            protected override includesMap = {
                details: (input: AccountInput) => {
                    if (input.type === 'user') {
                        return {
                            info: `User aged ${input.profile.age}`,
                            extra: { age: input.profile.age },
                        }
                    } else {
                        return {
                            info: `Admin in ${input.profile.department}`,
                            extra: {
                                department: input.profile.department,
                                permissionCount: input.permissions.length,
                            },
                        }
                    }
                },
            }
        }

        it('should handle discriminated union types correctly', async () => {
            const transformer = new DiscriminatedTransformer()

            const userResult = await transformer.transform({
                input: {
                    type: 'user',
                    userId: 'u-123',
                    profile: { name: 'John', age: 30 },
                },
                includes: ['details'],
            })

            const adminResult = await transformer.transform({
                input: {
                    type: 'admin',
                    adminId: 'a-456',
                    permissions: ['read', 'write', 'delete'],
                    profile: { name: 'Jane', department: 'IT' },
                },
                includes: ['details'],
            })

            expect(userResult.details?.info).toBe('User aged 30')
            expect(userResult.details?.extra.age).toBe(30)

            expect(adminResult.details?.info).toBe('Admin in IT')
            expect(adminResult.details?.extra.permissionCount).toBe(3)
        })
    })
})
