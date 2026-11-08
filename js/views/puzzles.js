// Puzzles: the library and the generator in one place (APP_CONCEPT.md §4, D64).
// Every puzzle is rated by the engine, and the library is read level by level:
// a player picks a level, sees its puzzles, and makes a new one there.
//
// The column reads top to bottom: what the player has started, then the level
// picker, drawn like the difficulty strip, the level as the column's title,
// one wide button that stays in place (play the puzzle in focus, make one,
// stop making it) over a slot of fixed height (making a new one, the search
// asked, the job), and the level's puzzles. A click, a tap or the keyboard puts
// a puzzle in focus; the main button or Enter opens it. The board shows the
// puzzle in focus as the player left it, its strip beneath; while a puzzle is
// made, the one the climbs stand on highest (service.generate).

import { createBoard } from "../board.js";
import { fitPages, h, keepFocus, shortcuts } from "../dom.js";
import { PARALLEL, seed } from "../engine.js";
import { digitsOf } from "../geometry.js";
import * as library from "../library.js";
import { simple } from "../settings.js";
import { boardView } from "../step.js";
import * as store from "../store.js";
import { CEILING, miniStrip } from "../strip.js";
import {
  ABOVE, IDEAS, PUZZLES, REGIONS, SEARCHES, SPOT_ABOUT, aboveCeiling, climbLine, elapsed, levelAbout, levelIdeas, madeLine, playLine,
  ratingLine, sentence, sourceLine, waitLine,
} from "../text.js";
import { failure } from "./failure.js";

const LEVELS = Array.from({ length: CEILING }, (_, i) => i + 1);
const STORE_KEY = "puzzles"; // { level, search, idea }: the level last picked, the search and key idea asked
const bucket = rating => (rating.solved ? rating.level : ABOVE);

