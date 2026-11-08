// Analyse: the rating's glass box (APP_CONCEPT.md §4). The puzzle's rounds stream
// in from the engine; every round lists its steps, and each step explains itself
// on the board. Everything shown comes from the engine's events (D49).
//
// The column reads as one story: the verdict with the puzzle's strip, the round
// picked on it with its steps, then the step picked among them. Under the board,
// the heat map (D74) colours the round's candidates instead of the step, by each
// one's level from here (from the rated rounds).

import { createBoard } from "../board.js";
import { fitPages, h, keepFocus, shortcuts } from "../dom.js";
import * as library from "../library.js";
import * as play from "../play.js";
import { boardView, fitCard, legend, markRound, markStep, stepCard, walkKey } from "../step.js";
import { renderStrip } from "../strip.js";
import {
  ANALYSE, HEAT, HEAT_ABOUT, REGIONS, HEAT_REST, IDEAS, NO_STEP, SEARCH, aboveCeiling, argumentKey, essential, headline, heatTitle,
  looks, shapeName, startsPhrase,
} from "../text.js";
import { failure } from "./failure.js";

const SHORTCUTS = () => [[["←", "→"], ANALYSE.shortcuts.rounds], [["↑", "↓"], ANALYSE.shortcuts.steps], [["Esc"], ANALYSE.shortcuts.close]];

