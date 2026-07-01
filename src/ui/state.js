export function createInitialState(overrides = {}) {
  return {
    selectedDate: "",
    dateShortcut: "",
    apiKey: "",
    tableLabel: "",
    logEntries: [],
    channels: [],
    programmes: [],
    originalProgrammes: [],
    programmeVariants: [],
    slotGroups: {},
    channelResults: [],
    isLoading: false,
    progress: 0,
    progressText: "0%",
    status: "idle",
    statusText: "Status: Bereit",
    ...overrides
  };
}
