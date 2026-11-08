// Compare: many puzzles side by side, rated by the engine (APP_CONCEPT.md §4,
// D72). Puzzles are pasted, one per line, or come from Analyse; each is rated
// (service.rate, a few at once) and listed with its strip and the profile's
// numbers, in the order picked: as added, by level then search (the profile's
// own order, D60), by search or by givens. The board shows the puzzle in focus
// with its strip. A twin (service.twin) is the puzzle under a random symmetry,
// the same puzzle to the rating, so its row must match (D32).

import { createBoard } from "../board.js";
import { fitPages, h, keepFocus, shortcuts } from "../dom.js";
import { PARALLEL, seed } from "../engine.js";
import { digitsOf } from "../geometry.js";
import * as library from "../library.js";
import { boardView } from "../step.js";
import * as store from "../store.js";
import { CEILING, miniStrip } from "../strip.js";
import { COMPARE, REGIONS, aboveCeiling, looks, ratingLine } from "../text.js";

const STORE_KEY = "compare"; // { rows: [{ puzzle, rating, twinOf }], sort: { by, down } }
const PUZZLE = /[0-9.]{81}/;

// The columns a list sorts by; level sorts as the profile does, a puzzle above
// the ceiling after every level and one beyond the engine last.
const rank = r => (r.solved ? r.level : r.limited ? CEILING + 1 : CEILING + 2);
const SORTS = {
  added: { key: (row, i) => [i] },
  level: { key: row => (row.rating ? [rank(row.rating), row.rating.solved ? row.rating.search : 0] : [Infinity]) },
  search: { key: row => [row.rating?.solved ? row.rating.search : Infinity] },
  givens: { key: row => [row.rating ? row.rating.givens : Infinity] },
};
const compareKeys = (a, b) => a.reduce((d, x, i) => d || (x < b[i] ? -1 : x > b[i] ? 1 : 0), 0);

