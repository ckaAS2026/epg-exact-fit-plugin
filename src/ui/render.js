const getElement = (id) => document.getElementById(id);

const setValue = (id, value) => {
  const element = getElement(id);
  const normalizedValue = String(value || "");

  if (element && element.value !== normalizedValue) {
    element.value = normalizedValue;
  }

  if (element && element.defaultValue !== undefined) {
    element.defaultValue = normalizedValue;
  }

  if (element && element.tagName === "INPUT") {
    element.setAttribute("value", normalizedValue);
  }
};

const setDisabled = (id, isDisabled) => {
  const element = getElement(id);

  if (element) {
    element.disabled = Boolean(isDisabled);
  }
};

const clampProgress = (value) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, numberValue));
};

export function updateStatusBar(state) {
  const statusBar = getElement("statusBar");
  if (!statusBar) {
    return;
  }

  const status = String(state.status || "idle");
  statusBar.className = `status ${status}`;
  statusBar.textContent = state.statusText || "Status: Bereit";
}

export function updateProgressBar(state) {
  const progress = clampProgress(state.progress);
  const progressBar = getElement("progressBar");
  const progressText = getElement("progressText");

  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }

  if (progressText) {
    progressText.textContent = state.progressText || `${progress}%`;
  }
}

export function render(state) {
  if (!state) {
    return;
  }

  setValue("selectedDate", state.selectedDate);
  setValue("dateShortcut", state.dateShortcut);
  setValue("apiKey", state.apiKey);
  setValue("tableLabel", state.tableLabel);
  setDisabled("btnStart", state.isLoading);
  updateStatusBar(state);
  updateProgressBar(state);

  const logOutput = getElement("logOutput");
  if (logOutput) {
    logOutput.value = state.logEntries.join("\n");
    logOutput.scrollTop = logOutput.scrollHeight;
  }
}
