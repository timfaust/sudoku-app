// The UI's own state (D48): the library, solves, Learn's progress, Compare's
// list and settings, in IndexedDB, or in memory for this visit where the
// browser has none. A failure to store never breaks the app: a value that could
// not be written is kept in memory for this visit, and `get` returns it, so a
// later change never builds on an older copy.
//
// The database's version is the stored data's schema (D76): a change to the shape of
// a stored value bumps it, and `upgrade` converts the old values once, so the
// views never read an older shape.

import { ENGINE } from "./text.js";

const DB = "sudoku-reasoner";
const STORE = "kv";
const VERSION = 2;
const unsaved = new Map(); // values the database did not take (or every value, without one)
let opening = null;

// Version 2: a rating from before search per round (D67) and the ideas per
// round is dropped, to be rated again; a solve from before notes, verdicts and
// its time (D70, D71) gets them, empty.
const whole = rating => rating?.strip?.every(round => "looks" in round && "ideas" in round) ?? false;
function upgrade(kv) {
  kv.openCursor().onsuccess = event => {
    const cursor = event.target.result;
    if (!cursor) return;
    const { key, value } = cursor;
    if (key === "library") {
      const entries = Object.fromEntries(Object.entries(value.entries ?? {}).map(([puzzle, entry]) =>
        [puzzle, whole(entry.rating) ? entry : { ...entry, rating: null }]));
      cursor.update({ ...value, entries, spares: (value.spares ?? []).filter(whole) });
    } else if (key === "compare") {
      cursor.update({ ...value, rows: value.rows.map(row => (whole(row.rating) ? row : { ...row, rating: null })) });
    } else if (String(key).startsWith("solve:")) {
      cursor.update({ facts: value.facts, notes: value.notes ?? {}, verdicts: value.verdicts ?? {}, time: Number.isFinite(value.time) ? value.time : 0 });
    }
    cursor.continue();
  };
}

function open() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  opening ??= new Promise(resolve => {
    try {
      const request = indexedDB.open(DB, VERSION);
      request.onupgradeneeded = event => {
        if (event.oldVersion < 1) request.result.createObjectStore(STORE);
        else upgrade(request.transaction.objectStore(STORE));
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

// The request's result, or `failed` when there is no database or it failed.
const failed = Symbol("failed");
function run(mode, action) {
  return open().then(db => new Promise(resolve => {
    if (!db) return resolve(failed);
    try {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => resolve(failed);
    } catch {
      resolve(failed);
    }
  }));
}

// The stored value, or undefined, on any failure too.
export async function get(key) {
  if (unsaved.has(key)) return unsaved.get(key);
  const stored = await run("readonly", kv => kv.get(key));
  return stored === failed ? undefined : stored;
}

// The stored value, or undefined; rejects when the database cannot be read, for
// a change that must not be written over a value it could not see.
export async function read(key) {
  if (unsaved.has(key)) return unsaved.get(key);
  const stored = await run("readonly", kv => kv.get(key));
  if (stored === failed && await open()) throw new Error(ENGINE.store(key));
  return stored === failed ? undefined : stored;
}

export async function set(key, value) {
  unsaved.set(key, value);
  if (await run("readwrite", kv => kv.put(value, key)) !== failed && unsaved.get(key) === value) unsaved.delete(key);
}
