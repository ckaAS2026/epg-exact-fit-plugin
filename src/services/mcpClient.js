import { DEFAULT_MCP_ENDPOINT } from "../config/appDefaults.js";

const DEFAULT_PROTOCOLS = Object.freeze(["2025-03-26", "2024-11-05"]);
const REQUEST_TIMEOUT_MS = 15000;

const stripStreamFlag = (endpoint) => String(endpoint || "")
  .trim()
  .replace(/[?&]stream=true(?=&|$)/g, "")
  .replace(/[?&]$/, "")
  .replace(/\?&/, "?");

const parseSse = (text) => String(text || "")
  .split(/\n\n+/)
  .flatMap((event) => event.split("\n").filter((line) => line.startsWith("data:")))
  .map((line) => line.slice(5).trim())
  .filter((line) => line && line !== "[DONE]")
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      return null;
    }
  })
  .filter(Boolean);

const parseBody = (rawText, contentType) => {
  if (String(contentType || "").includes("text/event-stream")) {
    return parseSse(rawText);
  }

  try {
    return JSON.parse(rawText);
  } catch (error) {
    return rawText;
  }
};

const extractResult = (payload, expectedId) => {
  const messages = Array.isArray(payload) ? payload : [payload];
  const matched = messages.find((message) => message && message.id === expectedId && !message.error);

  if (matched) {
    return matched.result;
  }

  const errored = messages.find((message) => message && message.id === expectedId && message.error);
  if (errored) {
    const error = new Error(errored.error.message || "MCP Fehler");
    error.mcpErrorData = errored.error.data;
    throw error;
  }

  const fallback = messages.find((message) => message && message.result);
  if (fallback) {
    return fallback.result;
  }

  throw new Error("Keine verwertbare JSON-RPC-Antwort.");
};

const shouldRetryProtocol = (error) => {
  const message = String(error && error.message || "").toLowerCase();
  return message.includes("unsupported protocol") ||
    message.includes("protocol version") ||
    Number(error && error.httpStatus) === 400;
};

const getHeader = (headers, name) => {
  if (!headers || typeof headers.get !== "function") {
    return "";
  }

  return headers.get(name) || headers.get(name.toLowerCase()) || "";
};

