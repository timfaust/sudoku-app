// A puzzle the engine refused, or a view that cannot start: the reason in a
// sentence, and the ways on. `back` is the link to the sample, for a view on a
// puzzle the engine refused (main.js has dropped it by then).

import { h } from "../dom.js";
import { FAILURE, sentence } from "../text.js";

export function failure(message, { openPuzzle = null, back = null, title = FAILURE.title } = {}) {
  return h("section", { class: "error", role: "alert" },
    h("p", { class: "title" }, title),
    h("p", { class: "meta" }, sentence(message)),
    h("div", { class: "row" },
      openPuzzle ? h("button", { class: "button primary", type: "button", onclick: openPuzzle }, FAILURE.open) : null,
      back ? h("a", { class: "button text", href: back }, FAILURE.back) : null));
}
