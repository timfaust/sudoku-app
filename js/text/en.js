// The app's words in English (D81): every name text.js lists, as a constant
// or a function of what it says with this language's grammar. Pure functions
// of the engine's events (service.py), so they are tested without a browser.

import { ROWS, cellName } from "../geometry.js";
import { essential, headlineGroups, keyIdeas, survivor } from "../reading.js";

function joinNatural(items, word = "and") {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} ${word} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${word} ${items.at(-1)}`;
}

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

// A length of time in words, to the minute.
export function duration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "under a minute";
  if (minutes < 90) return plural(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  return `${plural(hours, "hour")} ${plural(minutes % 60, "minute")}`;
}
const NUMBER = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const count = n => NUMBER[n] ?? String(n);

export const factPhrase = fact => `${cellName(fact.cell)} ${fact.value ? "=" : "≠"} ${fact.digit}`;

// The four ideas every step belongs to (APP_CONCEPT.md): the teaching vocabulary.
// The engine names each move's idea (ideas.idea); these are its words, in
// reading.IDEA_ORDER.
export const IDEAS = {
  single: {
    name: "One option left",
    hint: "Look for a cell with one candidate, or a digit with one place in a house.",
    short: "A cell with one candidate, or a digit with one place left in a house.",
    about: "Each cell holds one digit, and each row, column and box holds every digit once. So when a cell has " +
      "one candidate left, or a digit has one place left in a row, column or box, that option is the answer.",
    task: "Find a digit with one option left, and place it.",
  },
  count: {
    name: "Counting",
    hint: "Look for digits that must fill exactly as many places as they have.",
    short: "As many digits as places: they fill them and go nowhere else.",
    about: "When a few cells can hold only as many digits as there are cells, those digits must fill them, so " +
      "they go nowhere else in the house. It works the other way round, and for one digit across rows and " +
      "columns: count the options, then remove what they leave no room for.",
    task: "Find a counting step, and remove a candidate it rules out.",
  },
  cases: {
    name: "Whatever you choose",
    hint: "Look for a choice whose every option leads to the same result.",
    short: "Every option of a choice leads to the same result, so it holds.",
    about: "Take a cell or a house with only a few options, and follow each one. When every option leads to " +
      "the same result, the result holds whichever option is true, without knowing which.",
    task: "Find a result that holds whatever you choose, and enter it.",
  },
  fail: {
    name: "Assume and fail",
    hint: "Look for a candidate that would quickly break the puzzle.",
    short: "Suppose a candidate is true; if that breaks the puzzle, it goes.",
    about: "Suppose a candidate is true, and follow what it forces, one option left at a time. If a cell runs " +
      "out of candidates, or a digit out of places in a house, the supposition was wrong, so the candidate goes.",
    task: "Find a candidate that leads to a contradiction, and remove it.",
  },
};


// A technique name a learner may know, worked out from the step's structure
// (D46). The engine never names techniques; chains and case splits get none.
export function shapeName(move) {
  if (move.kind === "single") return move.source.kind === "cell" ? "Naked single" : "Hidden single";
  if (move.kind !== "cover") return null;
  const k = move.bases.length;
  const base = move.bases[0].kind;
  const cover = move.covers[0].kind;
  const size = ["", "single", "pair", "triple", "quad"][k];
  if (base === "cell") return `Naked ${size}`;
  if (cover === "cell") return `Hidden ${size}`;
  if (base === "box") return "Pointing";
  if (cover === "box") return "Box/line";
  return ["", "", "X-Wing", "Swordfish", "Jellyfish"][k] ?? null;
}


// The conclusions as what to do ("Remove 5 from E3 and F3; place 8 in H4"),
// grouped as reading.headlineGroups groups them.
export function headline(move) {
  return headlineGroups(move).map(({ value, digits, cells }, i) => {
    const verb = value ? "place" : "remove";
    return `${i ? verb : verb[0].toUpperCase() + verb.slice(1)} ${joinNatural(digits.map(String))} ${value ? "in" : "from"} ${joinNatural(cells.map(cellName))}`;
  }).join("; ");
}

// The name of the button that applies a step: what it will do to the board.
export function applyLabel(move) {
  const facts = essential(move.conclusions);
  const text = headline(move);
  if (facts.length === 1 || text.length <= 32) return text;
  return facts.every(f => !f.value) ? `Remove these ${facts.length} candidates` : `Make these ${facts.length} changes`;
}


export function followUps(move) {
  const hidden = move.conclusions.length - essential(move.conclusions).length;
  return hidden ? `${plural(hidden, "removal")} follow${hidden === 1 ? "s" : ""} from the placement.` : "";
}

// A house by name: "row C", "column 5", "box 3"; a cell by its own.
function houseName(constraint) {
  switch (constraint.kind) {
    case "cell": return cellName(constraint.index);
    case "row": return `row ${ROWS[constraint.index]}`;
    case "column": return `column ${constraint.index + 1}`;
    default: return `box ${constraint.index + 1}`;
  }
}

// Several houses of one kind under one name ("rows C, E and F"), else each by name.
function housesName(constraints) {
  const kind = constraints[0].kind;
  if (constraints.length < 2 || kind === "cell" || constraints.some(c => c.kind !== kind)) return joinNatural(constraints.map(houseName));
  return `${kind === "box" ? "boxes" : `${kind}s`} ${joinNatural(constraints.map(c => houseName(c).split(" ")[1]))}`;
}

const constraintLabel = c => (c.kind === "cell" ? cellName(c.index) : `${c.digit} in ${houseName(c)}`);

// Constraints under one name where they share it: "5 in columns 1 and 2",
// "1, 7 and 9 in row C", "C4 and C5".
function constraintsLabel(list) {
  if (list[0].kind !== "cell" && list.every(c => c.digit === list[0].digit)) return `${list[0].digit} in ${housesName(list)}`;
  if (list[0].kind !== "cell" && list.every(c => c.kind === list[0].kind && c.index === list[0].index)) {
    return `${joinNatural(list.map(c => String(c.digit)))} in ${houseName(list[0])}`;
  }
  return joinNatural(list.map(constraintLabel));
}

// The options of a choice: the digits of a cell, or the cells of a digit in a house.
const options = (source, facts) => joinNatural(
  facts.map(f => (source.kind === "cell" ? String(f.digit) : cellName(f.cell))), "or");

// A refutation's chain fits in one sentence up to this many forced steps; a
// longer one is left to the walkthrough.
const SPELLED = 5;



// A failing case as a clause: "B4 = 4, C4 = 8 and J4 has no candidate left".
const failure = branch => joinNatural([...branch.steps.map(s => factPhrase(s.fact)), witnessClause(branch.witness)]);

export function question(source) {
  return source.kind === "cell"
    ? `What can go in ${cellName(source.index)}?`
    : `Where can ${source.digit} go in ${houseName(source)}?`;
}

// The claim and its reason, per kind of step.
export function explanation(move) {
  if (move.kind === "single") {
    const fact = move.conclusions[0];
    return move.source.kind === "cell"
      ? { claim: `Only ${fact.digit} can go in ${cellName(fact.cell)}.`, reason: "Every other digit is already ruled out there." }
      : { claim: `${cellName(fact.cell)} is the only place for ${fact.digit} in ${houseName(move.source)}.`,
          reason: "Every other cell of that house is ruled out for it." };
  }
  if (move.kind === "cover") return coverExplanation(move);
  if (move.kind === "map") {
    return {
      claim: `${question(move.source)} ${options(move.source, move.choices)}.`,
      reason: "Follow each option along the arrows: every one of them reaches the result, so it holds whichever is true.",
    };
  }
  if (move.source === null) {
    const { assumption: z, steps, witness } = move.branches[0];
    const so = `so ${cellName(z.cell)} cannot be ${z.digit}.`;
    return {
      claim: `Suppose ${factPhrase(z)}.`,
      reason: steps.length <= SPELLED
        ? `Then ${failure(move.branches[0])}, ${so}`
        : `That forces ${count(steps.length)} steps and ends in a contradiction, ${so}`,
    };
  }
  const left = survivor(move);
  const failing = move.branches.filter(b => b.contradiction);
  if (left && failing.length <= 2 && failing.every(b => b.steps.length <= SPELLED)) {
    const ifs = failing.map((b, i) => `${i ? "if" : "If"} ${factPhrase(b.assumption)}, then ${failure(b)}`);
    return {
      claim: `${question(move.source)} ${options(move.source, move.branches.map(b => b.assumption))}.`,
      reason: `${ifs.join("; ")}, so ${factPhrase(left.assumption)}.`,
    };
  }
  return {
    claim: `${question(move.source)} ${options(move.source, move.branches.map(b => b.assumption))}.`,
    reason: "Try each option in turn: every option that does not fail leads to the result, so it holds whichever is true.",
  };
}

function coverExplanation(move) {
  const k = move.bases.length;
  const bases = housesName(move.bases);
  const covers = housesName(move.covers);
  const baseList = constraintsLabel(move.bases);
  const coverList = constraintsLabel(move.covers);
  const countLine = k === 1
    ? `Counting: the base (${baseList}) holds exactly one true candidate, and all its candidates lie in ` +
      `the cover (${coverList}), which holds only one. So the cover's other candidates are false.`
    : `Counting: the ${count(k)} bases (${baseList}) each hold exactly one true candidate, and all their ` +
      `candidates lie in ${count(k)} covers (${coverList}), which hold one each. So the bases fill the covers, ` +
      "and the covers' other candidates are false.";
  if (move.bases[0].kind === "cell" || move.covers[0].kind === "cell") {
    const hidden = move.covers[0].kind === "cell";
    const cells = (hidden ? move.covers : move.bases).map(c => cellName(c.index));
    const houses = hidden ? move.bases : move.covers;
    const digits = [...new Set(houses.map(h => h.digit))].sort((a, b) => a - b);
    const house = houseName(houses[0]);
    return hidden
      ? { claim: `In ${house}, ${joinNatural(digits.map(String))} can only go in ${joinNatural(cells)}.`,
          reason: "Those cells must hold those digits, so their other candidates go.", count: countLine }
      : { claim: `${joinNatural(cells)} can only hold ${joinNatural(digits.map(String))}.`,
          reason: `Those digits must fill those cells, so they cannot go anywhere else in ${house}.`, count: countLine };
  }
  const digit = move.bases[0].digit;
  return {
    claim: `In ${bases}, ${digit} can only go in ${covers}.`,
    reason: k === 1
      ? `So the ${digit} of ${covers} is the one in ${bases}, and ${digit} goes nowhere else there.`
      : `So ${covers} get their ${digit}s from ${bases}, and ${digit} goes nowhere else in them.`,
    count: countLine,
  };
}

