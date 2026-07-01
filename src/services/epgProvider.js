import {
  expandChannelIdCandidates,
  getChannelAliases,
  matchProgrammesByChannel
} from "../utils/channelMatcher.js";
import { formatDateForInput } from "../utils/dateUtils.js";

const asArray = (value) => Array.isArray(value) ? value : (value ? [value] : []);

const extractText = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  if (["string", "number", "boolean"].includes(typeof value)) {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractText(item);
      if (text) {
        return text;
      }
    }
    return "";
  }

  if (typeof value === "object") {
    for (const key of ["label", "name", "title", "displayName", "channel", "channelName", "value", "text", "id"]) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const text = extractText(value[key]);
        if (text) {
          return text;
        }
      }
    }
  }

  return "";
};

const unwrapToolResult = (result) => {
  if (!result) {
    return [];
  }

  if (result.structuredContent) {
    return unwrapToolResult(result.structuredContent);
  }

  for (const key of ["programmes", "items", "results", "data", "channels"]) {
    if (Array.isArray(result[key])) {
      return result[key];
    }
  }

  if (Array.isArray(result.content)) {
    return result.content.flatMap((contentItem) => {
      if (contentItem && contentItem.type === "text" && typeof contentItem.text === "string") {
        try {
          return unwrapToolResult(JSON.parse(contentItem.text));
        } catch (error) {
          return contentItem.text ? [contentItem.text] : [];
        }
      }

      return unwrapToolResult(contentItem);
    });
  }

  if (Array.isArray(result)) {
    return result;
  }

  return [];
};

const pad = (value) => String(value).padStart(2, "0");

const normalizeDateValue = (value) => {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const ymd = text.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  }

  const dmy = text.match(/^(\d{2})[./](\d{2})[./](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  }

  const compact = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : formatDateForInput(parsed);
};

