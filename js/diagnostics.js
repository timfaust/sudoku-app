// The diagnostics page (APP_CONCEPT.md §8, U5 phase 2): the viewport, the pixel
// ratio and the pen's pointer events, and the engine's timings on this device,
// so the tablet's layout and PARALLEL rest on measurements. A tool for the
// build, in English only, reached by its address, never from the app.
import { IN_BROWSER, PARALLEL, call } from "./engine.js";
import { h } from "./dom.js";

const LEVEL5 = "005000000090803000001200536060300000203000801000008090186004900000901040000000600";
const LEVEL6 = "040500000100030040006240500500003820300000001028900007003082100010070002000005060";

const rows = (table, entries) => table.replaceChildren(...entries.map(([name, value]) => h("tr", {}, h("th", {}, name), h("td", {}, String(value)))));
const seconds = ms => `${(ms / 1000).toFixed(1)} s`;

async function device() {
  const cached = "caches" in self ? await caches.keys() : [];
  const quota = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  rows(document.querySelector("#device"), [
    ["viewport (CSS px)", `${innerWidth} × ${innerHeight}`],
    ["screen (CSS px)", `${screen.width} × ${screen.height}`],
    ["device pixel ratio", devicePixelRatio],
    ["orientation", screen.orientation?.type ?? "unknown"],
    ["installed (standalone)", matchMedia("(display-mode: standalone)").matches ? "yes" : "no"],
    ["pointer", ["fine", "coarse"].filter(kind => matchMedia(`(any-pointer: ${kind})`).matches).join(", ") || "none"],
    ["hover", matchMedia("(any-hover: hover)").matches ? "yes" : "no"],
    ["engine", IN_BROWSER ? `in the browser, ${PARALLEL} at once` : `the desktop app's server, ${PARALLEL} at once`],
    ["offline copy", cached.join(", ") || "none"],
    ["storage", quota ? `${(quota.usage / 1e6).toFixed(0)} MB of ${(quota.quota / 1e6).toFixed(0)} MB` : "unknown"],
    ["browser", navigator.userAgent],
  ]);
}

// Each pointer event on the pad, the last one shown, and a count of each kind.
function pointer() {
  const pad = document.querySelector("#pad");
  const table = document.querySelector("#pointer");
  const counts = {};
  const show = event => {
    event.preventDefault();
    counts[`${event.pointerType} ${event.type}`] = (counts[`${event.pointerType} ${event.type}`] ?? 0) + 1;
    rows(table, [
      ["type", event.pointerType],
      ["pressure", event.pressure.toFixed(3)],
      ["tilt", `${event.tiltX}°, ${event.tiltY}°`],
      ["contact (CSS px)", `${event.width.toFixed(1)} × ${event.height.toFixed(1)}`],
      ["buttons", event.buttons],
      ["coalesced in the last move", event.getCoalescedEvents?.().length ?? "unknown"],
      ["events", Object.entries(counts).map(([name, n]) => `${name} ${n}`).join(", ")],
    ]);
  };
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) pad.addEventListener(type, show);
}

// The engine's timings: the first answer, a level 5 analysis, a level 6 puzzle
// made, and two and three analyses at once (how many to run together).
async function measure() {
  const button = document.querySelector("#measure");
  const table = document.querySelector("#engine");
  const results = [];
  const timed = async (name, job) => {
    rows(table, [...results, [name, "…"]]);
    const start = performance.now();
    try {
      results.push([name, await job(start)]);
    } catch (error) {
      results.push([name, `failed: ${error.message}`]);
    }
    rows(table, results);
  };
  const at = start => seconds(performance.now() - start);
  button.disabled = true;
  await timed("first answer", async start => { await call("ideas", {}); return at(start); });
  await timed("analyse, level 5", async start => { await call("analyse", { puzzle: LEVEL5 }); return at(start); });
  await timed("analyse, level 6", async start => { await call("analyse", { puzzle: LEVEL6 }); return at(start); });
  await timed("make a level 6 puzzle (seed 3)", async start => {
    const made = (await call("generate", { level: 6, seed: 3 })).at(-1);
    return `${at(start)}, ${made.tried} tried`;
  });
  for (const n of [2, 3]) {
    await timed(`${n} level 5 analyses at once`, async start => {
      await Promise.all(Array.from({ length: n }, () => call("analyse", { puzzle: LEVEL5 })));
      return at(start);
    });
  }
  button.disabled = false;
}

device();
pointer();
document.querySelector("#measure").addEventListener("click", measure);
