import { ProgrammeClasses, ProgrammePriorities } from "../types/contracts.js";

const RECURRENT_PATTERNS = [
  /\bnachrichten\b/i,
  /\bwetter\b/i,
  /\bmagazin\b/i,
  /\bjournal\b/i,
  /\btagesschau\b/i,
  /\bheute\b/i,
  /\bfruehstuecksfernsehen\b/i,
  /\bfrühstücksfernsehen\b/i
];

const HIGHLIGHT_PATTERNS = [
  /\bfilm\b/i,
  /\bspielfilm\b/i,
  /\bpremiere\b/i,
  /\blive\b/i,
  /\bshow\b/i,
  /\bevent\b/i,
  /\bchampions league\b/i,
  /\btatort\b/i
];

const textForProgramme = (programme) => [
  programme.originalTitle,
  programme.originalSubtitle,
  programme.originalDescription,
  programme.genre,
  programme.category
].filter(Boolean).join(" ");

export function classifyProgramme(programme) {
  const text = textForProgramme(programme);

  if (RECURRENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      programmeClass: ProgrammeClasses.RECURRENT,
      priority: ProgrammePriorities.LOW
    };
  }

  if (HIGHLIGHT_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      programmeClass: ProgrammeClasses.HIGHLIGHT,
      priority: ProgrammePriorities.HIGH
    };
  }

  return {
    programmeClass: ProgrammeClasses.EDITORIAL,
    priority: ProgrammePriorities.NORMAL
  };
}

export function classifyProgrammes(programmes) {
  return (Array.isArray(programmes) ? programmes : []).map((programme) => ({
    ...programme,
    ...classifyProgramme(programme)
  }));
}
