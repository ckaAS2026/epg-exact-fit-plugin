/**
 * Final Writer
 *
 * Writes validated SlotSolutions to InDesign tables.
 *
 * CRITICAL RESPONSIBILITIES:
 * 1. Only writes exactFit: true solutions
 * 2. Verifies cell labels before writing
 * 3. Checks satzkontext (layout context) matches probe
 * 4. Writes text to cell
 * 5. Verifies write succeeded (post-check)
 * 6. Rolls back on any error
 *
 * ALL-OR-NOTHING: Either write all slots or none.
 * Partial writes = corrupted InDesign state = unacceptable.
 *
 * Architecture Rule (§ 7, § 9):
 * - Der Final Writer schreibt ausschliesslich final freigegebene Texte
 * - Marker-Slot-Zuordnung darf nur Programme vorbereiten, niemals Zielzellen befuellen
 * - Table Resolver darf nur bestehende InDesign-Objekte anhand von Script Labels aufloesen
 * - Probe Composer darf niemals in finale Zielzellen schreiben
 */

import { validateSlotSolution } from "./solutionValidator.js";
import { 
  handleCellWriteError,
  handleTableResolutionError,
  handleCellResolutionError,
  handleContextMismatchError,
  WriteError,
  guarded_write,
  retryWithBackoff
} from "./finalWriterErrorHandler.js";

/**
 * Creates a Final Writer instance.
 *
 * @param {Object} options
 * @param {Object} options.indesignApp - InDesign API
 * @param {Function} options.tableResolver - { resolveTable(), resolveCell() }
 * @param {Function} options.layoutInspector - { inspectCellLayout() }
 * @param {Function} [options.onProgress] - Progress callback
 * @returns {Object} - Writer with write() method
 *
 * @example
 * const writer = createFinalWriter({ indesignApp, tableResolver });
 * const result = await writer.writeSlots({ solutions, slotProfiles });
 */
export function createFinalWriter({
  indesignApp,
  tableResolver,
  layoutInspector,
  onProgress
} = {}) {
  if (!indesignApp) {
    throw new Error("Final Writer requires InDesign app");
  }

  if (!tableResolver || typeof tableResolver.resolveCell !== "function") {
    throw new Error("Final Writer requires table resolver");
  }

  return {
    /**
     * Writes multiple SlotSolutions to InDesign.
     *
     * @param {Object} options
     * @param {Array} options.solutions - SlotSolutions (all must exactFit: true)
     * @param {Array} options.slotProfiles - SlotProfiles (for validation)
     * @param {Array} options.qaReports - QA Reports (for audit trail)
     * @returns {Promise<Object>} - { success: boolean, written: [], failed: [], summary }
     *
     * WORKFLOW:
     * 1. Pre-validate all solutions
     * 2. For each solution:
     *    a. Resolve target cell by label
     *    b. Verify satzkontext (layout context)
     *    c. Save original content
     *    d. Write new content
     *    e. Post-check (re-measure in InDesign)
     *    f. Document in audit trail
     * 3. Return results
     */
    async writeSlots({
      solutions,
      slotProfiles = [],
      qaReports = []
    } = {}) {
      if (!Array.isArray(solutions)) {
        throw new Error("writeSlots requires solutions array");
      }

      onProgress?.({ step: "validate_all", message: "Validating all solutions..." });

      // Step 1: Pre-validate ALL solutions
      const validationResults = [];
      for (const solution of solutions) {
        const profile = slotProfiles.find(p => p.slotId === solution.slotId);
        const qaReport = qaReports.find(q => q.slotId === solution.slotId);

        const validation = validateSlotSolution({
          slotSolution: solution,
          slotProfile: profile,
          qaReport
        });

        if (!profile) {
          validation.errors.push(`SlotProfile missing for slot ${solution.slotId}`);
          validation.valid = false;
          validation.canWrite = false;
        }

        validationResults.push({
          slotId: solution.slotId,
          validation
        });

        if (!validation.valid) {
          onProgress?.({ 
            step: "validate", 
            slotId: solution.slotId,
            status: "BLOCKED",
            errors: validation.errors
          });
        }
      }

      // If any solution failed validation: abort all (all-or-nothing)
      const blockedSlots = validationResults.filter(r => !r.validation.valid);
      if (blockedSlots.length > 0) {
        return {
          success: false,
          written: [],
          failed: blockedSlots.map(b => ({
            slotId: b.slotId,
            reason: "validation_failed",
            errors: b.validation.errors
          })),
          summary: `❌ Write aborted: ${blockedSlots.length} solution(s) failed validation. No data written.`
        };
      }

      // Step 2: Write each solution
      const written = [];
      const failed = [];
      const rollbackStack = [];

      for (const solution of solutions) {
        onProgress?.({ step: "write", slotId: solution.slotId, message: "Writing to InDesign..." });
        const slotProfile = slotProfiles.find(p => p.slotId === solution.slotId);

        try {
          const result = await writeSingleSlot({
            solution,
            slotProfile,
            tableResolver,
            layoutInspector,
            indesignApp,
            onProgress
          });

          written.push(result.report);
          rollbackStack.push(result.rollbackEntry);
          onProgress?.({ step: "write_success", slotId: solution.slotId });
        } catch (error) {
          const rollbackFailures = await rollbackWrittenSlots(rollbackStack);
          failed.push({
            slotId: solution.slotId,
            error: error instanceof WriteError ? error.message : error.message,
            reason: error.reason || "unknown",
            rollbackFailures
          });
          onProgress?.({ step: "write_error", slotId: solution.slotId, error: error.message });
          return {
            success: false,
            written: [],
            failed,
            rolledBack: rollbackStack.length - rollbackFailures.length,
            rollbackFailures,
            summary: rollbackFailures.length === 0
              ? `Write aborted: slot ${solution.slotId} failed. ${rollbackStack.length} previous write(s) rolled back.`
              : `Write aborted: slot ${solution.slotId} failed. Rollback needs manual verification.`
          };
        }
      }

      return {
        success: failed.length === 0,
        written,
        failed,
        summary: failed.length === 0
          ? `✓ Successfully wrote ${written.length} slots to InDesign`
          : `⚠ Write completed with ${failed.length} error(s). See details.`
      };
    }
  };
}

