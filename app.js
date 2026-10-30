(function () {
  "use strict";
  const PM = window.PokerMath, PQ = window.PokerQuiz;
  const $ = (id) => document.getElementById(id);

  // ---------- Tabs ----------
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
      document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === t.dataset.tab));
      if (t.dataset.tab === "practice" && !current) nextQuestion();
    })
  );

  // ---------- Segmented controls ----------
  const state = { street: "flop", mode: "outs", stakes: "low" };
  function seg(id, key) {
    $(id).querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        $(id).querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        state[key] = b.dataset.v;
        sync();
        if (key === "mode") updateCardInfo();
      })
    );
  }
  seg("stakes", "stakes");
  seg("street", "street");
  seg("mode", "mode");

  $("betQuick").addEventListener("click", (e) => {
    const f = e.target.dataset.f; if (!f) return;
    $("bet").value = Math.round(+$("pot").value * f * 2) / 2; sync();
  });
  $("drawQuick").addEventListener("click", (e) => {
    const o = e.target.dataset.o; if (!o) return;
    $("outs").value = o; sync();
  });
  ["pot", "bet", "stack", "outs", "equity"].forEach((id) => $(id).addEventListener("input", sync));

  // ---------- Table: cards, seats, picker ----------
  const PE = window.PokerEval;
  const ORDER = ["h0", "h1", "b0", "b1", "b2", "b3", "b4"];
  const slots = Object.fromEntries(ORDER.map((k) => [k, null]));
  const table = { opponents: 1, callers: 0, cardInfo: null };
  let pickingSlot = null;
  const play = { active: false, awaiting: false, revealed: false, villains: [], villainNames: [], board: [], hero: [], streetIdx: 0, score: 0, decisions: 0 };
  let lastResult = null;

  const faceHTML = (c, extra = "") => {
    if (c == null) return `<span class="tc empty ${extra}">+</span>`;
    const red = PE.suitOf(c) === 1 || PE.suitOf(c) === 2;
    const r = PE.RANKS[PE.rankOf(c)], s = PE.SUITS[PE.suitOf(c)];
    return `<span class="tc ${red ? "red" : ""} ${extra}"><i>${r}</i><em>${s}</em></span>`;
  };
  window.faceHTML = faceHTML;
  const holeCards = () => ["h0", "h1"].map((k) => slots[k]).filter((c) => c != null);
  const boardCards = () => ["b0", "b1", "b2", "b3", "b4"].map((k) => slots[k]).filter((c) => c != null);

  function drawSlots() {
    const mine = (k) => (play.active && play.userPicks && play.userPicks[k] != null ? "mine" : "");
    $("hole").innerHTML = ["h0", "h1"].map((k) => `<button type="button" class="slot" data-slot="${k}">${faceHTML(slots[k], mine(k))}</button>`).join("");
    $("board").innerHTML = ["b0", "b1", "b2", "b3", "b4"].map((k, i) =>
      `<button type="button" class="slot ${i >= 3 ? "later" : ""}" data-slot="${k}" aria-label="${i < 3 ? "Flop" : i === 3 ? "Turn" : "River"} card">${faceHTML(slots[k], mine(k))}</button>`).join("");
  }
  function drawSeats(n) {
    const k = table.opponents;
    const angles = k === 1 ? [270] : Array.from({ length: k }, (_, i) => 200 + (140 * i) / (k - 1));
    $("seats").innerHTML = angles.map((a, i) => {
      const x = 50 + 39 * Math.cos((a * Math.PI) / 180), y = 50 + 44 * Math.sin((a * Math.PI) / 180);
      let chip;
      if (n.bet <= 0) chip = `<span class="act">Checks</span>`;
      else if (i === 0) chip = `<span class="chipstack bet">Bets ${PM.bb(n.bet)}<br>${PM.betPct(n.bet, n.potStart)}</span>`;
      else if (i <= table.callers) chip = `<span class="chipstack">Calls ${PM.bb(n.bet)}</span>`;
      else chip = `<span class="act">To act</span>`;
      const shown = play.revealed && play.villains[i];
      const cards = shown ? play.villains[i].map((c) => faceHTML(c, "sm")).join("") : `<span class="tc back"></span><span class="tc back"></span>`;
      if (play.active && play.awaiting === false && play.revealed) chip = play.villains[i] ? `<span class="act">${play.villainNames[i] || ""}</span>` : "";
      return `<div class="seat" style="left:${x}%;top:${y}%"><div class="backs">${cards}</div><div class="seat-name">${i === 0 ? "Villain" : "Opp " + (i + 1)}</div>${chip}</div>`;
    }).join("");
    $("tPot").textContent = PM.bb(n.potStart);
    $("tStack").textContent = PM.bb(n.stack);
    $("oppN").textContent = table.opponents;
    $("callersN").textContent = table.callers;
  }

  function setStreet(v) {
    state.street = v;
    $("street").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.v === v));
  }

  let infoTimer = null;
  function updateCardInfo() {
    const hole = holeCards(), board = boardCards();
    const nb = board.length;
    if (nb >= 3) setStreet(nb === 3 ? "flop" : nb === 4 ? "turn" : "river");
    if (hole.length < 2) {
      table.cardInfo = null;
      $("tableInfo").textContent = "Tap the card spaces to choose any cards you like, or just press Deal. Cards you choose are kept and the rest are dealt at random.";
      return;
    }
    const desc = PE.describe(hole, board);
    const d = PE.draws(hole, board);
    if (d.outs > 0 && state.mode === "outs" && PE.noMadeHand(hole, board)) $("outs").value = d.outs;
    $("tableInfo").innerHTML = `<b>${desc}</b>${d.names.length ? " · " + d.names.join(" + ") : ""}${d.outs ? ` · <b>${d.outs} outs</b> (filled in below)` : ""}<br><span class="muted">Working out equity…</span>`;
    clearTimeout(infoTimer);
    infoTimer = setTimeout(() => {
      const eq = PE.equityVsRandom(hole, board, table.opponents, 6000);
      $("tableInfo").innerHTML = `<b>${desc}</b>${d.names.length ? " · " + d.names.join(" + ") : ""}${d.outs ? ` · <b>${d.outs} outs</b> (filled in below)` : ""}` +
        `<br>Wins <b>${PM.pct(eq)}</b> against ${table.opponents} random hand${table.opponents > 1 ? "s" : ""}. <span class="muted">Players who bet or call usually have stronger hands than random, so treat this as an upper limit.</span>`;
    }, 30);
  }

  function openPicker(slot) {
    pickingSlot = slot;
    const used = new Set(ORDER.filter((k) => k !== slot).map((k) => slots[k]).filter((c) => c != null));
    const label = { h0: "Your first card", h1: "Your second card", b0: "Flop card 1", b1: "Flop card 2", b2: "Flop card 3", b3: "Turn card", b4: "River card" }[slot];
    $("pickerTitle").textContent = label;
    $("pickerRemove").hidden = slots[slot] == null;
    let html = "";
    for (let s = 0; s < 4; s++) for (let r = 12; r >= 0; r--) {
      const c = r * 4 + s;
      html += `<button type="button" class="pk ${s === 1 || s === 2 ? "red" : ""} ${slots[slot] === c ? "sel" : ""}" data-c="${c}" ${used.has(c) ? "disabled" : ""}>${PE.RANKS[r]}<small>${PE.SUITS[s]}</small></button>`;
    }
    $("pickerGrid").innerHTML = html;
    $("picker").hidden = false;
  }
  function closePicker() { $("picker").hidden = true; pickingSlot = null; }

  $("felt").addEventListener("click", (e) => {
    if (play.active) return;
    const b = e.target.closest("[data-slot]"); if (b) openPicker(b.dataset.slot);
  });
  $("pickerGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-c]"); if (!b || b.disabled) return;
    slots[pickingSlot] = +b.dataset.c;
    drawSlots(); updateCardInfo(); render();
    const next = ORDER.slice(ORDER.indexOf(pickingSlot) + 1).find((k) => slots[k] == null);
    // keep going through hole cards and the flop; stop after the flop/turn/river so streets stay deliberate
    if (next && ORDER.indexOf(next) <= 4) openPicker(next); else closePicker();
  });
  $("pickerRemove").addEventListener("click", () => { slots[pickingSlot] = null; drawSlots(); updateCardInfo(); render(); closePicker(); });
  $("pickerDone").addEventListener("click", closePicker);
  $("picker").addEventListener("click", (e) => { if (e.target === $("picker")) closePicker(); });
  $("clearCards").addEventListener("click", () => {
    if (play.active) return; ORDER.forEach((k) => (slots[k] = null)); drawSlots(); updateCardInfo(); render(); });
  document.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
    if (play.active) return;
    const d = +b.dataset.d;
    if (b.dataset.step === "opp") table.opponents = Math.min(5, Math.max(1, table.opponents + d));
    else table.callers += d;
    table.callers = Math.min(table.opponents - 1, Math.max(0, table.callers));
    updateCardInfo(); render();
  }));
  drawSlots();

  // ---------- Play a random hand ----------
  const STREETS = ["flop", "turn", "river"];
  const rint = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pickOne = (arr) => arr[rint(0, arr.length - 1)];
  const roundHalf = (x) => Math.max(0.5, Math.round(x * 2) / 2);
  const setVal = (id, v) => { $(id).value = v; };
  function setMode(m) {
    state.mode = m;
    $("mode").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.v === m));
  }
  const cardsTxt = (cs) => cs.map(PE.toStr).join(" ");

  function dealHand() {
    // First deal: remember what the user set up, so "Deal a new hand" and "Stop" can reuse it.
    if (!play.active) { play.userPicks = { ...slots }; play.userOpp = table.opponents; }
    const picks = play.userPicks;
    const picked = new Set(Object.values(picks).filter((c) => c != null));
    const deck = Array.from({ length: 52 }, (_, i) => i).filter((c) => !picked.has(c));
    for (let i = deck.length - 1; i > 0; i--) { const j = rint(0, i); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const next = () => deck.pop();
    const opp = play.userOpp > 1 ? play.userOpp : pickOne([1, 1, 1, 2, 2, 3]);
    play.hero = [picks.h0 ?? next(), picks.h1 ?? next()];
    play.board = ["b0", "b1", "b2", "b3", "b4"].map((k) => picks[k] ?? next());
    play.villains = Array.from({ length: opp }, () => [next(), next()]);
    play.villainNames = [];
    play.active = true; play.revealed = false; play.streetIdx = 0; play.folded = false;
    slots.h0 = play.hero[0]; slots.h1 = play.hero[1];
    ["b0", "b1", "b2"].forEach((k, i) => (slots[k] = play.board[i]));
    slots.b3 = slots.b4 = null;
    table.opponents = opp;
    table.callers = opp > 1 ? rint(0, opp - 1) : 0;
    const pot = rint(6, 60) / 2; // 3–30 bb
    setVal("pot", pot);
    setVal("stack", Math.round(pot * pickOne([2, 3, 5, 8, 12])));
    $("dealBtn").hidden = true;
    $("playPanel").hidden = false;
    document.querySelector(".table-card").classList.add("playing");
    startDecision();
  }

  function startDecision() {
    const street = STREETS[play.streetIdx];
    const pot = +$("pot").value, stack = +$("stack").value;
    const bet = Math.min(stack, roundHalf(pot * pickOne([0.33, 0.5, 0.66, 0.75, 1, 1.5])));
    setVal("bet", bet);
    drawSlots();
    setStreet(street);
    const hole = play.hero, board = boardCards();
    const d = PE.draws(hole, board);
    if (street !== "river" && d.outs > 0 && PE.noMadeHand(hole, board)) { setMode("outs"); setVal("outs", d.outs); }
    else {
      setMode("equity");
      setVal("equity", Math.round(PE.equityVsBettingRange(hole, board, table.opponents, 2500) * 100));
    }
    play.awaiting = true;
    sync(); updateCardInfo();
    const others = table.callers ? ` ${table.callers} other player${table.callers > 1 ? "s" : ""} call${table.callers > 1 ? "" : "s"}.` : "";
    $("playStreet").textContent = street[0].toUpperCase() + street.slice(1);
    $("playMsg").innerHTML = `Villain bets <b>${PM.bb(bet)}</b> (${PM.betPct(bet, pot)}) into <b>${PM.bb(pot)}</b>.${others} You have <b>${PM.bb(stack)}</b> behind. What do you do?` +
      (state.mode === "equity" ? `<br><span class="muted">The equity slider is set to your win % against a typical betting range (hands with a pair or better, or a strong draw). Adjust it if you have a read on the player.</span>` : `<br><span class="muted">You have no made hand, so this is played as a draw using your outs.</span>`);
    $("playFeedback").hidden = true;
    const allIn = bet >= stack;
    const raiseTo = Math.min(stack, bet * 3);
    actions([
      ["Fold", "fold", "bad"],
      [allIn ? `Call all-in ${PM.bb(bet)}` : `Call ${PM.bb(bet)}`, "call", "good"],
      ...(allIn ? [] : [[raiseTo >= stack ? `Shove ${PM.bb(stack)}` : `Raise to ${PM.bb(raiseTo)}`, "raise", "gold"]]),
    ]);
    showScore();
  }

  function actions(list) {
    $("playActions").innerHTML = list.map(([label, v, tone]) => `<button type="button" class="pa ${tone || ""}" data-a="${v}">${label}</button>`).join("");
  }
  function showScore() {
    $("playScore").textContent = play.decisions ? `Matches the maths: ${play.score}/${play.decisions}` : "";
  }

  function decide(choice) {
    const r = lastResult, n = r.numbers;
    const ok = /^FOLD/.test(r.action) ? ["fold"]
      : /SEMI-BLUFF/.test(r.action) ? ["raise", "fold"]
      : /^SHOVE/.test(r.action) ? ["raise", "call"]
      : /^RAISE/.test(r.action) ? ["raise"]
      : ["call"];
    const match = ok.includes(choice);
    play.decisions++; if (match) play.score++;
    play.awaiting = false;

    const live = play.villains.slice(0, 1 + table.callers);
    const real = PE.equityVsKnown(play.hero, live, boardCards());
    const fb = $("playFeedback");
    fb.hidden = false;
    fb.className = "play-feedback " + (match ? "good" : "bad");
    fb.innerHTML = `<b>${STREETS[play.streetIdx][0].toUpperCase() + STREETS[play.streetIdx].slice(1)} decision:</b> ${match ? "✓ That matches the maths" : "✗ The maths says"} <b>${r.action}</b>. ${match ? "" : r.headline}` +
      `<br>Your real equity against their actual cards: <b>${PM.pct(real)}</b> (you needed ${PM.pct(n.required)}).` +
      `<span class="muted"> You couldn't know their cards, so judge your decision by the maths, not by the result.</span>`;

    const pot = +$("pot").value, bet = +$("bet").value, stack = +$("stack").value;
    if (choice === "fold") {
      play.folded = true;
      play.villains = live;
      actions([["See what would have happened", "showdown", "gold"], ["Deal a new hand", "new"], ["Stop", "exit"]]);
    } else {
      let newPot, newStack;
      if (choice === "call") {
        const put = Math.min(bet, stack);
        newPot = pot + bet * (1 + table.callers) + put; newStack = stack - put;
        play.villains = live;
      } else {
        const raiseTo = Math.min(stack, bet * 3);
        // simplification: villain calls the raise, other callers fold
        newPot = pot + bet * table.callers + raiseTo * 2; newStack = stack - raiseTo;
        play.villains = [play.villains[0]];
        fb.innerHTML += `<br><span class="muted">Villain calls your raise${table.callers ? " and the other players fold" : ""}.</span>`;
      }
      setVal("pot", newPot); setVal("stack", newStack);
      table.opponents = play.villains.length; table.callers = 0;
      const last = play.streetIdx === 2 || newStack <= 0;
      actions(last
        ? [[newStack <= 0 && play.streetIdx < 2 ? "You're all-in: run it out" : "Showdown", "showdown", "gold"]]
        : [[`Deal the ${STREETS[play.streetIdx + 1]}`, "next", "gold"], ["Stop", "exit"]]);
    }
    sync();
    showScore();
  }

  function nextStreet() {
    play.streetIdx++;
    slots[play.streetIdx === 1 ? "b3" : "b4"] = play.board[2 + play.streetIdx];
    if (play.villains.length > 1) table.callers = rint(0, play.villains.length - 1);
    startDecision();
  }

  function showdown() {
    slots.b3 = play.board[3]; slots.b4 = play.board[4];
    drawSlots(); setStreet("river");
    play.revealed = true; play.awaiting = false;
    const board = play.board;
    const heroScore = PE.evaluate([...play.hero, ...board]);
    const scores = play.villains.map((v) => PE.evaluate([...v, ...board]));
    play.villainNames = scores.map((s) => PE.CATEGORIES[PE.category(s)]);
    const best = Math.max(heroScore, ...scores);
    const heroWins = heroScore === best, tie = heroWins && scores.includes(best);
    const pot = +$("pot").value;
    const heroName = PE.CATEGORIES[PE.category(heroScore)];
    let msg = `Board: <b>${cardsTxt(board)}</b><br>You: <b>${cardsTxt(play.hero)}</b>, ${heroName}<br>` +
      play.villains.map((v, i) => `${i === 0 ? "Villain" : "Opp " + (i + 1)}: <b>${cardsTxt(v)}</b>, ${play.villainNames[i]}`).join("<br>") + "<br>";
    if (play.folded) msg += heroWins ? (tie ? "You would have split the pot." : "😬 You would have won this one. Judge the fold by the maths, not by one result.") : "👍 You would have lost this one.";
    else msg += tie ? `🤝 Split pot (${PM.bb(pot)}).` : heroWins ? `🏆 You win the ${PM.bb(pot)} pot!` : `You lose the ${PM.bb(pot)} pot.`;
    $("playStreet").textContent = "Showdown";
    $("playMsg").innerHTML = msg;
    actions([["Deal a new hand", "new", "gold"], ["Stop", "exit"]]);
    sync();
  }

  function exitPlay() {
    play.active = false; play.awaiting = false; play.revealed = false;
    Object.assign(slots, play.userPicks || {});
    table.opponents = play.userOpp || 1; table.callers = 0;
    drawSlots(); updateCardInfo();
    $("playPanel").hidden = true; $("dealBtn").hidden = false;
    document.querySelector(".table-card").classList.remove("playing");
    sync();
  }

  $("dealBtn").addEventListener("click", dealHand);
  $("playActions").addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]"); if (!a) return;
    const v = a.dataset.a;
    if (v === "fold" || v === "call" || v === "raise") decide(v);
    else if (v === "next") nextStreet();
    else if (v === "showdown") showdown();
    else if (v === "new") dealHand();
    else if (v === "exit") exitPlay();
  });


  function sync() {
    const river = state.street === "river";
    const riverBtn = $("mode").querySelector('[data-v="outs"]');
    riverBtn.disabled = river;
    if (river && state.mode === "outs") {
      state.mode = "equity";
      $("mode").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.v === "equity"));
    }
    $("outsBox").hidden = state.mode !== "outs";
    $("equityBox").hidden = state.mode !== "equity";
    $("eqVal").textContent = $("equity").value + "%";
    $("betPct").textContent = PM.betPct(+$("bet").value, +$("pot").value);
    render();
  }

  function render() {
    const r = PM.analyse({
      pot: +$("pot").value, bet: +$("bet").value, stack: +$("stack").value,
      street: state.street, mode: state.mode, stakes: state.stakes, outs: +$("outs").value, equity: +$("equity").value / 100,
      opponents: table.opponents, callers: table.callers,
    });
    const n = r.numbers;
    lastResult = r;
    drawSeats(n);
    $("result").classList.toggle("locked", play.active && play.awaiting);
    $("verdict").textContent = r.action;
    $("verdict").className = "verdict " + r.tone;
    $("headline").textContent = r.headline;

    $("eqFill").style.width = Math.min(100, n.equity * 100) + "%";
    $("eqFill").className = "fill " + (n.equity >= n.required ? "good" : "bad");
    $("reqMark").style.left = Math.min(100, n.required * 100) + "%";
    $("eqLbl").textContent = PM.pct(n.equity);
    $("reqLbl").textContent = PM.pct(n.required);

    const fmtR = (x) => (x === Infinity ? "∞" : x.toFixed(2));
    const stats = [
      ["Pot odds", n.ratio === Infinity ? "—" : n.ratio.toFixed(1) + " : 1"],
      ["Bet size", PM.betPct(n.bet, n.potStart)],
      ["Call EV", PM.signedBB(n.ev)],
      ["SPR", fmtR(n.sprNow)],
      ["SPR after call", fmtR(n.sprAfter)],
      ["Implied odds needed", n.implied === 0 ? "none" : PM.bb(n.implied)],
      ["Shove needs folds", n.multiway ? "n/a multiway" : PM.pct(n.shove.foldEquityNeeded)],
      ["MDF (theory)", PM.pct(n.mdf)],
      ["Bluff break-even", PM.pct(n.bluffBE)],
    ];
    $("stats").innerHTML = stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
    $("steps").innerHTML = r.steps.map((s) => `<li><b>${s.title}.</b> ${s.text}</li>`).join("");
  }

  // ---------- Practice ----------
  let current = null, score = 0, total = 0, streak = 0;
  const enabled = new Set(Object.keys(PQ.TOPICS));
  $("topicList").innerHTML = Object.entries(PQ.TOPICS)
    .map(([k, v]) => `<label class="tick"><input type="checkbox" value="${k}" checked /> ${v}</label>`).join("");
  $("topicList").addEventListener("change", (e) => {
    if (e.target.checked) enabled.add(e.target.value); else enabled.delete(e.target.value);
    if (enabled.size === 0) { e.target.checked = true; enabled.add(e.target.value); }
  });

  let quizStakes = "low";
  $("qStakes").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      $("qStakes").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      quizStakes = b.dataset.v;
      nextQuestion();
    })
  );

  function nextQuestion() {
    current = PQ.generate([...enabled], quizStakes);
    $("qAnswers").classList.toggle("long", current.options.some((o) => o.label.length > 14));
    $("qTopic").textContent = current.topic;
    $("qText").textContent = current.q;
    $("qTable").innerHTML = current.table ? miniTable(current.table) : "";
    $("qExplain").hidden = true;
    $("qNext").hidden = true;
    $("qAnswers").innerHTML = "";
    current.options.forEach((o) => {
      const b = document.createElement("button");
      b.className = "ans"; b.textContent = o.label;
      b.addEventListener("click", () => answer(b, o));
      $("qAnswers").appendChild(b);
    });
  }

  function miniTable(t) {
    const f = (str) => faceHTML(PE.parse(str), "sm");
    const opps = (t.villains || []).map((v, i) => {
      const cards = v && t.showVillain ? v.map(f).join("") : `<span class="tc back"></span><span class="tc back"></span>`;
      let chip = "";
      if (t.bet) chip = i === 0 ? `<span class="chipstack bet">Bets ${PM.bb(t.bet)}${t.pot ? " · " + PM.betPct(t.bet, t.pot).replace("\u00a0pot", "") : ""}</span>` : i <= (t.callers || 0) ? `<span class="chipstack">Calls ${PM.bb(t.bet)}</span>` : `<span class="act">To act</span>`;
      return `<div class="mini-seat"><div class="backs">${cards}</div>${chip}</div>`;
    }).join("");
    const board = (t.board || []).length ? t.board.map(f).join("") : t.hero ? `<span class="act">Preflop</span>` : "";
    return `<div class="mini-felt">
      ${opps ? `<div class="mini-opps">${opps}</div>` : ""}
      <div class="mini-board">${board}${t.pot ? `<span class="pot-pill">Pot <b>${PM.bb(t.pot)}</b></span>` : ""}</div>
      ${t.hero ? `<div class="mini-hero">${t.hero.map(f).join("")}<span class="seat-label">You</span></div>` : `<div class="mini-hero"><span class="seat-label">You</span></div>`}
    </div>`;
  }

  function answer(btn, opt) {
    if (current.answered) return;
    current.answered = true; total++;
    if (opt.correct) { score++; streak++; } else streak = 0;
    [...$("qAnswers").children].forEach((b, i) => {
      b.disabled = true;
      if (current.options[i].correct) b.classList.add("right");
    });
    if (!opt.correct) btn.classList.add("wrong");
    $("qExplain").innerHTML = `<b>${opt.correct ? (streak >= 3 ? `Correct. ${streak} in a row!` : "Correct.") : "Not quite."}</b> ${current.explain}`;
    $("qExplain").hidden = false;
    $("qNext").hidden = false;
    $("qScore").textContent = `${score} / ${total}`;
    $("qNext").focus();
  }
  $("qNext").addEventListener("click", nextQuestion);

  // ---------- Matchup tables ----------
  const cardHTML = (c) => `<span class="pc ${/[♥♦]/.test(c) ? "red" : ""}">${c}</span>`;
  const cardsHTML = (cs) => cs.map(cardHTML).join("");
  function renderMatchups(list, id) {
    $(id).innerHTML = list.map((m) => `
      <div class="mu">
        <div class="mu-hands">${cardsHTML(m.hero)} <span class="vs">vs</span> ${cardsHTML(m.villain)}${m.board ? ` <span class="vs">on</span> ${cardsHTML(m.board)}` : ""}</div>
        <div class="mu-name">${m.name}</div>
        <div class="mu-bar"><div style="width:${m.equity * 100}%"></div></div>
        <div class="mu-pct"><b>${(m.equity * 100).toFixed(1)}%</b><span>${(100 - m.equity * 100).toFixed(1)}%</span></div>
        <div class="mu-note">${m.note}</div>
      </div>`).join("");
  }
  if (window.PokerMatchups) {
    renderMatchups(PokerMatchups.preflop, "mPreflop");
    renderMatchups(PokerMatchups.flop, "mFlop");
    if (PokerMatchups.multiway) {
      $("mMultiway").innerHTML = `<tr><th>Hand</th>${[1, 2, 3, 4, 5].map((n) => `<th>vs ${n}</th>`).join("")}</tr>` +
        PokerMatchups.multiway.map((m) => `<tr><td>${m.hand.map(cardHTML).join("")}</td>${m.vs.map((v) =>
          `<td style="background:hsla(${Math.round(v * 140)},65%,42%,0.55)">${Math.round(v * 100)}%</td>`).join("")}</tr>`).join("");
    }
  }

  sync();
})();
