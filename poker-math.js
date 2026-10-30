/*
 * poker-math.js — pure poker maths functions (no DOM).
 * Works in the browser (window.PokerMath) and in Node (module.exports) for tests.
 */
(function (root) {
  "use strict";

  const UNSEEN_FLOP = 47; // 52 - 2 hole cards - 3 board cards
  const UNSEEN_TURN = 46;

  function choose(n, k) {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
  }

  /** Exact chance of hitting at least one out. cardsToCome = 1 or 2. */
  function outsEquity(outs, street, cardsToCome) {
    outs = Math.max(0, Math.floor(outs));
    if (street === "river") return 0;
    const unseen = street === "flop" ? UNSEEN_FLOP : UNSEEN_TURN;
    if (outs >= unseen) return 1;
    if (street === "flop" && cardsToCome === 2) {
      return 1 - choose(unseen - outs, 2) / choose(unseen, 2);
    }
    return outs / unseen;
  }

  /** Rule of 2 and 4 approximation (as a fraction). */
  function ruleOf2And4(outs, cardsToCome) {
    return Math.min(1, (outs * (cardsToCome === 2 ? 4 : 2)) / 100);
  }

  /** Equity you need to break-even on a call. */
  function potOdds(pot, bet, call) {
    const total = pot + bet + call;
    return total > 0 ? call / total : 0;
  }

  /** Stack-to-pot ratio. */
  function spr(stack, pot) {
    return pot > 0 ? stack / pot : Infinity;
  }

  /** EV of calling (bb, relative to folding), ignoring future betting. */
  function callEV(equity, pot, bet, call) {
    return equity * (pot + bet) - (1 - equity) * call;
  }

  /** Extra bb you must win on later streets for a call to break even. */
  function impliedOddsNeeded(equity, pot, bet, call) {
    if (equity <= 0) return Infinity;
    return Math.max(0, call / equity - (pot + bet + call));
  }

  /** Minimum defence frequency vs a bet: how often you must continue so villain's bluffs don't auto-profit. */
  function mdf(pot, bet) {
    return pot + bet > 0 ? pot / (pot + bet) : 0;
  }

  /** How often a pure bluff of `bet` into `pot` must work to break even. */
  function bluffBreakeven(pot, bet) {
    return pot + bet > 0 ? bet / (pot + bet) : 0;
  }

  /**
   * Shoving `stack` (your total effective stack) after villain bet `bet` into `pot`.
   * Returns EV when called and the fold equity needed for the shove to break even.
   */
  function shoveAnalysis(equity, pot, bet, stack) {
    const finalPot = pot + 2 * stack; // both players all-in for the effective stack
    const evWhenCalled = equity * finalPot - stack;
    const win = pot + bet; // what you collect if villain folds
    let foldEquityNeeded;
    if (evWhenCalled >= 0) foldEquityNeeded = 0;
    else foldEquityNeeded = -evWhenCalled / (win - evWhenCalled);
    return { evWhenCalled, foldEquityNeeded, finalPot };
  }

  /** SPR guidance bands (common rules of thumb). */
  function sprBand(value) {
    if (value < 1) return { key: "committed", label: "Committed", text: "Under 1: you're effectively all-in. Most of your continuing range, including decent draws, should get the money in." };
    if (value < 3) return { key: "low", label: "Low", text: "1–3: strong one-pair hands (top pair good kicker, overpairs) sit near the top of your range and usually commit. But many players rarely bluff when they raise, so folding one pair to big aggression is still often right." };
    if (value < 6) return { key: "medium", label: "Medium", text: "3–6: top pair is in the middle of your range, not the top. Two pair+ and strong draws build the pot; one-pair hands mostly call or keep the pot smaller." };
    return { key: "high", label: "Deep", text: "6+: deep stacks. Stacking off needs the top of your range (sets, two pair, straights, flushes). One pair should mostly keep pots small. Draws and set-mining have their best implied odds." };
  }

  /**
   * The decision engine. All amounts in big blinds (bb).
   * input: { pot, bet, stack, street, mode: 'outs'|'equity', outs, equity (0-1) }
   *   pot   = pot before villain's bet
   *   bet   = villain's bet you're facing
   *   stack = your effective stack BEFORE calling
   */
  function analyse(input) {
    const potStart = Math.max(0, +input.pot || 0);
    const bet = Math.max(0, +input.bet || 0);
    const opponents = Math.min(5, Math.max(1, Math.floor(+input.opponents || 1)));
    const callers = Math.min(opponents - 1, Math.max(0, Math.floor(+input.callers || 0)));
    const multiway = opponents > 1;
    // Players who already called the bet add their money to the pot you're being offered.
    const pot = potStart + callers * bet;
    const stack = Math.max(0, +input.stack || 0);
    const street = input.street || "flop";
    const call = Math.min(bet, stack);
    const allInCall = call >= stack;
    const remaining = stack - call;

    let equity, equityNote, cardsToCome = 1;
    if (input.mode === "outs" && street !== "river") {
      cardsToCome = street === "flop" && allInCall ? 2 : 1;
      equity = outsEquity(input.outs, street, cardsToCome);
      equityNote = `${input.outs} outs with ${cardsToCome} card${cardsToCome > 1 ? "s" : ""} to come` +
        (cardsToCome === 1 && street === "flop" ? " (you only see the turn for this price — the river costs more)" : "");
    } else {
      equity = Math.min(1, Math.max(0, +input.equity || 0));
      equityNote = "your estimated equity vs villain's range";
    }

    const required = potOdds(pot, bet, call);
    const ev = callEV(equity, pot, bet, call);
    const sprNow = spr(stack, potStart);
    const sprAfter = spr(remaining, pot + bet + call);
    const implied = impliedOddsNeeded(equity, pot, bet, call);
    const shove = shoveAnalysis(equity, pot, bet, stack);
    const band = sprBand(sprNow);
    const isDraw = input.mode === "outs";
    const ratio = call > 0 ? (pot + bet) / call : Infinity;

    const steps = [];
    steps.push({ title: "Pot odds", text: `Villain bets ${bb(bet)} (${betPct(bet, potStart)}). You call ${bb(call)} to win ${bb(pot + bet)}${callers ? ` (including ${callers} player${callers > 1 ? "s" : ""} who already called: better odds for you)` : ""} (odds of ${ratio === Infinity ? "∞" : ratio.toFixed(1)}:1). You need ${pct(required)} equity to break even.` });
    steps.push({ title: "Your equity", text: `${pct(equity)} — ${equityNote}.` });
    steps.push({ title: "EV of calling", text: `${pct(equity)} × ${bb(pot + bet)} − ${pct(1 - equity)} × ${bb(call)} = ${signedBB(ev)} per call.` });
    steps.push({ title: "Stack-to-pot ratio", text: `SPR is ${sprNow === Infinity ? "∞" : sprNow.toFixed(2)} (${band.label}). After calling it would be ${sprAfter === Infinity ? "∞" : sprAfter.toFixed(2)}. ${band.text}` });

    const low = (input.stakes || "low") !== "mid";
    // Stakes-dependent thresholds. Low-stakes players call too much and bluff too little:
    // implied odds are better, fold equity is worse, thin value is better.
    // Medium-stakes regulars play closer to solver strategy but still under-bluff somewhat.
    const T = low
      ? { impliedShare: 0.6, shoveFE: 0.3, valueRaise: 0.55 }
      : { impliedShare: 0.45, shoveFE: 0.4, valueRaise: 0.6 };
    if (multiway) T.valueRaise += 0.1; // need a stronger hand to raise into several players

    if (multiway) {
      steps.push({ title: `Multiway (${opponents} opponents)`, text: multiwayAdvice(opponents, callers, isDraw, low) });
    }

    if (!isDraw && call > 0) {
      steps.push({ title: "Reality check", text: low
        ? `Your equity estimate decides this, so base it on villain's real range. Low-stakes players rarely bluff big bets, river bets or raises. Lower your estimate a lot in those spots. Folding well above the theory number (MDF ${pct(mdf(pot, bet))}) is normal and correct.`
        : `Medium stakes: regulars bluff more, so stay closer to MDF (about ${pct(mdf(pot, bet))} of your range). Many still under-bluff river raises and big overbets, so folding a little more there is fine. Against unknown regulars, don't over-fold.` });
    }
    if (isDraw && street !== "river") {
      steps.push({ title: "Playing the draw", text: drawAdvice(+input.outs || 0, sprNow, low) });
    }

    let action, tone, headline;

    if (call === 0) {
      action = "CHECK / BET"; tone = "neutral";
      headline = "There's no bet to call. Use the bet-sizing maths below to decide whether to bet.";
    } else if (ev >= 0) {
      const edge = equity - required;
      if (!allInCall && sprAfter < 1.5 && equity >= 0.4) {
        action = "SHOVE"; tone = "good";
        headline = `You have the odds to call, and after calling the SPR would be only ${sprAfter.toFixed(2)} — you're committed anyway. Getting it in now maximises fold equity and denies villain a cheap look.`;
      } else if (!isDraw && equity >= T.valueRaise && !allInCall) {
        action = "RAISE"; tone = "good";
        headline = `You're well ahead of the price (${pct(equity)} vs ${pct(required)} needed). With this much equity, raise for value to build the pot.` +
          (low ? " Low-stakes players call too wide, so size it big." : "");
      } else {
        action = "CALL"; tone = "good";
        headline = edge > 0.05
          ? `Clear call: you have ${pct(equity)} equity and only need ${pct(required)}.`
          : `Thin but profitable call: ${pct(equity)} equity vs ${pct(required)} needed.`;
      }
    } else {
      // Direct odds don't justify a call. Check implied odds, then semi-bluff shove.
      const realisticImplied = street !== "river" && !allInCall && implied <= remaining * T.impliedShare;
      steps.push({ title: "Implied odds", text: allInCall || street === "river"
        ? "No implied odds — there's no more betting after this call."
        : `To break even you need to win an extra ${bb(implied)} on later streets (${remaining > 0 ? pct(implied / remaining) : "∞"} of your remaining ${bb(remaining)} stack).` });

      if (realisticImplied) {
        action = "CALL (IMPLIED ODDS)"; tone = "warn";
        headline = `Direct odds say fold (${pct(equity)} < ${pct(required)}), but you only need to win ${bb(implied)} more when you hit.` +
          (low ? " Low-stakes players often pay off big when you hit, especially with disguised draws, so this is usually a call."
               : " Medium-stakes regulars pay off less, so only count on it if your draw is well disguised (not an obvious flush draw).");
      } else if (!multiway && stack > call && shove.foldEquityNeeded <= T.shoveFE && equity >= 0.15) {
        steps.push({ title: "Semi-bluff shove", text: `If you shove ${bb(stack)}: when called you win ${pct(equity)} of a ${bb(shove.finalPot)} pot (EV ${signedBB(shove.evWhenCalled)}). Villain needs to fold ${pct(shove.foldEquityNeeded)} of the time to make the shove break even.` });
        action = "SHOVE (SEMI-BLUFF) OR FOLD"; tone = "warn";
        headline = `Calling loses money, but shoving works if villain folds more than ${pct(shove.foldEquityNeeded)} of the time.` +
          (low ? " Low-stakes players fold too rarely, so only shove against tight players who can fold. Against calling stations, fold."
               : " Medium-stakes regulars can fold, so this is a real option. Shove when you'd fold too often otherwise.");
      } else {
        action = "FOLD"; tone = "bad";
        headline = `You need ${pct(required)} equity but have ${pct(equity)}. Calling loses ${bb(-ev)} on average${street !== "river" && !allInCall ? `, and you'd need to win an unrealistic ${bb(implied)} extra later to make up for it` : ""}.`;
      }
    }

    return {
      action, tone, headline, steps,
      numbers: { pot, potStart, opponents, callers, multiway, bet, call, stack, remaining, equity, required, ev, sprNow, sprAfter, implied, cardsToCome, mdf: mdf(pot, bet), bluffBE: bluffBreakeven(pot, bet), shove, band, ratio },
    };
  }

  /** Advice for pots with more than one opponent. */
  function multiwayAdvice(opponents, callers, isDraw, low) {
    let t = `With ${opponents} opponents, someone is much more likely to have a strong hand, and a bet has to get through all of them. Bluffs and semi-bluffs need everyone to fold, so they work far less often (the shove maths assumes heads-up and is switched off). One-pair hands lose a lot of value.`;
    if (isDraw) t += " Draws to the nuts gain: more players means more money when you hit. Non-nut draws (low flushes, the low end of a straight) lose value, because someone may hold a better version.";
    else t += " Your equity estimate should be against the best of several ranges, which is lower than against any one of them.";
    if (callers) t += ` ${callers} player${callers > 1 ? "s have" : " has"} already called: that improves your price but also shows strength, so their ranges are stronger than average.`;
    t += low
      ? " Low stakes: multiway pots are common. Play strong hands for value and give up on bluffs."
      : " Medium stakes: players continue with tighter ranges multiway. Bluff very rarely and bet mostly for value.";
    return t;
  }

  /** Modern, pool-aware advice for playing a draw. */
  function drawAdvice(outs, sprNow, low) {
    const dirty = " Count only clean outs: discount cards that pair the board or give villain a bigger flush or straight.";
    if (outs >= 12) {
      return (low
        ? `Strong draw (${outs} outs): often about a coin flip even against a made hand. Play it fast. Bet when you're the aggressor and raise when stacks are short (SPR ${sprNow.toFixed(1)}). Folds are rare at low stakes, but you don't need them: you have enough equity when called.`
        : `Strong draw (${outs} outs): play it aggressively like solvers do. Check-raise and raise often, because you win when they fold and you still have lots of equity when called. Regulars here fold enough for that to pay.`) + dirty;
    }
    if (outs >= 8) {
      return (low
        ? `Medium draw (${outs} outs): at low stakes, mostly call and realise your equity rather than semi-bluff. Players call too much, so bluff raises don't work well. When you hit, bet big: they pay off. Prefer nut draws, because second-best flushes lose big pots.`
        : `Medium draw (${outs} outs): mix it up. Call most of the time, and raise the best versions (nut flush draws, draws with overcards or backdoors) as semi-bluffs, so regulars can't read your raises as always strong.`) + dirty;
    }
    return (low
      ? `Weak draw (${outs} outs): call only when the price is right or stacks are deep enough for implied odds. Don't bluff it into calling stations. Fold to big bets.`
      : `Weak draw (${outs} outs): gutshots and backdoor draws make good low-risk bluffs against regulars who can fold, because they can still improve when called. Otherwise call only with the right price.`) + dirty;
  }

  function pct(x) { return (x * 100).toFixed(1) + "%"; }
  function bb(x) { return fmt(x) + "\u00a0bb"; } // non-breaking space keeps "9 bb" together
  function signedBB(x) { return signed(x) + " bb"; }
  /** Bet size as a percentage of the pot, e.g. "50% pot". */
  function betPct(bet, pot) { return pot > 0 ? Math.round((bet / pot) * 100) + "%\u00a0pot" : "—"; }
  function fmt(x) { return x === Infinity ? "∞" : (Math.round(x * 100) / 100).toLocaleString("en-GB"); }
  function signed(x) { return (x >= 0 ? "+" : "−") + fmt(Math.abs(x)); }

  const api = { choose, outsEquity, ruleOf2And4, potOdds, spr, callEV, impliedOddsNeeded, mdf, bluffBreakeven, shoveAnalysis, sprBand, drawAdvice, multiwayAdvice, analyse, pct, fmt, signed, bb, signedBB, betPct };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PokerMath = api;
})(typeof window !== "undefined" ? window : this);
