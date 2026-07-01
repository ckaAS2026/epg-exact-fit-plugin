import { BUILD_LABEL, DEFAULT_CHANNELS, DEFAULT_TABLE_LABEL } from "./config/appDefaults.js";
import { createEpgProvider } from "./services/epgProvider.js";
import { createMcpClient } from "./services/mcpClient.js";
import { createSettingsService } from "./services/settingsService.js";
import { createLogService } from "./services/logService.js";
import { createMcpService } from "./services/mcpService.js";
import { assignProgrammesToSlots, groupProgrammesBySlot } from "./services/slotPlanner.js";
import { classifyProgrammes } from "./services/programmeClassifier.js";
import { createVariantsForProgrammes } from "./services/variantFactory.js";
import { bindUiEvents } from "./ui/bindings.js";
import { render } from "./ui/render.js";
import { createInitialState } from "./ui/state.js";
import { createViewModel } from "./ui/viewModel.js";
import { getTomorrowDate, formatDateForInput } from "./utils/dateUtils.js";
import { delay } from "./utils/delay.js";

const summarizeProgramme = (programme) => {
  const time = programme.time || programme.startTime || "--:--";
  const title = programme.title || "Ohne Titel";
  return `${time} ${title}`;
};

export function initializeApp() {
  const settingsService = createSettingsService();
  const logService = createLogService();
  const mcpService = createMcpService();

  const state = createInitialState({
    selectedDate: formatDateForInput(getTomorrowDate()),
    dateShortcut: "",
    apiKey: settingsService.getApiKey(),
    tableLabel: settingsService.getTableLabel() || DEFAULT_TABLE_LABEL,
    logEntries: logService.getAll(),
    channels: DEFAULT_CHANNELS,
    programmes: [],
    originalProgrammes: [],
    programmeVariants: [],
    slotGroups: {},
    channelResults: []
  });

  const viewModel = createViewModel({
    state,
    settingsService,
    logService,
    mcpService,
    render
  });

  const log = (message) => {
    state.logEntries = logService.append(message);
    render(state);
  };

  const setStatus = (status, text) => {
    viewModel.setStatus(status, text);
  };

  const setProgress = (value, text) => {
    viewModel.setProgress(value, text);
  };

  async function handleStart() {
    if (state.isLoading) {
      log("Start läuft bereits.");
      return;
    }

    state.isLoading = true;
    render(state);

    log("Start-Button gedrückt");
    log("Initialisierung beginnt...");
    setStatus("loading", "Status: Initialisierung läuft...");
    setProgress(5, "MCP wird initialisiert...");
    await delay(50);

    try {
      const client = createMcpClient();
      const provider = createEpgProvider(client);

      log("Starte MCP Initialisierung");
      await client.initialize();

      setProgress(15, "Tools werden geladen...");
      await delay(50);

      log("Lade MCP Tools");
      const tools = await client.listTools();
      const toolList = Array.isArray(tools && tools.tools) ? tools.tools : [];
      log(`MCP Tools geladen: ${toolList.length}`);

      setProgress(30, "Sender werden geladen...");
      await delay(50);

      log("Lade Programme...");
      let completedChannels = 0;
      const totalChannels = Math.max(state.channels.length, 1);

      const result = await provider.fetchProgrammes({
        date: state.selectedDate,
        channels: state.channels,
        onProgress(event) {
          if (event && event.message) {
            log(event.message);
          }

          if (event && event.message && event.message.startsWith("Lade ")) {
            setProgress(
              30 + Math.floor((completedChannels / totalChannels) * 60),
              event.message.replace(/\.+$/, "")
            );
          }

          if (event && event.message && event.message.includes("Sendungen geladen")) {
            completedChannels += 1;
            setProgress(
              30 + Math.floor((completedChannels / totalChannels) * 60),
              `Sender ${completedChannels}/${totalChannels}`
            );
          }

          if (event && event.message && event.message.includes("keine Sendungen gefunden")) {
            completedChannels += 1;
            setProgress(
              30 + Math.floor((completedChannels / totalChannels) * 60),
              `Sender ${completedChannels}/${totalChannels}`
            );
          }
        }
      });

      state.programmes = result.programmes;
      state.channelResults = result.channels;
      state.originalProgrammes = classifyProgrammes(assignProgrammesToSlots(result.programmes));
      state.slotGroups = groupProgrammesBySlot(state.originalProgrammes);
      state.programmeVariants = createVariantsForProgrammes(state.originalProgrammes);

      log(`EPG Daten geladen: ${result.programmes.length} Sendungen.`);
      log(`OriginalProgramme erzeugt: ${state.originalProgrammes.length}.`);
      log(`Slotgruppen vorbereitet: ${Object.keys(state.slotGroups).length}.`);
      log(`Source-pure Varianten erzeugt: ${state.programmeVariants.length}.`);
      result.channels.forEach((channelResult) => {
        const count = channelResult.ok ? channelResult.count : 0;
        const suffix = channelResult.ok ? "" : ` (${channelResult.error || "keine Daten"})`;
        log(`${channelResult.label}: ${count} Sendungen${suffix}`);
      });

      setProgress(95, "Finalisierung...");
      await delay(50);

      log(`Gesamt Programme: ${result.programmes.length}`);
      log("Programmdetails bleiben im Speicher; Hauptlog zeigt ab jetzt Diagnose fuer Layout Binding und Solver.");
      setProgress(100, "Fertig");
      setStatus("success", "Status: Daten erfolgreich geladen");
    } catch (error) {
      log(`FEHLER: ${error.message || String(error)}`);
      setStatus("error", "Status: Fehler beim Laden");
    } finally {
      state.isLoading = false;
      render(state);
    }
  }

  const buildLabel = document.getElementById("buildLabel");
  if (buildLabel) {
    buildLabel.textContent = BUILD_LABEL;
  }

  render(state);
  bindUiEvents(viewModel, { handleStart });
  viewModel.appendLog("Plugin initialisiert.");
}
