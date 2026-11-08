// Learn's course (APP_CONCEPT.md §4): the practice positions of each idea
// (data/practice.json, cut from rated paths by calibration/practice.py) and
// the learner's progress (D53). Pure: the engine checks every answer.
//
// A lesson's positions come in order of effort, and within an effort from easy
// to hard to find (search, D60). Progress records how each position ended; an
// effort is easy for the learner after EASY steps of the idea found there
// without a hint, and a lesson goes on at its lowest effort that is not.

// The teaching order (D43): the intuition a beginner has ("try it and see")
// comes before the subtler merging of cases.
export const LESSONS = ["single", "count", "fail", "cases"];
export const EASY = 3;

export const positionId = p => `${p.puzzle}/${p.round}`;

// A position as a player's facts (service.position): the digits placed since
// the givens, and the removed candidates.
export function factsOf(p) {
  const placed = [...p.grid].flatMap((d, cell) => (d !== "0" && p.puzzle[cell] === "0" ? [{ cell, digit: Number(d), value: true }] : []));
  return [...placed, ...p.removed.map(([cell, digit]) => ({ cell, digit, value: false }))];
}

export const efforts = lesson => [...new Set(lesson.practice.map(p => p.effort))];

// Progress: { positions: { [positionId]: { how, idea, effort } }, last }. `how`
// is "unaided" or "hinted" for a step the learner found (of `idea` and
// `effort`, the step's own), "shown" when the hints showed it.
export const emptyProgress = () => ({ positions: {}, last: null });

const RANK = { shown: 0, hinted: 1, unaided: 2 };

// The record of a position, keeping its best ending.
export function record(progress, p, ending) {
  const id = positionId(p);
  const before = progress.positions[id];
  if (before && RANK[before.how] >= RANK[ending.how]) return progress;
  return { ...progress, positions: { ...progress.positions, [id]: ending } };
}

// Steps of `idea` found without a hint at `effort` (D53).
export function found(progress, idea, effort) {
  return Object.values(progress.positions).filter(r => r.how === "unaided" && r.idea === idea && r.effort === effort).length;
}

export const easy = (progress, idea, effort) => found(progress, idea, effort) >= EASY;

// Where a lesson goes on: its lowest effort not yet easy, else its highest.
export function suggestedEffort(lesson, idea, progress) {
  const all = efforts(lesson);
  return all.find(e => !easy(progress, idea, e)) ?? all.at(-1);
}

// The next position at `effort` after index `after` (or from the start): the
// first not yet done, else the first not yet found unaided, else the next one.
export function nextAt(lesson, progress, effort, after = -1) {
  const at = lesson.practice.flatMap((p, i) => (p.effort === effort ? [i] : []));
  const order = [...at.filter(i => i > after), ...at.filter(i => i <= after)];
  const how = i => progress.positions[positionId(lesson.practice[i])]?.how;
  return order.find(i => !how(i)) ?? order.find(i => how(i) !== "unaided") ?? order[0];
}

// The effort to go on at after a position: the same, unless it has become
// easy or every position there is done, then the next effort up that is not
// easy. `pinned` (chosen by the learner) stays.
export function effortAfter(lesson, idea, progress, effort, pinned) {
  if (pinned) return effort;
  const all = efforts(lesson);
  const done = lesson.practice.filter(p => p.effort === effort).every(p => progress.positions[positionId(p)]);
  if (!easy(progress, idea, effort) && !done) return effort;
  return all.find(e => e > effort && !easy(progress, idea, e)) ?? effort;
}

// The level of puzzle to play next (D53): just above what the learner finds
// easy, counting up from effort 1 while some idea is easy at each, up to `top`.
export function suggestedLevel(progress, top) {
  let level = 1;
  while (level < top && LESSONS.some(idea => easy(progress, idea, level))) level++;
  return level;
}

// The lesson to continue: the last one practised, else the first not yet easy.
export function continueWith(course, progress) {
  return progress.last ?? LESSONS.find(idea => efforts(course[idea]).some(e => !easy(progress, idea, e))) ?? LESSONS[0];
}
