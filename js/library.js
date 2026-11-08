// The library (APP_CONCEPT.md §4, D64, D77, D79): every puzzle the player made
// or opened, and the starter set the app adds on first start, with its rating
// (service.rating) and how far the player got with it, and their play on it
// (Solve's sheet), in the browser's store.
//
// Stored: { entries: { [puzzle]: entry }, spares: [rating] }. An entry is
// { puzzle, source, added, rating, played, left, solved }: source "made",
// "opened" or "starter"; rating null until the engine has rated it; played the
// last time it was solved at, left its cells to go then, solved when it was
// finished. Spares are puzzles a climb stood on below the level it was making
// (service.generate): rated puzzles of their own level, kept to be made at
// once. The pure functions are tested without a browser.

import * as store from "./store.js";

const KEY = "library";
export const SPARES = 3; // per level

export const emptyLibrary = () => ({ entries: {}, spares: [] });

export const entries = stored => Object.values(stored.entries);

export const status = entry => (entry.solved ? "solved" : entry.played ? "playing" : "new");

// A level's puzzles: the ones to play, easiest to find first (D60), then the
// solved ones.
export function atLevel(all, level) {
  const order = { playing: 0, new: 0, solved: 1 };
  return all.filter(e => e.rating?.level === level && e.rating.solved)
    .sort((a, b) => order[status(a)] - order[status(b)] || a.rating.search - b.rating.search);
}

// Puzzles started and not finished, the latest first.
export const playing = all => all.filter(e => status(e) === "playing").sort((a, b) => b.played - a.played);

export const solvedLevels = all => new Set(all.filter(e => e.solved && e.rating).map(e => e.rating.level));

// ---------- changes, each a new stored library ----------

export function withEntry(stored, puzzle, change, now = Date.now()) {
  const before = stored.entries[puzzle] ?? { puzzle, source: "opened", added: now, rating: null, played: null, left: null, solved: null };
  return { ...stored, entries: { ...stored.entries, [puzzle]: { ...before, ...change } } };
}

// The player's play on a puzzle: its cells to go, and whether anything is
// entered (`started`); nothing entered makes it new again. Once solved, a
// puzzle stays solved.
export function withPlay(stored, puzzle, { left, solved, started }, now = Date.now()) {
  const before = stored.entries[puzzle];
  return withEntry(stored, puzzle, { played: started ? now : null, left, solved: before?.solved ?? (solved ? now : null) }, now);
}

// A rating for the spares, unless the library or the spares hold that puzzle
// already (by canonical id), or its level has enough.
export function withSpare(stored, rating, known = []) {
  const ids = new Set([...known, ...stored.spares.map(r => r.id)]);
  if (ids.has(rating.id) || stored.spares.filter(r => r.level === rating.level).length >= SPARES) return stored;
  return { ...stored, spares: [...stored.spares, rating] };
}

// The first spare of `level`, made a puzzle of the library: [stored, rating or null].
export function takeSpare(stored, level, now = Date.now()) {
  const rating = stored.spares.find(r => r.level === level);
  if (!rating) return [stored, null];
  const rest = { ...stored, spares: stored.spares.filter(r => r !== rating) };
  return [withEntry(rest, rating.puzzle, { source: "made", added: now, rating }, now), rating];
}

// The starter set's ratings (data/starter.json, built by calibration.starter)
// as puzzles of the library, rated, beside any it holds already.
export function withStarter(stored, ratings, now = Date.now()) {
  return ratings.reduce((next, rating) => (next.entries[rating.puzzle] ? next
    : withEntry(next, rating.puzzle, { source: "starter", added: now, rating }, now)), stored);
}

// ---------- the store ----------

let writing = Promise.resolve();

// The starter set's ratings (data/starter.json, built by calibration.starter),
// or null when they cannot be fetched; fetched once they could be.
let starter = null;
function starterSet() {
  starter ??= fetch(new URL("./data/starter.json", document.baseURI))
    .then(response => (response.ok ? response.json() : null))
    .then(data => data?.puzzles ?? null, () => null)
    .then(ratings => { if (!ratings) starter = null; return ratings; });
  return starter;
}

// The library. On first start the store holds none yet: then the starter set,
// stored once it could be fetched (else asked for again next time).
export async function load() {
  const stored = await store.get(KEY);
  if (stored) return stored;
  return (await starterSet()) ? update(library => library) : emptyLibrary();
}

// Change the stored library; changes run one after another, so none is lost,
// and a change is never written over a library the store could not read. The
// first change, whichever screen makes it, starts from the starter set.
export function update(change) {
  writing = writing.catch(() => {}).then(async () => {
    const next = change((await store.read(KEY)) ?? withStarter(emptyLibrary(), (await starterSet()) ?? []));
    await store.set(KEY, next);
    return next;
  });
  return writing;
}

// The player's play on a puzzle, kept by Solve: { facts, notes, verdicts, time }
// (play.js), or undefined before the first move.
const playKey = puzzle => `solve:${puzzle}`;
export const loadPlay = puzzle => store.get(playKey(puzzle));
export const savePlay = (puzzle, play) => store.set(playKey(puzzle), play);

// A puzzle's rating from the engine (service.rate), once per visit, stored in
// its entry: resolves with the rating.
const rating = new Map();
export function rate(engine, puzzle) {
  if (!rating.has(puzzle)) {
    rating.set(puzzle, engine("rate", { puzzle }).then(async events => {
      const found = events.at(-1).rating;
      await update(stored => withEntry(stored, puzzle, { rating: found }));
      return found;
    }).catch(error => { rating.delete(puzzle); throw error; }));
  }
  return rating.get(puzzle);
}
