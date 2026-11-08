// The UI's only way to the engine (D48, D49): one call interface, two transports.
//
// Every call is a stream of JSON events (see sudoku_reasoner/service.py). Served
// by the desktop app (app.py), they arrive as JSON lines over HTTP; in the
// static site, the same service runs in Web Workers under Pyodide (worker.js).
// Which one is fixed when the site is built (site.py writes the line below),
// so the app never waits on the network to find its engine.

import { ENGINE } from "./text.js";

export const VERSION = "658b377";

// A random seed for a call that takes one (generate, twin).
export const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export class EngineError extends Error {
  // `refused`: the engine refused the call's arguments before any event.
  constructor(message, { refused = false, cancelled = false } = {}) {
    super(message);
    this.name = "EngineError";
    this.refused = refused;
    this.cancelled = cancelled;
  }
}

const cancelled = () => new EngineError("cancelled", { cancelled: true });

// Split a stream of text chunks into complete lines, keeping the remainder.
export function lineSplitter() {
  let rest = "";
  return {
    push(chunk) {
      rest += chunk;
      const lines = rest.split("\n");
      rest = lines.pop();
      return lines.filter(line => line.trim());
    },
    end() {
      const last = rest.trim();
      rest = "";
      return last ? [last] : [];
    },
  };
}

// The desktop app's server: each call is its own process, so several run at once.
export function httpTransport(fetchImpl = (...args) => fetch(...args)) {
  return {
    kind: "server",
    parallel: 3,
    async run(name, args, deliver, signal) {
      let response;
      try {
        response = await fetchImpl(`api/${name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
          signal,
        });
      } catch {
        if (signal?.aborted) throw cancelled();
        throw new EngineError(ENGINE.unreachable);
      }
      if (!response.ok) {
        let message = ENGINE.refused(response.status);
        try {
          message = (await response.json()).error || message;
        } catch { /* keep the generic message */ }
        throw new EngineError(message, { refused: response.status === 400 });
      }
      // A line that is no JSON is a broken stream; the caller's own error
      // ends the call as itself.
      let failed = null;
      const line = text => {
        let event;
        try {
          event = JSON.parse(text);
        } catch {
          throw new EngineError(ENGINE.brokeOff);
        }
        if (event.type === "error") throw new EngineError(event.message);
        try {
          deliver(event);
        } catch (error) {
          failed = error;
          throw error;
        }
      };
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const lines = lineSplitter();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          lines.push(decoder.decode(value, { stream: true })).forEach(line);
        }
        lines.push(decoder.decode()).forEach(line);
        lines.end().forEach(line);
      } catch (error) {
        if (failed) {
          reader.cancel().catch(() => {});
          throw failed;
        }
        if (signal?.aborted) throw cancelled();
        throw error instanceof EngineError ? error : new EngineError(ENGINE.brokeOff);
      }
    },
  };
}

// Web Workers, one call each, at most `size` at once: a job runs `parallel`
// calls and one more is left for a hint, so it never waits behind the job;
// further calls wait their turn. The first worker is made at once and `warm`
// stay ready with Pyodide loaded; one made for calls at once is kept while
// calls keep coming and ends after `linger` ms idle, handing its memory back.
// A call cannot be interrupted, so cancelling it terminates its worker.
export function workerTransport({
  make = () => new Worker(new URL("./worker.js", import.meta.url), { type: "module" }),
  parallel = 2,
  size = parallel + 1,
  warm = 1,
  linger = 30000,
} = {}) {
  const idle = []; // { worker, timer }: workers waiting for a call
  const waiting = []; // the starts of calls waiting for a worker
  let live = 0; // workers made and not ended
  const spawn = () => { live += 1; return make(); };
  const end = worker => { live -= 1; worker.terminate(); };
  // A free worker goes to the call waiting longest, else waits itself.
  const give = worker => {
    const next = waiting.shift();
    if (next) return next(worker);
    const spare = { worker, timer: null };
    if (idle.length >= warm) {
      spare.timer = setTimeout(() => {
        spare.timer = null;
        if (idle.length <= warm) return;
        idle.splice(idle.indexOf(spare), 1);
        end(worker);
      }, linger);
    }
    idle.push(spare);
  };
  // A worker that may not be as it was ends; a fresh one takes its place
  // when a call waits or too few are warm.
  const discard = worker => {
    end(worker);
    if (waiting.length || idle.length < warm) give(spawn());
  };
  // Start a call on a worker now or once one is free; returns the ticket
  // to leave the queue with, or null when it started.
  const take = start => {
    const spare = idle.pop();
    if (spare) clearTimeout(spare.timer);
    const worker = spare?.worker ?? (live < size ? spawn() : null);
    if (worker) { start(worker); return null; }
    waiting.push(start);
    return start;
  };
  give(spawn());
  return {
    kind: "worker",
    parallel,
    run(name, args, deliver, signal) {
      if (signal?.aborted) return Promise.reject(cancelled());
      return new Promise((resolve, reject) => {
        let worker = null;
        let started = false;
        const finish = (error, keep) => {
          signal?.removeEventListener("abort", abort);
          if (worker) {
            worker.onmessage = worker.onerror = null;
            if (keep) give(worker);
            else discard(worker);
          }
          if (error) reject(error);
          else resolve();
        };
        const abort = () => {
          if (!worker) waiting.splice(waiting.indexOf(ticket), 1);
          finish(cancelled(), false);
        };
        signal?.addEventListener("abort", abort);
        const ticket = take(given => {
          worker = given;
          worker.onerror = event => {
            event.preventDefault?.();
            finish(new EngineError(ENGINE.stopped(event.message)), false);
          };
          worker.onmessage = ({ data: { kind, value } }) => {
            if (kind === "ready") return;
            if (kind === "event") {
              started = true;
              let event;
              try {
                event = JSON.parse(value);
              } catch {
                return finish(new EngineError(ENGINE.brokeOff), false);
              }
              // The caller's own error ends the call as itself, not as the
              // engine's; its worker, still busy with the call, goes.
              try {
                deliver(event);
              } catch (error) {
                finish(error, false);
              }
              return;
            }
            if (kind === "done") return finish(null, true);
            // A refusal leaves the worker as it was; after a failure (the engine's,
            // or Pyodide's that never started) it may not be, so it is replaced.
            const message = kind === "unstarted" ? ENGINE.start(value) : value;
            finish(new EngineError(message, { refused: kind === "invalid" && !started }), kind === "invalid");
          };
          worker.postMessage({ name, args });
        });
      });
    },
  };
}

const transport = globalThis.document ? (VERSION !== null ? workerTransport() : httpTransport()) : null;

// How many calls of one job the transport runs at once.
export const PARALLEL = transport?.parallel ?? 1;

// Whether the engine runs in the browser: the app is a static site, installable.
export const IN_BROWSER = transport?.kind === "worker";

// Call `name` with `args`; `onEvent` receives each event as it arrives. Resolves
// with every event when the stream ends; rejects with an EngineError on a refused
// call, an engine error, or cancellation through `signal`.
export async function call(name, args, { onEvent = () => {}, signal, via = transport } = {}) {
  const events = [];
  await via.run(name, args, event => {
    events.push(event);
    onEvent(event);
  }, signal);
  return events;
}
