// One step, presented: its marks on the board, its legend, and its card with the
// case walkthrough. Shared by every mode; reads only the engine's move (D49).

import { fitPages, h } from "./dom.js";
import { houseCells, key, rowOf, colOf, sees } from "./geometry.js";
import {
  EFFORT_READING, IDEAS, LEGEND, STEP, STEP_SEARCH, effortSum, effortWords, essential, explanation, factPhrase, followUps, headline, hiddenLine,
  looks, shapeName, stepPhrase, survivor, witnessPhrase,
} from "./text.js";

// A board view of the engine's board, with nothing marked yet (see board.js).
export function boardView(board, givens, label) {
  return {
    grid: board.grid,
    givens: givens.map(Boolean),
    candidates: board.candidates.map(c => (c ? [...c] : null)),
    shade: new Map(), marks: new Map(), placed: new Map(), ghosts: new Map(), links: [], numbers: new Map(), selected: null, label,
  };
}

// The selected cell on a view, with its reading aids: the cells it sees and
// those holding its digit are shaded, and its digit's candidates stand out.
export function withSelection(view, cell) {
  view.selected = cell;
  if (cell === null || cell === undefined) return view;
  const d = view.grid[cell];
  view.peers = new Set();
  for (let other = 0; other < 81; other++) {
    if (other === cell || sees(other, cell) || (d && view.grid[other] === d)) view.peers.add(other);
  }
  view.sameDigit = d || null;
  return view;
}

// The cells of a focus region (service.Encoder.focus): a house, or where one
// digit is still a candidate in the grid, a band or a stack.
function regionCells(region, candidates) {
  if (["row", "column", "box"].includes(region.kind)) return houseCells(region);
  const inside = cell => region.kind === "digit"
    || (region.kind === "band" ? Math.floor(rowOf(cell) / 3) === region.index : Math.floor(colOf(cell) / 3) === region.index);
  return candidates.flatMap((c, cell) => (c?.includes(region.digit) && inside(cell) ? [cell] : []));
}

// Where a step lives: a single's forcing house, otherwise its smallest focus region.
function whereCells(move, candidates) {
  if (move.kind === "single") return houseCells(move.source);
  return move.focus[0].flatMap(region => regionCells(region, candidates));
}

// Mark `move` on `view`. `show` is how much: 2 where to look, 3 the structure,
// 4 everything with the conclusions. `ui` holds the reader's choices: `raw` (a
// map read case by case) and `walk` ({ branch, step } of a case being walked).
export function markStep(view, move, { show = 4, ui = {}, others = [] } = {}) {
  const idea = move.idea;
  view.idea = idea;
  const shade = (cells, role) => cells.forEach(c => view.shade.set(c, [...(view.shade.get(c) ?? []), role]));
  const mark = (fact, kind) => view.marks.set(key(fact), { mark: kind, idea });

  // A refutation's argument is its one case, and a split with one option left
  // argues by its failing cases, so these open on the (first) failing case's
  // last frame.
  const refutation = move.kind === "case" && move.source === null;
  const failing = refutation ? 0 : survivor(move) ? move.branches.findIndex(b => b.contradiction) : -1;
  const at = ui.walk ?? (failing >= 0 ? { branch: failing, step: move.branches[failing].steps.length + 1 } : null);
  // The board's label names what it shows, once the step itself is shown.
  if (show >= 4) view.label = `${view.label}. ${headline(move)}`;
  if (show >= 4 && at) return walk(view, move, at, idea, shade, mark);
  if (show === 2) {
    shade(whereCells(move, view.candidates), "house");
    return view;
  }
  if (show >= 4) {
    for (const other of others) {
      for (const fact of essential(other.conclusions)) view.marks.set(key(fact), { mark: "later", idea: other.idea });
    }
  }
  if (move.kind === "single") shade(houseCells(move.source), "house");
  if (move.kind === "cover") {
    move.bases.forEach(b => shade(houseCells(b), "base"));
    move.covers.forEach(c => shade(houseCells(c), "cover"));
    for (const b of move.bases) {
      for (const cell of houseCells(b)) {
        for (const digit of view.candidates[cell] ?? []) {
          if (b.kind === "cell" || digit === b.digit) mark({ cell, digit }, "option");
        }
      }
    }
  }
  if (move.source && move.kind !== "cover" && move.kind !== "single") shade(houseCells(move.source), "house");
  if (move.kind === "map" && !ui.raw) {
    // An arrow within one cell (placing 7 removes that cell's 1) is left to the marks.
    view.links = move.links.filter(link => link.from.cell !== link.to.cell);
    view.linkIdea = idea;
    for (const link of move.links) mark(link.to, "chain");
    move.choices.forEach((c, i) => { mark(c, "option"); view.numbers.set(key(c), i + 1); });
    // Why each arrow is forced: what its step's constraint lost in that case.
    for (const branch of move.branches) branch.steps.forEach((s, i) => strike(view, lost(branch, i, s.source), idea));
  }
  if (move.kind === "case" || ui.raw) {
    move.branches.forEach((b, i) => {
      mark(b.assumption, "option");
      if (move.branches.length > 1) view.numbers.set(key(b.assumption), i + 1);
    });
  }
  if (show >= 4) for (const fact of essential(move.conclusions)) mark(fact, fact.value ? "place" : "remove");
  return view;
}

