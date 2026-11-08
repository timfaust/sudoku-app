// The app's words in German (D81): every name text.js lists, as a constant or
// a function of what it says with German grammar (cases, plurals, word order),
// never English pieces. The player is addressed with "du"; actions on buttons
// are infinitives ("8 in H4 setzen"). Houses are Zeile, Spalte and Block; cell
// names stay A1.

import { ROWS, cellName } from "../geometry.js";
import { essential, headlineGroups, keyIdeas, survivor } from "../reading.js";

function joinNatural(items, word = "und") {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${word} ${items.at(-1)}`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const capital = s => s && `${s[0].toUpperCase()}${s.slice(1)}`;

// A length of time in words, to the minute.
export function duration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "unter einer Minute";
  if (minutes < 90) return plural(minutes, "Minute", "Minuten");
  const hours = Math.floor(minutes / 60);
  return `${plural(hours, "Stunde", "Stunden")} ${plural(minutes % 60, "Minute", "Minuten")}`;
}
const NUMBER = ["kein", "ein", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun"];
const count = n => NUMBER[n] ?? String(n);

export const factPhrase = fact => `${cellName(fact.cell)} ${fact.value ? "=" : "≠"} ${fact.digit}`;

// The four ideas (APP_CONCEPT.md), in reading.IDEA_ORDER.
export const IDEAS = {
  single: {
    name: "Nur eine Möglichkeit",
    hint: "Suche eine Zelle mit nur einem Kandidaten oder eine Ziffer mit nur einem Platz in einer Zeile, Spalte oder einem Block.",
    short: "Eine Zelle mit nur einem Kandidaten oder eine Ziffer mit nur einem Platz in einer Einheit.",
    about: "Jede Zelle enthält eine Ziffer, und jede Zeile, Spalte und jeder Block enthält jede Ziffer genau einmal. " +
      "Hat eine Zelle nur noch einen Kandidaten oder eine Ziffer in einer Zeile, Spalte oder einem Block nur noch " +
      "einen Platz, ist diese Möglichkeit die Lösung.",
    task: "Finde eine Ziffer mit nur einer Möglichkeit und setze sie.",
  },
  count: {
    name: "Abzählen",
    hint: "Suche Ziffern, die genau so viele Plätze füllen müssen, wie sie haben.",
    short: "So viele Ziffern wie Plätze: Die Ziffern füllen genau diese Plätze und stehen nirgends sonst.",
    about: "Können ein paar Zellen nur so viele Ziffern aufnehmen, wie es Zellen sind, müssen diese Ziffern sie " +
      "füllen und stehen nirgends sonst in der Einheit. Das geht auch andersherum, und für eine Ziffer über Zeilen " +
      "und Spalten hinweg: Zähle die Möglichkeiten und streiche, wofür sie keinen Platz lassen.",
    task: "Finde einen Abzähl-Schritt und streiche einen Kandidaten, den er ausschließt.",
  },
  cases: {
    name: "Egal, was du wählst",
    hint: "Suche eine Wahl, bei der jede Möglichkeit zum selben Ergebnis führt.",
    short: "Jede Möglichkeit einer Wahl führt zum selben Ergebnis, also gilt es.",
    about: "Nimm eine Zelle oder eine Einheit mit nur wenigen Möglichkeiten und verfolge jede davon. Führt jede " +
      "zum selben Ergebnis, gilt es, welche auch immer stimmt, ohne dass du weißt, welche.",
    task: "Finde ein Ergebnis, das gilt, egal was du wählst, und trage es ein.",
  },
  fail: {
    name: "Annehmen und scheitern",
    hint: "Suche einen Kandidaten, der schnell zu einem Widerspruch führen würde.",
    short: "Nimm an, ein Kandidat stimmt; scheitert das Rätsel daran, fällt er weg.",
    about: "Nimm an, ein Kandidat stimmt, und verfolge, was daraus folgt, immer eine einzige Möglichkeit nach der " +
      "anderen. Bleibt einer Zelle kein Kandidat mehr oder einer Ziffer kein Platz in einer Einheit, war die " +
      "Annahme falsch, und der Kandidat fällt weg.",
    task: "Finde einen Kandidaten, der zu einem Widerspruch führt, und streiche ihn.",
  },
};

// An idea's name inside a sentence.
const named = idea => `„${IDEAS[idea].name}“`;

// A technique name a learner may know (D46), as German solvers name it: the
// subsets in German (Einer, Paar, Dreier- and Vierergruppe), the intersections
// by their usual English names (Pointing, Claiming), X-Wing in English and the
// larger fish in German (Schwertfisch, Qualle).
export function shapeName(move) {
  if (move.kind === "single") return move.source.kind === "cell" ? "Nackter Einer" : "Versteckter Einer";
  if (move.kind !== "cover") return null;
  const k = move.bases.length;
  const base = move.bases[0].kind;
  const cover = move.covers[0].kind;
  const subset = [null, ["Nackter Einer", "Versteckter Einer"], ["Nacktes Paar", "Verstecktes Paar"],
    ["Nackte Dreiergruppe", "Versteckte Dreiergruppe"], ["Nackte Vierergruppe", "Versteckte Vierergruppe"]][k];
  if (base === "cell") return subset?.[0] ?? null;
  if (cover === "cell") return subset?.[1] ?? null;
  if (base === "box") return "Pointing";
  if (cover === "box") return "Claiming";
  return ["", "", "X-Wing", "Schwertfisch", "Qualle"][k] ?? null;
}

// The conclusions as what to do ("5 aus E3 und F3 streichen; 8 in H4 setzen").
export function headline(move) {
  return headlineGroups(move).map(({ value, digits, cells }) => {
    const what = joinNatural(digits.map(String));
    const where = joinNatural(cells.map(cellName));
    return value ? `${what} in ${where} setzen` : `${what} aus ${where} streichen`;
  }).join("; ");
}

// The name of the button that applies a step.
export function applyLabel(move) {
  const facts = essential(move.conclusions);
  const text = headline(move);
  if (facts.length === 1 || text.length <= 32) return text;
  return facts.every(f => !f.value) ? `Diese ${facts.length} Kandidaten streichen` : `Diese ${facts.length} Änderungen vornehmen`;
}

export function followUps(move) {
  const hidden = move.conclusions.length - essential(move.conclusions).length;
  if (!hidden) return "";
  return hidden === 1 ? "1 Streichung folgt aus dem Setzen." : `${hidden} Streichungen folgen aus dem Setzen.`;
}

// A house by name: "Zeile C", "Spalte 5", "Block 3"; a cell by its own.
function houseName(constraint) {
  switch (constraint.kind) {
    case "cell": return cellName(constraint.index);
    case "row": return `Zeile ${ROWS[constraint.index]}`;
    case "column": return `Spalte ${constraint.index + 1}`;
    default: return `Block ${constraint.index + 1}`;
  }
}

// Houses in the plural: nominative and dative.
const HOUSES = { row: ["Zeilen", "Zeilen"], column: ["Spalten", "Spalten"], box: ["Blöcke", "Blöcken"] };
const houseIndex = c => (c.kind === "row" ? ROWS[c.index] : String(c.index + 1));

// Several houses of one kind under one name, with the plural's article in the
// case asked ("den Zeilen C, E und F" in the dative), else each by name.
function housesName(constraints, article = "den") {
  const kind = constraints[0].kind;
  if (constraints.length < 2 || kind === "cell" || constraints.some(c => c.kind !== kind)) return joinNatural(constraints.map(houseName));
  return `${article} ${HOUSES[kind][article === "den" ? 1 : 0]} ${joinNatural(constraints.map(houseIndex))}`;
}

const constraintLabel = c => (c.kind === "cell" ? cellName(c.index) : `${c.digit} in ${houseName(c)}`);

// "5 in den Spalten 1 und 2", "1, 7 und 9 in Zeile C", "C4 und C5".
function constraintsLabel(list) {
  if (list[0].kind !== "cell" && list.every(c => c.digit === list[0].digit)) return `${list[0].digit} in ${housesName(list)}`;
  if (list[0].kind !== "cell" && list.every(c => c.kind === list[0].kind && c.index === list[0].index)) {
    return `${joinNatural(list.map(c => String(c.digit)))} in ${houseName(list[0])}`;
  }
  return joinNatural(list.map(constraintLabel));
}

const options = (source, facts) => joinNatural(
  facts.map(f => (source.kind === "cell" ? String(f.digit) : cellName(f.cell))), "oder");

// A refutation's chain fits in one sentence up to this many forced steps.
const SPELLED = 5;

// What a failing case leads to: "A1 = 7, C1 = 4 und A2 hat keinen Kandidaten mehr".
const failure = branch => joinNatural([...branch.steps.map(s => factPhrase(s.fact)), witnessClause(branch.witness)]);

export function question(source) {
  return source.kind === "cell"
    ? `Was kann in ${cellName(source.index)} stehen?`
    : `Wo kann die ${source.digit} in ${houseName(source)} stehen?`;
}

export function explanation(move) {
  if (move.kind === "single") {
    const fact = move.conclusions[0];
    return move.source.kind === "cell"
      ? { claim: `Nur die ${fact.digit} kann in ${cellName(fact.cell)} stehen.`, reason: "Jede andere Ziffer ist dort schon ausgeschlossen." }
      : { claim: `${cellName(fact.cell)} ist der einzige Platz für die ${fact.digit} in ${houseName(move.source)}.`,
          reason: "Jede andere Zelle dieser Einheit ist für sie ausgeschlossen." };
  }
  if (move.kind === "cover") return coverExplanation(move);
  if (move.kind === "map") {
    return {
      claim: `${question(move.source)} ${options(move.source, move.choices)}.`,
      reason: "Folge jeder Möglichkeit entlang der Pfeile: Jede erreicht das Ergebnis, also gilt es, welche auch immer stimmt.",
    };
  }
  if (move.source === null) {
    const { assumption: z, steps } = move.branches[0];
    const so = `Also kann ${cellName(z.cell)} nicht ${z.digit} sein.`;
    return {
      claim: `Angenommen, ${factPhrase(z)}.`,
      reason: steps.length <= SPELLED
        ? `Dann: ${failure(move.branches[0])}. ${so}`
        : `Das erzwingt ${count(steps.length)} Schritte und endet in einem Widerspruch. ${so}`,
    };
  }
  const left = survivor(move);
  const failing = move.branches.filter(b => b.contradiction);
  if (left && failing.length <= 2 && failing.every(b => b.steps.length <= SPELLED)) {
    const ifs = failing.map(b => `Bei ${factPhrase(b.assumption)}: ${failure(b)}.`);
    return {
      claim: `${question(move.source)} ${options(move.source, move.branches.map(b => b.assumption))}.`,
      reason: `${ifs.join(" ")} Also gilt ${factPhrase(left.assumption)}.`,
    };
  }
  return {
    claim: `${question(move.source)} ${options(move.source, move.branches.map(b => b.assumption))}.`,
    reason: "Probiere jede Möglichkeit: Jede, die nicht scheitert, führt zum Ergebnis, also gilt es, welche auch immer stimmt.",
  };
}

function coverExplanation(move) {
  const k = move.bases.length;
  const baseList = constraintsLabel(move.bases);
  const coverList = constraintsLabel(move.covers);
  const countLine = k === 1
    ? `Abzählen: Die Basis (${baseList}) enthält genau einen wahren Kandidaten, und alle ihre Kandidaten liegen in ` +
      `der Abdeckung (${coverList}), die nur einen enthält. Also sind die übrigen Kandidaten der Abdeckung falsch.`
    : `Abzählen: Die ${count(k)} Basen (${baseList}) enthalten je genau einen wahren Kandidaten, und alle ihre ` +
      `Kandidaten liegen in ${count(k)} Abdeckungen (${coverList}), die je einen enthalten. Also füllen die Basen ` +
      "die Abdeckungen, und deren übrige Kandidaten sind falsch.";
  if (move.bases[0].kind === "cell" || move.covers[0].kind === "cell") {
    const hidden = move.covers[0].kind === "cell";
    const cells = (hidden ? move.covers : move.bases).map(c => cellName(c.index));
    const houses = hidden ? move.bases : move.covers;
    const digits = [...new Set(houses.map(h => h.digit))].sort((a, b) => a - b);
    const house = houseName(houses[0]);
    const what = digits.length === 1 ? `kann die ${digits[0]}` : `können ${joinNatural(digits.map(String))}`;
    return hidden
      ? { claim: `In ${house} ${what} nur in ${joinNatural(cells)} stehen.`,
          reason: "Diese Zellen müssen diese Ziffern enthalten, also fallen ihre anderen Kandidaten weg.", count: countLine }
      : { claim: `${joinNatural(cells)} ${cells.length === 1 ? "kann" : "können"} nur ${joinNatural(digits.map(String))} enthalten.`,
          reason: `Diese Ziffern müssen diese Zellen füllen, also können sie nirgends sonst in ${house} stehen.`, count: countLine };
  }
  const digit = move.bases[0].digit;
  const bases = housesName(move.bases);
  const covers = housesName(move.covers);
  return {
    claim: `In ${bases} kann die ${digit} nur in ${covers} stehen.`,
    reason: k === 1
      ? `Also ist die ${digit} in ${covers} die aus ${bases}, und die ${digit} steht dort nirgends sonst.`
      : `Also bekommen ${housesName(move.covers, "die")} ihre ${digit} aus ${bases}, und die ${digit} steht dort nirgends sonst.`,
    count: countLine,
  };
}

export function stepPhrase(step) {
  return step.source.kind === "cell"
    ? `${factPhrase(step.fact)}: der letzte Kandidat in ${cellName(step.source.index)}.`
    : `${factPhrase(step.fact)}: der letzte Platz für die ${step.source.digit} in ${houseName(step.source)}.`;
}

const witnessClause = witness => (witness.kind === "cell"
  ? `${cellName(witness.index)} hat keinen Kandidaten mehr`
  : `die ${witness.digit} hat keinen Platz mehr in ${houseName(witness)}`);

export const witnessPhrase = witness => `${capital(witnessClause(witness))}.`;

// Effort in words: what following the step makes you hold, follow and watch.
export function effortWords(effort) {
  const watch = effort.focus === 1 ? "eine Einheit oder Ziffer" : `${count(effort.focus)} Einheiten oder Ziffern`;
  return `Du behältst ${plural(effort.work, "Tatsache", "Tatsachen")} im Kopf, folgst einer Kette von ` +
    `${plural(effort.span, "Schritt", "Schritten")} und achtest auf ${watch}.`;
}

export function effortSum(effort) {
  return `${effort.work} + ${effort.span} + ${effort.focus} − 2 = ${effort.burden}`;
}

export const SEARCH = "Die Blicke, die es im Schnitt braucht, um einen ersten Schritt zu finden, wenn du Stellen " +
  "in beliebiger Reihenfolge liest. Eine Stelle ist eine Zelle oder eine Ziffer in einer Zeile, Spalte oder einem Block.";

export const STEP_SEARCH = "Die Blicke, die es im Schnitt braucht, um nur diesen Schritt zu finden, wenn du Stellen " +
  "in beliebiger Reihenfolge liest.";

export function hiddenLine(move) {
  const from = move.starts === 1 ? "nur einer Stelle" : `${count(move.starts)} Stellen`;
  return `Du findest ihn von ${from} aus: etwa ${plural(Math.round(move.looks), "Blick", "Blicke")}, wenn du Stellen in beliebiger Reihenfolge liest.`;
}

export function startsPhrase(round) {
  return `${round.moves.length === 1 ? "Er beginnt" : "Sie beginnen"} an ${round.starts} von ` +
    `${plural(round.places, "möglichen Stelle", "möglichen Stellen")}.`;
}

// The hint ladder (D44): 1 the idea, 2 where, 3 what, 4 the step.
const REGION = {
  digit: r => `die Ziffer ${r.digit}`,
  band: r => `die ${r.digit} in den ${["oberen", "mittleren", "unteren"][r.index]} drei Zeilen`,
  stack: r => `die ${r.digit} in den ${["linken", "mittleren", "rechten"][r.index]} drei Spalten`,
};

export function regionName(region) {
  return (REGION[region.kind] ?? houseName)(region);
}

export const NEXT_RUNG = ["Tipp", "Wo suchen", "Was suchen", "Schritt zeigen"];

export function hintLine(move, rung) {
  if (rung <= 1) return IDEAS[move.idea].hint;
  if (rung === 2) {
    const where = move.kind === "single" ? houseName(move.source) : move.focus[0].map(regionName).join(" und ");
    return `Schau auf ${where}.`;
  }
  if (rung === 3) return move.kind === "single" ? question(move.source) : "Die markierten Kandidaten enthalten den Schritt. Was lassen sie zu?";
  return "";
}

export function attemptLine(fact, status, effort) {
  const cell = cellName(fact.cell);
  return {
    false: fact.value
      ? `Falsch: Laut Lösung ist ${cell} nicht ${fact.digit}.`
      : `Falsch: Laut Lösung ist ${cell} ${fact.digit}, die ${fact.digit} bleibt also.`,
    decided: "Das zeigt das Spielfeld schon.",
    unprovable: `${factPhrase(fact)} stimmt, aber hier beweist es noch nichts: Es einzutragen wäre geraten.`,
    harder: `${factPhrase(fact)} stimmt, aber kein Schritt mit Aufwand ${effort} beweist es hier. Ein leichterer Schritt wartet.`,
    limited: `${factPhrase(fact)} stimmt, aber dafür braucht es einen schwereren Schritt, als diese App sucht.`,
  }[status];
}

export function resultLine(result, idea, effort) {
  if (result.how === "shown") return null;
  const helped = result.hinted ? "mit Tipp" : "ohne Tipp";
  const easier = `Hier gab es einen leichteren mit Aufwand ${effort}.`;
  if (result.revealed) return `Stimmt: Ein Schritt mit Aufwand ${result.move.effort.burden} beweist es. ${easier}`;
  if (result.move.effort.burden > effort) {
    return `Stimmt, und du hast es ${helped} gefunden, durch einen Schritt mit Aufwand ${result.move.effort.burden}. ${easier}`;
  }
  if (result.move.idea !== idea) return `Gefunden, ${helped}: ein Schritt, so leicht wie jeder hier, wenn auch durch ${named(result.move.idea)}.`;
  return `Gefunden, ${helped}.`;
}

export const SPOT_ABOUT = "Wie versteckt seine Schritte sind: wie lange es im Schnitt dauert, sie zu finden.";

export const HEAT = { off: "Aus", levels: "Schritt für Schritt" };
export const HEAT_ABOUT = "Die Stufe jedes Kandidaten von hier aus: der schwerste Schritt auf dem Weg, bis er gesetzt oder gestrichen ist.";
export const heatTitle = (cell, digit, value) => `${digit} in ${cellName(cell)}: Stufe ${value} von hier aus`;
export const HEAT_REST = "ungefärbt: von den bewerteten Runden nicht entschieden";

export const SETTINGS = {
  simple: {
    name: "Einfacher Modus",
    choices: { off: "Aus", on: "An" },
    about: "Blendet Analyse und Vergleichen aus. Tipps, Prüfen, Warum und Lernen bleiben.",
  },
  language: { name: "Sprache" },
  version: "Version",
};

export function levelAbout(ceiling) {
  return `Schwerer als Stufe ${ceiling} oder zu schwer für die App: bewertet, nie erstellt.`;
}

export const SEARCHES = { any: "Beliebig", less: "Leichter", more: "Schwerer" };
const SPOT = { less: "leichter", more: "schwerer" };

export function waitLine(level, search = "any") {
  const [seconds, minute, two] = search === "any" ? [5, 8, 8] : [0, 4, 6];
  if (level <= seconds) return "Meist in Sekunden fertig.";
  if (level <= minute) return "Meist innerhalb einer Minute fertig.";
  if (level <= two) return "Meist in ein, zwei Minuten fertig.";
  return "Kann mehrere Minuten dauern.";
}

export function climbLine(at, level, search, from, idea = "any") {
  if (!at) return "Es geht los.";
  if (at.level < level) return `Bisher Stufe ${at.level}.`;
  if (idea !== "any" && !keyIdeas(at).includes(idea)) {
    return `Stufe ${level} erreicht; gesucht wird eines, bei dem ${named(idea)} der Schlüsselschritt ist.`;
  }
  if (search === "any" || at.search === from) return `Stufe ${level} erreicht.`;
  return `Stufe ${level} erreicht; seine Schritte werden ${SPOT[search]} zu finden.`;
}

export function madeLine(made) {
  if (made.spare) return "Früher erstellt, auf dem Weg zu einem anderen Rätsel.";
  const took = `In ${elapsed(made.ms)} erstellt${made.idea && made.idea !== "any" ? `, mit ${named(made.idea)} als Schlüsselschritt` : ""}`;
  if (made.search === "any") return `${took}.`;
  if (made.from === made.rating.search) return `${took}; keines in seiner Nähe war ${SPOT[made.search]} zu finden.`;
  return `${took}; seine Schritte wurden ${SPOT[made.search]} zu finden.`;
}

export function aboveCeiling(ceiling, form) {
  return { title: `Stufe über ${ceiling}`, name: `Über Stufe ${ceiling}`, short: `Über ${ceiling}`, figure: `>${ceiling}` }[form];
}

export function ratingLine(rating, ceiling) {
  const level = rating.solved ? `Stufe ${rating.level}` : rating.limited ? aboveCeiling(ceiling, "name") : "Zu schwer für die App";
  return `${level}, ${plural(rating.givens, "Vorgabe", "Vorgaben")}`;
}

export const NO_STEP = "Kein Schritt beliebiger Größe in der Beweissprache der Engine folgert hier etwas.";
export function stopLine(limited) {
  return limited ? "Der nächste Schritt kostet mehr, als diese App sucht." : "Kein Schritt beliebiger Größe folgert hier etwas.";
}

export function askLine(status, fact, by = []) {
  if (status === "decided" && by.length) {
    const own = by.find(b => b.cell === fact.cell);
    const peers = by.filter(b => b.cell !== fact.cell).map(b => cellName(b.cell));
    return [own ? `In ${cellName(fact.cell)} steht schon die ${own.digit}.` : null,
      peers.length ? `Die ${fact.digit} steht schon in ${joinNatural(peers)}.` : null].filter(Boolean).join(" ");
  }
  return {
    false: "Falsch, laut Lösung.",
    decided: fact.value ? "Das zeigt das Spielfeld schon." : "Das ist hier schon ausgeschlossen.",
    unprovable: "Hier beweist das noch nichts. Andere Zellen kommen zuerst.",
    limited: "Dafür braucht es einen schwereren Schritt, als diese App sucht.",
  }[status];
}

export function playLine(entry) {
  if (entry.solved) return "Gelöst";
  if (entry.played) return `noch ${plural(entry.left, "Zelle", "Zellen")}`;
  return "Neu";
}

const MONTHS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

// When, in a word or a date: "heute", "gestern", "am 30. Okt.".
export function day(time, now = Date.now()) {
  const date = new Date(time);
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(time).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return "heute";
  if (days === 1) return "gestern";
  return `am ${date.getDate()}. ${MONTHS[date.getMonth()]}`;
}

export function sourceLine(entry, now = Date.now()) {
  if (entry.source === "starter") return "Kam mit der App";
  return `${day(entry.added, now)} ${entry.source === "made" ? "erstellt" : "geöffnet"}`.replace(/^./, c => c.toUpperCase());
}

export function elapsed(ms) {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export const EFFORT_READING = {
  single: "Ein Einer folgt direkt aus einer Tatsache: Arbeit, Spanne und Fokus sind je 1.",
  cover: "Ein Abzähl-Schritt hält eine Wahrheit pro Basis (Arbeit), füllt seine Abdeckungen und schließt deren " +
    "übrige Kandidaten aus (Spanne 2), innerhalb einer Einheit oder einer Ziffer (Fokus 1).",
  map: "Arbeit zählt die gesetzten Kandidaten der Pfeilkarte, Spanne ihren längsten Pfeilweg, Fokus die Einheiten " +
    "oder Ziffern, die sie braucht.",
  case: "Arbeit zählt die Möglichkeiten und die Setzungen, die jeder Fall braucht, Spanne die längste Kette, Fokus " +
    "die beteiligten Einheiten oder Ziffern.",
};

export const LEGEND = [
  ["place", "setzen"], ["remove", "streichen"], ["assume", "angenommen"], ["hypothetical", "folgt in diesem Fall"],
  ["next", "als Nächstes erzwungen"], ["option", "Möglichkeiten"], ["chain", "erzwungen"],
  ["house", "hier suchen"], ["force", "erzwingt den Schritt"], ["base", "Basen"], ["cover", "Abdeckungen"],
  ["gone", "in diesem Fall ausgeschlossen"], ["fail", "Widerspruch"], ["refuted", "also scheitert die Annahme"],
  ["arrow", "erzwungene Verbindungen"], ["later", "andere Schritte jetzt"],
  ["mistake", "Fehler"], ["clash", "doppelt"], ["by", "schließt sie aus"],
];

// ---------- the screens' words ----------

export const PAD = {
  label: "Was eine Ziffer bewirkt",
  modes: {
    place: { word: "Setzen", name: "Eine Ziffer setzen" },
    corner: { word: "Ecke", name: "Eine Ziffer als Notiz in die Ecke schreiben" },
    centre: { word: "Mitte", name: "Eine Ziffer als Notiz in die Mitte schreiben" },
    remove: { word: "Streichen", name: "Einen Kandidaten streichen" },
    ask: { word: "Warum", name: "Fragen, warum eine Ziffer passt oder nicht" },
  },
  withKey: (name, key) => `${name} (${key})`,
  pickCell: "Tippe auf eine Zelle, dann auf eine Ziffer.",
  left: (label, left) => `${label}, noch ${left}`,
};

export const FAILURE = {
  title: "Dieses Rätsel lässt sich nicht öffnen",
  open: "Ein anderes Rätsel öffnen…",
  back: "Zurück zum Beispiel",
};

export const STRIP = {
  rounds: (n, label) => `${plural(n, "Runde", "Runden")}, ${label}`,
  round: (i, burden, search) => `Runde ${i + 1}, Aufwand ${burden}, Suche ${search}`,
  beyond: "Jenseits der Bewertung",
  level: (limited, final, level, ceiling) => (limited ? `über ${ceiling}` : final ? `Stufe ${level}` : `bisher ${level}`),
  you: "dein Weg",
};

export const BOARD = { label: "Sudoku-Spielfeld" };

export const STEP = {
  effort: "Aufwand",
  search: "Suche",
  idea: (idea, shape) => (shape ? `${idea} · ${shape}` : idea),
  twins: "Dieselbe Kette führt auch zu: ",
  and: " und ",
  rawOn: "Zurück zu den Pfeilen",
  rawOff: "Fall für Fall lesen",
  details: "Details",
  sum: (sum, reading) => `Aufwand = Arbeit + Spanne + Fokus − 2: ${sum}. ${reading}`,
  caseLabel: (i, many) => (many ? `Fall ${i + 1}` : "Angenommen"),
  fails: "scheitert",
  reaches: "erreicht das Ergebnis",
  walk: "Durchgehen",
  supposed: fact => `Angenommen, ${factPhrase(fact)}. Das Spielfeld zeigt, was in diesem Fall übrig bleibt.`,
  impossible: witness => `${witnessPhrase(witness)} Dieser Fall ist also unmöglich.`,
  reached: head => `Dieser Fall erreicht das Ergebnis: ${head}.`,
  previous: "Vorheriger Schritt",
  next: "Nächster Schritt",
  back: "‹ Zurück",
  forward: "Weiter ›",
  count: (at, total) => `Schritt ${at} von ${total}`,
  done: "Fertig",
  frameEnd: "Dieser Fall erreicht das Ergebnis.",
  frameStart: "Die Annahme.",
  frame: (label, fact, frame) => `${label}. Fall ${factPhrase(fact)}: ${frame}`,
  goneByArrows: "entlang der Pfeile ausgeschlossen",
  stepsNow: "Schritte jetzt",
};

const rounds = n => plural(n, "Runde", "Runden");

export const ANALYSE = {
  shortcuts: { rounds: "Runden", steps: "Schritte", close: "Fall schließen, dann den Schritt" },
  unique: { true: "Eine Lösung.", false: "Mehrere Lösungen.", null: "Keine Lösung." },
  board: (beyond, round) => `Sudoku-Spielfeld, ${beyond ? "die Runde jenseits der Bewertung" : round !== null ? `Runde ${round + 1}` : "Endstand"}`,
  heat: "Heatmap",
  heatGroup: "Heatmap",
  unit: "Stufe",
  theStep: "der Schritt",
  analysing: "Wird analysiert…",
  soFar: n => (n ? `Bisher ${rounds(n)}.` : "Das Rätsel wird gelesen."),
  level: level => `Stufe ${level}`,
  effort: "Aufwand",
  search: "Suche",
  solved: (n, unique) => `Gelöst in ${rounds(n)}. ${unique}`,
  limited: (n, ceiling, unique) => `${n ? `Nach ${rounds(n)} kostet die nächste Runde` : "Die nächste Runde kostet"} mehr als ` +
    `${ceiling} und liegt damit jenseits dessen, was die Bewertung auflöst. ${unique}`,
  noSolution: "Keine Lösung",
  noSolutionLine: "Das Rätsel hat keine Lösung, also lässt sich nichts folgern.",
  stalled: (n, level) => (n ? `Steckengeblieben nach Stufe ${level}` : "Steckengeblieben am Anfang"),
  stalledLine: (n, unique) => `${n
    ? `Nach ${rounds(n)} folgert kein Schritt beliebiger Größe in der Beweissprache der Engine noch etwas`
    : "Kein Schritt beliebiger Größe in der Beweissprache der Engine folgert etwas"}, also hält sie an, statt zu raten. ${unique}`,
  compare: "Vergleichen",
  previous: "Vorherige Runde",
  next: "Nächste Runde",
  stillAnalysing: "Wird noch analysiert…",
  solvedEnd: "Das Rätsel ist gelöst.",
  stops: ceiling => `Die nächste Runde kostet mehr als ${ceiling}, also endet die Bewertung hier und arbeitet ihre Schritte nicht aus.`,
  solvedPast: "Das Rätsel ist gelöst, jenseits der Obergrenze der Bewertung.",
  again: ceiling => `Die nächste Runde kostet wieder mehr als ${ceiling}.`,
  goesOn: "Der Weg geht über die Obergrenze hinaus weiter.",
  theEnd: "Das Ende",
  round: i => `Runde ${i + 1}`,
  roundOf: (i, total, more) => `Runde ${i + 1} von ${total}${more ? "…" : ""}`,
  beyondOf: (k, total, more) => `Jenseits der Bewertung, ${k} von ${total}${more ? "…" : ""}`,
  hardest: " Die schwerste des Rätsels.",
  requested: ceiling => ` Auf Wunsch ausgearbeitet, außerhalb der Bewertung: Die Stufe bleibt über ${ceiling}.`,
  past: " Jenseits der Obergrenze, also auch außerhalb der Bewertung.",
  steps: (n, args) => (n > 1
    ? `${plural(n, "Schritt", "Schritte")}${args < n ? ` aus ${plural(args, "Argument", "Argumenten")}` : ""}, gemeinsam angewandt.`
    : "Ein Schritt."),
  tabs: "Schritte nach Art",
  searching: atLeast => (atLeast ? `Suche: Keine Runde kostet weniger als ${atLeast}. ` : "Suche. "),
  stop: "Stopp",
  continuing: "Der Weg wird fortgesetzt…",
  canStill: "Die Engine kann sie trotzdem ausarbeiten, außerhalb der Bewertung. Eine schwere Runde kann Minuten dauern.",
  workOut: "Nächste Runde trotzdem ausarbeiten",
  seconds: s => `${s} s`,
};

export const REGIONS = {
  board: "Spielfeld", puzzles: "Rätsel", digits: "Ziffern", difficulty: "Schwierigkeit", round: "Runde", level: "Stufe",
  levelPuzzles: "Die Rätsel dieser Stufe, die mit den am leichtesten zu findenden Schritten zuerst",
};

const puzzles = n => plural(n, "Rätsel", "Rätsel");

export const COMPARE = {
  title: "Vergleichen",
  shortcuts: { puzzles: "Rätsel", analyse: "analysieren", remove: "entfernen", stop: "Bewertung stoppen" },
  sorts: { added: "#", level: "Stufe", search: "Suche", givens: "Vorgaben" },
  none: "Kein Rätsel",
  focus: "Das Rätsel im Fokus",
  caption: (rating, twinOf) => ` · ${rating}${twinOf ? ` · Zwilling von #${twinOf}` : ""}`,
  beingRated: "Wird bewertet…",
  empty: "Füge Rätsel ein, eines pro Zeile, um sie zu bewerten und zu vergleichen.",
  skipped: n => (n ? ` ${n === 1 ? "1 Zeile enthielt" : `${n} Zeilen enthielten`} kein Rätsel.` : ""),
  rating: (rated, n, skipped) => `Bewertung: ${rated} von ${puzzles(n)} fertig.${skipped} `,
  stop: "Stopp",
  count: (n, rated, skipped) => `${puzzles(n)}${rated < n ? `, ${rated} bewertet` : ""}.${skipped} `,
  rateLeft: left => `Die übrigen ${left} bewerten`,
  paste: "Rätsel, eines pro Zeile",
  pasteLabel: "Hinzuzufügende Rätsel, eines pro Zeile",
  addAbout: "Die eingefügten Rätsel hinzufügen (Strg+Enter)",
  add: "Hinzufügen",
  twinAbout: "Das Rätsel im Fokus unter einer zufälligen Symmetrie hinzufügen: für die Bewertung dasselbe Rätsel",
  twin: "Zwilling hinzufügen",
  analyse: "Analysieren",
  remove: "Entfernen",
  clear: "Leeren",
  row: (i, rating, twin) => `Rätsel ${i + 1}: ${rating ?? "wird bewertet"}${twin ? ", ein Zwilling" : ""}. Enter analysiert es`,
};

export const PUZZLES = {
  shortcuts: { levels: "Stufen", puzzles: "Rätsel", solve: "lösen", make: "erstellen", stop: "stoppen" },
  continueLabel: "Weiter",
  level: level => `Stufe ${level}`,
  levelGroup: "Stufe",
  levelButton: (name, n, solved) => `${name}: ${puzzles(n)}${solved ? ", mindestens eines gelöst" : ""}`,
  being: "Das Rätsel, das gerade erstellt wird",
  beingMade: level => `Ein Rätsel der Stufe ${level}, wird erstellt`,
  climbing: (level, givens) => ` · bisher Stufe ${level}, ${plural(givens, "Vorgabe", "Vorgaben")}`,
  none: "Kein Rätsel",
  preview: play => `Rätselvorschau: ${play}`,
  caption: (source, play) => ` · ${source} · ${play}`,
  beingRated: "Wird bewertet…",
  notRated: "Nicht bewertet",
  rating: "Wird bewertet",
  row: (rating, source, play) => `${rating}. ${source}. ${play}. Lösen`,
  analyse: "Analysieren",
  keyStep: "Schlüsselschritt",
  keyStepAbout: "Die Idee der schwersten Schritte des Rätsels",
  keyStepGroup: "Sein Schlüsselschritt",
  any: "Beliebig",
  spotting: "Finden",
  spottingGroup: "Wie leicht seine Schritte zu finden sind",
  cancel: "Abbrechen",
  stop: "Erstellen stoppen",
  play: (solved, played) => `Dieses Rätsel ${solved ? "öffnen" : played ? "fortsetzen" : "spielen"}`,
  make: level => `Ein Rätsel der Stufe ${level} erstellen`,
  ready: "Eines ist sofort fertig.",
  lesson: idea => `Die Lektion ${named(idea)}`,
  makeNew: "Ein neues erstellen",
  tried: n => (n ? ` · ${puzzles(n)} probiert` : ""),
  analyseIt: "Analysieren",
  another: "Noch eines erstellen",
  failed: "Die Rätsel lassen sich nicht zeigen",
};

const mistakes = n => plural(n, "Fehler", "Fehler");

export const SOLVE = {
  keys: { arrows: "Pfeile", click: "Klick" },
  shortcuts: {
    move: "bewegen", more: "mehr auswählen", place: "setzen", corner: "Eckennotiz oder streichen", centre: "Mittennotiz",
    ask: "warum fragen", erase: "löschen", hint: "Tipp", candidates: "Kandidaten oder Notizen", close: "schließen, dann abwählen", undo: "rückgängig",
  },
  title: "Lösen",
  level: level => `Stufe ${level}`,
  beyond: "Zu schwer für die App",
  time: "Zeit",
  showTime: "Die Zeit zeigen",
  hideTime: "Die Zeit verbergen",
  left: n => `Noch ${plural(n, "Zelle", "Zellen")}.`,
  unknown: why => `Seine Stufe ist nicht bekannt: ${why}`,
  several: "Dieses Rätsel hat mehrere Lösungen: Kein Schritt kann es beenden, und Fehler lassen sich nicht prüfen.",
  none: "Dieses Rätsel hat keine Lösung.",
  note: (mode, d) => `${mode === "corner" ? "Eckennotiz" : "Mittennotiz"} ${d}`,
  askKey: (d, cell) => `Fragen, warum ${d} in ${cell} passt oder nicht`,
  place: d => `${d} setzen`,
  giveBack: d => `${d} zurückgeben`,
  remove: d => `${d} streichen`,
  undo: "Rückgängig",
  redo: "Wiederholen",
  erase: "Löschen",
  candidates: "Kandidaten",
  strict: "Streng",
  strictAbout: "Nach jedem Zug sagen, ob er einer der leichtesten Schritte war",
  check: "Prüfen",
  checkAbout: "Die Ziffern mit der Lösung abgleichen",
  mistakes: n => (n ? mistakes(n) : "Keine Fehler"),
  checked: n => `Prüfen: ${n ? mistakes(n) : "keine Fehler"}`,
  showMistake: "Den Fehler zeigen",
  probe: (d, cell) => `${d} in ${cell}?`,
  whyIs: (d, cell) => `Warum ist ${cell} eine ${d}?`,
  whyNot: (d, cell) => `Warum nicht ${d} in ${cell}?`,
  checking: "Der Zug wird geprüft…",
  wrong: "Falsch, laut Lösung.",
  easiest: idea => `${idea} · einer der leichtesten Schritte hier`,
  notFound: "Kein Schritt, den diese App hier findet. ",
  notEasiest: "Es gab hier leichtere Schritte. ",
  askWhy: "Warum?",
  close: "Schließen",
  wrongDigit: "Eine Ziffer auf dem Spielfeld ist falsch.",
  looking: "Der leichteste Schritt wird gesucht…",
  lookingAsk: "Suche…",
  proves: stopped => (stopped ? "Ein Schritt beweist es. Die Suche nach einem einfacheren wurde gestoppt." : "Ein Schritt beweist es. Ein einfacherer wird gesucht…"),
  notYet: stopped => (stopped ? "Gestoppt, bevor ein Schritt gefunden war." : "Der einfachste Schritt, der es beweist, wird gesucht…"),
  showStep: "Den Schritt zeigen",
  hideStep: "Den Schritt verbergen",
  stopSearching: "Suche stoppen",
  oneCell: "Eine Ziffer kommt in ein Feld; Notizen gehen in mehrere.",
  leavesOut: "Das lässt die falsche Ziffer weg.",
  another: level => (level ? `Noch ein Rätsel der Stufe ${level}` : "Noch ein Rätsel"),
  path: (easiest, helped, moves, total) => `${easiest} von ${moves} ${moves === 1 ? "Zug" : "Zügen"} ` +
    `${easiest === 1 ? "gehörte" : "gehörten"} zu den leichtesten Schritten${helped ? `, ${helped === 1 ? "ein weiterer" : `${helped} weitere`} mit Hilfe` : ""}` +
    `${total ? `; insgesamt ${duration(total)}` : ""}.`,
  solved: "Gelöst",
  howHard: "Sehen, wie schwer es war",
  again: "Noch einmal lösen",
};

export const LEARN = {
  title: "Lernen",
  lessons: "Lektionen",
  failed: "Lernen kann nicht starten",
  missing: "Die Übungsstellungen fehlen.",
  overviewKeys: { lessons: "Lektionen", open: "öffnen" },
  watchKeys: { examples: "Beispiele", practise: "üben", close: "Fall schließen" },
  practiceKeys: { arrows: "Pfeile", move: "bewegen", place: "setzen", remove: "streichen", hint: "Tipp", next: "weiter" },
  effortBar: (effort, found, easy) => `Aufwand ${effort}: ${easy ? "leicht" : `${plural(found, "Schritt", "Schritte")} ohne Tipp gefunden`}`,
  exampleOf: idea => `Ein Beispiel für ${named(idea)}`,
  anExample: idea => `${IDEAS[idea].name}, ein Beispiel`,
  start: (idea, begun) => `Mit ${named(idea)} ${begun ? "weitermachen" : "beginnen"}`,
  play: level => `Ein Rätsel der Stufe ${level} spielen`,
  easyNow: (before, effort) => `Aufwand ${before} fällt dir jetzt leicht. Weiter mit Aufwand ${effort}.`,
  everyPosition: (before, effort) => `Das waren alle Stellungen mit Aufwand ${before}. Weiter mit Aufwand ${effort}.`,
  example: "Ein Beispiel",
  position: "Übungsstellung",
  effort: "Aufwand",
  how: idea => `Wie ${named(idea)} funktioniert`,
  watch: "Ein Beispiel ansehen",
  backToPractice: "Zurück zum Üben",
  exampleCount: (i, n) => `Beispiel ${i + 1} von ${n}`,
  previous: "Vorheriges Beispiel",
  next: "Nächstes Beispiel",
  key: (removing, d) => `${d} ${removing ? "streichen" : "setzen"}`,
  findOne: "Selbst einen finden",
  nextPosition: "Nächste Stellung",
  working: "Das Beispiel wird ausgearbeitet…",
  showEasier: "Den leichteren Schritt zeigen",
  inAnalyse: "Dieses Rätsel in der Analyse",
  checking: "Wird geprüft…",
  looking: "Der Schritt, der es beweist, wird gesucht…",
  floor: effort => ` Kein Schritt unter Aufwand ${effort} beweist es.`,
  stopLooking: "Suche stoppen",
  stopChecking: "Prüfen stoppen",
  showProof: "Den Schritt zeigen, der es beweist",
};

export const APP = {
  name: "Sudoku Reasoner",
  home: "Sudoku Reasoner, Start",
  modes: { label: "Modus", puzzles: "Rätsel", solve: "Lösen", learn: "Lernen", analyse: "Analyse" },
  keys: "Tastenkürzel",
  settings: "Einstellungen",
  open: "Ein Rätsel öffnen",
  openWide: "Rätsel öffnen…",
  openNarrow: "Öffnen…",
  openAbout: "Füge die 81 Zellen ein oder tippe sie, Zeile für Zeile, mit 0 oder . für eine leere Zelle.",
  cancel: "Abbrechen",
  openButton: "Öffnen",
  cells: n => `${n} von 81 Zellen`,
  pages: (at, total) => `Seite ${at} von ${total}`,
  pagePrevious: "Vorherige Seite",
  pageNext: "Nächste Seite",
};

export const ENGINE = {
  unreachable: "Die Engine ist nicht erreichbar. Läuft die App noch?",
  refused: status => `Die Engine hat die Anfrage abgelehnt (${status}).`,
  brokeOff: "Die Antwort der Engine brach ab.",
  stopped: why => `Die Engine hat angehalten: ${why || "der Worker ist ausgefallen"}.`,
  start: why => `Die Engine konnte nicht starten: ${why}`,
  store: key => `Der Speicher des Browsers konnte ${key} nicht lesen.`,
};
