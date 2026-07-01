/**
 * Variant Level Strategy
 *
 * Determines the order and priority in which variant levels should be tried
 * for a given programme class and slot context.
 *
 * Core principle: Recurrent formats stay short (deterministic), Editorial balanced,
 * Highlight larger (more text allowed).
 *
 * This is NOT about cutting text arbitrarily, but about having discrete,
 * well-defined variant stages that respect the programme type and slot capacity.
 *
 * Architecture Rule: Only discrete variant levels (timeTitle, micro, short, medium, long)
 * are allowed. No approximation, no "kinda fits" — either exact or rewrite.
 */

import { ProgrammeVariantLevels } from "../types/contracts.js";

const VARIANT_LEVEL_ORDER = {
  recurrent: [
    ProgrammeVariantLevels.TIME_TITLE,
    ProgrammeVariantLevels.MICRO,
    ProgrammeVariantLevels.SHORT
  ],
  editorial: [
    ProgrammeVariantLevels.TIME_TITLE,
    ProgrammeVariantLevels.MICRO,
    ProgrammeVariantLevels.SHORT,
    ProgrammeVariantLevels.MEDIUM
  ],
  highlight: [
    ProgrammeVariantLevels.TIME_TITLE,
    ProgrammeVariantLevels.MICRO,
    ProgrammeVariantLevels.SHORT,
    ProgrammeVariantLevels.MEDIUM,
    ProgrammeVariantLevels.LONG
  ]
};

/**
 * Determines the variant level search strategy for a programme.
 *
 * @param {Object} options
 * @param {string} options.programmeClass - 'recurrent', 'editorial', or 'highlight'
 * @param {SlotProfile} options.slotProfile - Slot constraints and defaults
 * @param {string[]} [options.availableLevels] - Which levels actually exist for this programme
 * @returns {string[]} - Ordered array of levels to try (in priority order)
 *
 * @example
 * const strategy = determineVariantLevelOrder({
 *   programmeClass: 'recurrent',
 *   slotProfile: slotProfile,
 *   availableLevels: ['timeTitle', 'micro', 'short', 'medium']
 * });
 * // Returns: ['timeTitle', 'micro', 'short']
 */
export function determineVariantLevelOrder({
  programmeClass,
  slotProfile,
  availableLevels
} = {}) {
  if (!programmeClass || !slotProfile) {
    throw new Error("determineVariantLevelOrder requires programmeClass and slotProfile");
  }

  const baseOrder = VARIANT_LEVEL_ORDER[programmeClass];
  if (!baseOrder) {
    throw new Error(`Unknown programmeClass: ${programmeClass}`);
  }

  // If availableLevels are specified, only return levels that actually exist
  if (Array.isArray(availableLevels) && availableLevels.length > 0) {
    return baseOrder.filter(level => availableLevels.includes(level));
  }

  return baseOrder;
}

/**
 * Gets the default minimum level for a programme class from the slot profile.
 *
 * @param {string} programmeClass - 'recurrent', 'editorial', or 'highlight'
 * @param {SlotProfile} slotProfile
 * @returns {string} - The minimum required variant level for this class in this slot
 *
 * @example
 * const minLevel = getDefaultLevelForClass('editorial', slotProfile);
 * // Returns: 'micro' (or whatever editorialDefaultLevel is set to)
 */
export function getDefaultLevelForClass(programmeClass, slotProfile) {
  if (!programmeClass || !slotProfile) {
    throw new Error("getDefaultLevelForClass requires programmeClass and slotProfile");
  }

  const levelMap = {
    recurrent: slotProfile.recurrentDefaultLevel,
    editorial: slotProfile.editorialDefaultLevel,
    highlight: slotProfile.highlightDefaultLevel
  };

  const defaultLevel = levelMap[programmeClass];
  if (!defaultLevel) {
    throw new Error(`No default level configured for programmeClass: ${programmeClass}`);
  }

  return defaultLevel;
}

/**
 * Builds a complete solving strategy for a slot.
 *
 * Returns a function that, given a programme and its available variants,
 * determines which levels to try and in which order.
 *
 * @param {SlotProfile} slotProfile
 * @returns {Function} - Strategy function
 *
 * @example
 * const strategy = createSlotSolvingStrategy(slotProfile);
 * const order = strategy({ programmeClass: 'recurrent', availableLevels: [...] });
 */
export function createSlotSolvingStrategy(slotProfile) {
  if (!slotProfile) {
    throw new Error("createSlotSolvingStrategy requires a SlotProfile");
  }

  return function strategyFunction({ programmeClass, availableLevels }) {
    return determineVariantLevelOrder({
      programmeClass,
      slotProfile,
      availableLevels
    });
  };
}

/**
 * Test/validation: Checks if a variant level is allowed in this slot for this class.
 *
 * @param {string} level - The variant level to check
 * @param {string} programmeClass
 * @param {SlotProfile} slotProfile
 * @returns {boolean}
 */
export function isLevelAllowedForClass(level, programmeClass, slotProfile) {
  const order = determineVariantLevelOrder({
    programmeClass,
    slotProfile
  });
  return order.includes(level);
}
