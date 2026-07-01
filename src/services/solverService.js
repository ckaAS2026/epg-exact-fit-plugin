/**
 * Solver Service
 * Orchestrates the exact-fit solver with real InDesign probe measurements
 */

import { exactFitSolver } from "./exactFitSolver.js";
import { createIndesignService } from "./indesignService.js";
import { slotProfileRegistry } from "../config/slotProfiles.js";

/**
 * Create a solver service that runs the 11-step algorithm with real measurements
 * @param {Object} options - Configuration
 * @returns {Object} Solver service with run methods
 */
export function createSolverService() {
  const indesignService = createIndesignService();

  return {
    /**
     * Solve a single slot with real InDesign probe measurements
     * @param {Object} options - Solve options
     * @param {string} options.slotId - Slot to solve
     * @param {string} options.tableLabel - InDesign table script label
     * @param {Array} options.programmes - OriginalProgramme array for this slot
     * @param {Array} options.allVariants - All available ProgrammeVariant objects
     * @param {Function} options.onProgress - Progress callback
     * @returns {Promise<Object>} SlotSolution with exactFit, usedVariants, measure
     */
    async solveSlot({
      slotId,
      tableLabel,
      programmes,
      allVariants,
      onProgress
    }) {
      if (!slotId || !tableLabel || !programmes || !allVariants) {
        throw new Error("Erforderliche Parameter fehlen: slotId, tableLabel, programmes, allVariants");
      }

      // Get slot profile (must be registered)
      const slotProfile = slotProfileRegistry.getSlotProfile(slotId);
      if (!slotProfile) {
        throw new Error(
          `SlotProfile "${slotId}" nicht registriert. Führen Sie "Inspect Layout" durch.`
        );
      }

      if (onProgress) {
        onProgress({
          phase: "initialization",
          slotId,
          message: `Starte Solver für Slot ${slotId} mit ${programmes.length} Programmen`
        });
      }

      try {
        // Resolve the table
        const table = indesignService.resolveTable(tableLabel);

        // Create a probe composer that uses real InDesign measurement
        const probeComposer = {
          measureCandidate: ({
            candidateText,
            dryRun = false
          }) => {
            return indesignService.measureTextInCell({
              table,
              cellLabel: slotProfile.probeCellLabel,
              candidateText,
              slotProfile
            });
          }
        };

        if (onProgress) {
          onProgress({
            phase: "probe_ready",
            slotId,
            message: `Probe-Composer für ${slotProfile.probeCellLabel} bereit`
          });
        }

        // Run the solver (11-step algorithm)
        const solution = await exactFitSolver.solveSlotWithProbe({
          slotProfile,
          originalProgrammes: programmes,
          allVariants,
          probeComposer,
          onProgress
        });

        if (onProgress) {
          onProgress({
            phase: "solved",
            slotId,
            message: solution.exactFit
              ? `✓ Slot ${slotId} gelöst mit exactFit=true (${solution.usedVariants.length} Varianten)`
              : `✗ Slot ${slotId} konnte nicht exakt gelöst werden`,
            exactFit: solution.exactFit
          });
        }

        return solution;
      } catch (error) {
        if (onProgress) {
          onProgress({
            phase: "error",
            slotId,
            message: `Fehler bei Solver: ${error.message || "Unbekannter Fehler"}`
          });
        }
        throw error;
      }
    },

    /**
     * Solve multiple slots in sequence
     * @param {Object} options - Options
     * @param {Array} options.slotIds - Array of slot IDs to solve
     * @param {string} options.tableLabel - InDesign table script label
     * @param {Object} options.programmesBySlot - Map of slotId → programmes
     * @param {Array} options.allVariants - All available variants
     * @param {Function} options.onProgress - Progress callback
     * @returns {Promise<Object>} Results with solvedSlots and errors
     */
    async solveSlots({
      slotIds,
      tableLabel,
      programmesBySlot,
      allVariants,
      onProgress
    }) {
      const results = {
        solvedSlots: [],
        failedSlots: [],
        totalSlots: slotIds.length,
        exactFitCount: 0,
        errors: []
      };

      for (let i = 0; i < slotIds.length; i++) {
        const slotId = slotIds[i];
        const programmes = programmesBySlot[slotId] || [];

        if (onProgress) {
          onProgress({
            phase: "slot_progress",
            currentSlot: i + 1,
            totalSlots: slotIds.length,
            slotId,
            message: `Löse Slot ${i + 1}/${slotIds.length}: ${slotId}`
          });
        }

        try {
          const solution = await this.solveSlot({
            slotId,
            tableLabel,
            programmes,
            allVariants,
            onProgress: (progress) => {
              if (onProgress) {
                onProgress({
                  ...progress,
                  currentSlot: i + 1,
                  totalSlots: slotIds.length
                });
              }
            }
          });

          results.solvedSlots.push(solution);
          if (solution.exactFit) {
            results.exactFitCount += 1;
          }
        } catch (error) {
          results.failedSlots.push({
            slotId,
            error: error.message || "Unbekannter Fehler"
          });
          results.errors.push(
            `Slot ${slotId}: ${error.message || "Unbekannter Fehler"}`
          );
        }
      }

      if (onProgress) {
        onProgress({
          phase: "complete",
          message: `Solver abgeschlossen: ${results.exactFitCount}/${results.totalSlots} Slots mit exactFit=true`,
          results
        });
      }

      return results;
    },

    /**
     * Validate a slot solution before writing
     * @param {Object} solution - SlotSolution to validate
     * @returns {Object} Validation result with isValid and messages
     */
    validateSolution(solution) {
      const messages = [];
      let isValid = true;

      if (!solution.exactFit) {
        messages.push("Lösung hat exactFit=false (kann nicht geschrieben werden)");
        isValid = false;
      }

      if (!solution.finalMeasure) {
        messages.push("Keine Messwerte vorhanden");
        isValid = false;
      } else {
        if (solution.finalMeasure.overset) {
          messages.push("Text läuft über (overset=true)");
          isValid = false;
        }
        if (!solution.finalMeasure.exactLineMatch) {
          messages.push(
            `Zeilenanzahl stimmt nicht: ${solution.finalMeasure.composedLineCount} vs. ${solution.finalMeasure.targetLineCount} erwartet`
          );
          isValid = false;
        }
      }

      if (!Array.isArray(solution.usedVariants) || solution.usedVariants.length === 0) {
        messages.push("Keine Varianten gewählt");
        isValid = false;
      }

      return { isValid, messages };
    }
  };
}
