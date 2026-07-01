import { createSlotProfile, SLOT_PROFILE_STATUS } from "../config/slotProfiles.js";

export function buildSlotProfileFromLayout({
  slotId,
  tableLabel,
  probeCellLabel,
  targetCellLabel,
  inspectedLayout,
  defaults = {}
}) {
  if (!inspectedLayout) {
    throw new Error("SlotProfile Builder benoetigt gemessene Layoutdaten.");
  }

  return createSlotProfile({
    ...defaults,
    slotId,
    sourceTableLabel: tableLabel,
    probeCellLabel,
    targetCellLabel,
    exactLineCount: inspectedLayout.existingLineCount,
    targetHeightPt: inspectedLayout.targetHeightPt,
    paragraphStyleName: inspectedLayout.paragraphStyleName || defaults.paragraphStyleName,
    timeCharacterStyleName: inspectedLayout.timeCharacterStyleName || defaults.timeCharacterStyleName,
    titleCharacterStyleName: inspectedLayout.titleCharacterStyleName || defaults.titleCharacterStyleName,
    bodyCharacterStyleName: inspectedLayout.bodyCharacterStyleName || defaults.bodyCharacterStyleName,
    status: inspectedLayout.existingLineCount > 0 && inspectedLayout.targetHeightPt > 0
      ? SLOT_PROFILE_STATUS.VERIFIED
      : SLOT_PROFILE_STATUS.DRAFT
  });
}

export function createSlotProfileBuilder({ layoutInspector } = {}) {
  return {
    buildFromCell({ slotId, tableLabel, probeCellLabel, targetCellLabel, defaults }) {
      if (!layoutInspector || typeof layoutInspector.inspectSlotCell !== "function") {
        throw new Error("SlotProfile Builder benoetigt einen Layout Inspector.");
      }

      const inspectedLayout = layoutInspector.inspectSlotCell({
        tableLabel,
        cellLabel: targetCellLabel
      });

      return buildSlotProfileFromLayout({
        slotId,
        tableLabel,
        probeCellLabel,
        targetCellLabel,
        inspectedLayout,
        defaults
      });
    }
  };
}
