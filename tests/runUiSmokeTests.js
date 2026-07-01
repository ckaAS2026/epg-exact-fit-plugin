import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("index.html", "utf8");
const js = fs.readFileSync("index.js", "utf8");

const requiredButtons = [
  ["btnStart", "Daten laden / Start"],
  ["btnInspectLayout", "Layout prüfen"],
  ["btnFill", "Tabelle befüllen"],
  ["btnCorrect", "Korrektur starten"],
  ["btnLoad", "Sender laden"],
  ["btnPing", "PING TEST"]
];

assert.match(html, /id="btnStart"/, "index.html must contain boot start button");
assert.match(html, /Daten laden \/ Start/, "index.html must show boot start label");

for (const [id, label] of requiredButtons.slice(1)) {
  assert.doesNotMatch(html, new RegExp(`id="${id}"`), `index.html must not require static ${id}`);
  assert.doesNotMatch(html, new RegExp(label), `index.html must not require static ${label}`);
}

for (const [id, label] of requiredButtons.slice(0, 1)) {
  assert.match(html, new RegExp(`id="${id}"`), `index.html must contain ${id}`);
  assert.match(html, new RegExp(label), `index.html must show ${label}`);
}

assert.match(html, /src="\.\/index\.js\?v=0\.1\.36"/, "index.html must cache-bust index.js");
assert.match(html, /href="\.\/src\/styles\.css\?v=0\.1\.36"/, "index.html must cache-bust styles.css");
assert.match(html, /UI Unblock Guard/, "index.html must expose current UI-unblock build");
assert.doesNotMatch(html, /btnRunAction|actionSelect|btnInspectLayout|btnFill|btnCorrect|btnLoad|onclick=|onmousedown=|<script>\s*\(function/, "index.html must stay boot-safe");
assert.doesNotMatch(js, /Weitere .*Sendungen geladen, Logausgabe gekuerzt/, "data loading must not hide diagnostics behind shortened programme dumps");
assert.match(js, /LOG_LIMIT = 2000/, "runtime log buffer must preserve diagnostic output");
assert.match(js, /function showFatalBootError/, "runtime must include visible fatal boot fallback");
assert.match(js, /function boot\(\)/, "runtime must boot through guarded wrapper");
assert.match(js, /function safeBind\(id, action\)/, "runtime must bind action buttons safely");
assert.match(js, /PING OK - UI reagiert/, "runtime must include ping action");
assert.doesNotMatch(js, /addEventListener\("DOMContentLoaded", initializeApp\)/, "initializeApp must not be registered unguarded");

const elements = {};

function makeElement(id) {
  const element = {
    id,
    value: "",
    defaultValue: "",
    textContent: "",
    className: "",
    style: {},
    disabled: false,
    parentNode: null,
    nextSibling: null,
    children: [],
    listeners: {},
    tagName: "DIV",
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      if (child.id) {
        elements[child.id] = child;
      }
      return child;
    },
    insertBefore(child) {
      return this.appendChild(child);
    },
    focus() {},
    select() {}
  };

  elements[id] = element;
  return element;
}

const startSection = makeElement("startSection");
startSection.className = "start-section";
const actionsPanel = makeElement("actionsPanel");
actionsPanel.className = "actions";
const startButton = makeElement("btnStart");
startButton.tagName = "BUTTON";
actionsPanel.appendChild(startButton);

[
  "buildLabel",
  "selectedDate",
  "dateShortcut",
  "apiKey",
  "tableLabel",
  "saveSettingsButton",
  "clearLogButton",
  "copyLogButton",
  "statusBar",
  "progressBar",
  "progressText",
  "logOutput"
].forEach((id) => {
  const element = makeElement(id);
  element.tagName = id === "selectedDate" || id === "apiKey" || id === "tableLabel" ? "INPUT" : "TEXTAREA";
});

const localStorageMap = {};

const context = {
  console,
  setTimeout,
  Date,
  document: {
    readyState: "complete",
    getElementById(id) {
      return elements[id] || null;
    },
    createElement(tagName) {
      const element = makeElement(`generated-${Object.keys(elements).length}`);
      element.tagName = tagName.toUpperCase();
      return element;
    },
    body: startSection,
    addEventListener() {},
    execCommand() {
      return false;
    }
  },
  localStorage: {
    getItem(key) {
      return localStorageMap[key] || "";
    },
    setItem(key, value) {
      localStorageMap[key] = String(value);
    }
  },
  window: {
    addEventListener() {}
  },
  fetch: async () => {
    throw new Error("fetch not expected in UI smoke test");
  }
};

context.window = context;
context.window.addEventListener = function () {};

vm.createContext(context);
vm.runInContext(js, context);

assert.match(elements.logOutput.value, /BOOT START/, "boot start must be logged");
assert.match(elements.logOutput.value, /Runtime geladen: Build 0\.1\.36 - UI Unblock Guard/, "runtime build must be logged");
assert.match(elements.logOutput.value, /BOOT DONE/, "boot done must be logged");

for (const [id] of requiredButtons) {
  assert.ok(elements[id], `${id} must be created by DOM guard`);
  assert.equal(typeof elements[id].listeners.click, "function", `${id} must have click handler`);
  assert.equal(typeof elements[id].onclick, "function", `${id} must have direct onclick handler`);
  assert.equal(typeof elements[id].listeners.mouseup, "function", `${id} must have mouseup handler`);
  assert.equal(typeof elements[id].onmouseup, "function", `${id} must have direct onmouseup handler`);
  assert.equal(elements[id].listeners.pointerup, undefined, `${id} must not bind pointerup`);
}

elements.btnLoad.onmouseup({ preventDefault() {} });
assert.match(elements.logOutput.value, /ACTION load empfangen/, "inline dispatch must invoke registered action");
elements.btnPing.onmouseup({ preventDefault() {} });
assert.match(elements.logOutput.value, /PING OK - UI reagiert/, "ping dispatch must prove UI interactivity");

console.log("UI smoke tests passed.");
