// Learn: the main mode (D43, APP_CONCEPT.md §4). Four lessons, one per idea,
// in the teaching order. A lesson explains its idea with a tiny diagram, shows
// worked examples (Watch), and lets the learner find steps on practice
// positions cut from rated paths (lessons.js), climbing in effort. The engine
// gives each position's easiest steps and checks any other answer (D51).
//
// The overview lists the lessons with the learner's progress; its board shows
// an example of the lesson in focus, which its button opens. A click, a tap or
// the keyboard puts a lesson in focus; the main button or Enter opens it. A
// lesson's column reads top to bottom: the lesson and its efforts, how the idea
// works, the task or the example, and one wide button that stays in place: the
// hint ladder, then the next position.

import { createBoard } from "../board.js";
import { fitPages, h, keepFocus, onBackground, shortcuts } from "../dom.js";
import { digitsOf, rowOf } from "../geometry.js";
import * as course from "../lessons.js";
import { padKeys, padMode } from "../pad.js";
import * as play from "../play.js";
import { simple } from "../settings.js";
import { sketch } from "../sketch.js";
import { boardView, fitCard, legend, markStep, stepCard, walkKey, withSelection } from "../step.js";
import * as store from "../store.js";
import { CEILING } from "../strip.js";
import { IDEAS, LEARN, NEXT_RUNG, PAD, REGIONS, attemptLine, essential, hintLine, resultLine, sentence } from "../text.js";
import { failure } from "./failure.js";

const STORE_KEY = "learn";

// The practice set, once per visit.
let practice = null;
const loadPractice = () => (practice ??= fetch("data/practice.json").then(response => {
  if (!response.ok) throw new Error(LEARN.missing);
  return response.json();
}).catch(error => { practice = null; throw error; }));

// The engine's answer at each position (its board and easiest steps), kept for
// the visit, so that going back to a position or an example is instant.
const answers = new Map();
let notify = () => {};

function at(engine, p) {
  const id = course.positionId(p);
  if (!answers.has(id)) {
    const entry = { board: null, round: null, error: null };
    answers.set(id, entry);
    engine("position", { puzzle: p.puzzle, facts: course.factsOf(p) }, {
      onEvent(event) {
        if (event.type === "position") entry.board = event.board;
        else if (event.type === "round") entry.round = event;
        else if (event.type === "stop") entry.round = { stop: true, moves: [] };
        notify();
      },
    }).catch(error => {
      answers.delete(id);
      entry.error = error.message;
      notify();
    });
  }
  return answers.get(id);
}

const lessonStep = (round, idea) => round?.moves.find(m => m.idea === idea) ?? null;

// The efforts of a lesson on the staircase of the rating's ten (the levels'
// in Puzzles), each bar as tall as its effort: the lesson's filled by
// progress, grey before any step found there without a hint, a tint after
// one, the idea's colour once easy; the others only outlined. With `pick`,
// each of the lesson's is a button to that effort.
function efforts(lesson, idea, progress, { current = null, pick = null } = {}) {
  const own = course.efforts(lesson);
  return h("div", { class: `efforts tone-${idea}${pick ? " picker" : " small"}` }, Array.from({ length: CEILING }, (_, i) => i + 1).map(e => {
    if (!own.includes(e)) {
      return h("span", { class: "effort-bar off", style: `--share: ${e / CEILING}`, "aria-hidden": "true" },
        h("i"), h("span", {}, String(e)));
    }
    const n = course.found(progress, idea, e);
    const level = n >= course.EASY ? "easy" : n ? "started" : "new";
    const label = LEARN.effortBar(e, n, n >= course.EASY);
    const attrs = { class: `effort-bar ${level}`, style: `--share: ${e / CEILING}`, "aria-current": e === current ? "step" : null };
    const parts = [h("i", { "aria-hidden": "true" }), h("span", { "aria-hidden": "true" }, String(e))];
    return pick
      ? h("button", { ...attrs, type: "button", "aria-label": label, title: label, "data-focus": `effort-${e}`, onclick: () => pick(e) }, ...parts)
      : h("span", { ...attrs, role: "img", "aria-label": label }, ...parts);
  }));
}

