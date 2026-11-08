// Solve: a plain Sudoku that knows why (APP_CONCEPT.md §4). The player's moves
// are facts; the engine answers for the position (service.position): the board,
// the mistakes (a check), and the next round, which the hint ladder climbs.
// The board shows the engine's candidates, which the player removes, or the
// player's own corner and centre notes, which the engine never reads (D70).
// Ask why asks why a digit does or doesn't go in the selected cell
// (service.ask); so does a click on a candidate in that mode. Each move is
// judged against the easiest steps at the position it was made in (D71):
// Strict says so after every move, and the solved puzzle shows the path.
//
// The time the solve takes runs while the page shows and the puzzle is not
// solved, kept with the sheet; the head shows it on request.
//
// The column reads top to bottom and its controls stay put: what is left, the
// pad with its edits and the check, then help. Help is headed by one button as
// wide as the pad: the ladder itself, its label naming the next rung and, on
// the last, the step it applies. What help says, or the answer to a question,
// follows below it.

import { createBoard } from "../board.js";
import { h, keepFocus, onBackground, shortcuts } from "../dom.js";
import { cellName, rowOf } from "../geometry.js";
import * as library from "../library.js";
import { padKeys, padMode } from "../pad.js";
import * as play from "../play.js";
import { simple } from "../settings.js";
import { boardView, fitCard, legend, markStep, stepCard, walkKey, withSelection } from "../step.js";
import * as store from "../store.js";
import { CEILING, pathStrip, renderStrip } from "../strip.js";
import {
  BOARD, IDEAS, NEXT_RUNG, PAD, REGIONS, SOLVE, STEP, aboveCeiling, applyLabel, askLine, clock, essential, hintLine, sentence,
  shapeName, stopLine,
} from "../text.js";
import { failure } from "./failure.js";

const KEY_NAMES = { H: "H", "↵": "Enter" };
const SHORTCUTS = () => {
  const { keys: k, shortcuts: s } = SOLVE;
  return [
    [[k.arrows], s.move], [["Shift", k.arrows], s.more], [["Ctrl", k.click], s.more],
    [["1–9"], s.place], [["Shift", "1–9"], s.corner], [["Ctrl", "1–9"], s.centre],
    [["?"], s.ask], [["⌫"], s.erase], [["H"], s.hint], [["C"], s.candidates], [["Esc"], s.close],
    [["Ctrl", "Z"], s.undo],
  ];
};
const CANDIDATES_KEY = "candidates"; // the engine's candidates (true) or the player's notes, for every puzzle
const STRICT_KEY = "strict"; // whether each move's verdict shows, for every puzzle
const CLOCK_KEY = "clock"; // whether the time shows, for every puzzle
const MODES = ["place", "corner", "centre", "remove", "ask"];
const NOTES = ["corner", "centre"];

