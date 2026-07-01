import { DEFAULT_LOG_LIMIT } from "../config/appDefaults.js";
import { timestampForLog } from "../utils/dateUtils.js";

const formatEntry = (message) => `[${timestampForLog(new Date())}] ${message}`;

export function createLogService() {
  let entries = [];

  return {
    append(message) {
      const normalizedMessage = String(message || "").trim();

      if (!normalizedMessage) {
        return entries;
      }

      entries = [...entries, formatEntry(normalizedMessage)].slice(-DEFAULT_LOG_LIMIT);
      return entries;
    },

    clear() {
      entries = [];
      return entries;
    },

    getAll() {
      return [...entries];
    }
  };
}
