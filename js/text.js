// The app's words in the language chosen (D81), and how it reads the engine's
// events before wording them (reading.js). Each language is a module of
// text/ with the same names; `setLanguage` binds them here, and since an
// import is a live binding, every module that imports a name from here reads
// the chosen language's from then on. Callers redraw after a change.

import * as de from "./text/de.js";
import * as en from "./text/en.js";

export * from "./reading.js";

const MODULES = { en, de };

// The languages, each named in its own.
export const LANGUAGES = { en: "English", de: "Deutsch" };

export let
  duration, factPhrase, IDEAS, shapeName, headline, applyLabel, followUps, question,
  explanation, stepPhrase, witnessPhrase, effortWords, effortSum, SEARCH, STEP_SEARCH, hiddenLine,
  startsPhrase, regionName, NEXT_RUNG, hintLine, attemptLine, resultLine, SPOT_ABOUT, HEAT, HEAT_ABOUT,
  heatTitle, HEAT_REST, SETTINGS, levelAbout, SEARCHES, waitLine, climbLine, madeLine, aboveCeiling,
  ratingLine, NO_STEP, stopLine, askLine, playLine, day, sourceLine, elapsed, EFFORT_READING, LEGEND, PAD,
  FAILURE, STRIP, BOARD, STEP, ANALYSE, REGIONS, COMPARE, PUZZLES, SOLVE, LEARN, APP, ENGINE;

// Bind every name to the language `code`'s words (English when unknown);
// returns the language bound.
export function setLanguage(code) {
  const chosen = MODULES[code] ? code : "en";
  ({
  duration, factPhrase, IDEAS, shapeName, headline, applyLabel, followUps, question,
  explanation, stepPhrase, witnessPhrase, effortWords, effortSum, SEARCH, STEP_SEARCH, hiddenLine,
  startsPhrase, regionName, NEXT_RUNG, hintLine, attemptLine, resultLine, SPOT_ABOUT, HEAT, HEAT_ABOUT,
  heatTitle, HEAT_REST, SETTINGS, levelAbout, SEARCHES, waitLine, climbLine, madeLine, aboveCeiling,
  ratingLine, NO_STEP, stopLine, askLine, playLine, day, sourceLine, elapsed, EFFORT_READING, LEGEND, PAD,
  FAILURE, STRIP, BOARD, STEP, ANALYSE, REGIONS, COMPARE, PUZZLES, SOLVE, LEARN, APP, ENGINE
  } = MODULES[chosen]);
  return chosen;
}

setLanguage("en");