// A round with no step picked: each step's conclusions ringed, to pick from.
export function markRound(view, moves) {
  for (const m of moves) for (const fact of essential(m.conclusions)) view.marks.set(key(fact), { mark: "later", idea: m.idea });
  return view;
}

// Whether a removed candidate belongs to a constraint: a cell's digit, or a
// house's cell for the constraint's digit.
const inside = (constraint, r) => (constraint.kind === "cell"
  ? r.cell === constraint.index
  : r.digit === constraint.digit && houseCells(constraint).includes(r.cell));

// The candidates `constraint` lost in a case before its step `n`, from the
// engine's removal lists: why that constraint forces its step, or is empty.
export function lost(branch, n, constraint) {
  return [branch.removes, ...branch.steps.slice(0, n).map(s => s.removes)].flat().filter(r => inside(constraint, r));
}

// Struck candidates, drawn back where they were; in a cell the case has filled,
// in its corner (a ghost).
function strike(view, removed, idea) {
  for (const r of removed) {
    if (view.grid[r.cell] || view.marks.has(key(r))) continue;
    if (view.placed.has(r.cell)) {
      view.ghosts.set(r.cell, [...new Set([...(view.ghosts.get(r.cell) ?? []), r.digit])]);
      continue;
    }
    if (!view.candidates[r.cell]?.includes(r.digit)) view.candidates[r.cell] = [...(view.candidates[r.cell] ?? []), r.digit];
    view.marks.set(key(r), { mark: "gone", idea });
  }
}

// A frame of a case being walked: frame 0 the assumption; frame k the steps
// before step k applied, step k marked as forced next, and the candidates its
// forcing constraint lost struck out; the last frame the result, or the
// contradiction with the candidates its witness lost.
function walk(view, move, at, idea, shade, mark) {
  const branch = move.branches[at.branch];
  const applied = Math.max(0, Math.min(at.step - 1, branch.steps.length));
  const apply = (fact, removes, latest) => {
    for (const r of removes) view.candidates[r.cell] = (view.candidates[r.cell] ?? []).filter(d => d !== r.digit);
    view.placed.set(fact.cell, { digit: fact.digit, idea, latest, assumed: fact === branch.assumption });
  };
  apply(branch.assumption, branch.removes, applied === 0);
  branch.steps.slice(0, applied).forEach((s, i) => apply(s.fact, s.removes, i === applied - 1));
  view.shade.set(branch.assumption.cell, ["assume"]);
  const step = at.step >= 1 ? branch.steps[at.step - 1] : null;
  if (step) {
    shade(houseCells(step.source).filter(c => c !== branch.assumption.cell), "force");
    mark(step.fact, "next");
    strike(view, lost(branch, applied, step.source), idea);
  } else if (at.step > branch.steps.length) {
    if (branch.contradiction) {
      view.placed.get(branch.assumption.cell).refuted = true;
      shade(houseCells(branch.witness), "fail");
      strike(view, lost(branch, applied, branch.witness), idea);
    } else for (const fact of essential(move.conclusions)) mark(fact, fact.value ? "place" : "remove");
  }
  const frame = step ? stepPhrase(step)
    : at.step > branch.steps.length ? (branch.contradiction ? witnessPhrase(branch.witness) : STEP.frameEnd)
    : STEP.frameStart;
  view.label = STEP.frame(view.label, branch.assumption, frame);
  return view;
}

