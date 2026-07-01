/**
 * InDesign Service - Bridge between UXP Plugin and InDesign Document
 * Provides access to InDesign app object and measurement tools
 */

let cachedIndesignApp = null;

/**
 * Get InDesign app object via UXP require
 * @returns {Object} InDesign app object with activeDocument
 */
export function getIndesignApp() {
  if (cachedIndesignApp) {
    return cachedIndesignApp;
  }

  try {
    // UXP v5 way: Use require to access InDesign
    const { app } = require("indesign");
    if (app && app.activeDocument) {
      cachedIndesignApp = app;
      return app;
    }
  } catch (error) {
    // Fallback for different UXP configurations
    try {
      // Alternative: Access via global if available
      if (typeof app !== "undefined" && app.activeDocument) {
        cachedIndesignApp = app;
        return app;
      }
    } catch (e) {
      // Silent fail
    }
  }

  throw new Error(
    "InDesign-Anwendung nicht verfuegbar. Stellen Sie sicher, dass das Plugin im InDesign-Panel aktiv ist."
  );
}

/**
 * Clear cached app reference (useful after document changes)
 */
export function clearIndesignAppCache() {
  cachedIndesignApp = null;
}

/**
 * Create a combined InDesign service with table resolver, layout inspector, and probe composer
 * @returns {Object} Service with table, layout, and probe operations
 */
