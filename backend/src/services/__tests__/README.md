# Testing Infrastructure for Attestation Service

This directory contains the testing infrastructure for the attestation retry mechanism fix.

## Overview

The testing infrastructure supports both **unit tests** and **property-based tests** to ensure comprehensive coverage of the retry mechanism fix.

## Components

### 1. Test Utilities (`test-utils.ts`)

Provides shared testing infrastructure:

#### Logger Mocking
- **`MockLogger`**: Captures all log calls for verification
- **`createMockLogger()`**: Creates a new mock logger instance
- **`setupLoggerMock()`**: Sets up logger mock with automatic cleanup

**Example Usage:**
```typescript
const mockLogger = createMockLogger();
mockLogger.info('Test message', { key: 'value' });

// Verify logs
expect(mockLogger.hasLog('info', 'Test message')).toBe(true);
expect(mockLogger.countLogs('info')).toBe(1);
```

#### Fake Timers
- **`setupFakeTimers()`**: Sets up Vitest fake timers for time-based testing
- **`FakeTimers`**: Custom fake timer implementation (alternative)

**Example Usage:**
```typescript
const { advance, cleanup } = setupFakeTimers();

setTimeout(() => console.log('Done'), 1000);
advance(1000); // Immediately execute the timeout

cleanup(); // Restore real timers
```

#### Mock Response Helpers
- **`createMockFetchResponse()`**: Creates mock HTTP responses
- **`createMockAttestationResponse()`**: Creates mock attestation data
- **`createMockStacksResponse()`**: Creates mock Stacks API responses

#### Verification Helpers
- **`verifyAttemptLogFormat()`**: Verifies "Attempt X/Y" log format
- **`verifyWillRetryLog()`**: Verifies "will retry" log accuracy

#### Test Data Generators
- **`generateMessageHash()`**: Generates valid message hashes
- **`generateTxHash()`**: Generates valid transaction hashes
- **`generateAttestationData()`**: Generates random attestation data

### 2. Infrastructure Verification Tests (`test-infrastructure.test.ts`)

Verifies that the testing infrastructure is properly set up:
- ✅ fast-check library is available and functional
- ✅ Vitest fake timers work correctly
- ✅ Logger mocking utilities function as expected
- ✅ Test helpers produce valid data
- ✅ Integration between logger and fake timers works

## Testing Strategy

### Dual Testing Approach

This feature uses both unit tests and property-based tests:

#### Unit Tests
- Test specific examples and edge cases
- Test boundary conditions (maxAttempts = 0, 1)
- Test error scenarios (timeout, fatal errors)
- Test log message format for specific scenarios

#### Property-Based Tests
- Test universal properties across all inputs
- Use fast-check to generate random test cases
- Verify correctness properties hold for all valid inputs
- Minimum 100 iterations per property test

### Property-Based Testing Configuration

**Library:** fast-check v4.5.3

**Configuration:**
```typescript
fc.assert(
  fc.asyncProperty(
    fc.integer({ min: 1, max: 100 }), // Random maxAttempts
    async (maxAttempts) => {
      // Test implementation
    }
  ),
  { numRuns: 100 } // Minimum iterations
);
```