/**
 * Writes a single SlotSolution to InDesign.
 *
 * @private
 */
async function writeSingleSlot({
  solution,
  slotProfile,
  tableResolver,
  layoutInspector,
  indesignApp,
  onProgress
} = {}) {
  const slotId = solution.slotId;
  let targetCell;
  let previousContent;

  // ========================================================================
  // Step A: Resolve target cell by label (read-only resolve)
  // ========================================================================

  try {
    if (!slotProfile || !slotProfile.sourceTableLabel || !slotProfile.targetCellLabel) {
      throw new Error("SlotProfile must provide sourceTableLabel and targetCellLabel.");
    }

    targetCell = tableResolver.resolveCell(
      slotProfile.sourceTableLabel,
      slotProfile.targetCellLabel
    );

    if (!targetCell) {
      throw new Error("Cell resolution returned null");
    }

    // Save original content for potential rollback
    previousContent = targetCell.contents;
  } catch (error) {
    throw handleCellResolutionError({
      slotId,
      cellLabel: slotProfile?.targetCellLabel
    });
  }

  // ========================================================================
  // Step B: Verify satzkontext (layout context matches)
  // ========================================================================

  if (layoutInspector && layoutInspector.inspectCellLayout) {
    try {
      const layout = layoutInspector.inspectCellLayout(targetCell);

      const contextIssues = collectContextIssues({ layout, slotProfile });
      if (contextIssues.length > 0) {
        throw handleContextMismatchError({
          slotId,
          probeContext: {
            targetHeightPt: slotProfile.targetHeightPt,
            paragraphStyleName: slotProfile.paragraphStyleName,
            timeCharacterStyleName: slotProfile.timeCharacterStyleName,
            titleCharacterStyleName: slotProfile.titleCharacterStyleName,
            bodyCharacterStyleName: slotProfile.bodyCharacterStyleName
          },
          finalContext: layout
        });
      }
    } catch (err) {
      if (err instanceof WriteError) {
        throw err;
      }

      throw handleContextMismatchError({
        slotId,
        probeContext: slotProfile,
        finalContext: { error: err.message }
      });
    }
  }

  // ========================================================================
  // Step C & D: Guard write operation (validate → execute → rollback)
  // ========================================================================

  try {
    await guarded_write({
      validate: async () => {
        // Pre-write validation
        return {
          valid: !!targetCell && solution.exactFit === true,
          errors: []
        };
      },

      execute: async () => {
        // Write text with retry logic (in case of transient timeout)
        return await retryWithBackoff({
          operation: async () => {
            targetCell.contents = solution.finalText;
            return {
              slotId,
              success: true,
              written: solution.finalText.length,
              variantCount: solution.usedVariants.length
            };
          },
          maxRetries: 2,
          delayMs: 500
        });
      },

      rollback: async () => {
        // If write fails, restore original content
        if (previousContent !== undefined) {
          targetCell.contents = previousContent;
        }
      }
    });
  } catch (error) {
    // Write failed - rollback handled by guarded_write
    throw error;
  }

  // ========================================================================
  // Step E: Post-check (verify write succeeded in InDesign)
  // ========================================================================

  try {
    const postCheckContent = targetCell.contents;
    const wrote_correctly = postCheckContent === solution.finalText;

    if (!wrote_correctly) {
      throw new Error(
        `Post-check failed: expected "${solution.finalText.substring(0, 20)}..." ` +
        `but got "${postCheckContent.substring(0, 20)}..."`
      );
    }

    if (layoutInspector && layoutInspector.inspectCellLayout) {
      const postWriteLayout = layoutInspector.inspectCellLayout(targetCell);
      const measureIssues = collectPostWriteMeasureIssues({
        layout: postWriteLayout,
        finalMeasure: solution.finalMeasure
      });

      if (measureIssues.length > 0) {
        throw new Error(`Post-write measurement mismatch: ${measureIssues.join(", ")}`);
      }
    }
  } catch (error) {
    // Post-check failed - rollback
    targetCell.contents = previousContent;
    throw new WriteError(
      `Post-check failed for slot ${slotId}: ${error.message}`,
      {
        slotId,
        reason: "post_check_failed",
        originalError: error
      }
    );
  }

  // ========================================================================
  // Step F: Document in audit trail
  // ========================================================================

  return {
    report: {
      slotId,
      status: "written",
      timestamp: new Date().toISOString(),
      content: solution.finalText,
      written: solution.finalText.length,
      variantCount: solution.usedVariants.length,
      variantsUsed: solution.usedVariants.map(v => ({
        programmeId: v.programmeId,
        level: v.level
      })),
      measurement: {
        composedLineCount: solution.finalMeasure?.composedLineCount,
        targetLineCount: solution.finalMeasure?.targetLineCount,
        exactMatch: solution.finalMeasure?.exactLineMatch
      }
    },
    rollbackEntry: {
      slotId,
      cell: targetCell,
      previousContent
    }
  };
}

