import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("index.html", "utf8");
const js = fs.readFileSync("index.js", "utf8");

const requiredButtons = [
  ["btnPing", "PING TEST"]
];

assert.match(html, /src="\.\/index\.js\?v=0\.1\.36"/, "index.html must cache-bust index.js");
assert.match(html, /href="\.\/src\/styles\.css\?v=0\.1\.36"/, "index.html must cache-bust styles.css");
assert.match(html, /UI Unblock Guard/, "index.html must expose current UI-unblock build");
assert.doesNotMatch(html, /btnRunAction|actionSelect|btnInspectLayout|btnFill|btnCorrect|btnLoad|onclick=|onmousedown=|<script>\s*\(function/, "index.html must stay boot-safe");
assert.match(js, /\[EPG\] FILE LOADED/, "runtime must log file load");
assert.match(js, /EPG Plugin \(Recovery Mode\)/, "runtime must include recovery UI");
assert.match(js, /console\.log\("\[EPG\] BOOT START"\)/, "runtime must log boot start");
assert.match(js, /console\.log\("\[EPG\] BOOT DONE"\)/, "runtime must log boot done");
assert.match(js, /Ping OK/, "runtime must include ping action");

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
Object.defineProperty(startSection, "innerHTML", {
  get() {
    return this._innerHTML || "";
  },
  set(value) {
    this._innerHTML = String(value || "");
    if (this._innerHTML.includes('id="btnPing"')) {
      const ping = makeElement("btnPing");
      ping.tagName = "BUTTON";
      const log = makeElement("log");
      log.tagName = "DIV";
      this.appendChild(ping);
      this.appendChild(log);
    }
  }
});
const actionsPanel = makeElement("actionsPanel");
actionsPanel.className = "actions";

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

assert.match(elements.log.innerHTML, /BOOT START/, "boot start must be logged");
assert.match(elements.log.innerHTML, /BOOT DONE/, "boot done must be logged");
assert.ok(elements.btnPing, "ping button must be created in recovery mode");
assert.equal(typeof elements.btnPing.onclick, "function", "ping button must be clickable");
elements.btnPing.onclick();
assert.match(elements.log.innerHTML, /Ping OK/, "ping dispatch must prove UI interactivity");

console.log("UI smoke tests passed.");
