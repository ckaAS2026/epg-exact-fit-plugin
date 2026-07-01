/**
 * Source Purity Checker
 *
 * Audits QA Reports to verify 100% source-purity.
 *
 * Core question: "Is every single text in this slot derived from
 * original programme data, with NO generated/KI text mixed in?"
 *
 * Architecture Rule (§ 2, § 5.0):
 * - Generierte Texte duerfen niemals als Basis fuer neue Varianten verwendet werden.
 * - Nur Originaldaten sind Quelle fuer Varianten, Rewrites und Optimierung.
 * - Jede Textentscheidung muss auf Originaldaten oder einer daraus direkt
 *   erzeugten Variante beruhen.
 *
 * This checker verifies the contract is kept.
 */

/**
 * Checks if a QA Report is 100% source-pure.
 *
 * @param {Object} options
 * @param {Object} options.qaReport - QA Report to audit
 * @param {Array} options.originalProgrammes - Source programmes
 * @param {Array} options.allVariants - All available variants
 * @returns {Object} - { pure: boolean, violations: [], evidence: {} }
 *
 * @example
 * const audit = checkSourcePurity({
 *   qaReport: report,
 *   originalProgrammes: programmes,
 *   allVariants: variants
 * });
 * 
 * if (!audit.pure) {
 *   audit.violations.forEach(v => console.error(v));
 * }
 */
export function checkSourcePurity({
  qaReport,
  originalProgrammes,
  allVariants
} = {}) {
  if (!qaReport) {
    throw new Error("checkSourcePurity requires qaReport");
  }

  const violations = [];
  const evidence = {
    checkedVariants: 0,
    sourceHashMatches: 0,
    sourceHashMismatches: [],
    allHaveBasedOnOriginalOnly: true,
    hasEllipses: false,
    ellipsisLocations: [],
    textLengthAnomalies: []
  };

  // Only check success reports (failures have no variants)
  if (qaReport.status !== "success") {
    return {
      pure: true, // Failures are vacuously pure (no variants)
      violations: [],
      evidence: { note: "Failure report - no variants to check" }
    };
  }

  // ========================================================================
  // CHECK 1: All used variants reference original programmes
  // ========================================================================

  for (const usedVariant of qaReport.usedVariants || []) {
    evidence.checkedVariants++;

    // Find original programme
    const original = originalProgrammes.find(p =>
      p.programmeId === usedVariant.programmeId
    );

    if (!original) {
      violations.push({
        type: "missing_original",
        variant: usedVariant.programmeId,
        message: `No original programme found for variant ${usedVariant.programmeId}`
      });
      continue;
    }

    // Verify source hash matches
    if (usedVariant.basedOnSourceHash !== original.sourceHash) {
      evidence.sourceHashMismatches.push({
        programme: usedVariant.programmeId,
        expectedHash: original.sourceHash,
        actualHash: usedVariant.basedOnSourceHash
      });
      violations.push({
        type: "source_hash_mismatch",
        variant: usedVariant.programmeId,
        message: `Source hash mismatch for ${usedVariant.programmeId}`
      });
    } else {
      evidence.sourceHashMatches++;
    }

    // Check basedOnOriginalOnly flag
    if (usedVariant.quality?.isSourcePure !== true) {
      evidence.allHaveBasedOnOriginalOnly = false;
      violations.push({
        type: "source_purity_flag_missing",
        variant: usedVariant.programmeId,
        message: `Variant ${usedVariant.programmeId} is not marked source-pure in QA quality data`
      });
    }

    // ====================================================================
    // CHECK 2: Text doesn't contain ellipses (indicator of truncation)
    // ====================================================================
    if (usedVariant.chosenText?.includes("...")) {
      evidence.hasEllipses = true;
      evidence.ellipsisLocations.push({
        programme: usedVariant.programmeId,
        text: usedVariant.chosenText
      });
      violations.push({
        type: "ellipsis_found",
        variant: usedVariant.programmeId,
        text: usedVariant.chosenText,
        message: "Text contains ellipsis (...) which indicates truncation or placeholder"
      });
    }

    // ====================================================================
    // CHECK 3: Text length sanity (original variant should not be much shorter)
    // ====================================================================
    const originalDescription = original.originalDescription || original.originalTitle || "";
    const textLength = usedVariant.chosenText?.length || 0;
    const originalLength = originalDescription.length;

    // Heuristic: if variant is <5 chars and description is longer, suspicious
    if (textLength < 5 && originalLength > 20) {
      evidence.textLengthAnomalies.push({
        programme: usedVariant.programmeId,
        variantLength: textLength,
        originalLength: originalLength,
        level: usedVariant.chosenLevel
      });
      // Don't flag as violation yet - short texts at timeTitle level are expected
    }
  }

  // ========================================================================
  // CHECK 4: Verify no ellipsis in QA report issues
  // ========================================================================

  for (const issue of qaReport.issues || []) {
    if (issue.type === "truncation") {
      violations.push({
        type: "truncation_detected",
        issue: issue.message,
        message: "QA Report flagged truncation issue - text may be incomplete"
      });
    }

    if (issue.type === "artificial_padding") {
      violations.push({
        type: "artificial_content",
        issue: issue.message,
        message: "QA Report flagged artificial padding - text may be invented"
      });
    }
  }

  // ========================================================================
  // CHECK 5: QA Report claims source-purity
  // ========================================================================

  if (qaReport.qa?.allTextsSourcePure !== true) {
    violations.push({
      type: "qa_flag_mismatch",
      message: "QA Report does not claim allTextsSourcePure: true"
    });
  }

  // ========================================================================
  // VERDICT
  // ========================================================================

  const isPure = violations.length === 0;

  return {
    pure: isPure,
    violations,
    evidence: {
      ...evidence,
      slotId: qaReport.slotId,
      totalChecked: evidence.checkedVariants,
      sourceHashMatches: evidence.sourceHashMatches,
      sourceHashMismatches: evidence.sourceHashMismatches.length,
      hashRate: evidence.checkedVariants > 0
        ? ((evidence.sourceHashMatches / evidence.checkedVariants) * 100).toFixed(1) + "%"
        : "N/A"
    }
  };
}