export function mountPuzzles(root, { engine, position, onPosition, openPuzzle }) {
  const state = {
    loaded: false, stored: library.emptyLibrary(), error: null,
    level: position.level, search: "any", idea: "any", focus: null,
    ideaLevels: {}, // the key ideas a made puzzle can be asked for, by level (service.ideas)
    // A puzzle being made: { level, search, from, started, timer, climbers:
    // [{ controller, tried, rating, made, spares }] }, `from` the search of the
    // job's first puzzle at the level (what any search would have made),
    // `spares` a climb's puzzles by level; one made: { level, puzzle, rating,
    // search, from, spare, ms }. `makeNew`: the player asked to make one
    // while the level still has puzzles to play.
    making: null, made: null, failed: null, makeNew: false,
    page: 0, // the level's list's page shown (dom.fitPages)
  };
  const plays = new Map(); // puzzle -> the player's facts, for the board

  const boardHost = h("div", { class: "board-host" });
  const legendHost = h("div", { class: "legend stage-note", "aria-live": "polite" });
  const continueHost = h("section", { "aria-label": PUZZLES.continueLabel });
  const levelHost = h("section", { class: "level", "aria-label": REGIONS.level });
  const actionHost = h("div", { class: "making" });
  root.replaceChildren(
    h("div", { class: "stage", role: "region", "aria-label": REGIONS.board }, boardHost, legendHost),
    h("div", { class: "side" }, continueHost, levelHost),
  );
  const k = PUZZLES.shortcuts;
  shortcuts([[["←", "→"], k.levels], [["↑", "↓"], k.puzzles], [["↵"], k.solve], [["N"], k.make], [["Esc"], k.stop]]);
  const board = createBoard(boardHost);

  const all = () => library.entries(state.stored);
  const known = () => all().flatMap(e => (e.rating ? [e.rating.id] : []));
  const levels = () => [...LEVELS, ...(all().some(e => e.rating && !e.rating.solved) ? [ABOVE] : [])];
  const firstOf = list => (list.find(e => !e.solved) ?? list[0])?.puzzle ?? null;

  // The level's puzzles but those under Continue; one just made comes first.
  function listed() {
    const found = (state.level === ABOVE
      ? all().filter(e => e.rating && !e.rating.solved)
      : library.atLevel(all(), state.level)).filter(e => library.status(e) !== "playing");
    const made = found.findIndex(e => e.puzzle === state.made?.puzzle);
    return made > 0 ? [found[made], ...found.slice(0, made), ...found.slice(made + 1)] : found;
  }

  // ---------- choosing ----------

  function pick(level) {
    if (!levels().includes(level)) return;
    state.level = level;
    state.focus = firstOf(listed());
    state.failed = null;
    state.makeNew = false;
    onPosition({ level });
    save();
    render();
  }

  function ask(search) {
    state.search = search;
    save();
    render();
  }

  // The key idea asked, while the level allows it (D73).
  const offered = () => Object.keys(state.ideaLevels).filter(idea => state.ideaLevels[idea].includes(state.level));
  const idea = () => (offered().includes(state.idea) ? state.idea : "any");
  // The search asked; simple mode asks none (D80), its player reads no search.
  const search = () => (simple() ? "any" : state.search);

  function askIdea(value) {
    state.idea = value;
    save();
    render();
  }

  const save = () => store.set(STORE_KEY, { level: state.level, search: state.search, idea: state.idea });

  // In place: the board, the button and the rows' marks, never the rows
  // themselves, so that a click on a row reaches the row it began on.
  function focus(puzzle) {
    if (state.focus === puzzle) return;
    state.focus = puzzle;
    state.makeNew = false;
    if (!plays.has(puzzle)) {
      plays.set(puzzle, []);
      library.loadPlay(puzzle).then(saved => {
        if (saved) plays.set(puzzle, saved.facts);
        if (state.focus === puzzle) drawStage();
      });
    }
    drawStage();
    drawAction();
    for (const row of root.querySelectorAll(".puzzle-row")) {
      if (row.dataset.puzzle === puzzle) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    }
  }

  // ---------- making ----------

  // With any search, a spare of the level is made at once; else PARALLEL
  // climbs run. With any search the first to make the puzzle wins; with less
  // or more, the job waits for every climb and keeps the least (most) search,
  // since a climb can end where no neighbour moves it. The puzzles the others
  // stood on become spares (library.js); the winner's are the made puzzle's
  // neighbours, so they are let go.
  function make() {
    if (state.making || state.level === ABOVE) return;
    const job = { level: state.level, search: search(), idea: idea(), from: null, started: Date.now(), timer: null, climbers: [] };
    state.making = job;
    state.made = state.failed = null;
    if (job.search !== "any" || job.idea !== "any") {
      climb(job);
      return render();
    }
    let spare = null;
    library.update(stored => {
      const [next, found] = library.takeSpare(stored, job.level);
      spare = found;
      return next;
    }).then(stored => {
      state.stored = stored;
      if (state.making !== job) return;
      if (!spare) return climb(job);
      state.making = null;
      state.makeNew = false; // made: the button plays it
      state.made = { level: job.level, puzzle: spare.puzzle, rating: spare, search: "any", idea: "any", spare: true };
      if (state.level === job.level) state.focus = spare.puzzle;
      render();
    });
    render();
  }

  function climb(job) {
    job.timer = setInterval(() => {
      const shown = levelHost.querySelector(".elapsed");
      if (shown) shown.textContent = elapsed(Date.now() - job.started);
    }, 1000);
    for (let i = 0; i < PARALLEL; i++) {
      const climber = { controller: new AbortController(), tried: 0, rating: null, made: null, spares: new Map() };
      job.climbers.push(climber);
      engine("generate", { level: job.level, seed: seed(), search: job.search, idea: job.idea }, {
        signal: climber.controller.signal,
        onEvent(event) {
          if (state.making !== job) return;
          climber.tried = event.tried;
          if (event.type === "made") {
            climber.made = event.rating;
            const done = job.climbers.filter(c => c.made);
            if (job.search === "any") return finish(job, climber);
            if (done.length === job.climbers.length) return finish(job, best(done, job.search));
          }
          if (event.type === "climbed") {
            const r = event.rating;
            climber.rating = r;
            if (r.level === job.level) job.from ??= r.search;
            // One spare per level from each climb: its puzzles there are neighbours.
            if (!climber.spares.has(r.level)) climber.spares.set(r.level, r);
          }
          render();
        },
      }).catch(error => {
        if (error.cancelled || state.making !== job) return;
        stop();
        state.failed = error.message;
        render();
      });
    }
  }

  function finish(job, winner) {
    const rating = winner.made;
    stop(winner);
    library.update(stored => library.withEntry(stored, rating.puzzle, { source: "made", added: Date.now(), rating })).then(stored => {
      state.stored = stored;
      state.makeNew = false; // made: the button plays it
      state.made = { level: job.level, puzzle: rating.puzzle, rating, search: job.search, idea: job.idea, from: job.from, spare: false,
        ms: Date.now() - job.started };
      if (state.level === job.level) state.focus = rating.puzzle;
      render();
    });
  }

  // Stop the job; every climb but the winner leaves its spares.
  function stop(winner = null) {
    const job = state.making;
    if (!job) return;
    state.making = null;
    clearInterval(job.timer);
    for (const climber of job.climbers) climber.controller.abort();
    const spares = job.climbers.filter(c => c !== winner).flatMap(c => [...c.spares.values()]);
    if (spares.length) {
      library.update(stored => spares.reduce((next, r) => library.withSpare(next, r, known()), stored))
        .then(stored => { state.stored = stored; render(); });
    }
  }

  // Of `climbers`, the one that stands highest, and at one level, the one
  // furthest along the search asked for.
  function best(climbers, search) {
    const sign = { any: 0, less: -1, more: 1 }[search];
    return climbers.filter(c => c.rating).reduce((top, c) => (!top
      || c.rating.level > top.rating.level
      || (c.rating.level === top.rating.level && sign * (c.rating.search - top.rating.search) > 0) ? c : top), null);
  }

  const climbing = () => best(state.making.climbers, state.making.search);

  // ---------- the stage ----------

  function drawStage() {
    const job = state.making;
    if (job) {
      const at = climbing()?.rating;
      board.render(boardView({ grid: digitsOf(at?.puzzle ?? "0".repeat(81)), candidates: Array(81).fill(null) },
        digitsOf(at?.puzzle ?? "0".repeat(81)), PUZZLES.being));
      return legendHost.replaceChildren(
        h("p", { class: "stage-caption" }, h("b", {}, PUZZLES.beingMade(job.level)),
          at ? PUZZLES.climbing(at.level, at.givens) : ""));
    }
    const entry = all().find(e => e.puzzle === state.focus);
    if (!entry) {
      board.render(boardView({ grid: Array(81).fill(0), candidates: Array(81).fill(null) }, Array(81).fill(0), PUZZLES.none));
      return legendHost.replaceChildren();
    }
    const givens = digitsOf(entry.puzzle);
    const grid = [...givens];
    for (const fact of plays.get(entry.puzzle) ?? []) if (fact.value && !givens[fact.cell]) grid[fact.cell] = fact.digit;
    board.render(boardView({ grid, candidates: Array(81).fill(null) }, givens, PUZZLES.preview(playLine(entry))));
    const r = entry.rating;
    legendHost.replaceChildren(
      h("p", { class: "stage-caption" }, h("b", {}, r ? ratingLine(r, CEILING) : PUZZLES.beingRated),
        PUZZLES.caption(sourceLine(entry), playLine(entry))));
  }

  // ---------- the column ----------

  // A puzzle in a list: its strip; its level across levels (Continue); how far
  // the player got, on every row so that none is a bare strip (D93); where it
  // came from, and a link to Analyse. A level's list is in order of search,
  // easiest to spot first (D68). Coming with the app goes unsaid, and the
  // givens too: the board's caption says them for the puzzle in focus.
  function row(entry, { level = false } = {}) {
    const r = entry.rating;
    const failed = unrated.get(entry.puzzle);
    const rated = !r ? (failed ? PUZZLES.notRated : PUZZLES.rating) : level ? (r.solved ? PUZZLES.level(r.level) : aboveCeiling(CEILING, "short")) : null;
    return h("li", { class: `puzzle-item ${entry.solved ? "solved" : entry.played ? "playing" : "new"}` },
      h("a", {
        class: "puzzle-row", href: `#solve/${entry.puzzle}`, "data-focus": `puzzle-${entry.puzzle}`, "data-puzzle": entry.puzzle,
        "aria-current": entry.puzzle === state.focus ? "true" : null,
        "aria-label": PUZZLES.row(r ? ratingLine(r, CEILING) : rated, sourceLine(entry), playLine(entry)),
        onfocus: () => focus(entry.puzzle),
        // A click or a tap puts the puzzle in focus; the main button or Enter (a
        // click without a pointer) opens it.
        onclick: event => {
          if (!event.detail || event.ctrlKey || event.metaKey || event.shiftKey) return;
          event.preventDefault();
          focus(entry.puzzle);
        },
      },
      r ? miniStrip(r, ratingLine(r, CEILING))
        : h("span", { class: `mini-strip pending${failed ? " failed" : ""}`, title: failed ? sentence(failed) : null, "aria-hidden": "true" }),
      h("span", { class: "puzzle-text" },
        rated ? h("span", { class: "puzzle-what" }, rated) : null,
        h("span", { class: "puzzle-play" }, playLine(entry)),
        level || entry.source === "starter" ? null : h("span", { class: "puzzle-note" }, sourceLine(entry)))),
      simple() ? null : h("a", { class: "link quiet puzzle-analyse", href: `#analyse/${entry.puzzle}`, "data-focus": `analyse-${entry.puzzle}` }, PUZZLES.analyse));
  }

  function started() {
    const found = library.playing(all());
    if (!found.length) return [];
    return [h("p", { class: "lead" }, PUZZLES.continueLabel), h("ul", { class: "puzzle-list" }, found.map(e => row(e, { level: true })))];
  }

  function picker() {
    const entries = all();
    const solved = library.solvedLevels(entries);
    return h("div", { class: "efforts levels", role: "group", "aria-label": PUZZLES.levelGroup }, levels().map(level => {
      const n = entries.filter(e => e.rating && bucket(e.rating) === level).length;
      const name = level === ABOVE ? aboveCeiling(CEILING, "name") : PUZZLES.level(level);
      const label = PUZZLES.levelButton(name, n, solved.has(level));
      return h("button", {
        class: `effort-bar${level === ABOVE ? " beyond" : solved.has(level) ? " solved" : ""}`, type: "button",
        style: `--share: ${level === ABOVE ? 1 : level / CEILING}`, "aria-current": level === state.level ? "step" : null,
        "aria-label": label, title: label, "data-focus": `level-${level}`, onclick: () => pick(level),
      }, h("i", { "aria-hidden": "true" }), h("span", { "aria-hidden": "true" }, level === ABOVE ? aboveCeiling(CEILING, "figure") : String(level)));
    }));
  }

  // The key idea asked of a puzzle made here (D73), among those that can crack
  // the level, each in its idea's colour; with the search, under the button
  // that makes it; fixed while one is made.
  function ideaSwitch() {
    const ideas = offered();
    if (!ideas.length) return null;
    return h("div", { class: "ask-search" },
      h("span", { class: "faint", title: PUZZLES.keyStepAbout }, PUZZLES.keyStep),
      h("div", { class: "switch", role: "group", "aria-label": PUZZLES.keyStepGroup },
        ["any", ...ideas].map(value => h("button", {
          type: "button", "aria-pressed": idea() === value ? "true" : "false", "data-focus": `idea-${value}`,
          class: value === "any" ? null : `idea tone-${value}`, disabled: Boolean(state.making), onclick: () => askIdea(value),
        }, value === "any" ? PUZZLES.any : IDEAS[value].name))));
  }

  // The search asked of a puzzle made here, in the player's words, under the
  // button that makes it (above the list it would read as a filter); fixed
  // while one is made.
  function searchSwitch() {
    return h("div", { class: "ask-search" },
      h("span", { class: "faint", title: SPOT_ABOUT }, PUZZLES.spotting),
      h("div", { class: "switch", role: "group", "aria-label": PUZZLES.spottingGroup },
        Object.entries(SEARCHES).map(([search, name]) => h("button", {
          type: "button", "aria-pressed": state.search === search ? "true" : "false", "data-focus": `search-${search}`,
          disabled: Boolean(state.making), onclick: () => ask(search),
        }, name))));
  }

  // The choices asked of a puzzle to make; beneath them, while one was asked
  // for, Cancel, so that the choices keep the note's width.
  function asked() {
    return [ideaSwitch(), simple() ? null : searchSwitch(),
      state.makeNew ? h("button", { class: "link quiet cancel", type: "button", "data-focus": "make-cancel action", "aria-keyshortcuts": "Escape",
        onclick: () => { state.makeNew = false; render(); } }, PUZZLES.cancel) : null].filter(Boolean);
  }

  // The one wide button, the way in for a player (D68): play the puzzle in
  // focus, at first the level's next one not yet solved, in the list's order;
  // with none, or asked to, make one; stop making it. Above the ceiling,
  // puzzles are never made.
  function action() {
    if (state.making) return { label: PUZZLES.stop, key: "Esc", run: () => { stop(); render(); } };
    const shown = state.makeNew ? null : all().find(e => e.puzzle === state.focus);
    if (shown) {
      return { label: PUZZLES.play(shown.solved, shown.played), key: "↵", href: `#solve/${shown.puzzle}`, primary: true, plays: true };
    }
    if (state.level === ABOVE) return null;
    const ready = search() === "any" && idea() === "any" && state.stored.spares.some(r => r.level === state.level);
    return { label: PUZZLES.make(state.level), key: "N", run: make, primary: true,
      title: ready ? PUZZLES.ready : waitLine(state.level, search()) };
  }

  // What the level's puzzles need beyond one option left, in one line: each
  // idea's dot and name, a link to its lesson.
  function needs(found) {
    if (state.level === ABOVE) return levelAbout(CEILING);
    if (!found.length) return null;
    const ideas = new Set(found.flatMap(e => (e.rating?.strip ?? []).flatMap(round => round.ideas)));
    return levelIdeas([...ideas]).map(idea => h("a", {
      class: `idea tone-${idea}`, href: `#learn/${idea}`, "data-focus": `needs-${idea}`, title: PUZZLES.lesson(idea),
    }, IDEAS[idea].name));
  }

  // Beside a level's puzzles to play, making a new one is one click away: the
  // button then makes it, with the search to ask.
  function makeLink() {
    return state.level === ABOVE ? null : h("p", {}, h("button", { class: "link quiet", type: "button", "data-focus": "make-new action",
      onclick: () => { state.makeNew = true; render(); } }, PUZZLES.makeNew));
  }

  function job() {
    const job = state.making;
    if (job) {
      const climber = climbing();
      const tried = job.climbers.reduce((sum, c) => sum + c.tried, 0);
      return [
        h("p", { class: "result-line" }, climbLine(climber?.rating, job.level, job.search, job.from, job.idea)),
        h("p", { class: "faint" }, h("span", { class: "elapsed" }, elapsed(Date.now() - job.started)),
          PUZZLES.tried(tried)),
      ];
    }
    if (state.failed) return [h("p", { class: "bad" }, sentence(state.failed))];
    const made = state.made?.puzzle === state.focus ? state.made : null;
    if (made) {
      return [
        h("p", { class: "faint" }, madeLine(made)),
        h("div", { class: "row" },
          simple() ? null : h("a", { class: "link quiet", href: `#analyse/${made.puzzle}`, "data-focus": "made-analyse" }, PUZZLES.analyseIt),
          h("button", { class: "link quiet", type: "button", "data-focus": "make-another action", onclick: make }, PUZZLES.another)),
      ];
    }
    return action()?.plays ? [makeLink()] : [];
  }

  // The button, and under it a slot of fixed height: the way to make a new
  // one, the search to ask of it, the job, or how the puzzle in focus was made.
  function drawAction() {
    const a = action() ?? {};
    const attrs = { class: `button wide${a.primary ? " primary" : ""}`, "data-focus": "action", "aria-keyshortcuts": { "↵": "Enter", N: "N", Esc: "Escape" }[a.key] };
    const button = !a.label ? null : a.href
      ? h("a", { ...attrs, href: a.href }, h("span", {}, a.label), h("kbd", { "aria-hidden": "true" }, a.key))
      : h("button", { ...attrs, type: "button", disabled: !a.run, onclick: a.run, title: a.title }, h("span", {}, a.label),
        a.key ? h("kbd", { "aria-hidden": "true" }, a.key) : null);
    actionHost.replaceChildren(...[button, h("div", { class: "making-note" }, asking() ? asked() : job())].filter(Boolean));
  }

  // What is asked of a puzzle made here shows in the list's place, so the
  // button stays put and the column never grows past the screen.
  function asking() {
    const made = state.made && state.made.puzzle === state.focus;
    return !(state.making || state.failed || made || action()?.plays || state.level === ABOVE);
  }

  function level() {
    const found = listed();
    drawAction();
    return [
      picker(),
      h("p", { class: "title" }, state.level === ABOVE ? aboveCeiling(CEILING, "name") : PUZZLES.level(state.level)),
      h("p", { class: "level-about" }, needs(found)),
      actionHost,
      found.length && !asking() ? h("ul", { class: "puzzle-list", "aria-label": REGIONS.levelPuzzles }, found.map(e => row(e))) : null,
    ];
  }

  // The level's list, a page at a time: the page holding the puzzle in focus,
  // and a turned page puts its first puzzle in focus.
  function fitList() {
    const list = levelHost.querySelector(".puzzle-list");
    if (!list) return;
    const shown = list.querySelector(".puzzle-row[aria-current=true]")?.closest("li");
    state.page = fitPages(list, { at: state.page, keep: shown, pick: i => {
      state.page = i;
      fitPages(list, { at: i, pick: () => {} });
      const first = [...list.querySelectorAll(".puzzle-row")].find(r => !r.closest("li").hidden);
      if (first) focus(first.dataset.puzzle);
      render();
    } });
  }

  // ---------- render ----------

  const render = () => keepFocus(draw);

  function draw() {
    if (state.error) return root.replaceChildren(failure(state.error, { openPuzzle, title: PUZZLES.failed }));
    if (!state.loaded) return;
    drawStage();
    continueHost.replaceChildren(...started());
    levelHost.replaceChildren(...level().filter(Boolean));
    fitList();
  }

  function onKey(event) {
    if (!state.loaded || (event.target instanceof Element && event.target.closest("input, textarea, select, dialog"))) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const k = event.key;
    const onControl = event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement;
    if (k === "ArrowLeft" || k === "ArrowRight") {
      const all = levels();
      pick(all[Math.max(0, Math.min(all.length - 1, all.indexOf(state.level) + (k === "ArrowRight" ? 1 : -1)))]);
    } else if (k === "ArrowDown" || k === "ArrowUp") {
      const rows = [...root.querySelectorAll(".puzzle-row")];
      const i = rows.indexOf(document.activeElement);
      const to = rows[i < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, i + (k === "ArrowDown" ? 1 : -1)))];
      if (to?.closest("li").hidden) { focus(to.dataset.puzzle); render(); }
      root.querySelector(`.puzzle-row[data-puzzle="${to?.dataset.puzzle}"]`)?.focus();
    } else if (k === "n" || k === "N") make();
    else if (k === "Escape" && state.making) { stop(); render(); }
    else if (k === "Escape" && state.makeNew) { state.makeNew = false; render(); }
    else if (k === "Enter" && !onControl && action()?.href) location.hash = action().href;
    else return;
    event.preventDefault();
  }
  document.addEventListener("keydown", onKey);

  // Unrated puzzles (opened ones) are rated one after another; one the engine
  // fails to rate keeps its message on its row, and the others go on.
  const unrated = new Map(); // puzzle -> why it could not be rated
  function rateMissing() {
    const next = Object.values(state.stored.entries)
      .find(e => !e.rating && !unrated.has(e.puzzle) && !all().find(x => x.puzzle === e.puzzle)?.rating);
    if (!next) return;
    library.rate(engine, next.puzzle).then(() => library.load()).then(stored => { state.stored = stored; },
      error => { unrated.set(next.puzzle, error.message); }).then(() => { render(); rateMissing(); });
  }

  const loading = [library.load(), store.get(STORE_KEY), engine("ideas", {}).catch(() => [])];
  Promise.all(loading).then(([stored, saved, offeredIdeas]) => {
    state.loaded = true;
    state.ideaLevels = offeredIdeas.at(-1)?.levels ?? {};
    if (typeof saved?.idea === "string") state.idea = saved.idea;
    state.stored = stored;
    if (!levels().includes(state.level)) {
      const solved = library.solvedLevels(all());
      state.level = levels().includes(saved?.level) ? saved.level : LEVELS.find(l => !solved.has(l)) ?? 1;
    }
    if (saved?.search in SEARCHES) state.search = saved.search;
    const first = library.playing(all())[0]?.puzzle ?? firstOf(listed());
    if (first) focus(first);
    onPosition({ level: state.level });
    render();
    rateMissing();
  }, error => { state.error = error.message; render(); });

  return {
    show({ level }) {
      if (state.loaded && level !== null && level !== state.level) pick(level);
    },
    destroy() {
      stop();
      document.removeEventListener("keydown", onKey);
    },
  };
}
