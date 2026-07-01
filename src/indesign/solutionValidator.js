/**
 * Solution Validator
 *
 * Final checkpoint before writing to InDesign.
 * Validates that SlotSolution meets ALL requirements for publishing.
 *
 * Architecture Rule (§ 6.0, § 9):
 * "Nur exakte SlotSolution darf an Final Writer gehen."
 *
 * This validator enforces that contract: exactFit: true + all QA checks + no errors.
 */

/**
 * Validates a SlotSolution before Final Writer writes it.
 *
 * @param {Object} options
 * @param {Object} options.slotSolution - The solution to validate
 * @param {Object} options.slotProfile - Slot constraints
 * @param {Object} options.qaReport - QA audit report
 * @returns {Object} - { valid: boolean, errors: [], warnings: [] }
 *
 * @throws if required fields missing
 */
export function validateSlotSolution({
  slotSolution,
  slotProfile,
  qaReport
} = {}) {
  if (!slotSolution) {
    throw new Error("validateSlotSolution requires slotSolution");
  }

  const errors = [];
  const warnings = [];

  // ========================================================================
  // CRITICAL: exactFit must be true
  // ========================================================================
  if (slotSolution.exactFit !== true) {
    errors.push("exactFit must be true (not just truthy)");
  }

  // ========================================================================
  // CRITICAL: Measurement validation
  // ========================================================================
  const measure = slotSolution.finalMeasure;
  if (!measure) {
    errors.push("finalMeasure is required");
  } else {
    if (measure.overset !== false) {
      errors.push("Text overflows slot (overset: true)");
    }

    if (measure.exactLineMatch !== true) {
      errors.push(
        `Line count mismatch: ${measure.composedLineCount} vs target ${measure.targetLineCount}`
      );
    }

    // Validate measure structure
    if (typeof measure.composedLineCount !== "number" || measure.composedLineCount <= 0) {
      errors.push("composedLineCount must be positive number");
    }

    if (typeof measure.targetLineCount !== "number" || measure.targetLineCount <= 0) {
      errors.push("targetLineCount must be positive number");
    }
  }

  // ========================================================================
  // CRITICAL: QA validation
  // ========================================================================
  if (slotSolution.qa) {
    if (slotSolution.qa.noOverset !== true) {
      errors.push("QA check failed: overset detected");
    }

    if (slotSolution.qa.noUnderfill !== true) {
      errors.push("QA check failed: underfill detected");
    }

    if (slotSolution.qa.allTextsSourcePure !== true) {
      errors.push("QA check failed: non-source-pure text detected");
    }

    if (slotSolution.qa.noTruncation !== true) {
      errors.push("QA check failed: truncation detected");
    }
  } else {
    warnings.push("qa object missing (should have passed QA report)");
  }

  // ========================================================================
  // CRITICAL: Text validation
  // ========================================================================
  if (!slotSolution.finalText || typeof slotSolution.finalText !== "string") {
    errors.push("finalText must be non-empty string");
  }

  if (!Array.isArray(slotSolution.usedVariants) || slotSolution.usedVariants.length === 0) {
    errors.push("usedVariants must be non-empty array");
  }

  // Validate each variant
  for (const variant of slotSolution.usedVariants || []) {
    if (!variant.programmeId) {
      errors.push(`Variant missing programmeId`);
    }
    if (!variant.level) {
      errors.push(`Variant ${variant.programmeId} missing level`);
    }
    if (!variant.text) {
      errors.push(`Variant ${variant.programmeId} missing text`);
    }
    if (!variant.basedOnSourceHash) {
      errors.push(`Variant ${variant.programmeId} missing sourceHash`);
    }
  }

  // ========================================================================
  // VALIDATION: Against SlotProfile
  // ========================================================================
  if (slotProfile) {
    if (slotSolution.slotId !== slotProfile.slotId) {
      errors.push(`Slot ID mismatch: solution for ${slotSolution.slotId}, profile for ${slotProfile.slotId}`);
    }

    if (measure && slotProfile.exactLineCount) {
      if (measure.targetLineCount !== slotProfile.exactLineCount) {
        errors.push("Target line count doesn't match profile");
      }
    }
  }

  // ========================================================================
  // VALIDATION: Against QA Report
  // ========================================================================
  if (qaReport) {
    if (qaReport.status !== "success") {
      errors.push("QA Report shows failure status");
    }

    if (qaReport.qa?.allTextsSourcePure !== true) {
      errors.push("QA Report: not all texts source-pure");
    }

    if (qaReport.qa?.noTruncation !== true) {
      warnings.push("QA Report flagged potential truncation");
    }
  }

  // ========================================================================
  // VERDICT
  // ========================================================================

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    canWrite: errors.length === 0,
    recommendation: errors.length === 0
      ? "✓ Solution validated. Safe to write to InDesign."
      : `✗ Solution has ${errors.length} critical error(s). Cannot write.`
  };
}

