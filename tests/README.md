# AbstractTransformer Tests

This directory contains comprehensive tests for the `AbstractTransformer` class.

## Test Files

### 1. `abstractTransformer.test.ts` - Core Functionality Tests

- Basic transformation without includes or props
- Transformation with optional includes
- Transformation with required/optional props
- Edge cases (empty arrays, empty includes)
- Type constraint validation

### 2. `abstractTransformer.type.test.ts` - Type-Level Tests

- Compile-time type safety validation
- Generic parameter inference
- Include constraints (only optional properties)
- Props requirement validation
- Complex type transformations

### 3. `abstractTransformer.advanced.test.ts` - Advanced Scenarios

- Complex prop-based transformations
- Performance testing with large datasets
- Error handling in include functions
- Memoization patterns
- Discriminated union types

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/abstractTransformer.test.ts

# Run with watch mode
bun test --watch

# Type checking
bun run tsc --noEmit
```

## Test Coverage

The test suite covers:

- ✅ Core transformation logic
- ✅ Include mechanism for optional properties
- ✅ Props handling (required/optional)
- ✅ Batch transformations with `transformMany`
- ✅ Type safety at compile time
- ✅ Error scenarios and edge cases
- ✅ Performance considerations
- ✅ Complex real-world scenarios

## Key Testing Patterns

### Basic Transformer

```typescript
class BasicTransformer extends AbstractTransformer<Input, Output> {
    protected data(input: Input): Output {
        /* ... */
    }
    protected includesMap = {}
}
```

### Transformer with Includes

```typescript
class TransformerWithIncludes extends AbstractTransformer<Input, Output> {
    protected data(input: Input): Output {
        /* ... */
    }
    protected includesMap = {
        optionalProp: input => computeValue(input),
    }
}
```

### Transformer with Props

```typescript
class TransformerWithProps extends AbstractTransformer<Input, Output, Props> {
    protected data(input: Input, props: Props): Output {
        /* ... */
    }
    protected includesMap = {
        optionalProp: (input, props) => computeWithProps(input, props),
    }
}
```

## Implementation Details

The `AbstractTransformer` class:

- Constrains includes to only optional properties using `OnlyPossiblyUndefined<T>` type
- Filters invalid includes at runtime
- Supports both single and batch transformations
- Handles props as either required or optional based on type definition
- Provides type-safe API with proper generic constraints
