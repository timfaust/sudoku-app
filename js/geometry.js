// Where things are on the grid, for drawing and naming only. No reasoning lives
// here (D49): which candidates exist or follow always comes from the engine.

export const ROWS = "ABCDEFGHJ"; // no I, so that it is never read as 1

export const rowOf = cell => Math.floor(cell / 9);
export const colOf = cell => cell % 9;
const boxOf = cell => Math.floor(rowOf(cell) / 3) * 3 + Math.floor(colOf(cell) / 3);
export const cellName = cell => `${ROWS[rowOf(cell)]}${colOf(cell) + 1}`;
export const key = fact => `${fact.cell}:${fact.digit}`;
export const digitsOf = puzzle => [...puzzle].map(Number); // a puzzle's 81 digits, 0 for empty

// The cells of a constraint: one cell, or a row, column or box.
export function houseCells(constraint) {
  if (!constraint) return [];
  const i = constraint.index;
  switch (constraint.kind) {
    case "cell": return [i];
    case "row": return Array.from({ length: 9 }, (_, c) => i * 9 + c);
    case "column": return Array.from({ length: 9 }, (_, r) => r * 9 + i);
    case "box": {
      const top = Math.floor(i / 3) * 3;
      const left = (i % 3) * 3;
      return Array.from({ length: 9 }, (_, n) => (top + Math.floor(n / 3)) * 9 + left + (n % 3));
    }
    default: return [];
  }
}

// Two cells in one row, column or box.
export function sees(a, b) {
  return a !== b && (rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b));
}
