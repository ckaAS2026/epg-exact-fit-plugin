/**
 * Rewrite Request Generator
 *
 * When the solver determines that existing variants don't achieve exact fit,
 * it requests new variants at specific levels. This generator creates RewriteRequest
 * objects that contain ONLY original programme data — never any generated/kunsttext.
 *
 * Critical architecture rule (§ 2, § 5.0):
 * - RewriteRequest must contain original source fields only
 * - Rewrite output must have basedOnOriginalOnly: true
 * - GeneratedVariants are NEVER used as input for further variants
 * - Only OriginalProgramme → new Variant (1-step only)
 *
 * Max rewrites per programme: 5 (prevents infinite loops)
 * Max total rewrites per slot: 15 (sanity limit)
 */

import { createSourceFingerprint, createSourceHash } from "../utils/sourceIdentity.js";

const MAX_REWRITES_PER_PROGRAMME = 5;
const MAX_REWRITES_PER_SLOT = 15;

/**
 * Creates a rewrite request when current variants don't fit.
 *
 * @param {Object} options
 * @param {string} options.slotId
 * @param {OriginalProgramme} options.originalProgramme - Original source, never a variant
 * @param {string} options.requestedLevel - 'timeTitle' | 'micro' | 'short' | 'medium' | 'long'
 * @param {string} options.reason - 'needMoreText' | 'needLessText' | 'currentVariantsDoNotFit' | 'qualityRejected'
 * @param {string} [options.rejectionEvidence] - Why it was rejected (e.g., overset/underfill)
 * @returns {Object} - RewriteRequest contract
 *
 * @throws if originalProgramme is missing or reason is invalid
 *
 * @example
 * const rewriteReq = createRewriteRequest({
 *   slotId: 'slot1',
 *   originalProgramme: programme,
 *   requestedLevel: 'medium',
 *   reason: 'needMoreText',
 *   rejectionEvidence: 'underfill: target 4 lines, got 2'
 * });
 */
export function createRewriteRequest({
  slotId,
  originalProgramme,
  requestedLevel,
  reason,
  rejectionEvidence
} = {}) {
  if (!slotId) throw new Error("RewriteRequest requires slotId");
  if (!originalProgramme) throw new Error("RewriteRequest requires OriginalProgramme (never a variant)");
  if (!requestedLevel) throw new Error("RewriteRequest requires requestedLevel");

  const validReasons = ["needMoreText", "needLessText", "currentVariantsDoNotFit", "qualityRejected"];
  if (!validReasons.includes(reason)) {
    throw new Error(`RewriteRequest reason must be one of: ${validReasons.join(", ")}`);
  }

  // Verify we got an OriginalProgramme (has sourceHash, not variantId)
  if (!originalProgramme.sourceHash || originalProgramme.variantId) {
    throw new Error(
      "RewriteRequest must receive OriginalProgramme, not a variant. " +
      "Architecture rule: Variants are never the source for new variants."
    );
  }

  const sourceHash = originalProgramme.sourceHash || createSourceHash(originalProgramme);
  const sourceFingerprint = originalProgramme.sourceFingerprint || createSourceFingerprint(originalProgramme);

  return Object.freeze({
    slotId,
    programmeId: originalProgramme.programmeId,
    requestedLevel,
    reason,
    rejectionEvidence,

    // Original source fields only (read-only)
    originalTitle: originalProgramme.originalTitle,
    originalSubtitle: originalProgramme.originalSubtitle || null,
    originalDescription: originalProgramme.originalDescription || null,
    programmeClass: originalProgramme.programmeClass,
    priority: originalProgramme.priority,
    genre: originalProgramme.genre || null,
    category: originalProgramme.category || null,

    // Source identity (immutable)
    originalSourceHash: sourceHash,
    sourceHash,
    sourceFingerprint,
    basedOnOriginalOnly: true // Contract: this ALWAYS true for RewriteRequest
  });
}

/**
 * Validates that a rewrite request is properly formed and source-pure.
 *
 * @param {Object} rewriteRequest
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validateRewriteRequest(rewriteRequest) {
  const errors = [];

  if (!rewriteRequest.slotId) errors.push("Missing slotId");
  if (!rewriteRequest.programmeId) errors.push("Missing programmeId");
  if (!rewriteRequest.requestedLevel) errors.push("Missing requestedLevel");
  if (!rewriteRequest.reason) errors.push("Missing reason");
  if (!rewriteRequest.originalTitle) errors.push("Missing originalTitle (source field)");
  if (!rewriteRequest.sourceHash) errors.push("Missing sourceHash");
  if (rewriteRequest.basedOnOriginalOnly !== true) {
    errors.push("basedOnOriginalOnly must be true (source-purity contract)");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Manages rewrite request counters to prevent infinite loops.
 *
 * @returns {Object} - Counter object with increment/check methods
 */
