// Run with: node test.js
const assert = require("assert");
global.PokerMath = require("./poker-math.js");
const PM = global.PokerMath;
const PQ = require("./quiz.js");
const near = (a, b, tol = 0.001) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

near(PM.potOdds(100, 50, 50), 0.25);           // half pot bet → 25%
near(PM.potOdds(100, 100, 100), 1 / 3);        // pot bet → 33%
near(PM.outsEquity(9, "flop", 1), 9 / 47);
near(PM.outsEquity(9, "flop", 2), 0.3497, 0.001); // flush draw flop→river ≈ 35%
near(PM.outsEquity(8, "turn", 1), 8 / 46);
near(PM.spr(400, 100), 4);
near(PM.mdf(100, 50), 2 / 3);
near(PM.bluffBreakeven(100, 100), 0.5);
near(PM.callEV(0.25, 100, 50, 50), 0);         // break-even exactly at pot odds
near(PM.impliedOddsNeeded(9 / 47, 100, 50, 50), 50 / (9 / 47) - 200);

// Flush draw on flop facing half-pot, deep: direct odds fail, implied odds OK
let r = PM.analyse({ pot: 100, bet: 50, stack: 1000, street: "flop", mode: "outs", outs: 9 });
assert.ok(r.numbers.ev < 0); assert.strictEqual(r.action, "CALL (IMPLIED ODDS)");
// Same draw facing an all-in → two cards, 35% vs 25% → call
r = PM.analyse({ pot: 100, bet: 50, stack: 50, street: "flop", mode: "outs", outs: 9 });
assert.strictEqual(r.action, "CALL"); assert.strictEqual(r.numbers.cardsToCome, 2);
// Gutshot on river-ish spot with no implied odds → fold
r = PM.analyse({ pot: 100, bet: 100, stack: 100, street: "turn", mode: "outs", outs: 4 });
assert.strictEqual(r.action, "FOLD");
// Strong made hand → raise
r = PM.analyse({ pot: 100, bet: 50, stack: 1000, street: "flop", mode: "equity", equity: 0.75 });
assert.strictEqual(r.action, "RAISE");

// Stakes setting changes the implied-odds verdict
const spot = { pot: 100, bet: 100, stack: 520, street: "flop", mode: "outs", outs: 9 };
assert.strictEqual(PM.analyse({ ...spot, stakes: "low" }).action, "CALL (IMPLIED ODDS)");
assert.strictEqual(PM.analyse({ ...spot, stakes: "mid" }).action, "FOLD");
assert.ok(PM.analyse(spot).steps.some((s) => s.title === "Playing the draw"));

// Matchup data sanity: known reference equities
const MU = require("./matchups.js");
const find = (n) => [...MU.preflop, ...MU.flop].find((m) => m.name.startsWith(n));
near(find("Pair vs two overcards (the classic").equity, 0.57, 0.01);   // QQ vs AKo ≈ 57%
near(find("Dominated").equity, 0.74, 0.01);                             // AKo vs AQo ≈ 74%
assert.ok(find("Top pair vs combo draw").equity < 0.5);                 // combo draw is the favourite
for (const m of [...MU.preflop, ...MU.flop]) near(m.win + m.lose + m.tie, 1, 0.001);

// Evaluator: hand naming and draw outs
const PE = require("./poker-eval.js");
const C = (a) => a.map(PE.parse);
assert.strictEqual(PE.draws(C(["7♥", "6♥"]), C(["K♥", "9♥", "2♣"])).outs, 9);         // flush draw
assert.strictEqual(PE.draws(C(["9♣", "8♦"]), C(["J♥", "10♠", "2♣"])).outs, 8);        // open-ender
assert.strictEqual(PE.draws(C(["9♥", "8♥"]), C(["J♥", "10♥", "2♣"])).outs, 15);       // combo draw
assert.strictEqual(PE.draws(C(["9♣", "8♦"]), C(["Q♥", "J♠", "3♦"])).outs, 4);         // gutshot
assert.strictEqual(PE.describe(C(["A♠", "K♦"]), C(["K♠", "7♦", "2♣"])), "Top pair (Kings)");
assert.strictEqual(PE.describe(C(["Q♠", "Q♦"]), C(["J♠", "6♦", "2♣"])), "Overpair (Queens)");
assert.ok(PE.evaluate(C(["A♠", "2♦", "3♣", "4♥", "5♠"])) > PE.evaluate(C(["A♠", "A♦", "A♣", "K♥", "Q♠"]))); // wheel beats trips
near(PE.equityVsRandom(C(["A♠", "A♥"]), [], 1, 40000), 0.853, 0.012);                    // AA vs 1 random ≈ 85%

assert.ok(PE.noMadeHand(C(["7♥", "6♥"]), C(["K♥", "9♥", "2♣"])));
assert.ok(!PE.noMadeHand(C(["Q♣", "A♥"]), C(["3♥", "3♣", "Q♠"])));          // two pair with the board is a made hand
const br = PE.equityVsBettingRange(C(["A♠", "K♦"]), C(["K♠", "7♦", "2♣"]), 1, 3000);
assert.ok(br < PE.equityVsRandom(C(["A♠", "K♦"]), C(["K♠", "7♦", "2♣"]), 1, 3000)); // betting range is tougher than random
// Exact equity vs known hands matches enumeration
near(PE.equityVsKnown(C(["K♠", "Q♣"]), [C(["7♥", "6♥"])], C(["K♥", "9♥", "2♣"])), 0.6111, 0.001);

// Multiway: callers improve the price and switch off the heads-up shove maths
const hu = PM.analyse({ pot: 100, bet: 50, stack: 1000, street: "flop", mode: "outs", outs: 9 });
const mw = PM.analyse({ pot: 100, bet: 50, stack: 1000, street: "flop", mode: "outs", outs: 9, opponents: 3, callers: 2 });
near(mw.numbers.required, 50 / 300);
assert.ok(mw.numbers.required < hu.numbers.required);
assert.ok(mw.steps.some((s) => s.title.startsWith("Multiway")));
assert.ok(!/SEMI-BLUFF/.test(PM.analyse({ pot: 100, bet: 100, stack: 300, street: "flop", mode: "outs", outs: 8, opponents: 2, stakes: "mid" }).action));

// Every generator yields a well-formed question with exactly one correct answer
for (const stakes of ["low", "mid"]) for (const k of Object.keys(PQ.generators)) for (let i = 0; i < 300; i++) {
  const q = PQ.generators[k]({ stakes });
  assert.ok(q.q && q.explain && q.options.length >= 2, k);
  assert.strictEqual(q.options.filter((o) => o.correct).length, 1, k);
  assert.strictEqual(new Set(q.options.map((o) => o.label)).size, q.options.length, k + " duplicate options");
  for (const o of q.options) if (/%$/.test(o.label)) assert.ok(parseFloat(o.label) >= 0 && parseFloat(o.label) <= 100, k + " bad % " + o.label);
}
console.log("All tests passed ✓");
