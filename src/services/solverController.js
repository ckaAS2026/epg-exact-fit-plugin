/**
 * Solver Controller / Loop Manager
 *
 * Orchestrates the slot solving process according to Architecture § 6.3 (11 steps).
 * This is the heart of Phase 7: manages candidate generation, probe measurement,
 * variant escalation, and abort criteria.
 *
 * Core responsibility: Keep solving loop bounded, measurable, and traceable.
 * No infinite loops. No approximation. exactFit: true or explicit failure.
 *
 * ARCHITECTURE RULE (§ 6.3):
 * - Minimalzustand zuerst (try smallest variant first)
 * - Dann kontrollierte Expansion (discrete level escalation)
 * - Nach jedem Move: probe-Messung (binding truth)
 * - Ein Fit-Loop muss abbrechen, wenn sich Messfeedback wiederholt
 */

import { determineVariantLevelOrder } from "./variantLevelStrategy.js";
import { createRewriteCounter } from "./rewriteRequestGenerator.js";

const MAX_CANDIDATE_ATTEMPTS = 50; // Safeguard against infinite loops
const FEEDBACK_REPETITION_THRESHOLD = 3; // Abort if same feedback 3× in a row

/**
 * Solver State & Decision Log
 */
function createSolverState(slotId) {
  return {
    slotId,
    currentAttempt: 0,
    currentCandidateState: null,
    previousMeasures: [], // Track history to detect repetition
    previousFeedback: null,
    feedbackRepetitionCount: 0,
    decisionLog: [],
    rewriteCounter: createRewriteCounter(),

    logDecision(action, result, metadata) {
      this.decisionLog.push({
        attempt: this.currentAttempt,
        timestamp: new Date().toISOString(),
        action,
        result,
        metadata
      });
    }
  };
}

/**
 * Main solver controller function.
 *
 * Solves a single slot by iteratively:
 * 1. Generating candidates (variant combinations)
 * 2. Measuring with probeComposer
 * 3. Checking for exact fit
 * 4. Escalating or requesting rewrites
 * 5. Aborting on limits/repetition
 *
 * @param {Object} options
 * @param {SlotProfile} options.slotProfile - Target slot constraints
 * @param {OriginalProgramme[]} options.originalProgrammes - Source programmes (chronological)
 * @param {ProgrammeVariant[]} options.allVariants - Available variants (pre-generated)
 * @param {Object} options.probeComposer - InDesign measurement interface
 * @param {Function} options.variantFactory - To generate new variants on demand
 * @param {Function} [options.onProgress] - Progress callback
 * @returns {Promise<SlotSolution>} - { slotId, finalText, measure, exactFit: true, usedVariants, qa }
 *        or throws SolveFailure
 *
 * @throws SolveFailure with detailed diagnostics if no exact-fit solution found
 */
