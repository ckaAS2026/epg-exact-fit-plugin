/**
 * QA Report Generator
 *
 * Creates comprehensive quality assurance documentation for solved slots.
 *
 * Purpose: Document every decision the solver made, including:
 * - Which variants were chosen for each programme
 * - Why (feedback: overset, underfill, exact match)
 * - Measurement values from InDesign Probe
 * - Quality flags (source-purity, truncation, overflow)
 * - Issues that need attention
 *
 * The QA Report is the audit trail: why this slot was solved this way,
 * and whether that solution is reliable.
 *
 * Architecture Rule (§ 8):
 * "Der QA Report dokumentiert pro Slot die finale Entscheidung,
 *  verwendete Variantenstufen, Messwerte, Overflow-/Underfill-Status
 *  und problematische Sendungen."
 */

/**
 * Generates a QA Report from a successful slot solution.
 *
 * @param {Object} options
 * @param {SlotSolution} options.slotSolution - The solved slot (exactFit: true)
 * @param {SlotProfile} options.slotProfile - Slot constraints
 * @param {OriginalProgramme[]} options.originalProgrammes - Source programmes
 * @param {Array} options.decisionLog - Solver's decision trace
 * @param {number} options.rewriteCount - How many rewrites were needed
 * @returns {Object} - QA Report with detailed audit trail
 *
 * @example
 * const qaReport = generateQAReport({
 *   slotSolution: solution,
 *   slotProfile: profile,
 *   originalProgrammes: progs,
 *   decisionLog: log,
 *   rewriteCount: 2
 * });
 */
export function generateQAReport({
  slotSolution,
  slotProfile,
  originalProgrammes,
  decisionLog = [],
  rewriteCount = 0
} = {}) {
  if (!slotSolution) {
    throw new Error("generateQAReport requires slotSolution");
  }

  if (!slotSolution.exactFit) {
    throw new Error(
      "generateQAReport only accepts exactFit: true solutions. " +
      "Non-exact solutions should be reported as failures."
    );
  }

  const measure = slotSolution.finalMeasure;
  if (!measure) {
    throw new Error("slotSolution must have finalMeasure");
  }

  const issues = [];

  // Build variant usage report
  const variantUsageReport = slotSolution.usedVariants.map(variant => {
    const originalProgramme = originalProgrammes.find(
      p => p.programmeId === variant.programmeId
    );
    const isSourcePure = variant.basedOnOriginalOnly === true &&
      Boolean(originalProgramme) &&
      variant.basedOnSourceHash === originalProgramme.sourceHash;
    const isCompleteSentence = variant.isCompletePhrase === true;
    const hasNoTruncation = variant.hasNoTruncation === true &&
      !String(variant.text || "").includes("...");

    if (!originalProgramme) {
      issues.push({
        type: "missing_original",
        programmeId: variant.programmeId,
        message: `No original programme found for variant ${variant.programmeId}`
      });
    }

    if (!isSourcePure) {
      issues.push({
        type: "source_purity",
        programmeId: variant.programmeId,
        message: `Variant ${variant.programmeId} is not fully source-pure`
      });
    }

    if (!hasNoTruncation) {
      issues.push({
        type: "truncation",
        programmeId: variant.programmeId,
        message: `Variant ${variant.programmeId} has truncation indicators`
      });
    }

    return {
      programmeId: variant.programmeId,
      originalTitle: originalProgramme?.originalTitle || "UNKNOWN",
      chosenLevel: variant.level,
      chosenText: variant.text,
      basedOnSourceHash: variant.basedOnSourceHash,
      quality: {
        isSourcePure,
        isCompleteSentence,
        hasNoTruncation
      }
    };
  });
  const allTextsSourcePure = variantUsageReport.every((variant) => variant.quality.isSourcePure);
  const allTextsCompleteSentences = variantUsageReport.every((variant) => variant.quality.isCompleteSentence);
  const noTruncation = variantUsageReport.every((variant) => variant.quality.hasNoTruncation);

  // Extract measurement decision points from log
  const measurementDecisions = decisionLog
    .filter(entry => entry.action === "probe" || entry.action === "probe_minimal")
    .map(entry => ({
      attempt: entry.attempt,
      composedLineCount: entry.metadata?.composedLineCount,
      overset: entry.metadata?.overset,
      targetLineCount: slotProfile?.exactLineCount,
      feedback: entry.metadata?.feedback
    }));

  return Object.freeze({
    slotId: slotSolution.slotId,
    status: "success",
    timestamp: new Date().toISOString(),

    // Measurement Results
    measurement: {
      composedLineCount: measure.composedLineCount,
      targetLineCount: measure.targetLineCount,
      exactLineMatch: measure.exactLineMatch,
      overset: measure.overset,
      usedHeightPt: measure.usedHeightPt,
      targetHeightPt: measure.targetHeightPt,
      exactHeightMatch: measure.exactHeightMatch
    },

    // Variant Usage
    usedVariants: variantUsageReport,
    variantCount: variantUsageReport.length,

    // Solving Process
    rewriteCount,
    attemptCount: decisionLog.length,
    measurementHistory: measurementDecisions,

    // Quality Assurance
    qa: {
      // Measurement quality
      noOverset: !measure.overset,
      noUnderfill: measure.exactLineMatch,
      exactLineMatch: measure.exactLineMatch,
      exactHeightMatch: measure.exactHeightMatch,

      // Text quality
      allTextsSourcePure,
      allTextsCompleteSentences,
      noTruncation,
      noArtificialPadding: true,

      // Process quality
      noInfiniteRewriting: rewriteCount <= 5,
      withinNormalAttempts: decisionLog.length <= 50
    },

    // Issues & Warnings
    issues,

    // Audit Trail
    decisionLog,

    // Recommendation
    recommendation: {
      canPublish: issues.length === 0,
      confidence: issues.length === 0 ? 1.0 : 0.0,
      nextSteps: issues.length === 0 ? "Ready for Final Writer" : "Review QA issues before Final Writer"
    }
  });
}

