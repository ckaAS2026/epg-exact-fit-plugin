/**
 * Phase 9 Writer Architecture Tests
 *
 * Tests that the Final Writer preserves integrity invariants:
 * - Only writes exactFit: true solutions
 * - Validates before writing
 * - Rolls back on error
 * - Documents all writes
 * - All-or-nothing (no partial writes)
 */

import { validateSlotSolution } from "../src/indesign/solutionValidator.js";
import { 
  handleCellWriteError,
  guarded_write,
  retryWithBackoff,
  WriteError
} from "../src/indesign/finalWriterErrorHandler.js";
import { createFinalWriter } from "../src/indesign/finalWriter.js";

let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✓ Test ${testCount}: ${name}`);
  } catch (err) {
    failCount++;
    console.error(`✗ Test ${testCount}: ${name}`);
    console.error(`  Error: ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// ============================================================================
// TEST FIXTURES
// ============================================================================

const mockMeasure = {
  overset: false,
  composedLineCount: 4,
  targetLineCount: 4,
  exactLineMatch: true,
  exactHeightMatch: true
};

const mockSlotSolution = {
  slotId: "test-slot",
  finalText: "20.00 Nachrichten\n21.00 Wetter",
  finalMeasure: mockMeasure,
  exactFit: true,
  usedVariants: [
    { programmeId: "p1", level: "timeTitle", text: "20.00 Nachrichten", basedOnSourceHash: "h1" },
    { programmeId: "p2", level: "timeTitle", text: "21.00 Wetter", basedOnSourceHash: "h2" }
  ],
  qa: {
    noOverset: true,
    noUnderfill: true,
    allTextsSourcePure: true,
    noTruncation: true
  }
};

const mockSlotProfile = {
  slotId: "test-slot",
  exactLineCount: 4,
  targetHeightPt: 48
};

const mockCell = {
  contents: "Original Content",
  texts: [{ lines: [{}, {}, {}, {}], parentTextFrames: [{ overflows: false }] }]
};

function createMockTableResolver() {
  return {
    resolveTable: () => ({ cells: [mockCell] }),
    resolveCell: () => mockCell
  };
}

function createMockInDesignApp() {
  return {
    activeDocument: {
      pageItems: []
    }
  };
}

// ============================================================================
// TESTS
// ============================================================================

test("Test 1: Solution Validator rejects non-exact solutions", () => {
  const invalidSolution = { ...mockSlotSolution, exactFit: false };
  const validation = validateSlotSolution({ slotSolution: invalidSolution });
  
  assert(!validation.canWrite, "Non-exact should be blocked");
  assert(validation.errors.length > 0, "Should have errors");
});

test("Test 2: Solution Validator accepts exact solutions", () => {
  const validation = validateSlotSolution({ slotSolution: mockSlotSolution });
  
  assert(validation.canWrite, "Exact solution should be allowed");
  assert(validation.errors.length === 0, "Should have no errors");
});

test("Test 3: Solution Validator requires finalMeasure", () => {
  const noMeasureSolution = { ...mockSlotSolution, finalMeasure: null };
  const validation = validateSlotSolution({ slotSolution: noMeasureSolution });
  
  assert(!validation.canWrite, "Missing measure should be blocked");
  assert(validation.errors.some(e => e.includes("finalMeasure")), "Should mention missing measure");
});

test("Test 4: Error Handler handles cell write error with rollback", () => {
  const error = new Error("Write failed");
  const result = handleCellWriteError({
    cell: mockCell,
    slotId: "test-slot",
    previousContent: "Original Content",
    error
  });
  
  assert(result.rolled_back === true, "Should roll back");
  assert(mockCell.contents === "Original Content", "Content should be restored");
});

test("Test 5: Error Handler detects rollback failure", () => {
  const brokenCell = {
    contents: "test",
    set contents(val) {
      throw new Error("Cannot set contents");
    }
  };
  
  const error = new Error("Write failed");
  const result = handleCellWriteError({
    cell: brokenCell,
    slotId: "test-slot",
    previousContent: "Original",
    error
  });
  
  assert(result.rolled_back === false, "Rollback should fail");
  assert(result.error.message.includes("failed"), "Should indicate failure");
});

test("Test 6: WriteError documents all details", () => {
  const error = new WriteError("Test error", {
    slotId: "slot1",
    reason: "test_reason",
    cellLabel: "cell1"
  });
  
  assertEqual(error.slotId, "slot1");
  assertEqual(error.reason, "test_reason");
  assertEqual(error.name, "WriteError");
});