**Property Test Format:**
```typescript
// Feature: attestation-retry-fix, Property {number}: {property_text}
it('should execute exactly maxAttempts attempts when exhausted', async () => {
  // **Property 1: Correct Attempt Count**
  // **Validates: Requirements 1.1, 1.2, 1.3**
  
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 100 }),
      async (maxAttempts) => {
        // Test implementation
      }
    ),
    { numRuns: 100 }
  );
});
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
npm test -- test-infrastructure.test.ts
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Tests with UI
```bash
npm run test:ui
```

## Vitest Configuration

The project uses Vitest with the following configuration:

```typescript
{
  test: {
    globals: true,           // Enable global test APIs
    environment: 'node',     // Node.js environment
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
}
```

**Key Features:**
- ✅ Global test APIs (describe, it, expect, vi)
- ✅ Node.js environment
- ✅ Fake timers support (vi.useFakeTimers())
- ✅ Mocking support (vi.mock())
- ✅ Coverage reporting

## Mock Strategy

### API Mocking
Mock the API calls to control responses:
```typescript
vi.spyOn(service as any, 'fetchFromCircleAPI')
  .mockImplementation(async () => {
    return { attestation: null }; // Not ready
  });
```

### Time Mocking
Use fake timers to control time progression:
```typescript
vi.useFakeTimers();
const startTime = Date.now();
vi.advanceTimersByTime(5000);
expect(Date.now() - startTime).toBe(5000);
vi.useRealTimers();
```

### Logger Mocking
Capture log output for verification:
```typescript
const mockLogger = createMockLogger();
// ... perform operations ...
expect(mockLogger.hasLog('info', 'will retry')).toBe(true);
```

## Test Coverage Requirements

All three attestation methods must be tested:
1. `fetchCircleAttestation`
2. `fetchXReserveAttestation`
3. `fetchStacksAttestation`

Each method must verify:
- ✅ Correct attempt count (Property 1)
- ✅ Accurate retry logging (Property 2)
- ✅ Attempt progress format (Property 3)
- ✅ Configuration respect (Property 4)
- ✅ Timeout precedence (Property 6)
- ✅ Fatal error handling (Property 7)

Shared validation tests:
- ✅ Input validation (Property 5)

## Correctness Properties

### Property 1: Correct Attempt Count
For any valid maxAttempts value N (where N ≥ 1), when the retry mechanism runs to exhaustion without success, the total number of attempts executed should equal N.

**Validates:** Requirements 1.1, 1.2, 1.3

### Property 2: Accurate Retry Logging
For any retry loop execution, when a log message states "will retry", the system should execute at least one more attempt after that log message.

**Validates:** Requirements 2.1, 2.3

### Property 3: Attempt Progress Format
For any attempt during a retry loop, the log message should contain the current attempt number and total attempts in the format "Attempt X/Y" where X is the current attempt (1-indexed) and Y is maxAttempts.

**Validates:** Requirements 3.1, 3.2

### Property 4: Configuration Respect
For any valid maxAttempts configuration value, when passed to an attestation fetch method, the retry mechanism should execute exactly that many attempts before exhaustion.

**Validates:** Requirements 4.1

### Property 5: Input Validation
For any negative integer or non-integer value passed as maxAttempts, the system should reject the value or coerce it to a valid non-negative integer.

**Validates:** Requirements 4.4

### Property 6: Timeout Precedence
For any combination of maxAttempts and timeout values, when the elapsed time exceeds the timeout value, the system should throw a timeout error regardless of how many attempts remain.

**Validates:** Requirements 6.1

### Property 7: Fatal Error Immediate Failure
For any fatal error (non-404, non-"not ready" errors), the system should throw the error immediately without executing additional retry attempts.

**Validates:** Requirements 7.4

## Best Practices

### Writing Unit Tests
1. Test specific examples and edge cases
2. Use descriptive test names
3. Keep tests focused on one behavior
4. Use mock logger to verify log output
5. Use fake timers for time-based tests

### Writing Property Tests
1. Generate random inputs with fast-check
2. Test universal properties, not specific examples
3. Use minimum 100 iterations
4. Reference the property number and requirements
5. Keep property tests simple and focused

### Test Organization
1. Group related tests with `describe` blocks
2. Use `beforeEach` and `afterEach` for setup/cleanup
3. Keep test files co-located with source files
4. Use clear, descriptive test names

### Debugging Tests
1. Use `test.only()` to run a single test
2. Use `console.log()` or `mockLogger.getLogs()` to inspect state
3. Use `vi.advanceTimersByTime()` to step through time
4. Check mock call counts with `vi.mocked(fn).mock.calls`

## Examples

### Example Unit Test
```typescript
it('should execute exactly 3 attempts when maxAttempts is 3', async () => {
  const mockLogger = createMockLogger();
  let attemptCount = 0;

  vi.spyOn(service as any, 'fetchFromCircleAPI')
    .mockImplementation(async () => {
      attemptCount++;
      return { attestation: null };
    });

  try {
    await service.fetchCircleAttestation('0x123...', { maxAttempts: 3 });
  } catch (error) {
    // Expected to throw after exhaustion
  }

  expect(attemptCount).toBe(3);
});
```

### Example Property Test
```typescript
it('should execute exactly maxAttempts attempts when exhausted', async () => {
  // **Property 1: Correct Attempt Count**
  // **Validates: Requirements 1.1, 1.2, 1.3**
  
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 100 }),
      async (maxAttempts) => {
        let attemptCount = 0;
        
        vi.spyOn(service as any, 'fetchFromCircleAPI')
          .mockImplementation(async () => {
            attemptCount++;
            return { attestation: null };
          });
        
        try {
          await service.fetchCircleAttestation('0x123...', { maxAttempts });
        } catch (error) {
          // Expected to throw after exhaustion
        }
        
        expect(attemptCount).toBe(maxAttempts);
        return true;
      }
    ),
    { numRuns: 100 }
  );
});
```

## Troubleshooting

### Tests Timing Out
- Check if fake timers are properly set up
- Ensure `vi.advanceTimersByTime()` is called to progress time
- Verify cleanup functions are called in `afterEach`

### Logger Not Capturing Logs
- Ensure `createMockLogger()` is called before operations
- Check if logger module is properly mocked
- Verify log level matches (info, warn, error, debug)

### Property Tests Failing
- Check if the property is correctly stated
- Verify generators produce valid inputs
- Increase `numRuns` to find edge cases
- Use `fc.sample()` to inspect generated values

### Mocks Not Working
- Ensure mocks are set up before the code under test runs
- Use `vi.clearAllMocks()` in `beforeEach` to reset state
- Check if the correct method is being mocked
- Verify mock implementation returns expected values

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [fast-check Documentation](https://fast-check.dev/)
- [Winston Logger Documentation](https://github.com/winstonjs/winston)
- [Property-Based Testing Guide](https://fast-check.dev/docs/introduction/)

## Task Completion

This testing infrastructure setup completes **Task 1** of the attestation-retry-fix implementation plan:

✅ Install fast-check library for property-based testing (already installed v4.5.3)
✅ Configure Vitest with fake timers for time-based testing
✅ Set up logger mocks to capture and verify log output
✅ Verify testing infrastructure with comprehensive tests

**Next Steps:** Proceed to Task 2 - Create shared retry helper function
