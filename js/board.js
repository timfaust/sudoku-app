// The board: one SVG component for every mode. It draws what it is given and
// reports taps; it decides nothing about Sudoku (D49).
//
// A view is
//   { grid, givens, candidates,            // 81 digits (0 empty), 81 booleans, 81 lists or null
//     shade: Map(cell -> [role]),          // role: house, base, cover, fail, assume, mistake, clash, by
//     marks: Map("cell:digit" -> { mark, idea, current }),
//                                          // mark: place, remove, option, assume, chain, later,
//                                          //   next (forced next in a case), gone (ruled out in a case),
//                                          //   struck (removed by the player, candidates hidden)
//     placed: Map(cell -> { digit, idea, latest, assumed, refuted }),
//     ghosts: Map(cell -> [digit]),        // candidates a case ruled out in a cell it then filled
//                                          // digits placed inside a case being walked through
//     links: [{ from, to }], linkIdea,     // implication arrows between candidates
//     numbers: Map("cell:digit" -> n),     // numbered choices
//     heat: Map("cell:digit" -> { value, title, ring }), // a candidate's effort on the heat map (D74),
//                                          //   1-10 or null (uncoloured), ringed in the view's idea when the
//                                          //   picked step concludes it
//     notes: { cell: { corner, centre } }, // the player's own marks, drawn in cells shown without candidates
//     peers: Set(cell), sameDigit,         // reading aids: the selection's houses, its digit
//     idea, selected, also, label }        // the tone of the shading; a cell or null; more selected
//                                          //   cells (a Set or null); a summary

import { svg as el } from "./dom.js";
import { ROWS, colOf, rowOf } from "./geometry.js";
import { BOARD, IDEAS } from "./text.js";

const CELL = 100;
const SIZE = 9 * CELL;
const PAD = 46; // room for the row and column labels
const INSET = 4; // the selection's outline, inside its cell
const SLOT = 28; // pencil marks sit on a 3 × 3 grid a little inside the cell
const STRIKE = 30; // half the slash through a refuted assumption
const LATEST = 36; // the disc under the digit a case forced last
const BIG = 34; // a placement alone in its cell, on a disc as wide as the latest
const HEAT = SLOT / 2 - 1; // half a heat map's slot, a gap short of its neighbours
const CORNER = { left: 20, top: 21, step: 17, row: 5 }; // corner notes: along the top from the left, then the bottom
const slot = (cell, digit) => ({
  x: colOf(cell) * CELL + CELL / 2 + (((digit - 1) % 3) - 1) * SLOT,
  y: rowOf(cell) * CELL + CELL / 2 + (Math.floor((digit - 1) / 3) - 1) * SLOT,
});

// The point `by` units from `p` toward `q`.
function toward(p, q, by) {
  const length = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  return { x: p.x + ((q.x - p.x) / length) * by, y: p.y + ((q.y - p.y) / length) * by };
}

