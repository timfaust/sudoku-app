// A tiny diagram of each idea (APP_CONCEPT.md §4, Learn): one row of cells,
// drawn like the board, showing the idea in its simplest form. Illustrations
// only; every real step comes from the engine (D49).

import { svg as el } from "./dom.js";

const CELL = 40;
const SLOT = 11; // pencil marks on a 3 × 3 grid, as on the board
const ROOM = 18; // above the row, where arrows bow

const slot = (i, d) => ({ x: i * CELL + CELL / 2 + (((d - 1) % 3) - 1) * SLOT, y: CELL / 2 + (Math.floor((d - 1) / 3) - 1) * SLOT });

// Cells: a given digit (a number), a placed answer ({ answer }), candidates
// ([digits]) with marks per digit ("option", "remove"), or null when empty.
// Arrows run between cells' centres or candidates ([cell, digit]), over the
// row, or under it with `under`.
const ROWS = {
  single: { cells: [3, 8, 1, { answer: 6 }, 9, 4, 7, 2, 5], house: true },
  count: {
    cells: [[3, 7], [3, 7], 5, [3, 9], 2, [7, 8], 6, [1, 3], 4],
    marks: { "0:3": "option", "0:7": "option", "1:3": "option", "1:7": "option", "3:3": "remove", "5:7": "remove", "7:3": "remove" },
  },
  fail: {
    cells: [{ answer: 5, assumed: true }, 4, { answer: 2, chained: true }, 8, null, 1, 9, 6, 3], fail: 4,
    arrows: [[0, 2], [2, 4]],
  },
  // A1 is 4 or 6. If 4, C7 loses its 4; if 6, E5 becomes 4, and C7 loses it
  // all the same.
  cases: {
    cells: [[4, 6], 7, 3, 1, [4, 6], 8, [4, 9], 5, 2],
    marks: { "0:4": "option", "0:6": "option", "6:4": "remove" },
    arrows: [[[0, 4], [6, 4]], [[0, 6], [4, 4], true], [[4, 4], [6, 4], true]],
  },
};

function digit(x, y, text, cls) {
  return el("text", { x, y, class: cls }, String(text));
}

export function sketch(idea) {
  const row = ROWS[idea];
  const root = el("svg", { class: `sketch tone-${idea}`, viewBox: `-2 ${-ROOM} ${9 * CELL + 4} ${CELL + (row.arrows?.some(a => a[2]) ? 2 * ROOM : ROOM + 2)}`, "aria-hidden": "true" });
  row.cells.forEach((cell, i) => {
    const shaded = row.house || cell?.assumed ? (cell?.assumed ? "assume" : "house") : null;
    root.append(el("rect", { x: i * CELL, y: 0, width: CELL, height: CELL, class: `cell${shaded ? ` ${shaded}` : ""}` }));
  });
  for (let i = 1; i < 9; i++) root.append(el("line", { x1: i * CELL, y1: 0, x2: i * CELL, y2: CELL, class: i % 3 ? "minor" : "major" }));
  root.append(el("rect", { x: 0, y: 0, width: 9 * CELL, height: CELL, class: "frame" }));
  if (row.fail !== undefined) root.append(el("rect", { x: row.fail * CELL + 3, y: 3, width: CELL - 6, height: CELL - 6, class: "fail" }));
  const head = el("marker", { id: `sketch-arrow-${idea}`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: "auto" });
  head.append(el("path", { d: "M0,0 L10,5 L0,10 z", class: "arrowhead" }));
  const defs = el("defs");
  defs.append(head);
  root.append(defs);
  for (const [from, to, under] of row.arrows ?? []) {
    // From the edge of a cell, or of a candidate, bowed over the row (or under
    // it), clear of the digits between.
    const end = (at, toward) => {
      if (Array.isArray(at)) {
        const { x, y } = slot(...at);
        return { x, y: y + (under ? 7 : -7) };
      }
      return { x: at * CELL + CELL / 2 + Math.sign(toward - at) * 8, y: under ? CELL - 3 : 3 };
    };
    const a = end(from, Array.isArray(to) ? to[0] : to);
    const b = end(to, Array.isArray(from) ? from[0] : from);
    const c = { x: (a.x + b.x) / 2, y: under ? CELL + ROOM + 4 : -ROOM - 4 };
    root.append(el("path", { d: `M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`, class: "arrow", "marker-end": `url(#sketch-arrow-${idea})` }));
  }
  row.cells.forEach((cell, i) => {
    const x = i * CELL + CELL / 2;
    if (typeof cell === "number") root.append(digit(x, CELL / 2, cell, "given"));
    else if (cell?.answer) {
      root.append(digit(x, CELL / 2, cell.answer, cell.assumed || cell.chained ? "case" : "answer"));
      if (cell.assumed) root.append(el("line", { x1: x - 10, y1: CELL / 2 + 10, x2: x + 10, y2: CELL / 2 - 10, class: "refuted" }));
    } else if (cell) {
      for (const d of cell) {
        const { x: px, y: py } = slot(i, d);
        const mark = row.marks?.[`${i}:${d}`];
        if (mark === "option") root.append(el("rect", { x: px - 6.5, y: py - 6.5, width: 13, height: 13, rx: 3, class: "option" }));
        root.append(digit(px, py, d, `pencil${mark ? ` ${mark}` : ""}`));
        if (mark === "remove") root.append(el("line", { x1: px - 5, y1: py + 5, x2: px + 5, y2: py - 5, class: "slash" }));
      }
    }
  });
  return root;
}