export function mountSolve(root, { puzzle, engine, openPuzzle, onRefused, sample }) {
  const givens = [...puzzle].map(Number);
  const state = {
    history: play.history(), mode: "place", // what a digit does: place, corner, centre, remove, ask
    selected: givens.indexOf(0), also: [], // the cell in focus, and more selected cells
    board: null, mistakes: [], solved: false, unique: undefined, error: null, refused: false,
    next: null, // the engine's next round, { stop } or null while it thinks
    hint: 0, showMistakes: false, ask: null, ui: { raw: false, walk: null },
    current: false, // whether board and mistakes are the engine's answer for the facts as they are
    candidates: false, // the engine's candidates, or the player's notes (a shown step brings back only its own)
    rating: null, ratingError: null, // the puzzle's rating from the library (library.js), once known, or why not
    strict: false, verdicts: {}, last: [], // the verdicts on the moves (play.judge), and the last move's facts
    clock: false, // whether the time shows
  };
  let positionCall = null;
  const waiting = []; // moves made before their position's round arrived, judged in turn
  let judging = null;
  // The time since the last move (or since the puzzle opened here), paused
  // while the page is hidden: what each move took.
  let since = performance.now();
  let hiddenAt = null;
  // The solve's time: what was kept, and since when it runs (null: paused,
  // as it is until the first position arrives).
  let spent = 0;
  let runFrom = null;
  const time = () => spent + (runFrom === null ? 0 : performance.now() - runFrom);
  const pause = () => { spent = time(); runFrom = null; };
  const run = () => { if (runFrom === null && !document.hidden && !state.solved) runFrom = performance.now(); };
  // The screen stays on while Solve is open (U5). The browser lets go of the
  // lock whenever the page is hidden, so it is asked for again on return.
  let awake = null;
  let open = true;
  const stayAwake = () => navigator.wakeLock?.request("screen").then(lock => {
    if (open) awake = lock;
    else lock.release();
  }, () => {});
  stayAwake();
  const onVisibility = () => {
    if (document.hidden) {
      hiddenAt = performance.now();
      pause();
      if (state.board) save();
    } else {
      if (hiddenAt !== null) { since += performance.now() - hiddenAt; hiddenAt = null; }
      run();
      stayAwake();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  const ticking = setInterval(() => {
    const shown = statusHost.querySelector(".clock[aria-pressed='true']");
    if (shown) shown.textContent = clock(time());
  }, 1000);

  const boardHost = h("div", { class: "board-host" });
  const legendHost = h("div", { class: "legend", "aria-live": "polite" });
  const statusHost = h("section", { class: "status", "aria-live": "polite" });
  const padHost = h("section", { class: "pad", "aria-label": REGIONS.digits });
  const helpHost = h("section", { class: "help", "aria-live": "polite" });
  root.replaceChildren(
    h("div", { class: "stage", role: "region", "aria-label": REGIONS.board }, boardHost, legendHost),
    h("div", { class: "side" }, statusHost, padHost, helpHost),
  );
  shortcuts(SHORTCUTS());
  // A press selects (with Ctrl, Cmd or Shift, one more cell, or one fewer) and a
  // drag selects on; a click in Ask why asks about the candidate under it. A
  // tap on the one cell selected lets it go, as Esc does.
  let placedIn = null; // the cell a digit was last placed in, where the arrows start again
  let letGo = false; // a press on the one cell selected, let go on release unless it drags
  const board = createBoard(boardHost, {
    onPress: (cell, { add }) => {
      letGo = !add && state.selected === cell && !state.also.length;
      if (!letGo) select(cell, add);
    },
    onDrag: cell => { letGo = false; extend(cell); },
    onRelease: (cell, d) => {
      if (state.mode === "ask" && state.candidates && !state.board?.grid[cell]) digit(d);
      else if (letGo && cell === state.selected) deselect();
      letGo = false;
    },
    onCandidate: (cell, d) => { if (state.mode === "ask") digit(d); },
    interactive: true,
  });

  const facts = () => state.history.sheet.facts;
  const notes = () => state.history.sheet.notes;
  const chosen = () => (state.selected === null ? [] : [state.selected, ...state.also]);
  const round = () => (state.next && !state.next.stop ? state.next : null);
  const shownMove = () => (state.hint >= 1 && round() && !state.mistakes.length ? round().moves[0] : null);

  // ---------- engine ----------

  function refresh() {
    positionCall?.abort();
    positionCall = new AbortController();
    state.next = null;
    state.error = null;
    state.current = false;
    engine("position", { puzzle, facts: facts() }, {
      signal: positionCall.signal,
      onEvent(event) {
        if (event.type === "position") {
          Object.assign(state, { board: event.board, mistakes: event.mistakes, solved: event.solved, unique: event.unique, current: true });
          if (!state.solved) run();
          else if (runFrom !== null) { pause(); save(); }
          const verdicts = play.withMistakes(state.verdicts, state.mistakes);
          if (verdicts !== state.verdicts) { state.verdicts = verdicts; save(); }
          played();
        } else if (event.type === "round") state.next = event;
        else if (event.type === "stop") state.next = { stop: true, limited: event.limited };
        render();
      },
    }).catch(error => {
      if (error.cancelled) return;
      state.error = error.message;
      // A refusal before any board is the puzzle's, not a lost engine.
      if (error.refused && !state.board) { state.refused = true; onRefused(puzzle); }
      render();
    });
  }

  // The library keeps how far the player got (library.withPlay). The first
  // time, the puzzle, now accepted by the engine, joins the library, and its
  // rating comes from there or from the engine.
  function played() {
    const left = state.board.grid.filter(d => !d).length;
    const saved = library.update(stored => library.withPlay(stored, puzzle, { left, solved: state.solved, started: facts().length > 0 }));
    if (joined) return;
    joined = true;
    saved
      .then(stored => stored.entries[puzzle]?.rating ?? library.rate(engine, puzzle))
      .then(rating => { state.rating = rating; }, error => { state.ratingError = error.message; }).then(render);
  }
  let joined = false;

  // A new sheet, or the facts alone. Only a change of facts moves the position,
  // so only it asks the engine again and closes what help says. The facts a
  // move adds are judged at the position before it: with its round, if it has
  // arrived; `helped` when help showed or asked about them.
  function change(next, { helped = false } = {}) {
    const before = state.history.sheet;
    const round = state.next;
    state.history = play.commit(state.history, next);
    const facts = play.added(before.facts, state.history.sheet.facts);
    if (facts.length) judgeMove(facts, before.facts, round, helped || state.hint > 0 || Boolean(state.ask));
    settle(before);
  }

  const changeFacts = (next, how) => change(play.sheet(next, notes()), how);

  function judgeMove(facts, before, round, helped) {
    const now = performance.now();
    const how = { helped, took: Math.round(now - since) };
    since = now;
    state.last = facts.map(play.factKey);
    record(play.judge(facts, round, how));
    if (round) return;
    waiting.push({ facts, before, how });
    if (waiting.length === 1) judgeNext();
  }

  // The round of a waiting move's position, asked for again.
  function judgeNext() {
    const job = waiting[0];
    if (!job) return;
    const call = judging = new AbortController();
    const done = round => {
      call.abort();
      waiting.shift();
      if (round) record(play.judge(job.facts, round, job.how));
      judgeNext();
    };
    engine("position", { puzzle, facts: job.before }, {
      signal: call.signal,
      onEvent(event) {
        if (event.type === "round") done(event);
        else if (event.type === "stop") done({ stop: true });
      },
    }).catch(error => { if (!error.cancelled) done(null); });
  }

  function record(verdicts) {
    state.verdicts = play.withMistakes({ ...state.verdicts, ...verdicts }, state.mistakes);
    save();
    render();
  }

  function save() {
    library.savePlay(puzzle, { ...state.history.sheet, verdicts: play.kept(facts(), state.verdicts), time: Math.round(time()) });
  }

  function travel(step) {
    const before = state.history.sheet;
    state.history = step(state.history);
    settle(before);
  }

  function settle(before) {
    const now = state.history.sheet;
    if (now === before) return;
    save();
    if (now.facts !== before.facts) {
      state.hint = 0;
      state.showMistakes = false; // a check is of the facts it saw: stale once they change
      closeAsk();
      state.ui = { raw: false, walk: null };
      refresh();
    }
    render();
  }

  // ---------- input ----------

  // One cell, or with `add` one more (a selected one is let go, unless it is
  // the last).
  function select(cell, add = false) {
    if (state.solved) return;
    const cells = chosen();
    if (!add) state.also = [];
    else if (cells.includes(cell) && cells.length > 1) {
      const rest = cells.filter(c => c !== cell);
      [state.selected, state.also] = [rest[0], rest.slice(1)];
      return focusChanged();
    } else if (!cells.includes(cell) && state.selected !== null) state.also = [state.selected, ...state.also];
    state.selected = cell;
    focusChanged();
  }

  // A cell dragged over, or reached by Shift and an arrow, joins the selection
  // and takes the focus.
  function extend(cell) {
    if (state.solved) return;
    state.also = chosen().filter(c => c !== cell);
    state.selected = cell;
    focusChanged();
  }

  function deselect() {
    state.selected = null;
    state.also = [];
    focusChanged();
  }

  function focusChanged() {
    if (state.ask && (state.ask.cell !== state.selected || state.also.length)) closeAsk();
    render();
  }

  // The selected cells a note can go in: those without a digit.
  const empties = () => chosen().filter(cell => !state.board.grid[cell]);

  function digit(d, mode = state.mode) {
    const cell = state.selected;
    if (cell === null || !state.board || state.solved) return;
    if (NOTES.includes(mode)) {
      if (!empties().length) return;
      showNotes();
      return change(play.sheet(facts(), play.toggleNote(notes(), empties(), mode, d)));
    }
    if (givens[cell] || state.also.length) return; // a digit, a removal or a question is about one cell
    if (mode === "ask") return askAbout(cell, d);
    if (mode === "remove") return state.board.grid[cell] ? undefined : changeFacts(play.toggleMark(facts(), cell, d));
    // The same digit again leaves it: a double tap never erases (Erase does, D93).
    if (state.board.grid[cell] === d) return;
    changeFacts(play.place(facts(), cell, d));
    // Placed, the cell is done and lets go; the arrows start from it again (D99).
    placedIn = cell;
    deselect();
  }

  function hint() {
    if (state.solved) return;
    closeAsk();
    state.hint = Math.min(state.hint + 1, 4);
    render();
  }

  function closeHint() {
    state.hint = 0;
    state.ui = { raw: false, walk: null };
  }

  function closeAsk() {
    state.ask?.controller.abort();
    state.ask = null;
  }

  // One question about a digit in a cell: in an empty cell, first why it
  // can't go there; if the engine's check says it does go there, why it must.
  // A player's digit is asked about as placed. With the player's notes shown,
  // any digit can be asked about, so the question never tells the candidates.
  function askAbout(cell, d) {
    const placed = state.board.grid[cell];
    if (placed && (placed !== d || !facts().some(f => f.cell === cell && f.value))) return;
    if (!placed && state.candidates && !(state.board.candidates[cell] ?? []).includes(d)) return;
    ask(cell, d, Boolean(placed), !placed);
  }

  function ask(cell, d, value, probing = false) {
    closeAsk();
    closeHint();
    const current = { cell, digit: d, value, probing, events: [], controller: new AbortController() };
    state.ask = current;
    engine("ask", { puzzle, facts: facts(), fact: { cell, digit: d, value } }, {
      signal: current.controller.signal,
      onEvent(event) {
        if (state.ask !== current) return;
        if (probing && event.type === "answer" && event.status === "false") return ask(cell, d, true);
        current.probing = false;
        current.events.push(event);
        render();
      },
    }).catch(error => {
      if (!error.cancelled && state.ask === current) { current.error = error.message; render(); }
    });
    render();
  }

  function applyStep(move) {
    let next = facts();
    for (const fact of essential(move.conclusions)) {
      next = fact.value ? play.place(next, fact.cell, fact.digit) : [...next, fact];
    }
    changeFacts(next, { helped: true });
  }

  function toggleClock() {
    state.clock = !state.clock;
    store.set(CLOCK_KEY, state.clock);
    render();
  }

  function toggleStrict() {
    state.strict = !state.strict;
    store.set(STRICT_KEY, state.strict);
    render();
  }

  // The engine's candidates or the player's notes; a mode that edits the other
  // gives way to Place.
  function setCandidates(on) {
    if (state.candidates === on) return;
    state.candidates = on;
    if (on && NOTES.includes(state.mode)) state.mode = "place";
    store.set(CANDIDATES_KEY, on);
  }

  function toggleCandidates() {
    setCandidates(!state.candidates);
    render();
  }

  const showNotes = () => setCandidates(false);

  function chooseMode(mode) {
    if (NOTES.includes(mode)) setCandidates(false); // the candidates come on only by their own button (D98)
    state.mode = mode;
    render();
  }

  function restart() {
    state.selected = givens.indexOf(0);
    state.also = [];
    state.showMistakes = false;
    judging?.abort();
    waiting.length = 0;
    Object.assign(state, { verdicts: {}, last: [] });
    spent = 0;
    runFrom = null;
    change(play.sheet());
  }

  // ---------- board ----------

  // With the player's notes, a step shown on the board brings back only the
  // candidates it marks, the rest of the board keeping the notes: a hint never
  // shows more than it says. Several selected cells have no reading aids.
  function view() {
    const out = withSelection(boardView(state.board, givens, BOARD.label), state.solved ? null : state.selected);
    if (state.also.length && !state.solved) Object.assign(out, { also: new Set(state.also), peers: null, sameDigit: null });
    for (const cell of play.clashes(state.board.grid)) out.shade.set(cell, ["clash"]);
    if (state.showMistakes) for (const m of state.mistakes) out.shade.set(m.cell, ["mistake"]);
    else if (state.strict) for (const m of state.mistakes) if (state.last.includes(play.factKey(m))) out.shade.set(m.cell, ["mistake"]);
    // A candidate already ruled out: the placements that rule it out.
    const asked = state.ask?.events.at(-1);
    if (asked?.status === "decided" && asked.by?.length) {
      out.peers = null;
      for (const b of asked.by) out.shade.set(b.cell, ["by"]);
    }
    const shown = shownStep();
    if (shown) {
      out.peers = null;
      markStep(out, shown.move, { show: shown.show, ui: state.ui });
    }
    if (!state.candidates) {
      const marked = out.candidates.map((digits, cell) => digits?.filter(d => out.marks.has(`${cell}:${d}`)) ?? []);
      // The player's own removals show struck through, among the notes.
      for (const f of facts()) {
        const key = `${f.cell}:${f.digit}`;
        if (f.value || state.board.grid[f.cell] || out.marks.has(key)) continue;
        marked[f.cell] = [...marked[f.cell], f.digit].sort();
        out.marks.set(key, { mark: "struck", idea: null });
      }
      Object.assign(out, { candidates: marked.map(digits => (digits.length ? digits : null)), notes: notes() });
    }
    return out;
  }

  // The step on the board: an answer to "why", or the hint from its second rung.
  function shownStep() {
    const last = state.ask?.events.at(-1);
    if (last?.type === "answer" && last.move) return { move: last.move, show: 4 };
    if (last?.type === "searching" && last.best && state.ask.showBest) return { move: last.best, show: 4 };
    if (state.hint >= 2 && shownMove()) return { move: shownMove(), show: state.hint };
    return null;
  }

  // ---------- side ----------

  // The puzzle's level beside what is left, once the library has its rating.
  // The puzzle named as Analyse names it, by its level, then what is left.
  function status() {
    const r = state.rating;
    const title = !r ? SOLVE.title : r.solved ? SOLVE.level(r.level) : r.limited ? aboveCeiling(CEILING, "title") : SOLVE.beyond;
    const left = state.board.grid.filter(d => !d).length;
    const shown = h("button", { class: "button text clock", type: "button", "aria-pressed": state.clock ? "true" : "false", "data-focus": "clock",
      title: state.clock ? SOLVE.hideTime : SOLVE.showTime, onclick: toggleClock }, state.clock ? clock(time()) : SOLVE.time);
    // What is left beside the title, so the head takes one line.
    const out = [h("div", { class: "verdict-head" }, h("p", { class: "title" }, title),
      h("p", { class: "meta left" }, SOLVE.left(left)), shown)];
    if (state.ratingError) out.push(h("p", { class: "meta" }, SOLVE.unknown(sentence(state.ratingError))));
    if (state.unique === false) out.push(h("p", { class: "meta" }, SOLVE.several));
    if (state.unique === null) out.push(h("p", { class: "meta bad" }, SOLVE.none));
    return out;
  }

  function pad() {
    const counts = Array(10).fill(0);
    state.board.grid.forEach(d => counts[d]++);
    const cell = state.selected;
    const one = !state.also.length;
    const empty = one && cell !== null && !state.board.grid[cell];
    const candidates = empty ? state.board.candidates[cell] ?? [] : [];
    const mine = d => facts().some(f => f.cell === cell && f.digit === d && !f.value);
    const own = one && cell !== null && !empty && facts().some(f => f.cell === cell && f.value);
    const noting = empties();
    // Noting: a key is the note for d, pressed when every selected cell has it.
    // Removing: a key is the selected cell's pencil mark for d. Asking: a key
    // is a question about one of its candidates, or about the player's digit.
    // What is left of each digit shows in every mode, so no key changes.
    const key = d => {
      const left = 9 - counts[d] || null;
      if (NOTES.includes(state.mode)) {
        const pressed = noting.length > 0 && noting.every(c => play.noted(notes(), c, state.mode, d));
        return { label: SOLVE.note(state.mode, d), disabled: !noting.length, pressed, left };
      }
      if (state.mode === "ask") {
        const can = empty ? !state.candidates || candidates.includes(d) : own && state.board.grid[cell] === d;
        return { label: SOLVE.askKey(d, cellName(cell ?? 0)), disabled: !can, left };
      }
      if (state.mode === "place") return { label: SOLVE.place(d), disabled: counts[d] === 9 || !one, left };
      // Shown, a candidate already gone has nothing to remove; hidden, every
      // digit may go, so the keys never tell the candidates (D98).
      const gone = empty && mine(d);
      const live = state.candidates ? candidates.includes(d) : empty;
      return { label: gone ? SOLVE.giveBack(d) : SOLVE.remove(d), disabled: !live && !gone, gone, left };
    };
    const can = { undo: state.history.past.length > 0, redo: state.history.future.length > 0 };
    const n = state.mistakes.length;
    // The check's answer colours its button, once the engine has the facts as
    // they are; a move makes it stale, and the button plain again.
    const checked = state.showMistakes && state.current;
    return [
      padMode(state.mode, chooseMode, MODES, { keyless: [state.candidates ? "corner" : "remove"], chips: false }),
      padKeys({ mode: state.mode, key, onDigit: d => digit(d) }),
      h("div", { class: "edit" },
        h("button", { class: "button text", type: "button", disabled: !can.undo, "data-focus": "undo redo",
          onclick: () => travel(play.undo) }, SOLVE.undo),
        h("button", { class: "button text", type: "button", disabled: !can.redo, "data-focus": "redo undo",
          onclick: () => travel(play.redo) }, SOLVE.redo),
        h("button", { class: "button text", type: "button", disabled: !play.owns(state.history.sheet, chosen()), "data-focus": "erase undo",
          onclick: () => change(play.erase(state.history.sheet, chosen())) }, SOLVE.erase),
        h("span", { class: "push" }),
        h("button", { class: "button text", type: "button", "aria-pressed": state.candidates ? "true" : "false", "data-focus": "candidates",
          "aria-keyshortcuts": "C", onclick: toggleCandidates }, SOLVE.candidates),
        h("button", { class: "button text", type: "button", "aria-pressed": state.strict ? "true" : "false", "data-focus": "strict",
          title: SOLVE.strictAbout, onclick: toggleStrict }, SOLVE.strict),
        h("button", {
          class: `button text check${checked ? (n ? " bad" : " good") : ""}`, type: "button", "aria-pressed": state.showMistakes ? "true" : "false",
          "data-focus": "check", title: checked ? SOLVE.mistakes(n) : SOLVE.checkAbout,
          "aria-label": checked ? SOLVE.checked(n) : SOLVE.check,
          onclick: () => { state.showMistakes = !state.showMistakes; render(); } }, SOLVE.check)),
    ];
  }

  // The ladder button: the next rung, or the step it applies.
  function hintAction() {
    const proven = state.ask?.events.at(-1);
    if (proven?.type === "answer" && proven.status === "proven") {
      return { label: applyLabel(proven.move), key: "↵", run: () => applyStep(proven.move), primary: true };
    }
    if (state.hint === 0) return { label: NEXT_RUNG[0], key: "H", run: hint };
    if (state.mistakes.length) {
      return state.showMistakes ? { label: NEXT_RUNG[0] } : { label: SOLVE.showMistake, run: () => { state.showMistakes = true; render(); } };
    }
    const move = shownMove();
    if (!move) return { label: NEXT_RUNG[Math.min(state.hint, 3)] };
    if (state.hint < 4) return { label: NEXT_RUNG[state.hint], key: "H", run: hint };
    return { label: applyLabel(move), key: "↵", run: () => applyStep(move), primary: true };
  }

  // Help: the ladder button heads it, in the same place in every state; a line
  // below it names what is open (the question, or the hint's idea) and closes
  // it; what help says follows.
  function help() {
    const action = hintAction();
    const button = h("button", { class: `button wide${action.primary ? " primary" : ""}`, type: "button",
      disabled: !action.run, onclick: action.run, "data-focus": "hint close", "aria-keyshortcuts": KEY_NAMES[action.key] },
    h("span", {}, action.label), action.key ? h("kbd", { "aria-hidden": "true" }, action.key) : null);
    if (state.error) return [button, h("p", { class: "bad" }, sentence(state.error))];
    if (state.ask) {
      const { cell, digit: d, value, probing } = state.ask;
      const name = cellName(cell);
      const question = probing ? SOLVE.probe(d, name) : value ? SOLVE.whyIs(d, name) : SOLVE.whyNot(d, name);
      return [button, context(h("p", { class: "lead" }, question), () => closeAsk()), ...answer()];
    }
    if (state.hint) return [button, context(hintHead(), closeHint), ...coach()];
    return [button, strictLine() ?? padLine()];
  }

  // Why the pad has nothing to do, when it has not: no cell, or several where
  // the mode takes one.
  function padLine() {
    if (state.selected === null) return h("p", { class: "meta" }, PAD.pickCell);
    if (state.also.length && !NOTES.includes(state.mode)) return h("p", { class: "meta" }, SOLVE.oneCell);
    return null;
  }

  // Strict: the last move's verdict, in the player's words (D68, D71). A move
  // that was not one of the easiest steps may be a harder step or a guess;
  // Ask why takes it back and asks, at the position it was made in.
  function strictLine() {
    const key = state.last[0];
    const v = key && state.verdicts[key];
    if (!state.strict || !v || !facts().some(f => play.factKey(f) === key)) return null;
    if (v.status === "pending") return h("p", { class: "searching" }, SOLVE.checking);
    if (v.status === "wrong") return h("p", { class: "help-line" }, SOLVE.wrong);
    if (v.status === "easiest") {
      return h("p", {}, h("span", { class: `idea tone-${v.idea}` }, SOLVE.easiest(IDEAS[v.idea].name)));
    }
    const top = state.history.past.at(-1);
    const undoable = top && play.added(top.facts, facts()).some(f => play.factKey(f) === key);
    return h("p", { class: "help-line" }, v.easiest === null ? SOLVE.notFound : SOLVE.notEasiest,
      undoable ? h("button", { class: "link quiet", type: "button", "data-focus": "ask-last hint", onclick: askLast }, SOLVE.askWhy) : null);
  }

  function askLast() {
    const [cell, digit, value] = state.last[0].split(":").map(Number);
    travel(play.undo);
    ask(cell, digit, Boolean(value));
  }

  function context(what, close) {
    return h("div", { class: "context" }, what, h("span", { class: "closer" },
      h("button", { class: "link quiet", type: "button", "data-focus": "close hint", "aria-keyshortcuts": "Escape",
        onclick: () => { close(); render(); } }, SOLVE.close), h("kbd", { "aria-hidden": "true" }, "Esc")));
  }

  // The hint's head, beside Close: its idea (with its shape once the step
  // shows), or why there is no hint.
  function hintHead() {
    if (state.mistakes.length) return h("p", { class: "help-line" }, SOLVE.wrongDigit);
    if (!state.next) return h("p", { class: "searching" }, SOLVE.looking);
    if (state.next.stop) {
      return h("p", { class: "help-line" }, stopLine(state.next.limited));
    }
    const move = shownMove();
    const shape = state.hint >= 4 ? shapeName(move) : null;
    return h("span", { class: `idea tone-${move.idea}` }, STEP.idea(IDEAS[move.idea].name, shape));
  }

  function coach() {
    const move = state.mistakes.length || !round() ? null : shownMove();
    if (!move) return [];
    // The ladder button already names the step and the head its idea, so the
    // card leaves them out; Solve speaks in the player's words, without the
    // numbers (D68).
    if (state.hint >= 4) return [stepCard(move, state.ui, render, { title: false, figures: false, meta: false, details: !simple() })];
    return [h("p", { class: "help-line" }, hintLine(move, state.hint))];
  }

  function answer() {
    const ask = state.ask;
    const out = [];
    const last = ask.events.at(-1);
    if (ask.error) out.push(h("p", { class: "bad" }, sentence(ask.error)));
    else if (!last) out.push(h("p", { class: "searching" }, SOLVE.lookingAsk));
    else if (last.type === "searching") {
      out.push(h("p", { class: `searching${ask.stopped ? " done" : ""}` }, last.best ? SOLVE.proves(ask.stopped) : SOLVE.notYet(ask.stopped)));
      if (last.best && ask.showBest) out.push(stepCard(last.best, state.ui, render, { figures: false, details: !simple() }));
      out.push(h("div", { class: "row" },
        last.best ? h("button", { class: "button", type: "button", "data-focus": "show-best close",
          onclick: () => { ask.showBest = !ask.showBest; render(); } },
          ask.showBest ? SOLVE.hideStep : SOLVE.showStep) : null,
        ask.stopped ? null : h("button", { class: "button", type: "button", "data-focus": "stop show-best close",
          onclick: () => { ask.stopped = true; ask.controller.abort(); render(); } }, SOLVE.stopSearching)));
    } else if (last.status === "proven") {
      // The ladder button applies it, so the card leaves out its headline.
      out.push(stepCard(last.move, state.ui, render, { title: false, figures: false, details: !simple() }));
    } else {
      out.push(h("p", { class: "help-line" }, askLine(last.status, ask, last.by)));
    }
    if (state.mistakes.length) out.push(h("p", { class: "faint" }, SOLVE.leavesOut));
    return out;
  }

  // Solved: the puzzle's strip, its level on the line, each bar a way into
  // that round in Analyse; then where to go next.
  function finished() {
    const rating = state.rating;
    const r = rating?.solved ? rating : null;
    const another = style => h("a", { class: style, href: r ? `#puzzles/${r.level}` : "#puzzles" }, SOLVE.another(r?.level));
    const strip = h("div", { class: "strip-host" });
    if (rating) {
      renderStrip(strip, { rounds: rating.strip, ceiling: CEILING, level: rating.level, final: true, limited: rating.limited, current: null,
        onSelect: simple() ? null : index => { location.hash = `#analyse/${puzzle}/${index}`; } });
    }
    // The player's path beneath the puzzle's strip, once any move was judged.
    const moves = play.path(facts(), state.verdicts);
    const easiest = moves.filter(m => m.status === "easiest");
    const helped = easiest.filter(m => m.helped).length;
    const total = time();
    const said = SOLVE.path(easiest.length - helped, helped, moves.length, total);
    const yours = moves.some(m => m.status !== "pending") ? [pathStrip(moves, said, r?.level), h("p", { class: "meta" }, said)] : [];
    return [h("div", { class: "done-panel" },
      h("p", { class: "title" }, SOLVE.solved),
      rating ? strip : null,
      ...yours,
      h("div", { class: "actions" },
        simple() ? another("button primary") : h("a", { class: "button primary", href: `#analyse/${puzzle}` }, SOLVE.howHard),
        h("div", { class: "row" },
          simple() ? null : another("link quiet"),
          h("button", { class: "link quiet", type: "button", onclick: restart }, SOLVE.again))))];
  }

  // ---------- render ----------

  function render() {
    keepFocus(draw);
  }

  function draw() {
    if (!state.board) {
      if (state.error) root.replaceChildren(failure(state.error, { openPuzzle, back: state.refused ? sample : null }));
      return;
    }
    const shown = view();
    board.render(shown);
    const rule = [...shown.shade.values()].some(roles => roles.includes("by") || roles.includes("clash"));
    legendHost.replaceChildren(...(shown.idea || state.showMistakes || rule ? legend(shown) : []));
    const done = state.solved && !state.ask;
    if (done) {
      statusHost.replaceChildren(...finished());
      padHost.replaceChildren();
      helpHost.replaceChildren();
      return;
    }
    statusHost.replaceChildren(...status());
    padHost.replaceChildren(...pad());
    helpHost.replaceChildren(...help().filter(Boolean));
    fitCard(helpHost, state.ui, render);
  }

  function onKey(event) {
    if (event.target instanceof Element && event.target.closest("input, textarea, select, dialog")) return;
    const k = event.key;
    const mod = event.ctrlKey || event.metaKey;
    const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
    const shown = shownStep();
    if (shown && walkKey(event, shown.move, state.ui)) render();
    else if (mod && k.toLowerCase() === "z") travel(event.shiftKey ? play.redo : play.undo);
    else if (mod && k.toLowerCase() === "y") travel(play.redo);
    else if (!event.altKey && (/^Digit[1-9]$/.test(event.code) || /^[1-9]$/.test(k))) {
      // Ctrl a centre note; Shift a corner note, or a removal while the board
      // shows the engine's candidates.
      digit(Number(event.code.slice(5) || k), mod ? "centre" : event.shiftKey ? (state.candidates ? "remove" : "corner") : state.mode);
    } else if (mod || event.altKey) return;
    else if (k === "?") chooseMode(state.mode === "ask" ? "place" : "ask");
    else if (k in moves) {
      const from = state.selected ?? placedIn ?? 40;
      const to = from + moves[k];
      if (to < 0 || to > 80 || (Math.abs(moves[k]) === 1 && rowOf(to) !== rowOf(from))) return;
      if (event.shiftKey) extend(to);
      else select(to);
    } else if (k === "Backspace" || k === "Delete") change(play.erase(state.history.sheet, chosen()));
    else if (k === "h" || k === "H") hint();
    else if (k === "c" || k === "C") toggleCandidates();
    else if (k === "Enter" && hintAction().primary && !(event.target instanceof HTMLButtonElement)) hintAction().run?.();
    else if (k === "Escape") {
      // What is open closes first; then the selection is let go.
      if (state.ask || state.hint) { closeAsk(); closeHint(); render(); } else deselect();
    }
    else return;
    event.preventDefault();
  }
  document.addEventListener("keydown", onKey);
  // A press on the bare background lets the selection go (D99).
  const offBackground = onBackground(() => { if (state.selected !== null) deselect(); });

  Promise.all([library.loadPlay(puzzle), store.get(CANDIDATES_KEY), store.get(STRICT_KEY), store.get(CLOCK_KEY)]).then(([saved, candidates, strict, shown]) => {
    if (saved) {
      state.history = play.history(play.sheet(saved.facts, saved.notes));
      state.verdicts = saved.verdicts;
      spent = saved.time;
    }
    if (shown === true) state.clock = true;
    if (candidates === true) state.candidates = true;
    if (strict === true) state.strict = true;
    refresh();
  });

  return {
    show() {},
    destroy() {
      open = false;
      awake?.release();
      positionCall?.abort();
      judging?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(ticking);
      if (runFrom !== null) { pause(); save(); }
      closeAsk();
      document.removeEventListener("keydown", onKey);
      offBackground();
    },
  };
}