export function stepPhrase(step) {
  return step.source.kind === "cell"
    ? `${factPhrase(step.fact)}: the only candidate left in ${cellName(step.source.index)}.`
    : `${factPhrase(step.fact)}: the only place left for ${step.source.digit} in ${houseName(step.source)}.`;
}

const witnessClause = witness => (witness.kind === "cell"
  ? `${cellName(witness.index)} has no candidate left`
  : `${witness.digit} has no place left in ${houseName(witness)}`);

export const witnessPhrase = witness => `${witnessClause(witness)}.`;

// Effort in words: what following the step makes you hold, follow and watch.
export function effortWords(effort) {
  const watch = effort.focus === 1 ? "inside one house or digit" : `across ${count(effort.focus)} houses or digits`;
  return `You hold ${plural(effort.work, "fact")}, follow a chain of ${plural(effort.span, "step")}, and look ${watch}.`;
}

export function effortSum(effort) {
  return `${effort.work} + ${effort.span} + ${effort.focus} − 2 = ${effort.burden}`;
}

// Search (D60): a look reads one place, a cell or a digit in a row, column or
// box; a round's search is the looks to its first step, in no particular order.
export const SEARCH = "The looks it takes, on average, to find a first step when you read places in no " +
  "particular order. A place is a cell, or a digit in a row, column or box.";