export function createIndesignService() {
  return {
    /**
     * Get active InDesign document
     */
    getDocument() {
      const indesignApp = getIndesignApp();
      if (!indesignApp.activeDocument) {
        throw new Error("Kein aktives InDesign-Dokument vorhanden.");
      }
      return indesignApp.activeDocument;
    },

    /**
     * Resolve table by script label
     * @param {string} tableLabel - Script label of the table
     * @returns {Object} InDesign table object
     */
    resolveTable(tableLabel) {
      const indesignApp = getIndesignApp();
      const document = this.getDocument();

      const asArray = (collection) => {
        if (!collection) return [];
        if (Array.isArray(collection)) return collection;
        if (typeof collection.length === "number") return Array.from(collection);
        return [];
      };

      const getLabel = (item) =>
        String(
          (item &&
            (item.label ||
              item.name ||
              item.scriptLabel ||
              (item.extractLabel && item.extractLabel("epg.exactFit.label")))) ||
            ""
        ).trim();

      const pageItems = asArray(document.pageItems);
      const pageItem = pageItems.find((item) => getLabel(item) === tableLabel);

      if (!pageItem) {
        throw new Error(
          `Tabelle mit Script Label "${tableLabel}" nicht gefunden.`
        );
      }

      const directTables = asArray(pageItem.tables);
      if (directTables.length) {
        return directTables[0];
      }

      const storyTables = asArray(
        pageItem.parentStory && pageItem.parentStory.tables
      );
      if (storyTables.length) {
        return storyTables[0];
      }

      throw new Error(
        `Script Label "${tableLabel}" verweist nicht auf eine Tabelle.`
      );
    },

    /**
     * Resolve cell by label within table
     * @param {Object} table - InDesign table object
     * @param {string} cellLabel - Cell script label
     * @returns {Object} InDesign cell object
     */
    resolveCell(table, cellLabel) {
      const asArray = (collection) => {
        if (!collection) return [];
        if (Array.isArray(collection)) return collection;
        if (typeof collection.length === "number") return Array.from(collection);
        return [];
      };

      const getLabel = (item) =>
        String(
          (item &&
            (item.label ||
              item.name ||
              item.scriptLabel ||
              (item.extractLabel && item.extractLabel("epg.exactFit.label")))) ||
            ""
        ).trim();

      if (!table) {
        throw new Error("Tabelle nicht verfuegbar.");
      }

      const targetLabel = String(cellLabel || "").trim();
      if (!targetLabel) {
        throw new Error("Cell Label erforderlich.");
      }

      const cell = asArray(table.cells).find(
        (c) => getLabel(c) === targetLabel
      );
      if (!cell) {
        throw new Error(
          `Zelle mit Label "${cellLabel}" nicht gefunden in Tabelle.`
        );
      }

      return cell;
    },

    /**
     * Find cell by {{EPG:slotId}} marker
     * @param {Object} table - InDesign table object
     * @param {string} slotId - Slot identifier
     * @returns {Object} InDesign cell object or null
     */
    resolveCellByMarker(table, slotId) {
      const asArray = (collection) => {
        if (!collection) return [];
        if (Array.isArray(collection)) return collection;
        if (typeof collection.length === "number") return Array.from(collection);
        return [];
      };

      const targetMarker = `{{EPG:${String(slotId || "").trim()}}}`;

      if (!table || !slotId) {
        return null;
      }

      return (
        asArray(table.cells).find((cell) => {
          const cellText = String((cell && cell.contents) || "").trim();
          return cellText === targetMarker;
        }) || null
      );
    },

    /**
     * Inspect cell layout (line count, height, styles)
     * @param {Object} table - InDesign table object
     * @param {string} cellLabel - Cell script label
     * @returns {Object} Layout inspection result
     */
    inspectCellLayout(table, cellLabel) {
      const cell = this.resolveCell(table, cellLabel);

      if (!cell) {
        throw new Error(`Cell "${cellLabel}" nicht gefunden.`);
      }

      const textStory = cell.texts && cell.texts[0];
      if (!textStory) {
        return {
          existingLineCount: 0,
          targetHeightPt: cell.height || 0,
          overset: false,
          paragraphStyleName: null,
          bodyCharacterStyleName: null,
          isEmpty: true
        };
      }

      const lines = textStory.lines || [];
      const isOverset =
        (textStory.parentTextFrames &&
          textStory.parentTextFrames.length > 0 &&
          textStory.parentTextFrames[0].overflows) ||
        false;

      const paragraphStyle =
        textStory.paragraphs &&
        textStory.paragraphs.length > 0 &&
        textStory.paragraphs[0].appliedParagraphStyle
          ? String(
              textStory.paragraphs[0].appliedParagraphStyle.name || ""
            ).trim()
          : null;

      const bodyCharStyle =
        textStory.characters &&
        textStory.characters.length > 0 &&
        textStory.characters[0].appliedCharacterStyle
          ? String(
              textStory.characters[0].appliedCharacterStyle.name || ""
            ).trim()
          : null;

      return {
        existingLineCount: lines.length,
        targetHeightPt: cell.height || 0,
        overset: isOverset,
        paragraphStyleName: paragraphStyle,
        bodyCharacterStyleName: bodyCharStyle,
        isEmpty: lines.length === 0
      };
    },

    /**
     * Measure text in a cell (composed lines, overflow status)
     * This is the "truth" measurement for the solver
     * @param {Object} table - InDesign table object
     * @param {string} cellLabel - Cell script label
     * @param {string} candidateText - Text to measure (sets text temporarily)
     * @param {Object} slotProfile - Slot profile with exactLineCount, targetHeightPt
     * @returns {Object} ProbeMeasure with measurement results
     */
    measureTextInCell({
      table,
      cellLabel,
      candidateText,
      slotProfile = {}
    }) {
      const cell = this.resolveCell(table, cellLabel);

      if (!cell) {
        throw new Error(`Cell "${cellLabel}" nicht gefunden zum Messen.`);
      }

      const targetLineCount =
        slotProfile && slotProfile.exactLineCount
          ? Number(slotProfile.exactLineCount)
          : 0;
      const targetHeightPt =
        slotProfile && slotProfile.targetHeightPt
          ? Number(slotProfile.targetHeightPt)
          : 0;

      // Save original contents
      const originalContents = String((cell && cell.contents) || "");

      try {
        // Set candidate text
        cell.contents = String(candidateText || "");

        // Wait for InDesign to compose (short delay)
        // In real usage, might need to use batchPlay or app.doScript for synchronous composition
        const dryRun = true; // For now, treat as dry run

        // Measure composed lines and overflow
        const textStory = cell.texts && cell.texts[0];
        if (!textStory) {
          return {
            overset: false,
            composedLineCount: 0,
            usedHeightPt: 0,
            targetLineCount,
            targetHeightPt,
            exactLineMatch: targetLineCount === 0,
            exactHeightMatch: targetHeightPt === 0,
            dryRun,
            text: candidateText
          };
        }

        const lines = textStory.lines || [];
        const composedLineCount = lines.length;

        const overset =
          (textStory.parentTextFrames &&
            textStory.parentTextFrames.length > 0 &&
            textStory.parentTextFrames[0].overflows) ||
          false;

        // Calculate used height (proportional)
        const usedHeightPt =
          targetLineCount > 0 && targetHeightPt > 0
            ? (composedLineCount * targetHeightPt) / targetLineCount
            : 0;

        const exactLineMatch =
          !overset && composedLineCount === targetLineCount;
        const exactHeightMatch =
          !overset &&
          Math.abs(usedHeightPt - targetHeightPt) < 0.01 &&
          targetHeightPt > 0;

        return {
          overset,
          composedLineCount,
          usedHeightPt,
          targetLineCount,
          targetHeightPt,
          exactLineMatch,
          exactHeightMatch,
          dryRun,
          text: candidateText
        };
      } finally {
        // Restore original contents
        cell.contents = originalContents;
      }
    },

    /**
     * Write text to a cell
     * @param {Object} table - InDesign table object
     * @param {string} cellLabel - Cell script label
     * @param {string} text - Text to write
     */
    writeToCell(table, cellLabel, text) {
      const cell = this.resolveCell(table, cellLabel);
      if (cell) {
        cell.contents = String(text || "");
      }
    },

    /**
     * Read text from a cell
     * @param {Object} table - InDesign table object
     * @param {string} cellLabel - Cell script label
     * @returns {string} Cell contents
     */
    readFromCell(table, cellLabel) {
      const cell = this.resolveCell(table, cellLabel);
      return cell ? String((cell && cell.contents) || "") : "";
    }
  };
}
