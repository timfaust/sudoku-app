// A player's sheet: their moves as a list of facts, and their own marks (notes),
// with undo and redo over both; and the verdicts on their moves (D71). Pure: the engine says what the facts mean
// (service.position), this only edits the sheet. Notes are never facts: they are
// the player's view, and the engine never reads them (D19, D70).
//
// A sheet is { facts, notes }; notes map a cell to { corner, centre }, each a
// sorted list of digits.

import { sees } from "./geometry.js";

export const same = (a, b) => a.cell === b.cell && a.digit === b.digit && a.value === b.value;

export const sheet = (facts = [], notes = {}) => ({ facts, notes });

// Place `digit` in `cell`, replacing the player's own placement there.
export function place(facts, cell, digit) {
  return [...facts.filter(f => !(f.cell === cell && f.value)), { cell, digit, value: true }];
}

// Remove a digit from a cell, or give back one the player removed. Any digit
// may go, rightly or wrongly: the engine's candidates may be hidden, and the
// pad never hints at them (D98).
export function toggleMark(facts, cell, digit) {
  const mine = { cell, digit, value: false };
  if (facts.some(f => same(f, mine))) return facts.filter(f => !same(f, mine));
  return [...facts, mine];
}

export const noted = (notes, cell, kind, digit) => notes[cell]?.[kind]?.includes(digit) ?? false;

// A corner or centre note for `digit` in each of `cells`: taken out of all of
// them when every one has it, else put in each.
export function toggleNote(notes, cells, kind, digit) {
  if (!cells.length) return notes;
  const all = cells.every(cell => noted(notes, cell, kind, digit));
  const out = { ...notes };
  for (const cell of cells) {
    const now = out[cell]?.[kind] ?? [];
    const next = all ? now.filter(d => d !== digit) : [...new Set([...now, digit])].sort();
    const entry = { corner: [], centre: [], ...out[cell], [kind]: next };
    if (entry.corner.length || entry.centre.length) out[cell] = entry;
    else delete out[cell];
  }
  return out;
}

// What the player did in `cells`, a layer at a time: their placements first
// (their notes stay for when the cell is empty again), then their removals and
// notes.
export function erase(s, cells) {
  const inCells = f => cells.includes(f.cell);
  if (s.facts.some(f => f.value && inCells(f))) return sheet(s.facts.filter(f => !(f.value && inCells(f))), s.notes);
  if (!s.facts.some(inCells) && !cells.some(cell => cell in s.notes)) return s;
  const notes = { ...s.notes };
  for (const cell of cells) delete notes[cell];
  return sheet(s.facts.filter(f => !inCells(f)), notes);
}

export function owns(s, cells) {
  return cells.some(cell => cell in s.notes || s.facts.some(f => f.cell === cell));
}

// Undo and redo over whole sheets.
export function history(s = sheet()) {
  return { sheet: s, past: [], future: [] };
}

export function commit(h, s) {
  if (s === h.sheet || (s.facts === h.sheet.facts && s.notes === h.sheet.notes)) return h;
  return { sheet: s, past: [...h.past, h.sheet], future: [] };
}

export function undo(h) {
  if (!h.past.length) return h;
  return { sheet: h.past.at(-1), past: h.past.slice(0, -1), future: [h.sheet, ...h.future] };
}

export function redo(h) {
  if (!h.future.length) return h;
  return { sheet: h.future[0], past: [...h.past, h.sheet], future: h.future.slice(1) };
}

// ---------- verdicts (D71) ----------
//
// Each move is judged at the position before it, against that position's
// round, the easiest steps there (service.position): one of them, or not (a
// harder step or a guess, which only Ask why can tell apart), or wrong (the
// check). A verdict is { status: "pending" | "easiest" | "other" | "wrong",
// idea, easiest: the round's effort (null when no round was found), helped,
// took: the time the move took, in milliseconds, given to its first fact }.

export const factKey = f => `${f.cell}:${f.digit}:${f.value ? 1 : 0}`;

// The facts a move added.
export const added = (before, after) => after.filter(f => !before.some(g => same(f, g)));

// The verdicts of `facts`, one move that took `took`, made at a position whose
// round is `round` ({ stop } when it has none; null while it is not known).
export function judge(facts, round, { helped = false, took = 0 } = {}) {
  return Object.fromEntries(facts.map((f, i) => {
    const time = { helped, took: i ? 0 : took };
    if (!round) return [factKey(f), { status: "pending", idea: null, easiest: null, ...time }];
    if (round.stop) return [factKey(f), { status: "other", idea: null, easiest: null, ...time }];
    const move = round.moves.find(m => m.conclusions.some(c => same(c, f)));
    return [factKey(f), { status: move ? "easiest" : "other", idea: move?.idea ?? null, easiest: round.burden, ...time }];
  }));
}

// The check, once the position reports its mistakes.
export function withMistakes(verdicts, mistakes) {
  const wrong = mistakes.map(factKey).filter(k => verdicts[k] && verdicts[k].status !== "wrong");
  if (!wrong.length) return verdicts;
  return { ...verdicts, ...Object.fromEntries(wrong.map(k => [k, { ...verdicts[k], status: "wrong" }])) };
}

// The player's path: their facts in the order they made them, each with its
// verdict (pending when none was made).
export const path = (facts, verdicts) => facts.map(f => verdicts[factKey(f)] ?? { status: "pending", idea: null, easiest: null, helped: false, took: 0 });

// Verdicts of the facts still on the sheet, for the store.
export const kept = (facts, verdicts) => Object.fromEntries(facts.map(factKey).filter(k => k in verdicts).map(k => [k, verdicts[k]]));

// The cells whose digit a cell they see holds too: a rule broken on the board,
// read off the grid (the rules, never reasoning, D93).
export function clashes(grid) {
  const out = new Set();
  grid.forEach((d, a) => { if (d && grid.some((e, b) => e === d && sees(a, b))) out.add(a); });
  return out;
}