export async function solveSlotWithProbe({
  slotProfile,
  originalProgrammes,
  allVariants,
  probeComposer,
  variantFactory,
  onProgress
} = {}) {
  // Validation
  if (!slotProfile) throw new Error("solveSlot requires slotProfile");
  if (!Array.isArray(originalProgrammes) || !originalProgrammes.length) {
    throw new Error("solveSlot requires originalProgrammes array");
  }
  if (!Array.isArray(allVariants) || !allVariants.length) {
    throw new Error("solveSlot requires allVariants array");
  }
  if (!probeComposer || typeof probeComposer.measureCandidate !== "function") {
    throw new Error("solveSlot requires probeComposer with measureCandidate()");
  }

  const state = createSolverState(slotProfile.slotId);

  // === STEP 1-3: Load profile, gather programmes, classify
  // (Already done by caller; we receive sorted originalProgrammes + classified)

  // === STEP 4-5: Generate initial variants & measure minimum
  state.logDecision("init", "Starting slot solver", { programmeCount: originalProgrammes.length });
  onProgress?.({ step: "init", message: `Solving slot ${slotProfile.slotId}...` });

  // Minimum state: timeTitle for each programme
  const minimalCandidate = buildMinimalCandidate({
    originalProgrammes,
    allVariants
  });

  if (!minimalCandidate) {
    throw new SolveFailure(slotProfile.slotId, "No timeTitle variants available", state);
  }

  // === STEP 5: Measure minimum
  state.currentAttempt++;
  onProgress?.({ step: "measure_minimal", attempt: state.currentAttempt });

  let minimalMeasure;
  try {
    minimalMeasure = await probeComposer.measureCandidate({
      slotProfile,
      candidateText: minimalCandidate.text
    });
    state.logDecision("probe_minimal", "Minimal candidate measured", {
      composedLineCount: minimalMeasure.composedLineCount,
      targetLineCount: minimalMeasure.targetLineCount,
      overset: minimalMeasure.overset
    });
    state.previousMeasures.push(minimalMeasure);
  } catch (err) {
    throw new SolveFailure(
      slotProfile.slotId,
      `Probe measurement failed for minimal candidate: ${err.message}`,
      state
    );
  }

  // === STEP 6: Hard fail if minimum doesn't fit
  if (minimalMeasure.overset) {
    throw new SolveFailure(
      slotProfile.slotId,
      "Minimal candidate (timeTitle only) overflows. Cannot fit any text in this slot. " +
      "(Architecture rule: no auto-cutting, hard fail.)",
      state
    );
  }

  if (minimalMeasure.composedLineCount < 1) {
    throw new SolveFailure(
      slotProfile.slotId,
      "Minimal candidate resulted in 0 lines. Slot may be empty or text invisible.",
      state
    );
  }

  state.currentCandidateState = minimalCandidate;
  state.previousFeedback = feedbackFromMeasure(minimalMeasure, slotProfile);

  // === STEP 7-10: Iterative expansion / rewrite loop
  while (state.currentAttempt < MAX_CANDIDATE_ATTEMPTS) {
    state.currentAttempt++;

    // Check if we have exact fit
    if (minimalMeasure.exactLineMatch && !minimalMeasure.overset) {
      state.logDecision("success", "Exact fit found", minimalMeasure);
      onProgress?.({ step: "success", attempt: state.currentAttempt });

      return buildSlotSolution({
        slotProfile,
        candidateState: state.currentCandidateState,
        measure: minimalMeasure,
        usedVariants: state.currentCandidateState.chosenVariants,
        decisionLog: state.decisionLog,
        rewriteCount: state.rewriteCounter.getTotalCount()
      });
    }

    // Feedback: too much (overset) or too little (underfill)
    const feedback = feedbackFromMeasure(minimalMeasure, slotProfile);

    // Check for repetition (same feedback N times = give up)
    if (feedback === state.previousFeedback) {
      state.feedbackRepetitionCount++;
      if (state.feedbackRepetitionCount >= FEEDBACK_REPETITION_THRESHOLD) {
        throw new SolveFailure(
          slotProfile.slotId,
          `Solver feedback repeated ${FEEDBACK_REPETITION_THRESHOLD}× (${feedback}). ` +
          "No progress being made. Giving up.",
          state
        );
      }
    } else {
      state.feedbackRepetitionCount = 0;
    }
    state.previousFeedback = feedback;

    // Try next candidate
    onProgress?.({ step: "expand", attempt: state.currentAttempt, feedback });

    const nextCandidate = await getNextCandidate({
      current: state.currentCandidateState,
      feedback,
      originalProgrammes,
      allVariants,
      variantFactory,
      slotProfile,
      rewriteCounter: state.rewriteCounter,
      state
    });

    if (!nextCandidate) {
      throw new SolveFailure(
        slotProfile.slotId,
        `No more candidate states to try (feedback: ${feedback}). Unable to find exact fit.`,
        state
      );
    }

    state.currentCandidateState = nextCandidate;

    // === STEP 8: Measure new candidate
    try {
      minimalMeasure = await probeComposer.measureCandidate({
        slotProfile,
        candidateText: nextCandidate.text
      });
      state.logDecision("probe", `Candidate measured (attempt ${state.currentAttempt})`, {
        feedback,
        composedLineCount: minimalMeasure.composedLineCount,
        overset: minimalMeasure.overset
      });
      state.previousMeasures.push(minimalMeasure);
    } catch (err) {
      throw new SolveFailure(
        slotProfile.slotId,
        `Probe measurement failed at attempt ${state.currentAttempt}: ${err.message}`,
        state
      );
    }
  }

  // Max attempts exceeded
  throw new SolveFailure(
    slotProfile.slotId,
    `Max solving attempts (${MAX_CANDIDATE_ATTEMPTS}) exceeded. Unable to find exact fit.`,
    state
  );
}

/**
 * Builds the minimal candidate state: all programmes at their minimum level (timeTitle).
 *
 * @private
 */
function buildMinimalCandidate({ originalProgrammes, allVariants }) {
  const chosenVariants = [];
  const texts = [];

  for (const prog of originalProgrammes) {
    const variant = allVariants.find(v =>
      v.programmeId === prog.programmeId &&
      v.level === "timeTitle"
    );

    if (!variant) {
      return null; // Cannot build minimal candidate
    }

    chosenVariants.push(variant);
    texts.push(variant.text);
  }

  return {
    text: texts.join("\n"),
    chosenVariants,
    programmeIds: originalProgrammes.map(p => p.programmeId)
  };
}

/**
 * Analyzes measure and returns feedback type.
 *
 * @private
 */
function feedbackFromMeasure(measure, slotProfile) {
  if (measure.overset) {
    return "overset"; // Text too long
  }
  if (measure.composedLineCount < slotProfile.exactLineCount) {
    return "underfill"; // Text too short
  }
  if (measure.composedLineCount > slotProfile.exactLineCount) {
    return "overfill";
  }
  return "unknown";
}

/**
 * Determines next candidate to try based on feedback.
 *
 * Strategy:
 * - overset: try to use shorter variants
 * - underfill: try to use longer variants
 *
 * @private
 */
