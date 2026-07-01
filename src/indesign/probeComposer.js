import { createTableResolver } from "./tableResolver.js";

const readTextFrameOverset = (cell) => {
  const parentTextFrames = cell && cell.texts && cell.texts[0] && cell.texts[0].parentTextFrames;
  if (!parentTextFrames || !parentTextFrames.length) {
    return false;
  }

  return Array.from(parentTextFrames).some((frame) => Boolean(frame && frame.overflows));
};

const measureCellText = ({ cell, slotProfile }) => {
  const lines = cell && cell.texts && cell.texts[0] && cell.texts[0].lines;
  const composedLineCount = lines && typeof lines.length === "number" ? lines.length : 0;
  const targetLineCount = slotProfile.exactLineCount;
  const targetHeightPt = slotProfile.targetHeightPt;
  const usedHeightPt = composedLineCount > 0 ? targetHeightPt * (composedLineCount / targetLineCount) : 0;
  const overset = readTextFrameOverset(cell);

  return {
    overset,
    composedLineCount,
    usedHeightPt,
    targetLineCount,
    targetHeightPt,
    exactLineMatch: !overset && composedLineCount === targetLineCount,
    exactHeightMatch: !overset && Math.abs(usedHeightPt - targetHeightPt) < 0.01
  };
};

const resolveProbeCell = ({ indesignApp, slotProfile }) => {
  const resolver = createTableResolver({ indesignApp });
  return resolver.resolveCell(slotProfile.sourceTableLabel, slotProfile.probeCellLabel);
};

export function createProbeComposer({ indesignApp, resolveCell = resolveProbeCell } = {}) {
  return {
    isAvailable() {
      return Boolean(indesignApp);
    },

    async measureCandidate({ slotProfile, candidateText, dryRun = false }) {
      if (!slotProfile) {
        throw new Error("InDesign Probe benoetigt ein SlotProfile.");
      }

      if (!candidateText) {
        throw new Error("InDesign Probe benoetigt Kandidatentext.");
      }

      if (!indesignApp) {
        throw new Error("InDesign Probe ist vorbereitet, aber noch nicht mit der InDesign Runtime verbunden.");
      }

      if (dryRun) {
        throw new Error("DryRun liefert keine InDesign-Messung. Echte Probe erforderlich.");
      }

      const cell = resolveCell({ indesignApp, slotProfile });
      const previousContents = cell.contents;

      try {
        cell.contents = candidateText;
        return measureCellText({ cell, slotProfile });
      } finally {
        cell.contents = previousContents;
      }
    }
  };
}
