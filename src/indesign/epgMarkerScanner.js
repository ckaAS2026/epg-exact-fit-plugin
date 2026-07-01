const MARKER_PATTERN = /\{\{EPG:([a-zA-Z0-9_.-]+)\}\}/g;
const PROBE_MARKER_PATTERN = /\{\{EPG[_-]PROBE:([a-zA-Z0-9_.-]+)\}\}/g;

const asArray = (collection) => {
  if (!collection) {
    return [];
  }

  if (Array.isArray(collection)) {
    return collection;
  }

  if (collection.everyItem && typeof collection.everyItem === "function") {
    try {
      const everyItem = collection.everyItem();
      if (everyItem && typeof everyItem.getElements === "function") {
        return everyItem.getElements();
      }
    } catch (error) {
      // Fall through to length-based extraction.
    }
  }

  if (typeof collection.length === "number") {
    try {
      return Array.from(collection);
    } catch (error) {
      const items = [];
      for (let index = 0; index < collection.length; index += 1) {
        items.push(collection[index]);
      }
      return items;
    }
  }

  return [];
};

const safeRead = (getter) => {
  try {
    return getter();
  } catch (error) {
    return null;
  }
};

const addUnique = (values, value) => {
  const text = String(value || "").trim();
  if (text && !values.includes(text)) {
    values.push(text);
  }
};

const readExtractLabel = (item, key) => String(safeRead(() => (
  item && item.extractLabel && item.extractLabel(key)
)) || "").trim();

export function readInDesignLabels(item) {
  const extractLabelKeys = [
    "epg.exactFit.label",
    "epg.tableLabel",
    "epg.slotId",
    "epg.targetSlotId",
    "epg.probeSlotId",
    "epg.role"
  ];
  const labels = {
    label: String(safeRead(() => item && item.label) || "").trim(),
    name: String(safeRead(() => item && item.name) || "").trim(),
    scriptLabel: String(safeRead(() => item && item.scriptLabel) || "").trim(),
    extractLabels: {},
    all: []
  };

  extractLabelKeys.forEach((key) => {
    labels.extractLabels[key] = readExtractLabel(item, key);
  });
  addUnique(labels.all, labels.label);
  addUnique(labels.all, labels.name);
  addUnique(labels.all, labels.scriptLabel);
  extractLabelKeys.forEach((key) => addUnique(labels.all, labels.extractLabels[key]));
  return labels;
}

const primaryLabelValues = (labels) => {
  const values = [];
  addUnique(values, labels && labels.label);
  addUnique(values, labels && labels.name);
  addUnique(values, labels && labels.scriptLabel);
  addUnique(values, labels && labels.extractLabels && labels.extractLabels["epg.exactFit.label"]);
  addUnique(values, labels && labels.extractLabels && labels.extractLabels["epg.tableLabel"]);
  return values;
};

export function extractEpgMarkers(text) {
  const source = String(text || "");
  const markers = [];
  let match = MARKER_PATTERN.exec(source);

  while (match) {
    const slotId = match[1];
    const probePrefix = "probe.";
    const probeSuffix = ".probe";
    const isProbeMarker = slotId.startsWith(probePrefix) || slotId.endsWith(probeSuffix);

    markers.push({
      raw: match[0],
      slotId: slotId.startsWith(probePrefix)
        ? slotId.slice(probePrefix.length)
        : slotId.endsWith(probeSuffix)
          ? slotId.slice(0, -probeSuffix.length)
          : slotId,
      markerRole: isProbeMarker ? "probe" : "target"
    });
    match = MARKER_PATTERN.exec(source);
  }

  MARKER_PATTERN.lastIndex = 0;

  match = PROBE_MARKER_PATTERN.exec(source);
  while (match) {
    markers.push({
      raw: match[0],
      slotId: match[1],
      markerRole: "probe"
    });
    match = PROBE_MARKER_PATTERN.exec(source);
  }

  PROBE_MARKER_PATTERN.lastIndex = 0;
  return markers;
}

const readCellText = (cell) => String(
  safeRead(() => cell && (
    cell.contents ||
    cell.texts && cell.texts[0] && cell.texts[0].contents ||
    ""
  )) || ""
);

const readItemLabel = (item) => {
  const labels = readInDesignLabels(item);
  return labels.label || labels.name || labels.scriptLabel || labels.extractLabels["epg.exactFit.label"] || "";
};

export const getTargetLabelCandidates = (slotId) => {
  const normalizedSlotId = String(slotId || "").trim();
  const slugSlotId = normalizedSlotId.replace(/\./g, "-");
  return [
    `epg.target.${normalizedSlotId}`,
    `target.${normalizedSlotId}`,
    normalizedSlotId,
    `epg-target-${slugSlotId}`
  ];
};

export const getProbeLabelCandidates = (slotId) => {
  const normalizedSlotId = String(slotId || "").trim();
  const slugSlotId = normalizedSlotId.replace(/\./g, "-");
  return [
    `epg.probe.${normalizedSlotId}`,
    `${normalizedSlotId}.probe`,
    `probe.${normalizedSlotId}`,
    `epg-probe-${slugSlotId}`,
    `${slugSlotId}.probe`
  ];
};

