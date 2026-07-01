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

const getLabel = (item) => String(
  item && (
    item.label ||
    item.name ||
    item.scriptLabel ||
    item.extractLabel && item.extractLabel("epg.exactFit.label")
  ) || ""
).trim();

const getCellText = (cell) => String(
  cell && (
    cell.contents ||
    cell.texts && cell.texts[0] && cell.texts[0].contents ||
    ""
  ) || ""
);

export function findPageItemByLabel(document, label) {
  const targetLabel = String(label || "").trim();
  if (!document || !targetLabel) {
    return null;
  }

  const pageItems = asArray(document.pageItems);
  return pageItems.find((item) => getLabel(item) === targetLabel) || null;
}

export function resolveTableByLabel({ indesignApp, tableLabel }) {
  const document = indesignApp && indesignApp.activeDocument;
  if (!document) {
    throw new Error("Kein aktives InDesign-Dokument vorhanden.");
  }

  const pageItem = findPageItemByLabel(document, tableLabel);
  if (!pageItem) {
    throw new Error(`Tabelle mit Script Label "${tableLabel}" nicht gefunden.`);
  }

  const directTables = asArray(pageItem.tables);
  if (directTables.length) {
    return directTables[0];
  }

  const storyTables = asArray(pageItem.parentStory && pageItem.parentStory.tables);
  if (storyTables.length) {
    return storyTables[0];
  }

  throw new Error(`Script Label "${tableLabel}" verweist nicht auf eine Tabelle.`);
}

export function findCellByLabel(table, cellLabel) {
  const targetLabel = String(cellLabel || "").trim();
  if (!table || !targetLabel) {
    return null;
  }

  return asArray(table.cells).find((cell) => getLabel(cell) === targetLabel) || null;
}

export function findCellByMarker(table, slotId) {
  const targetMarker = `{{EPG:${String(slotId || "").trim()}}}`;
  if (!table || !slotId) {
    return null;
  }

  return asArray(table.cells).find((cell) => getCellText(cell).includes(targetMarker)) || null;
}

export function resolveCellByLabel({ table, cellLabel }) {
  const cell = findCellByLabel(table, cellLabel);
  if (!cell) {
    throw new Error(`Zelle mit Script Label "${cellLabel}" nicht gefunden.`);
  }
  return cell;
}

export function resolveCellByMarker({ table, slotId }) {
  const cell = findCellByMarker(table, slotId);
  if (!cell) {
    throw new Error(`Zelle mit Marker "{{EPG:${slotId}}}" nicht gefunden.`);
  }
  return cell;
}

export function createTableResolver({ indesignApp } = {}) {
  return {
    resolveTable(tableLabel) {
      return resolveTableByLabel({ indesignApp, tableLabel });
    },

    resolveCell(tableLabel, cellLabel) {
      const table = resolveTableByLabel({ indesignApp, tableLabel });
      return resolveCellByLabel({ table, cellLabel });
    },

    resolveMarkerCell(tableLabel, slotId) {
      const table = resolveTableByLabel({ indesignApp, tableLabel });
      return resolveCellByMarker({ table, slotId });
    }
  };
}
