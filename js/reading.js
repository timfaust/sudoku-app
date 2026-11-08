// How the app reads the engine's events before putting them into words: what
// every language's wording (text/*.js, D81) shares. Pure functions, tested
// without a browser.

import { sees } from "./geometry.js";

// The four ideas every step belongs to (APP_CONCEPT.md), in the order a round
// lists its steps in and leads with (leadIdea), on purpose not the course's
// (lessons.LESSONS: assume and fail is taught first).
export const IDEA_ORDER = ["single", "count", "cases", "fail"];

// The idea a round leads with: the first of IDEA_ORDER among its steps' ideas.
export const leadIdea = ideas => IDEA_ORDER.find(idea => ideas.includes(idea)) ?? "single";

// The library's place for puzzles above the ceiling, or beyond the engine: a
// route word, never shown.
export const ABOVE = "above";

// A step's conclusions without the removals its own placements make anyway, so
// a headline names what a reader has to do. Drawing knowledge only (who sees
// whom); the conclusions themselves are the engine's.
export function essential(conclusions) {
  const placed = conclusions.filter(f => f.value);
  return conclusions.filter(f => f.value || !placed.some(p =>
    p.cell === f.cell || (p.digit === f.digit && sees(p.cell, f.cell))));
}

// A step's essential conclusions grouped for its headline: by digit ("Remove
// 5 from E3 and F3"), or by cell when that takes fewer groups ("Remove 5 and 8
// from H4"). Each group: { value, digits, cells }, sorted.
export function headlineGroups(move) {
  const group = (by, list) => {
    const groups = new Map();
    for (const fact of essential(move.conclusions)) {
      const id = `${fact.value}:${fact[by]}`;
      if (!groups.has(id)) groups.set(id, { value: fact.value, by: fact[by], list: [] });
      groups.get(id).list.push(fact[list]);
    }
    return [...groups.values()];
  };
  const byDigit = group("digit", "cell");
  const byCell = group("cell", "digit");
  return byCell.length < byDigit.length
    ? byCell.map(g => ({ value: g.value, digits: g.list.sort((a, b) => a - b), cells: [g.by] }))
    : byDigit.map(g => ({ value: g.value, digits: [g.by], cells: g.list }));
}

// A case split whose every option but one fails, the one left being the result
// itself ("B1 is 4 or 8; 8 fails"): its argument is the failing cases. The
// surviving branch, or null.
export function survivor(move) {
  if (move.kind !== "case" || move.source === null) return null;
  const open = move.branches.filter(b => !b.contradiction);
  return open.length === 1 && !open[0].steps.length ? open[0] : null;
}

// The chain a refutation, or a split with one option left, rests on: its
// failing cases' forced steps and contradictions, whatever each assumed. Two
// steps with one key are one argument read from two ends ("B1 = 8 fails" and
// "C1 = 4 fails" both by B4 = 4, C4 = 8). Null for any other step.
export function argumentKey(move) {
  if (move.kind !== "case" || (move.source !== null && !survivor(move))) return null;
  const fact = f => `${f.cell}${f.value ? "=" : "!"}${f.digit}`;
  const chain = b => JSON.stringify([b.steps.map(s => fact(s.fact)).sort(), b.witness]);
  return move.branches.filter(b => b.contradiction).map(chain).sort().join("|");
}

// The ideas a level's puzzles need beyond one option left, which they all
// need; one option left alone when that is all.
export function levelIdeas(ideas) {
  const more = IDEA_ORDER.filter(idea => idea !== "single" && ideas.includes(idea));
  return more.length ? more : ["single"];
}

// The ideas of the rounds at a rating's level: the steps that crack it (D73).
export const keyIdeas = rating => [...new Set(rating.strip.filter(r => r.burden === rating.level).flatMap(r => r.ideas))];

// Search as shown: whole looks.
export const looks = value => String(Math.round(value));

// The time on a clock: 4:07, or 1:02:07 past an hour.
export function clock(ms) {
  const seconds = Math.floor(ms / 1000);
  const two = n => String(n).padStart(2, "0");
  const [h, m, sec] = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

// An engine message as a sentence.
export const sentence = text => {
  const s = String(text).trim();
  return s && `${s[0].toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? "" : "."}`;
};
