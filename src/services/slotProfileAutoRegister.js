/**
 * Slot Profile Auto-Registration Service
 * Automatically discovers and registers SlotProfiles from InDesign document inspection
 */

import { slotProfileRegistry } from "../config/slotProfiles.js";
import { createIndesignService } from "./indesignService.js";

/**
 * Auto-discover slot profiles from InDesign table
 * Inspects all cells with slot labels (slot1.probe, slot2.probe, etc.)
 * and registers them with measured values
 *
 * @param {string} tableLabel - Script label of the target table
 * @returns {Promise<Array>} Array of registered SlotProfile objects
 */
export async function autoRegisterSlotProfiles(tableLabel) {
  const indesignService = createIndesignService();
  const registeredProfiles = [];
  const errors = [];

  try {
    const table = indesignService.resolveTable(tableLabel);

    // Expected cell label pattern: "slot<N>.probe", "slot<N>.target"
    // We'll scan for all cells matching this pattern

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

    const cells = asArray(table.cells);
    const slotCellMap = new Map(); // slotId → { probe, target, layout }

    // First pass: collect all slot cells
    cells.forEach((cell) => {
      const label = getLabel(cell);
      if (!label) return;

      // Parse label format: "slot<N>.probe" or "slot<N>.target"
      const match = label.match(/^slot(\d+)\.(probe|target)$/);
      if (!match) return;

      const slotNum = match[1];
      const cellType = match[2]; // "probe" or "target"
      const slotId = `slot${slotNum}`;

      if (!slotCellMap.has(slotId)) {
        slotCellMap.set(slotId, { probe: null, target: null, layout: null });
      }

      const slotEntry = slotCellMap.get(slotId);
      if (cellType === "probe") {
        slotEntry.probe = cell;
      } else if (cellType === "target") {
        slotEntry.target = cell;
      }
    });

    // Second pass: inspect and register each slot
    for (const [slotId, entry] of slotCellMap.entries()) {
      if (!entry.probe || !entry.target) {
        errors.push(
          `Slot "${slotId}": Probe- oder Target-Zelle nicht gefunden.`
        );
        continue;
      }

      try {
        // Inspect the target cell to get layout metrics
        const probeLabel = `${slotId}.probe`;
        const targetLabel = `${slotId}.target`;

        const layout = indesignService.inspectCellLayout(table, targetLabel);

        // Build SlotProfile
        const profile = {
          slotId,
          sourceTableLabel: tableLabel,
          probeCellLabel: probeLabel,
          targetCellLabel: targetLabel,
          exactLineCount: layout.existingLineCount || 4, // Default if empty
          targetHeightPt: layout.targetHeightPt || 48, // Default if 0
          paragraphStyleName: layout.paragraphStyleName || "EPG Slot",
          bodyCharacterStyleName: layout.bodyCharacterStyleName || "EPG Body",
          recurrentDefaultLevel: "timeTitle",
          editorialDefaultLevel: "micro",
          highlightDefaultLevel: "short",
          requireChronologicalOrder: true,
          mustIncludeAllProgrammes: true,
          allowDescriptionsForRecurrentOnlyWhenSpaceLeft: false,
          status: "verified"
        };

        // Register the profile
        slotProfileRegistry.registerSlotProfile(profile);
        registeredProfiles.push(profile);
      } catch (error) {
        errors.push(
          `Slot "${slotId}": ${error.message || "Unbekannter Fehler bei Registrierung"}`
        );
      }
    }

    return {
      success: registeredProfiles.length > 0,
      registeredCount: registeredProfiles.length,
      profiles: registeredProfiles,
      errors: errors.length > 0 ? errors : null
    };
  } catch (error) {
    return {
      success: false,
      registeredCount: 0,
      profiles: [],
      errors: [
        `Fehler bei SlotProfile-Registrierung: ${error.message || "Unbekannter Fehler"}`
      ]
    };
  }
}

/**
 * Get currently registered SlotProfiles
 * @returns {Array} List of registered SlotProfile objects
 */
export function getRegisteredSlotProfiles() {
  return slotProfileRegistry.getAllProfiles();
}

/**
 * Clear all registered SlotProfiles (useful for re-inspection)
 */
export function clearRegisteredSlotProfiles() {
  slotProfileRegistry.clearAll();
}

/**
 * Register a single SlotProfile manually
 * @param {Object} profile - SlotProfile object
 * @returns {void}
 */
export function registerManualProfile(profile) {
  slotProfileRegistry.registerSlotProfile(profile);
}