function collectPostWriteMeasureIssues({ layout, finalMeasure }) {
  const issues = [];
  if (!layout || !finalMeasure) {
    return ["missing_measurement"];
  }

  if (Boolean(layout.overset) !== Boolean(finalMeasure.overset)) {
    issues.push("overset");
  }

  if (Number(layout.existingLineCount) !== Number(finalMeasure.composedLineCount)) {
    issues.push("composedLineCount");
  }

  return issues;
}

function collectContextIssues({ layout, slotProfile }) {
  const issues = [];
  if (!layout) {
    return ["missing_layout"];
  }

  if (Math.abs(Number(layout.targetHeightPt) - Number(slotProfile.targetHeightPt)) > 0.01) {
    issues.push("targetHeightPt");
  }

  const styleFields = [
    "paragraphStyleName",
    "timeCharacterStyleName",
    "titleCharacterStyleName",
    "bodyCharacterStyleName"
  ];

  styleFields.forEach((fieldName) => {
    if (layout[fieldName] && slotProfile[fieldName] && layout[fieldName] !== slotProfile[fieldName]) {
      issues.push(fieldName);
    }
  });

  return issues;
}

async function rollbackWrittenSlots(rollbackStack) {
  const failures = [];

  for (let index = rollbackStack.length - 1; index >= 0; index--) {
    const entry = rollbackStack[index];
    try {
      entry.cell.contents = entry.previousContent;
    } catch (error) {
      failures.push({
        slotId: entry.slotId,
        error: error.message
      });
    }
  }

  return failures;
}

/**
 * Exports write report to file/log.
 *
 * @param {Object} writeResult - Result from writeSlots()
 * @param {string} [format] - 'json', 'markdown' (default)
 * @returns {string}
 */
export function exportWriteReport(writeResult, format = "markdown") {
  if (format === "json") {
    return JSON.stringify(writeResult, null, 2);
  }

  if (format === "markdown") {
    const lines = [
      "# Final Writer Report",
      "",
      `## Status: ${writeResult.success ? "✓ SUCCESS" : "✗ FAILED"}`,
      "",
      `### Summary`,
      `${writeResult.summary}`,
      "",
      `### Written Slots (${writeResult.written.length})`,
      ...writeResult.written.map(w =>
        `- **${w.slotId}**: ${w.written} chars, ${w.variantCount} variants`
      ),
      ""
    ];

    if (writeResult.failed.length > 0) {
      lines.push(`### Failed Slots (${writeResult.failed.length})`);
      writeResult.failed.forEach(f => {
        lines.push(`- **${f.slotId}**: ${f.reason}`);
        lines.push(`  ${f.error}`);
      });
    }

    return lines.join("\n");
  }

  throw new Error(`Unknown export format: ${format}`);
}
