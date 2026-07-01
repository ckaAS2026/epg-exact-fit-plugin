import { solveSlotWithProbe, SolveFailure } from "./solverController.js";
import { determineVariantLevelOrder } from "./variantLevelStrategy.js";

/**
 * Exact Fit Solver
 *
 * Implements Architecture § 6.3: The 11-step slot solver.
 *
 * Core principle: Find a text combination that fits EXACTLY into the target slot
 * in terms of line count and typesetting, with no approximation.
 *
 * CRITICAL RULES (from ARCHITECTURE_CONTEXT.md):
 * 1. exactFit: true means:
 *    - composedLineCount === exactLineCount
 *    - overset === false
 *    - No truncation, no artificial padding
 *    - All text is source-pure (basedOnOriginalOnly: true)
 *
 * 2. No approximation:
 *    - Character count is NOT used as truth
 *    - Line count is ONLY from InDesign Probe measurement
 *    - If exact fit impossible → SolveFailure (not "close enough")
 *
 * 3. No infinite loops:
 *    - Max attempts bounded
 *    - Rewrite request escalation bounded
 *    - Feedback repetition detection
 *
 * 4. Solver only solves what's possible:
 *    - If minimal text (time + title) overflows → hard fail, no cutting
 *    - If no variants exist at required levels → fail
 */

export function createExactFitSolver({ probeComposer, variantFactory } = {}) {
  return {
    /**
     * Solves a single slot for exact line fill.
     *
     * @param {Object} options
     * @param {SlotProfile} options.slotProfile - Target slot with exactLineCount, targetHeightPt
     * @param {OriginalProgramme[]} options.originalProgrammes - Source programmes (already classified, sorted chronologically)
     * @param {ProgrammeVariant[]} options.variants - Available variants (pre-generated)
     * @param {Function} [options.onProgress] - Progress callback
     * @returns {Promise<SlotSolution>} - { slotId, finalText, finalMeasure, exactFit: true, usedVariants, qa }
     * @throws {SolveFailure} - Structured error with diagnostics if no exact fit found
     *
     * Workflow (11 steps from Architecture § 6.3):
     * 1. Validate inputs (profile, programmes, variants, probe)
     * 2. Classify programmes (already done by caller)
     * 3. Group variants by programme
     * 4. Generate initial candidates (minimal: time + title)
     * 5. Measure minimal candidate in InDesign
     * 6. Hard fail if minimal doesn't fit (no auto-cutting)
     * 7. Start expansion search (try longer variants)
     * 8. Measure each candidate via probeComposer (binding truth)
     * 9. On exact fit → return solution
     * 10. On mismatch → try next variant level or request rewrite
     * 11. After max attempts/rewrites → fail
     */
    async solveSlot({
      slotProfile,
      originalProgrammes,
      variants,
      onProgress
    } = {}) {
      // === VALIDATION (Step 1)
      if (!slotProfile) {
        throw new Error("Exact Fit Solver requires a SlotProfile.");
      }

      if (!probeComposer || typeof probeComposer.measureCandidate !== "function") {
        throw new Error(
          "Exact Fit Solver requires an InDesign Probe / ProbeComposer with measureCandidate() method. " +
          "ProbeComposer integration not active."
        );
      }

      if (!Array.isArray(originalProgrammes) || !originalProgrammes.length) {
        throw new Error("Exact Fit Solver requires OriginalProgramme array.");
      }

      if (!Array.isArray(variants) || !variants.length) {
        throw new Error("Exact Fit Solver requires ProgrammeVariant array.");
      }

      // Verify source-purity: all variants must have basedOnOriginalOnly: true
      const impureVariants = variants.filter(v => v.basedOnOriginalOnly !== true);
      if (impureVariants.length > 0) {
        throw new Error(
          `Exact Fit Solver found ${impureVariants.length} non-source-pure variants. ` +
          "All variants must have basedOnOriginalOnly: true (Architecture § 5.0)"
        );
      }

      onProgress?.({ step: "validate", status: "ok" });

      // === CORE SOLVING (Step 2-11)
      // Delegate to solverController which manages the iterative loop
      try {
        const solution = await solveSlotWithProbe({
          slotProfile,
          originalProgrammes,
          allVariants: variants,
          probeComposer,
          variantFactory,
          onProgress
        });

        return solution;
      } catch (err) {
        if (err instanceof SolveFailure) {
          // Structured failure: include diagnostics
          throw err;
        }

        // Unexpected error: wrap it
        throw new Error(`Exact Fit Solver error: ${err.message}`);
      }
    }
  };
}

// Default solver instance with solveSlotWithProbe method pre-bound
export const exactFitSolver = {
  solveSlotWithProbe
};
