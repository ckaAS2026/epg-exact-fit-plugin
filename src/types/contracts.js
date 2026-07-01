export const ActionTypes = Object.freeze({
  LOAD_CHANNELS: "LOAD_CHANNELS",
  FILL_SLOTS: "FILL_SLOTS",
  START_CORRECTION: "START_CORRECTION"
});

export const SettingNames = Object.freeze({
  API_KEY: "apiKey",
  TABLE_LABEL: "tableLabel"
});

export const SlotSections = Object.freeze({
  DAY: "day",
  PRIME: "prime",
  NIGHT: "night",
  COMPACT: "compact"
});

export const ProgrammeVariantLevels = Object.freeze({
  TIME_TITLE: "timeTitle",
  MICRO: "micro",
  SHORT: "short",
  MEDIUM: "medium",
  LONG: "long"
});

export const ProgrammeSemanticTypes = Object.freeze({
  RECURRENT: "recurrent",
  EDITORIAL: "editorial",
  HIGHLIGHT: "highlight"
});

export const ProgrammeClasses = ProgrammeSemanticTypes;

export const ProgrammePriorities = Object.freeze({
  LOWEST: 1,
  LOW: 2,
  NORMAL: 3,
  HIGH: 4,
  HIGHEST: 5
});

export const RewriteReasons = Object.freeze({
  NEED_MORE_TEXT: "needMoreText",
  NEED_LESS_TEXT: "needLessText",
  CURRENT_VARIANTS_DO_NOT_FIT: "currentVariantsDoNotFit",
  QUALITY_REJECTED: "qualityRejected"
});

/**
 * Original programme contract.
 *
 * This is the source-pure programme model used by slot planning, programme
 * classification, variant generation, rewrite requests, and QA traceability.
 * These fields represent original source material plus technical source
 * identity. The original fields must not be overwritten by generated text.
 *
 * @typedef {Object} OriginalProgramme
 * @property {string} programmeId Stable programme identifier.
 * @property {string} channelId Canonical channel identifier.
 * @property {string} slotId Target slot id assigned by slot-planner.
 * @property {string} startTime Normalized start time, e.g. "20.15".
 * @property {string} [endTime] Optional normalized end time.
 * @property {string} originalTitle Original title from source data.
 * @property {string} [originalSubtitle] Optional original subtitle.
 * @property {string} [originalDescription] Optional original description.
 * @property {string} [genre] Optional original genre.
 * @property {string} [category] Optional original category.
 * @property {number} [durationMin] Optional duration in minutes.
 * @property {string} sourceHash Hash over original source fields.
 * @property {string} sourceFingerprint Human-readable source identity,
 * e.g. channelId + time + title.
 */

/**
 * Programme class contract.
 *
 * @typedef {"recurrent"|"editorial"|"highlight"} ProgrammeClass
 */

/**
 * Programme priority contract.
 *
 * @typedef {1|2|3|4|5} ProgrammePriority
 */

/**
 * Variant level contract.
 *
 * @typedef {"timeTitle"|"micro"|"short"|"medium"|"long"} VariantLevel
 */

/**
 * Slot profile contract.
 *
 * Slot profiles are the explicit agreement between layout, editorial policy,
 * and solver behavior. They must stay separate from solver implementation.
 *
 * @typedef {Object} SlotProfile
 * @property {string} slotId Stable slot id, e.g. "top.ard.primeMain".
 * @property {number} exactLineCount Exact target line count.
 * @property {number} targetHeightPt Target height in points.
 * @property {string} paragraphStyleName Paragraph style name.
 * @property {string} timeCharacterStyleName Time character style name.
 * @property {string} titleCharacterStyleName Title character style name.
 * @property {string} bodyCharacterStyleName Body character style name.
 * @property {VariantLevel} recurrentDefaultLevel Default variant level for recurrent programmes.
 * @property {VariantLevel} editorialDefaultLevel Default variant level for editorial programmes.
 * @property {VariantLevel} highlightDefaultLevel Default variant level for highlight programmes.
 * @property {boolean} allowDescriptionsForRecurrentOnlyWhenSpaceLeft Whether recurrent descriptions are only allowed as remaining-space expansion.
 * @property {boolean} requireChronologicalOrder Whether chronological order is required.
 * @property {boolean} mustIncludeAllProgrammes Whether every programme assigned to this slot must be represented.
 */