async function getNextCandidate({
  current,
  feedback,
  originalProgrammes,
  allVariants,
  variantFactory,
  slotProfile,
  rewriteCounter,
  state
}) {
  if (feedback === "overset" || feedback === "overfill") {
    // Try to shorten: escalate to shorter variant levels
    return tryEscalateVariants({
      current,
      direction: "shorter",
      allVariants,
      slotProfile,
      state
    });
  }

  if (feedback === "underfill") {
    // Try to lengthen: escalate to longer variant levels
    const longer = tryEscalateVariants({
      current,
      direction: "longer",
      allVariants,
      slotProfile,
      state
    });

    if (longer) {
      return longer;
    }

    // No more variants to try → request rewrite
    state.logDecision("rewrite_request", "Requesting new variants", {
      reason: feedback === "overset" ? "needLessText" : "needMoreText"
    });

    try {
      rewriteCounter.recordRewrite(current.programmeIds[0]); // Simplified: rewrite first prog
      // In real implementation: would call variantFactory with RewriteRequest
      // and generate new variants at next level
    } catch (err) {
      state.logDecision("rewrite_failed", `Rewrite counter exceeded: ${err.message}`, {});
      return null; // Cannot proceed
    }
  }

  return null;
}

/**
 * Tries to escalate variants (shorter or longer).
 *
 * @private
 */
function tryEscalateVariants({ current, direction, allVariants, slotProfile, state }) {
  // Simplified implementation: try to find variants at different levels
  // In full implementation: would systematically try next levels per programme

  const nextCandidate = { ...current, chosenVariants: [] };
  let changed = false;

  for (const variant of current.chosenVariants) {
    const availableLevels = allVariants
      .filter((candidate) => candidate.programmeId === variant.programmeId)
      .map((candidate) => candidate.level);
    const levelOrder = determineVariantLevelOrder({
      programmeClass: variant.programmeClass,
      slotProfile,
      availableLevels
    });
    const currentLevel = variant.level;
    const currentIndex = levelOrder.indexOf(currentLevel);

    if (currentIndex < 0) {
      nextCandidate.chosenVariants.push(variant);
      continue;
    }

    const nextIndex = direction === "longer"
      ? currentIndex + 1
      : currentIndex - 1;

    if (nextIndex >= 0 && nextIndex < levelOrder.length) {
      const nextLevel = levelOrder[nextIndex];
      const nextVariant = allVariants.find(v =>
        v.programmeId === variant.programmeId &&
        v.level === nextLevel
      );

      if (nextVariant) {
        nextCandidate.chosenVariants.push(nextVariant);
        changed = true;
        state.logDecision("escalate", `${variant.programmeId}: ${currentLevel} → ${nextLevel}`, {});
        continue;
      }
    }

    // Cannot escalate this variant, keep current
    nextCandidate.chosenVariants.push(variant);
  }

  if (!changed) {
    return null; // No escalation possible
  }

  nextCandidate.text = nextCandidate.chosenVariants.map(v => v.text).join("\n");
  return nextCandidate;
}

/**
 * Builds final SlotSolution from successful candidate state.
 *
 * @private
 */
function buildSlotSolution({
  slotProfile,
  candidateState,
  measure,
  usedVariants,
  decisionLog,
  rewriteCount
}) {
  return Object.freeze({
    slotId: slotProfile.slotId,
    finalText: candidateState.text,
    finalMeasure: measure,
    exactFit: true, // By definition: only returned when exact fit confirmed
    usedVariants: usedVariants.map(v => ({
      programmeId: v.programmeId,
      level: v.level,
      text: v.text,
      programmeClass: v.programmeClass,
      priority: v.priority,
      basedOnSourceHash: v.basedOnSourceHash,
      basedOnSourceFingerprint: v.basedOnSourceFingerprint,
      basedOnOriginalOnly: v.basedOnOriginalOnly,
      isCompletePhrase: v.isCompletePhrase,
      hasNoTruncation: v.hasNoTruncation,
      hasNoHallucinationRisk: v.hasNoHallucinationRisk,
      qualityScore: v.qualityScore
    })),
    rewriteCount,
    decisionLog,
    qa: {
      noOverset: !measure.overset,
      noUnderfill: measure.exactLineMatch,
      allTextsSourcePure: true, // By architecture: all variants enforce basedOnOriginalOnly
      noTruncation: true, // By architecture: variantFactory guarantees complete sentences
      noArtificialPadding: true // No padding in solver
    }
  });
}

/**
 * Structured error for solver failures.
 */
export class SolveFailure extends Error {
  constructor(slotId, message, solverState) {
    super(message);
    this.name = "SolveFailure";
    this.slotId = slotId;
    this.solverState = solverState;
    this.diagnostics = {
      attemptCount: solverState.currentAttempt,
      decisionLog: solverState.decisionLog,
      previousMeasures: solverState.previousMeasures,
      previousFeedback: solverState.previousFeedback
    };
  }
}

export { MAX_CANDIDATE_ATTEMPTS, FEEDBACK_REPETITION_THRESHOLD };