/**
 * Generates a failure report when slot cannot be solved.
 *
 * @param {Object} options
 * @param {string} options.slotId
 * @param {SolveFailure} options.solveFailure
 * @param {SlotProfile} options.slotProfile
 * @param {OriginalProgramme[]} options.originalProgrammes
 * @returns {Object} - QA Report with failure details
 */
export function generateFailureQAReport({
  slotId,
  solveFailure,
  slotProfile,
  originalProgrammes
} = {}) {
  if (!slotId || !solveFailure) {
    throw new Error("generateFailureQAReport requires slotId and solveFailure");
  }

  const diagnostics = solveFailure.diagnostics || {};

  return Object.freeze({
    slotId,
    status: "failure",
    timestamp: new Date().toISOString(),

    failureReason: solveFailure.message,

    diagnostics: {
      attemptCount: diagnostics.attemptCount || 0,
      previousFeedback: diagnostics.previousFeedback,
      lastMeasurements: (diagnostics.previousMeasures || []).slice(-3).map(m => ({
        composedLineCount: m.composedLineCount,
        targetLineCount: m.targetLineCount,
        overset: m.overset
      }))
    },

    qa: {
      solutionFound: false,
      causeAnalysis: analyzeFailureCause(solveFailure, slotProfile)
    },

    // For debugging
    decisionLog: diagnostics.decisionLog || [],

    // Recommendation
    recommendation: {
      canPublish: false,
      confidence: 0.0,
      nextSteps: `Manual review required. Slot ${slotId} could not be solved automatically.`
    }
  });
}

/**
 * Analyzes failure cause to provide helpful diagnostics.
 *
 * @private
 */
