const getElement = (id) => document.getElementById(id);

const onInput = (id, handler) => {
  const element = getElement(id);

  if (element) {
    element.addEventListener("input", (event) => handler(event.target.value));
  }
};

const onChange = (id, handler) => {
  const element = getElement(id);

  if (element) {
    element.addEventListener("change", (event) => handler(event.target.value));
  }
};

const onClick = (id, handler) => {
  const element = getElement(id);

  if (element && typeof handler === "function") {
    element.addEventListener("click", handler);
  }
};

export function bindUiEvents(viewModel, handlers = {}) {
  if (!viewModel) {
    return;
  }

  onChange("dateShortcut", viewModel.updateDateShortcut);
  onInput("selectedDate", viewModel.updateSelectedDate);
  onInput("apiKey", viewModel.updateApiKey);
  onInput("tableLabel", viewModel.updateTableLabel);

  onClick("saveSettingsButton", viewModel.saveSettings);
  onClick("btnStart", handlers.handleStart);
  onClick("btnInspectLayout", viewModel.inspectLayout);
  onClick("btnLoad", viewModel.loadChannels);
  onClick("btnFill", viewModel.fillSlots);
  onClick("btnCorrect", viewModel.startCorrection);
  onClick("clearLogButton", viewModel.clearLog);
}
