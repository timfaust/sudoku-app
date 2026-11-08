// The app's entry: routing, the app bar, and the puzzle dialog.
// A link is the mode and the place in it: #learn, #learn/<idea>/<position>,
// #puzzles/<level>, #solve/<81 digits>, #analyse/<81 digits>/<round>/<step> or
// #compare/<81 digits> (Analyse's list of puzzles, the puzzle added to it).
// Puzzles is where the app opens, the way in for a player (D68); Solve and
// Analyse open on the last puzzle shown there, kept for the next visit.

import { touchTips } from "./dom.js";
import { IN_BROWSER, call } from "./engine.js";
import * as settings from "./settings.js";
import * as store from "./store.js";
import { ABOVE, APP, IDEAS } from "./text.js";
import { mountAnalyse } from "./views/analyse.js";
import { mountCompare } from "./views/compare.js";
import { mountLearn } from "./views/learn.js";
import { mountPuzzles } from "./views/puzzles.js";
import { mountSolve } from "./views/solve.js";

const SAMPLE = "005000000090803000001200536060300000203000801000008090186004900000901040000000600";
const MODES = { learn: mountLearn, puzzles: mountPuzzles, solve: mountSolve, analyse: mountAnalyse, compare: mountCompare };
const viewHost = document.querySelector("#view");
const dialog = document.querySelector("#puzzle-dialog");
const input = document.querySelector("#puzzle-input");
const count = document.querySelector("#puzzle-count");
const tabs = document.querySelectorAll("[data-mode]");
let view = null;
let shown = null;
let puzzle = SAMPLE; // the puzzle Solve and Analyse open on, the last one shown there

function parse() {
  const [mode, first, second, third] = decodeURIComponent(location.hash.slice(1)).split("/");
  const n = (value, otherwise = 0) => (value && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : otherwise);
  // Simple mode has no Analyse or Compare: their links open the puzzle in Solve.
  if (settings.simple() && (mode === "analyse" || mode === "compare")) return { mode: "solve", puzzle: /^[0-9]{81}$/.test(first ?? "") ? first : puzzle };
  if (!(mode in MODES) || mode === "puzzles") return { mode: "puzzles", level: first === ABOVE ? ABOVE : n(first, null) };
  if (mode === "learn") return { mode, lesson: first in IDEAS ? first : null, index: n(second, null) };
  if (mode === "compare") return { mode, puzzle: /^[0-9]{81}$/.test(first ?? "") ? first : null };
  return { mode, puzzle: first || puzzle, round: n(second), move: n(third) };
}

// Where a view's place goes into the link, without a new history entry.
const PLACES = {
  learn: target => ({ index }) => history.replaceState(null, "", `#learn/${target.lesson}/${index}`),
  puzzles: () => ({ level }) => history.replaceState(null, "", `#puzzles/${level}`),
  analyse: target => ({ round, move }) => history.replaceState(null, "", `#analyse/${target.puzzle}/${round}${move === null ? "" : `/${move}`}`),
  solve: () => () => {},
  compare: () => () => {},
};

// The app bar's and the puzzle dialog's words (index.html holds none).
function drawChrome() {
  const $ = selector => document.querySelector(selector);
  const name = (element, label) => { element.setAttribute("aria-label", label); element.title = label; };
  document.title = APP.name;
  $(".wordmark").setAttribute("aria-label", APP.home);
  $(".wordmark-name").textContent = APP.name;
  $(".modes").setAttribute("aria-label", APP.modes.label);
  for (const tab of tabs) tab.textContent = APP.modes[tab.dataset.mode];
  name($("#keys-button"), APP.keys);
  name($("#settings-button"), APP.settings);
  $("#keys").setAttribute("aria-label", APP.keys);
  $("#settings").setAttribute("aria-label", APP.settings);
  $("#new-puzzle").setAttribute("aria-label", APP.open);
  $("#new-puzzle .wide-only").textContent = APP.openWide;
  $("#new-puzzle .narrow-only").textContent = APP.openNarrow;
  $("#puzzle-dialog-title").textContent = APP.open;
  $("label[for=puzzle-input]").textContent = APP.openAbout;
  $("#puzzle-dialog [value=cancel]").textContent = APP.cancel;
  $("#puzzle-dialog [value=open]").textContent = APP.openButton;
}

function tabsFor(mode) {
  for (const tab of tabs) {
    tab.hidden = tab.dataset.mode === "analyse" && settings.simple();
    tab.href = tab.dataset.mode === "solve" || tab.dataset.mode === "analyse" ? `#${tab.dataset.mode}/${puzzle}` : `#${tab.dataset.mode}`;
    tab.setAttribute("aria-current", tab.dataset.mode === (mode === "compare" ? "analyse" : mode) ? "page" : "false");
  }
}