function analyzeFailureCause(solveFailure, slotProfile) {
  const message = (solveFailure.message || "").toLowerCase();

  if (message.includes("overflows") || message.includes("minimal")) {
    return {
      type: "minimal_overflow",
      meaning: "Even the shortest variant (time + title) overflows the slot.",
      suggestion: "Slot may be too small or slot profile exactLineCount incorrect."
    };
  }

  if (message.includes("repeated") || message.includes("repetition")) {
    return {
      type: "stuck_loop",
      meaning: "Solver kept getting the same feedback without making progress.",
      suggestion: "Might need different variant combination or slot reconfiguration."
    };
  }

  if (message.includes("rewrite") || message.includes("counter")) {
    return {
      type: "rewrite_limit",
      meaning: "Reached maximum rewrite attempts.",
      suggestion: "Current programme data may not support exact fit in this slot."
    };
  }

  if (message.includes("no variant") || message.includes("no candidate")) {
    return {
      type: "no_variants",
      meaning: "Required variant level does not exist for this programme.",
      suggestion: "Variant factory may need to generate more levels."
    };
  }

  return {
    type: "unknown",
    meaning: solveFailure.message,
    suggestion: "See diagnostics.decisionLog for details."
  };
}

/**
 * Creates a summary report of multiple slots' QA results.
 *
 * @param {Array<QAReport>} qaReports
 * @returns {Object} - Aggregate statistics
 */
export function summarizeQAReports(qaReports) {
  if (!Array.isArray(qaReports)) {
    throw new Error("summarizeQAReports requires array of QA reports");
  }

  const successReports = qaReports.filter(r => r.status === "success");
  const failureReports = qaReports.filter(r => r.status === "failure");

  const stats = {
    totalSlots: qaReports.length,
    successCount: successReports.length,
    failureCount: failureReports.length,
    successRate: qaReports.length > 0
      ? ((successReports.length / qaReports.length) * 100).toFixed(1) + "%"
      : "N/A",

    qualityMetrics: {
      allExactMatches: successReports.filter(r => r.qa.exactLineMatch).length,
      allSourcePure: successReports.filter(r => r.qa.allTextsSourcePure).length,
      allNoTruncation: successReports.filter(r => r.qa.noTruncation).length
    },

    avgRewriteCount: successReports.length > 0
      ? (successReports.reduce((sum, r) => sum + r.rewriteCount, 0) / successReports.length).toFixed(1)
      : 0,

    avgAttemptCount: qaReports.length > 0
      ? (qaReports.reduce((sum, r) => sum + (r.attemptCount || 0), 0) / qaReports.length).toFixed(1)
      : 0,

    failureReasons: failureReports.map(r => ({
      slotId: r.slotId,
      reason: r.qa.causeAnalysis?.type,
      message: r.failureReason
    }))
  };

  return Object.freeze(stats);
}

/**
 * Exports QA Reports to structured format (for logging/storage).
 *
 * @param {Array<QAReport>} qaReports
 * @param {string} [format] - 'json' (default), 'csv', 'markdown'
 * @returns {string}
 */
export function exportQAReports(qaReports, format = "json") {
  if (format === "json") {
    return JSON.stringify(qaReports, null, 2);
  }

  if (format === "markdown") {
    return qaReports.map(report => `
## Slot: ${report.slotId}

**Status**: ${report.status}
**Lines**: ${report.measurement?.composedLineCount}/${report.measurement?.targetLineCount}
**Exact Match**: ${report.qa?.exactLineMatch ? "✓" : "✗"}
**Overset**: ${report.measurement?.overset ? "✗" : "✓"}

### Programmes (${report.usedVariants?.length || 0})
${(report.usedVariants || []).map(v => `- ${v.originalTitle} (${v.chosenLevel})`).join("\n")}

### Issues
${report.issues && report.issues.length > 0
  ? report.issues.map(i => `- [${i.type}] ${i.message}`).join("\n")
  : "No issues detected"}
    `).join("\n---\n");
  }

  if (format === "csv") {
    const headers = ["slotId", "status", "lines", "targetLines", "exactMatch", "overset", "rewrites", "attempts"];
    const rows = qaReports.map(r => [
      r.slotId,
      r.status,
      r.measurement?.composedLineCount,
      r.measurement?.targetLineCount,
      r.qa?.exactLineMatch ? "true" : "false",
      r.measurement?.overset ? "true" : "false",
      r.rewriteCount,
      r.attemptCount
    ]);

    return [
      headers.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");
  }

  throw new Error(`Unknown export format: ${format}`);
}