/**
 * Batch-validates multiple solutions.
 *
 * @param {Array} solutions - SlotSolutions to validate
 * @param {Array} profiles - SlotProfiles
 * @param {Array} qaReports - QA Reports
 * @returns {Array} - Validation results per solution
 */
export function validateAllSolutions({
  solutions,
  profiles,
  qaReports
} = {}) {
  return solutions.map(solution => {
    const profile = profiles.find(p => p.slotId === solution.slotId);
    const qaReport = qaReports.find(q => q.slotId === solution.slotId);

    return validateSlotSolution({
      slotSolution: solution,
      slotProfile: profile,
      qaReport
    });
  });
}

/**
 * Checks if all solutions are ready to write.
 *
 * @param {Array} validationResults - From validateAllSolutions()
 * @returns {Object} - { allValid: boolean, readyCount, blockedCount, summary }
 */
export function summarizeValidation(validationResults) {
  const valid = validationResults.filter(r => r.valid).length;
  const blocked = validationResults.filter(r => !r.valid).length;

  return {
    allValid: blocked === 0,
    readyCount: valid,
    blockedCount: blocked,
    totalChecked: validationResults.length,
    errorSummary: validationResults
      .filter(r => !r.valid)
      .map((r, idx) => ({
        index: idx,
        errors: r.errors
      })),
    recommendation: blocked === 0
      ? "✓ All solutions validated. Ready for Final Writer."
      : `⚠ ${blocked} solution(s) blocked. Fix errors before writing.`
  };
}

/**
 * Architecture test: validates the validator itself.
 *
 * @param {Object} testSolution - Test SlotSolution
 * @returns {Object} - { passed: boolean, tests: [] }
 */
export function validateValidatorContract(testSolution) {
  const tests = [];

  // Test 1: Accepts exact solutions
  const validSolution = { ...testSolution, exactFit: true };
  const result1 = validateSlotSolution({ slotSolution: validSolution });
  tests.push({
    name: "Accepts exactFit: true solution",
    passed: result1.canWrite || result1.errors.length === 0
  });

  // Test 2: Rejects non-exact solutions
  const invalidSolution = { ...testSolution, exactFit: false };
  const result2 = validateSlotSolution({ slotSolution: invalidSolution });
  tests.push({
    name: "Rejects exactFit: false solution",
    passed: !result2.canWrite || result2.errors.length > 0
  });

  // Test 3: Requires finalMeasure
  const noMeasureSolution = { ...testSolution, finalMeasure: null };
  const result3 = validateSlotSolution({ slotSolution: noMeasureSolution });
  tests.push({
    name: "Requires finalMeasure",
    passed: !result3.canWrite || result3.errors.some(e => e.includes("finalMeasure"))
  });

  const allPassed = tests.every(t => t.passed);
  return {
    passed: allPassed,
    tests
  };
}
