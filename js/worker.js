// The engine in the browser (D48): Pyodide runs service.py in this Web Worker.
//
// A worker runs one call at a time: it receives { name, args } and posts each of
// service.run's messages as { kind, value }; "unstarted" when Pyodide or the
// package could not load (its reason). A call cannot be interrupted, so
// cancelling one terminates the worker (engine.js). The site holds Pyodide under
// pyodide/ and the package under engine/ (sudoku_reasoner/site.py).

const site = path => new URL(`../${path}`, import.meta.url).href;

async function start() {
  const { loadPyodide } = await import(site("pyodide/pyodide.mjs"));
  const pyodide = await loadPyodide({ indexURL: site("pyodide/") });
  const response = await fetch(site("engine/sudoku_reasoner.zip"));
  if (!response.ok) throw new Error(`the engine's files are missing (${response.status})`);
  pyodide.unpackArchive(await response.arrayBuffer(), "zip", { extractDir: "/home/pyodide" });
  return pyodide.runPython(
    "import json, sys\n"
    + "sys.path.insert(0, '/home/pyodide')\n"
    + "from sudoku_reasoner.service import run\n"
    + "lambda name, text: run(name, json.loads(text))\n",
  );
}

const ready = start();
ready.then(() => postMessage({ kind: "ready" }), () => {});

self.onmessage = async ({ data: { name, args } }) => {
  let run;
  try {
    run = await ready;
  } catch (error) {
    postMessage({ kind: "unstarted", value: error.message });
    return;
  }
  let messages = null;
  try {
    messages = run(name, JSON.stringify(args ?? {}));
    for (const message of messages) {
      const [kind, value] = message.toJs();
      message.destroy();
      postMessage({ kind, value });
    }
  } catch (error) {
    postMessage({ kind: "failed", value: String(error.message ?? error) });
  } finally {
    messages?.destroy();
  }
};