export function mountAnalyse(root, { puzzle, engine, position = {}, onPosition = () => {}, openPuzzle, onRefused, sample }) {
  const state = {
    error: null, refused: false, givens: null, start: null, ceiling: null, verified: null,
    rounds: [], end: null, round: position.round ?? 0, move: position.move ?? 0, ui: { raw: false, walk: null },
    stepPage: { at: null, page: 0 }, // the page of the tab's steps shown (fitSteps)
    tab: 0, // the round's group of steps shown, kept while no step is picked
    // Past the ceiling, on request (D58): the rounds worked out there, outside the
    // rating; the search under way; why it stopped ({ limited, solved }); an error;
    // the board where the rounds beyond have got to.
    beyond: { rounds: [], search: null, stop: null, error: null, board: null },
    heat: "off", // the heat map (D74): off, or each candidate's level from the round
  };
  const controller = new AbortController();

  const boardHost = h("div", { class: "board-host" });
  const heatHost = h("div", { class: "heat-bar" });
  const legendHost = h("div", { class: "legend", "aria-live": "polite" });
  const profileHost = h("section", { class: "verdict", "aria-label": REGIONS.difficulty });
  const roundHost = h("section", { class: "round", "aria-label": REGIONS.round });
  const stepHost = h("section", { class: "answer", "aria-live": "polite" });

  root.replaceChildren(
    h("div", { class: "stage", role: "region", "aria-label": REGIONS.board }, boardHost, legendHost),
    h("div", { class: "side" }, profileHost, roundHost, stepHost),
  );
  shortcuts(SHORTCUTS());
  const board = createBoard(boardHost, { onCandidate: (cell, digit) => selectByFact(cell, digit) });

  // ---------- state ----------

  const last = () => state.rounds.length; // the rating's end state
  const end = () => last() + state.beyond.rounds.length; // the end, past any rounds beyond
  const current = () => (state.round < last() ? state.rounds[state.round] : state.beyond.rounds[state.round - last()] ?? null);
  const move = () => (state.move === null ? null : current()?.moves[state.move] ?? null); // null: no step picked
  const level = () => state.end?.profile.level ?? Math.max(0, ...state.rounds.map(r => r.burden));

  function go(round) {
    const limit = state.end ? end() : Math.max(state.rounds.length - 1, 0);
    if (round < 0 || round > limit) return;
    state.round = round;
    state.move = grouped(current()?.moves ?? [])[0]?.items[0][1] ?? 0; // the first step shown
    state.tab = 0;
    state.ui = { raw: false, walk: null };
    render();
  }

  // Every conclusion of the rounds before `round` (the rated ones, then any
  // beyond): the position the round starts from.
  function factsBefore(round) {
    return [...new Map([...state.rounds, ...state.beyond.rounds].slice(0, round).flatMap(r => r.moves.flatMap(m => m.conclusions))
      .map(f => [play.factKey(f), f])).values()];
  }

  function pick(index) {
    state.move = index;
    state.ui = { raw: false, walk: null };
    state.stepPage.turned = false;
    render();
  }

  // A click picks a step, or puts the picked one down again: the board then
  // shows every step of the round, to pick from.
  const toggle = index => pick(index === state.move ? null : index);

  function selectByFact(cell, digit) {
    const found = current()?.moves.findIndex(m => m.conclusions.some(f => f.cell === cell && f.digit === digit));
    if (found !== undefined && found >= 0) toggle(found);
  }

  // ---------- board ----------

  function view() {
    const shown = current() ?? (state.end ? { board: state.beyond.board ?? state.end.board } : null);
    const out = boardView(shown?.board ?? state.start, state.givens,
      ANALYSE.board(current()?.beyond, current() ? state.round : null));
    if (heatMode() !== "off") return withHeat(out);
    const m = move();
    if (m) return markStep(out, m, { ui: state.ui, others: current().moves });
    return current() ? markRound(out, current().moves) : out;
  }

  // ---------- heat map (D74) ----------

  // Each candidate's level from the round (path.candidate_levels): from the
  // rated rounds, so once the analysis is done, and never past the ceiling.
  const heatReady = mode => mode === "off" || Boolean(state.end && current() && !current().beyond);
  const heatMode = () => (heatReady(state.heat) ? state.heat : "off");

  // The picked step's conclusions are ringed in its idea's colour, so the
  // column's step can be found on the map.
  function withHeat(out) {
    const efforts = state.end.levels[state.round];
    const m = move();
    const ringed = new Set(m ? essential(m.conclusions).map(f => `${f.cell}:${f.digit}`) : []);
    out.idea = m?.idea;
    out.heat = new Map();
    out.candidates.forEach((digits, cell) => (digits ?? []).forEach((digit, i) => {
      const value = efforts[cell]?.[i];
      const id = `${cell}:${digit}`;
      if (value || ringed.has(id)) out.heat.set(id, { value, title: value ? heatTitle(cell, digit, value) : null, ring: ringed.has(id) });
    }));
    out.label = `${out.label}. ${HEAT_ABOUT}`;
    return out;
  }

  function setHeat(mode) {
    state.heat = mode;
    render();
  }

  function heatBar() {
    return [h("span", { class: "faint" }, ANALYSE.heat), h("div", { class: "switch", role: "group", "aria-label": ANALYSE.heatGroup },
      Object.entries(HEAT).map(([mode, label]) => h("button", {
        type: "button", "aria-pressed": heatMode() === mode ? "true" : "false", disabled: !heatReady(mode),
        title: mode === "off" ? null : HEAT_ABOUT, "data-focus": `heat-${mode}`, onclick: () => setHeat(mode),
      }, label)))];
  }

  // The unit and its scale, 1 to the puzzle's level, so it stays put from round
  // to round; the picked step's ring; and what an uncoloured candidate means.
  function heatLegend() {
    const top = state.end.profile.limited ? state.ceiling : Math.max(1, level());
    const m = move();
    return [
      h("span", { class: "heat-scale" }, h("span", { class: "unit" }, ANALYSE.unit),
        Array.from({ length: top }, (_, i) => h("i", { class: `key heat-key heat-${i + 1}` }, String(i + 1)))),
      m ? h("span", { class: `legend-item tone-${m.idea}` }, h("i", { class: "key heat-key ring" }), ANALYSE.theStep) : null,
      state.end.levels[state.round].some(c => c?.includes(null)) ? h("span", { class: "legend-item" }, HEAT_REST) : null,
    ].filter(Boolean);
  }

  // ---------- side ----------

  // A named number, "effort 5" or "search 32"; search explains itself on hover.
  const figure = (name, value, title = null) => h("span", { class: "figure", title }, name, h("b", {}, value));

  // The verdict in a headline, with the search once solved (D60), and one line;
  // the strip beneath them.
  function profile() {
    const n = state.rounds.length;
    let title;
    let line;
    let search = null;
    if (!state.end) {
      title = ANALYSE.analysing;
      line = ANALYSE.soFar(n);
    } else {
      const p = state.end.profile;
      const unique = ANALYSE.unique[state.verified?.unique] ?? "";
      if (p.solved) {
        title = ANALYSE.level(p.level);
        search = figure(ANALYSE.search, looks(p.search), SEARCH);
        line = ANALYSE.solved(n, unique);
      } else if (p.limited) {
        title = aboveCeiling(state.ceiling, "title");
        line = ANALYSE.limited(n, state.ceiling, unique);
      } else if (state.verified?.unique === null) {
        title = ANALYSE.noSolution;
        line = ANALYSE.noSolutionLine;
      } else {
        title = ANALYSE.stalled(n, p.level);
        line = ANALYSE.stalledLine(n, unique);
      }
    }
    const strip = h("div", { class: "strip-host" });
    if (n) renderStrip(strip, {
      rounds: state.rounds.map(r => ({ burden: r.burden, looks: r.looks, ideas: r.moves.map(m => m.idea) })), ceiling: state.ceiling,
      level: level(), final: Boolean(state.end),
      limited: Boolean(state.end?.profile.limited), current: Math.min(state.round, last()), onSelect: go,
    });
    const compare = state.end ? [" ", h("a", { class: "link quiet", href: `#compare/${puzzle}`, "data-focus": "compare" }, ANALYSE.compare)] : [];
    return [h("div", { class: "verdict-head" }, h("p", { class: "title" }, title), search), h("p", { class: "meta" }, line, ...compare),
      n ? strip : null];
  }

  function round() {
    if (state.end && !state.rounds.length) return [];
    const r = current();
    const nav = h("div", { class: "round-nav" },
      h("button", { class: "button text", type: "button", "aria-label": ANALYSE.previous, disabled: state.round === 0,
        "data-focus": "round-prev round-next",
        onclick: () => go(state.round - 1) }, "‹"),
      h("button", { class: "button text", type: "button", "aria-label": ANALYSE.next, "data-focus": "round-next round-prev",
        disabled: state.round >= (state.end ? end() : state.rounds.length - 1), onclick: () => go(state.round + 1) }, "›"));
    if (!r) {
      const p = state.end?.profile;
      const { rounds: past, stop } = state.beyond;
      const text = !p ? ANALYSE.stillAnalysing
        : p.solved ? ANALYSE.solvedEnd
        : !p.limited ? NO_STEP
        : !past.length ? ANALYSE.stops(state.ceiling)
        : stop?.solved ? ANALYSE.solvedPast
        : stop && !stop.limited ? NO_STEP
        : stop ? ANALYSE.again(state.ceiling)
        : ANALYSE.goesOn;
      return [h("div", { class: "round-head" }, h("p", { class: "lead" }, state.end ? ANALYSE.theEnd : ANALYSE.round(state.round)), nav),
        h("p", { class: "meta" }, text), p?.limited ? beyond() : null].filter(Boolean);
    }
    const past = state.round - last();
    const hardest = !r.beyond ? (r.burden === level() && level() > 1 ? ANALYSE.hardest : "")
      : r.requested ? ANALYSE.requested(state.ceiling)
      : ANALYSE.past;
    const out = [
      h("div", { class: "round-head" },
        h("p", { class: "lead" }, r.beyond ? ANALYSE.beyondOf(past + 1, state.beyond.rounds.length, Boolean(state.beyond.search))
          : ANALYSE.roundOf(state.round, state.rounds.length, !state.end)),
        figure(ANALYSE.effort, String(r.burden)), figure(ANALYSE.search, looks(r.looks), `${startsPhrase(r)} ${SEARCH}`), nav),
      h("p", { class: "meta" }, ANALYSE.steps(r.moves.length, argumentsIn(r.moves)) + hardest),
    ];
    out.push(...steps(r.moves)); // one step too, so every round reads alike
    return out;
  }

  // The round's steps by idea and shape, one tab each ("Hidden single ×8", its
  // idea's dot beside it), the tab's steps beneath; a tab opens on its first step.
  function steps(moves) {
    const groups = grouped(moves);
    const picked = groups.findIndex(g => g.items.some(([, i]) => i === state.move));
    if (picked >= 0) state.tab = picked; // the picked step's tab, kept once it is put down
    const open = Math.min(state.tab, groups.length - 1);
    return [
      h("div", { class: "step-tabs", role: "tablist", "aria-label": ANALYSE.tabs }, groups.map((g, k) => h("button", {
        class: `step-tab tone-${g.idea}`, type: "button", role: "tab", "aria-selected": k === open ? "true" : "false",
        title: g.shape ? IDEAS[g.idea].name : null, "data-focus": `tab-${k}`, onclick: () => pick(g.items[0][1]),
      }, g.shape ?? IDEAS[g.idea].name, g.items.length > 1 ? h("span", { class: "count" }, `×${g.items.length}`) : null))),
      h("div", { class: "steps", role: "tabpanel" }, h("div", { class: "step-flow" }, groups[open].items.map(([m, i]) => h("button", {
        class: `step-item tone-${m.idea}`, type: "button", "aria-current": i === state.move ? "true" : null, "data-focus": `step-${i}`,
        onclick: () => toggle(i),
      }, headline(m))))),
    ];
  }

  // Past the ceiling (D58): offered where the rating stops, the next round is
  // searched for without a ceiling (stoppable), and the path then goes on by
  // itself while its rounds fit under the ceiling. Every such round is shown
  // outside the rating; the level never changes.
  function beyond() {
    const { search, stop, error } = state.beyond;
    if (error) return h("p", { class: "meta bad" }, error);
    if (search?.unbounded) {
      return h("div", { class: "beyond" },
        h("p", { class: "meta", "aria-live": "polite" },
          ANALYSE.searching(search.at_least),
          h("span", { class: "elapsed" }, elapsed(search))),
        h("button", { class: "button", type: "button", "data-focus": "stop-beyond beyond", onclick: stopBeyond }, ANALYSE.stop));
    }
    if (search) return h("p", { class: "meta", "aria-live": "polite" }, ANALYSE.continuing);
    if (stop && !stop.limited) return null;
    return h("div", { class: "beyond" },
      h("p", { class: "faint" }, ANALYSE.canStill),
      h("button", { class: "button", type: "button", "data-focus": "beyond", onclick: () => continuePast(true) }, ANALYSE.workOut));
  }

  const elapsed = search => ANALYSE.seconds(Math.round((Date.now() - search.started) / 1000));

  // The next round from every conclusion so far: without a ceiling when
  // `unbounded` (on request), else under it (the path going on).
  function continuePast(unbounded) {
    const b = state.beyond;
    const facts = factsBefore(end());
    const search = b.search = { controller: new AbortController(), started: Date.now(), at_least: null, unbounded };
    if (unbounded) {
      search.timer = setInterval(() => {
        const shown = roundHost.querySelector(".elapsed");
        if (shown) shown.textContent = elapsed(search);
      }, 1000);
    }
    b.stop = null;
    let board = null;
    let solved = false;
    engine("position", { puzzle, facts, max_effort: unbounded ? null : state.ceiling }, {
      signal: search.controller.signal,
      onEvent(event) {
        if (event.type === "position") {
          ({ board, solved } = event);
          b.board = board;
        }
        else if (event.type === "searching") search.at_least = event.at_least;
        else if (event.type === "round") {
          const onEnd = state.round === end();
          b.rounds.push({ ...event, board, beyond: true, requested: unbounded });
          if (unbounded) {
            state.move = grouped(event.moves)[0]?.items[0][1] ?? 0; // show the round asked for
            state.ui = { raw: false, walk: null };
          } else if (onEnd) state.round = end(); // a reader at the end stays there
        } else if (event.type === "stop") b.stop = { limited: event.limited, solved };
        render();
      },
    }).then(() => {
      clearInterval(search.timer);
      b.search = null;
      if (!b.stop) continuePast(false);
      render();
    }, error => {
      clearInterval(search.timer);
      if (error.cancelled) return;
      b.search = null;
      b.error = error.message;
      render();
    });
    render();
  }

  function stopBeyond() {
    const { search } = state.beyond;
    search?.controller.abort();
    clearInterval(search?.timer);
    state.beyond.search = null;
    render();
  }

  // " from 4 arguments" when steps share a chain (text.argumentKey), else nothing.
  // How many arguments a round's steps rest on: steps on one chain are one.
  function argumentsIn(moves) {
    return new Set(moves.map((m, i) => argumentKey(m) ?? `own:${i}`)).size;
  }

  // The round's other steps on the move's chain, for its card.
  function twins(m) {
    const k = argumentKey(m);
    if (k === null) return [];
    return current().moves.flatMap((other, i) => (other !== m && argumentKey(other) === k ? [{ move: other, pick: () => pick(i) }] : []));
  }

  // The round's steps by idea and shape, each group in the round's order, so
  // that repeats read as one group ("Hidden single ×9").
  function grouped(moves) {
    const groups = new Map();
    for (const idea of Object.keys(IDEAS)) {
      moves.forEach((m, i) => {
        if (m.idea !== idea) return;
        const id = `${idea}:${shapeName(m) ?? ""}`;
        if (!groups.has(id)) groups.set(id, { idea, shape: shapeName(m), items: [] });
        groups.get(id).items.push([m, i]);
      });
    }
    return [...groups.values()];
  }

  // The step `by` places from the current one, in the order shown.
  function stepBy(by) {
    const order = grouped(current()?.moves ?? []).flatMap(g => g.items.map(([, i]) => i));
    const next = order[order.indexOf(state.move) + by];
    if (next === undefined) return false;
    pick(next);
    return true;
  }

  // ---------- render ----------

  // A tab's steps sit in a slot of fixed height, so the step card keeps its
  // place; more than fit show a page at a time, the picked step's page first.
  function fitSteps() {
    const slot = roundHost.querySelector(".steps");
    if (!slot) return;
    const at = `${state.round}:${state.tab}`;
    if (state.stepPage.at !== at) state.stepPage = { at, page: 0 };
    const flow = slot.querySelector(".step-flow");
    state.stepPage.page = fitPages(flow, { frame: slot, at: state.stepPage.page,
      keep: state.stepPage.turned ? null : flow.querySelector('.step-item[aria-current="true"]'),
      pick: i => { state.stepPage = { at, page: i, turned: true }; render(); } });
  }

  function render() {
    keepFocus(draw);
  }

  function draw() {
    if (state.error) {
      root.replaceChildren(failure(state.error, { openPuzzle, back: state.refused ? sample : null }));
      return;
    }
    if (!state.givens) return;
    const shown = view();
    board.render(shown);
    heatHost.replaceChildren(...heatBar());
    legendHost.replaceChildren(...(heatMode() !== "off" ? heatLegend() : current() ? legend(shown) : []));
    // The heat map's switch closes the difficulty: it shows the puzzle's own
    // candidates by level, and under the board its scale is the legend.
    profileHost.replaceChildren(...profile().filter(Boolean), heatHost);
    roundHost.replaceChildren(...round());
    fitSteps();
    // The round heads its steps with their effort and its search; a step's own
    // search waits under its Details (D67), so each number shows once. The
    // round's list names the step, so its card needs no title.
    stepHost.replaceChildren(...(move() ? [stepCard(move(), state.ui, render, { title: false, figures: false, twins: twins(move()) })] : []));
    fitCard(stepHost, state.ui, render);
    onPosition({ round: state.round, move: state.move });
  }

  function onKey(event) {
    if (event.target instanceof Element && event.target.closest("input, textarea, select, dialog")) return;
    if (walkKey(event, move(), state.ui)) render();
    else if (event.key === "Escape" && move()) pick(null);
    else if (event.key === "ArrowRight") go(state.round + 1);
    else if (event.key === "ArrowLeft") go(state.round - 1);
    else if (event.key === "ArrowDown") stepBy(1);
    else if (event.key === "ArrowUp") stepBy(-1);
    else return;
    event.preventDefault();
  }
  document.addEventListener("keydown", onKey);

  engine("analyse", { puzzle }, {
    signal: controller.signal,
    onEvent(event) {
      if (event.type === "puzzle") { state.givens = event.givens; state.start = event.board; state.ceiling = event.ceiling; }
      else if (event.type === "verified") state.verified = event;
      else if (event.type === "round") state.rounds.push(event);
      else if (event.type === "end") {
        state.end = event;
        if (state.round > last()) state.round = last();
        library.update(stored => library.withEntry(stored, puzzle, { rating: event.rating }));
      }
      render();
    },
  }).catch(error => {
    if (error.cancelled) return;
    state.error = error.message;
    // A refusal before the puzzle event is the puzzle's, not a lost engine.
    if (error.refused && !state.givens) { state.refused = true; onRefused(puzzle); }
    render();
  });

  return {
    show({ round, move }) {
      if (round === state.round && move === state.move) return;
      go(round);
      if (current() && move < current().moves.length) pick(move);
    },
    destroy() {
      controller.abort();
      state.beyond.search?.controller.abort();
      clearInterval(state.beyond.search?.timer);
      document.removeEventListener("keydown", onKey);
    },
  };
}
