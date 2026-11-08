// The app's settings (D80), the store's key "settings", and their sheet behind
// the app bar's settings icon (index.html). Simple mode hides the analyst's
// tools, Analyse and Compare: their tab and every link to them; hints, Check,
// Ask why, the explanations and Learn stay. It starts on for a touch screen
// (the tablet build, D78) and off with a mouse. The language (D81) follows the
// browser's until one is chosen, and binds text.js's words before any listener
// redraws.

import { h, touch } from "./dom.js";
import { VERSION } from "./engine.js";
import * as store from "./store.js";
import { LANGUAGES, SETTINGS, setLanguage } from "./text.js";

const KEY = "settings";
let current = { simple: touch.matches, language: null };
const listeners = new Set();

// The first of the browser's languages the app speaks, else English.
const browser = () => (globalThis.navigator?.languages ?? [])
  .map(tag => tag.slice(0, 2).toLowerCase()).find(code => code in LANGUAGES) ?? "en";

function bind() {
  const code = setLanguage(current.language ?? browser());
  if (globalThis.document) document.documentElement.lang = code;
}

bind();

// Resolves once the stored settings are read and their language bound.
export const ready = store.get(KEY).then(saved => { current = { ...current, ...saved }; bind(); });

// Whether Analyse and Compare are hidden.
export const simple = () => current.simple;

// `listener` runs after any setting changes.
export const onChange = listener => listeners.add(listener);

function set(name, value) {
  current = { ...current, [name]: value };
  store.set(KEY, current);
  bind();
  drawSheet();
  listeners.forEach(listener => listener());
}

// The sheet: each setting with its choices, a word switch like the app's
// others; the languages each named in its own, the browser's shown as chosen
// until one is.
export function drawSheet() {
  const choice = (name, chosen, values, words) => h("div", { class: "switch", role: "group", "aria-label": SETTINGS[name].name },
    Object.entries(values).map(([label, value]) => h("button", {
      type: "button", "aria-pressed": String(chosen === value), "data-focus": `setting-${name}-${label}`,
      lang: name === "language" ? value : null, onclick: () => set(name, value),
    }, words[label])));
  const codes = Object.fromEntries(Object.keys(LANGUAGES).map(code => [code, code]));
  document.querySelector("#settings")?.replaceChildren(h("dl", {},
    h("dt", {}, SETTINGS.language.name),
    h("dd", {}, choice("language", current.language ?? browser(), codes, LANGUAGES)),
    h("dt", {}, SETTINGS.simple.name),
    h("dd", {}, choice("simple", current.simple, { off: false, on: true }, SETTINGS.simple.choices),
      h("p", { class: "meta" }, SETTINGS.simple.about)),
    VERSION === null ? null : [h("dt", {}, SETTINGS.version), h("dd", { class: "meta" }, VERSION)]));
}
