// The difficulty strip: one bar per round, the profile's two numbers (D31,
// D60) on fixed scales, so strips compare across puzzles. Above the line, the
// round's effort up to the rating's ceiling (D58), in the colour of the idea
// the round leads with; below it, in grey, the round's search: the looks to
// its first step. A dashed line marks the level; a puzzle stopped at the
// ceiling ends in an open bar above it, a button to the end, where the round
// beyond can be worked out. The puzzle's fingerprint (D45); each bar is a
// button to its round.

import { h } from "./dom.js";
import { STRIP, leadIdea, looks } from "./text.js";

// The rating's ceiling (D58, path.CEILING; tests/test_web.py checks that they
// agree), the UI's one copy of it. It is also the strip's fixed scale, so that
// every strip, and every bar drawn like one, compares with every other.
export const CEILING = 10;

// Search's fixed scale: the most looks a round can take, every place open (81
// cells and 81 digits in each of rows, columns and boxes) and one start. A
// round's bar grows with the square root of its looks, so that a few looks
// stay short and a well hidden round stands out.
const LOOKS_SCALE = (4 * 81 + 1) / 2;
const fall = value => Math.min(Math.sqrt(value / LOOKS_SCALE), 1);

// rounds: [{ burden, looks, ideas }] (service.rating's strip); ceiling: the rating's effort
// ceiling (null when unbounded, so not always CEILING); level: the profile's level, or the largest so
// far while `final` is false; limited: the next round costs more than the ceiling; current: the selected
// round index, rounds.length meaning the end state; onSelect(index), or null
// for a strip to look at only.
export function renderStrip(host, { rounds, ceiling, level, final, limited, current, onSelect }) {
  const top = ceiling ?? Math.max(level, ...rounds.map(r => r.burden), 1);
  const share = burden => Math.min(burden / top, 1);
  const label = STRIP.level(limited, final, level, ceiling);
  // Bars are buttons to their rounds, or, without `onSelect`, a still picture.
  const bar = ({ onclick, "aria-label": name, "data-focus": focus, roundLooks, ...attrs }) => {
    const marks = [h("i"), roundLooks ? h("b", { style: `--fall: ${fall(roundLooks)}` }) : null];
    return onSelect
      ? h("button", { ...attrs, type: "button", "aria-label": name, "data-focus": focus, onclick }, marks)
      : h("span", { ...attrs, "aria-hidden": "true" }, marks);
  };
  host.replaceChildren(h("div", { class: "strip" },
    h("div", { class: "strip-bars", role: onSelect ? null : "img", "aria-label": onSelect ? null : STRIP.rounds(rounds.length, label) },
      rounds.map((round, i) => bar({
        class: `strip-bar tone-${leadIdea(round.ideas)}`, style: `--share: ${share(round.burden)}`, roundLooks: round.looks,
        "aria-label": STRIP.round(i, round.burden, looks(round.looks)),
        "aria-current": i === current ? "step" : null,
        "data-focus": `round-${i}`, onclick: () => onSelect(i),
      })),
      limited ? bar({
        class: "strip-bar beyond", style: "--share: 1", "aria-label": STRIP.beyond,
        "aria-current": current === rounds.length ? "step" : null, "data-focus": "round-beyond", onclick: () => onSelect(rounds.length),
      }) : null),
    level ? h("div", { class: "strip-level", style: `--share: ${limited ? 1 : share(level)}`, "aria-hidden": "true" }, h("span", {}, label)) : null));
}

// The strip, small and still, for a list of puzzles: the same scale and
// colours, no buttons. Its label is the puzzle's in words.
export function miniStrip(rating, label) {
  return h("span", { class: "mini-strip", role: "img", "aria-label": label },
    rating.strip.map(round => h("span", {},
      h("i", { class: `tone-${leadIdea(round.ideas)}`, style: `--share: ${Math.min(round.burden / CEILING, 1)}` }),
      h("b", { style: `--fall: ${fall(round.looks)}` }))),
    rating.limited ? h("span", {}, h("i", { class: "beyond", style: "--share: 1" })) : null);
}

// Time hangs below the line as search does on the puzzle's strip, on a fixed
// square-root scale up to TIME_SCALE, so that the player's minutes read
// beside the puzzle's looks and across solves.
const TIME_SCALE = 5 * 60 * 1000;

// The player's path (D71): one bar per move, in order, as high as the easiest
// step was at the position the move was made in, on the strip's scale, so it
// reads beside the puzzle's strip; the time it took below the line; the
// puzzle's level dashed across it. One of the easiest steps is filled in its
// idea's colour, hatched when help showed it; any other move is an outline.
// `moves` are play.path's verdicts; `level` the puzzle's, or null.
export function pathStrip(moves, label, level = null) {
  return h("div", { class: "strip path", role: "img", "aria-label": label },
    h("div", { class: "strip-bars" }, moves.map(m => {
      const kind = m.status === "easiest" ? (m.helped ? "helped" : "easiest") : m.status === "pending" ? "pending" : "other";
      const share = m.easiest === null ? 1 : Math.min(m.easiest / CEILING, 1);
      const time = m.took ? h("b", { style: `--fall: ${Math.min(Math.sqrt(m.took / TIME_SCALE), 1)}` }) : null;
      return h("span", { class: `strip-bar ${kind} tone-${m.idea ?? "none"}`, style: `--share: ${share}`, "aria-hidden": "true" },
        h("i"), time);
    })),
    level ? h("div", { class: "strip-level", style: `--share: ${Math.min(level / CEILING, 1)}`, "aria-hidden": "true" }) : null,
    h("span", { class: "path-label", "aria-hidden": "true" }, STRIP.you));
}
