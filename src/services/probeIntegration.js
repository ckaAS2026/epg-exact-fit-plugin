/**
 * Probe Integration Documentation & Activation
 *
 * This file documents how the Exact Fit Solver integrates with ProbeComposer
 * for real-time measurement in InDesign.
 *
 * CRITICAL RULE (Architecture § 6.3, step 8):
 * "Nach jedem Move: Probe Composer misst im echten Satzkontext."
 *
 * Translation: After every candidate state change, probe measures in real InDesign context.
 * This is NOT simulation or approximation — it's the verbindliche Wahrheit (binding truth).
 *
 * ============================================================================
 * PROBE INTEGRATION ARCHITECTURE
 * ============================================================================
 *
 * The solver flow:
 *
 * 1. exactFitSolver receives: slotProfile, originalProgrammes, variants
 * 2. Solver creates candidate state (text concatenation)
 * 3. Solver calls: probeComposer.measureCandidate({ slotProfile, candidateText })
 * 4. ProbeComposer:
 *    a) Resolves probe cell in InDesign table (via tableResolver + script label)
 *    b) Saves original contents (restore-on-error)
 *    c) Sets cell.contents = candidateText
 *    d) Measures composition (lines, overflows, height)
 *    e) Restores original contents
 *    f) Returns ProbeMeasure object
 * 5. Solver evaluates measure:
 *    - exactLineMatch && !overset → SUCCESS
 *    - overset or underflow → try next variant level
 *    - no more variants → rewrite request
 *
 * ============================================================================
 * KEY CONTRACTS
 * ============================================================================
 *
 * ProbeComposer.measureCandidate() signature:
 * {
 *   slotProfile: SlotProfile (with exactLineCount, targetHeightPt),
 *   candidateText: string (concatenated programme texts),
 *   dryRun: boolean (optional, defaults false)
 * } → Promise<ProbeMeasure>
 *
 * ProbeMeasure returned:
 * {
 *   overset: boolean,
 *   composedLineCount: number,
 *   usedHeightPt: number (calculated from composedLineCount),
 *   targetLineCount: number,
 *   targetHeightPt: number,
 *   exactLineMatch: boolean (!overset && composedLineCount === targetLineCount),
 *   exactHeightMatch: boolean (!overset && height diff < 0.01pt)
 * }
 *
 * ============================================================================
 * SOLVER INTEGRATION CHECKLIST
 * ============================================================================
 *
 * Activation requirements (must be true before Phase 7 solver starts):
 *
 * ✅ ProbeComposer exists and implements measureCandidate()
 * ✅ Table Resolver can find InDesign tables by script label
 * ✅ Probe cells are configured with labels (e.g., sourceTableLabel, probeCellLabel)
 * ✅ SlotProfile contains references to probe cell labels
 * ⏳ exactFitSolver must call probeComposer on every candidate
 * ⏳ Solver must respect ProbeMeasure as binding truth (not character count)
 * ⏳ Solver must handle InDesign errors (timeout, cell not found, etc.)
 *
 * ============================================================================
 * MEASUREMENT TRUTH PRIORITY (Architecture § 6.0, § 6.3)
 * ============================================================================
 *
 * What is "truth" for exact fit? In priority order:
 *
 * 1. ProbeMeasure from InDesign:
 *    - composedLineCount (actual lines in slot, in real layout context)
 *    - overset flag (text doesn't fit)
 *    - usedHeightPt (calculated from line count × line height)
 *
 * 2. SlotProfile constraints:
 *    - exactLineCount (target line number)
 *    - targetHeightPt (target height in points)
 *
 * 3. Text quality:
 *    - No truncation (complete sentences)
 *    - No artificial padding
 *    - Source-pure (basedOnOriginalOnly: true)
 *
 * 4. NEVER used as sole truth:
 *    - Character count / word count (too unreliable with different fonts)
 *    - Estimated line breaks (different from actual InDesign rendering)
 *    - Approximation "close enough" (must be exact or rewrite)
 *
 * ============================================================================
 * SOLVER ERROR HANDLING FOR PROBE
 * ============================================================================
 *
 * Possible probe failures:
 *
 * 1. Probe cell not found
 *    → Log error, mark slot as unsolvable, generate QA-Report with failure
 *
 * 2. InDesign timeout (no response for N seconds)
 *    → Retry 1× with delay, then fail with timeout error
 *
 * 3. Table not found
 *    → Check if table has correct script label, log configuration error
 *
 * 4. Cell restoration fails
 *    → InDesign state is corrupted, entire slot is unreliable, fail hard
 *
 * None of these should result in "approximate" fitting. All must result in
 * explicit failure with diagnostic info.
 *
 * ============================================================================
 * TYPICAL SOLVER-PROBE CONVERSATION
 * ============================================================================
 *
 * Solver: "I want to try [Prog1: short], [Prog2: micro] in slot3"
 * Solver: → Concatenate texts
 * Solver: → Call probeComposer.measureCandidate({
 *           slotProfile: slot3Profile,
 *           candidateText: "[Prog1 short text] [Prog2 micro text]"
 *         })
 *
 * ProbeComposer: (measures in InDesign)
 * ProbeComposer: → {
 *   overset: false,
 *   composedLineCount: 4,
 *   targetLineCount: 4,
 *   exactLineMatch: true,
 *   exactHeightMatch: true
 * }
 *
 * Solver: "Perfect! This is exactFit: true. Write to SlotCandidateState."
 *
 * ---OR---
 *
 * ProbeComposer: → {
 *   overset: true,
 *   composedLineCount: 5,
 *   targetLineCount: 4,
 *   exactLineMatch: false
 * }
 *
 * Solver: "Overset. Text too long. Try next variant level or rewrite."
 *
 * ---OR---
 *
 * ProbeComposer: → {
 *   overset: false,
 *   composedLineCount: 2,
 *   targetLineCount: 4,
 *   exactLineMatch: false
 * }
 *
 * Solver: "Underfill (2/4 lines). Try next longer variant or add text."
 *
 * ============================================================================
 * TEST STRATEGY FOR PROBE INTEGRATION
 * ============================================================================
 *
 * Unit tests verify:
 * - ProbeComposer.measureCandidate() signature correct
 * - ProbeMeasure contract (all fields present, correct types)
 * - Cell restoration works (original contents restored after measurement)
 * - Error handling (missing cell, timeout, etc.)
 *
 * Integration tests verify:
 * - Solver calls probeComposer after every candidate
 * - Solver uses ProbeMeasure.exactLineMatch (not character count)
 * - Solver respects overset flag (no accepting text that overflows)
 *
 * Smoke tests verify:
 * - In actual InDesign with real table/probe cell
 * - Measurement accuracy (does measured line count match visual?)
 * - Cell restoration integrity (no data loss after probe)
 *
 * ============================================================================
 */