// A step's own search (Round.step_looks): how hidden it is, never added up.
export const STEP_SEARCH = "The looks it takes, on average, to find this step alone when you read places in " +
  "no particular order.";

export function hiddenLine(move) {
  const from = move.starts === 1 ? "one place only" : `${count(move.starts)} places`;
  return `You can find it from ${from}: about ${plural(Math.round(move.looks), "look")}, reading places in no order.`;
}

export function startsPhrase(round) {
  return `${round.moves.length === 1 ? "It starts" : "They start"} in ${round.starts} of ${plural(round.places, "place")} to look.`;
}

// The hint ladder (D44): 1 the idea, 2 where, 3 what, 4 the step.
const REGION = {
  digit: r => `the ${r.digit}s`,
  band: r => `the ${r.digit}s in the ${["top", "middle", "bottom"][r.index]} band`,
  stack: r => `the ${r.digit}s in the ${["left", "middle", "right"][r.index]} stack`,
};

export function regionName(region) {
  return (REGION[region.kind] ?? houseName)(region);
}

// The name of the action that climbs from `rung` to the next one.
export const NEXT_RUNG = ["Hint", "Where to look", "What to look for", "Show the step"];

// What the hint at `rung` says; at 4 the step speaks for itself.
export function hintLine(move, rung) {
  if (rung <= 1) return IDEAS[move.idea].hint;
  if (rung === 2) {
    const where = move.kind === "single" ? houseName(move.source) : move.focus[0].map(regionName).join(" and ");
    return `Look at ${where}.`;
  }
  if (rung === 3) return move.kind === "single" ? question(move.source) : "The marked candidates hold the step. What do they allow?";
  return "";
}

// Learn (APP_CONCEPT.md §4): what a practice position asks, and what an answer was.

// The engine's verdict on a fact the learner entered that is not among the
// position's easiest steps (service.ask): a check, or why it is no step here.
// `harder`: true, but no step of the position's `effort` proves it.
export function attemptLine(fact, status, effort) {
  const cell = cellName(fact.cell);
  return {
    false: fact.value
      ? `Wrong: by the solution, ${cell} is not ${fact.digit}.`
      : `Wrong: by the solution, ${cell} is ${fact.digit}, so ${fact.digit} stays.`,
    decided: "The board already shows that.",
    unprovable: `${factPhrase(fact)} is true, but nothing proves it here yet: entering it would be a guess.`,
    harder: `${factPhrase(fact)} is true, but no step of effort ${effort} proves it here. An easier step is waiting.`,
    limited: `${factPhrase(fact)} is true, but proving it here costs more than this app looks for.`,
  }[status];
}

