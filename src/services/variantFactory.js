import { ProgrammeVariantLevels } from "../types/contracts.js";
import { classifyProgramme } from "./programmeClassifier.js";

const cleanText = (value) => String(value || "")
  .replace(/\s+/g, " ")
  .trim();

const firstCompleteSentence = (value) => {
  const text = cleanText(value);
  if (!text) {
    return "";
  }

  const match = text.match(/^(.+?[.!?])(?:\s|$)/);
  return match ? cleanText(match[1]) : "";
};

const createBase = (programme, level, text, classification, qualityScore) => ({
  variantId: `${programme.programmeId}.${level}`,
  programmeId: programme.programmeId,
  slotId: programme.slotId,
  level,
  text,
  programmeClass: classification.programmeClass,
  priority: classification.priority,
  basedOnSourceHash: programme.sourceHash,
  basedOnSourceFingerprint: programme.sourceFingerprint,
  basedOnOriginalOnly: true,
  isCompletePhrase: true,
  hasNoTruncation: true,
  hasNoHallucinationRisk: true,
  qualityScore
});

export function createProgrammeVariants(programme) {
  const classification = classifyProgramme(programme);
  const timeTitle = cleanText(`${programme.startTime} ${programme.originalTitle}`);
  const subtitle = cleanText(programme.originalSubtitle);
  const firstSentence = firstCompleteSentence(programme.originalDescription);

  const variants = [
    createBase(programme, ProgrammeVariantLevels.TIME_TITLE, timeTitle, classification, 60)
  ];

  if (subtitle) {
    variants.push(createBase(
      programme,
      ProgrammeVariantLevels.MICRO,
      cleanText(`${timeTitle}: ${subtitle}`),
      classification,
      72
    ));
  }

  if (firstSentence) {
    variants.push(createBase(
      programme,
      ProgrammeVariantLevels.SHORT,
      cleanText(`${timeTitle}. ${firstSentence}`),
      classification,
      82
    ));
  }

  return variants.filter((variant, index, all) =>
    variant.text &&
    all.findIndex((candidate) => candidate.text === variant.text) === index
  );
}

export function createVariantsForProgrammes(programmes) {
  return (Array.isArray(programmes) ? programmes : []).flatMap(createProgrammeVariants);
}