/**
 * Probe measure contract.
 *
 * @typedef {Object} ProbeMeasure
 * @property {boolean} overset Whether InDesign reports overset.
 * @property {number} composedLineCount Composed line count in the real/probe context.
 * @property {number} usedHeightPt Used height in points.
 * @property {number} targetLineCount Target line count from SlotProfile.
 * @property {number} targetHeightPt Target height in points from SlotProfile.
 * @property {boolean} exactLineMatch Whether composedLineCount matches targetLineCount exactly.
 * @property {boolean} exactHeightMatch Whether usedHeightPt matches targetHeightPt exactly.
 * @property {number} [lastLineBaselinePt] Optional baseline position of last composed line.
 * @property {number} [bottomGapPt] Optional measured bottom gap.
 */

/**
 * Programme variant contract.
 *
 * A ProgrammeVariant is a source-pure candidate for slot solving. It references
 * OriginalProgramme identity and source hashes. It must not be generated from
 * another ProgrammeVariant or from final slot text.
 *
 * @typedef {Object} ProgrammeVariant
 * @property {string} variantId Stable variant identifier.
 * @property {string} programmeId Source programme id.
 * @property {string} slotId Target slot id.
 * @property {VariantLevel} level Variant level.
 * @property {string} text Candidate text.
 * @property {ProgrammeClass} programmeClass Programme class.
 * @property {ProgrammePriority} priority Programme priority.
 * @property {string} basedOnSourceHash Source hash of original programme.
 * @property {string} basedOnSourceFingerprint Source fingerprint of original programme.
 * @property {true} basedOnOriginalOnly Must always be true.
 * @property {boolean} isCompletePhrase Whether text is a complete phrase.
 * @property {boolean} hasNoTruncation Whether text has no truncation.
 * @property {boolean} hasNoHallucinationRisk Whether text has no hallucination risk.
 * @property {number} qualityScore Quality score for solver tie-breaking.
 * @property {ProbeMeasure} [measuredInIsolation] Optional isolated measurement cache.
 */

/**
 * Slot candidate state contract.
 *
 * @typedef {Object} SlotCandidateState
 * @property {string} slotId Target slot id.
 * @property {string[]} orderedProgrammeIds Programme order for composition.
 * @property {Record<string, ProgrammeVariant>} chosenVariantByProgrammeId Chosen variant per programme id.
 * @property {string} concatenatedText Full slot text candidate.
 * @property {ProbeMeasure} [measure] Optional measured slot candidate.
 * @property {boolean} exactFit Whether candidate is an exact fit.
 * @property {number} score Candidate score.
 * @property {string[]} missingProgrammes Programmes not represented in this state.
 * @property {number} rewriteGeneration Rewrite generation count.
 */

/**
 * Rewrite request contract.
 *
 * Rewrite requests are allowed only from original source data.
 *
 * @typedef {Object} RewriteRequest
 * @property {string} slotId Target slot id.
 * @property {string} programmeId Source programme id.
 * @property {VariantLevel} requestedLevel Requested variant level.
 * @property {"needMoreText"|"needLessText"|"currentVariantsDoNotFit"|"qualityRejected"} reason Rewrite reason.
 * @property {string} originalSourceHash Source hash of original programme.
 * @property {string} originalTitle Original title.
 * @property {string} [originalSubtitle] Optional original subtitle.
 * @property {string} [originalDescription] Optional original description.
 * @property {ProgrammeClass} programmeClass Programme class.
 * @property {ProgrammePriority} priority Programme priority.
 */

/**
 * Slot solution contract.
 *
 * @typedef {Object} SlotSolution
 * @property {string} slotId Solved slot id.
 * @property {string} finalText Final validated text.
 * @property {ProbeMeasure} finalMeasure Final InDesign probe measure.
 * @property {true} exactFit Must be true for a SlotSolution.
 * @property {ProgrammeVariant[]} usedVariants Variants used in final text.
 * @property {number} rewriteCount Number of rewrite generations used.
 * @property {Object} qa QA invariants.
 * @property {true} qa.noOverset Must be true.
 * @property {true} qa.noUnderfill Must be true.
 * @property {boolean} qa.allProgrammesIncluded Whether all assigned programmes are included.
 * @property {true} qa.allTextsSourcePure Must be true.
 */
