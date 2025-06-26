# AbstractTransformer Testing Strategy

## Overview
This document outlines the comprehensive testing approach for the `AbstractTransformer` class, ensuring both runtime behavior and type safety.

## Test Structure

### 1. Runtime Tests (`abstractTransformer.test.ts`)
Located in `/tests/abstractTransformer.test.ts`, these tests verify the actual behavior of the transformer at runtime.

#### Categories:
- **Basic Transformation**: Tests core transform/transformMany functionality without includes or props
- **Transformation with Includes**: Tests optional property inclusion mechanism
- **Transformation with Props**: Tests prop-based transformations
- **Edge Cases**: Empty arrays, empty includes, etc.
- **Error Scenarios**: Invalid inputs, missing required props

### 2. Type-Level Tests (`abstractTransformer.type.test.ts`)
Located in `/tests/abstractTransformer.type.test.ts`, these tests ensure type safety at compile time.

#### Type Validations:
- Correct type inference for transform results
- Proper constraint of includes to optional properties only
- Required vs optional props handling
- Complex nested type transformations

## Key Testing Patterns

### 1. Basic Transformer Pattern
```typescript
class BasicTransformer extends AbstractTransformer<Input, Output> {
    protected data(input: Input): Output {
        // Transform logic
    }
    protected override includesMap = {}
}
```
**Tests**: Basic input/output transformation, multiple inputs handling

### 2. Includes Pattern
```typescript
class TransformerWithIncludes extends AbstractTransformer<Input, Output> {
    protected data(input: Input): Output {
        // Base transformation
    }
    protected override includesMap = {
        optionalProp: (input: Input) => computeValue(input)
    }
}
```
**Tests**: 
- Transformation without includes (optional props undefined)
- Single include activation
- Multiple includes activation
- Type constraint validation (only optional props allowed)

### 3. Props Pattern
```typescript
class TransformerWithProps extends AbstractTransformer<Input, Output, Props> {
    protected data(input: Input, props: Props): Output {
        // Use props in transformation
    }
}
```
**Tests**:
- Props are required when specified
- Props passed to both data() and include functions
- Props affect transformation logic

## Test Scenarios

### Unit Tests
1. **Single Transform**
   - Valid input → expected output
   - With/without includes
   - With/without props

2. **Batch Transform (transformMany)**
   - Empty array handling
   - Consistent transformation across items
   - Include/props application to all items

3. **Include Mechanism**
   - Only optional properties can be included
   - Include functions receive correct parameters
   - Multiple includes work together
   - Empty includes array behaves like no includes

4. **Props Handling**
   - Required when type specifies non-undefined
   - Optional when type allows undefined
   - Passed to all transformation functions

### Type Tests
1. **Type Inference**
   - Output type correctly inferred
   - Include constraints properly enforced
   - Props requirements reflected in API

2. **Generic Constraints**
   - `Includes extends keyof OnlyPossiblyUndefined<TOutput>`
   - Props extends `Record<string, unknown> | undefined`

3. **Method Signatures**
   - transform() parameter types
   - transformMany() parameter types
   - Return types match expectations

## Test Data Strategy

### Simple Test Case
```typescript
interface User {
    id: number
    name: string
    email: string
}

interface PublicUser {
    name: string
    email: string
    avatar?: string
}
```

### Complex Test Case
```typescript
interface Article {
    id: string
    title: string
    content: string
    author: User
    metadata: Record<string, any>
}

interface PublicArticle {
    title: string
    excerpt: string
    author?: PublicUser
    relatedArticles?: PublicArticle[]
    analytics?: AnalyticsData
}
```

## Running Tests

### Bun Test Runner
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

## Coverage Goals

### Code Coverage
- 100% line coverage for AbstractTransformer class
- All public methods tested
- All code paths in _transform method covered

### Type Coverage
- All generic parameter combinations tested
- Edge cases for type constraints validated
- Real-world usage patterns demonstrated

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Clear Naming**: Test names clearly describe what is being tested
3. **Arrange-Act-Assert**: Follow AAA pattern in tests
4. **Type Safety**: Leverage TypeScript to catch issues at compile time
5. **Real-World Scenarios**: Include tests that mirror actual usage

## Future Considerations

1. **Performance Tests**: Add benchmarks for large data sets
2. **Error Handling**: Expand error scenario coverage
3. **Integration Tests**: Test with real-world transformer implementations
4. **Property-Based Testing**: Consider adding generative tests for edge cases

## Maintenance

- Update tests when AbstractTransformer API changes
- Add tests for new features before implementation
- Keep type tests in sync with runtime tests
- Document any testing gaps or limitations