// How a practice position ended: found (unaided or with hints), found by a
// step of another idea or of more effort, or shown.
export function resultLine(result, idea, effort) {
  if (result.how === "shown") return null; // the step shows itself
  const helped = result.hinted ? "with a hint" : "without a hint";
  if (result.revealed) {
    return `True: a step of effort ${result.move.effort.burden} proves it. An easier one, of effort ${effort}, was here.`;
  }
  if (result.move.effort.burden > effort) {
    return `True, and you found it ${helped}, by a step of effort ${result.move.effort.burden}. An easier one, of effort ${effort}, was here.`;
  }
  if (result.move.idea !== idea) return `Found, ${helped}: a step as easy as any here, though by ${IDEAS[result.move.idea].name.toLowerCase()}.`;
  return `Found, ${helped}.`;
}

// Puzzles (APP_CONCEPT.md §4), in the player's words (D68): a level, what
// making one takes, and where a puzzle of the library came from and how far
// the player got. The profile's numbers are Analyse's and Learn's; here search
// is how easy the steps are to spot.

export const SPOT_ABOUT = "How hidden its steps are: how long, on average, they take to find.";

// The candidate heat map (D74): each candidate's level from the round, and
// what an uncoloured candidate means (no rated round decides it).
export const HEAT = { off: "Off", levels: "Step by step" };
export const HEAT_ABOUT = "Each candidate's level from here: the hardest step on the way until it is placed or removed.";
export const heatTitle = (cell, digit, value) => `${digit} in ${cellName(cell)}: level ${value} from here`;
export const HEAT_REST = "uncoloured: not decided by the rated rounds";

// The settings sheet (settings.js, D80).
export const SETTINGS = {
  simple: {
    name: "Simple mode",
    choices: { off: "Off", on: "On" },
    about: "Hides Analyse and Compare. Hints, Check, Ask why and Learn stay.",
  },
  language: { name: "Language" },
  version: "Version",
};


export function levelAbout(ceiling) {
  return `Harder than level ${ceiling}, or beyond the engine: rated, never made.`;
}


// What a made puzzle's search is asked to be (service.generate).
export const SEARCHES = { any: "Any", less: "Easier", more: "Harder" }; // to spot
const SPOT = { less: "easier", more: "harder" };

// How long making a puzzle of `level` takes, as measured (docs/RESULTS.md):
// less or more search goes on at the level for a plateau's worth of tries.
export function waitLine(level, search = "any") {
  const [seconds, minute, two] = search === "any" ? [5, 8, 8] : [0, 4, 6];
  if (level <= seconds) return "Usually ready in seconds.";
  if (level <= minute) return "Usually ready within a minute.";
  if (level <= two) return "Usually ready in a minute or two.";
  return "Can take several minutes.";
}


// A job's progress: the highest level a climb stands on and, at the level,
// whether the key idea asked cracks it yet, and how far the search has moved
// from the job's first puzzle there (`from`).
export function climbLine(at, level, search, from, idea = "any") {
  if (!at) return "Starting.";
  if (at.level < level) return `At level ${at.level} so far.`;
  if (idea !== "any" && !keyIdeas(at).includes(idea)) {
    return `Level ${level} reached; looking for one where ${IDEAS[idea].name.toLowerCase()} is the key step.`;
  }
  if (search === "any" || at.search === from) return `Level ${level} reached.`;
  return `Level ${level} reached; its steps are getting ${SPOT[search]} to spot.`;
}

// How a made puzzle came about, and what came of the search asked, in a line.
export function madeLine(made) {
  if (made.spare) return "Made earlier, on the way to another puzzle.";
  const took = `Made in ${elapsed(made.ms)}${made.idea && made.idea !== "any" ? `, ${IDEAS[made.idea].name.toLowerCase()} its key step` : ""}`;
  if (made.search === "any") return `${took}.`;
  if (made.from === made.rating.search) return `${took}; none near it was ${SPOT[made.search]} to spot.`;
  return `${took}; its steps got ${SPOT[made.search]} to spot.`;
}

// A level above the rating's ceiling (D58), in the words a place has room
// for: a title, a name, a list's short label, or a figure.
export function aboveCeiling(ceiling, form) {
  return { title: `Level above ${ceiling}`, name: `Above level ${ceiling}`, short: `Above ${ceiling}`, figure: `>${ceiling}` }[form];
}

