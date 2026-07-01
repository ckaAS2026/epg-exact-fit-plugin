import { ProgrammeVariantLevels } from "../types/contracts.js";

export const DEFAULT_STYLE_PROFILE = Object.freeze({
  paragraphStyleName: "EPG Slot",
  timeCharacterStyleName: "EPG Time",
  titleCharacterStyleName: "EPG Title",
  bodyCharacterStyleName: "EPG Body"
});

export const SlotSectionsByTime = Object.freeze({
  DAY: "day",
  PRIME: "prime",
  NIGHT: "night"
});

export const SLOT_PROFILE_STATUS = Object.freeze({
  DRAFT: "draft",
  VERIFIED: "verified"
});

const slotProfiles = new Map();

const requirePositiveNumber = (value, fieldName) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(`SlotProfile.${fieldName} muss eine positive Zahl sein.`);
  }
  return numberValue;
};

const requireText = (value, fieldName) => {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`SlotProfile.${fieldName} fehlt.`);
  }
  return text;
};

export function createSlotProfile(input = {}) {
  const styleProfile = {
    ...DEFAULT_STYLE_PROFILE,
    ...(input.styleProfile || {})
  };

  return Object.freeze({
    slotId: requireText(input.slotId, "slotId"),
    exactLineCount: requirePositiveNumber(input.exactLineCount, "exactLineCount"),
    targetHeightPt: requirePositiveNumber(input.targetHeightPt, "targetHeightPt"),
    paragraphStyleName: requireText(input.paragraphStyleName || styleProfile.paragraphStyleName, "paragraphStyleName"),
    timeCharacterStyleName: requireText(input.timeCharacterStyleName || styleProfile.timeCharacterStyleName, "timeCharacterStyleName"),
    titleCharacterStyleName: requireText(input.titleCharacterStyleName || styleProfile.titleCharacterStyleName, "titleCharacterStyleName"),
    bodyCharacterStyleName: requireText(input.bodyCharacterStyleName || styleProfile.bodyCharacterStyleName, "bodyCharacterStyleName"),
    sourceTableLabel: requireText(input.sourceTableLabel || "epg-target-table", "sourceTableLabel"),
    probeCellLabel: requireText(input.probeCellLabel || `${input.slotId}.probe`, "probeCellLabel"),
    targetCellLabel: requireText(input.targetCellLabel || `${input.slotId}.target`, "targetCellLabel"),
    status: input.status === SLOT_PROFILE_STATUS.VERIFIED ? SLOT_PROFILE_STATUS.VERIFIED : SLOT_PROFILE_STATUS.DRAFT,
    recurrentDefaultLevel: input.recurrentDefaultLevel || ProgrammeVariantLevels.TIME_TITLE,
    editorialDefaultLevel: input.editorialDefaultLevel || ProgrammeVariantLevels.MICRO,
    highlightDefaultLevel: input.highlightDefaultLevel || ProgrammeVariantLevels.SHORT,
    allowDescriptionsForRecurrentOnlyWhenSpaceLeft: Boolean(input.allowDescriptionsForRecurrentOnlyWhenSpaceLeft),
    requireChronologicalOrder: input.requireChronologicalOrder !== false,
    mustIncludeAllProgrammes: input.mustIncludeAllProgrammes !== false
  });
}

export function registerSlotProfile(profileInput) {
  const profile = createSlotProfile(profileInput);
  slotProfiles.set(profile.slotId, profile);
  return profile;
}

export function getSlotProfile(slotId) {
  return slotProfiles.get(String(slotId || "").trim()) || null;
}

export function listSlotProfiles() {
  return Array.from(slotProfiles.values());
}

export function clearSlotProfiles() {
  slotProfiles.clear();
}

// Registry object for easier access in services
export const slotProfileRegistry = {
  registerSlotProfile,
  getSlotProfile,
  getAllProfiles: listSlotProfiles,
  clearAll: clearSlotProfiles
};