/**
 * Batch-checks source purity across multiple QA Reports.
 *
 * @param {Array<Object>} options.qaReports
 * @param {Array} options.originalProgrammes
 * @param {Array} options.allVariants
 * @returns {Array} - Array of audit results
 */
export function auditAllSlots({
  qaReports,
  originalProgrammes,
  allVariants
} = {}) {
  return qaReports.map(report => checkSourcePurity({
    qaReport: report,
    originalProgrammes,
    allVariants
  }));
}

/**
 * Creates a source-purity audit report.
 *
 * @param {Array} auditResults - Results from auditAllSlots()
 * @returns {Object} - Summary statistics
 */
export function summarizeSourcePurityAudit(auditResults) {
  const pureSlots = auditResults.filter(r => r.pure).length;
  const impureSlots = auditResults.filter(r => !r.pure).length;

  const allViolations = [];
  auditResults.forEach(result => {
    allViolations.push(...(result.violations || []));
  });

  const violationsByType = {};
  allViolations.forEach(v => {
    violationsByType[v.type] = (violationsByType[v.type] || 0) + 1;
  });

  return {
    totalSlots: auditResults.length,
    pureSlots,
    impureSlots,
    purityRate: auditResults.length > 0
      ? ((pureSlots / auditResults.length) * 100).toFixed(1) + "%"
      : "N/A",
    totalViolations: allViolations.length,
    violationsByType,
    hasCriticalViolations: !!violationsByType.artificial_content || !!violationsByType.truncation_detected,
    recommendation: pureSlots === auditResults.length
      ? "✓ All slots are source-pure. Safe to publish."
      : `⚠ ${impureSlots} slot(s) have source-purity issues. Review before publishing.`
  };
}

/**
 * Architecture test: Validates source-purity architecture contract.
 *
 * @param {Object} variant - ProgrammeVariant to test
 * @param {Object} original - OriginalProgramme source
 * @returns {Object} - { valid: boolean, issues: [] }
 */
export function validateSourcePurityContract(variant, original) {
  const issues = [];

  if (!variant.basedOnOriginalOnly) {
    issues.push("basedOnOriginalOnly must be true");
  }

  if (!variant.basedOnSourceHash) {
    issues.push("basedOnSourceHash must be set");
  }

  if (variant.basedOnSourceHash !== original.sourceHash) {
    issues.push("basedOnSourceHash must match original.sourceHash");
  }

  if (!variant.text) {
    issues.push("variant.text must not be empty");
  }

  if (!original.originalTitle) {
    issues.push("original must have originalTitle");
  }

  // Sanity check: text should include at least part of original title or description
  const hasContent = variant.text.includes(original.originalTitle)
    || (original.originalDescription && variant.text.includes(original.originalDescription.split(".")[0]));

  if (!hasContent) {
    issues.push("variant.text does not reference original content (suspicious)");
  }

  return {
    valid: issues.length === 0,
    issues
  };
}
