import { ProgrammeVariantLevels } from "../types/contracts.js";
import { createProgrammeVariants } from "./variantFactory.js";

const byStartTime = (left, right) =>
  String(left.startTime || "").localeCompare(String(right.startTime || ""), "de");

const chooseVariantLevel = (variants, level) =>
  variants.find((variant) => variant.level === level) || variants[0] || null;

export function createInitialSlotCandidate({ slotId, programmes }) {
  const orderedProgrammes = (Array.isArray(programmes) ? programmes : [])
    .filter((programme) => programme && programme.programmeId)
    .slice()
    .sort(byStartTime);

  const chosenVariantByProgrammeId = {};
  const missingProgrammes = [];

  orderedProgrammes.forEach((programme) => {
    const programmeForSlot = {
      ...programme,
      slotId
    };
    const chosenVariant = chooseVariantLevel(
      createProgrammeVariants(programmeForSlot),
      ProgrammeVariantLevels.TIME_TITLE
    );

    if (chosenVariant && chosenVariant.basedOnOriginalOnly === true) {
      chosenVariantByProgrammeId[programme.programmeId] = chosenVariant;
    } else {
      missingProgrammes.push(programme.programmeId);
    }
  });

  const orderedProgrammeIds = orderedProgrammes.map((programme) => programme.programmeId);
  const concatenatedText = orderedProgrammeIds
    .map((programmeId) => chosenVariantByProgrammeId[programmeId])
    .filter(Boolean)
    .map((variant) => variant.text)
    .join("\n");

  return {
    slotId: String(slotId || ""),
    orderedProgrammeIds,
    chosenVariantByProgrammeId,
    concatenatedText,
    exactFit: false,
    score: Object.values(chosenVariantByProgrammeId).reduce(
      (sum, variant) => sum + Number(variant.qualityScore || 0),
      0
    ),
    missingProgrammes,
    rewriteGeneration: 0
  };
}
