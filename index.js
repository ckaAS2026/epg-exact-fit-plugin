(function () {
  "use strict";
  console.log("[EPG] FILE LOADED");
  try {

  var BUILD_LABEL = "Build 0.1.36 - UI Unblock Guard";
  var MCP_ENDPOINT = "https://www.free-epg.de/api/mcp";
  var DEFAULT_PROTOCOLS = ["2025-03-26", "2024-11-05"];
  var REQUEST_TIMEOUT_MS = 15000;
  var LOG_LIMIT = 2000;
  var LOG_STORAGE_KEY = "epgExactFit.logEntries";

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeConsoleError(label, error) {
    try {
      if (typeof console !== "undefined" && console.error) {
        console.error("[EPG Exact Fit] " + label, error);
      }
    } catch (consoleError) {
      // Boot diagnostics must never create a second failure.
    }
  }

  function showFatalBootError(error) {
    try {
      var message = error && error.stack || error && error.message || String(error || "Unbekannter Bootfehler");
      var host = typeof document !== "undefined" && (document.body || document.documentElement);
      if (!host) {
        safeConsoleError("Fatal boot error without document host", error);
        return;
      }
      host.innerHTML =
        '<div style="font-family:sans-serif;padding:12px;color:#111;background:#fff;">' +
        '<h2>EPG Exact Fit - Bootfehler</h2>' +
        '<p>Das Plugin konnte nicht initialisiert werden.</p>' +
        '<pre style="white-space:pre-wrap;border:1px solid #ccc;padding:8px;max-height:420px;overflow:auto;">' +
        escapeHtml(message) +
        '</pre>' +
        '</div>';
    } catch (displayError) {
      safeConsoleError("Fatal boot display failed", displayError);
    }
  }

  var DEFAULT_CHANNELS = [
    {
      id: "Das Erste.de",
      label: "ARD",
      idCandidates: ["Das Erste.de", "Das.Erste.de", "Das Erste", "ard"],
      aliases: ["ARD", "Das Erste", "Das Erste HD", "ARD HD", "ard"]
    },
    {
      id: "ZDF.de",
      label: "ZDF",
      idCandidates: ["ZDF.de", "ZDF", "zdf"],
      aliases: ["ZDF", "ZDF HD", "zdf"]
    },
    {
      id: "SAT.1.de",
      label: "SAT.1",
      idCandidates: ["SAT.1.de", "SAT.1", "Sat.1", "sat1", "SAT1"],
      aliases: ["SAT.1", "Sat.1", "Sat1", "SAT1", "SAT.1 HD"]
    },
    {
      id: "RTL.de",
      label: "RTL",
      idCandidates: ["RTL.de", "RTL", "rtl"],
      aliases: ["RTL", "RTL HD", "rtl"]
    },
    {
      id: "ProSieben.de",
      label: "Pro 7",
      idCandidates: ["ProSieben.de", "ProSieben", "Pro7", "pro7"],
      aliases: ["ProSieben", "Pro7", "Pro 7", "ProSieben HD", "Pro7 HD"]
    },
    {
      id: "VOX.de",
      label: "VOX",
      idCandidates: ["VOX.de", "VOX", "Vox", "vox"],
      aliases: ["VOX", "Vox", "VOX HD"]
    },
    {
      id: "Kabel Eins.de",
      label: "kabel eins",
      idCandidates: ["Kabel Eins.de", "kabel.eins.de", "kabeleins.de", "Kabel Eins", "kabeleins"],
      aliases: ["Kabel Eins", "kabel eins", "KabelEins", "kabeleins", "Kabel Eins HD"]
    },
    {
      id: "TELE 5.de",
      label: "Tele 5",
      idCandidates: ["TELE 5.de", "Tele.5.de", "TELE5.de", "TELE 5", "Tele5", "Tele 5"],
      aliases: ["Tele 5", "Tele5", "TELE 5", "TELE5", "Tele 5 HD"]
    },
    {
      id: "RTLZWEI.de",
      label: "RTLZWEI",
      idCandidates: ["RTLZWEI.de", "RTLZWEI", "RTL Zwei", "RTL2"],
      aliases: ["RTLZWEI", "RTL Zwei", "RTL2", "RTL II", "RTLZWEI HD"]
    },
    {
      id: "SPORT1.de",
      label: "sport1",
      idCandidates: ["SPORT1.de", "SPORT1", "sport1", "Sport1"],
      aliases: ["SPORT1", "sport1", "Sport1"]
    },
    {
      id: "ARTE.de",
      label: "arte",
      idCandidates: ["ARTE.de", "ARTE", "Arte", "arte"],
      aliases: ["ARTE", "Arte", "arte"]
    },
    {
      id: "WELT.de",
      label: "WELT",
      idCandidates: ["WELT.de", "WELT", "Welt", "welt"],
      aliases: ["WELT", "Welt", "WELT HD", "N24"]
    }
  ];

  var state = {
    selectedDate: "",
    dateShortcut: "",
    apiKey: "",
    tableLabel: "",
    logEntries: [],
    channels: DEFAULT_CHANNELS,
    programmes: [],
    originalProgrammes: [],
    programmeVariants: [],
    slotGroups: {},
    channelResults: [],
    isLoading: false,
    isLayoutInspecting: false,
    isFillingTable: false,
    progress: 0,
    progressText: "0%",
    status: "idle",
    statusText: "Status: Bereit",
    layoutSlots: [],
    layoutScan: null,
    slotAssignments: [],
    slotCandidates: [],
    slotSolutions: [],
    solveFailures: [],
    lastLayoutError: "",
    indesignHostBlockedUntil: 0,
    isRendering: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function pad(value) {
    var text = String(value);
    return text.length < 2 ? "0" + text : text;
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function formatDateForInput(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return "";
    }

    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate())
    ].join("-");
  }

  function getTomorrowDate() {
    var date = new Date();
    date.setDate(date.getDate() + 1);
    return date;
  }

  function getDateByShortcut(shortcut) {
    var date = new Date();
    if (shortcut === "tomorrow") {
      date.setDate(date.getDate() + 1);
      return formatDateForInput(date);
    }
    if (shortcut === "today") {
      return formatDateForInput(date);
    }
    return "";
  }

  function timestampForLog(date) {
    return [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join(":");
  }

  function readSetting(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch (error) {
      return "";
    }
  }

  function writeSetting(key, value) {
    try {
      localStorage.setItem(key, String(value || ""));
    } catch (error) {
      log("Setting konnte nicht gespeichert werden: " + key);
    }
  }

  function readPersistedLogEntries() {
    try {
      var raw = localStorage.getItem(LOG_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(-LOG_LIMIT) : [];
    } catch (error) {
      return [];
    }
  }

  function persistLogEntries() {
    try {
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(state.logEntries.slice(-LOG_LIMIT)));
    } catch (error) {
      // Logging must never fail because persistence is unavailable.
    }
  }

  function clampProgress(value) {
    var numberValue = Number(value);
    if (!isFinite(numberValue)) {
      return 0;
    }
    return Math.max(0, Math.min(100, numberValue));
  }

  function render() {
    if (state.isRendering) {
      return;
    }
    state.isRendering = true;
    try {
      setValue("selectedDate", state.selectedDate);
      setValue("dateShortcut", state.dateShortcut);
      setValue("apiKey", state.apiKey);
      setValue("tableLabel", state.tableLabel);

      var startButton = $("btnStart");
      if (startButton) {
        startButton.disabled = Boolean(state.isLoading);
      }

      [
        ["btnInspectLayout", false],
        ["btnFill", false],
        ["btnCorrect", state.isLayoutInspecting || state.isFillingTable]
      ].forEach(function (item) {
        var button = $(item[0]);
        if (button) {
          button.disabled = Boolean(item[1]);
        }
      });

      var statusBar = $("statusBar");
      if (statusBar) {
        statusBar.className = "status " + (state.status || "idle");
        statusBar.textContent = state.statusText || "Status: Bereit";
      }

      var progressBar = $("progressBar");
      if (progressBar) {
        progressBar.style.width = clampProgress(state.progress) + "%";
      }

      var progressText = $("progressText");
      if (progressText) {
        progressText.textContent = state.progressText || clampProgress(state.progress) + "%";
      }

      var logOutput = $("logOutput");
      if (logOutput) {
        logOutput.value = state.logEntries.join("\n");
        logOutput.scrollTop = logOutput.scrollHeight;
        logOutput.setAttribute("aria-readonly", "true");
      }
    } catch (error) {
      try {
        console.error("[EPG Exact Fit] Render-Fehler", error);
      } catch (consoleError) {
        // Keep render fail-safe.
      }
    } finally {
      state.isRendering = false;
    }
  }

  function setValue(id, value) {
    var element = $(id);
    var normalizedValue = String(value || "");
    if (!element) {
      return;
    }
    if (element.value !== normalizedValue) {
      element.value = normalizedValue;
    }
    if (element.defaultValue !== undefined) {
      element.defaultValue = normalizedValue;
    }
    if (element.tagName === "INPUT") {
      element.setAttribute("value", normalizedValue);
    }
  }

  function log(message) {
    try {
      var normalizedMessage = String(message || "").trim();
      if (!normalizedMessage) {
        return;
      }

      state.logEntries = state.logEntries.concat([
        "[" + timestampForLog(new Date()) + "] " + normalizedMessage
      ]).slice(-LOG_LIMIT);
      persistLogEntries();
      try {
        console.log("[EPG Exact Fit] " + normalizedMessage);
      } catch (consoleError) {
        // Console may be unavailable in some UXP contexts.
      }
      render();
    } catch (error) {
      safeConsoleError("LOG ERROR", error);
    }
  }

  function installGlobalErrorLogging() {
    if (typeof window === "undefined" || window.__epgExactFitErrorLoggingInstalled) {
      return;
    }
    if (typeof window.addEventListener !== "function") {
      return;
    }

    window.__epgExactFitErrorLoggingInstalled = true;
    window.addEventListener("error", function (event) {
      var message = event && event.message || "Unbekannter Scriptfehler";
      log("SCRIPT-FEHLER: " + message);
    });
    window.addEventListener("unhandledrejection", function (event) {
      var reason = event && event.reason;
      var message = reason && reason.message || String(reason || "Unbekannter Promise-Fehler");
      log("PROMISE-FEHLER: " + message);
    });
  }

  function setStatus(status, text) {
    state.status = String(status || "idle");
    state.statusText = text || "Status: Bereit";
    render();
  }

  function setProgress(value, text) {
    var progress = clampProgress(value);
    state.progress = progress;
    state.progressText = text ? progress + "% - " + text : progress + "%";
    render();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : (value ? [value] : []);
  }

  function collectionToArray(collection) {
    if (!collection) {
      return [];
    }
    if (Array.isArray(collection)) {
      return collection;
    }
    if (collection.everyItem && typeof collection.everyItem === "function") {
      try {
        var everyItem = collection.everyItem();
        if (everyItem && typeof everyItem.getElements === "function") {
          return everyItem.getElements();
        }
      } catch (error) {
        // Fall through to length-based extraction.
      }
    }
    if (typeof collection.length === "number") {
      try {
        return Array.prototype.slice.call(collection);
      } catch (error) {
        var items = [];
        for (var index = 0; index < collection.length; index += 1) {
          items.push(collection[index]);
        }
        return items;
      }
    }
    return [];
  }

  function safeRead(getter) {
    try {
      return getter();
    } catch (error) {
      return null;
    }
  }

  function getErrorMessage(error) {
    return error && error.message ? String(error.message) : String(error || "");
  }

  function isInDesignHostBusyError(error) {
    var message = getErrorMessage(error);
    return /Shutting down in progress|can't process|can.t process/i.test(message);
  }

  function markLayoutError(error) {
    var message = getErrorMessage(error);
    state.lastLayoutError = message;
    if (isInDesignHostBusyError(error)) {
      state.indesignHostBlockedUntil = Date.now() + 5000;
    }
    return message;
  }

  function clearLayoutError() {
    state.lastLayoutError = "";
    state.indesignHostBlockedUntil = 0;
  }

  function isInDesignHostGuardActive() {
    return state.indesignHostBlockedUntil && Date.now() < state.indesignHostBlockedUntil;
  }

  function logInDesignHostGuard(actionLabel) {
    var remainingMs = Math.max(0, state.indesignHostBlockedUntil - Date.now());
    var seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    log(actionLabel + " blockiert: InDesign meldete zuletzt \"" + (state.lastLayoutError || "Host nicht bereit") + "\". Bitte " + seconds + "s warten und dann erneut versuchen.");
  }

  function collectionLength(collection) {
    return collectionToArray(collection).length;
  }

  function uniqueStrings(values) {
    var seen = {};
    var result = [];
    asArray(values).forEach(function (value) {
      var text = String(value || "").trim();
      if (text && !seen[text]) {
        seen[text] = true;
        result.push(text);
      }
    });
    return result;
  }

  function normalizeChannelName(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, "und")
      .replace(/\+/g, "plus")
      .replace(/[^a-z0-9]/g, "");
  }

  function expandChannelIdCandidates(channel) {
    var explicit = uniqueStrings([channel && channel.id].concat(asArray(channel && channel.idCandidates)));
    var derived = [];
    explicit.forEach(function (id) {
      var value = String(id || "").trim();
      if (!value) {
        return;
      }
      derived.push(value);
      derived.push(value.replace(/\s+/g, "."));
      derived.push(value.replace(/\./g, " "));
      derived.push(value.replace(/\.de$/i, ""));
    });
    return uniqueStrings(explicit.concat(derived));
  }

  function getChannelAliases(channel) {
    return uniqueStrings([channel && channel.label, channel && channel.id]
      .concat(asArray(channel && channel.aliases))
      .concat(expandChannelIdCandidates(channel)));
  }

  function isChannelMatch(candidate, aliases) {
    var normalizedCandidate = normalizeChannelName(candidate);
    var normalizedAliases = uniqueStrings(aliases).map(normalizeChannelName).filter(Boolean);
    if (!normalizedCandidate || !normalizedAliases.length) {
      return false;
    }
    return normalizedAliases.some(function (alias) {
      return normalizedCandidate === alias ||
        normalizedCandidate.indexOf(alias) !== -1 ||
        alias.indexOf(normalizedCandidate) !== -1;
    });
  }

  function matchProgrammesByChannel(programmes, aliases) {
    if (!programmes.length) {
      return { programmes: [], hasChannelText: false };
    }

    var mapped = programmes.map(function (programme) {
      var raw = programme.raw || {};
      return {
        programme: programme,
        channelTexts: uniqueStrings([
          programme.channel,
          raw.channel,
          raw.channelName,
          raw.station,
          raw.stationName,
          raw.sender,
          raw.broadcaster,
          raw.network,
          raw.service,
          raw.id,
          raw.channelId
        ])
      };
    });

    var hasChannelText = mapped.some(function (entry) {
      return entry.channelTexts.length > 0;
    });

    if (!hasChannelText) {
      return { programmes: programmes, hasChannelText: false };
    }

    return {
      programmes: mapped.filter(function (entry) {
        return entry.channelTexts.some(function (text) {
          return isChannelMatch(text, aliases);
        });
      }).map(function (entry) {
        return entry.programme;
      }),
      hasChannelText: true
    };
  }

  function normalizeDateValue(value) {
    var text = String(value || "").trim();
    var ymd = text.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})/);
    var dmy = text.match(/^(\d{2})[./](\d{2})[./](\d{4})/);
    var compact = text.match(/^(\d{4})(\d{2})(\d{2})/);
    var parsed;

    if (ymd) {
      return ymd[1] + "-" + ymd[2] + "-" + ymd[3];
    }
    if (dmy) {
      return dmy[3] + "-" + dmy[2] + "-" + dmy[1];
    }
    if (compact) {
      return compact[1] + "-" + compact[2] + "-" + compact[3];
    }
    parsed = new Date(text);
    return isNaN(parsed.getTime()) ? "" : formatDateForInput(parsed);
  }

  function normalizeTimeValue(value) {
    var text = String(value || "").trim();
    var compactDateTime = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    var normal = text.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?/);
    var compact = text.match(/(?:^|[ T])(\d{2})(\d{2})(\d{2})(?:\s|$)/);
    var parsed;

    if (compactDateTime) {
      return compactDateTime[4] + "." + compactDateTime[5];
    }
    if (normal) {
      return pad(normal[1]) + "." + normal[2];
    }
    if (compact) {
      return compact[1] + "." + compact[2];
    }
    parsed = new Date(text);
    return isNaN(parsed.getTime()) ? "" : pad(parsed.getHours()) + "." + pad(parsed.getMinutes());
  }

  function extractText(value) {
    var keys;
    var i;
    var text;

    if (value === undefined || value === null) {
      return "";
    }
    if (["string", "number", "boolean"].indexOf(typeof value) !== -1) {
      return String(value);
    }
    if (Array.isArray(value)) {
      for (i = 0; i < value.length; i += 1) {
        text = extractText(value[i]);
        if (text) {
          return text;
        }
      }
      return "";
    }
    if (typeof value === "object") {
      keys = ["label", "name", "title", "displayName", "channel", "channelName", "value", "text", "id"];
      for (i = 0; i < keys.length; i += 1) {
        if (Object.prototype.hasOwnProperty.call(value, keys[i])) {
          text = extractText(value[keys[i]]);
          if (text) {
            return text;
          }
        }
      }
    }
    return "";
  }

  function unwrapToolResult(result) {
    var keys = ["programmes", "items", "results", "data", "channels"];
    var out = [];

    if (!result) {
      return [];
    }
    if (result.structuredContent) {
      return unwrapToolResult(result.structuredContent);
    }
    for (var i = 0; i < keys.length; i += 1) {
      if (Array.isArray(result[keys[i]])) {
        return result[keys[i]];
      }
    }
    if (Array.isArray(result.content)) {
      result.content.forEach(function (contentItem) {
        if (contentItem && contentItem.type === "text" && typeof contentItem.text === "string") {
          try {
            out = out.concat(unwrapToolResult(JSON.parse(contentItem.text)));
          } catch (error) {
            if (contentItem.text) {
              out.push(contentItem.text);
            }
          }
        } else {
          out = out.concat(unwrapToolResult(contentItem));
        }
      });
      return out;
    }
    if (Array.isArray(result)) {
      return result;
    }
    return [];
  }

  function normalizeProgramme(item, fallbackChannel, fallbackDate) {
    var raw = typeof item === "object" && item ? item : { title: String(item || "") };
    var rawStart = raw.startTime || raw.start || raw.begin || raw.startDateTime || raw.start_date_time || raw.datetime || "";
    var rawDate = raw.date || raw.startDate || raw.day || rawStart || fallbackDate;
    var channel = extractText(raw.channel) ||
      extractText(raw.channelName) ||
      extractText(raw.station) ||
      extractText(raw.stationName) ||
      extractText(raw.sender) ||
      extractText(raw.broadcaster) ||
      extractText(raw.network) ||
      fallbackChannel ||
      "";

    return {
      id: String(raw.id || raw.programmeId || (raw.title || raw.name || "programme") + "-" + (rawStart || Math.random())),
      channel: channel,
      date: normalizeDateValue(rawDate) || fallbackDate || "",
      day: normalizeDateValue(rawDate) || fallbackDate || "",
      startTime: normalizeTimeValue(rawStart || raw.time),
      time: normalizeTimeValue(rawStart || raw.time),
      endTime: raw.endTime || raw.end || "",
      title: raw.title || raw.name || raw.programmeTitle || raw.program_title || "Ohne Titel",
      subtitle: raw.subtitle || raw.episodeTitle || "",
      description: raw.description || raw.desc || raw.summary || raw.text || "",
      genre: raw.genre || raw.category || "",
      raw: raw
    };
  }

  function sortProgrammes(programmes) {
    return programmes.slice().sort(function (left, right) {
      var leftDate = String(left.day || left.date || "");
      var rightDate = String(right.day || right.date || "");
      var leftChannel = String(left.channel || "");
      var rightChannel = String(right.channel || "");
      if (leftDate !== rightDate) {
        return leftDate.localeCompare(rightDate, "de");
      }
      if (leftChannel !== rightChannel) {
        return leftChannel.localeCompare(rightChannel, "de");
      }
      return String(left.time || left.startTime || "").localeCompare(String(right.time || right.startTime || ""), "de");
    });
  }

  function parseSse(text) {
    var messages = [];
    String(text || "").split(/\n\n+/).forEach(function (event) {
      event.split("\n").filter(function (line) {
        return line.indexOf("data:") === 0;
      }).forEach(function (line) {
        var data = line.slice(5).trim();
        if (data && data !== "[DONE]") {
          try {
            messages.push(JSON.parse(data));
          } catch (error) {}
        }
      });
    });
    return messages;
  }

  function parseBody(rawText, contentType) {
    if (String(contentType || "").indexOf("text/event-stream") !== -1) {
      return parseSse(rawText);
    }
    try {
      return JSON.parse(rawText);
    } catch (error) {
      return rawText;
    }
  }

  function extractResult(payload, expectedId) {
    var messages = Array.isArray(payload) ? payload : [payload];
    var matched = messages.find(function (message) {
      return message && message.id === expectedId && !message.error;
    });
    var errored;
    var fallback;

    if (matched) {
      return matched.result;
    }

    errored = messages.find(function (message) {
      return message && message.id === expectedId && message.error;
    });
    if (errored) {
      throw new Error(errored.error.message || "MCP Fehler");
    }

    fallback = messages.find(function (message) {
      return message && message.result;
    });
    if (fallback) {
      return fallback.result;
    }

    throw new Error("Keine verwertbare JSON-RPC-Antwort.");
  }

  function createMcpClient() {
    var clientState = {
      endpoint: MCP_ENDPOINT,
      requestId: 1,
      sessionId: null,
      protocolVersion: DEFAULT_PROTOCOLS[0],
      initializeResult: null,
      didSendInitialized: false,
      initPromise: null
    };

    function xhrRequest(body, headers) {
      return new Promise(function (resolve, reject) {
        var xhr;
        var key;

        if (typeof XMLHttpRequest !== "function") {
          reject(new Error("XMLHttpRequest ist nicht verfügbar."));
          return;
        }

        xhr = new XMLHttpRequest();
        xhr.open("POST", clientState.endpoint, true);
        xhr.timeout = REQUEST_TIMEOUT_MS;
        for (key in headers) {
          if (Object.prototype.hasOwnProperty.call(headers, key)) {
            xhr.setRequestHeader(key, headers[key]);
          }
        }
        xhr.onload = function () {
          var responseHeaders = {};
          String(xhr.getAllResponseHeaders ? xhr.getAllResponseHeaders() : "")
            .trim()
            .split(/\r?\n/)
            .filter(Boolean)
            .forEach(function (line) {
              var index = line.indexOf(":");
              if (index > -1) {
                responseHeaders[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
              }
            });
          resolve({
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            text: function () {
              return Promise.resolve(xhr.responseText || "");
            },
            headers: {
              get: function (name) {
                return responseHeaders[String(name || "").toLowerCase()] || null;
              }
            }
          });
        };
        xhr.onerror = function () {
          reject(new Error("XHR-Netzwerkfehler: " + clientState.endpoint));
        };
        xhr.ontimeout = function () {
          reject(new Error("XHR-Timeout: " + clientState.endpoint));
        };
        xhr.send(JSON.stringify(body));
      });
    }

    function fetchWithTimeout(body, headers) {
      var controller;
      var timer;

      if (typeof fetch !== "function") {
        return xhrRequest(body, headers);
      }
      if (typeof AbortController !== "function") {
        return fetch(clientState.endpoint, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(body)
        });
      }

      controller = new AbortController();
      timer = setTimeout(function () {
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      return fetch(clientState.endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
        signal: controller.signal
      }).catch(function (error) {
        if (typeof XMLHttpRequest === "function") {
          return xhrRequest(body, headers);
        }
        throw error;
      }).then(function (response) {
        clearTimeout(timer);
        return response;
      }, function (error) {
        clearTimeout(timer);
        throw error;
      });
    }

    function postJson(body, options) {
      var headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
      };
      options = options || {};
      if (options.protocolHeader) {
        headers["MCP-Protocol-Version"] = options.protocolHeader;
      }
      if (clientState.sessionId) {
        headers["Mcp-Session-Id"] = clientState.sessionId;
      }

      return fetchWithTimeout(body, headers).then(function (response) {
        var sessionId = response.headers.get("Mcp-Session-Id");
        var contentType = response.headers.get("Content-Type") || "";
        if (sessionId) {
          clientState.sessionId = sessionId;
        }
        return response.text().then(function (rawText) {
          if (!response.ok) {
            throw new Error("HTTP " + response.status + " an " + clientState.endpoint);
          }
          return parseBody(rawText, contentType);
        });
      });
    }

    function send(method, params, options) {
      var id = clientState.requestId;
      clientState.requestId += 1;
      return postJson({
        jsonrpc: "2.0",
        id: id,
        method: method,
        params: params || {}
      }, options || {}).then(function (payload) {
        return extractResult(payload, id);
      });
    }

    function notify(method, params) {
      return postJson({
        jsonrpc: "2.0",
        method: method,
        params: params || {}
      }, {
        protocolHeader: clientState.protocolVersion
      });
    }

    function resetSession() {
      clientState.sessionId = null;
      clientState.initializeResult = null;
      clientState.didSendInitialized = false;
    }

    function doInitialize() {
      var chain = Promise.reject(new Error("MCP initialize nicht gestartet."));

      DEFAULT_PROTOCOLS.forEach(function (protocol) {
        chain = chain.catch(function () {
          resetSession();
          return send("initialize", {
            protocolVersion: protocol,
            capabilities: {},
            clientInfo: {
              name: "epg-exact-fit-plugin",
              version: "0.1.36"
            }
          }).then(function (result) {
            clientState.protocolVersion = result && result.protocolVersion || protocol;
            clientState.initializeResult = result || {};
            return notify("notifications/initialized", {}).catch(function () {}).then(function () {
              clientState.didSendInitialized = true;
              return clientState.initializeResult;
            });
          });
        });
      });

      return chain;
    }

    function initialize() {
      if (clientState.initializeResult && clientState.didSendInitialized) {
        return Promise.resolve(clientState.initializeResult);
      }
      if (!clientState.initPromise) {
        clientState.initPromise = doInitialize().then(function (result) {
          clientState.initPromise = null;
          return result;
        }, function (error) {
          clientState.initPromise = null;
          throw error;
        });
      }
      return clientState.initPromise;
    }

    return {
      initialize: initialize,
      listTools: function () {
        return initialize().then(function () {
          return send("tools/list", {}, {
            protocolHeader: clientState.protocolVersion
          });
        });
      },
      callTool: function (toolName, args) {
        return initialize().then(function () {
          return send("tools/call", {
            name: toolName,
            arguments: args || {}
          }, {
            protocolHeader: clientState.protocolVersion
          });
        });
      }
    };
  }

  function getToolsArray(toolsResult) {
    var tools = toolsResult && toolsResult.tools || toolsResult || [];
    return Array.isArray(tools) ? tools : [];
  }

  function findTool(tools, name) {
    return tools.find(function (tool) {
      return tool && tool.name === name;
    });
  }

  function fetchProgrammes(client, options) {
    var requestedDate = normalizeDateValue(options.date);
    var channelTargets = asArray(options.channels);
    var onProgress = typeof options.onProgress === "function" ? options.onProgress : function () {};
    var cachedTools = [];

    if (!requestedDate) {
      return Promise.reject(new Error("Datum fehlt oder ist ungültig."));
    }
    if (!channelTargets.length) {
      return Promise.reject(new Error("Keine Sender konfiguriert."));
    }

    onProgress({ message: "MCP Initialisierung..." });
    return client.initialize()
      .then(function () {
        onProgress({ message: "MCP Tools laden..." });
        return client.listTools();
      })
      .then(function (toolsResult) {
        var searchTool;
        var scheduleTool;
        var allProgrammes = [];
        var channelResults = [];
        var sequence = Promise.resolve();

        cachedTools = getToolsArray(toolsResult);
        searchTool = findTool(cachedTools, "search_programmes");
        scheduleTool = findTool(cachedTools, "get_programme");

        if (!searchTool) {
          throw new Error("Tool search_programmes nicht gefunden.");
        }
        if (!scheduleTool) {
          throw new Error("Tool get_programme nicht gefunden.");
        }

        onProgress({ message: "Tool search_programmes erkannt; Kanalplaene werden ueber get_programme geladen." });

        channelTargets.forEach(function (channel) {
          sequence = sequence.then(function () {
            var label = channel && channel.label || String(channel || "");
            var aliases = getChannelAliases(channel);
            var idCandidates = expandChannelIdCandidates(channel).slice(0, 6);
            var loadedForChannel = [];
            var usedId = "";
            var lastError = null;
            var attempts = Promise.resolve();

            onProgress({ message: "Lade " + label + "..." });

            idCandidates.forEach(function (channelId) {
              attempts = attempts.then(function () {
                if (loadedForChannel.length) {
                  return null;
                }
                return client.callTool("get_programme", {
                  country: "DE",
                  channelId: channelId
                }).then(function (toolResult) {
                  var normalized = unwrapToolResult(toolResult).map(function (item) {
                    return normalizeProgramme(item, label, requestedDate);
                  });
                  var matched = matchProgrammesByChannel(normalized, aliases);
                  var dated = matched.programmes.filter(function (programme) {
                    return !programme.day || programme.day === requestedDate;
                  });
                  var fallbackOk = !matched.hasChannelText && normalized.length > 0 && normalized.length <= 180;

                  if (dated.length || fallbackOk) {
                    loadedForChannel = dated.length ? dated : normalized;
                    usedId = channelId;
                  }
                  return null;
                }).catch(function (error) {
                  lastError = error;
                });
              });
            });

            return attempts.then(function () {
              if (loadedForChannel.length) {
                var labelled = sortProgrammes(loadedForChannel).map(function (programme) {
                  programme.channel = label;
                  programme.requestedChannelLabel = label;
                  return programme;
                });
                allProgrammes = allProgrammes.concat(labelled);
                channelResults.push({
                  label: label,
                  ok: true,
                  count: labelled.length,
                  channelUsed: usedId || label
                });
                onProgress({ message: label + ": " + labelled.length + " Sendungen geladen." });
              } else {
                channelResults.push({
                  label: label,
                  ok: false,
                  count: 0,
                  error: lastError && lastError.message || "Keine Programme gefunden."
                });
                onProgress({ message: label + ": keine Sendungen gefunden." });
              }
              return delay(20);
            });
          });
        });

        return sequence.then(function () {
          return {
            programmes: sortProgrammes(allProgrammes),
            channels: channelResults,
            debug: {
              requestedDate: requestedDate,
              toolCount: cachedTools.length
            }
          };
        });
      });
  }

  function summarizeProgramme(programme) {
    return (programme.time || programme.startTime || "--:--") + " " + (programme.title || "Ohne Titel");
  }

  function createButton(id, label) {
    var button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.textContent = label;
    button.setAttribute("style", "display:block;width:100%;min-height:38px;margin-top:8px;");
    return button;
  }

  function ensurePrimaryActions() {
    var actionsPanel = $("actionsPanel");
    var host = actionsPanel || document.body;
    var buttons = [
      { id: "btnStart", action: "start", label: "Daten laden / Start", style: "display:block;width:100%;min-height:38px;margin-top:8px;" },
      { id: "btnInspectLayout", action: "inspect", label: "Layout prüfen", style: "display:block;width:100%;min-height:38px;margin-top:8px;" },
      { id: "btnFill", action: "fill", label: "Tabelle befüllen", style: "display:block;width:100%;min-height:38px;margin-top:8px;" },
      { id: "btnCorrect", action: "correct", label: "Korrektur starten", style: "display:block;width:100%;min-height:38px;margin-top:8px;" },
      { id: "btnLoad", action: "load", label: "Sender laden", style: "display:block;width:100%;min-height:38px;margin-top:8px;" },
      { id: "btnPing", action: "ping", label: "PING TEST", style: "display:block;width:100%;min-height:38px;margin-top:8px;" }
    ];

    if (!host) {
      return;
    }

    buttons.forEach(function (action) {
      var button = $(action.id);
      if (!button) {
        button = createButton(action.id, action.label);
      }
      button.textContent = action.label;
      button.type = "button";
      button.setAttribute("data-epg-action", action.action);
      button.setAttribute("style", action.style);
      if (button.parentNode !== host) {
        host.appendChild(button);
      }
    });
  }

  function getActionHandlers() {
    return {
      start: function (event) {
        log("ACTION start empfangen.");
        handleStart(event);
      },
      inspect: function (event) {
        log("ACTION inspect empfangen.");
        handleLayoutInspectStatus(event);
      },
      fill: function (event) {
        log("ACTION fill empfangen.");
        handleTableFillProbe(event);
      },
      correct: function () {
        log("ACTION correct empfangen.");
        log("Korrektur ist noch nicht implementiert. Rewrite Orchestrator ist laut Architektur ausstehend.");
      },
      load: function () {
        log("ACTION load empfangen.");
        log("Sender laden ist vorbereitet. Bitte zentral ueber Daten laden / Start ausfuehren.");
      },
      ping: function () {
        log("PING OK - UI reagiert");
      }
    };
  }

  function runAction(action, event) {
    var handlers = getActionHandlers();
    var handler = handlers[action];

    if (!handler) {
      log("Unbekannte Aktion: " + action);
      return;
    }

    if ((action === "inspect" || action === "fill") && isInDesignHostGuardActive()) {
      logInDesignHostGuard(action === "inspect" ? "Layout pruefen" : "Tabelle befuellen");
      return;
    }

    handler(event || null);
  }

  function bindActivation(control, action) {
    if (!control) {
      return;
    }

    function invoke(event) {
      var now = Date.now();
      if (control.__epgLastActivation && now - control.__epgLastActivation < 250) {
        return;
      }
      control.__epgLastActivation = now;

      if (event && event.preventDefault) {
        event.preventDefault();
      }

      runAction(action, event);
    }

    if (control.addEventListener) {
      control.addEventListener("click", invoke);
      control.addEventListener("mouseup", invoke);
      control.addEventListener("keyup", function (event) {
        var key = event && (event.key || event.code || "");
        if (key === "Enter" || key === " " || key === "Space" || key === "Spacebar") {
          invoke(event);
        }
      });
    }

    control.onclick = invoke;
    control.onmouseup = invoke;
  }

  function safeBind(id, action) {
    try {
      var el = document.getElementById(id);
      if (!el) {
        log("WARN: Element fehlt: " + id);
        return;
      }
      bindActivation(el, action);
    } catch (error) {
      safeConsoleError("Bind Fehler: " + id, error);
      log("BIND-FEHLER " + id + ": " + (error && error.message ? error.message : String(error)));
    }
  }

  function stableSourceString(value) {
    if (value === null || value === undefined) {
      return "";
    }
    if (Array.isArray(value)) {
      return "[" + value.map(stableSourceString).join(",") + "]";
    }
    if (typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) {
        return key + ":" + stableSourceString(value[key]);
      }).join(",") + "}";
    }
    return String(value);
  }

  function createSourceHash(source) {
    var text = stableSourceString(source);
    var hash = 2166136261;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    var hex = (hash >>> 0).toString(16);
    while (hex.length < 8) {
      hex = "0" + hex;
    }
    return "src_" + hex;
  }

  function normalizeSlotPart(value) {
    return String(value || "unknown").trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown";
  }

  function getSlotSection(programme) {
    var time = String(programme.startTime || programme.time || "").trim();
    var match = time.match(/^(\d{1,2})[.:]/);
    var hour = match ? Number(match[1]) : null;
    if (hour === null) {
      return "day";
    }
    if (hour >= 20 && hour < 23) {
      return "prime";
    }
    if (hour >= 23 || hour < 6) {
      return "night";
    }
    return "day";
  }

  function parseMinutes(timeValue) {
    var match = String(timeValue || "").match(/^(\d{1,2})[.:](\d{2})/);
    if (!match) {
      return null;
    }
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function parseEpgSlotId(slotId) {
    var parts = String(slotId || "").split(".");
    return {
      slotId: String(slotId || ""),
      area: parts[0] || "",
      channelKey: parts[1] || "",
      slotName: parts.slice(2).join(".") || ""
    };
  }

  function getSlotWindow(slotName) {
    var windows = {
      dayEarly: { start: 6 * 60, end: 12 * 60 },
      dayPrePrime: { start: 12 * 60, end: 20 * 60 },
      primeVisual: { start: 20 * 60, end: 23 * 60 },
      primeCaption: { start: 20 * 60, end: 23 * 60 },
      primeMain: { start: 20 * 60, end: 23 * 60 },
      evening: { start: 22 * 60, end: 24 * 60 },
      night: { start: 23 * 60, end: 30 * 60 },
      compactDay: { start: 6 * 60, end: 20 * 60 },
      compactPrime: { start: 20 * 60, end: 24 * 60 }
    };
    return windows[slotName] || null;
  }

  function isMinuteInWindow(minutes, window) {
    if (minutes === null || !window) {
      return false;
    }
    var adjustedMinutes = minutes < 6 * 60 ? minutes + 24 * 60 : minutes;
    return adjustedMinutes >= window.start && adjustedMinutes < window.end;
  }

  function getChannelAliasesForSlot(channelKey) {
    var aliases = {
      ard: ["ard", "daserste"],
      zdf: ["zdf"],
      sat1: ["sat1", "sat.1"],
      rtl: ["rtl"],
      pro7: ["pro7", "prosieben"],
      vox: ["vox"],
      kabeleins: ["kabeleins", "kabel eins"],
      tele5: ["tele5", "tele 5"],
      rtlzwei: ["rtlzwei", "rtl zwei", "rtl2", "rtl ii"],
      sky: ["sky"],
      arte: ["arte"],
      welt: ["welt", "n24"],
      sport1: ["sport1"]
    };
    return aliases[channelKey] || [channelKey];
  }

  function programmeMatchesSlotChannel(programme, channelKey) {
    var programmeChannel = normalizeChannelName(programme.channelId || programme.channel || programme.requestedChannelLabel);
    return getChannelAliasesForSlot(channelKey).some(function (alias) {
      return programmeChannel === normalizeChannelName(alias);
    });
  }

  function assignProgrammesToMarkerSlots(programmes, slotIds) {
    var originals = programmes.map(function (programme) {
      return programme && programme.sourceHash ? programme : normalizeOriginalProgramme(programme);
    });

    return slotIds.map(function (slotId) {
      var parsed = parseEpgSlotId(slotId);
      var window = getSlotWindow(parsed.slotName);
      var assignedProgrammes = window ? originals.filter(function (programme) {
        return programmeMatchesSlotChannel(programme, parsed.channelKey) &&
          isMinuteInWindow(parseMinutes(programme.startTime), window);
      }).map(function (programme) {
        return Object.assign({}, programme, {
          slotId: slotId
        });
      }) : [];

      return {
        slotId: slotId,
        area: parsed.area,
        channelKey: parsed.channelKey,
        slotName: parsed.slotName,
        isContentSlot: Boolean(window),
        programmes: assignedProgrammes
      };
    });
  }

  function normalizeOriginalProgramme(programme) {
    var channelId = String(programme.channel || programme.channelId || programme.requestedChannelLabel || "unknown-channel").trim();
    var startTime = String(programme.startTime || programme.time || "").trim();
    var originalTitle = String(programme.title || programme.name || "Ohne Titel").trim();
    var originalSubtitle = String(programme.subtitle || programme.episodeTitle || "").trim();
    var originalDescription = String(programme.description || programme.desc || programme.summary || "").trim();
    var slotId = normalizeSlotPart(channelId) + "." + getSlotSection(programme);
    var originalSource = {
      channelId: channelId,
      startTime: startTime,
      endTime: programme.endTime || programme.end || "",
      originalTitle: originalTitle,
      originalSubtitle: originalSubtitle,
      originalDescription: originalDescription,
      genre: programme.genre || "",
      category: programme.category || ""
    };
    var sourceHash = createSourceHash(originalSource);

    return {
      programmeId: String(programme.id || programme.programmeId || sourceHash),
      channelId: channelId,
      slotId: slotId,
      startTime: startTime,
      endTime: String(programme.endTime || programme.end || "").trim(),
      originalTitle: originalTitle,
      originalSubtitle: originalSubtitle,
      originalDescription: originalDescription,
      genre: String(programme.genre || "").trim(),
      category: String(programme.category || "").trim(),
      durationMin: isFinite(Number(programme.durationMin)) ? Number(programme.durationMin) : undefined,
      sourceHash: sourceHash,
      sourceFingerprint: [channelId, startTime, originalTitle].filter(Boolean).join("|")
    };
  }

  function classifyOriginalProgramme(programme) {
    var text = [
      programme.originalTitle,
      programme.originalSubtitle,
      programme.originalDescription,
      programme.genre,
      programme.category
    ].join(" ");
    if (/\b(nachrichten|wetter|magazin|journal|tagesschau|heute|fruehstuecksfernsehen|frühstücksfernsehen)\b/i.test(text)) {
      return Object.assign({}, programme, { programmeClass: "recurrent", priority: 2 });
    }
    if (/\b(film|spielfilm|premiere|live|show|event|champions league|tatort)\b/i.test(text)) {
      return Object.assign({}, programme, { programmeClass: "highlight", priority: 4 });
    }
    return Object.assign({}, programme, { programmeClass: "editorial", priority: 3 });
  }

  function firstCompleteSentence(text) {
    var clean = String(text || "").replace(/\s+/g, " ").trim();
    var match = clean.match(/^(.+?[.!?])(?:\s|$)/);
    return match ? match[1].trim() : "";
  }

  function createProgrammeVariants(programme) {
    var timeTitle = String((programme.startTime || "") + " " + (programme.originalTitle || "Ohne Titel")).replace(/\s+/g, " ").trim();
    var subtitle = String(programme.originalSubtitle || "").replace(/\s+/g, " ").trim();
    var firstSentence = firstCompleteSentence(programme.originalDescription);
    var variants = [{
      variantId: programme.programmeId + ".timeTitle",
      programmeId: programme.programmeId,
      slotId: programme.slotId,
      level: "timeTitle",
      text: timeTitle,
      programmeClass: programme.programmeClass,
      priority: programme.priority,
      basedOnSourceHash: programme.sourceHash,
      basedOnSourceFingerprint: programme.sourceFingerprint,
      basedOnOriginalOnly: true,
      isCompletePhrase: true,
      hasNoTruncation: true,
      hasNoHallucinationRisk: true,
      qualityScore: 60
    }];

    if (subtitle) {
      variants.push(Object.assign({}, variants[0], {
        variantId: programme.programmeId + ".micro",
        level: "micro",
        text: timeTitle + ": " + subtitle,
        qualityScore: 72
      }));
    }

    if (firstSentence) {
      variants.push(Object.assign({}, variants[0], {
        variantId: programme.programmeId + ".short",
        level: "short",
        text: timeTitle + ". " + firstSentence,
        qualityScore: 82
      }));
    }

    return variants.filter(function (variant, index, all) {
      return variant.text && all.findIndex(function (candidate) {
        return candidate.text === variant.text;
      }) === index;
    });
  }

  function createInitialSlotCandidate(assignment) {
    var slotId = assignment && assignment.slotId || "";
    var orderedProgrammes = (assignment && Array.isArray(assignment.programmes) ? assignment.programmes : [])
      .filter(function (programme) {
        return programme && programme.programmeId;
      })
      .slice()
      .sort(function (left, right) {
        return String(left.startTime || "").localeCompare(String(right.startTime || ""), "de");
      });
    var chosenVariantByProgrammeId = {};
    var missingProgrammes = [];
    var orderedProgrammeIds = orderedProgrammes.map(function (programme) {
      return programme.programmeId;
    });

    orderedProgrammes.forEach(function (programme) {
      var programmeForSlot = Object.assign({}, programme, {
        slotId: slotId
      });
      var variants = createProgrammeVariants(programmeForSlot);
      var chosenVariant = variants.find(function (variant) {
        return variant.level === "timeTitle";
      }) || variants[0] || null;

      if (chosenVariant && chosenVariant.basedOnOriginalOnly === true) {
        chosenVariantByProgrammeId[programme.programmeId] = chosenVariant;
      } else {
        missingProgrammes.push(programme.programmeId);
      }
    });

    return {
      slotId: slotId,
      orderedProgrammeIds: orderedProgrammeIds,
      chosenVariantByProgrammeId: chosenVariantByProgrammeId,
      concatenatedText: orderedProgrammeIds.map(function (programmeId) {
        return chosenVariantByProgrammeId[programmeId];
      }).filter(Boolean).map(function (variant) {
        return variant.text;
      }).join("\n"),
      exactFit: false,
      score: Object.keys(chosenVariantByProgrammeId).reduce(function (sum, programmeId) {
        return sum + Number(chosenVariantByProgrammeId[programmeId].qualityScore || 0);
      }, 0),
      missingProgrammes: missingProgrammes,
      rewriteGeneration: 0
    };
  }

  function prepareSlotCandidates(assignments) {
    return (Array.isArray(assignments) ? assignments : [])
      .filter(function (assignment) {
        return assignment && assignment.isContentSlot && assignment.programmes && assignment.programmes.length;
      })
      .map(createInitialSlotCandidate);
  }

  function countBindingStatuses(layoutSlots) {
    return asArray(layoutSlots).reduce(function (counts, slot) {
      var status = slot && slot.bindingStatus || "BLOCKED_UNKNOWN_SLOT_PROFILE";
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {
      READY: 0,
      BLOCKED_NO_TARGET: 0,
      BLOCKED_NO_PROBE: 0,
      BLOCKED_NO_PROGRAMMES: 0,
      BLOCKED_UNKNOWN_SLOT_PROFILE: 0
    });
  }

  function getFirstBindingBlocker(layoutSlots) {
    return asArray(layoutSlots).find(function (slot) {
      return slot && slot.bindingStatus && slot.bindingStatus !== "READY";
    }) || null;
  }

  function prepareSlotPipeline(programmes) {
    var originalProgrammes = programmes.map(normalizeOriginalProgramme).map(classifyOriginalProgramme);
    var slotGroups = originalProgrammes.reduce(function (groups, programme) {
      if (!groups[programme.slotId]) {
        groups[programme.slotId] = [];
      }
      groups[programme.slotId].push(programme);
      return groups;
    }, {});
    var programmeVariants = originalProgrammes.reduce(function (all, programme) {
      return all.concat(createProgrammeVariants(programme));
    }, []);

    return {
      originalProgrammes: originalProgrammes,
      slotGroups: slotGroups,
      programmeVariants: programmeVariants
    };
  }

  function getInDesignApp() {
    if (typeof require !== "function") {
      throw new Error("InDesign Runtime ist in dieser Umgebung nicht verfuegbar.");
    }

    var indesign = require("indesign");
    var app = indesign && (indesign.app || indesign);
    if (!app) {
      throw new Error("InDesign App konnte nicht aufgeloest werden.");
    }
    return app;
  }

  function readCellText(cell) {
    return String(safeRead(function () {
      return cell && (
        cell.contents ||
        cell.texts && cell.texts[0] && cell.texts[0].contents ||
        ""
      ) || "";
    }) || "");
  }

  function addUniqueLabel(labels, value) {
    var text = String(value || "").trim();
    if (text && labels.indexOf(text) === -1) {
      labels.push(text);
    }
  }

  function readExtractLabel(item, key) {
    return String(safeRead(function () {
      return item && item.extractLabel && item.extractLabel(key);
    }) || "").trim();
  }

  function readInDesignLabels(item) {
    var extractLabelKeys = [
      "epg.exactFit.label",
      "epg.tableLabel",
      "epg.slotId",
      "epg.targetSlotId",
      "epg.probeSlotId",
      "epg.role"
    ];
    var labels = {
      label: String(safeRead(function () { return item && item.label; }) || "").trim(),
      name: String(safeRead(function () { return item && item.name; }) || "").trim(),
      scriptLabel: String(safeRead(function () { return item && item.scriptLabel; }) || "").trim(),
      extractLabels: {},
      all: []
    };

    extractLabelKeys.forEach(function (key) {
      labels.extractLabels[key] = readExtractLabel(item, key);
    });

    addUniqueLabel(labels.all, labels.label);
    addUniqueLabel(labels.all, labels.name);
    addUniqueLabel(labels.all, labels.scriptLabel);
    extractLabelKeys.forEach(function (key) {
      addUniqueLabel(labels.all, labels.extractLabels[key]);
    });

    return labels;
  }

  function readItemLabel(item) {
    var labels = readInDesignLabels(item);
    return labels.label || labels.name || labels.scriptLabel || labels.extractLabels["epg.exactFit.label"] || "";
  }

  function getPrimaryLabelValues(labels) {
    var values = [];
    addUniqueLabel(values, labels && labels.label);
    addUniqueLabel(values, labels && labels.name);
    addUniqueLabel(values, labels && labels.scriptLabel);
    addUniqueLabel(values, labels && labels.extractLabels && labels.extractLabels["epg.exactFit.label"]);
    addUniqueLabel(values, labels && labels.extractLabels && labels.extractLabels["epg.tableLabel"]);
    return values;
  }

  function isUsableInDesignObject(item) {
    var isValid;
    if (!item) {
      return false;
    }
    isValid = safeRead(function () {
      return item.isValid;
    });
    return isValid !== false;
  }

  function findCellByLabels(table, labels) {
    var wanted = asArray(labels).map(function (label) {
      return String(label || "").trim();
    }).filter(Boolean);
    var cells = collectionToArray(safeRead(function () { return table && table.cells; }));

    return cells.find(function (cell) {
      return wanted.indexOf(readItemLabel(cell)) !== -1;
    }) || null;
  }

  function getProbeMarkerCandidates(slotId) {
    var normalizedSlotId = String(slotId || "").trim();
    return [
      "{{EPG_PROBE:" + normalizedSlotId + "}}",
      "{{EPG-PROBE:" + normalizedSlotId + "}}",
      "{{EPG:probe." + normalizedSlotId + "}}",
      "{{EPG:" + normalizedSlotId + ".probe}}"
    ];
  }

  function getTargetLabelCandidates(slotId) {
    var normalizedSlotId = String(slotId || "").trim();
    var slugSlotId = normalizedSlotId.replace(/\./g, "-");
    return [
      "epg.target." + normalizedSlotId,
      "target." + normalizedSlotId,
      normalizedSlotId,
      "epg-target-" + slugSlotId
    ];
  }

  function findTargetCellByLabelsOrMarkers(table, slotId) {
    var candidates = getTargetLabelCandidates(slotId);
    var cells = collectionToArray(safeRead(function () { return table && table.cells; }));
    var diagnostics = {
      checkedCells: 0,
      targetLabelCandidates: candidates.slice(),
      foundLabels: []
    };
    var wantedMarker = "{{EPG:" + String(slotId || "").trim() + "}}";
    var markerCell = null;

    for (var index = 0; index < cells.length; index += 1) {
      var cell = cells[index];
      var labels = readInDesignLabels(cell);
      var primaryLabels = getPrimaryLabelValues(labels);
      diagnostics.checkedCells += 1;
      labels.all.forEach(function (label) {
        addUniqueLabel(diagnostics.foundLabels, label);
      });

      if (primaryLabels.some(function (label) { return candidates.indexOf(label) !== -1; })) {
        return {
          cell: cell,
          method: "target-label",
          diagnostics: diagnostics
        };
      }
      if (labels.extractLabels["epg.slotId"] === slotId) {
        return {
          cell: cell,
          method: "extractLabel:epg.slotId",
          diagnostics: diagnostics
        };
      }
      if (labels.extractLabels["epg.targetSlotId"] === slotId) {
        return {
          cell: cell,
          method: "extractLabel:epg.targetSlotId",
          diagnostics: diagnostics
        };
      }
      if (!markerCell && readCellText(cell).indexOf(wantedMarker) !== -1) {
        markerCell = cell;
      }
    }

    return {
      cell: markerCell,
      method: markerCell ? "marker" : "",
      diagnostics: diagnostics
    };
  }

  function findProbeCellByLabelsOrMarkers(tableOrTables, slotId) {
    var candidates = getProbeLabelCandidates(slotId);
    var wantedMarkers = getProbeMarkerCandidates(slotId);
    var tables = asArray(tableOrTables);
    var diagnostics = {
      checkedTables: 0,
      checkedCells: 0,
      probeLabelCandidates: candidates.slice(),
      foundLabels: []
    };
    var markerCell = null;

    for (var tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
      var table = tables[tableIndex];
      var cells = collectionToArray(safeRead(function () { return table && table.cells; }));
      diagnostics.checkedTables += 1;

      for (var cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
        var cell = cells[cellIndex];
        var labels = readInDesignLabels(cell);
        var primaryLabels = getPrimaryLabelValues(labels);
        var text = readCellText(cell);
        diagnostics.checkedCells += 1;
        labels.all.forEach(function (label) {
          addUniqueLabel(diagnostics.foundLabels, label);
        });

        if (primaryLabels.some(function (label) { return candidates.indexOf(label) !== -1; })) {
          return {
            cell: cell,
            method: "probe-label",
            diagnostics: diagnostics
          };
        }
        if (labels.extractLabels["epg.probeSlotId"] === slotId) {
          return {
            cell: cell,
            method: "extractLabel:epg.probeSlotId",
            diagnostics: diagnostics
          };
        }
        if (labels.extractLabels["epg.slotId"] === slotId && labels.extractLabels["epg.role"] === "probe") {
          return {
            cell: cell,
            method: "extractLabel:epg.slotId+epg.role",
            diagnostics: diagnostics
          };
        }
        if (!markerCell && wantedMarkers.some(function (marker) { return text.indexOf(marker) !== -1; })) {
          markerCell = cell;
        }
      }
    }

    return {
      cell: markerCell,
      method: markerCell ? "probe-marker" : "",
      diagnostics: diagnostics
    };
  }

  function findCellByLabelsOrProbeMarkers(table, slotId) {
    return findProbeCellByLabelsOrMarkers([table], slotId).cell;
  }

  function findCellByLabelsOrProbeMarkersInTables(tables, slotId) {
    return findProbeCellByLabelsOrMarkers(tables, slotId).cell;
  }

  function getProbeLabelCandidates(slotId) {
    var normalizedSlotId = String(slotId || "").trim();
    var slugSlotId = normalizedSlotId.replace(/\./g, "-");
    return [
      "epg.probe." + normalizedSlotId,
      normalizedSlotId + ".probe",
      "probe." + normalizedSlotId,
      "epg-probe-" + slugSlotId,
      slugSlotId + ".probe"
    ];
  }

  function inspectRuntimeCell(cell) {
    var text = cell && cell.texts && cell.texts[0] || null;
    var lines = collectionToArray(text && text.lines);
    var parentTextFrames = collectionToArray(text && text.parentTextFrames);
    var height = Number(cell && (cell.height || cell.visibleBounds && Math.abs(cell.visibleBounds[2] - cell.visibleBounds[0])));

    return {
      existingLineCount: lines.length,
      targetHeightPt: isFinite(height) && height > 0 ? height : 0,
      overset: parentTextFrames.some(function (frame) {
        return Boolean(frame && frame.overflows);
      })
    };
  }

  function createRuntimeSlotProfile(runtimeSlot) {
    var targetLayout = inspectRuntimeCell(runtimeSlot.targetCell);
    var probeLayout = inspectRuntimeCell(runtimeSlot.probeCell);
    var exactLineCount = Math.max(targetLayout.existingLineCount, probeLayout.existingLineCount);
    var targetHeightPt = targetLayout.targetHeightPt || probeLayout.targetHeightPt;

    if (!runtimeSlot.probeCell) {
      throw new Error(
        "Keine Probe-Zelle gefunden. Erwartete Script Labels: " +
        getProbeLabelCandidates(runtimeSlot.slotId).join(", ") +
        " oder Probe-Marker: " +
        getProbeMarkerCandidates(runtimeSlot.slotId).join(", ")
      );
    }
    if (runtimeSlot.probeCell === runtimeSlot.targetCell) {
      throw new Error("Probe-Zelle und Zielzelle duerfen nicht identisch sein.");
    }
    if (!exactLineCount || exactLineCount < 1) {
      throw new Error("SlotProfile nicht verifizierbar: keine Zielzeilen im Probe-/Zielkontext messbar.");
    }
    if (!targetHeightPt || targetHeightPt <= 0) {
      throw new Error("SlotProfile nicht verifizierbar: Zielhoehe fehlt.");
    }

    return {
      slotId: runtimeSlot.slotId,
      exactLineCount: exactLineCount,
      targetHeightPt: targetHeightPt,
      targetLayout: targetLayout,
      probeLayout: probeLayout
    };
  }

  function measureCandidateInProbe(runtimeSlot, slotProfile, candidateText) {
    var probeCell = runtimeSlot.probeCell;
    var previousContents = probeCell.contents;
    var layout;

    try {
      probeCell.contents = candidateText;
      layout = inspectRuntimeCell(probeCell);
      return {
        overset: layout.overset,
        composedLineCount: layout.existingLineCount,
        usedHeightPt: slotProfile.targetHeightPt * (layout.existingLineCount / slotProfile.exactLineCount),
        targetLineCount: slotProfile.exactLineCount,
        targetHeightPt: slotProfile.targetHeightPt,
        exactLineMatch: !layout.overset && layout.existingLineCount === slotProfile.exactLineCount,
        exactHeightMatch: !layout.overset && layout.existingLineCount === slotProfile.exactLineCount
      };
    } finally {
      probeCell.contents = previousContents;
    }
  }

  function getOrderedProgrammeVariants(programme, slotId) {
    var order = ["timeTitle", "micro", "short", "medium", "long"];
    var programmeForSlot = Object.assign({}, programme, {
      slotId: slotId
    });
    var variants = createProgrammeVariants(programmeForSlot);

    return order.map(function (level) {
      return variants.find(function (variant) {
        return variant.level === level;
      });
    }).filter(Boolean);
  }

  function createVariantCombinations(programmes, slotId, maxCombinations) {
    var variantLists = programmes.map(function (programme) {
      return getOrderedProgrammeVariants(programme, slotId);
    });
    var combinations = [];

    if (variantLists.some(function (variants) {
      return !variants.length;
    })) {
      return [];
    }

    function walk(index, selected) {
      if (combinations.length >= maxCombinations) {
        return;
      }
      if (index >= variantLists.length) {
        combinations.push(selected.slice());
        return;
      }
      variantLists[index].forEach(function (variant) {
        selected.push(variant);
        walk(index + 1, selected);
        selected.pop();
      });
    }

    walk(0, []);
    return combinations;
  }

  function solveRuntimeSlot(runtimeSlot, assignment) {
    var slotProfile = createRuntimeSlotProfile(runtimeSlot);
    var programmes = (assignment && assignment.programmes || []).slice().sort(function (left, right) {
      return String(left.startTime || "").localeCompare(String(right.startTime || ""), "de");
    });
    var combinations = createVariantCombinations(programmes, runtimeSlot.slotId, 60);
    var minimal;
    var minimalText;
    var minimalMeasure;
    var attemptCount = 0;

    if (!programmes.length) {
      throw new Error("Keine OriginalProgramme fuer Slot vorhanden.");
    }
    if (!combinations.length) {
      throw new Error("Keine source-pure Varianten fuer Slot vorhanden.");
    }

    minimal = combinations[0];
    minimalText = minimal.map(function (variant) {
      return variant.text;
    }).join("\n");
    minimalMeasure = measureCandidateInProbe(runtimeSlot, slotProfile, minimalText);
    attemptCount += 1;

    if (minimalMeasure.overset) {
      throw new Error("Minimalzustand timeTitle ueberfuellt den Slot. Kein Kuerzen erlaubt.");
    }

    for (var index = 0; index < combinations.length; index += 1) {
      var variants = combinations[index];
      var text = variants.map(function (variant) {
        return variant.text;
      }).join("\n");
      var measure = index === 0 ? minimalMeasure : measureCandidateInProbe(runtimeSlot, slotProfile, text);
      attemptCount += index === 0 ? 0 : 1;

      if (measure.exactLineMatch && !measure.overset) {
        return {
          slotId: runtimeSlot.slotId,
          finalText: text,
          finalMeasure: measure,
          exactFit: true,
          usedVariants: variants,
          rewriteCount: 0,
          runtimeSlot: runtimeSlot,
          attemptCount: attemptCount,
          qa: {
            noOverset: true,
            noUnderfill: true,
            allTextsSourcePure: variants.every(function (variant) {
              return variant.basedOnOriginalOnly === true;
            }),
            noTruncation: variants.every(function (variant) {
              return variant.hasNoTruncation === true && variant.text.indexOf("...") === -1;
            }),
            noArtificialPadding: true
          }
        };
      }
    }

    throw new Error("Keine exakt passende Kombination in " + attemptCount + " Probe-Messungen gefunden.");
  }

  function writeExactSolutionsToTargets(solutions) {
    var rollbackStack = [];

    try {
      solutions.forEach(function (solution) {
        var cell = solution.runtimeSlot.targetCell;
        var previousContents = cell.contents;

        rollbackStack.push({
          slotId: solution.slotId,
          cell: cell,
          previousContents: previousContents
        });

        cell.contents = solution.finalText;
        if (cell.contents !== solution.finalText) {
          throw new Error("Post-Check fehlgeschlagen fuer " + solution.slotId + ".");
        }
      });
    } catch (error) {
      rollbackStack.slice().reverse().forEach(function (entry) {
        try {
          entry.cell.contents = entry.previousContents;
        } catch (rollbackError) {
          log("ROLLBACK-FEHLER " + entry.slotId + ": " + rollbackError.message);
        }
      });
      throw error;
    }

    return rollbackStack.length;
  }

  function extractEpgMarkersFromText(text) {
    var source = String(text || "");
    var pattern = /\{\{(EPG|EPG_PROBE):([a-zA-Z0-9_.-]+)\}\}/g;
    var result = [];
    var match;

    pattern.lastIndex = 0;
    match = pattern.exec(source);

    while (match) {
      result.push({
        raw: match[0],
        slotId: match[2],
        markerType: match[1],
        markerRole: match[1] === "EPG_PROBE" ? "probe" : "target"
      });
      match = pattern.exec(source);
    }

    return result;
  }

  function slotIdFromTargetLabelValue(value) {
    var text = String(value || "").trim();
    var match;
    if (!text) {
      return "";
    }
    match = text.match(/^epg\.target\.([a-zA-Z0-9_.-]+)$/);
    if (match) {
      return match[1];
    }
    match = text.match(/^target\.([a-zA-Z0-9_.-]+)$/);
    if (match) {
      return match[1];
    }
    match = text.match(/^epg-target-([a-zA-Z0-9-]+)$/);
    if (match) {
      return match[1].replace(/-/g, ".");
    }
    if (/^[a-zA-Z0-9]+(?:\.[a-zA-Z0-9_-]+){2,}$/.test(text)) {
      return text;
    }
    return "";
  }

  function scanTableForEpgMarkers(table) {
    var cells = collectionToArray(safeRead(function () { return table && table.cells; }));
    var slots = [];

    cells.forEach(function (cell, index) {
      var text = readCellText(cell);
      extractEpgMarkersFromText(text).forEach(function (marker) {
        slots.push({
          raw: marker.raw,
          slotId: marker.slotId,
          cellIndex: index,
          text: text,
          source: "marker",
          targetCell: cell
        });
      });
    });

    return slots;
  }

  function scanTableForEpgSlotLabels(table) {
    var cells = collectionToArray(safeRead(function () { return table && table.cells; }));
    var slots = [];

    cells.forEach(function (cell, index) {
      var labels = readInDesignLabels(cell);
      var text = readCellText(cell);
      var slotId = labels.extractLabels["epg.targetSlotId"] || "";
      var source = slotId ? "extractLabel:epg.targetSlotId" : "";

      if (!slotId && labels.extractLabels["epg.slotId"]) {
        slotId = labels.extractLabels["epg.slotId"];
        source = "extractLabel:epg.slotId";
      }
      if (!slotId) {
        getPrimaryLabelValues(labels).some(function (label) {
          var parsedSlotId = slotIdFromTargetLabelValue(label);
          if (parsedSlotId) {
            slotId = parsedSlotId;
            source = "label";
            return true;
          }
          return false;
        });
      }
      if (slotId) {
        slots.push({
          raw: "",
          slotId: slotId,
          cellIndex: index,
          text: text,
          source: source || "label",
          targetCell: cell
        });
      }
    });

    return slots;
  }

  function dedupeSlotScans(slots) {
    var seen = {};
    return asArray(slots).filter(function (slot) {
      var key = String(slot && slot.slotId || "") + "::" + String(slot && slot.cellIndex || 0);
      if (!slot || !slot.slotId || seen[key]) {
        return false;
      }
      seen[key] = true;
      return true;
    });
  }

  function getLayoutTableLabelCandidates(preferredTableLabel) {
    var labels = [];
    addUniqueLabel(labels, preferredTableLabel || "epg-target-table");
    addUniqueLabel(labels, "epg-target-table");
    addUniqueLabel(labels, "epg-probe-table");
    return labels;
  }

  function scanDocumentForEpgMarkers(app, preferredTableLabel) {
    var documentRef = app && app.activeDocument;
    if (!documentRef) {
      throw new Error("Kein aktives InDesign-Dokument gefunden.");
    }

    var seenTables = [];
    var seenItems = [];
    var tableResults = [];
    var allScannedTables = [];
    var wantedTableLabels = getLayoutTableLabelCandidates(preferredTableLabel);
    var diagnostics = {
      stories: collectionToArray(safeRead(function () { return documentRef.stories; })).length,
      textFrames: collectionToArray(safeRead(function () { return documentRef.textFrames; })).length,
      pageItems: collectionToArray(safeRead(function () { return documentRef.pageItems; })).length,
      allPageItems: collectionToArray(safeRead(function () { return documentRef.allPageItems; })).length,
      appSelection: collectionToArray(safeRead(function () { return app.selection; })).length,
      documentTables: collectionLength(safeRead(function () { return documentRef.tables; })),
      documentAllTables: collectionLength(safeRead(function () { return documentRef.allTables; })),
      storyTables: 0,
      textFrameTables: 0,
      pageItemTables: 0,
      selectionTables: 0,
      parentTables: 0,
      labelledItems: 0,
      labelledItemsFound: false,
      labelledItemsFoundButNoSlots: false,
      labelledTableLabels: wantedTableLabels.slice(),
      slotsFromMarkers: 0,
      slotsFromLabels: 0,
      targetCellsFromLabels: 0,
      probeCellsFromLabels: 0,
      invalidObjects: 0,
      scanErrors: 0,
      candidates: 0
    };

    function scanTable(table, source) {
      if (!isUsableInDesignObject(table)) {
        diagnostics.invalidObjects += 1;
        return;
      }
      if (seenTables.indexOf(table) !== -1) {
        return;
      }
      seenTables.push(table);
      allScannedTables.push(table);
      diagnostics.candidates += 1;
      if (diagnostics[source] !== undefined) {
        diagnostics[source] += 1;
      }
      try {
        var markerSlots = scanTableForEpgMarkers(table);
        var labelSlots = scanTableForEpgSlotLabels(table);
        var slots = dedupeSlotScans(markerSlots.concat(labelSlots));
        diagnostics.slotsFromMarkers += markerSlots.length;
        diagnostics.slotsFromLabels += labelSlots.length;
        if (slots.length) {
          tableResults.push({
            table: table,
            slots: slots
          });
        }
      } catch (error) {
        diagnostics.scanErrors += 1;
      }
    }

    function collectTablesFromItem(item) {
      if (!isUsableInDesignObject(item)) {
        diagnostics.invalidObjects += 1;
        return;
      }
      if (seenItems.indexOf(item) !== -1) {
        return;
      }
      seenItems.push(item);
      if (safeRead(function () { return item.cells; })) {
        scanTable(item, "parentTables");
      }
      collectionToArray(safeRead(function () { return item.tables; })).forEach(function (table) {
        scanTable(table, "parentTables");
      });
      collectionToArray(safeRead(function () { return item.allTables; })).forEach(function (table) {
        scanTable(table, "parentTables");
      });
      collectionToArray(safeRead(function () { return item.parent && item.parent.tables; })).forEach(function (table) {
        scanTable(table, "parentTables");
      });
      collectionToArray(safeRead(function () { return item.parentStory && item.parentStory.tables; })).forEach(function (table) {
        scanTable(table, "parentTables");
      });
      collectionToArray(safeRead(function () { return item.parentStory && item.parentStory.allTables; })).forEach(function (table) {
        scanTable(table, "parentTables");
      });
      collectionToArray(safeRead(function () { return item.texts && item.texts[0] && item.texts[0].parentStory && item.texts[0].parentStory.tables; })).forEach(function (table) {
        scanTable(table, "parentTables");
      });
      collectionToArray(safeRead(function () { return item.texts && item.texts[0] && item.texts[0].parentTextFrames; })).forEach(function (textFrame) {
        collectTablesFromItem(textFrame);
      });
      collectionToArray(safeRead(function () { return item.textContainers; })).forEach(function (textContainer) {
        collectTablesFromItem(textContainer);
      });
    }

    function collectLabelledItems(items) {
      if (!wantedTableLabels.length) {
        return [];
      }
      return collectionToArray(items).filter(function (item) {
        var itemLabels = readInDesignLabels(item).all;
        return isUsableInDesignObject(item) && wantedTableLabels.some(function (wantedLabel) {
          return itemLabels.indexOf(wantedLabel) !== -1;
        });
      });
    }

    function scanLabelledItems() {
      var labelledItems = [];
      labelledItems = labelledItems.concat(collectLabelledItems(safeRead(function () { return documentRef.pageItems; })));
      labelledItems = labelledItems.concat(collectLabelledItems(safeRead(function () { return documentRef.allPageItems; })));
      labelledItems = labelledItems.concat(collectLabelledItems(safeRead(function () { return app.selection; })));

      labelledItems.forEach(function (item) {
        diagnostics.labelledItems += 1;
        collectTablesFromItem(item);
      });
    }

    scanLabelledItems();

    if (diagnostics.labelledItems > 0) {
      diagnostics.labelledItemsFound = true;
      if (tableResults.length > 0) {
        tableResults.diagnostics = diagnostics;
        tableResults.allTables = allScannedTables.slice();
        return tableResults;
      } else {
        diagnostics.labelledItemsFoundButNoSlots = true;
      }
    }

    collectionToArray(safeRead(function () { return documentRef.tables; })).forEach(function (table) {
      scanTable(table, "documentTables");
    });

    collectionToArray(safeRead(function () { return documentRef.allTables; })).forEach(function (table) {
      scanTable(table, "documentAllTables");
    });

    collectionToArray(safeRead(function () { return documentRef.stories; })).forEach(function (story) {
      collectionToArray(safeRead(function () { return story.tables; })).forEach(function (table) {
        scanTable(table, "storyTables");
      });
      collectionToArray(safeRead(function () { return story.allTables; })).forEach(function (table) {
        scanTable(table, "storyTables");
      });
      collectTablesFromItem(story);
    });

    collectionToArray(safeRead(function () { return documentRef.textFrames; })).forEach(function (textFrame) {
      collectionToArray(safeRead(function () { return textFrame.tables; })).forEach(function (table) {
        scanTable(table, "textFrameTables");
      });
      collectTablesFromItem(textFrame);
    });

    collectionToArray(safeRead(function () { return documentRef.pageItems; })).forEach(function (pageItem) {
      collectionToArray(safeRead(function () { return pageItem.tables; })).forEach(function (table) {
        scanTable(table, "pageItemTables");
      });
      collectTablesFromItem(pageItem);
    });

    collectionToArray(safeRead(function () { return documentRef.allPageItems; })).forEach(function (pageItem) {
      collectionToArray(safeRead(function () { return pageItem.tables; })).forEach(function (table) {
        scanTable(table, "pageItemTables");
      });
      collectTablesFromItem(pageItem);
    });

    collectionToArray(safeRead(function () { return app.selection; })).forEach(function (selectedItem) {
      collectionToArray(safeRead(function () { return selectedItem.tables; })).forEach(function (table) {
        scanTable(table, "selectionTables");
      });
      collectTablesFromItem(selectedItem);
    });

    tableResults.diagnostics = diagnostics;
    tableResults.allTables = allScannedTables.slice();
    return tableResults;
  }

  function bindEvents() {
    var clearButton = $("clearLogButton");
    var copyButton = $("copyLogButton");
    var selectedDate = $("selectedDate");
    var dateShortcut = $("dateShortcut");
    var apiKey = $("apiKey");
    var tableLabel = $("tableLabel");
    var saveSettingsButton = $("saveSettingsButton");

    safeBind("btnStart", "start");
    safeBind("btnInspectLayout", "inspect");
    safeBind("btnFill", "fill");
    safeBind("btnCorrect", "correct");
    safeBind("btnLoad", "load");
    safeBind("btnPing", "ping");
    log("Actionbuttons gebunden.");

    if (clearButton) {
      clearButton.addEventListener("click", function () {
        state.logEntries = [];
        persistLogEntries();
        render();
      });
    }

    if (copyButton) {
      copyButton.addEventListener("click", copyLogToClipboard);
    }

    var logOutput = $("logOutput");
    if (logOutput) {
      logOutput.addEventListener("input", function () {
        logOutput.value = state.logEntries.join("\n");
      });
    }

    if (selectedDate) {
      selectedDate.addEventListener("input", function (event) {
        state.selectedDate = String(event.target.value || "");
        state.dateShortcut = "";
        render();
      });
    }

    if (dateShortcut) {
      dateShortcut.addEventListener("change", function (event) {
        var shortcut = String(event.target.value || "");
        var nextDate = getDateByShortcut(shortcut);
        state.dateShortcut = shortcut;
        if (nextDate) {
          state.selectedDate = nextDate;
          log("Datum per Schnellauswahl gesetzt: " + nextDate);
        }
        render();
      });
    }

    if (apiKey) {
      apiKey.addEventListener("input", function (event) {
        state.apiKey = String(event.target.value || "");
      });
    }

    if (tableLabel) {
      tableLabel.addEventListener("input", function (event) {
        state.tableLabel = String(event.target.value || "");
      });
    }

    if (saveSettingsButton) {
      saveSettingsButton.addEventListener("click", saveSettings);
    }

  }

  function copyLogToClipboard() {
    var logOutput = $("logOutput");
    var text = state.logEntries.join("\n");

    if (!logOutput) {
      log("Logfeld nicht gefunden.");
      return;
    }

    function fallbackCopy() {
      try {
        logOutput.focus();
        logOutput.select();
        if (document.execCommand && document.execCommand("copy")) {
          return;
        }
      } catch (error) {
        // Keep the textarea selection available for manual Cmd+C in UXP hosts.
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        log("Log in Zwischenablage kopiert.");
      }).catch(function () {
        fallbackCopy();
      });
      return;
    }

    fallbackCopy();
  }

  function saveSettings() {
    writeSetting("epgExactFit.apiKey", state.apiKey);
    writeSetting("epgExactFit.tableLabel", state.tableLabel);
    log("Settings gespeichert. API Key: " + (state.apiKey ? "gesetzt" : "leer") + "; Script Label: " + (state.tableLabel || "<leer>"));
  }

  function handleTableFillProbe() {
    var count = Array.isArray(state.programmes) ? state.programmes.length : 0;
    var channelCount = Array.isArray(state.channelResults) ? state.channelResults.length : 0;
    var originalCount = Array.isArray(state.originalProgrammes) ? state.originalProgrammes.length : 0;
    var variantCount = Array.isArray(state.programmeVariants) ? state.programmeVariants.length : 0;
    var slotCount = state.slotGroups ? Object.keys(state.slotGroups).length : 0;
    var runtimeSlotsById = {};
    var solutions = [];
    var failures = [];

    if (state.isFillingTable || state.isLayoutInspecting) {
      log("Tabelle befuellen ignoriert: Eine InDesign-Aktion laeuft bereits.");
      return;
    }

    state.isFillingTable = true;
    render();

    log("Tabelle befuellen gedrueckt.");
    log("Aktueller Datenstand: " + count + " Programme aus " + channelCount + " Senderanfragen.");
    log("Vorbereitung: " + originalCount + " OriginalProgramme, " + slotCount + " Slotgruppen, " + variantCount + " Varianten.");

    if (!count) {
      log("Keine Programmdaten im Speicher. Bitte zuerst Daten laden / Start ausfuehren.");
      state.isFillingTable = false;
      render();
      return;
    }

    if (!Array.isArray(state.slotCandidates) || !state.slotCandidates.length) {
      var bindingCounts = countBindingStatuses(state.layoutSlots);
      var firstBlocker = getFirstBindingBlocker(state.layoutSlots);
      log("Keine Slot-Kandidaten vorhanden. Bitte zuerst Layout pruefen ausfuehren.");
      log("Binding-Stand: layoutSlots=" + asArray(state.layoutSlots).length + ", slotAssignments=" + asArray(state.slotAssignments).length + ", READY=" + bindingCounts.READY + ".");
      if (firstBlocker) {
        log("Erster Binding-Blocker: " + firstBlocker.slotId + " | " + firstBlocker.bindingStatus + " | target=" + (firstBlocker.targetCell ? "gefunden" : "fehlt") + " via " + (firstBlocker.targetResolutionMethod || "-") + ", probe=" + (firstBlocker.probeCell && firstBlocker.probeCell !== firstBlocker.targetCell ? "gefunden" : "fehlt") + " via " + (firstBlocker.probeResolutionMethod || "-") + ", programmes=" + (firstBlocker.programmeCount || 0) + ".");
      }
      if (state.lastLayoutError) {
        log("Letzte Layoutpruefung fehlgeschlagen: " + state.lastLayoutError);
      }
      if (isInDesignHostGuardActive()) {
        logInDesignHostGuard("Tabelle befuellen");
      }
      state.isFillingTable = false;
      render();
      return;
    }

    state.layoutSlots.forEach(function (slot) {
      if (slot && slot.slotId && slot.table && slot.targetCell) {
        runtimeSlotsById[slot.slotId] = slot;
      }
    });

    log("Starte Probe-/Solver-Lauf fuer " + state.slotCandidates.length + " Slot-Kandidat(en). Es wird erst nach vollstaendigem exactFit geschrieben.");
    setStatus("loading", "Status: Probe misst Kandidaten...");
    setProgress(5, "Solver startet");

    state.slotCandidates.forEach(function (candidate, index) {
      var runtimeSlot = runtimeSlotsById[candidate.slotId];
      var assignment = state.slotAssignments.find(function (entry) {
        return entry.slotId === candidate.slotId;
      });

      setProgress(5 + Math.floor((index / Math.max(state.slotCandidates.length, 1)) * 80), "Messe " + candidate.slotId);

      if (!runtimeSlot) {
        failures.push({
          slotId: candidate.slotId,
          error: "Keine Zielzelle aus Layoutscan gefunden."
        });
        return;
      }

      try {
        var solution = solveRuntimeSlot(runtimeSlot, assignment);
        solutions.push(solution);
        log("exactFit " + candidate.slotId + ": " + solution.finalMeasure.composedLineCount + "/" + solution.finalMeasure.targetLineCount + " Zeilen, " + solution.usedVariants.length + " Varianten, " + solution.attemptCount + " Probe-Messung(en).");
      } catch (error) {
        failures.push({
          slotId: candidate.slotId,
          error: error && error.message ? error.message : String(error)
        });
        log("BLOCKIERT " + candidate.slotId + ": " + (error && error.message ? error.message : String(error)));
      }
    });

    state.slotSolutions = solutions;
    state.solveFailures = failures;

    if (failures.length) {
      log("Final Writer bleibt gesperrt: " + solutions.length + "/" + state.slotCandidates.length + " Slot(s) exactFit, " + failures.length + " blockiert.");
      log("Erster Blocker: " + failures[0].slotId + " | " + failures[0].error);
      failures.slice(0, 10).forEach(function (failure) {
        log("Solver-Blocker: " + failure.slotId + " | " + failure.error);
      });
      setProgress(100, "Gesperrt");
      setStatus("error", "Status: Solver blockiert - keine Tabelle geschrieben");
      state.isFillingTable = false;
      render();
      return;
    }

    try {
      var writtenCount = writeExactSolutionsToTargets(solutions);
      log("Final Writer abgeschlossen: " + writtenCount + " Slot(s) all-or-nothing in die Tabelle geschrieben.");
      setProgress(100, "Geschrieben");
      setStatus("success", "Status: Tabelle befuellt");
    } catch (error) {
      log("WRITE-FEHLER: " + (error && error.message ? error.message : String(error)));
      log("Alle bereits geschriebenen Slots wurden per Rollback zurueckgesetzt, sofern InDesign den Zugriff erlaubt hat.");
      setProgress(100, "Write fehlgeschlagen");
      setStatus("error", "Status: Schreiben fehlgeschlagen");
    }
    state.isFillingTable = false;
    render();
  }

  function handleLayoutInspectStatus() {
    if (state.isLayoutInspecting || state.isFillingTable) {
      log("Layout pruefen ignoriert: Eine InDesign-Aktion laeuft bereits.");
      return;
    }

    state.isLayoutInspecting = true;
    render();

    log("Layout pruefen gestartet.");
    log("Scanne bestehende InDesign-Tabelle nach {{EPG:...}} Markern. Es wird nichts geschrieben.");

    try {
      var app = getInDesignApp();
      var tables = scanDocumentForEpgMarkers(app, state.tableLabel || "epg-target-table");
      var scannedTables = [];
      var seenSlotIds = {};
      var slotAssignmentsById = {};
      var bindingCounts;
      var readyAssignments;
      (tables.allTables && tables.allTables.length ? tables.allTables : tables.map(function (tableResult) {
        return tableResult && tableResult.table;
      })).forEach(function (table) {
        if (table && scannedTables.indexOf(table) === -1) {
          scannedTables.push(table);
        }
      });
      var slots = tables.reduce(function (all, tableResult) {
        return all.concat(tableResult.slots.map(function (slot) {
          var targetResolution = findTargetCellByLabelsOrMarkers(tableResult.table, slot.slotId);
          var probeResolution = findProbeCellByLabelsOrMarkers(scannedTables, slot.slotId);
          if (tables.diagnostics) {
            if (targetResolution.method && targetResolution.method !== "marker") {
              tables.diagnostics.targetCellsFromLabels += 1;
            }
            if (probeResolution.method && probeResolution.method !== "probe-marker") {
              tables.diagnostics.probeCellsFromLabels += 1;
            }
          }
          return Object.assign({}, slot, {
            table: tableResult.table,
            targetCell: targetResolution.cell,
            probeCell: probeResolution.cell,
            targetResolutionMethod: targetResolution.method,
            probeResolutionMethod: probeResolution.method,
            bindingDiagnostics: {
              target: targetResolution.diagnostics,
              probe: probeResolution.diagnostics
            }
          });
        }));
      }, []);
      var uniqueSlotIds = [];

      slots.forEach(function (slot) {
        if (slot && slot.slotId && uniqueSlotIds.indexOf(slot.slotId) === -1) {
          uniqueSlotIds.push(slot.slotId);
        }
      });

      state.slotAssignments = Array.isArray(state.originalProgrammes) && state.originalProgrammes.length
        ? assignProgrammesToMarkerSlots(state.originalProgrammes, uniqueSlotIds)
        : [];
      state.slotAssignments.forEach(function (assignment) {
        slotAssignmentsById[assignment.slotId] = assignment;
      });

      slots = slots.filter(function (slot) {
        if (!slot || !slot.slotId || seenSlotIds[slot.slotId]) {
          return false;
        }
        seenSlotIds[slot.slotId] = true;
        return true;
      }).map(function (slot) {
        var assignment = slotAssignmentsById[slot.slotId] || null;
        var parsed = parseEpgSlotId(slot.slotId);
        var hasKnownSlotProfile = Boolean(getSlotWindow(parsed.slotName));
        var programmeCount = assignment && Array.isArray(assignment.programmes) ? assignment.programmes.length : 0;
        var bindingStatus = "READY";

        if (!slot.targetCell) {
          bindingStatus = "BLOCKED_NO_TARGET";
        } else if (!slot.probeCell || slot.probeCell === slot.targetCell) {
          bindingStatus = "BLOCKED_NO_PROBE";
        } else if (!hasKnownSlotProfile) {
          bindingStatus = "BLOCKED_UNKNOWN_SLOT_PROFILE";
        } else if (!programmeCount) {
          bindingStatus = "BLOCKED_NO_PROGRAMMES";
        }

        return Object.assign({}, slot, {
          assignment: assignment,
          programmeCount: programmeCount,
          bindingStatus: bindingStatus
        });
      });

      bindingCounts = countBindingStatuses(slots);
      readyAssignments = slots.filter(function (slot) {
        return slot.bindingStatus === "READY";
      }).map(function (slot) {
        return slot.assignment;
      }).filter(Boolean);

      state.layoutScan = {
        tableCount: tables.length,
        markerCount: slots.length,
        uniqueSlotCount: uniqueSlotIds.length,
        diagnostics: tables.diagnostics || null,
        bindingCounts: bindingCounts
      };
      state.layoutSlots = slots;
      state.slotCandidates = prepareSlotCandidates(readyAssignments);

      log("Layoutscan abgeschlossen: " + tables.length + " Tabelle(n), " + slots.length + " Marker, " + uniqueSlotIds.length + " eindeutige Slots.");
      uniqueSlotIds.slice(0, 30).forEach(function (slotId, index) {
        log("Slot " + (index + 1) + ": " + slotId);
      });
      if (uniqueSlotIds.length > 30) {
        log("Weitere " + (uniqueSlotIds.length - 30) + " Slotmarker erkannt; vollstaendige Slot-Bindings folgen in den Slot-Statuszeilen.");
      }
      if (!slots.length && tables.diagnostics) {
        log("Diagnose: Stories " + tables.diagnostics.stories + ", TextFrames " + tables.diagnostics.textFrames + ", PageItems " + tables.diagnostics.pageItems + ", AllPageItems " + tables.diagnostics.allPageItems + ", Auswahl " + tables.diagnostics.appSelection + ", Tabellenkandidaten " + tables.diagnostics.candidates + ".");
        log("Tabellenpfade: label='" + (state.tableLabel || "epg-target-table") + "', labelledItems=" + tables.diagnostics.labelledItems + ", labelledItemsFoundButNoSlots=" + tables.diagnostics.labelledItemsFoundButNoSlots + ", document.tables=" + tables.diagnostics.documentTables + ", document.allTables=" + tables.diagnostics.documentAllTables + ", storyTables=" + tables.diagnostics.storyTables + ", textFrameTables=" + tables.diagnostics.textFrameTables + ", pageItemTables=" + tables.diagnostics.pageItemTables + ", selectionTables=" + tables.diagnostics.selectionTables + ", parentTables=" + tables.diagnostics.parentTables + ", invalid=" + tables.diagnostics.invalidObjects + ", scanErrors=" + tables.diagnostics.scanErrors + ".");
      }
      if (tables.diagnostics) {
        log("Slotquellen: marker=" + tables.diagnostics.slotsFromMarkers + ", labels=" + tables.diagnostics.slotsFromLabels + ", targetLabelResolutions=" + tables.diagnostics.targetCellsFromLabels + ", probeLabelResolutions=" + tables.diagnostics.probeCellsFromLabels + ".");
      }
      log("Layout Binding: Tabellen " + tables.length + ", Slots gesamt " + slots.length + ", READY " + bindingCounts.READY + ", BLOCKED_NO_TARGET " + bindingCounts.BLOCKED_NO_TARGET + ", BLOCKED_NO_PROBE " + bindingCounts.BLOCKED_NO_PROBE + ", BLOCKED_NO_PROGRAMMES " + bindingCounts.BLOCKED_NO_PROGRAMMES + ", BLOCKED_UNKNOWN_SLOT_PROFILE " + bindingCounts.BLOCKED_UNKNOWN_SLOT_PROFILE + ".");
      slots.forEach(function (slot) {
        log("Slot " + slot.slotId + ": target=" + (slot.targetCell ? "gefunden" : "fehlt") + " via " + (slot.targetResolutionMethod || "-") + ", probe=" + (slot.probeCell && slot.probeCell !== slot.targetCell ? "gefunden" : "fehlt") + " via " + (slot.probeResolutionMethod || "-") + ", programmes=" + slot.programmeCount + ", bindingStatus=" + slot.bindingStatus);
      });
      if (state.slotAssignments.length) {
        var contentAssignments = state.slotAssignments.filter(function (assignment) {
          return assignment.isContentSlot;
        });
        var filledAssignments = contentAssignments.filter(function (assignment) {
          return assignment.programmes.length > 0;
        });
        log("Slot-Zuordnung vorbereitet: " + filledAssignments.length + "/" + contentAssignments.length + " Content-Slots mit Programmen.");
        contentAssignments.forEach(function (assignment) {
          log("Zuordnung " + assignment.slotId + ": " + assignment.programmes.length + " Programme");
        });
        if (state.slotCandidates.length) {
          var previewCandidate = state.slotCandidates.find(function (candidate) {
            return candidate.slotId === "top.ard.primeMain";
          }) || state.slotCandidates[0];
          log("Slot-Kandidaten vorbereitet: " + state.slotCandidates.length + " Kandidat(en), noch ungemessen.");
          log("Kandidat-Preview " + previewCandidate.slotId + ": " + previewCandidate.orderedProgrammeIds.length + " Programme, " + Object.keys(previewCandidate.chosenVariantByProgrammeId).length + " timeTitle-Varianten.");
          previewCandidate.concatenatedText.split("\n").slice(0, 8).forEach(function (line) {
            log("Preview: " + line);
          });
          if (previewCandidate.orderedProgrammeIds.length > 8) {
            log("Preview gekuerzt: weitere " + (previewCandidate.orderedProgrammeIds.length - 8) + " Zeile(n) im Kandidaten.");
          }
        } else if (slots.length) {
          var firstBlocker = getFirstBindingBlocker(slots);
          log("Keine Slot-Kandidaten vorbereitet: " + bindingCounts.READY + " READY Binding(s), erster Blocker: " + (firstBlocker ? firstBlocker.slotId + " | " + firstBlocker.bindingStatus : "keiner") + ".");
        }
      } else if (uniqueSlotIds.length) {
        log("Slot-Zuordnung noch nicht moeglich: Bitte zuerst Daten laden / Start ausfuehren.");
      }

      clearLayoutError();
      setStatus("success", "Status: Layoutmarker erkannt");
    } catch (error) {
      var layoutErrorMessage = markLayoutError(error);
      log("LAYOUT-FEHLER: " + layoutErrorMessage);
      if (isInDesignHostBusyError(error)) {
        log("Diagnose: InDesign hat den DOM-Zugriff abgewiesen, obwohl der Button angekommen ist. Bitte Plugin/Dokument kurz zur Ruhe kommen lassen; falls es erneut passiert, InDesign komplett neu starten und danach Layout pruefen erneut klicken.");
      }
      setStatus("error", "Status: Layoutpruefung fehlgeschlagen");
    }
    state.isLayoutInspecting = false;
    render();
  }

  function handleStart() {
    if (state.isLoading) {
      log("Start laeuft bereits.");
      return;
    }

    state.isLoading = true;
    render();

    log("Start-Button gedrueckt");
    log("Initialisierung beginnt...");
    setStatus("loading", "Status: Initialisierung laeuft...");
    setProgress(5, "MCP wird initialisiert...");

    delay(50).then(function () {
      var client = createMcpClient();
      var completedChannels = 0;
      var totalChannels = Math.max(state.channels.length, 1);

      log("Starte MCP Initialisierung");
      return client.initialize()
        .then(function () {
          setProgress(15, "Tools werden geladen...");
          return delay(50);
        })
        .then(function () {
          log("Lade MCP Tools");
          return client.listTools();
        })
        .then(function (tools) {
          var toolList = Array.isArray(tools && tools.tools) ? tools.tools : [];
          log("MCP Tools geladen: " + toolList.length);
          setProgress(30, "Sender werden geladen...");
          return delay(50);
        })
        .then(function () {
          log("Lade Programme...");
          return fetchProgrammes(client, {
            date: state.selectedDate,
            channels: state.channels,
            onProgress: function (event) {
              if (event && event.message) {
                log(event.message);
              }

              if (event && event.message && event.message.indexOf("Lade ") === 0) {
                setProgress(
                  30 + Math.floor((completedChannels / totalChannels) * 60),
                  event.message.replace(/\.+$/, "")
                );
              }

              if (event && event.message && (
                event.message.indexOf("Sendungen geladen") !== -1 ||
                event.message.indexOf("keine Sendungen gefunden") !== -1
              )) {
                completedChannels += 1;
                setProgress(
                  30 + Math.floor((completedChannels / totalChannels) * 60),
                  "Sender " + completedChannels + "/" + totalChannels
                );
              }
            }
          });
        })
        .then(function (result) {
          state.programmes = result.programmes;
          state.channelResults = result.channels;
          var slotPipeline = prepareSlotPipeline(result.programmes);
          state.originalProgrammes = slotPipeline.originalProgrammes;
          state.slotGroups = slotPipeline.slotGroups;
          state.programmeVariants = slotPipeline.programmeVariants;

          log("EPG Daten geladen: " + result.programmes.length + " Sendungen.");
          log("OriginalProgramme erzeugt: " + state.originalProgrammes.length + ".");
          log("Slotgruppen vorbereitet: " + Object.keys(state.slotGroups).length + ".");
          log("Source-pure Varianten erzeugt: " + state.programmeVariants.length + ".");
          result.channels.forEach(function (channelResult) {
            var count = channelResult.ok ? channelResult.count : 0;
            var suffix = channelResult.ok ? "" : " (" + (channelResult.error || "keine Daten") + ")";
            log(channelResult.label + ": " + count + " Sendungen" + suffix);
          });

          setProgress(95, "Finalisierung...");
          return delay(50).then(function () {
            log("Gesamt Programme: " + result.programmes.length);
            log("Programmdetails bleiben im Speicher; Hauptlog zeigt ab jetzt Diagnose fuer Layout Binding und Solver.");
            setProgress(100, "Fertig");
            setStatus("success", "Status: Daten erfolgreich geladen");
          });
        });
    }).catch(function (error) {
      log("FEHLER: " + (error && error.message ? error.message : String(error)));
      setStatus("error", "Status: Fehler beim Laden");
    }).then(function () {
      state.isLoading = false;
      render();
    }, function (error) {
      state.isLoading = false;
      render();
      throw error;
    });
  }

  function initializeApp() {
    try {
      document.body.innerHTML =
        '<div style="padding:10px;font-family:sans-serif">' +
        '<h2>EPG Plugin (Recovery Mode)</h2>' +
        '<button id="btnPing" type="button">Ping</button>' +
        '<div id="log" style="margin-top:8px;white-space:pre-wrap;"></div>' +
        '</div>';

      var pingButton = document.getElementById("btnPing");
      var logBox = document.getElementById("log");

      if (pingButton) {
        pingButton.onclick = function () {
          if (logBox) {
            logBox.innerHTML += "<div>Ping OK</div>";
          }
          console.log("[EPG] PING OK");
        };
      }

      console.log("[EPG] BOOT START");
      if (logBox) {
        logBox.innerHTML += "<div>BOOT START</div>";
      }
      console.log("[EPG] BOOT DONE");
      if (logBox) {
        logBox.innerHTML += "<div>BOOT DONE</div>";
      }
    } catch (e) {
      console.error("INIT FAIL", e);
      try {
        document.body.innerHTML =
          "<div style='font-family:sans-serif;padding:10px'>" +
          "<h2>EPG Plugin Fehler</h2>" +
          "<pre>" + escapeHtml(e && e.message || e) + "</pre>" +
          "</div>";
      } catch (displayError) {
        console.error("INIT FAIL DISPLAY", displayError);
      }
    }
  }

  function boot() {
    try {
      initializeApp();
    } catch (error) {
      safeConsoleError("Boot failed", error);
      showFatalBootError(error);
    }
  }

  if (typeof document === "undefined") {
    showFatalBootError(new Error("Dokument-Objekt ist beim Plugin-Boot nicht verfuegbar."));
  } else if (document.readyState === "loading" && typeof document.addEventListener === "function") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  } catch (error) {
    console.error("[EPG] FATAL ERROR", error);

    try {
      document.body.innerHTML =
        "<div style='font-family:sans-serif;padding:10px'>" +
        "<h2>EPG Plugin Fehler</h2>" +
        "<pre>" + (error && error.message || error) + "</pre>" +
        "</div>";
    } catch (e) {}
  }
}());