// A change of mode keeps the screen as it was until the new view has drawn its
// board, so the board stays put and only what it shows changes: a still copy
// of the old view lies over the new one, inert, and goes at once when the new
// board is drawn (after a second at most). Called before the old view goes; the
// function it returns watches for the new board once that view is mounted.
function holdStill() {
  if (!viewHost.firstChild) return () => {};
  const still = viewHost.cloneNode(true);
  still.removeAttribute("id");
  still.classList.add("still");
  still.inert = true;
  still.setAttribute("aria-hidden", "true");
  const box = viewHost.getBoundingClientRect();
  Object.assign(still.style, { top: `${box.top + scrollY}px`, left: `${box.left + scrollX}px`, width: `${box.width}px` });
  document.body.append(still);
  const drawn = () => viewHost.querySelector(".board > *");
  const done = () => { watch.disconnect(); clearTimeout(timer); still.remove(); };
  const watch = new MutationObserver(() => { if (drawn()) done(); });
  const timer = setTimeout(done, 1000);
  return () => {
    if (drawn()) return done();
    watch.observe(viewHost, { childList: true, subtree: true });
  };
}

function route() {
  const target = parse();
  if (target.mode === "solve" && /^#(analyse|compare)\b/.test(location.hash)) history.replaceState(null, "", `#solve/${target.puzzle}`);
  if (target.puzzle && target.puzzle !== puzzle) {
    puzzle = target.puzzle;
    store.set("last", puzzle);
  }
  tabsFor(target.mode);
  const id = target.mode === "compare" ? "compare" : `${target.mode}/${target.puzzle ?? target.lesson ?? ""}`;
  if (view && shown === id) return view.show(target);
  const mounted = holdStill();
  view?.destroy();
  shown = id;
  // The layout's cue: on a narrow screen, lists come before their board.
  viewHost.dataset.mode = target.mode === "learn" && !target.lesson ? "lessons" : target.mode;
  view = MODES[target.mode](viewHost, {
    puzzle: target.puzzle,
    engine: call,
    position: target,
    onPosition: PLACES[target.mode](target),
    openPuzzle,
    onRefused: refused,
    sample: `#${target.mode}/${SAMPLE}`,
  });
  mounted();
}

// The engine refused the puzzle shown: it is not kept, so the tabs, the link
// back and the next visit open the sample.
function refused(bad) {
  if (puzzle !== bad) return;
  puzzle = SAMPLE;
  store.set("last", SAMPLE);
  tabsFor(parse().mode);
}

// Accept the usual ways of writing a puzzle: digits with 0 or . for empty cells,
// any whitespace. The engine checks the rest and says what is wrong.
const normalise = text => text.replace(/\s+/g, "").replace(/\./g, "0");

function openPuzzle() {
  input.value = "";
  counted();
  dialog.showModal();
}

// How many cells the text holds so far; whether they make a puzzle is the engine's to say.
function counted() {
  const n = normalise(input.value).length;
  count.textContent = n ? APP.cells(n) : "";
}

drawChrome();
touchTips();
document.querySelector("#new-puzzle").addEventListener("click", openPuzzle);
input.addEventListener("input", counted);
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); dialog.close("open"); }
});
dialog.addEventListener("close", () => {
  // A puzzle opens in the mode shown, or in Solve from Learn and Puzzles.
  const mode = ["learn", "puzzles"].includes(parse().mode) ? "solve" : parse().mode;
  if (dialog.returnValue === "open" && normalise(input.value)) location.hash = `#${mode}/${normalise(input.value)}`;
});
// How focus last moved: a click, or the Tab key. A redraw puts focus back after
// either (dom.keepFocus), and its ring shows only for the keyboard (app.css).
addEventListener("pointerdown", () => { document.documentElement.dataset.input = "pointer"; }, true);
addEventListener("keydown", event => { if (event.key === "Tab") delete document.documentElement.dataset.input; }, true);
window.addEventListener("hashchange", route);
Promise.all([store.get("last"), settings.ready]).then(([last]) => {
  if (/^[0-9]{81}$/.test(last ?? "") && !parse().puzzle) puzzle = last;
  drawChrome();
  settings.drawSheet();
  route();
});
// A changed setting redraws the app bar and the view shown in place.
settings.onChange(() => {
  drawChrome();
  shown = null;
  route();
});

// The installed app works offline (sw.js); the desktop app's server needs no copy.
// A newer version, once downloaded, takes over at the app's start: the page
// reloads onto it while nothing was touched yet, else the next start does (D96).
if (IN_BROWSER && "serviceWorker" in navigator) {
  const sw = navigator.serviceWorker;
  const updating = Boolean(sw.controller); // a first install takes over without a reload
  let fresh = true;
  for (const type of ["pointerdown", "keydown"]) addEventListener(type, () => { fresh = false; }, { capture: true, once: true });
  const takeOver = worker => { if (worker && updating && fresh) worker.postMessage("take-over"); };
  sw.addEventListener("controllerchange", () => { if (updating && fresh) location.reload(); });
  sw.register("sw.js").then(registration => {
    takeOver(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => { if (worker.state === "installed") takeOver(worker); });
    });
  }, () => {}); // no offline copy (a page closing or reloading meanwhile): the app runs as it is
}
