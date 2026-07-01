import { STORAGE_KEYS } from "../config/storageKeys.js";

const readValue = (key) => {
  try {
    return localStorage.getItem(key) || "";
  } catch (error) {
    console.warn(`Could not read setting "${key}".`, error);
    return "";
  }
};

const writeValue = (key, value) => {
  try {
    localStorage.setItem(key, String(value || ""));
  } catch (error) {
    console.warn(`Could not write setting "${key}".`, error);
  }
};

export function createSettingsService() {
  return {
    getApiKey() {
      return readValue(STORAGE_KEYS.API_KEY);
    },

    setApiKey(value) {
      writeValue(STORAGE_KEYS.API_KEY, value);
    },

    getTableLabel() {
      return readValue(STORAGE_KEYS.TABLE_LABEL);
    },

    setTableLabel(value) {
      writeValue(STORAGE_KEYS.TABLE_LABEL, value);
    }
  };
}