export function mountLearn(root, context) {
  return context.position.lesson in IDEAS ? mountLesson(root, context) : mountOverview(root, context);
}

// ---------- the overview ----------

function mountOverview(root, { engine }) {
  const state = { data: null, progress: course.emptyProgress(), focus: null, error: null, page: 0 }; // page: the list's (dom.fitPages)
  const boardHost = h("div", { class: "board-host" });
  const legendHost = h("div", { class: "legend", "aria-live": "polite" });
  const introHost = h("section", { class: "learn-intro" });
  const listHost = h("section", { "aria-label": LEARN.lessons });
  root.replaceChildren(
    h("div", { class: "stage", role: "region", "aria-label": REGIONS.board }, boardHost, legendHost),
    h("div", { class: "side" }, introHost, listHost),
  );
  shortcuts([[["↑", "↓"], LEARN.overviewKeys.lessons], [["↵"], LEARN.overviewKeys.open]]);
  const board = createBoard(boardHost);

  // In place: the board, the button and the rows' marks, never the rows
  // themselves, so that a click on a row reaches the row it began on.
  function preview(idea) {
    if (state.focus === idea) return;
    state.focus = idea;
    drawBoard();
    drawIntro();
    for (const row of listHost.querySelectorAll(".lesson-row")) {
      if (row.dataset.idea === idea) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    }
  }

  // The first example of the lesson in focus, with its step.
  function drawBoard() {
    const example = state.data.lessons[state.focus].examples[0];
    const entry = at(engine, example);
    if (!entry.board) return;
    const view = boardView(entry.board, digitsOf(example.puzzle), LEARN.exampleOf(state.focus));
    const move = lessonStep(entry.round, state.focus);
    if (move) markStep(view, move);
    board.render(view);
    legendHost.replaceChildren(h("span", { class: "legend-caption" }, LEARN.anExample(state.focus)), ...(move ? legend(view) : []));
  }

  // The button opens the lesson in focus, at first the one to continue with;
  // beneath it, the puzzles to play with what the learner finds easy.
  function drawIntro() {
    const idea = state.focus;
    const begun = state.data.lessons[idea].practice.some(q => state.progress.positions[course.positionId(q)]);
    const level = course.suggestedLevel(state.progress, CEILING);
    introHost.replaceChildren(
      h("p", { class: "title" }, LEARN.title),
      h("a", { class: "button primary continue", href: `#learn/${idea}`, "data-focus": "continue" },
        LEARN.start(idea, begun)),
      h("p", {}, h("a", { class: "link quiet", href: `#puzzles/${level}`, "data-focus": "play" }, LEARN.play(level))));
  }

  function draw() {
    if (state.error) return root.replaceChildren(failure(state.error, { title: LEARN.failed }));
    if (!state.data) return;
    state.focus ??= course.continueWith(state.data.lessons, state.progress);
    drawBoard();
    drawIntro();
    listHost.replaceChildren(h("ol", { class: "lessons" }, course.LESSONS.map((idea, i) => {
      const lesson = state.data.lessons[idea];
      return h("li", {}, h("a", {
        class: `lesson-row tone-${idea}`, href: `#learn/${idea}`, "data-focus": `lesson-${idea}`, "data-idea": idea,
        "aria-current": idea === state.focus ? "true" : null,
        onfocus: () => preview(idea),
        // A click or a tap puts the lesson in focus; the main button or Enter (a
        // click without a pointer) opens it.
        onclick: event => {
          if (!event.detail || event.ctrlKey || event.metaKey || event.shiftKey) return;
          event.preventDefault();
          preview(idea);
        },
      },
      h("span", { class: "lesson-number", "aria-hidden": "true" }, String(i + 1)),
      h("span", { class: "lesson-name" }, IDEAS[idea].name),
      h("span", { class: "lesson-short" }, IDEAS[idea].short),
      efforts(lesson, idea, state.progress)));
    })));
    fit();
  }

  // A list taller than its column shows a page at a time, the lesson in focus
  // on it; a page picked puts its first lesson in focus.
  function fit() {
    const list = listHost.querySelector(".lessons");
    const shown = list.querySelector(".lesson-row[aria-current=true]")?.closest("li");
    state.page = fitPages(list, { at: state.page, keep: shown, pick: i => {
      state.page = i;
      fitPages(list, { at: i, pick: () => {} });
      const first = [...list.querySelectorAll(".lesson-row")].find(r => !r.closest("li").hidden);
      if (first) preview(first.dataset.idea);
      render();
    } });
  }

  const render = () => keepFocus(draw);

  function onKey(event) {
    if (event.target instanceof Element && event.target.closest("input, textarea, select, dialog")) return;
    if (!["ArrowDown", "ArrowUp"].includes(event.key) || !state.data) return;
    const rows = [...listHost.querySelectorAll(".lesson-row")];
    const i = rows.indexOf(document.activeElement);
    const to = i < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, i + (event.key === "ArrowDown" ? 1 : -1)));
    // A lesson on another page brings its page.
    const idea = rows[to].dataset.idea;
    if (rows[to].closest("li").hidden) { preview(idea); render(); }
    listHost.querySelector(`.lesson-row[data-idea="${idea}"]`).focus();
    event.preventDefault();
  }
  document.addEventListener("keydown", onKey);
  notify = () => state.data && drawBoard();

  Promise.all([loadPractice(), store.get(STORE_KEY)]).then(([data, saved]) => {
    state.data = data;
    if (saved?.positions) state.progress = saved;
    render();
  }, error => { state.error = error.message; render(); });

  return {
    show() {},
    destroy() {
      notify = () => {};
      document.removeEventListener("keydown", onKey);
    },
  };
}