const normalizeTimeValue = (value) => {
  const text = String(value || "").trim();
  const compactDateTime = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (compactDateTime) {
    return `${compactDateTime[4]}.${compactDateTime[5]}`;
  }

  const normal = text.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?/);
  if (normal) {
    return `${pad(normal[1])}.${normal[2]}`;
  }

  const compact = text.match(/(?:^|[ T])(\d{2})(\d{2})(\d{2})(?:\s|$)/);
  if (compact) {
    return `${compact[1]}.${compact[2]}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : `${pad(parsed.getHours())}.${pad(parsed.getMinutes())}`;
};

const normalizeProgramme = (item, fallbackChannel, fallbackDate) => {
  const raw = typeof item === "object" && item ? item : { title: String(item || "") };
  const rawStart = raw.startTime || raw.start || raw.begin || raw.startDateTime || raw.start_date_time || raw.datetime || "";
  const rawDate = raw.date || raw.startDate || raw.day || rawStart || fallbackDate;
  const channel = extractText(raw.channel) ||
    extractText(raw.channelName) ||
    extractText(raw.station) ||
    extractText(raw.stationName) ||
    extractText(raw.sender) ||
    extractText(raw.broadcaster) ||
    extractText(raw.network) ||
    fallbackChannel ||
    "";

  return {
    id: String(raw.id || raw.programmeId || `${raw.title || raw.name || "programme"}-${rawStart || Math.random()}`),
    channel,
    date: normalizeDateValue(rawDate) || fallbackDate || "",
    day: normalizeDateValue(rawDate) || fallbackDate || "",
    startTime: normalizeTimeValue(rawStart || raw.time),
    time: normalizeTimeValue(rawStart || raw.time),
    endTime: raw.endTime || raw.end || "",
    title: raw.title || raw.name || raw.programmeTitle || raw.program_title || "Ohne Titel",
    subtitle: raw.subtitle || raw.episodeTitle || "",
    description: raw.description || raw.desc || raw.summary || raw.text || "",
    genre: raw.genre || raw.category || "",
    raw
  };
};

const sortProgrammes = (programmes) => programmes.slice().sort((left, right) => {
  const leftDate = String(left.day || left.date || "");
  const rightDate = String(right.day || right.date || "");
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate, "de");
  }

  const leftChannel = String(left.channel || "");
  const rightChannel = String(right.channel || "");
  if (leftChannel !== rightChannel) {
    return leftChannel.localeCompare(rightChannel, "de");
  }

  return String(left.time || left.startTime || "").localeCompare(String(right.time || right.startTime || ""), "de");
});

const getToolsArray = (toolsResult) => {
  const tools = toolsResult && toolsResult.tools || toolsResult || [];
  return Array.isArray(tools) ? tools : [];
};

const findSearchProgrammesTool = (tools) => tools.find((tool) => tool && tool.name === "search_programmes");

const findScheduleTool = (tools) => tools.find((tool) => tool && tool.name === "get_programme") ||
  tools.find((tool) => tool && tool.name === "get_programmes") ||
  tools.find((tool) => tool && tool.name === "list_programmes");

const getToolPropertyNames = (tool) => Object.keys(tool && tool.inputSchema && tool.inputSchema.properties || {});

const supportsDirectChannelSearch = (tool) => {
  const properties = getToolPropertyNames(tool).map((property) => property.toLowerCase());
  return properties.some((property) => ["channel", "channelname", "channelid", "sender", "station"].includes(property)) &&
    properties.some((property) => ["date", "day", "startdate", "broadcastdate"].includes(property));
};

const createArgsForChannel = ({ date, channel, country, limit }) => {
  const candidates = expandChannelIdCandidates(channel);
  const aliases = getChannelAliases(channel);
  const preferred = [
    ...candidates,
    channel && channel.label,
    ...aliases
  ].filter(Boolean);

  return preferred.slice(0, 6).map((channelName) => ({
    country,
    date,
    channel: channelName,
    limit
  }));
};

export function createEpgProvider(client) {
  let cachedTools = null;

  return {
    async fetchProgrammes({ date, channels, country = "DE", onProgress }) {
      const requestedDate = normalizeDateValue(date);
      const requestedCountry = String(country || "DE").trim().toUpperCase();
      const channelTargets = asArray(channels);

      if (!requestedDate) {
        throw new Error("Datum fehlt oder ist ungueltig.");
      }

      if (!channelTargets.length) {
        throw new Error("Keine Sender zum Abruf konfiguriert.");
      }

      onProgress && onProgress({ message: "MCP Initialisierung..." });
      await client.initialize();

      onProgress && onProgress({ message: "MCP Tools laden..." });
      const toolsResult = await client.listTools();
      cachedTools = getToolsArray(toolsResult);

      const searchTool = findSearchProgrammesTool(cachedTools);
      if (!searchTool) {
        const available = cachedTools.map((tool) => tool && tool.name).filter(Boolean).join(", ");
        throw new Error(`Tool search_programmes nicht gefunden. Verfuegbar: ${available || "keine"}`);
      }

      const scheduleTool = findScheduleTool(cachedTools);
      const canUseSearchDirectly = supportsDirectChannelSearch(searchTool);
      if (!canUseSearchDirectly && !scheduleTool) {
        throw new Error("search_programmes gefunden, aber kein Kanalplan-Tool fuer Senderabruf verfuegbar.");
      }

      onProgress && onProgress({
        message: canUseSearchDirectly
          ? `Tool search_programmes gefunden. ${channelTargets.length} Sender werden geladen...`
          : `Tool search_programmes erkannt; Kanalplaene werden ueber ${scheduleTool.name} geladen.`
      });

      const programmes = [];
      const channelResults = [];

      for (const channel of channelTargets) {
        const label = channel && channel.label || String(channel || "");
        const aliases = getChannelAliases(channel);
        const argCandidates = canUseSearchDirectly ? createArgsForChannel({
          date: requestedDate,
          channel,
          country: requestedCountry,
          limit: 50
        }) : expandChannelIdCandidates(channel).slice(0, 6).map((channelId) => ({
          country: requestedCountry,
          channelId
        }));

        onProgress && onProgress({ message: `Lade ${label}...` });

        let loadedForChannel = [];
        let lastError = null;
        let usedArgs = null;

        for (const args of argCandidates) {
          try {
            const toolResult = await client.callTool(canUseSearchDirectly ? "search_programmes" : scheduleTool.name, args);
            const normalized = unwrapToolResult(toolResult).map((item) => normalizeProgramme(item, label, requestedDate));
            const matched = matchProgrammesByChannel(normalized, aliases);
            const dated = matched.programmes.filter((programme) => !programme.day || programme.day === requestedDate);
            const fallbackOk = !matched.hasChannelText && normalized.length > 0 && normalized.length <= 180;

            if (dated.length > 0 || fallbackOk) {
              loadedForChannel = dated.length > 0 ? dated : normalized;
              usedArgs = args;
              break;
            }

            lastError = new Error(`Keine Treffer fuer ${args.channel}`);
          } catch (error) {
            lastError = error;
          }
        }

        if (loadedForChannel.length) {
          const labelled = sortProgrammes(loadedForChannel).map((programme) => ({
            ...programme,
            channel: label,
            requestedChannelLabel: label
          }));

          programmes.push(...labelled);
          channelResults.push({
            label,
            ok: true,
            count: labelled.length,
            channelUsed: usedArgs && (usedArgs.channelId || usedArgs.channel) || label
          });
          onProgress && onProgress({ message: `${label}: ${labelled.length} Sendungen geladen.` });
        } else {
          channelResults.push({
            label,
            ok: false,
            count: 0,
            error: lastError && lastError.message || "Keine Programme gefunden."
          });
          onProgress && onProgress({ message: `${label}: keine Sendungen gefunden.` });
        }
      }

      return {
        programmes: sortProgrammes(programmes),
        channels: channelResults,
        debug: {
          requestedDate,
          requestedCountry,
          toolCount: cachedTools.length
        }
      };
    }
  };
}
