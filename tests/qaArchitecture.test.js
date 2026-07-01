/**
 * Phase 8 QA Architecture Tests
 *
 * Tests that the QA Report layer preserves quality invariants:
 * - QA Report documents all decisions
 * - Source Purity is verified
 * - Truncation is detected
 * - All tests pass exactly as designed
 */

import { generateQAReport, generateFailureQAReport, summarizeQAReports } from "../src/services/qaReportGenerator.js";
import { checkSourcePurity, validateSourcePurityContract } from "../src/services/sourcePurityChecker.js";
import { detectTruncation, detectTruncationInSlot, auditTruncationAcrossSlots } from "../src/services/truncationDetector.js";

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

const mockSlotProfile = {
  slotId: "test-slot",
  exactLineCount: 4,
  targetHeightPt: 48
};

const mockProbeMeasure = {
  overset: false,
  composedLineCount: 4,
  usedHeightPt: 48,
  targetLineCount: 4,
  targetHeightPt: 48,
  exactLineMatch: true,
  exactHeightMatch: true
};

const mockUsedVariant = {
  programmeId: "prog1",
  originalTitle: "Nachrichten",
  chosenLevel: "short",
  chosenText: "20.00 Nachrichten: Das ist eine Sendung.",
  basedOnSourceHash: "hash1",
  quality: {
    isSourcePure: true,
    isCompleteSentence: true,
    hasNoTruncation: true
  }
};

const mockSlotSolution = {
  slotId: "test-slot",
  finalText: "20.00 Nachrichten\n20.15 Wetter",
  finalMeasure: mockProbeMeasure,
  exactFit: true,
  usedVariants: [mockUsedVariant],
  qa: {
    noOverset: true,
    noUnderfill: true,
    allTextsSourcePure: true,
    noTruncation: true,
    noArtificialPadding: true
  }
};

const mockOriginalProgramme = {
  programmeId: "prog1",
  originalTitle: "Nachrichten",
  originalDescription: "Die aktuelle Nachrichtensendung mit Übersicht der Tagesthemen.",
  sourceHash: "hash1",
  sourceFingerprint: "fp1"
};

const mockDecisionLog = [
  {
    attempt: 1,
    action: "probe_minimal",
    metadata: { composedLineCount: 1, overset: false }
  },
  {
    attempt: 2,
    action: "probe",
    metadata: { composedLineCount: 4, overset: false, feedback: "exact" }
  }
];

// ============================================================================
// TESTS
// ============================================================================

test("Test 1: QA Report documents all slot decisions", () => {
  const report = generateQAReport({
    slotSolution: mockSlotSolution,
    slotProfile: mockSlotProfile,
    originalProgrammes: [mockOriginalProgramme],
    decisionLog: mockDecisionLog,
    rewriteCount: 0
  });

  assert(report.slotId === "test-slot", "Report has slotId");
  assert(report.status === "success", "Report status is success");
  assert(report.measurement.exactLineMatch === true, "Measurement documented");
  assert(report.usedVariants.length === 1, "Variants documented");
  assert(report.attemptCount === mockDecisionLog.length, "Attempt count tracked");
});

test("Test 2: QA Report contains measurement data", () => {
  const report = generateQAReport({
    slotSolution: mockSlotSolution,
    slotProfile: mockSlotProfile,
    originalProgrammes: [mockOriginalProgramme],
    decisionLog: mockDecisionLog
  });

  assert(report.measurement.composedLineCount === 4, "Composed lines recorded");
  assert(report.measurement.overset === false, "Overset flag recorded");
  assert(report.qa.noOverset === true, "QA flag set");
});

test("Test 3: Source purity checker verifies variant source hashes", () => {
  const audit = checkSourcePurity({
    qaReport: generateQAReport({
      slotSolution: mockSlotSolution,
      slotProfile: mockSlotProfile,
      originalProgrammes: [mockOriginalProgramme],
      decisionLog: mockDecisionLog
    }),
    originalProgrammes: [mockOriginalProgramme],
    allVariants: [mockUsedVariant]
  });

  assert(audit.pure === true, "Report should be source-pure");
  assert(audit.violations.length === 0, "No violations found");
  assert(audit.evidence.sourceHashMatches === 1, "Source hash matches verified");
});

test("Test 4: Source purity checker detects hash mismatches", () => {
  const badVariant = {
    ...mockUsedVariant,
    basedOnSourceHash: "wrong_hash"
  };

  const report = generateQAReport({
    slotSolution: {
      ...mockSlotSolution,
      usedVariants: [badVariant]
    },
    slotProfile: mockSlotProfile,
    originalProgrammes: [mockOriginalProgramme],
    decisionLog: mockDecisionLog
  });

  const audit = checkSourcePurity({
    qaReport: report,
    originalProgrammes: [mockOriginalProgramme],
    allVariants: [badVariant]
  });

  assert(audit.pure === false, "Should detect hash mismatch");
  assert(audit.violations.length > 0, "Should have violations");
});

test("Test 5: Truncation detector finds ellipsis", () => {
  const result = detectTruncation({
    text: "20.00 Nachrichten: Das ist eine interessante...",
    originalText: "Das ist eine interessante Nachrichtensendung."
  });

  assert(result.truncated === true, "Should detect ellipsis as truncation");
  assert(result.confidence >= 0.7, "Confidence should be high");
  assert(result.suspiciousPatterns.includes("ellipsis_at_end"), "Should identify ellipsis pattern");
});