export const getProbeMarkerCandidates = (slotId) => {
  const normalizedSlotId = String(slotId || "").trim();
  return [
    `{{EPG_PROBE:${normalizedSlotId}}}`,
    `{{EPG-PROBE:${normalizedSlotId}}}`,
    `{{EPG:probe.${normalizedSlotId}}}`,
    `{{EPG:${normalizedSlotId}.probe}}`
  ];
};

export function findTargetCellByLabelsOrMarkers(table, slotId) {
  const candidates = getTargetLabelCandidates(slotId);
  const cells = asArray(safeRead(() => table && table.cells));
  const diagnostics = {
    checkedCells: 0,
    targetLabelCandidates: [...candidates],
    foundLabels: []
  };
  const wantedMarker = `{{EPG:${String(slotId || "").trim()}}}`;
  let markerCell = null;

  for (const cell of cells) {
    const labels = readInDesignLabels(cell);
    diagnostics.checkedCells += 1;
    labels.all.forEach((label) => addUnique(diagnostics.foundLabels, label));

    if (primaryLabelValues(labels).some((label) => candidates.includes(label))) {
      return { cell, method: "target-label", diagnostics };
    }
    if (labels.extractLabels["epg.slotId"] === slotId) {
      return { cell, method: "extractLabel:epg.slotId", diagnostics };
    }
    if (labels.extractLabels["epg.targetSlotId"] === slotId) {
      return { cell, method: "extractLabel:epg.targetSlotId", diagnostics };
    }
    if (!markerCell && readCellText(cell).includes(wantedMarker)) {
      markerCell = cell;
    }
  }

  return {
    cell: markerCell,
    method: markerCell ? "marker" : "",
    diagnostics
  };
}

export function findProbeCellByLabelsOrMarkers(tableOrTables, slotId) {
  const candidates = getProbeLabelCandidates(slotId);
  const wantedMarkers = getProbeMarkerCandidates(slotId);
  const tables = asArray(tableOrTables);
  const diagnostics = {
    checkedTables: 0,
    checkedCells: 0,
    probeLabelCandidates: [...candidates],
    foundLabels: []
  };
  let markerCell = null;

  for (const table of tables) {
    const cells = asArray(safeRead(() => table && table.cells));
    diagnostics.checkedTables += 1;
    for (const cell of cells) {
      const labels = readInDesignLabels(cell);
      const text = readCellText(cell);
      diagnostics.checkedCells += 1;
      labels.all.forEach((label) => addUnique(diagnostics.foundLabels, label));

      if (primaryLabelValues(labels).some((label) => candidates.includes(label))) {
        return { cell, method: "probe-label", diagnostics };
      }
      if (labels.extractLabels["epg.probeSlotId"] === slotId) {
        return { cell, method: "extractLabel:epg.probeSlotId", diagnostics };
      }
      if (labels.extractLabels["epg.slotId"] === slotId && labels.extractLabels["epg.role"] === "probe") {
        return { cell, method: "extractLabel:epg.slotId+epg.role", diagnostics };
      }
      if (!markerCell && wantedMarkers.some((marker) => text.includes(marker))) {
        markerCell = cell;
      }
    }
  }

  return {
    cell: markerCell,
    method: markerCell ? "probe-marker" : "",
    diagnostics
  };
}

export function scanTableForEpgMarkers(table) {
  const cells = asArray(safeRead(() => table && table.cells));
  const slots = [];

  cells.forEach((cell, index) => {
    const text = readCellText(cell);
    extractEpgMarkers(text).forEach((marker) => {
      slots.push({
        ...marker,
        cell,
        cellIndex: index,
        text,
        source: marker.markerRole === "probe" ? "probe-marker" : "marker"
      });
    });
  });

  return slots;
}

const slotIdFromTargetLabelValue = (value) => {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  let match = text.match(/^epg\.target\.([a-zA-Z0-9_.-]+)$/);
  if (match) {
    return match[1];
  }
  match = text.match(/^target\.([a-zA-Z0-9_.-]+)$/);
  if (match) {
    return match[1];
  }
  match = text.match(/^epg-target-([a-zA-Z0-9-]+)$/);
  if (match) {
    return match[1].replace(/-/g, ".");
  }
  if (/^[a-zA-Z0-9]+(?:\.[a-zA-Z0-9_-]+){2,}$/.test(text)) {
    return text;
  }
  return "";
};

export function scanTableForEpgSlotLabels(table) {
  const cells = asArray(safeRead(() => table && table.cells));
  const slots = [];

  cells.forEach((cell, index) => {
    const labels = readInDesignLabels(cell);
    const text = readCellText(cell);
    let slotId = labels.extractLabels["epg.targetSlotId"] || "";
    let source = slotId ? "extractLabel:epg.targetSlotId" : "";

    if (!slotId && labels.extractLabels["epg.slotId"]) {
      slotId = labels.extractLabels["epg.slotId"];
      source = "extractLabel:epg.slotId";
    }
    if (!slotId) {
      primaryLabelValues(labels).some((label) => {
        const parsedSlotId = slotIdFromTargetLabelValue(label);
        if (parsedSlotId) {
          slotId = parsedSlotId;
          source = "label";
          return true;
        }
        return false;
      });
    }
    if (slotId) {
      slots.push({
        raw: "",
        slotId,
        cell,
        cellIndex: index,
        text,
        source: source || "label",
        targetCell: cell
      });
    }
  });

  return slots;
}