// ---------- a lesson ----------

function mountLesson(root, { engine, position, onPosition }) {
  const idea = position.lesson;
  const state = {
    data: null, progress: course.emptyProgress(), error: null,
    mode: "practice", index: null, example: 0, effort: null, pinned: false, notice: null, aboutOpen: null,
    // At the position: the rung of the hint ladder (1, the idea, is the
    // lesson's own), the selected cell, what a digit does, an answer being
    // checked ({ fact, events, status, controller }) and how it ended.
    hint: 1, selected: null, removing: false, chose: false, attempt: null, result: null, ui: { raw: false, walk: null },
  };

  const boardHost = h("div", { class: "board-host" });
  const legendHost = h("div", { class: "legend", "aria-live": "polite" });
  const headHost = h("section", { class: "lesson-head" });
  const aboutHost = h("section", { class: "about" });
  const taskHost = h("section", { class: "task" });
  const helpHost = h("section", { class: "help", "aria-live": "polite" });
  root.replaceChildren(
    h("div", { class: "stage", role: "region", "aria-label": REGIONS.board }, boardHost, legendHost),
    h("div", { class: "side" }, headHost, taskHost, helpHost, aboutHost),
  );
  const board = createBoard(boardHost, { onCell: cell => select(cell), onCandidate: cell => select(cell), interactive: true });

  const lesson = () => state.data.lessons[idea];
  const shown = () => (state.mode === "watch" ? lesson().examples[state.example] : lesson().practice[state.index]);
  const entry = () => at(engine, shown());
  const target = () => lessonStep(entry().round, idea);

  // ---------- moving ----------

  function begin(index, mode = "practice") {
    closeAttempt();
    Object.assign(state, { mode, index, hint: 1, selected: null, chose: false, result: null, ui: { raw: false, walk: null } });
    state.effort = lesson().practice[index].effort;
    onPosition({ lesson: idea, index });
    settle();
    render();
  }

  // Once the position's steps are known: what a digit does starts as what the
  // lesson's step concludes, and an answer given before is checked.
  function settle() {
    const move = target();
    if (!move) return;
    if (!state.chose) state.removing = !essential(move.conclusions).some(f => f.value);
    if (state.attempt?.status === "waiting") check();
  }

  function pickEffort(effort) {
    state.pinned = true;
    state.notice = null;
    state.mode = "practice";
    begin(course.nextAt(lesson(), state.progress, effort));
  }

  function next() {
    const before = state.effort;
    const effort = course.effortAfter(lesson(), idea, state.progress, before, state.pinned);
    state.notice = effort === before ? null
      : course.easy(state.progress, idea, before) ? LEARN.easyNow(before, effort)
      : LEARN.everyPosition(before, effort);
    begin(course.nextAt(lesson(), state.progress, effort, effort === before ? state.index : -1));
  }

  function watch(index) {
    closeAttempt();
    const all = lesson().examples;
    state.mode = "watch";
    state.aboutOpen = false;
    state.example = Math.max(0, Math.min(all.length - 1, index));
    state.ui = { raw: false, walk: null };
    render();
  }

  function practise() {
    state.notice = null;
    if (state.mode === "watch") {
      state.pinned = false;
      begin(course.nextAt(lesson(), state.progress, lesson().examples[state.example].effort));
    }
  }

  // ---------- answering ----------

  function select(cell) {
    if (state.mode !== "practice" || state.result) return;
    state.selected = state.selected === cell ? null : cell; // a tap on the cell selected lets it go
    render();
  }

  function digit(d, removing = state.removing) {
    const cell = state.selected;
    const board = entry().board;
    if (state.mode !== "practice" || state.result || cell === null || !board || board.grid[cell]) return;
    if (!board.candidates[cell]?.includes(d)) return;
    answer({ cell, digit: d, value: !removing });
  }

  function answer(fact) {
    closeAttempt();
    state.attempt = { fact, events: [], status: "waiting", controller: new AbortController() };
    if (target()) check();
    render();
  }

  // An answer among the position's easiest steps is found at once; any other
  // is the engine's to judge (service.ask), first only up to the position's
  // effort, so that the verdict is quick: a check, no step here, or true but
  // harder. On request it then looks further, and a harder step it finds is
  // accepted (APP_CONCEPT.md §4).
  function check() {
    const attempt = state.attempt;
    const found = entry().round.moves.filter(m => m.conclusions.some(f => play.same(f, attempt.fact)));
    if (found.length) return finish(found.find(m => m.idea === idea) ?? found[0], {});
    ask(attempt, Math.max(shown().effort, 2));
  }

  function ask(attempt, maxEffort = null) {
    const p = shown();
    Object.assign(attempt, { status: "checking", events: [], further: maxEffort === null });
    engine("ask", { puzzle: p.puzzle, facts: course.factsOf(p), fact: attempt.fact, ...(maxEffort ? { max_effort: maxEffort } : {}) }, {
      signal: attempt.controller.signal,
      onEvent(event) {
        if (state.attempt !== attempt) return;
        attempt.events.push(event);
        if (event.type === "answer" && event.status === "proven") return finish(event.move, { revealed: attempt.further });
        if (event.type === "answer") attempt.status = event.status === "limited" && maxEffort ? "harder" : event.status;
        render();
      },
    }).catch(error => {
      if (error.cancelled || state.attempt !== attempt) return;
      attempt.status = "error";
      attempt.error = error.message;
      render();
    });
    render();
  }

  function lookFurther() {
    const attempt = state.attempt;
    attempt.controller = new AbortController();
    ask(attempt);
  }

  function closeAttempt() {
    state.attempt?.controller.abort();
    state.attempt = null;
  }

  // How a position ended: a step found (`revealed` when the engine looked
  // further for it on request), or shown by the hints (`shown`).
  function finish(move, { shown: byHints = false, revealed = false }) {
    const p = shown();
    const hinted = state.hint > 1 || revealed;
    closeAttempt();
    state.result = { move, how: byHints ? "shown" : "found", hinted, revealed };
    state.aboutOpen = false; // a step card above it takes the room; the learner may open it again
    state.ui = { raw: false, walk: null };
    const ending = byHints
      ? { how: "shown", idea, effort: p.effort }
      : { how: hinted ? "hinted" : "unaided", idea: move.idea, effort: move.effort.burden };
    state.progress = { ...course.record(state.progress, p, ending), last: idea };
    store.set(STORE_KEY, state.progress);
    render();
  }

  function hint() {
    if (state.mode !== "practice" || state.result || !target()) return;
    closeAttempt();
    if (state.hint >= 3) return finish(target(), { shown: true });
    state.hint++;
    render();
  }

  // ---------- board ----------

  function view() {
    const p = shown();
    const out = boardView(entry().board, digitsOf(p.puzzle), state.mode === "watch" ? LEARN.example : LEARN.position);
    if (state.mode === "watch") {
      const move = target();
      return move ? markStep(out, move, { ui: state.ui }) : out;
    }
    if (state.result) return markStep(out, state.result.move, { ui: state.ui });
    withSelection(out, state.selected);
    if (state.attempt?.status === "false") out.shade.set(state.attempt.fact.cell, ["mistake"]);
    if (state.hint >= 2 && target()) {
      out.peers = null;
      markStep(out, target(), { show: state.hint });
    }
    return out;
  }

  // ---------- column ----------

  // As Puzzles heads a level: the staircase to pick from, then the lesson as
  // the title, with the effort picked beside it.
  function head() {
    const effort = state.mode === "practice" ? state.effort : shown().effort;
    return [
      efforts(lesson(), idea, state.progress, { current: effort, pick: pickEffort }),
      h("div", { class: "verdict-head" },
        h("h1", { class: `title lesson-title tone-${idea}` }, IDEAS[idea].name),
        h("span", { class: "figure" }, LEARN.effort, h("b", {}, String(effort)))),
    ];
  }

  // How the idea works, last in the column, so a result above it never moves
  // the practice or runs off the screen: open when the lesson opens before any
  // position here is done, then as the learner leaves it. Two ways to
  // understand the idea before finding it: how it works, and a worked example
  // (Watch); from an example, the way back to practice.
  function about() {
    const watching = state.mode === "watch";
    // Only the learner's own clicks count: a redrawn element's toggle event would too.
    return [h("details", { class: "details about-idea", open: state.aboutOpen },
      h("summary", { "data-focus": "about", onclick: event => { state.aboutOpen = !event.currentTarget.parentElement.open; } },
        LEARN.how(idea)),
    h("p", {}, IDEAS[idea].about),
    sketch(idea)),
    h("button", { class: "link quiet about-watch", type: "button", "data-focus": "watch",
      onclick: () => (watching ? practise() : watch(firstExample())) }, watching ? LEARN.backToPractice : LEARN.watch)];
  }

  function task() {
    if (state.mode === "watch") {
      const all = lesson().examples;
      return [h("div", { class: "round-head" },
        h("p", { class: "lead" }, LEARN.exampleCount(state.example, all.length)),
        h("div", { class: "round-nav" },
          h("button", { class: "button text", type: "button", "aria-label": LEARN.previous, disabled: state.example === 0,
            "data-focus": "example-prev example-next", onclick: () => watch(state.example - 1) }, "‹"),
          h("button", { class: "button text", type: "button", "aria-label": LEARN.next, disabled: state.example === all.length - 1,
            "data-focus": "example-next example-prev", onclick: () => watch(state.example + 1) }, "›")))];
    }
    const board = entry().board;
    const cell = state.selected;
    const open = Boolean(board) && cell !== null && !board.grid[cell] && !state.result;
    const candidates = open ? board.candidates[cell] ?? [] : [];
    const key = d => ({ label: LEARN.key(state.removing, d), disabled: !candidates.includes(d) });
    return [
      h("p", { class: "lead" }, IDEAS[idea].task),
      state.notice ? h("p", { class: "meta" }, state.notice) : null,
      // Until a cell is picked, the pad's keys do nothing; the line beside its modes says why.
      h("div", { class: "row" },
        padMode(state.removing ? "remove" : "place", mode => { state.removing = mode === "remove"; state.chose = true; render(); }),
        !open && !state.result ? h("span", { class: "meta push" }, PAD.pickCell) : null),
      padKeys({ mode: state.removing ? "remove" : "place", key, onDigit: d => digit(d), row: true }),
    ];
  }

  const firstExample = () => Math.max(0, lesson().examples.findIndex(e => e.effort === state.effort));

  // The one wide button: the hint ladder while looking, then the next position;
  // in Watch, practice.
  function action() {
    if (state.mode === "watch") return { label: LEARN.findOne, key: "↵", run: practise, primary: true };
    if (state.result) return { label: LEARN.nextPosition, key: "↵", run: next, primary: true };
    return { label: NEXT_RUNG[state.hint], key: "H", run: target() ? hint : null };
  }

  function help() {
    const a = action();
    const button = h("button", { class: `button wide${a.primary ? " primary" : ""}`, type: "button", disabled: !a.run,
      onclick: a.run, "data-focus": "action", "aria-keyshortcuts": a.key === "↵" ? "Enter" : a.key },
    h("span", {}, a.label), h("kbd", { "aria-hidden": "true" }, a.key));
    const p = shown();
    const e = entry();
    if (e.error) return [button, h("p", { class: "bad" }, sentence(e.error))];
    if (state.mode === "watch") {
      const move = target();
      return [button, ...(move ? [stepCard(move, state.ui, render, { details: !simple(), figures: !simple() })]
        : [h("p", { class: "searching" }, LEARN.working)])];
    }
    if (state.result) {
      const easier = state.result.move.effort.burden > p.effort;
      return [button,
        resultLine(state.result, idea, p.effort) ? h("p", { class: "result-line" }, resultLine(state.result, idea, p.effort)) : null,
        stepCard(state.result.move, state.ui, render, { details: !simple(), figures: !simple() }),
        h("div", { class: "row" },
          easier ? h("button", { class: "link quiet", type: "button", "data-focus": "easier",
            onclick: () => { state.result = { ...state.result, move: target() }; render(); } }, LEARN.showEasier) : null,
          simple() ? null : h("a", { class: "link quiet", href: `#analyse/${p.puzzle}/${p.round}` }, LEARN.inAnalyse))];
    }
    const out = [button];
    if (state.hint >= 2 && target()) out.push(h("p", { class: "help-line" }, hintLine(target(), state.hint)));
    out.push(...attemptLines());
    return out;
  }

  function attemptLines() {
    const a = state.attempt;
    if (!a) return [];
    if (a.status === "waiting") return [h("p", { class: "searching" }, LEARN.checking)];
    if (a.status === "error") return [h("p", { class: "bad" }, sentence(a.error))];
    if (a.status === "checking") {
      const last = a.events.at(-1);
      const floor = last ? LEARN.floor(last.at_least) : "";
      return [h("p", { class: "searching" }, `${a.further ? LEARN.looking : LEARN.checking}${floor}`),
        h("div", { class: "row" }, h("button", { class: "button", type: "button", "data-focus": "stop action",
          onclick: () => { closeAttempt(); render(); } }, a.further ? LEARN.stopLooking : LEARN.stopChecking))];
    }
    const out = [h("p", { class: `attempt-line${a.status === "false" ? " bad" : ""}` }, attemptLine(a.fact, a.status, shown().effort))];
    if (a.status === "harder") {
      out.push(h("div", { class: "row" }, h("button", { class: "link quiet", type: "button", "data-focus": "further action",
        onclick: lookFurther }, LEARN.showProof)));
    }
    return out;
  }

  function keys() {
    shortcuts(state.mode === "watch"
      ? [[["←", "→"], LEARN.watchKeys.examples], [["↵"], LEARN.watchKeys.practise], [["Esc"], LEARN.watchKeys.close]]
      : [[[LEARN.practiceKeys.arrows], LEARN.practiceKeys.move], [["1–9"], LEARN.practiceKeys.place],
        [["Shift", "1–9"], LEARN.practiceKeys.remove], [["H"], LEARN.practiceKeys.hint], [["↵"], LEARN.practiceKeys.next]]);
  }

  // ---------- render ----------

  const render = () => keepFocus(draw);

  function draw() {
    if (state.error) return root.replaceChildren(failure(state.error, { title: LEARN.failed }));
    if (!state.data) return;
    const e = entry();
    if (e.board) {
      const shownView = view();
      board.render(shownView);
      legendHost.replaceChildren(...(shownView.idea || state.attempt?.status === "false" ? legend(shownView) : []));
    }
    headHost.replaceChildren(...head());
    aboutHost.replaceChildren(...about());
    taskHost.replaceChildren(...task().filter(Boolean));
    helpHost.replaceChildren(...help().filter(Boolean));
    fitCard(helpHost, state.ui, render);
    keys();
  }

  function onKey(event) {
    if (!state.data || (event.target instanceof Element && event.target.closest("input, textarea, select, dialog"))) return;
    const k = event.key;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const onButton = event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement;
    const step = state.mode === "watch" ? target() : state.result?.move;
    if (step && walkKey(event, step, state.ui)) render();
    else if (k === "Enter" && !onButton && (state.mode === "watch" || state.result)) action().run();
    else if (state.mode === "watch" && (k === "ArrowRight" || k === "ArrowLeft")) watch(state.example + (k === "ArrowRight" ? 1 : -1));
    else if (state.mode !== "practice" || state.result) return;
    else if (/^Digit[1-9]$/.test(event.code) || /^[1-9]$/.test(k)) digit(Number(event.code.slice(5) || k), event.shiftKey || state.removing);
    else if (k in MOVES) {
      const from = state.selected ?? 40;
      const to = from + MOVES[k];
      if (to < 0 || to > 80 || (Math.abs(MOVES[k]) === 1 && rowOf(to) !== rowOf(from))) return;
      select(to);
    } else if (k === "h" || k === "H") hint();
    else if (k === "Escape") { closeAttempt(); state.selected = null; render(); }
    else return;
    event.preventDefault();
  }
  document.addEventListener("keydown", onKey);
  // A press on the bare background lets the selected cell go (D99).
  const offBackground = onBackground(() => { if (state.selected !== null) { state.selected = null; render(); } });
  notify = () => {
    if (!state.data) return;
    settle();
    render();
  };

  Promise.all([loadPractice(), store.get(STORE_KEY)]).then(([data, saved]) => {
    state.data = data;
    if (saved?.positions) state.progress = saved;
    state.aboutOpen = !lesson().practice.some(q => state.progress.positions[course.positionId(q)]);
    if (state.progress.last !== idea) {
      state.progress = { ...state.progress, last: idea };
      store.set(STORE_KEY, state.progress);
    }
    const all = lesson().practice;
    const index = position.index !== null && position.index < all.length ? position.index
      : course.nextAt(lesson(), state.progress, course.suggestedEffort(lesson(), idea, state.progress));
    begin(index);
  }, error => { state.error = error.message; render(); });

  return {
    show({ index }) {
      if (state.data && index !== null && index !== state.index && index < lesson().practice.length) begin(index);
    },
    destroy() {
      notify = () => {};
      closeAttempt();
      document.removeEventListener("keydown", onKey);
      offBackground();
    },
  };
}

const MOVES = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