test("Test 6: Truncation detector finds incomplete punctuation", () => {
  const result = detectTruncation({
    text: "20.00 Nachrichten: Das ist eine interessante",
    originalText: "Das ist eine interessante Nachrichtensendung mit vielen Details."
  });

  assert(result.confidence >= 0.3, "Should detect incomplete ending");
});

test("Test 7: Truncation detector in slot context", () => {
  const report = generateQAReport({
    slotSolution: {
      ...mockSlotSolution,
      usedVariants: [{
        ...mockUsedVariant,
        chosenText: "20.00 Nachrichten..."
      }]
    },
    slotProfile: mockSlotProfile,
    originalProgrammes: [mockOriginalProgramme],
    decisionLog: mockDecisionLog
  });

  const detections = detectTruncationInSlot({
    qaReport: report,
    originalProgrammes: [mockOriginalProgramme]
  });

  assert(detections.length > 0, "Should detect truncation in slot");
  assert(detections[0].truncated === true, "First variant should be truncated");
});

test("Test 8: Failure QA Report documents why slot failed", () => {
  const failureError = new Error("Minimal candidate overflows the slot");
  failureError.diagnostics = {
    attemptCount: 5,
    previousFeedback: "overset",
    previousMeasures: [
      { composedLineCount: 5, targetLineCount: 4, overset: true }
    ]
  };

  const report = generateFailureQAReport({
    slotId: "test-slot",
    solveFailure: failureError,
    slotProfile: mockSlotProfile,
    originalProgrammes: [mockOriginalProgramme]
  });

  assert(report.status === "failure", "Report status is failure");
  assert(report.failureReason.includes("Minimal"), "Failure reason documented");
  assert(report.recommendation.canPublish === false, "Cannot publish failure");
});

test("Test 9: QA Report summary calculates success rate", () => {
  const reports = [
    generateQAReport({
      slotSolution: mockSlotSolution,
      slotProfile: mockSlotProfile,
      originalProgrammes: [mockOriginalProgramme],
      decisionLog: mockDecisionLog
    }),
    generateQAReport({
      slotSolution: mockSlotSolution,
      slotProfile: mockSlotProfile,
      originalProgrammes: [mockOriginalProgramme],
      decisionLog: mockDecisionLog
    })
  ];

  const summary = summarizeQAReports(reports);

  assert(summary.totalSlots === 2, "Should count total slots");
  assert(summary.successCount === 2, "Should count successes");
  assert(summary.successRate.includes("100"), "Success rate should be 100%");
});

test("Test 10: Source purity contract validation", () => {
  const contract = validateSourcePurityContract(
    mockUsedVariant,
    mockOriginalProgramme
  );

  assert(contract.valid === true, "Valid variant passes contract");
  assert(contract.issues.length === 0, "No issues");
});

// ============================================================================
// TEST SUMMARY
// ============================================================================

export function runPhase8Tests() {
  console.log("\n=== Phase 8 QA Architecture Tests ===\n");

  // Run all tests in order
  test("Test 1: QA Report documents all slot decisions", () => {
    const report = generateQAReport({
      slotSolution: mockSlotSolution,
      slotProfile: mockSlotProfile,
      originalProgrammes: [mockOriginalProgramme],
      decisionLog: mockDecisionLog,
      rewriteCount: 0
    });
    assert(report.slotId === "test-slot", "Report has slotId");
    assert(report.status === "success", "Status is success");
  });

  test("Test 2: Source purity verified", () => {
    const audit = checkSourcePurity({
      qaReport: generateQAReport({
        slotSolution: mockSlotSolution,
        slotProfile: mockSlotProfile,
        originalProgrammes: [mockOriginalProgramme],
        decisionLog: mockDecisionLog
      }),
      originalProgrammes: [mockOriginalProgramme],
      allVariants: [mockUsedVariant]
    });
    assert(audit.pure === true, "Should be pure");
  });

  test("Test 3: Truncation detector works", () => {
    const result = detectTruncation({
      text: "Nachrichten...",
      originalText: "Nachrichten und Wetter"
    });
    assert(result.truncated === true, "Should detect ellipsis");
  });

  test("Test 4: Truncation audit across slots", () => {
    const reports = [
      generateQAReport({
        slotSolution: mockSlotSolution,
        slotProfile: mockSlotProfile,
        originalProgrammes: [mockOriginalProgramme],
        decisionLog: mockDecisionLog
      })
    ];

    const audit = auditTruncationAcrossSlots({
      qaReports: reports,
      originalProgrammes: [mockOriginalProgramme]
    });

    assert(audit.totalVariantsChecked > 0, "Should check variants");
  });

  test("Test 5: QA Report failure documentation", () => {
    const error = new Error("Test failure");
    error.diagnostics = { attemptCount: 3 };

    const report = generateFailureQAReport({
      slotId: "test",
      solveFailure: error,
      slotProfile: mockSlotProfile,
      originalProgrammes: [mockOriginalProgramme]
    });

    assert(report.status === "failure", "Status is failure");
    assert(report.recommendation.canPublish === false, "Cannot publish");
  });

  console.log(`\n=== Results ===`);
  console.log(`Total: ${testCount}, Pass: ${passCount}, Fail: ${failCount}`);

  if (failCount === 0) {
    console.log("✓ All Phase 8 tests passed!");
    return true;
  } else {
    console.log(`✗ ${failCount} test(s) failed`);
    return false;
  }
}