// ACTIVATION STATUS (from Architecture Context 1.11):
//
// Current: "Probe Composer mit Probe-Zell-Restore vorbereitet,
//           noch nicht an echte Zieltabellenprofile angeschlossen"
//
// Activation checklist:
// ✅ probeComposer.js exists with measureCandidate()
// ✅ tableResolver.js exists to find tables by label
// ✅ layoutInspector.js exists to read cell properties
// ⏳ slotProfiles.js needs: sourceTableLabel, probeCellLabel added
// ⏳ exactFitSolver.js needs to call probeComposer on every candidate
// ⏳ Test suite must verify probe integration end-to-end
//
// This file serves as the integration documentation and checklist.
// It is imported but not directly called. Its purpose is to document
// the architecture contract so solvers and probes stay aligned.

export const PROBE_INTEGRATION_STATUS = {
  componentExists: true, // probeComposer.js ✅
  tableResolverExists: true, // tableResolver.js ✅
  measureCandidateSignature: "async measureCandidate({ slotProfile, candidateText, dryRun })",
  probeMeasureFields: [
    "overset",
    "composedLineCount",
    "usedHeightPt",
    "targetLineCount",
    "targetHeightPt",
    "exactLineMatch",
    "exactHeightMatch"
  ],
  solverIntegration: "pending", // exactFitSolver not yet calling probeComposer
  ready: false // Ready when solver integration is complete
};

/**
 * Documents the probe measurement philosophy.
 * Used in code comments and error messages to keep the team aligned.
 */
export const PROBE_PHILOSOPHY = `
PROBE PHILOSOPHY (Architecture § 6.0):

Prümaere Wahrheit sind belegte Zeilen und Satzstand im echten InDesign-Kontext.

Translation:
"Primary truth is occupied lines and typeset state in actual InDesign context."

This means:
1. InDesign is the measurement authority (not character count estimates)
2. Actual line count after rendering is what matters
3. Slot is only "exact fit" if it matches target line count AND has no overset
4. Solver must trust probeComposer measurements completely
`;

export default {
  PROBE_INTEGRATION_STATUS,
  PROBE_PHILOSOPHY
};