// A puzzle's rating in a line: "Level 6, 24 givens".
export function ratingLine(rating, ceiling) {
  const level = rating.solved ? `Level ${rating.level}` : rating.limited ? aboveCeiling(ceiling, "name") : "Beyond the engine";
  return `${level}, ${plural(rating.givens, "given")}`;
}

// Why there is no next step (a stop, D40): `limited`, it costs more than the
// ceiling, or no step of the engine's language concludes anything. Analyse
// says it in full; Solve, in a player's words.
export const NO_STEP = "No step of any size in the engine's proof language concludes anything here.";
export function stopLine(limited) {
  return limited ? "The next step costs more than this app looks for." : "No step of any size concludes anything here.";
}

// Ask why's answer without a step (service.ask's status), short, under the
// question it answers; attemptLine says it in full. `fact`: the fact asked;
// `by`: the placements that rule a removal out (service.ask).
export function askLine(status, fact, by = []) {
  if (status === "decided" && by.length) {
    const own = by.find(b => b.cell === fact.cell);
    const peers = by.filter(b => b.cell !== fact.cell).map(b => cellName(b.cell));
    return [own ? `${cellName(fact.cell)} already holds ${own.digit}.` : null,
      peers.length ? `${fact.digit} is already in ${joinNatural(peers)}.` : null].filter(Boolean).join(" ");
  }
  return {
    false: "Wrong, by the solution.",
    decided: fact.value ? "The board already shows that." : "It is already ruled out here.",
    unprovable: "Nothing proves that here yet. Other cells come first.",
    limited: "Proving that here costs more than this app looks for.",
  }[status];
}

