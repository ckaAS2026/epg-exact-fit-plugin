const asArray = (collection) => {
  if (!collection) {
    return [];
  }

  if (Array.isArray(collection)) {
    return collection;
  }

  if (typeof collection.length === "number") {
    return Array.from(collection);
  }

  return [];
};

const firstText = (cell) => cell && cell.texts && cell.texts[0] || null;

const readStyleName = (style) => String(style && style.name || "").trim();

const readCellHeightPt = (cell) => {
  const height = Number(cell && (cell.height || cell.visibleBounds && Math.abs(cell.visibleBounds[2] - cell.visibleBounds[0])));
  return Number.isFinite(height) && height > 0 ? height : 0;
};

export function inspectCellLayout(cell) {
  const text = firstText(cell);
  const lines = asArray(text && text.lines);
  const firstLine = lines[0] || null;

  return {
    existingLineCount: lines.length,
    targetHeightPt: readCellHeightPt(cell),
    paragraphStyleName: readStyleName(text && text.appliedParagraphStyle),
    timeCharacterStyleName: readStyleName(firstLine && firstLine.appliedCharacterStyle),
    titleCharacterStyleName: readStyleName(firstLine && firstLine.appliedCharacterStyle),
    bodyCharacterStyleName: readStyleName(text && text.appliedCharacterStyle),
    overset: Boolean(text && text.overflows)
  };
}

export function createLayoutInspector({ tableResolver } = {}) {
  return {
    inspectSlotCell({ tableLabel, cellLabel }) {
      if (!tableResolver || typeof tableResolver.resolveCell !== "function") {
        throw new Error("Layout Inspector benoetigt einen Table Resolver.");
      }

      const cell = tableResolver.resolveCell(tableLabel, cellLabel);
      return inspectCellLayout(cell);
    }
  };
}