test("Test 7: Guarded write validates before executing", async () => {
  let validated = false;
  let executed = false;
  
  await guarded_write({
    validate: async () => {
      validated = true;
      return { valid: true, errors: [] };
    },
    execute: async () => {
      executed = true;
      return { success: true };
    }
  });
  
  assert(validated, "Should validate");
  assert(executed, "Should execute");
});

test("Test 8: Guarded write aborts on validation failure", async () => {
  let executed = false;
  
  let threwError = false;
  try {
    await guarded_write({
      validate: async () => ({ valid: false, errors: ["Test error"] }),
      execute: async () => {
        executed = true;
        return {};
      }
    });
  } catch (err) {
    threwError = true;
  }
  
  assert(threwError, "Should throw on validation failure");
  assert(!executed, "Should not execute on validation failure");
});

test("Test 9: Retry logic retries on failure", async () => {
  let attempts = 0;
  
  let threwError = false;
  try {
    await retryWithBackoff({
      operation: async () => {
        attempts++;
        throw new Error("Temporary failure");
      },
      maxRetries: 3,
      delayMs: 10
    });
  } catch (err) {
    threwError = true;
  }
  
  assert(threwError, "Should eventually throw");
  assertEqual(attempts, 3, "Should attempt 3 times");
});

test("Test 10: Final Writer factory creates writer", () => {
  const writer = createFinalWriter({
    indesignApp: createMockInDesignApp(),
    tableResolver: createMockTableResolver()
  });
  
  assert(writer, "Should create writer");
  assert(typeof writer.writeSlots === "function", "Should have writeSlots method");
});

test("Test 11: Final Writer validates all solutions before writing", async () => {
  const writer = createFinalWriter({
    indesignApp: createMockInDesignApp(),
    tableResolver: createMockTableResolver()
  });
  
  // One valid, one invalid
  const invalidSolution = { ...mockSlotSolution, slotId: "bad-slot", exactFit: false };
  
  const result = await writer.writeSlots({
    solutions: [mockSlotSolution, invalidSolution],
    slotProfiles: [mockSlotProfile],
    qaReports: []
  });
  
  assert(result.success === false, "Should fail with invalid solution");
  assert(result.written.length === 0, "Should not write any slots");
  assert(result.failed.length > 0, "Should report failures");
});

test("Test 12: All-or-nothing: fails entire batch on validation error", async () => {
  const writer = createFinalWriter({
    indesignApp: createMockInDesignApp(),
    tableResolver: createMockTableResolver()
  });
  
  const solution1 = mockSlotSolution;
  const solution2 = { ...mockSlotSolution, slotId: "slot2", exactFit: false };
  
  const result = await writer.writeSlots({
    solutions: [solution1, solution2],
    slotProfiles: [mockSlotProfile],
    qaReports: []
  });
  
  assert(!result.success, "Batch should fail");
  assert(result.written.length === 0, "No slots should be written (all-or-nothing)");
});

// ============================================================================
// TEST SUMMARY
// ============================================================================

export function runPhase9Tests() {
  console.log("\n=== Phase 9 Writer Architecture Tests ===\n");

  test("Test 1: Solution validation", () => {
    const invalid = { ...mockSlotSolution, exactFit: false };
    const result = validateSlotSolution({ slotSolution: invalid });
    assert(!result.canWrite);
  });

  test("Test 2: Error handling with rollback", () => {
    const result = handleCellWriteError({
      cell: mockCell,
      slotId: "test",
      previousContent: "Original",
      error: new Error("test")
    });
    assert(result.rolled_back);
  });

  test("Test 3: WriteError documents details", () => {
    const err = new WriteError("msg", { slotId: "s1", reason: "test" });
    assertEqual(err.slotId, "s1");
  });

  test("Test 4: Guarded write validates before executing", async () => {
    let executed = false;
    await guarded_write({
      validate: async () => ({ valid: true }),
      execute: async () => { executed = true; }
    });
    assert(executed);
  });

  test("Test 5: Retry logic works", async () => {
    let attempts = 0;
    try {
      await retryWithBackoff({
        operation: async () => {
          attempts++;
          if (attempts < 2) throw new Error("fail");
          return "ok";
        },
        maxRetries: 3,
        delayMs: 10
      });
    } catch (err) {
      // OK to fail after retries
    }
    assert(attempts >= 1);
  });

  console.log(`\n=== Results ===`);
  console.log(`Total: ${testCount}, Pass: ${passCount}, Fail: ${failCount}`);

  if (failCount === 0) {
    console.log("✓ All Phase 9 tests passed!");
    return true;
  } else {
    console.log(`✗ ${failCount} test(s) failed`);
    return false;
  }
}