const dedupeSlots = (slots) => {
  const seen = new Set();
  return slots.filter((slot) => {
    const key = `${slot && slot.slotId || ""}::${slot && slot.cellIndex || 0}`;
    if (!slot || !slot.slotId || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const getLayoutTableLabelCandidates = (preferredTableLabel) => {
  const labels = [];
  addUnique(labels, preferredTableLabel || "epg-target-table");
  addUnique(labels, "epg-target-table");
  addUnique(labels, "epg-probe-table");
  return labels;
};

const hasCells = (item) => Boolean(safeRead(() => item && item.cells));

const collectTablesFromItem = (item, collectTable) => {
  if (!item) {
    return;
  }

  if (hasCells(item)) {
    collectTable(item);
  }

  asArray(safeRead(() => item.tables)).forEach(collectTable);
  asArray(safeRead(() => item.parentStory && item.parentStory.tables)).forEach(collectTable);
  asArray(safeRead(() => item.texts && item.texts[0] && item.texts[0].parentStory && item.texts[0].parentStory.tables)).forEach(collectTable);
};

export function findTablesWithEpgMarkers(document, app, options = {}) {
  const stories = asArray(safeRead(() => document && document.stories));
  const tables = [];
  const allTables = [];
  const seenTables = [];
  const seenItems = [];
  const tableLabel = String(options.tableLabel || "").trim();
  const tableLabels = getLayoutTableLabelCandidates(tableLabel);
  const diagnostics = {
    labelledItemsFound: false,
    labelledTableLabels: [...tableLabels],
    labelledItemsFoundButNoSlots: false
  };

  const collectTable = (table) => {
    if (!table || seenTables.includes(table)) {
      return;
    }

    seenTables.push(table);
    allTables.push(table);
    const slots = dedupeSlots([
      ...scanTableForEpgMarkers(table).filter((slot) => slot.markerRole !== "probe"),
      ...scanTableForEpgSlotLabels(table)
    ]);
    if (slots.length) {
      tables.push({
        table,
        slots
      });
    }
  };

  const collectTablesFromItemSafe = (item) => {
    if (!item || seenItems.includes(item)) {
      return;
    }

    seenItems.push(item);
    collectTablesFromItem(item, collectTable);
    asArray(safeRead(() => item.allTables)).forEach(collectTable);
    asArray(safeRead(() => item.parent && item.parent.tables)).forEach(collectTable);
    asArray(safeRead(() => item.parentStory && item.parentStory.allTables)).forEach(collectTable);
    asArray(safeRead(() => item.texts && item.texts[0] && item.texts[0].parentTextFrames)).forEach(collectTablesFromItemSafe);
    asArray(safeRead(() => item.textContainers)).forEach(collectTablesFromItemSafe);
  };

  const collectLabelledItems = (items) => asArray(items).filter((item) => {
    const itemLabels = readInDesignLabels(item).all;
    return item && tableLabels.some((label) => itemLabels.includes(label));
  });

  if (tableLabels.length) {
    const labelledItemCountBefore = seenItems.length;
    [
      ...collectLabelledItems(safeRead(() => document && document.pageItems)),
      ...collectLabelledItems(safeRead(() => document && document.allPageItems)),
      ...collectLabelledItems(safeRead(() => app && app.selection))
    ].forEach(collectTablesFromItemSafe);

    diagnostics.labelledItemsFound = seenItems.length > labelledItemCountBefore;
    if (diagnostics.labelledItemsFound && tables.length > 0) {
      tables.diagnostics = diagnostics;
      tables.allTables = [...allTables];
      return tables;
    }
    diagnostics.labelledItemsFoundButNoSlots = diagnostics.labelledItemsFound && tables.length === 0;
  }

  asArray(safeRead(() => document && document.tables)).forEach(collectTable);
  asArray(safeRead(() => document && document.allTables)).forEach(collectTable);

  stories.forEach((story) => {
    asArray(safeRead(() => story.tables)).forEach(collectTable);
    asArray(safeRead(() => story.allTables)).forEach(collectTable);
    collectTablesFromItemSafe(story);
  });

  asArray(safeRead(() => document && document.textFrames)).forEach((textFrame) => {
    collectTablesFromItemSafe(textFrame);
  });

  asArray(safeRead(() => document && document.pageItems)).forEach((pageItem) => {
    collectTablesFromItemSafe(pageItem);
  });

  asArray(safeRead(() => document && document.allPageItems)).forEach((pageItem) => {
    collectTablesFromItemSafe(pageItem);
  });

  asArray(safeRead(() => app && app.selection)).forEach((selectionItem) => {
    collectTablesFromItemSafe(selectionItem);
  });

  tables.diagnostics = diagnostics;
  tables.allTables = [...allTables];
  return tables;
}
