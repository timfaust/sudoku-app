import { APP } from "./text.js";

// A touch screen: no hover and a finger (the tablet build, D78). Its words drop
// the keyboard's keys, and its tips show on a long press (touchTips).
export const touch = globalThis.matchMedia?.("(hover: none) and (pointer: coarse)") ?? { matches: false };

// h("button", { class: "button", onclick }, "Text", child, …): build elements
// without HTML strings, so no text is ever parsed as markup.
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// svg("rect", { x: 0 }, "text"): the same for SVG elements.
export function svg(name, attrs = {}, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

// The keyboard shortcuts of the screen shown, [[keys, what they do], …], in
// the sheet the app bar's key icon opens (index.html).
export function shortcuts(list) {
  document.querySelector("#keys")?.replaceChildren(h("dl", {}, list.map(([keys, does]) => [
    h("dt", {}, keys.map(k => h("kbd", {}, k))), h("dd", {}, does)])));
}

// Render without losing the keyboard's place. A control names itself and its
// fallbacks in data-focus ("next back walk"): after `draw`, focus returns to the
// first of those names that is still there and enabled.
export function keepFocus(draw) {
  const names = document.activeElement?.dataset?.focus?.split(" ") ?? [];
  draw();
  for (const name of names) {
    const target = [...document.querySelectorAll("[data-focus]")]
      .find(e => e.dataset.focus.split(" ")[0] === name && !e.disabled);
    if (target) return target.focus();
  }
}

// A press on the page's bare background, not on a control or any content: the
// screen's layout boxes, the app bar's free space. `act` runs on each; the
// returned function stops listening (D99).
const BACKGROUND = "body, .app, .bar, .bar-spacer, .view, .stage, .side, .side > section, .board-host, .legend";
export function onBackground(act) {
  const listen = event => { if (event.target instanceof Element && event.target.matches(BACKGROUND)) act(); };
  document.addEventListener("pointerdown", listen);
  return () => document.removeEventListener("pointerdown", listen);
}

// The app never scrolls (APP_CONCEPT §8): a list that makes its column
// overflow shows a page at a time, whole items only, with
// ‹ Page n of m › beneath. `items` are the blocks a page holds (the list's
// children unless given, in order down the page); `at` is the page asked for
// and `pick(i)` asks for another; `keep`, an item, picks the page that holds
// it. Call it once the list is in the page, after every redraw. Returns the
// page shown.
// `frame` is what must not overflow: the list's column unless given.
export function fitPages(list, { items = [...list.children], at = 0, keep = null, pick, frame = list.closest(".side") }) {
  if (list.nextElementSibling?.classList.contains("pages")) list.nextElementSibling.remove();
  items.forEach(item => { item.hidden = false; });
  if (!frame || !items.length) return 0;
  const over = () => frame.scrollHeight - frame.clientHeight;
  if (over() <= 0) return 0;
  const bar = h("div", { class: "pages" },
    h("button", { class: "button text", type: "button", "aria-label": APP.pagePrevious, "data-focus": "page-back page-next" }, "‹"),
    h("span", { class: "count" }),
    h("button", { class: "button text", type: "button", "aria-label": APP.pageNext, "data-focus": "page-next page-back" }, "›"));
  list.after(bar);
  // The room the items have: what they take now, less what overflows. A page
  // shown alone sits a little differently (margins, gaps), so what still
  // overflows then is taken off the room, until the page fits.
  const boxes = items.map(item => item.getBoundingClientRect());
  let room = Math.max(...boxes.map(box => box.bottom)) - boxes[0].top - over();
  let pages, page;
  for (let tries = 1; ; tries++) {
    pages = [[]];
    let start = boxes[0].top;
    items.forEach((item, i) => {
      if (boxes[i].bottom - start > room && pages.at(-1).length) {
        pages.push([]);
        start = boxes[i].top;
      }
      pages.at(-1).push(item);
    });
    const held = keep ? pages.findIndex(p => p.includes(keep)) : -1;
    page = held >= 0 ? held : Math.max(0, Math.min(pages.length - 1, at));
    items.forEach(item => { item.hidden = !pages[page].includes(item); });
    if (over() <= 0 || tries === 4) break;
    room -= over();
    items.forEach(item => { item.hidden = false; });
  }
  const [back, count, next] = bar.children;
  count.textContent = APP.pages(page + 1, pages.length);
  back.disabled = page === 0;
  next.disabled = page === pages.length - 1;
  back.onclick = () => pick(page - 1);
  next.onclick = () => pick(page + 1);
  return page;
}

// A finger has no hover, so on a touch screen an element's title shows in a
// bubble (#tip, index.html): after a long press on a control, whose tap acts,
// or after a tap on anything else. The next touch, or a few seconds, hides it.
export function touchTips(coarse = touch) {
  const bubble = document.querySelector("#tip");
  const ACTS = "button, a, input, select, textarea, summary, [role=button]";
  let press = null;
  let hide = null;
  let shown = false;
  const close = () => { clearTimeout(hide); if (shown) bubble.hidePopover(); shown = false; };
  const show = element => {
    bubble.textContent = element.title;
    bubble.showPopover();
    shown = true;
    const box = element.getBoundingClientRect();
    const left = Math.max(8, Math.min(box.left + box.width / 2 - bubble.offsetWidth / 2, innerWidth - bubble.offsetWidth - 8));
    const above = box.top - bubble.offsetHeight - 8;
    Object.assign(bubble.style, { left: `${left}px`, top: `${above > 8 ? above : box.bottom + 8}px` });
    hide = setTimeout(close, 4000);
  };
  // Every touch starts afresh: a long press whose click never came (the
  // browser sends none after it) must not swallow the next tap.
  addEventListener("pointerdown", event => {
    close();
    if (press) clearTimeout(press.timer);
    press = null;
    const element = event.target instanceof Element && event.target.closest("[title]");
    if (!coarse.matches || event.pointerType !== "touch" || !element?.title) return;
    const acts = Boolean(element.closest(ACTS));
    const pressed = { element, timer: null, acts, fired: false };
    if (acts) pressed.timer = setTimeout(() => { pressed.fired = true; show(element); }, 500);
    press = pressed;
  }, true);
  const cancel = () => { if (press) clearTimeout(press.timer); };
  addEventListener("pointercancel", () => { cancel(); press = null; }, true);
  addEventListener("pointerup", cancel, true);
  // A long press that showed a tip does not also act; a tap on a label shows it.
  addEventListener("click", event => {
    if (!press) return;
    const { element, acts, fired } = press;
    press = null;
    if (fired) { event.preventDefault(); event.stopPropagation(); }
    else if (!acts && element.contains(event.target)) show(element);
  }, true);
  addEventListener("contextmenu", event => { if (press?.acts) event.preventDefault(); }, true);
}