export function playLine(entry) {
  if (entry.solved) return "Solved";
  if (entry.played) return `${plural(entry.left, "cell")} to go`;
  return "New";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// When, in a word or a date: "today", "yesterday", "on 30 Oct".
export function day(time, now = Date.now()) {
  const date = new Date(time);
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(time).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `on ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function sourceLine(entry, now = Date.now()) {
  if (entry.source === "starter") return "Came with the app";
  return `${entry.source === "made" ? "Made" : "Opened"} ${day(entry.added, now)}`;
}

// The time a job has run: "8 s", "2 min 5 s".
export function elapsed(ms) {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

// How work, span and focus are read from each kind of step (Details).
export const EFFORT_READING = {
  single: "A single follows one fact directly: work, span and focus are each 1.",
  cover: "A cover holds one truth per base (work), fills its covers and excludes their other candidates (span 2), " +
    "inside one house or one digit (focus 1).",
  map: "Work counts the map's placed candidates, span its longest arrow path, focus the houses or digits it needs.",
  case: "Work counts the options and the placements each case needs, span the longest chain, focus the houses or " +
    "digits involved.",
};

// The board's marks in words; the legend shows only those on the board, in this order.
export const LEGEND = [
  ["place", "place"], ["remove", "remove"], ["assume", "assumed"], ["hypothetical", "follows in this case"],
  ["next", "forced next"], ["option", "options"], ["chain", "forced"],
  ["house", "where to look"], ["force", "forces the step"], ["base", "bases"], ["cover", "covers"],
  ["gone", "ruled out in this case"], ["fail", "contradiction"], ["refuted", "so the assumption fails"], ["arrow", "forced links"], ["later", "other steps now"],
  ["mistake", "mistake"], ["clash", "twice"], ["by", "rules it out"],
];

// ---------- the screens' words ----------

// The digit pad (pad.js): what a digit does, in a word and in full.
export const PAD = {
  label: "What a digit does",
  modes: {
    place: { word: "Place", name: "Place a digit" },
    corner: { word: "Corner", name: "Note a digit in the corner" },
    centre: { word: "Centre", name: "Note a digit in the centre" },
    remove: { word: "Remove", name: "Remove a candidate" },
    ask: { word: "Ask why", name: "Ask why a digit does or doesn't go" },
  },
  withKey: (name, key) => `${name} (${key})`,
  pickCell: "Tap a cell, then a digit.",
  left: (label, left) => `${label}, ${left} left`,
};

// A puzzle the engine refused, or a view that cannot start (failure.js).
export const FAILURE = {
  title: "This puzzle can't be opened",
  open: "Open another puzzle…",
  back: "Back to the sample",
};

// The difficulty strips (strip.js).
export const STRIP = {
  rounds: (n, label) => `${plural(n, "round")}, ${label}`,
  round: (i, burden, search) => `Round ${i + 1}, effort ${burden}, search ${search}`,
  beyond: "Beyond the rating",
  level: (limited, final, level, ceiling) => (limited ? `above ${ceiling}` : final ? `level ${level}` : `${level} so far`),
  you: "your path",
};

export const BOARD = { label: "Sudoku board" };

// The step card and its cases (step.js).
export const STEP = {
  effort: "effort",
  search: "search",
  idea: (idea, shape) => (shape ? `${idea} · ${shape}` : idea),
  twins: "The same chain also gives ",
  and: " and ",
  rawOn: "Back to the arrows",
  rawOff: "Read it case by case",
  details: "Details",
  sum: (sum, reading) => `Effort = work + span + focus − 2: ${sum}. ${reading}`,
  caseLabel: (i, many) => (many ? `Case ${i + 1}` : "Suppose"),
  fails: "fails",
  reaches: "reaches the result",
  walk: "Walk through",
  supposed: fact => `Suppose ${factPhrase(fact)}. The board shows what is left in this case.`,
  impossible: witness => `${witnessPhrase(witness)} So this case is impossible.`,
  reached: head => `This case reaches the result: ${head}.`,
  previous: "Previous step",
  next: "Next step",
  back: "‹ Back",
  forward: "Next ›",
  count: (at, total) => `step ${at} of ${total}`,
  done: "Done",
  frameEnd: "This case reaches the result.",
  frameStart: "The assumption.",
  frame: (label, fact, frame) => `${label}. Case ${factPhrase(fact)}: ${frame}`,
  goneByArrows: "ruled out along the arrows",
  stepsNow: "steps now",
};

// Analyse (views/analyse.js).
export const ANALYSE = {
  shortcuts: { rounds: "rounds", steps: "steps", close: "close a case, then the step" },
  unique: { true: "One solution.", false: "Several solutions.", null: "No solution." },
  board: (beyond, round) => `Sudoku board, ${beyond ? "the round beyond the rating" : round !== null ? `round ${round + 1}` : "final state"}`,
  heat: "Heat",
  heatGroup: "Heat map",
  unit: "level",
  theStep: "the step",
  analysing: "Analysing…",
  soFar: n => (n ? `${plural(n, "round")} so far.` : "Reading the puzzle."),
  level: level => `Level ${level}`,
  effort: "effort",
  search: "search",
  solved: (n, unique) => `Solved in ${plural(n, "round")}. ${unique}`,
  limited: (n, ceiling, unique) => `${n ? `After ${plural(n, "round")}, the` : "The"} next round costs more than ${ceiling}, ` +
    `beyond what the rating resolves. ${unique}`,
  noSolution: "No solution",
  noSolutionLine: "The puzzle has no solution, so nothing can be concluded.",
  stalled: (n, level) => (n ? `Stalled after level ${level}` : "Stalled at the start"),
  stalledLine: (n, unique) => `${n ? `After ${plural(n, "round")}, no` : "No"} step of any size in the engine's proof language ` +
    `concludes anything, so it stops instead of guessing. ${unique}`,
  compare: "Compare",
  previous: "Previous round",
  next: "Next round",
  stillAnalysing: "Still being analysed…",
  solvedEnd: "The puzzle is solved.",
  stops: ceiling => `The next round costs more than ${ceiling}, so the rating stops here and does not work out its steps.`,
  solvedPast: "The puzzle is solved, past the rating's ceiling.",
  again: ceiling => `The next round costs more than ${ceiling} again.`,
  goesOn: "The path goes on past the ceiling.",
  theEnd: "The end",
  round: i => `Round ${i + 1}`,
  roundOf: (i, total, more) => `Round ${i + 1} of ${total}${more ? "…" : ""}`,
  beyondOf: (k, total, more) => `Beyond the rating, ${k} of ${total}${more ? "…" : ""}`,
  hardest: " The puzzle's hardest.",
  requested: ceiling => ` Worked out on request, outside the rating: the level stays above ${ceiling}.`,
  past: " Past the ceiling, so outside the rating too.",
  steps: (n, args) => (n > 1 ? `${plural(n, "step")}${args < n ? ` from ${plural(args, "argument")}` : ""}, applied together.` : "One step."),
  tabs: "Steps by kind",
  searching: atLeast => (atLeast ? `Searching: no round costs less than ${atLeast}. ` : "Searching. "),
  stop: "Stop",
  continuing: "Continuing the path…",
  canStill: "The engine can still work it out, outside the rating. A hard round can take minutes.",
  workOut: "Work out the next round anyway",
  seconds: s => `${s} s`,
};

// A screen's regions, named for assistive technology.
export const REGIONS = {
  board: "Board", puzzles: "Puzzles", digits: "Digits", difficulty: "Difficulty", round: "Round", level: "Level",
  levelPuzzles: "Its puzzles, easiest to spot first",
};

// Compare (views/compare.js).
export const COMPARE = {
  title: "Compare",
  shortcuts: { puzzles: "puzzles", analyse: "analyse", remove: "remove", stop: "stop rating" },
  sorts: { added: "#", level: "Level", search: "Search", givens: "Givens" },
  none: "No puzzle",
  focus: "The puzzle in focus",
  caption: (rating, twinOf) => ` · ${rating}${twinOf ? ` · twin of #${twinOf}` : ""}`,
  beingRated: "Being rated…",
  empty: "Paste puzzles, one per line, to rate and compare them.",
  skipped: n => (n ? ` ${plural(n, "line")} held no puzzle.` : ""),
  rating: (rated, n, skipped) => `Rating: ${rated} of ${plural(n, "puzzle")} done.${skipped} `,
  stop: "Stop",
  count: (n, rated, skipped) => `${plural(n, "puzzle")}${rated < n ? `, ${rated} rated` : ""}.${skipped} `,
  rateLeft: left => `Rate the ${left} left`,
  paste: "Puzzles, one per line",
  pasteLabel: "Puzzles to add, one per line",
  addAbout: "Add the pasted puzzles (Ctrl+Enter)",
  add: "Add",
  twinAbout: "Add the puzzle in focus under a random symmetry: the same puzzle to the rating",
  twin: "Add a twin",
  analyse: "Analyse",
  remove: "Remove",
  clear: "Clear",
  row: (i, rating, twin) => `Puzzle ${i + 1}: ${rating ?? "being rated"}${twin ? ", a twin" : ""}. Enter analyses it`,
};

// Puzzles (views/puzzles.js).
export const PUZZLES = {
  shortcuts: { levels: "levels", puzzles: "puzzles", solve: "solve", make: "make", stop: "stop" },
  continueLabel: "Continue",
  level: level => `Level ${level}`,
  levelGroup: "Level",
  levelButton: (name, n, solved) => `${name}: ${plural(n, "puzzle")}${solved ? ", one solved or more" : ""}`,
  being: "The puzzle being made",
  beingMade: level => `A level ${level} puzzle, being made`,
  climbing: (level, givens) => ` · level ${level} so far, ${plural(givens, "given")}`,
  none: "No puzzle",
  preview: play => `Puzzle preview, ${play.toLowerCase()}`,
  caption: (source, play) => ` · ${source} · ${play}`,
  beingRated: "Being rated…",
  notRated: "Not rated",
  rating: "Being rated",
  row: (rating, source, play) => `${rating}. ${source}. ${play}. Solve it`,
  analyse: "Analyse",
  keyStep: "Key step",
  keyStepAbout: "The idea of the puzzle's hardest steps",
  keyStepGroup: "Its key step",
  any: "Any",
  spotting: "Spotting",
  spottingGroup: "How easy its steps are to spot",
  cancel: "Cancel",
  stop: "Stop making it",
  play: (solved, played) => `${solved ? "Open" : played ? "Continue" : "Play"} this puzzle`,
  make: level => `Make a level ${level} puzzle`,
  ready: "One is ready at once.",
  lesson: idea => `The lesson on ${IDEAS[idea].name.toLowerCase()}`,
  makeNew: "Make a new one",
  tried: n => (n ? ` · ${plural(n, "puzzle")} tried` : ""),
  analyseIt: "Analyse it",
  another: "Make another",
  failed: "The puzzles can't be shown",
};

// Solve (views/solve.js).
export const SOLVE = {
  keys: { arrows: "Arrows", click: "Click" },
  shortcuts: {
    move: "move", more: "select more", place: "place", corner: "corner note, or remove", centre: "centre note",
    ask: "ask why", erase: "erase", hint: "hint", candidates: "candidates or notes", close: "close, then deselect", undo: "undo",
  },
  title: "Solve",
  level: level => `Level ${level}`,
  beyond: "Beyond the engine",
  time: "Time",
  showTime: "Show the time",
  hideTime: "Hide the time",
  left: n => `${plural(n, "cell")} to go.`,
  unknown: why => `Its level is not known: ${why}`,
  several: "This puzzle has several solutions: no step can finish it, and mistakes cannot be checked.",
  none: "This puzzle has no solution.",
  note: (mode, d) => `${mode === "corner" ? "Corner" : "Centre"} note ${d}`,
  askKey: (d, cell) => `Ask why ${d} does or doesn't go in ${cell}`,
  place: d => `Place ${d}`,
  giveBack: d => `Give back ${d}`,
  remove: d => `Remove ${d}`,
  undo: "Undo",
  redo: "Redo",
  erase: "Erase",
  candidates: "Candidates",
  strict: "Strict",
  strictAbout: "Say after each move whether it was one of the easiest steps",
  check: "Check",
  checkAbout: "Check the digits against the solution",
  mistakes: n => (n ? plural(n, "mistake") : "No mistakes"),
  checked: n => `Check: ${n ? plural(n, "mistake") : "no mistakes"}`,
  showMistake: "Show the mistake",
  probe: (d, cell) => `${d} in ${cell}?`,
  whyIs: (d, cell) => `Why is ${cell} a ${d}?`,
  whyNot: (d, cell) => `Why not ${d} in ${cell}?`,
  checking: "Checking the move…",
  wrong: "Wrong, by the solution.",
  easiest: idea => `${idea} · one of the easiest steps here`,
  notFound: "Not a step this app finds here. ",
  notEasiest: "There were easier steps here. ",
  askWhy: "Ask why",
  close: "Close",
  wrongDigit: "A digit on the board is wrong.",
  looking: "Looking for the easiest step…",
  lookingAsk: "Looking…",
  proves: stopped => (stopped ? "A step proves it. Stopped looking for a simpler one." : "A step proves it. Looking for a simpler one…"),
  notYet: stopped => (stopped ? "Stopped before a step was found." : "Looking for the simplest step that proves it…"),
  showStep: "Show the step",
  hideStep: "Hide the step",
  stopSearching: "Stop searching",
  oneCell: "A digit goes in one cell; notes go in several.",
  leavesOut: "This leaves out the wrong digit.",
  another: level => (level ? `Another level ${level} puzzle` : "Another puzzle"),
  path: (easiest, helped, moves, total) => `${easiest} of your ${plural(moves, "move")} were among the easiest steps`
    + `${helped ? `, ${helped} more with help` : ""}${total ? `; ${duration(total)} in all` : ""}.`,
  solved: "Solved",
  howHard: "See how hard it was",
  again: "Solve it again",
};


// Learn (views/learn.js).
export const LEARN = {
  title: "Learn",
  lessons: "Lessons",
  failed: "Learn can't start",
  missing: "The practice positions are missing.",
  overviewKeys: { lessons: "lessons", open: "open" },
  watchKeys: { examples: "examples", practise: "practise", close: "close a case" },
  practiceKeys: { arrows: "Arrows", move: "move", place: "place", remove: "remove", hint: "hint", next: "next" },
  effortBar: (effort, found, easy) => `Effort ${effort}: ${easy ? "easy" : `${plural(found, "step")} found without a hint`}`,
  exampleOf: idea => `An example of ${IDEAS[idea].name.toLowerCase()}`,
  anExample: idea => `${IDEAS[idea].name}, an example`,
  start: (idea, begun) => `${begun ? "Continue" : "Start"} with ${IDEAS[idea].name.toLowerCase()}`,
  play: level => `Play a level ${level} puzzle`,
  easyNow: (before, effort) => `Effort ${before} is easy for you now. On to effort ${effort}.`,
  everyPosition: (before, effort) => `That was every position at effort ${before}. On to effort ${effort}.`,
  example: "An example",
  position: "Practice position",
  effort: "effort",
  how: idea => `How ${IDEAS[idea].name.toLowerCase()} works`,
  watch: "Watch an example",
  backToPractice: "Back to practice",
  exampleCount: (i, n) => `Example ${i + 1} of ${n}`,
  previous: "Previous example",
  next: "Next example",
  key: (removing, d) => `${removing ? "Remove" : "Place"} ${d}`,
  findOne: "Find one yourself",
  nextPosition: "Next position",
  working: "Working out the example…",
  showEasier: "Show the easier step",
  inAnalyse: "This puzzle in Analyse",
  checking: "Checking…",
  looking: "Looking for the step that proves it…",
  floor: effort => ` No step below effort ${effort} proves it.`,
  stopLooking: "Stop looking",
  stopChecking: "Stop checking",
  showProof: "Show the step that proves it",
};

// The app bar, the puzzle dialog and the screens' titles (index.html, main.js).
export const APP = {
  name: "Sudoku Reasoner",
  home: "Sudoku Reasoner, home",
  modes: { label: "Mode", puzzles: "Puzzles", solve: "Solve", learn: "Learn", analyse: "Analyse" },
  keys: "Keyboard shortcuts",
  settings: "Settings",
  open: "Open a puzzle",
  openWide: "Open a puzzle…",
  openNarrow: "Open…",
  openAbout: "Paste or type the 81 cells, row by row, with 0 or . for an empty cell.",
  cancel: "Cancel",
  openButton: "Open",
  cells: n => `${n} of 81 cells`,
  pages: (at, total) => `Page ${at} of ${total}`,
  pagePrevious: "Previous page",
  pageNext: "Next page",
};

// What goes wrong on the way to the engine or the browser's store (engine.js,
// store.js). The engine's own refusals stay its words (D81).
export const ENGINE = {
  unreachable: "The engine is not reachable. Is the app still running?",
  refused: status => `The engine refused the request (${status}).`,
  brokeOff: "The engine's answer broke off.",
  stopped: why => `The engine stopped: ${why || "the worker failed"}.`,
  start: why => `The engine could not start: ${why}`,
  store: key => `The browser's store could not read ${key}.`,
};