// `interactive` boards take cell selections, and show it on hover. With
// `onPress`, a press on a cell reports it at once, with whether a modifier
// (Ctrl, Cmd or Shift) adds to the selection, dragging on from it (a mouse, a
// finger or the pen alike) reports each further cell to `onDrag`, and letting
// go reports the cell under the pointer, with the candidate slot under it, to
// `onRelease` (a press redraws the board, so no click follows it).
export function createBoard(host, {
  onCell = () => {}, onCandidate = () => {}, onPress = null, onDrag = () => {}, onRelease = () => {}, interactive = false,
} = {}) {
  const svg = el("svg", {
    class: "board",
    viewBox: `${-PAD} ${-PAD} ${SIZE + PAD + 6} ${SIZE + PAD + 6}`,
    role: "img",
    tabindex: "0",
  });
  host.replaceChildren(svg);
  let current = null;

  // A click on a marked candidate names it; on a cell, the candidate slot
  // under the pointer comes along, for views that ask about candidates.
  svg.addEventListener("click", event => {
    const target = event.target.closest("[data-cell]");
    if (!target) return;
    const cell = Number(target.dataset.cell);
    if (target.dataset.digit) onCandidate(cell, Number(target.dataset.digit));
    else onCell(cell, slotAt(event, cell));
  });

  let dragging = null; // the last cell pressed or dragged over, while the pointer is down
  // The cell under the pointer, found by where it is: the board holds the
  // pointer from the press on, so the event's own target is the board.
  const cellAt = event => {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-cell]");
    return target && svg.contains(target) ? Number(target.dataset.cell) : null;
  };
  if (onPress) {
    svg.addEventListener("pointerdown", event => {
      const cell = cellAt(event);
      if (event.button !== 0 || cell === null) return;
      svg.setPointerCapture(event.pointerId);
      dragging = cell;
      onPress(cell, { add: event.ctrlKey || event.metaKey || event.shiftKey });
    });
    svg.addEventListener("pointermove", event => {
      if (dragging === null) return;
      const cell = cellAt(event);
      if (cell === null || cell === dragging) return;
      dragging = cell;
      onDrag(cell);
    });
    svg.addEventListener("pointerup", event => {
      if (dragging === null) return;
      dragging = null;
      const cell = cellAt(event);
      if (cell !== null) onRelease(cell, slotAt(event, cell));
    });
    svg.addEventListener("pointercancel", () => { dragging = null; });
  }
  // A long press opens no menu on the board.
  svg.addEventListener("contextmenu", event => event.preventDefault());

  function slotAt(event, cell) {
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
    const third = i => Math.max(0, Math.min(2, Math.floor((i * 3) / CELL)));
    return third(p.y - rowOf(cell) * CELL) * 3 + third(p.x - colOf(cell) * CELL) + 1;
  }

  function defs() {
    const d = el("defs");
    for (const idea of Object.keys(IDEAS)) {
      const marker = el("marker", {
        id: `arrow-${idea}`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 4.5, markerHeight: 4.5, orient: "auto-start-reverse",
      });
      marker.append(el("path", { d: "M0,0 L10,5 L0,10 z", class: `arrowhead tone-${idea}` }));
      d.append(marker);
    }
    return d;
  }

  // The cells are made once and kept: a redraw only changes their classes, so
  // the cell a finger or the pen pressed stays in the page, and the browser
  // keeps the touch it began (a removed target loses the next tap).
  const cellLayer = el("g", { class: "cells" });
  for (let cell = 0; cell < 81; cell++) {
    cellLayer.append(el("rect", { x: colOf(cell) * CELL, y: rowOf(cell) * CELL, width: CELL, height: CELL, "data-cell": cell, class: "cell" }));
  }
  function cells(view) {
    [...cellLayer.children].forEach((rect, cell) => {
      const roles = view.shade?.get(cell) ?? [];
      const classes = ["cell", ...roles.map(r => `shade-${r}`)];
      if (!roles.length && view.peers?.has(cell)) classes.push("shade-peer");
      if (view.selected === cell || view.also?.has(cell)) classes.push("selected");
      rect.setAttribute("class", classes.join(" "));
    });
  }

  function grid() {
    const layer = el("g", { class: "grid", "aria-hidden": "true" });
    for (let i = 1; i < 9; i++) {
      const cls = i % 3 ? "minor" : "major";
      layer.append(el("line", { x1: i * CELL, y1: 0, x2: i * CELL, y2: SIZE, class: cls }));
      layer.append(el("line", { x1: 0, y1: i * CELL, x2: SIZE, y2: i * CELL, class: cls }));
    }
    layer.append(el("rect", { x: 0, y: 0, width: SIZE, height: SIZE, class: "frame" }));
    return layer;
  }

  // A contradiction's cell or house, framed above the grid lines, so it differs
  // from an assumption by shape as well as colour. Its cells are one rectangle.
  function contradiction(view) {
    const layer = el("g", { class: "contradiction", "aria-hidden": "true" });
    const cells = [...(view.shade ?? [])].filter(([, roles]) => roles.includes("fail")).map(([cell]) => cell);
    if (cells.length) {
      const rows = cells.map(rowOf);
      const cols = cells.map(colOf);
      const top = Math.min(...rows) * CELL + INSET;
      const left = Math.min(...cols) * CELL + INSET;
      layer.append(el("rect", {
        x: left, y: top, width: (Math.max(...cols) + 1) * CELL - INSET - left, height: (Math.max(...rows) + 1) * CELL - INSET - top,
      }));
    }
    return layer;
  }

  // The selected cells' outlines, above the grid lines: a shape as well as a tint.
  function selection(view) {
    const layer = el("g", { class: "selection", "aria-hidden": "true" });
    const cells = new Set(view.also ?? []);
    if (view.selected !== null && view.selected !== undefined) cells.add(view.selected);
    for (const cell of cells) {
      layer.append(el("rect", {
        x: colOf(cell) * CELL + INSET, y: rowOf(cell) * CELL + INSET, width: CELL - 2 * INSET, height: CELL - 2 * INSET,
      }));
    }
    return layer;
  }

  // The player's notes in an empty cell: corner notes along its top from the
  // left (then along its bottom), centre notes across its middle.
  function notes(cell, { corner = [], centre = [] }) {
    const g = el("g", { class: "notes" });
    const left = colOf(cell) * CELL;
    const top = rowOf(cell) * CELL;
    corner.forEach((digit, i) => {
      const x = left + CORNER.left + (i % CORNER.row) * CORNER.step;
      const y = i < CORNER.row ? top + CORNER.top : top + CELL - CORNER.top;
      g.append(el("text", { x, y, class: "note-corner" }, String(digit)));
    });
    if (centre.length) {
      const size = centre.length <= 5 ? "" : centre.length <= 7 ? " smaller" : " smallest";
      g.append(el("text", { x: left + CELL / 2, y: top + CELL / 2, class: `note-centre${size}` }, centre.join("")));
    }
    return g;
  }

  function labels() {
    const layer = el("g", { class: "labels", "aria-hidden": "true" });
    for (let i = 0; i < 9; i++) {
      layer.append(el("text", { x: i * CELL + CELL / 2, y: -PAD / 2 }, String(i + 1)));
      layer.append(el("text", { x: -PAD / 2, y: i * CELL + CELL / 2 }, ROWS[i]));
    }
    return layer;
  }

  // A placement alone in its cell is the cell's answer: it is drawn at the
  // cell's centre, nearly a digit's size, so the step's point is seen first.
  function candidate(cell, digit, mark, at = slot(cell, digit), alone = false) {
    const big = alone && (mark?.mark === "place" || mark?.mark === "next");
    const { x, y } = big ? { x: colOf(cell) * CELL + CELL / 2, y: rowOf(cell) * CELL + CELL / 2 } : at;
    const same = !mark && digit === current?.sameDigit ? " same" : "";
    const heat = mark ? null : current?.heat?.get(`${cell}:${digit}`);
    const g = el("g", { class: `cand${mark ? ` mark-${mark.mark}${mark.idea ? ` tone-${mark.idea}` : ""}` : ""}${big ? " big" : ""}${heat ? ` heat${heat.value ? ` heat-${heat.value}` : ""}` : ""}${same}` });
    if (heat) {
      // A filled slot, a hairline of paper apart from its neighbours.
      g.setAttribute("data-cell", cell);
      g.setAttribute("data-digit", digit);
      if (heat.title) g.append(el("title", {}, heat.title));
      g.append(el("rect", { x: x - HEAT, y: y - HEAT, width: 2 * HEAT, height: 2 * HEAT, rx: 3, class: `heat-fill${heat.ring ? " ring" : ""}` }));
    }
    if (mark) {
      g.setAttribute("data-cell", cell);
      g.setAttribute("data-digit", digit);
      const r = big ? BIG : 13.5;
      if (mark.mark === "option" || mark.mark === "assume") {
        g.append(el("rect", { x: x - r, y: y - r, width: 2 * r, height: 2 * r, rx: 5, class: "badge" }));
      } else {
        g.append(el("circle", { cx: x, cy: y, r, class: "badge" }));
      }
      if (["remove", "gone", "struck"].includes(mark.mark)) g.append(el("line", { x1: x - 9, y1: y + 9, x2: x + 9, y2: y - 9, class: "slash" }));
    }
    g.append(el("text", { x, y, class: "digit-small" }, String(digit)));
    return g;
  }

  function contents(view) {
    const layer = el("g", { class: "contents" });
    for (let cell = 0; cell < 81; cell++) {
      const x = colOf(cell) * CELL + CELL / 2;
      const y = rowOf(cell) * CELL + CELL / 2;
      const placed = view.placed?.get(cell);
      if (view.grid[cell]) {
        const kind = view.givens[cell] ? "given" : view.shade?.get(cell)?.includes("mistake") ? "wrong" : "solved";
        layer.append(el("text", { x, y, class: `digit ${kind}` }, String(view.grid[cell])));
        // A mistake is underlined, so it never depends on its colour alone.
        if (kind === "wrong") layer.append(el("line", { x1: x - 20, y1: y + 33, x2: x + 20, y2: y + 33, class: "wrong-mark" }));
      } else if (placed) {
        // The digit forced last sits on a disc: a shape as well as a colour.
        if (placed.latest) layer.append(el("circle", { cx: x, cy: y, r: LATEST, class: `latest-disc tone-${placed.idea}` }));
        layer.append(el("text", { x, y, class: `digit hypothetical tone-${placed.idea}` }, String(placed.digit)));
        // An assumption that failed is struck through: the step's conclusion.
        if (placed.refuted) layer.append(el("line", { x1: x - STRIKE, y1: y + STRIKE, x2: x + STRIKE, y2: y - STRIKE, class: "refuted" }));
        // Candidates the case ruled out here before filling the cell sit in its
        // corner, clear of the digit.
        (view.ghosts?.get(cell) ?? []).forEach((digit, i) => {
          const ghost = candidate(cell, digit, { mark: "gone", idea: placed.idea }, { x: x - SLOT + i * SLOT / 1.4, y: y - SLOT });
          ghost.removeAttribute("data-cell");
          layer.append(ghost);
        });
      } else {
        const shown = view.candidates[cell] ?? [];
        for (const digit of shown) {
          layer.append(candidate(cell, digit, view.marks?.get(`${cell}:${digit}`), undefined, shown.length === 1));
        }
        if (!view.candidates[cell] && view.notes?.[cell]) layer.append(notes(cell, view.notes[cell]));
      }
    }
    return layer;
  }

  // Each arrow bows a little to one side, so arrows that share a line stay
  // apart. Arrows run beneath the digits, which an outline keeps readable.
  function links(view) {
    const layer = el("g", { class: `links tone-${view.linkIdea ?? "cases"}`, "aria-hidden": "true" });
    const paths = (view.links ?? []).map(link => {
      const a = slot(link.from.cell, link.from.digit);
      const b = slot(link.to.cell, link.to.digit);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const bow = Math.min(length * 0.16, 60);
      const c = { x: (a.x + b.x) / 2 - (dy / length) * bow, y: (a.y + b.y) / 2 + (dx / length) * bow };
      const inset = 16;
      const start = toward(a, c, inset);
      const end = toward(b, c, inset + 2);
      return `M${start.x},${start.y} Q${c.x},${c.y} ${end.x},${end.y}`;
    });
    for (const d of paths) layer.append(el("path", { d, class: "stroke", "marker-end": `url(#arrow-${view.linkIdea ?? "cases"})` }));
    return layer;
  }

  function numbers(view) {
    const layer = el("g", { class: "numbers", "aria-hidden": "true" });
    for (const [id, n] of view.numbers ?? []) {
      const [cell, digit] = id.split(":").map(Number);
      const { x, y } = slot(cell, digit);
      const g = el("g", { class: "number" });
      g.append(el("circle", { cx: x + 14, cy: y - 14, r: 9.5 }));
      g.append(el("text", { x: x + 14, y: y - 14 }, String(n)));
      layer.append(g);
    }
    return layer;
  }

  const over = el("g"); // everything above the cells, drawn anew each time
  svg.replaceChildren(defs(), cellLayer, over);

  return {
    element: svg,
    render(view) {
      current = view;
      svg.setAttribute("class", `board tone-${view.idea ?? "none"}${interactive ? " interactive" : ""}${view.links?.length ? " has-links" : ""}${(view.selected ?? null) !== null ? " has-selection" : ""}`);
      svg.setAttribute("aria-label", view.label ?? BOARD.label);
      cells(view);
      over.replaceChildren(grid(), contradiction(view), selection(view), labels(), links(view), contents(view), numbers(view));
    },
  };
}