export function legend(view) {
  const shown = new Set([...view.marks.values()].map(v => v.mark));
  for (const roles of view.shade.values()) roles.forEach(r => shown.add(r));
  if (view.ghosts.size) shown.add("gone");
  if (view.links.length) shown.add("arrow");
  if (view.placed.size) shown.add("assume");
  if ([...view.placed.values()].some(p => !p.assumed)) shown.add("hypothetical");
  if ([...view.placed.values()].some(p => p.refuted)) shown.add("refuted");
  return LEGEND.filter(([id]) => shown.has(id)).map(([id, text]) =>
    h("span", { class: "legend-item" }, h("i", { class: `key ${id} tone-${view.idea ?? "none"}` }),
      id === "gone" && view.links.length ? STEP.goneByArrows : id === "later" && !view.idea ? STEP.stepsNow : text));
}

// The card of a step: its idea, shape, effort and search once, at the top;
// what it concludes and why; its cases. What the two numbers mean in words,
// the counting argument, the removals a placement makes anyway and the
// effort's sum wait behind "Details", which stays open from step to step once
// opened. `twins` are the round's other steps on the same chain, as
// [{ move, pick }]. Without `figures`, the numbers are left to whatever
// shows them already (a round of one step). One element, in the idea's tone.
// While a case is walked through, it stands alone (with the card's title), so
// its stepper is the only way through (the app never scrolls).
let detailsOpen = false;
// `meta`: false when the idea is named next to the card already (Solve's hint).
// `details`: false in simple mode (D80), whose player reads no numbers.
export function stepCard(move, ui, rerender, { title = true, twins = [], figures = true, meta = true, details = true } = {}) {
  const idea = move.idea;
  const shape = shapeName(move);
  const text = explanation(move);
  const side = followUps(move);
  const walking = Boolean(ui.walk);
  return h("div", { class: `step tone-${idea}` }, ...[
    meta && !walking ? h("div", { class: "step-meta" },
      h("span", { class: "idea" }, STEP.idea(IDEAS[idea].name, shape)),
      figures ? h("span", { class: "figures" },
        h("span", { class: "figure" }, STEP.effort, h("b", {}, String(move.effort.burden))),
        move.looks ? h("span", { class: "figure", title: STEP_SEARCH }, STEP.search, h("b", {}, looks(move.looks))) : null) : null) : null,
    title ? h("h2", {}, headline(move)) : null,
    walking ? null : h("p", { class: "claim" }, h("strong", {}, text.claim), " ", text.reason),
    twins.length && !walking ? h("p", { class: "twins" }, STEP.twins, twins.map((t, i) => [
      i ? (i === twins.length - 1 ? STEP.and : ", ") : null,
      h("button", { class: "link quiet", type: "button", "data-focus": `twin-${i}`, onclick: t.pick }, headline(t.move)),
    ]), ".") : null,
    move.kind === "map" && !walking ? h("button", { class: "link quiet", type: "button", "data-focus": "raw",
      onclick: () => { ui.raw = !ui.raw; ui.walk = null; rerender(); } }, ui.raw ? STEP.rawOn : STEP.rawOff) : null,
    move.kind === "case" || ui.raw ? cases(move, ui, rerender) : null,
    // Opened or closed by the reader, the card is fitted to its room again.
    details && !walking && h("details", { class: "details", open: detailsOpen, ontoggle: event => {
      if (event.target.open === detailsOpen) return;
      detailsOpen = event.target.open;
      rerender();
    } },
      h("summary", { "data-focus": "details" }, STEP.details),
      h("p", {}, effortWords(move.effort)),
      move.looks ? h("p", {}, hiddenLine(move)) : null,
      text.count ? h("p", {}, text.count) : null,
      side ? h("p", {}, side) : null,
      h("p", {}, STEP.sum(effortSum(move.effort), EFFORT_READING[ui.raw ? "case" : move.kind]))),
  ].filter(Boolean));
}