export function createRewriteCounter() {
  const countPerProgramme = new Map();
  let totalCount = 0;

  return {
    /**
     * Records a rewrite request for a programme
     * @throws if limits exceeded
     */
    recordRewrite(programmeId) {
      const current = countPerProgramme.get(programmeId) || 0;
      if (current >= MAX_REWRITES_PER_PROGRAMME) {
        throw new Error(
          `Max rewrites (${MAX_REWRITES_PER_PROGRAMME}) exceeded for programme ${programmeId}. ` +
          "This indicates no exact-fit solution exists with current data."
        );
      }

      if (totalCount >= MAX_REWRITES_PER_SLOT) {
        throw new Error(
          `Max total rewrites (${MAX_REWRITES_PER_SLOT}) exceeded for slot. ` +
          "Aborting to prevent infinite loop."
        );
      }

      countPerProgramme.set(programmeId, current + 1);
      totalCount++;
    },

    /**
     * Gets current rewrite count for a programme
     */
    getCount(programmeId) {
      return countPerProgramme.get(programmeId) || 0;
    },

    /**
     * Gets total rewrite count across all programmes
     */
    getTotalCount() {
      return totalCount;
    },

    /**
     * Resets counters (for testing or new slots)
     */
    reset() {
      countPerProgramme.clear();
      totalCount = 0;
    }
  };
}

/**
 * Creates a batch of rewrite requests for multiple rejected programmes.
 *
 * @param {Object} options
 * @param {string} options.slotId
 * @param {Array} options.rejectedProgrammes - Array of { originalProgramme, currentLevel, reason }
 * @returns {Array} - RewriteRequest array
 */
export function createBatchRewriteRequests({
  slotId,
  rejectedProgrammes
} = {}) {
  if (!slotId) throw new Error("createBatchRewriteRequests requires slotId");
  if (!Array.isArray(rejectedProgrammes)) {
    throw new Error("rejectedProgrammes must be an array");
  }

  return rejectedProgrammes.map(({ originalProgramme, currentLevel, reason, evidence }) => {
    // Determine next level to try (escalation strategy)
    const nextLevel = escalateVariantLevel(currentLevel);

    return createRewriteRequest({
      slotId,
      originalProgramme,
      requestedLevel: nextLevel,
      reason,
      rejectionEvidence: evidence
    });
  });
}

/**
 * Determines the next variant level to try when current one didn't work.
 *
 * Escalation strategy:
 * - needLessText: try shorter level (timeTitle ← micro ← short ← medium ← long)
 * - needMoreText: try longer level (long ← medium ← short ← micro ← timeTitle)
 * - currentVariantsDoNotFit: try adjacent level (prefer longer first)
 * - qualityRejected: same level again (variant factory will create different variant at same level)
 *
 * @param {string} currentLevel
 * @param {string} reason
 * @returns {string} - Next level to try, or current level
 */
export function escalateVariantLevel(currentLevel, reason = "currentVariantsDoNotFit") {
  const levelOrder = ["timeTitle", "micro", "short", "medium", "long"];
  const currentIndex = levelOrder.indexOf(currentLevel);

  if (currentIndex === -1) {
    throw new Error(`Unknown variant level: ${currentLevel}`);
  }

  // Escalation logic
  if (reason === "needMoreText" && currentIndex < levelOrder.length - 1) {
    return levelOrder[currentIndex + 1];
  }
  if (reason === "needLessText" && currentIndex > 0) {
    return levelOrder[currentIndex - 1];
  }
  if (reason === "currentVariantsDoNotFit") {
    // Try next size up first, then down
    if (currentIndex < levelOrder.length - 1) {
      return levelOrder[currentIndex + 1];
    } else if (currentIndex > 0) {
      return levelOrder[currentIndex - 1];
    }
  }

  // qualityRejected or already at extreme: stay at current level
  return currentLevel;
}

/**
 * Architecture test: Ensures no variant data leaks into RewriteRequest.
 *
 * @param {OriginalProgramme} programme
 * @returns {boolean}
 */
export function isSourcePureProgramme(programme) {
  if (!programme) return false;
  // Source-pure programmes have sourceHash, not variantId
  return !!programme.sourceHash && !programme.variantId;
}
