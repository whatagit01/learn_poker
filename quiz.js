/*
 * quiz.js — procedurally generated practice questions.
 * Each generator builds a random spot, computes the right answer with PokerMath,
 * and builds wrong answers from the mistakes players commonly make.
 */
(function (root) {
  "use strict";
  const PM = root.PokerMath || (typeof require !== "undefined" ? require("./poker-math.js") : null);
  const MU = root.PokerMatchups || (typeof require !== "undefined" ? require("./matchups.js") : null);

  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[rand(0, arr.length - 1)];
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = rand(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const pct0 = (x) => Math.round(x * 100) + "%";
  const cardsIn = (str) => str.match(/(10|[2-9JQKA])[♠♥♦♣]/g) || [];
  const egTable = (eg, extra = {}) => { const [h, b = ""] = eg.split(" on "); return { hero: cardsIn(h), board: cardsIn(b).slice(0, 5), villains: [null], ...extra }; };

  const BET_SIZES = [
    { f: 0.25, name: "quarter-pot" }, { f: 0.33, name: "third-pot" }, { f: 0.5, name: "half-pot" },
    { f: 0.66, name: "two-thirds pot" }, { f: 0.75, name: "three-quarter pot" }, { f: 1, name: "pot-sized" }, { f: 1.5, name: "1.5× pot overbet" },
  ];

  const DRAWS = [
    { name: "a flush draw", outs: 9, eg: "A♥7♥ on K♥8♥2♣" },
    { name: "an open-ended straight draw", outs: 8, eg: "9♠8♦ on 7♣6♥2♠" },
    { name: "a gutshot straight draw", outs: 4, eg: "9♠8♦ on J♣7♥2♠" },
    { name: "two overcards", outs: 6, eg: "A♠K♦ on 9♣6♥2♠" },
    { name: "a flush draw plus open-ender", outs: 15, eg: "9♥8♥ on 7♥6♥K♣" },
    { name: "a flush draw plus gutshot", outs: 12, eg: "J♥10♥ on Q♥8♥2♣" },
    { name: "a pocket pair hoping to make a set", outs: 2, eg: "6♠6♦ on K♣9♥2♠" },
    { name: "a set hoping to fill up (full house or quads)", outs: 7, eg: "7♠7♦ on 7♣K♥2♠ — turn" },
    { name: "a double-gutter", outs: 8, eg: "J♠9♦ on K♣10♥7♠" },
  ];

  // Build 4 unique options: correct + distractors (+ random fillers if needed).
  function options(correctVal, distractVals, format, fillerFn) {
    const seen = new Set([format(correctVal)]);
    const opts = [{ label: format(correctVal), correct: true }];
    for (const d of distractVals) {
      const l = format(d);
      const inRange = format === pct0 ? d > 0 && d < 1 : d >= 0;
      if (opts.length < 4 && !seen.has(l) && isFinite(d) && inRange) { seen.add(l); opts.push({ label: l, correct: false }); }
    }
    let guard = 0;
    while (opts.length < 4 && guard++ < 50) {
      let v = fillerFn();
      if (format === pct0) v = Math.min(0.97, Math.max(0.02, v));
      const l = format(v);
      if (!seen.has(l)) { seen.add(l); opts.push({ label: l, correct: false }); }
    }
    return shuffle(opts);
  }

  const generators = {
    potOdds() {
      const pot = rand(4, 40) * 5;
      const size = pick(BET_SIZES);
      const bet = Math.max(5, Math.round((pot * size.f) / 5) * 5);
      const req = PM.potOdds(pot, bet, bet);
      return {
        topic: "Pot odds",
        q: `The pot is ${pot}. Villain bets ${bet}. What equity do you need to call?`,
        options: options(req, [bet / pot, bet / (pot + bet), (bet * 2) / (pot + bet * 2)], pct0, () => req + (rand(-15, 15) / 100)),
        explain: `Required equity = call ÷ (final pot) = ${bet} ÷ (${pot} + ${bet} + ${bet}) = ${pct0(req)}. Common mistake: dividing by the pot before villain's bet (${pct0(bet / pot)}).`,
      };
    },

    countOuts() {
      const d = pick(DRAWS);
      return {
        table: egTable(d.eg, { villains: [] }),
        topic: "Counting outs",
        q: `You have ${d.name} (e.g. ${d.eg}). How many outs do you have?`,
        options: options(d.outs, [d.outs + 1, d.outs - 1, d.outs + 2, d.outs * 2, Math.round(d.outs / 2)], String, () => rand(1, 16)),
        explain: `${d.name[0].toUpperCase() + d.name.slice(1)} has ${d.outs} outs. (Real-world note: some outs may be "dirty" — e.g. a card that completes your straight but also gives villain a flush.)`,
      };
    },

    outsEquity() {
      const outs = pick([4, 6, 8, 9, 12, 15]);
      const twoCards = Math.random() < 0.5;
      const exact = PM.outsEquity(outs, "flop", twoCards ? 2 : 1);
      const rule = PM.ruleOf2And4(outs, twoCards ? 2 : 1);
      return {
        topic: "Outs → equity",
        q: twoCards
          ? `On the flop you're all-in with ${outs} outs. Roughly how often do you hit by the river?`
          : `On the flop you have ${outs} outs. How often do you hit on the turn alone?`,
        options: options(exact, [twoCards ? outs / 47 : outs * 4 / 100, outs * 3 / 100, outs / 52, outs * 5 / 100], pct0, () => exact + rand(-12, 12) / 100),
        explain: twoCards
          ? `Exact: 1 − C(${47 - outs},2)/C(47,2) = ${pct0(exact)}. Rule of 4 shortcut: ${outs} × 4 = ${pct0(rule)}. Only use ×4 when you're guaranteed to see both cards (i.e. all-in).`
          : `${outs} outs ÷ 47 unseen cards = ${pct0(exact)}. Rule of 2 shortcut: ${outs} × 2 = ${pct0(rule)}.`,
      };
    },

    spr() {
      const pot = rand(2, 30) * 10;
      const stack = rand(1, 40) * 25;
      const v = PM.spr(stack, pot);
      const band = PM.sprBand(v);
      const f = (x) => x.toFixed(1);
      return {
        topic: "Stack-to-pot ratio",
        q: `On the flop the pot is ${pot} and the effective stack is ${stack}. What's the SPR?`,
        options: options(v, [pot / stack, stack / (pot * 2), (stack - pot) / pot, stack / pot * 2], f, () => Math.max(0.1, v + rand(-30, 30) / 10)),
        explain: `SPR = effective stack ÷ pot = ${stack} ÷ ${pot} = ${f(v)} — ${band.label}. ${band.text}`,
      };
    },

    mdf(ctx) {
      const pot = rand(4, 40) * 5;
      const size = pick(BET_SIZES);
      const bet = Math.max(5, Math.round((pot * size.f) / 5) * 5);
      const v = PM.mdf(pot, bet);
      return {
        topic: "Minimum defence frequency",
        q: `Villain bets ${bet} into ${pot} (${size.name}). What's the minimum defence frequency — how much of your range should continue?`,
        options: options(v, [1 - PM.potOdds(pot, bet, bet), bet / (pot + bet), 1 - bet / pot], pct0, () => v + rand(-15, 15) / 100),
        explain: `MDF = pot ÷ (pot + bet) = ${pot} ÷ ${pot + bet} = ${pct0(v)}. In theory, folding more than ${pct0(1 - v)} lets villain profit by bluffing any two cards. ${ctx.stakes === "mid" ? "At medium stakes, regulars bluff enough that you should stay fairly close to this." : "At low stakes, most players don't bluff enough, so folding more than this is usually the stronger play."}`,
      };
    },

    bluff() {
      const pot = rand(4, 40) * 5;
      const size = pick(BET_SIZES);
      const bet = Math.max(5, Math.round((pot * size.f) / 5) * 5);
      const v = PM.bluffBreakeven(pot, bet);
      return {
        topic: "Bluffing",
        q: `You bluff ${bet} into a pot of ${pot} with a hand that never wins at showdown. How often must villain fold for the bluff to break even?`,
        options: options(v, [bet / pot, pot / (pot + bet), PM.potOdds(pot, bet, bet)], pct0, () => v + rand(-15, 15) / 100),
        explain: `Break-even = risk ÷ (risk + reward) = ${bet} ÷ (${bet} + ${pot}) = ${pct0(v)}. Bigger bets need more folds.`,
      };
    },

    matchup() {
      const street = Math.random() < 0.5 ? "preflop" : "flop";
      const m = pick(MU[street]);
      const flip = Math.random() < 0.5; // ask from either player's side
      const [a, b] = flip ? [m.villain, m.hero] : [m.hero, m.villain];
      const eq = flip ? 1 - m.equity : m.equity;
      const hands = `${a.join("")} vs ${b.join("")}${m.board ? ` on ${m.board.join(" ")}` : ""}`;
      const where = m.board ? "All-in on the flop" : "All-in preflop";
      if (Math.random() < 0.35) {
        const fav = eq >= 0.5 ? a : b;
        return {
          table: { hero: a, villains: [b], board: m.board || [], showVillain: true },
          topic: "Who's ahead?",
          q: `${where}: ${hands}. Which hand is the favourite?`,
          options: shuffle([
            { label: a.join(""), correct: fav === a },
            { label: b.join(""), correct: fav === b },
          ]),
          explain: `${a.join("")} wins ${pct0(eq)}, ${b.join("")} wins ${pct0(1 - eq)}. ${m.name}: ${m.note}`,
        };
      }
      return {
        table: { hero: a, villains: [b], board: m.board || [], showVillain: true },
        topic: "Hand vs hand",
        q: `${where}: ${hands}. How often does ${a.join("")} win?`,
        options: options(eq, [1 - eq, eq + 0.12, eq - 0.12, eq + 0.2, eq - 0.2].filter((x) => x > 0.03 && x < 0.97 && Math.abs(x - eq) >= 0.08), pct0, () => Math.min(0.97, Math.max(0.03, eq + rand(-25, 25) / 100))),
        explain: `${a.join("")} wins ${pct0(eq)} (exact, ties counted as half). ${m.name}: ${m.note}`,
      };
    },

    overcall() {
      const pot = rand(4, 30) * 10;
      const size = pick(BET_SIZES);
      const bet = Math.max(10, Math.round((pot * size.f) / 10) * 10);
      const callers = rand(1, 3);
      const req = PM.potOdds(pot + callers * bet, bet, bet);
      const naive = PM.potOdds(pot, bet, bet);
      return {
        table: { villains: Array(callers + 1 + rand(0, 1)).fill(null), bet, callers, pot },
        topic: "Multiway pot odds",
        q: `Pot ${pot}. Villain bets ${bet} and ${callers} player${callers > 1 ? "s" : ""} call${callers > 1 ? "" : "s"} before you. What equity do you need to call?`,
        options: options(req, [naive, bet / (pot + bet), bet / pot], pct0, () => Math.max(0.03, req + rand(-10, 10) / 100)),
        explain: `Each caller adds ${bet} to the pot: ${bet} ÷ (${pot} + ${bet} × ${callers + 2}) = ${pct0(req)}. Ignoring the callers gives ${pct0(naive)}. Overcalls get a better price, but the callers' ranges are strong, so you also need a stronger hand.`,
      };
    },

    multiwayEquity() {
      const m = pick(MU.multiway);
      const n = rand(1, 5);
      const eq = m.vs[n - 1];
      return {
        table: { hero: m.hand, villains: Array(n).fill(null), board: [] },
        topic: "Multiway equity",
        q: `All-in preflop with ${m.hand.join("")} against ${n} random hand${n > 1 ? "s" : ""}. Roughly how often do you win?`,
        options: options(eq, [m.vs[0], m.vs[Math.min(4, n)], eq + 0.15, eq - 0.12].filter((x) => Math.abs(x - eq) >= 0.07 && x > 0.03), pct0, () => Math.min(0.95, Math.max(0.05, eq + rand(-25, 25) / 100))),
        explain: `${m.hand.join("")} wins about ${pct0(eq)} against ${n} random hand${n > 1 ? "s" : ""}. From 1 to 5 opponents: ${m.vs.map(pct0).join(" → ")}. Every extra player cuts your chance of winning. Big pairs fall the furthest, while suited and connected hands hold up relatively better.`,
      };
    },

    decision(ctx) {
      const stakes = ctx.stakes;
      const label = stakes === "mid" ? "Medium stakes" : "Low stakes";
      const pot = rand(4, 30) * 10;
      const size = pick(BET_SIZES);
      const bet = Math.max(10, Math.round((pot * size.f) / 10) * 10);
      const kind = pick(["turnShove", "river", "flopDeep", "flopDeep"]);
      let input, desc, tbl = { villains: [null], bet, pot };
      if (kind === "turnShove") {
        const d = pick(DRAWS.filter((x) => x.outs <= 15));
        input = { pot, bet, stack: bet, street: "turn", mode: "outs", outs: d.outs, stakes };
        desc = `Turn. Pot ${pot}. Villain shoves ${bet} and you have exactly ${bet} left. You hold ${d.name} (${d.outs} outs) and are behind now.`;
      } else if (kind === "river") {
        const eq = rand(10, 55) / 100;
        input = { pot, bet, stack: bet * 3, street: "river", mode: "equity", equity: eq, stakes };
        desc = `River. Pot ${pot}. Villain bets ${bet}. You estimate your hand wins ${pct0(eq)} of the time against villain's range.`;
      } else {
        // Deep flop spot: implied odds and fold equity depend on stakes.
        const d = pick(DRAWS.filter((x) => x.outs >= 4 && x.outs <= 15 && x.outs !== 7));
        const stack = pick([bet * 2, bet * 4, bet * 6, bet * 10, bet * 15]);
        input = { pot, bet, stack, street: "flop", mode: "outs", outs: d.outs, stakes };
        tbl = egTable(d.eg, { bet, pot });
        desc = `Flop. Pot ${pot}. Villain bets ${bet} and you have ${stack} behind. You hold ${d.name} (${d.outs} outs).`;
      }
      const r = PM.analyse(input);
      const n = r.numbers;
      let correct;
      if (/^FOLD/.test(r.action)) correct = "Fold";
      else if (/SHOVE|RAISE/.test(r.action)) correct = kind === "flopDeep" ? "Raise / shove" : "Call";
      else correct = "Call";
      const labels = kind === "flopDeep" ? ["Call", "Fold", "Raise / shove"] : ["Call", "Fold"];
      return {
        table: tbl,
        topic: `Best action · ${label}`,
        q: `${label}. ${desc} What's the best play?`,
        options: shuffle(labels.map((l) => ({ label: l, correct: l === correct }))),
        explain: `Need ${PM.pct(n.required)} equity; you have ${PM.pct(n.equity)} (EV of a plain call ${PM.signed(n.ev)}). ${r.headline}`,
      };
    },

    drawPlan(ctx) {
      const low = ctx.stakes !== "mid";
      const label = low ? "Low stakes" : "Medium stakes";
      const d = pick(DRAWS.filter((x) => x.outs !== 7 && x.outs !== 2));
      const spr = pick([2, 4, 8, 12]);
      const plans = {
        fast: "Play it fast: bet, raise or check-raise",
        call: "Mostly call and realise your equity",
        cheapBluff: "Use it as an occasional cheap bluff, otherwise call or fold on price",
        fold: "Call only with the right price, never bluff it",
      };
      let correct;
      if (d.outs >= 12) correct = "fast";
      else if (d.outs >= 8) correct = "call";
      else correct = low ? "fold" : "cheapBluff";
      return {
        table: egTable(d.eg),
        topic: `Playing draws · ${label}`,
        q: `${label}, flop, SPR about ${spr}. You hold ${d.name} (${d.outs} outs, e.g. ${d.eg}). What's the best general plan?`,
        options: shuffle(Object.entries(plans).map(([k, v]) => ({ label: v, correct: k === correct }))),
        explain: PM.drawAdvice(d.outs, spr, low),
      };
    },

    exploit(ctx) {
      const low = ctx.stakes !== "mid";
      const label = low ? "Low stakes" : "Medium stakes";
      const pot = rand(6, 30) * 10;
      const spots = [
        {
          q: `River. You bet ${Math.round(pot * 0.6)} into ${pot} with top pair, good kicker. Villain raises to ${pot * 2}. No reads.`,
          opts: { a: "Fold", b: "Call", c: "Re-raise all-in" },
          ans: low ? "a" : "b",
          explain: low
            ? "Big river raises at low stakes are mostly strong hands, because players rarely bluff-raise the river. Folding well above MDF is the profitable adjustment."
            : "Regulars at medium stakes bluff-raise sometimes. With an unknown regular, top pair good kicker is near the top of your bluff-catchers, so a call stops you over-folding. Many regulars still under-bluff here, so with a read that this player never bluffs, fold.",
        },
        {
          q: `River. Pot ${pot}. You have the nuts and villain, a player who calls a lot, checks to you. Which bet size?`,
          opts: { a: "Big: pot-sized or an overbet", b: "Small: a quarter of the pot to get a call", c: "Check and hope they bet" },
          ans: "a",
          explain: low
            ? "Players who call a lot also call big bets with medium hands. Bet big; most of your profit at low stakes comes from oversized value bets."
            : "With the nuts against a capped checking range, big bets and overbets are standard at any stakes. They earn the most against the hands that will call.",
        },
        {
          q: `River. Pot ${pot}. You missed your draw. Villain has called flop and turn and checks. Do you bluff?`,
          opts: { a: "No, check and give up", b: "Yes, bet big to make them fold", c: "Bet small as a blocker bet" },
          ans: low ? "a" : "b",
          explain: low
            ? "Players who called two streets at low stakes rarely fold on the river. Bluffs need folds; save them for tight players."
            : "Regulars at medium stakes can fold one pair to a big river bet, and a missed draw has no showdown value. A big bluff is often right, especially if your cards block villain's strong hands.",
        },
        {
          q: `Flop. Pot ${pot}. You have a flush draw (9 outs) and villain bets ${Math.round(pot * 0.66)}. Stacks are deep (SPR 10).`,
          opts: { a: "Call", b: "Raise as a semi-bluff", c: "Fold" },
          ans: low ? "a" : "b",
          explain: low
            ? "At low stakes, raises get called too often, but deep stacks give great implied odds. Call and win a big pot when you hit."
            : "Regulars fold enough to semi-bluff raises, and the draw keeps plenty of equity when called. Raising some flush draws is standard, though calling is also fine some of the time.",
        },
      ];
      const sp = pick(spots);
      return {
        topic: `Stakes adjustments · ${label}`,
        q: `${label}. ${sp.q}`,
        options: shuffle(Object.entries(sp.opts).map(([k, v]) => ({ label: v, correct: k === sp.ans }))),
        explain: sp.explain,
      };
    },
  };

  const TOPICS = {
    potOdds: "Pot odds", countOuts: "Counting outs", outsEquity: "Outs → equity", spr: "SPR",
    mdf: "MDF", bluff: "Bluffing", decision: "Best action", matchup: "Hand vs hand", overcall: "Multiway pot odds", multiwayEquity: "Multiway equity", drawPlan: "Playing draws", exploit: "Stakes adjustments",
  };

  function generate(enabled, stakes) {
    const keys = (enabled && enabled.length ? enabled : Object.keys(generators));
    // decision spots twice as likely, since that's the skill that matters most
    const weighted = keys.flatMap((k) => (k === "decision" ? [k, k] : [k]));
    return generators[pick(weighted)]({ stakes: stakes === "mid" ? "mid" : "low" });
  }

  const api = { generate, generators, TOPICS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PokerQuiz = api;
})(typeof window !== "undefined" ? window : this);