// The cases, or the one walked through alone.
function cases(move, ui, rerender) {
  const many = move.branches.length > 1;
  return h("ol", { class: "cases" }, move.branches.map((b, i) => {
    const open = ui.walk?.branch === i;
    if (ui.walk && !open) return null;
    const item = h("li", { class: `case${open ? " open" : ""}` },
      h("div", { class: "case-head" },
        h("span", { class: "case-label" }, STEP.caseLabel(i, many)),
        h("span", { class: "case-fact" }, factPhrase(b.assumption)),
        h("span", { class: `case-status${b.contradiction ? " bad" : ""}` }, b.contradiction ? STEP.fails : STEP.reaches),
        // A case that is the result itself has nothing to walk.
        open || (!b.steps.length && !b.contradiction) ? null : h("button", { class: "link quiet", type: "button", "data-focus": `case-${i} next-${i}`,
          onclick: () => { ui.walk = { branch: i, step: 0 }; ui.page = 0; rerender(); } }, STEP.walk)));
    if (!open) return item;
    const total = b.steps.length + 1;
    const at = ui.walk.step;
    let line;
    if (at === 0) line = STEP.supposed(b.assumption);
    else if (at <= b.steps.length) line = stepPhrase(b.steps[at - 1]);
    else line = b.contradiction ? STEP.impossible(b.witness) : STEP.reached(headline(move));
    item.append(
      h("p", { class: "case-line" }, line),
      h("div", { class: "stepper" },
        h("button", { class: "button text", type: "button", "aria-label": STEP.previous, disabled: at === 0,
          "data-focus": `back-${i} next-${i} case-${i}`,
          onclick: () => { ui.walk.step--; rerender(); } }, STEP.back),
        h("span", { class: "count" }, STEP.count(at + 1, total + 1)),
        h("button", { class: "button text", type: "button", "aria-label": STEP.next, disabled: at === total,
          "data-focus": `next-${i} back-${i} case-${i}`,
          onclick: () => { ui.walk.step++; rerender(); } }, STEP.forward),
        h("button", { class: "link quiet push", type: "button", "data-focus": `done-${i} case-${i}`,
          onclick: () => { ui.walk = null; ui.page = 0; rerender(); } }, STEP.done)));
    return item;
  }));
}

// A step card that is taller than the room its column leaves shows a page at
// a time (dom.fitPages), whole blocks only: its lines, and each case. Its head
// (the idea) stays on every page. The page is the step's own (`ui.page`).
export function fitCard(host, ui, rerender) {
  const card = host.querySelector(".step");
  if (!card) return;
  // An open case is one block; only one too tall for any page breaks into its lines.
  const blocks = split => [...card.children].filter(child => !child.classList.contains("step-meta"))
    .flatMap(child => (!child.classList.contains("cases") ? [child]
      : [...child.children].flatMap(item => (split && item.classList.contains("open") ? [...item.children] : [item]))));
  const fit = split => fitPages(card, { items: blocks(split), at: ui.page ?? 0, pick: i => { ui.page = i; rerender(); } });
  ui.page = fit(false);
  const frame = card.closest(".side");
  if (frame && frame.scrollHeight > frame.clientHeight && card.querySelector(".case.open")) ui.page = fit(true);
}

// The arrow keys step through an open case, Escape closes it. True when handled.
export function walkKey(event, move, ui) {
  if (!ui.walk || !move?.branches) return false;
  const last = move.branches[ui.walk.branch].steps.length + 1;
  if (event.key === "ArrowRight" && ui.walk.step < last) ui.walk.step++;
  else if (event.key === "ArrowLeft" && ui.walk.step > 0) ui.walk.step--;
  else if (event.key === "Escape") { ui.walk = null; ui.page = 0; }
  else return ["ArrowRight", "ArrowLeft"].includes(event.key);
  return true;
}