export function mountCompare(root, { puzzle, engine }) {
  const state = {
    rows: [], sort: { by: "added", down: false }, focus: null, text: "", skipped: 0,
    rating: new Map(), // puzzle -> AbortController, the ratings under way
    known: [], // the library's rated puzzles, whose ratings are reused
    stopped: false, error: null, loaded: false,
    page: 0, // the list's page shown (dom.fitPages)
  };

  const boardHost = h("div", { class: "board-host" });
  const legendHost = h("div", { class: "legend stage-note" });
  const headHost = h("section", { class: "compare-head", "aria-label": COMPARE.title });
  const listHost = h("section", { "aria-label": REGIONS.puzzles });
  root.replaceChildren(
    h("div", { class: "stage", role: "region", "aria-label": REGIONS.board }, boardHost, legendHost),
    h("div", { class: "side" }, headHost, listHost),
  );
  shortcuts([[["↑", "↓"], COMPARE.shortcuts.puzzles], [["↵"], COMPARE.shortcuts.analyse], [["⌫"], COMPARE.shortcuts.remove],
    [["Esc"], COMPARE.shortcuts.stop]]);
  const board = createBoard(boardHost);

  const indexOf = p => state.rows.findIndex(r => r.puzzle === p);
  const focused = () => state.rows[indexOf(state.focus)] ?? null;

  function sorted() {
    const { key } = SORTS[state.sort.by];
    const order = state.rows.map((row, i) => ({ row, i, k: key(row, i) }));
    order.sort((a, b) => compareKeys(a.k, b.k) * (state.sort.down ? -1 : 1) || a.i - b.i);
    return order;
  }

  function save() {
    store.set(STORE_KEY, { rows: state.rows.map(({ puzzle, rating, twinOf }) => ({ puzzle, rating, twinOf })), sort: state.sort });
  }

  // ---------- editing ----------

  // Rows for the puzzles not listed yet, rated from the library when it knows them.
  function add(puzzles, { twinOf = null } = {}) {
    const known = new Map(state.known.map(e => [e.puzzle, e.rating]));
    let first = null;
    for (const p of puzzles) {
      if (indexOf(p) >= 0) continue;
      state.rows.push({ puzzle: p, rating: known.get(p) ?? null, twinOf });
      first ??= p;
    }
    if (first) state.focus = first;
    state.stopped = false;
    save();
    rateNext();
    render();
  }

  function addPasted() {
    const lines = state.text.split(/\n/).map(l => l.replace(/\s+/g, "")).filter(Boolean);
    const found = lines.map(l => l.match(PUZZLE)?.[0].replace(/\./g, "0")).filter(Boolean);
    state.skipped = lines.length - found.length;
    state.text = "";
    add(found);
  }

  function addTwin() {
    const row = focused();
    if (!row) return;
    engine("twin", { puzzle: row.puzzle, seed: seed() })
      .then(events => add([events.at(-1).puzzle], { twinOf: row.puzzle }))
      .catch(error => { state.error = error.message; render(); });
  }

  function remove() {
    const i = indexOf(state.focus);
    if (i < 0) return;
    state.rating.get(state.focus)?.abort();
    const order = sorted().map(o => o.row.puzzle);
    const next = order[order.indexOf(state.focus) + 1] ?? order[order.indexOf(state.focus) - 1] ?? null;
    state.rows.splice(i, 1);
    state.focus = next;
    save();
    rateNext();
    render();
  }

  function clear() {
    stop();
    Object.assign(state, { rows: [], focus: null, skipped: 0, stopped: false });
    save();
    render();
  }

  function sortBy(by) {
    state.sort = { by, down: state.sort.by === by ? !state.sort.down : false };
    save();
    render();
  }

  // ---------- rating ----------

  const unrated = () => state.rows.filter(r => !r.rating && !r.error && !state.rating.has(r.puzzle));

  function rateNext() {
    while (!state.stopped && state.rating.size < PARALLEL && unrated().length) {
      const row = unrated()[0];
      const controller = new AbortController();
      state.rating.set(row.puzzle, controller);
      engine("rate", { puzzle: row.puzzle }, { signal: controller.signal })
        .then(events => { row.rating = events.at(-1).rating; save(); })
        .catch(error => { if (!error.cancelled) row.error = error.message; })
        .finally(() => {
          if (state.rating.get(row.puzzle) !== controller) return;
          state.rating.delete(row.puzzle);
          rateNext();
          render();
        });
    }
  }

  function stop() {
    state.stopped = true;
    for (const controller of state.rating.values()) controller.abort();
    state.rating.clear();
  }

  // ---------- the board ----------

  function drawStage() {
    const row = focused();
    if (!row) {
      board.render(boardView({ grid: Array(81).fill(0), candidates: Array(81).fill(null) }, Array(81).fill(0), COMPARE.none));
      return legendHost.replaceChildren();
    }
    const givens = digitsOf(row.puzzle);
    board.render(boardView({ grid: givens, candidates: Array(81).fill(null) }, givens, COMPARE.focus));
    const r = row.rating;
    const twin = row.twinOf && indexOf(row.twinOf) >= 0 ? indexOf(row.twinOf) + 1 : null;
    legendHost.replaceChildren(
      h("p", { class: "stage-caption" }, h("b", {}, `#${indexOf(row.puzzle) + 1}`),
        COMPARE.caption(r ? ratingLine(r, CEILING) : row.error ?? COMPARE.beingRated, twin)));
  }

  // ---------- the column ----------

  function status() {
    const n = state.rows.length;
    const rated = state.rows.filter(r => r.rating).length;
    if (state.error) return h("p", { class: "meta bad" }, state.error);
    if (!n) return h("p", { class: "meta" }, COMPARE.empty);
    const skipped = COMPARE.skipped(state.skipped);
    if (state.rating.size) {
      return h("p", { class: "meta" }, COMPARE.rating(rated, n, skipped),
        h("button", { class: "link quiet", type: "button", "data-focus": "stop add", onclick: () => { stop(); render(); } }, COMPARE.stop));
    }
    const left = unrated().length;
    return h("p", { class: "meta" }, COMPARE.count(n, rated, skipped),
      left && state.stopped ? h("button", { class: "link quiet", type: "button", "data-focus": "rate add",
        onclick: () => { state.stopped = false; rateNext(); render(); } }, COMPARE.rateLeft(left)) : null);
  }

  function head() {
    const area = h("textarea", {
      class: "paste", rows: "3", placeholder: COMPARE.paste, "aria-label": COMPARE.pasteLabel,
      "data-focus": "paste", spellcheck: "false",
      oninput: event => { state.text = event.target.value; drawActions(); },
      onkeydown: event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); addPasted(); } },
    });
    area.value = state.text;
    return [h("p", { class: "title" }, COMPARE.title), status(), area, actions];
  }

  // Adding puzzles on one line, acting on the list on the next, each whole.
  const actions = h("div", { class: "compare-actions" });
  function drawActions() {
    actions.replaceChildren(h("div", { class: "row" },
      h("button", { class: "button primary", type: "button", disabled: !PUZZLE.test(state.text.replace(/\s+/g, "")), "data-focus": "add paste",
        title: COMPARE.addAbout, onclick: addPasted }, COMPARE.add),
      h("button", { class: "button", type: "button", disabled: !focused(), "data-focus": "twin add",
        title: COMPARE.twinAbout, onclick: addTwin }, COMPARE.twin)),
    h("div", { class: "row end" },
      h("button", { class: "button text", type: "button", disabled: !focused(), "data-focus": "analyse add", "aria-keyshortcuts": "Enter",
        onclick: () => open(state.focus) }, COMPARE.analyse),
      h("button", { class: "button text", type: "button", disabled: !focused(), "data-focus": "remove clear", onclick: remove }, COMPARE.remove),
      h("button", { class: "button text", type: "button", disabled: !state.rows.length, "data-focus": "clear add", onclick: clear }, COMPARE.clear)));
  }

  function list() {
    if (!state.rows.length) return [];
    const header = h("div", { class: "compare-grid compare-header", role: "row" }, ["added", "strip", "level", "search", "givens"].map(by => {
      if (by === "strip") return h("span", {});
      const on = state.sort.by === by;
      return h("button", { type: "button", class: `sort${on ? " on" : ""}`, "aria-pressed": String(on), "data-focus": `sort-${by}`,
        onclick: () => sortBy(by) }, COMPARE.sorts[by], on ? (state.sort.down ? " ↓" : " ↑") : "");
    }));
    const rows = sorted().map(({ row, i }) => {
      const r = row.rating;
      const level = !r ? "" : r.solved ? String(r.level) : r.limited ? aboveCeiling(CEILING, "figure") : "–";
      return h("li", {}, h("button", {
        type: "button", class: "compare-grid compare-row", "data-focus": `row-${row.puzzle}`, "data-puzzle": row.puzzle,
        "aria-current": row.puzzle === state.focus ? "true" : null,
        "aria-label": COMPARE.row(i, r ? ratingLine(r, CEILING) : row.error, Boolean(row.twinOf)),
        onfocus: () => focus(row.puzzle),
        onclick: event => { if (event.detail) focus(row.puzzle); else open(row.puzzle); },
      },
      h("span", { class: "figure-cell" }, `${i + 1}${row.twinOf ? "′" : ""}`),
      r ? miniStrip(r, ratingLine(r, CEILING)) : h("span", { class: `mini-strip pending${row.error ? " failed" : ""}`, title: row.error ?? null }),
      h("span", { class: "figure-cell" }, level),
      h("span", { class: "figure-cell" }, r?.solved ? looks(r.search) : ""),
      h("span", { class: "figure-cell" }, r ? String(r.givens) : "")));
    });
    return [header, h("ul", { class: "compare-list" }, rows)];
  }

  const open = p => { location.hash = `#analyse/${p}`; };

  // In place: the board and the rows' marks, so that a click reaches its row.
  function focus(p) {
    if (state.focus === p) return;
    state.focus = p;
    drawStage();
    drawActions();
    for (const row of root.querySelectorAll(".compare-row")) {
      if (row.dataset.puzzle === p) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    }
  }

  function render() {
    if (!state.loaded) return;
    keepFocus(() => {
      drawStage();
      drawActions();
      headHost.replaceChildren(...head());
      listHost.replaceChildren(...list());
      fitList();
    });
  }

  // The list a page at a time: the page holding the puzzle in focus, and a
  // turned page puts its first puzzle in focus.
  function fitList() {
    const list = listHost.querySelector(".compare-list");
    if (!list) return;
    const shown = list.querySelector(".compare-row[aria-current=true]")?.closest("li");
    state.page = fitPages(list, { at: state.page, keep: shown, pick: i => {
      fitPages(list, { at: i, pick: () => {} });
      const first = [...list.querySelectorAll(".compare-row")].find(r => !r.closest("li").hidden);
      if (first) focus(first.dataset.puzzle);
      state.page = i;
      render();
    } });
  }

  function onKey(event) {
    if (event.target instanceof Element && event.target.closest("input, textarea, select, dialog")) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const k = event.key;
    const onRow = event.target instanceof Element && event.target.classList.contains("compare-row");
    if (k === "ArrowDown" || k === "ArrowUp") {
      const rows = [...root.querySelectorAll(".compare-row")];
      const i = rows.findIndex(r => r.dataset.puzzle === state.focus);
      const to = rows[Math.max(0, Math.min(rows.length - 1, i + (k === "ArrowDown" ? 1 : -1)))];
      if (to?.closest("li").hidden) { focus(to.dataset.puzzle); render(); }
      root.querySelector(`.compare-row[data-puzzle="${to?.dataset.puzzle}"]`)?.focus();
    } else if ((k === "Backspace" || k === "Delete") && (onRow || event.target === document.body)) remove();
    else if (k === "Escape" && state.rating.size) { stop(); render(); }
    else return;
    event.preventDefault();
  }
  document.addEventListener("keydown", onKey);

  Promise.all([store.get(STORE_KEY), library.load()]).then(([saved, stored]) => {
    state.known = library.entries(stored).filter(e => e.rating);
    if (Array.isArray(saved?.rows)) state.rows = saved.rows;
    if (saved?.sort?.by in SORTS) state.sort = saved.sort;
    state.loaded = true;
    if (puzzle) add([puzzle]);
    else {
      state.focus = sorted()[0]?.row.puzzle ?? null;
      rateNext();
      render();
    }
    if (puzzle) focus(puzzle);
  });

  return {
    show({ puzzle: p }) {
      if (p && state.loaded) { add([p]); focus(p); }
    },
    destroy() {
      stop();
      document.removeEventListener("keydown", onKey);
    },
  };
}
