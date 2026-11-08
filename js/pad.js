// The digit pad, for Solve and Learn: what a digit does (place it, note it in
// a corner or the centre, remove it as a candidate, or ask why it does or
// doesn't go) and nine keys. It decides nothing about Sudoku (D49): each key is
// described by the view that shows it.

import { h, touch } from "./dom.js";
import { PAD } from "./text.js";

// The key that switches to what a digit can do; its words are PAD's. The word
// is enough beside the pad, whose keys show what each mode does.
const KEYS = { corner: "Shift", centre: "Ctrl", remove: "Shift", ask: "?" };

// The switch between what a digit does, among `modes`. `keyless` modes have no
// key at the moment, since another mode has it (Shift is a corner note or a
// removal, by what the board shows). Without `chips` the keys are named only
// in each mode's tooltip and the screen's keyboard sheet, so that many modes
// fit on one line. A touch screen's tips name no keys.
export function padMode(mode, choose, modes = ["place", "remove"], { keyless = [], chips = true } = {}) {
  return h("div", { class: "switch", role: "group", "aria-label": PAD.label }, modes.map(value => {
    const key = keyless.includes(value) ? null : KEYS[value] ?? null;
    const { word, name } = PAD.modes[value];
    return h("button", {
      type: "button", "aria-pressed": mode === value ? "true" : "false",
      "data-focus": `mode-${value}`, "aria-keyshortcuts": key,
      "aria-label": name, title: key && !touch.matches ? PAD.withKey(name, key) : name, onclick: () => choose(value),
    }, word, key && chips ? h("kbd", { "aria-hidden": "true" }, key) : null);
  }));
}

// The nine keys, drawn for `mode` (a key shows its digit as what it makes).
// `key(d)` gives { label, disabled, gone, pressed, left }: the key's accessible
// name, whether it does nothing, whether it gives back a candidate the player
// removed, whether the note is in every selected cell, and the digits left to
// place (shown small, or not at all when undefined), which the key's name and
// tooltip end with ("Remove 5, 3 left"), so the small number says what it is.
// `row` lays the keys out as a row of the board, else as a box.
const LOOKS = { remove: " removing", corner: " noting corner", centre: " noting centre" };

export function padKeys({ mode, key, onDigit, row = false }) {
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => {
    const k = key(d);
    const name = k.left ? PAD.left(k.label, k.left) : k.label;
    return h("button", {
      class: `digit-key${k.gone ? " gone" : ""}`, type: "button", disabled: k.disabled, "data-focus": `digit-${d}`,
      "aria-label": name, title: name, "aria-pressed": k.pressed === undefined ? null : String(k.pressed), onclick: () => onDigit(d),
    }, String(d), k.left ? h("small", { "aria-hidden": "true" }, String(k.left)) : null);
  });
  return h("div", { class: `digits${row ? " row-pad" : ""}${LOOKS[mode] ?? ""}` }, keys);
}
