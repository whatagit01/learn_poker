/*
 * poker-eval.js: hand evaluation, hand naming, draw detection and Monte Carlo equity.
 * Cards are ints 0..51 = rank * 4 + suit (rank 0 = deuce … 12 = ace; suit ♠♥♦♣).
 * Works in the browser (window.PokerEval) and in Node.
 */
(function (root) {
  "use strict";
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const RANK_NAMES = ["Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines", "Tens", "Jacks", "Queens", "Kings", "Aces"];
  const SUITS = ["♠", "♥", "♦", "♣"];
  const CATEGORIES = ["High card", "One pair", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"];
  const P5 = Math.pow(13, 5);

  function parse(str) {
    const s = str.slice(-1), r = str.slice(0, -1).replace(/^T$/, "10");
    return RANKS.indexOf(r) * 4 + SUITS.indexOf(s);
  }
  const toStr = (c) => RANKS[c >> 2] + SUITS[c & 3];
  const rankOf = (c) => c >> 2;
  const suitOf = (c) => c & 3;

  function straightHigh(mask) {
    for (let h = 12; h >= 3; h--) {
      let ok = true;
      for (let k = 0; k < 5 && ok; k++) {
        const r = h - k === -1 ? 12 : h - k;
        if (!(mask & (1 << r))) ok = false;
      }
      if (ok) return h;
    }
    return -1;
  }
  const enc = (cat, ks) => ks.reduce((a, k) => a * 13 + k, cat) * Math.pow(13, 5 - ks.length);

  /** Score any 5–7 cards. Higher is better. category = Math.floor(score / 13^5). */
  function evaluate(cards) {
    const counts = new Array(13).fill(0), suitCards = [[], [], [], []];
    for (const c of cards) { counts[c >> 2]++; suitCards[c & 3].push(c >> 2); }
    for (const sc of suitCards) if (sc.length >= 5) {
      let m = 0; sc.forEach((r) => (m |= 1 << r));
      const sh = straightHigh(m);
      if (sh >= 0) return enc(8, [sh]);
      return enc(5, sc.sort((a, b) => b - a).slice(0, 5));
    }
    const byCount = [[], [], [], [], []];
    for (let r = 12; r >= 0; r--) byCount[counts[r]].push(r);
    if (byCount[4].length) return enc(7, [byCount[4][0], Math.max(-1, ...byCount[3], ...byCount[2], ...byCount[1])]);
    if (byCount[3].length && (byCount[3].length > 1 || byCount[2].length)) {
      return enc(6, [byCount[3][0], Math.max(byCount[3][1] ?? -1, byCount[2][0] ?? -1)]);
    }
    let m = 0; for (let r = 0; r < 13; r++) if (counts[r]) m |= 1 << r;
    const sh = straightHigh(m);
    if (sh >= 0) return enc(4, [sh]);
    if (byCount[3].length) return enc(3, [byCount[3][0], ...byCount[1].slice(0, 2)]);
    if (byCount[2].length >= 2) {
      const [a, b] = byCount[2];
      return enc(2, [a, b, Math.max(byCount[2][2] ?? -1, byCount[1][0] ?? -1)]);
    }
    if (byCount[2].length) return enc(1, [byCount[2][0], ...byCount[1].slice(0, 3)]);
    return enc(0, byCount[1].slice(0, 5));
  }
  const category = (score) => Math.floor(score / P5);

  /** Human description of the hero's made hand, e.g. "Top pair (Kings)". */
  function describe(hole, board) {
    if (hole.length < 2) return "";
    if (board.length < 3) {
      const [a, b] = hole.map(rankOf).sort((x, y) => y - x);
      if (a === b) return `Pocket ${RANK_NAMES[a]}`;
      return `${RANKS[a]}${RANKS[b]} ${suitOf(hole[0]) === suitOf(hole[1]) ? "suited" : "offsuit"}`;
    }
    const score = evaluate([...hole, ...board]);
    const cat = category(score);
    const boardScore = evaluate(board);
    if (cat === 1) {
      const pairRank = Math.floor(score / Math.pow(13, 4)) % 13;
      const boardRanks = board.map(rankOf).sort((x, y) => y - x);
      const holeRanks = hole.map(rankOf);
      if (category(boardScore) === 1) return "Board pair only: no pair of your own";
      if (holeRanks[0] === holeRanks[1]) {
        return pairRank > boardRanks[0] ? `Overpair (${RANK_NAMES[pairRank]})` : `Underpair (${RANK_NAMES[pairRank]})`;
      }
      if (pairRank === boardRanks[0]) return `Top pair (${RANK_NAMES[pairRank]})`;
      if (pairRank === boardRanks[boardRanks.length - 1]) return `Bottom pair (${RANK_NAMES[pairRank]})`;
      return `Middle pair (${RANK_NAMES[pairRank]})`;
    }
    if (cat === 3) {
      const holeRanks = hole.map(rankOf);
      return holeRanks[0] === holeRanks[1] ? "Set" : "Trips";
    }
    if (cat === 0) return "High card";
    if (score <= boardScore) return `${CATEGORIES[cat]} (on the board)`;
    return CATEGORIES[cat];
  }

  /**
   * Draw detection on the flop/turn. Outs = unseen cards that give you a straight or better
   * that beats what the board alone makes. Returns { outs, names[] }.
   */
  function draws(hole, board) {
    if (hole.length < 2 || board.length < 3 || board.length > 4) return { outs: 0, names: [], cards: [] };
    const mine = [...hole, ...board];
    const nowCat = category(evaluate(mine));
    if (nowCat >= 4) return { outs: 0, names: [], cards: [] };
    const used = new Set(mine);
    const outCards = [];
    for (let c = 0; c < 52; c++) {
      if (used.has(c)) continue;
      const s = evaluate([...mine, c]);
      if (category(s) >= 4 && s > evaluate([...board, c])) outCards.push(c);
    }
    const names = [];
    // flush draw: 4 of a suit including at least one hole card
    for (let su = 0; su < 4; su++) {
      const n = mine.filter((c) => suitOf(c) === su).length;
      if (n === 4 && hole.some((c) => suitOf(c) === su)) names.push(hole.every((c) => suitOf(c) === su) || hole.some((c) => suitOf(c) === su && rankOf(c) === 12) ? "Flush draw" : "Flush draw (one card)");
    }
    // straight draw type: count distinct ranks that complete a straight
    let mask = 0; mine.forEach((c) => (mask |= 1 << rankOf(c)));
    let boardMask = 0; board.forEach((c) => (boardMask |= 1 << rankOf(c)));
    let straightRanks = 0;
    for (let r = 0; r < 13; r++) {
      if (mask & (1 << r)) continue;
      if (straightHigh(mask | (1 << r)) >= 0 && straightHigh(boardMask | (1 << r)) < 0) straightRanks++;
    }
    if (straightRanks >= 2) names.push("Open-ended straight draw");
    else if (straightRanks === 1) names.push("Gutshot straight draw");
    if (!names.length && outCards.length && nowCat >= 2) names.push("Drawing to a full house");
    return { outs: outCards.length, names, cards: outCards };
  }

  function rng() { return Math.random(); }

  /** Monte Carlo equity of `hole` vs `nOpp` random hands. Ties split. */
  function equityVsRandom(hole, board, nOpp, iters) {
    const used = new Set([...hole, ...board]);
    const deck = []; for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
    const need = 5 - board.length;
    const draw = need + nOpp * 2;
    let share = 0;
    const b = board.slice();
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < draw; i++) { // partial Fisher-Yates
        const j = i + Math.floor(rng() * (deck.length - i));
        const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
      }
      b.length = board.length;
      for (let i = 0; i < need; i++) b.push(deck[i]);
      const heroScore = evaluate([...hole, ...b]);
      let best = heroScore, tied = 1, heroBest = true;
      for (let o = 0; o < nOpp; o++) {
        const s = evaluate([deck[need + o * 2], deck[need + o * 2 + 1], ...b]);
        if (s > best) { best = s; heroBest = false; tied = 1; }
        else if (s === best) tied++;
      }
      if (heroBest) share += 1 / tied;
    }
    return share / iters;
  }

  /** Exact heads-up equity by enumeration of every runout. */
  function equityExact(h1, h2, board) {
    const used = new Set([...h1, ...h2, ...board]);
    const deck = []; for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
    const need = 5 - board.length;
    let w1 = 0, w2 = 0, tie = 0, n = 0;
    const run = new Array(need);
    (function rec(start, depth) {
      if (depth === need) {
        const full = [...board, ...run];
        const s1 = evaluate([...h1, ...full]), s2 = evaluate([...h2, ...full]);
        if (s1 > s2) w1++; else if (s2 > s1) w2++; else tie++;
        n++; return;
      }
      for (let i = start; i < deck.length; i++) { run[depth] = deck[i]; rec(i + 1, depth + 1); }
    })(0, 0);
    return { win: w1 / n, lose: w2 / n, tie: tie / n, equity: (w1 + tie / 2) / n };
  }

  const api = { RANKS, SUITS, CATEGORIES, parse, toStr, rankOf, suitOf, evaluate, category, describe, draws, equityVsRandom, equityExact };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PokerEval = api;
})(typeof window !== "undefined" ? window : this);
