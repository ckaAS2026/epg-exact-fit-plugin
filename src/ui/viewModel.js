import { getDateByShortcut, isDateInputValue } from "../utils/dateUtils.js";
import { autoRegisterSlotProfiles } from "../services/slotProfileAutoRegister.js";
import { createSolverService } from "../services/solverService.js";

export function createViewModel({ state, settingsService, logService, mcpService, render }) {
  const commit = () => render(state);
  const solverService = createSolverService();

  const appendLog = (message) => {
    state.logEntries = logService.append(message);
    commit();
  };

  return {
    updateSelectedDate(value) {
      const nextDate = String(value || "");

      if (!isDateInputValue(nextDate)) {
        appendLog("Ungueltiges Datum ignoriert.");
        return;
      }

      state.selectedDate = nextDate;
      state.dateShortcut = "";
      commit();
    },

    updateDateShortcut(value) {
      const shortcut = String(value || "");
      const nextDate = getDateByShortcut(shortcut);

      state.dateShortcut = shortcut;

      if (nextDate) {
        state.selectedDate = nextDate;
        appendLog(`Datum per Schnellauswahl gesetzt: ${nextDate}.`);
        return;
      }

      commit();
    },

    updateApiKey(value) {
      state.apiKey = String(value || "");
      commit();
    },

    updateTableLabel(value) {
      state.tableLabel = String(value || "");
      commit();
    },

    saveSettings() {
      settingsService.setApiKey(state.apiKey);
      settingsService.setTableLabel(state.tableLabel);
      appendLog(`Settings gespeichert. API Key: ${state.apiKey ? "gesetzt" : "leer"}; Script Label: ${state.tableLabel || "<leer>"}`);
    },

    appendLog,

    setStatus(status, text) {
      state.status = String(status || "idle");
      state.statusText = text || "Status: Bereit";
      commit();
    },

    setProgress(value, text) {
      const progress = Math.max(0, Math.min(100, Number(value) || 0));
      state.progress = progress;
      state.progressText = text ? `${progress}% - ${text}` : `${progress}%`;
      commit();
    },

    clearLog() {
      state.logEntries = logService.clear();
      commit();
    },

    loadChannels() {
      const mcpStatus = mcpService.prepareAction("loadChannels");
      appendLog(`Sender laden gestartet fuer ${state.selectedDate}. ${mcpStatus.message}`);
    },

    fillSlots() {
      if (!state.originalProgrammes || state.originalProgrammes.length === 0) {
        appendLog("Fehler: Erst Programme laden (Start-Button).");
        return;
      }

      if (!state.slotGroups || Object.keys(state.slotGroups).length === 0) {
        appendLog("Fehler: Keine Slotgruppen vorhanden.");
        return;
      }

      appendLog(`Tabelle befuellen gestartet fuer "${state.tableLabel}". Solver wird aktiviert...`);

      const slotIds = Object.keys(state.slotGroups);
      const solveOptions = {
        slotIds,
        tableLabel: state.tableLabel,
        programmesBySlot: state.slotGroups,
        allVariants: state.programmeVariants,
        onProgress: (progress) => {
          if (progress.phase === "initialization") {
            appendLog(`[${progress.slotId}] Initialisierung...`);
          } else if (progress.phase === "probe_ready") {
            appendLog(`[${progress.slotId}] Probe-Composer bereit.`);
          } else if (progress.phase === "slot_progress") {
            appendLog(`[${progress.currentSlot}/${progress.totalSlots}] Löse Slot: ${progress.slotId}`);
          } else if (progress.phase === "solved") {
            const status = progress.exactFit ? "✓ GELÖST" : "✗ NICHT GELÖST";
            appendLog(`${status}: ${progress.message}`);
          } else if (progress.phase === "complete") {
            appendLog(`Solver-Durchlauf abgeschlossen: ${progress.results.exactFitCount}/${progress.results.totalSlots} mit exactFit=true`);
            if (progress.results.errors.length > 0) {
              appendLog("Fehler:");
              progress.results.errors.forEach((error) => {
                appendLog(`  • ${error}`);
              });
            }
          } else if (progress.phase === "error") {
            appendLog(`FEHLER [${progress.slotId}]: ${progress.message}`);
          }
        }
      };

      solverService
        .solveSlots(solveOptions)
        .then((results) => {
          state.solverResults = results;
          if (results.exactFitCount > 0) {
            appendLog(
              `Final Writer kann jetzt aktiviert werden. Drücken Sie "Tabelle befuellen" zum Schreiben.`
            );
          } else {
            appendLog(`Keine exactFit-Lösungen. Tabelle wird nicht befüllt.`);
          }
        })
        .catch((error) => {
          appendLog(`Fehler beim Lösen: ${error.message || "Unbekannter Fehler"}`);
        });
    },

    inspectLayout() {
      appendLog(`Layout pruefen angefordert fuer Tabelle "${state.tableLabel}".`);
      autoRegisterSlotProfiles(state.tableLabel)
        .then((result) => {
          if (result.success) {
            appendLog(`✓ ${result.registeredCount} SlotProfile(s) registriert.`);
            result.profiles.forEach((profile) => {
              appendLog(
                `  Slot: ${profile.slotId}, Zeilen: ${profile.exactLineCount}, Height: ${profile.targetHeightPt}pt`
              );
            });
          } else {
            appendLog(`Fehler bei SlotProfile-Registrierung:`);
            if (result.errors) {
              result.errors.forEach((error) => appendLog(`  • ${error}`));
            }
          }
        })
        .catch((error) => {
          appendLog(`Fehler: ${error.message || "Unbekannter Fehler"}`);
        });
    },

    startCorrection() {
      const mcpStatus = mcpService.prepareAction("startCorrection");
      appendLog(`Korrektur starten angefordert. ${mcpStatus.message}`);
    }
  };
}