export function createMcpClient(options = {}) {
  const state = {
    endpoint: stripStreamFlag(options.endpoint || DEFAULT_MCP_ENDPOINT),
    requestId: 1,
    sessionId: null,
    protocolVersion: DEFAULT_PROTOCOLS[0],
    initializeResult: null,
    didSendInitialized: false,
    initPromise: null,
    lastHttpStatus: null,
    lastError: null,
    lastResponseContentType: ""
  };

  const xhrRequest = (body, headers) => new Promise((resolve, reject) => {
    try {
      if (typeof XMLHttpRequest !== "function") {
        reject(new Error("XMLHttpRequest ist in dieser Umgebung nicht verfügbar."));
        return;
      }

      const xhr = new XMLHttpRequest();
      xhr.open("POST", state.endpoint, true);
      xhr.timeout = REQUEST_TIMEOUT_MS;
      Object.keys(headers).forEach((key) => xhr.setRequestHeader(key, headers[key]));
      xhr.onload = () => {
        const responseHeaders = {};
        String(xhr.getAllResponseHeaders ? xhr.getAllResponseHeaders() : "")
          .trim()
          .split(/\r?\n/)
          .filter(Boolean)
          .forEach((line) => {
            const index = line.indexOf(":");
            if (index > -1) {
              responseHeaders[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
            }
          });

        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          statusText: xhr.statusText,
          text: () => Promise.resolve(xhr.responseText || ""),
          headers: {
            get(name) {
              return responseHeaders[String(name || "").toLowerCase()] || null;
            }
          }
        });
      };
      xhr.onerror = () => reject(new Error(`XHR-Netzwerkfehler: ${state.endpoint}`));
      xhr.ontimeout = () => reject(new Error(`XHR-Timeout: ${state.endpoint}`));
      xhr.send(JSON.stringify(body));
    } catch (error) {
      reject(error);
    }
  });

  const fetchWithTimeout = async (body, headers) => {
    if (typeof fetch !== "function") {
      return xhrRequest(body, headers);
    }

    if (typeof AbortController !== "function") {
      return fetch(state.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(state.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      if (typeof XMLHttpRequest === "function") {
        return xhrRequest(body, headers);
      }

      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  const postJson = async (body, optionsForPost = {}) => {
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    };

    if (optionsForPost.protocolHeader) {
      headers["MCP-Protocol-Version"] = optionsForPost.protocolHeader;
    }

    if (state.sessionId) {
      headers["Mcp-Session-Id"] = state.sessionId;
    }

    const response = await fetchWithTimeout(body, headers);
    state.lastHttpStatus = response.status;
    state.lastResponseContentType = getHeader(response.headers, "Content-Type");

    const sessionId = getHeader(response.headers, "Mcp-Session-Id");
    if (sessionId) {
      state.sessionId = sessionId;
    }

    const rawText = await response.text();
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} an ${state.endpoint}`);
      error.httpStatus = response.status;
      state.lastError = error.message;
      throw error;
    }

    return parseBody(rawText, state.lastResponseContentType);
  };

  const send = async (method, params = {}, sendOptions = {}) => {
    const id = state.requestId;
    state.requestId += 1;

    const payload = await postJson({
      jsonrpc: "2.0",
      id,
      method,
      params
    }, sendOptions);

    return extractResult(payload, id);
  };

  const notify = async (method, params = {}) => postJson({
    jsonrpc: "2.0",
    method,
    params
  }, {
    protocolHeader: state.protocolVersion
  });

  const resetSession = () => {
    state.sessionId = null;
    state.initializeResult = null;
    state.didSendInitialized = false;
  };

  const doInitialize = async () => {
    let lastError = null;

    for (const protocol of DEFAULT_PROTOCOLS) {
      resetSession();

      try {
        const result = await send("initialize", {
          protocolVersion: protocol,
          capabilities: {},
          clientInfo: {
            name: "epg-exact-fit-plugin",
            version: "0.1.0"
          }
        });

        state.protocolVersion = result && result.protocolVersion || protocol;
        state.initializeResult = result || {};

        if (!state.didSendInitialized) {
          try {
            await notify("notifications/initialized", {});
          } catch (error) {
            // Some MCP endpoints accept initialize without requiring the notification.
          }
          state.didSendInitialized = true;
        }

        return state.initializeResult;
      } catch (error) {
        lastError = error;
        state.lastError = error.message || String(error);
        if (!shouldRetryProtocol(error)) {
          break;
        }
      }
    }

    throw lastError || new Error("MCP initialize fehlgeschlagen.");
  };

  const initialize = async () => {
    if (state.initializeResult && state.didSendInitialized) {
      return state.initializeResult;
    }

    if (!state.initPromise) {
      state.initPromise = doInitialize().finally(() => {
        state.initPromise = null;
      });
    }

    return state.initPromise;
  };

  const ensureInitialized = async () => {
    if (!state.initializeResult || !state.didSendInitialized) {
      await initialize();
    }
  };

  return {
    async initialize() {
      return initialize();
    },

    async listTools() {
      await ensureInitialized();
      return send("tools/list", {}, {
        protocolHeader: state.protocolVersion
      });
    },

    async callTool(toolName, args = {}) {
      if (!toolName) {
        throw new Error("MCP Toolname fehlt.");
      }

      await ensureInitialized();
      return send("tools/call", {
        name: toolName,
        arguments: args
      }, {
        protocolHeader: state.protocolVersion
      });
    },

    getDebugState() {
      return {
        endpoint: state.endpoint,
        sessionId: state.sessionId,
        protocolVersion: state.protocolVersion,
        lastHttpStatus: state.lastHttpStatus,
        lastError: state.lastError
      };
    }
  };
}
