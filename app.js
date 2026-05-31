const { useState, useCallback, useMemo } = React;

// ─── Tile Definitions ─────────────────────────────────────────────────────────
const SUITS = ["man", "pin", "sou"];
const HONORS = ["East", "South", "West", "North", "Haku", "Hatsu", "Chun"];
const WINDS = ["East", "South", "West", "North"];
const DRAGONS = ["Haku", "Hatsu", "Chun"];

const TILE_UNICODE = {
  man1: "./assets/numbers1.png", man2: "./assets/numbers2.png", man3: "./assets/numbers3.png", man4: "./assets/numbers4.png", man5: "./assets/numbers5.png", man6: "./assets/numbers6.png", man7: "./assets/numbers7.png", man8: "./assets/numbers8.png", man9: "./assets/numbers9.png",
  pin1: "./assets/dots1.png", pin2: "./assets/dots2.png", pin3: "./assets/dots3.png", pin4: "./assets/dots4.png", pin5: "./assets/dots5.png", pin6: "./assets/dots6.png", pin7: "./assets/dots7.png", pin8: "./assets/dots8.png", pin9: "./assets/dots9.png",
  sou1: "./assets/bamboo1.png", sou2: "./assets/bamboo2.png", sou3: "./assets/bamboo3.png", sou4: "./assets/bamboo4.png", sou5: "./assets/bamboo5.png", sou6: "./assets/bamboo6.png", sou7: "./assets/bamboo7.png", sou8: "./assets/bamboo8.png", sou9: "./assets/bamboo9.png",
  East: "./assets/winds_east.png", South: "./assets/winds_south.png", West: "./assets/winds_west.png", North: "./assets/winds_north.png", Haku: "./assets/dragons_white.png", Hatsu: "./assets/dragons_green.png", Chun: "./assets/dragons_red.png",
};

const TILE_COLORS = {
  man: "#e05252",
  pin: "#3b9eff",
  sou: "#00c896",
  honor: "#b09fff",
};

const TILE_BG = {
  man: "#ffbfbf",
  pin: "#d0e7ff",
  sou: "#c0feef",
  honor: "#c9bbff",
};

function tileKey(suit, num) {
  if (suit === "honor") return HONORS[num - 1];
  return `${suit}${num}`;
}
function tileLabel(suit, num) {
  if (suit === "honor") return HONORS[num - 1];
  return `${num}${suit[0]}`;
}
function isTerminal(suit, num) { return suit !== "honor" && (num === 1 || num === 9); }
function isHonor(suit) { return suit === "honor"; }
function isTerminalOrHonor(suit, num) { return isTerminal(suit, num) || isHonor(suit); }

// ─── Hand Solving ─────────────────────────────────────────────────────────────
function decompose(tiles) {
  if (tiles.length === 0) return [{ pair: null, melds: [] }];
  const results = [];
  _decompose(tiles, null, [], results);
  return results;
}

function _decompose(tiles, pair, melds, results) {
  if (results.length >= 32) return; // early exit — more than enough decompositions
  if (tiles.length === 0) { results.push({ pair, melds: [...melds] }); return; }
  const sorted = [...tiles].sort(tileSort);
  const first = sorted[0];

  // Try triplet with first tile
  const triIdx = findNInSorted(sorted, first, 3);
  if (triIdx.length === 3) {
    const rem = removeIndices(sorted, triIdx);
    melds.push({ type: "tri", tiles: [first, first, first], open: false });
    _decompose(rem, pair, melds, results);
    melds.pop();
  }

  // Try sequence starting with first tile
  if (first.suit !== "honor" && first.num <= 7) {
    const second = { suit: first.suit, num: first.num + 1 };
    const third  = { suit: first.suit, num: first.num + 2 };
    const i2 = findInSorted(sorted, second, 0);
    const i3 = findInSorted(sorted, third, 0);
    if (i2 !== -1 && i3 !== -1) {
      const rem = removeIndices(sorted, [0, i2, i3]);
      melds.push({ type: "seq", tiles: [first, second, third], open: false });
      _decompose(rem, pair, melds, results);
      melds.pop();
    }
  }

  // Try pair — iterate all unique tiles (not just first) to allow backtracking
  if (pair === null) {
    const tried = new Set();
    for (let i = 0; i < sorted.length; i++) {
      const candidate = sorted[i];
      const ck = `${candidate.suit}|${candidate.num}`;
      if (tried.has(ck)) continue;
      tried.add(ck);
      const pairIdx = findNInSorted(sorted, candidate, 2);
      if (pairIdx.length === 2) {
        const rem = removeIndices(sorted, pairIdx);
        _decompose(rem, { tiles: [candidate, candidate] }, melds, results);
      }
    }
  }
}

function tileSort(a, b) {
  const o = { man:0, pin:1, sou:2, honor:3 };
  return o[a.suit] !== o[b.suit] ? o[a.suit] - o[b.suit] : a.num - b.num;
}
function tilesEqual(a, b) { return a.suit === b.suit && a.num === b.num; }

function findNInSorted(sorted, tile, n) {
  const indices = [];
  for (let i = 0; i < sorted.length && indices.length < n; i++)
    if (tilesEqual(sorted[i], tile)) indices.push(i);
  return indices.length === n ? indices : [];
}
function findInSorted(sorted, tile, skip = 0) {
  let found = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (tilesEqual(sorted[i], tile)) { if (found === skip) return i; found++; }
  }
  return -1;
}
function removeIndices(arr, indices) {
  const set = new Set(indices);
  return arr.filter((_, i) => !set.has(i));
}

// ─── Yaku Detection ───────────────────────────────────────────────────────────
function detectYaku(tiles, seatWind = "East", roundWind = "East", declaredKans = [], isClosed = true) {
  // BUG-M fix: only a completed 14-tile hand can have yaku. Previously 13-tile hands
  // were allowed through, and because isSevenPairs / isThirteenOrphans return true at
  // 13 tiles (they double as tenpai checks), a 13-tile chiitoi/kokushi *tenpai* hand
  // was reported as a detected yaku — making the UI show "✅ Yaku Detected" and a full
  // score for an unfinished hand. Tenpai info comes from getTenpaiTiles (which passes
  // 14-tile test hands here), so this branch never needs to fire on 13 tiles.
  if (tiles.length !== 14) return [];

  // Thirteen orphans can never also be a standard or seven-pairs hand, so it's safe to
  // return it immediately.
  if (isThirteenOrphans(tiles)) return ["Thirteen Orphans"];

  // BUG-Q fix: a hand can be BOTH seven pairs (chiitoi) and a standard hand — the
  // classic case is 11223 3m / 44556 6p / 99s, which reads as chiitoi (2 han) OR
  // ryanpeikou (3 han). Standard rules score the higher interpretation. Previously the
  // seven-pairs branch returned early and shadowed the higher standard reading. Now
  // chiitoi is just one candidate interpretation, compared by han like the rest (BUG-P).
  const candidates = [];
  if (isSevenPairs(tiles)) {
    const sp = ["Seven Pairs"];
    if (isTsuuiisou(tiles)) sp.push("All Honors");
    candidates.push(sp);
  }

  const valid = decompose([...tiles]).filter(d => d.pair && d.melds.length === 4);
  for (const d of valid) {
    candidates.push(detectStandardYaku(tiles, d, seatWind, roundWind, declaredKans));
  }
  if (candidates.length === 0) return [];

  // BUG-P fix: a hand can parse multiple ways, and different parses expose different
  // yaku (e.g. one decomposition reads as Twin Sequences, another as Three Suit
  // Sequences). The old code only scored valid[0]. Evaluate every candidate, total its
  // han for the current open/closed state, and keep the highest-scoring one. (Selecting
  // by max han also satisfies the "does any yaku exist?" question getTenpaiTiles relies
  // on, since a list containing a yaku has han >= 1.)
  let bestList = null, bestHan = -1;
  for (const list of candidates) {
    const han = list.reduce((s, y) => s + getYakuHan(y, isClosed), 0);
    if (han > bestHan) { bestHan = han; bestList = list; }
  }
  return bestList || [];
}

// Detects all yaku for one specific decomposition of a 14-tile hand. Tile-based yaku
// (flushes, tanyao, all-honors, …) don't depend on the parse but are evaluated here so
// the returned list keeps a consistent, stable ordering for display.
function detectStandardYaku(tiles, best, seatWind, roundWind, declaredKans) {
  const found = [];
  if (isTanyao(tiles)) found.push("All Simples");
  if (isToitoi(best)) found.push("All Triplets");
  if (isPinfu(best, seatWind, roundWind)) found.push("Pinfu");
  // BUG-01 fix: Ryanpeikou subsumes Iipeiko — they are mutually exclusive
  if (isRyanpeikou(best)) found.push("Double Twin Sequences");
  else if (isIipeiko(best)) found.push("Twin Sequences");
  if (isSanshokuDoujun(best)) found.push("Three Suit Sequences");
  if (isSanshokuDoukou(best)) found.push("Three Suit Triplets");
  if (isIttsuu(best)) found.push("Straight");
  // BUG-02 fix: Junchan implies Chanta — they are mutually exclusive
  if (isJunchan(best)) found.push("Full Outside Hand");
  else if (isChanta(best)) found.push("Half Outside Hand");
  // BUG-12 fix: Full Flush implies Half Flush — they are mutually exclusive.
  // isChiniiSou is a strict subset of isHoniiSou's tile patterns; without this
  // guard a pure single-suit hand would earn both +6 and +3 han simultaneously.
  if (isChiniiSou(tiles)) found.push("Full Flush");
  else if (isHoniiSou(tiles)) found.push("Half Flush");
  if (isSanankou(best)) found.push("Three Concealed Triplets");
  if (isShousangen(best)) found.push("Three Little Dragons");
  if (isDaisangen(best)) found.push("Three Big Dragons");
  if (isShousuushi(best)) found.push("Four Little Winds");
  if (isDaisuushi(best)) found.push("Four Big Winds");
  if (isTsuuiisou(tiles)) found.push("All Honors");
  if (isChinroutou(tiles)) found.push("All Terminals");
  if (isRyuuiisou(tiles)) found.push("All Green");
  if (isNineGates(tiles)) found.push("Nine Gates");
  if (isSuukantsu(declaredKans)) found.push("Four Kans"); // BUG-06 fix: uses declaredKans

  checkYakuhai(best, found, seatWind, roundWind);
  return found;
}

function checkYakuhai(decomp, found, seatWind, roundWind) {
  const windNums = { East:1, South:2, West:3, North:4 };
  const dragonNames = { 5:"Haku", 6:"Hatsu", 7:"Chun" };
  const seatNum = windNums[seatWind];
  const roundNum = windNums[roundWind];
  const honorTris = decomp.melds.filter(m =>
    (m.type === "tri" || m.type === "kan") && m.tiles[0].suit === "honor"
  );
  for (const meld of honorTris) {
    const num = meld.tiles[0].num;
    const name = HONORS[num - 1];
    // BUG-I fix: when seat wind === round wind (double-wind), a triplet of that wind
    // scores 2 han — one for seat wind yakuhai and one for round wind yakuhai. The old
    // `else if` meant only the seat-wind entry was pushed; the round-wind han was silently
    // dropped. Now both entries are pushed for a double-wind triplet.
    if (num === seatNum) {
      found.push(`Yakuhai (${name} — Seat Wind)`);
      if (num === roundNum) found.push(`Yakuhai (${name} — Round Wind)`);
    } else if (num === roundNum) {
      found.push(`Yakuhai (${name} — Round Wind)`);
    } else if (dragonNames[num]) { found.push(`Yakuhai (${name})`); }
  }
}

function isThirteenOrphans(tiles) {
  const req = [
    {suit:"man",num:1},{suit:"man",num:9},{suit:"pin",num:1},{suit:"pin",num:9},
    {suit:"sou",num:1},{suit:"sou",num:9},
    {suit:"honor",num:1},{suit:"honor",num:2},{suit:"honor",num:3},
    {suit:"honor",num:4},{suit:"honor",num:5},{suit:"honor",num:6},{suit:"honor",num:7},
  ];
  if (tiles.length < 13) return false;
  const rem = [...tiles];
  for (const r of req) {
    const idx = rem.findIndex(t => tilesEqual(t, r));
    if (idx === -1) return false;
    rem.splice(idx, 1);
  }
  return true;
}
function isSevenPairs(tiles) {
  if (tiles.length < 13 || tiles.length > 14) return false;
  const c = {};
  for (const t of tiles) { const k = `${t.suit}|${t.num}`; c[k] = (c[k]||0)+1; }
  const v = Object.values(c);
  // 14 tiles: exactly 7 pairs
  if (tiles.length === 14) return v.length === 7 && v.every(x => x === 2);
  // BUG-B fix: use Math.floor(count/2) so a quad (4 of a kind) counts as 2 pairs.
  // A hand like [A×4, B×2, C×2, D×2, E×2, F×2] (13 tiles, 6 types) is valid
  // chiitoi tenpai waiting on G — the old filter(x>=2) check missed this because it
  // had 0 singletons, failing the v.filter(x===1).length===1 guard.
  const pairsHeld = Object.values(c).reduce((s, x) => s + Math.floor(x / 2), 0);
  const singletons = Object.values(c).filter(x => x % 2 !== 0).length;
  return pairsHeld === 6 && singletons === 1;
}
function isTanyao(tiles) { return tiles.every(t => !isTerminalOrHonor(t.suit, t.num)); }
function isToitoi(d) { return d.melds.every(m => m.type === "tri" || m.type === "kan"); }
function isPinfu(d, seatWind, roundWind) {
  if (!d.pair) return false;
  const p = d.pair.tiles[0];
  // BUG-03 fix: ALL honor pairs (any wind or dragon) disqualify Pinfu —
  // not just yakuhai winds. No exception for non-yakuhai winds.
  if (isHonor(p.suit)) return false;
  // All melds must be sequences
  if (!d.melds.every(m => m.type === "seq")) return false;
  // BUG-A fix: we cannot know which sequence was the tenpai-completing one without a
  // winningTile parameter. Conservatively require ALL sequences to be ryanmen-eligible
  // (neither end at 1 or 9), accepting occasional false negatives rather than false
  // positives. A hand like 234 456 678 789 will not be awarded Pinfu via the 789 end.
  return d.melds.every(m => {
    const lo = m.tiles[0].num;
    const hi = m.tiles[2].num;
    return lo !== 1 && hi !== 9;
  });
}
function isIipeiko(d) {
  const s = d.melds.filter(m => m.type === "seq");
  for (let i = 0; i < s.length; i++)
    for (let j = i+1; j < s.length; j++)
      if (seqEq(s[i],s[j])) return true;
  return false;
}
function isRyanpeikou(d) {
  const s = d.melds.filter(m => m.type === "seq");
  if (s.length < 4) return false;
  const used = new Set(); let pairs = 0;
  for (let i = 0; i < s.length; i++) {
    if (used.has(i)) continue;
    for (let j = i+1; j < s.length; j++) {
      if (!used.has(j) && seqEq(s[i],s[j])) { used.add(i); used.add(j); pairs++; break; }
    }
  }
  return pairs === 2;
}
function seqEq(a,b) { return a.tiles[0].suit===b.tiles[0].suit && a.tiles[0].num===b.tiles[0].num; }
function isSanshokuDoujun(d) {
  const s = d.melds.filter(m => m.type === "seq");
  for (const x of s) {
    const n = x.tiles[0].num;
    const suits = new Set(s.filter(y => y.tiles[0].num===n).map(y => y.tiles[0].suit));
    if (suits.has("man")&&suits.has("pin")&&suits.has("sou")) return true;
  }
  return false;
}
function isSanshokuDoukou(d) {
  const t = d.melds.filter(m => m.type === "tri");
  for (const x of t) {
    const n = x.tiles[0].num;
    const suits = new Set(t.filter(y => y.tiles[0].num===n).map(y => y.tiles[0].suit));
    if (suits.has("man")&&suits.has("pin")&&suits.has("sou")) return true;
  }
  return false;
}
function isIttsuu(d) {
  const s = d.melds.filter(m => m.type === "seq");
  for (const suit of SUITS) {
    const ns = s.filter(x => x.tiles[0].suit===suit).map(x => x.tiles[0].num);
    if ([1,4,7].every(n => ns.includes(n))) return true;
  }
  return false;
}
function isChanta(d) {
  const all = d.pair ? [d.pair,...d.melds] : d.melds;
  return all.every(g => g.tiles.some(t => isTerminalOrHonor(t.suit,t.num)));
}
function isJunchan(d) {
  const all = d.pair ? [d.pair,...d.melds] : d.melds;
  return all.every(g => g.tiles.some(t => isTerminal(t.suit,t.num)));
}
function isHoniiSou(tiles) {
  const s = new Set(tiles.map(t => t.suit));
  return s.size===2 && s.has("honor") && [...s].some(x => x!=="honor");
}
function isChiniiSou(tiles) {
  const s = new Set(tiles.map(t => t.suit));
  return s.size===1 && (s.has("man")||s.has("pin")||s.has("sou"));
}
// BUG-11 (known limitation): if the winning tile completes the third triplet via ron,
// that triplet should be considered open (reducing this to only two concealed triplets).
// Correctly detecting this requires a winningTile parameter; deferred until that
// infrastructure is added alongside BUG-05 (wait-type fu). For now the check is
// conservative in the sense that it may grant Sanankou in the ron-on-third-triplet edge case.
function isSanankou(d) { return d.melds.filter(m => m.type === "tri" && !m.open).length >= 3; }
function isShousangen(d) {
  const dn = [5,6,7];
  const dt = d.melds.filter(m => m.type==="tri" && m.tiles[0].suit==="honor" && dn.includes(m.tiles[0].num));
  const dp = d.pair && d.pair.tiles[0].suit==="honor" && dn.includes(d.pair.tiles[0].num);
  return dt.length===2 && dp;
}
function isDaisangen(d) {
  return d.melds.filter(m => m.type==="tri" && m.tiles[0].suit==="honor" && [5,6,7].includes(m.tiles[0].num)).length===3;
}
function isShousuushi(d) {
  const wn=[1,2,3,4];
  const wt=d.melds.filter(m => m.type==="tri" && m.tiles[0].suit==="honor" && wn.includes(m.tiles[0].num));
  const wp=d.pair && d.pair.tiles[0].suit==="honor" && wn.includes(d.pair.tiles[0].num);
  return wt.length===3 && wp;
}
function isDaisuushi(d) {
  return d.melds.filter(m => m.type==="tri" && m.tiles[0].suit==="honor" && [1,2,3,4].includes(m.tiles[0].num)).length===4;
}
function isTsuuiisou(tiles) { return tiles.every(t => t.suit==="honor"); }
function isChinroutou(tiles) { return tiles.every(t => isTerminal(t.suit,t.num)); }
function isRyuuiisou(tiles) {
  const g = new Set(["sou2","sou3","sou4","sou6","sou8","Hatsu"]);
  return tiles.every(t => g.has(tileKey(t.suit,t.num)));
}
function isNineGates(tiles) {
  if (tiles.length !== 14) return false;
  const s = new Set(tiles.map(t => t.suit));
  if (s.size !== 1 || s.has("honor")) return false;
  // Build hand counts
  const counts = {};
  for (const t of tiles) counts[t.num] = (counts[t.num] || 0) + 1;
  // Base pattern requires: 1×3, 2-8×1, 9×3
  const base = { 1: 3, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 3 };
  let extras = 0;
  for (let n = 1; n <= 9; n++) {
    const have = counts[n] || 0;
    const need = base[n] || 0;
    if (have < need) return false;
    extras += have - need;
  }
  return extras === 1;
}
// Note: isSuukantsu requires kan-type melds which the decomposer doesn't produce.
// Kan declarations must be tracked separately and passed in via declaredKans.
// BUG-06 fix: removed isSuukantsu from detectYaku — it could never return true.
function isSuukantsu(declaredKans) { return declaredKans.length === 4; }


// ─── Tenpai ───────────────────────────────────────────────────────────────────
function getTenpaiTiles(tiles, sw, rw, isClosed = true) {
  if (tiles.length !== 13) return [];
  const all = [];
  for (const suit of SUITS) for (let n = 1; n <= 9; n++) all.push({ suit, num: n });
  for (let n = 1; n <= 7; n++) all.push({ suit: "honor", num: n });
  return all.filter(c => {
    // Can't draw a 5th copy — only 4 of each tile exist
    const alreadyHeld = tiles.filter(t => tilesEqual(t, c)).length;
    if (alreadyHeld >= 4) return false;
    const test = [...tiles, c];
    const yaku = detectYaku(test, sw, rw, [], isClosed);
    // BUG-C fix: isValidWinningHand returns true for any structurally complete hand,
    // even one with no yaku. In standard riichi a yakuless hand cannot win (unless
    // riichi is declared, which the analyzer cannot do on behalf of the user). Only
    // use the structural fallback for closed hands, where riichi/menzen-tsumo would
    // be available as implicit yaku.
    return yaku.length > 0 || (isClosed && isValidWinningHand(test));
  });
}
function isValidWinningHand(tiles) {
  if (tiles.length !== 14) return false;
  if (isThirteenOrphans(tiles)) return true;
  if (isSevenPairs(tiles)) return true;
  return decompose([...tiles]).some(d => d.pair && d.melds.length===4);
}

// ─── Fu Calculation ───────────────────────────────────────────────────────────
function calcFu(decomp, seatWind, roundWind, winType = "ron", isClosed = true) {
  if (!decomp || !decomp.pair) return 30;

  // Base fu: tsumo always starts at 20 (no menzen bonus on tsumo). Ron starts at 20
  // and only a CLOSED ron earns the +10 menzen-ron bonus (→30). An open ron does not.
  // BUG-N fix: previously this was a flat 30 for every ron, giving open ron the closed
  // bonus and inflating fu/score. Open all-sequence ron is floored to 30 below to match
  // common rules (an open hand cannot be pinfu, so it would otherwise drop to 20).
  let fu = winType === "tsumo" ? 20 : (isClosed ? 30 : 20);

  // Tsumo bonus (+2 fu) — applies to all tsumo wins except pinfu
  const hasPinfu = isPinfu(decomp, seatWind, roundWind);
  if (winType === "tsumo" && !hasPinfu) fu += 2;

  // Pair fu
  const pt = decomp.pair.tiles[0];
  if (pt.suit === "honor") {
    const hn = HONORS[pt.num - 1];
    if (DRAGONS.includes(hn) || hn === seatWind || hn === roundWind) fu += 2;
  }

  // Meld fu
  for (const meld of decomp.melds) {
    if (meld.type === "seq") continue;
    const t = meld.tiles[0];
    const isTerm = isTerminal(t.suit, t.num) || t.suit === "honor";
    const isOpen = meld.open === true;
    if (meld.type === "kan") {
      // Closed kan: simple=16, terminal/honor=32; Open kan: simple=8, terminal/honor=16
      fu += isTerm ? (isOpen ? 16 : 32) : (isOpen ? 8 : 16);
    } else {
      // Triplet (pon): closed simple=4, closed term/honor=8; open: halved
      const base = isTerm ? 8 : 4;
      fu += isOpen ? base / 2 : base;
    }
  }

  // BUG-05 fix: Wait-type fu (penchan +2, kanchan +2, tanki +2) requires knowing
  // the winning tile to determine which sequence or pair was completed. Without that
  // information the heuristic below produced false positives (adding +2 to hands
  // that had a ryanmen wait somewhere else, or to triplet-only hands via the seq guard).
  // Fu is omitted here and will only be accurate once a winningTile parameter is
  // added to calcFu. The rounded-up result remains playable as a conservative estimate.

  // BUG-N fix (kuipinfu floor): an open ron with all sequences and no triplet/pair fu
  // would otherwise land at 20 base fu. Common rules floor this open "pinfu-shape" ron
  // to 30 fu (an open hand cannot claim Pinfu itself, but isn't paid as 20 either).
  if (winType === "ron" && !isClosed) {
    const allSeq = decomp.melds.every(m => m.type === "seq");
    if (allSeq && fu === 20) fu = 30;
  }

  return Math.ceil(fu / 10) * 10;
}

// ─── Dora ─────────────────────────────────────────────────────────────────────
function getDoraTile(ind) {
  if (ind.suit==="honor") {
    if (ind.num<=4) return {suit:"honor", num: ind.num===4 ? 1 : ind.num+1};
    return {suit:"honor", num: ind.num===7 ? 5 : ind.num+1};
  }
  return {suit:ind.suit, num: ind.num===9 ? 1 : ind.num+1};
}
function countDora(hand, indicators, redFives) {
  let c = 0;
  const doras = indicators.map(getDoraTile);
  for (const t of hand) {
    for (const d of doras) if (tilesEqual(t,d)) c++;
    if (redFives && t.num===5 && t.suit!=="honor") c++;
  }
  return c;
}

// ─── Proximity Scoring ────────────────────────────────────────────────────────
function countMap(tiles) {
  const m={};
  for (const t of tiles) { const k=`${t.suit}|${t.num}`; m[k]=(m[k]||0)+1; }
  return m;
}
function overlapCount(tiles, target) {
  const pool=[...tiles]; let c=0;
  for (const t of target) { const i=pool.findIndex(p=>tilesEqual(p,t)); if(i!==-1){pool.splice(i,1);c++;} }
  return c;
}
function standardShanten(tiles) {
  const sorted=[...tiles].sort(tileSort); let best=8;
  const tried=new Set();
  best=Math.min(best, shantenNoPair(sorted,false));
  for (let i=0;i<sorted.length;i++) {
    const pt=sorted[i], pk=`${pt.suit}|${pt.num}`;
    if (tried.has(pk)) continue;
    if (sorted.filter(t=>tilesEqual(t,pt)).length<2) continue;
    tried.add(pk);
    const rem=[...sorted];
    rem.splice(rem.findIndex(t=>tilesEqual(t,pt)),1);
    rem.splice(rem.findIndex(t=>tilesEqual(t,pt)),1);
    best=Math.min(best, shantenNoPair(rem,true));
  }
  return best;
}
function shantenNoPair(tiles, hasPair) {
  const suits={man:[],pin:[],sou:[],honor:[]};
  for (const t of tiles) suits[t.suit].push(t.num);
  for (const s of Object.keys(suits)) suits[s].sort((a,b)=>a-b);
  let mentsu=0, partial=0;
  for (const suit of ["man","pin","sou"]) { const [m,p]=countSuitMentsu(suits[suit]); mentsu+=m; partial+=p; }
  const hc={};
  for (const n of suits.honor) hc[n]=(hc[n]||0)+1;
  for (const c of Object.values(hc)) { if(c>=3) mentsu++; else if(c>=2) partial++; }
  if (mentsu+partial>4) partial=4-mentsu;
  return 8-2*mentsu-partial-(hasPair?1:0);
}
function countSuitMentsu(nums) {
  if (!nums.length) return [0,0];
  let best=[0,0];
  function dp(arr,m,p) {
    if (!arr.length) { if(m>best[0]||(m===best[0]&&p>best[1])) best=[m,p]; return; }
    const n=arr[0];
    if (arr.filter(x=>x===n).length>=3) { const r=[...arr];[0,1,2].forEach(()=>r.splice(r.indexOf(n),1)); dp(r,m+1,p); }
    if (arr.includes(n+1)&&arr.includes(n+2)) { const r=[...arr];[n,n+1,n+2].forEach(v=>r.splice(r.indexOf(v),1)); dp(r,m+1,p); }
    if (arr.filter(x=>x===n).length>=2) { const r=[...arr];[0,1].forEach(()=>r.splice(r.indexOf(n),1)); dp(r,m,p+1); }
    if (arr.includes(n+1)) { const r=[...arr];[n,n+1].forEach(v=>r.splice(r.indexOf(v),1)); dp(r,m,p+1); }
    if (arr.includes(n+2)) { const r=[...arr];[n,n+2].forEach(v=>r.splice(r.indexOf(v),1)); dp(r,m,p+1); }
    dp(arr.slice(1),m,p);
  }
  dp(nums,0,0); return best;
}
function sevenPairsShanten(tiles) {
  const c=countMap(tiles);
  return 6-Object.values(c).filter(x=>x>=2).length;
}
function thirteenOrphansShanten(tiles) {
  const term=[
    {suit:"man",num:1},{suit:"man",num:9},{suit:"pin",num:1},{suit:"pin",num:9},
    {suit:"sou",num:1},{suit:"sou",num:9},
    {suit:"honor",num:1},{suit:"honor",num:2},{suit:"honor",num:3},
    {suit:"honor",num:4},{suit:"honor",num:5},{suit:"honor",num:6},{suit:"honor",num:7},
  ];
  const have=term.filter(t=>tiles.some(h=>tilesEqual(h,t))).length;
  const hasPair=term.some(t=>tiles.filter(h=>tilesEqual(h,t)).length>=2);
  return 13-have-(hasPair?1:0);
}

function getYakuhaiInfo() {
  return { hanClosed:1, hanOpen:1, freq:"Frequent", desc:"A triplet of dragons, your seat wind, or the round wind.", closedOnly:false };
}

function yakuProximity(name, tiles, sw, rw) {
  if (name.startsWith("Yakuhai")) {
    const windNums={East:1,South:2,West:3,North:4};
    const dragonNums={Haku:5,Hatsu:6,Chun:7};
    let targetNum=null;
    for (const [w,n] of Object.entries(windNums)) if(name.includes(w)){targetNum=n;break;}
    if (targetNum===null) for (const [d,n] of Object.entries(dragonNums)) if(name.includes(d)){targetNum=n;break;}
    if (targetNum===null) return 99;
    const have=tiles.filter(t=>t.suit==="honor"&&t.num===targetNum).length;
    // Proximity = tiles still needed to complete the triplet only.
    // The rest of the hand is unconstrained, so we don't add whole-hand shanten.
    return Math.max(0, 3 - have);
  }
  switch(name) {
    case "Thirteen Orphans": return thirteenOrphansShanten(tiles);
    case "Seven Pairs": return sevenPairsShanten(tiles);
    case "All Simples": {
      // BUG-O fix: same double-count class as D–H. The old code ran standardShanten on
      // the full hand AND added the terminal/honor count on top. Mirror the All Honors
      // pattern: take shanten of just the simples (2–8), then add the count of
      // off-target (terminal/honor) tiles that must be replaced.
      const isSimple = t => !isTerminalOrHonor(t.suit, t.num);
      const off = tiles.filter(t => !isSimple(t)).length;
      return Math.max(0, standardShanten(tiles.filter(isSimple)) + off);
    }
    case "All Triplets": {
      // Need 4 triplets + 1 pair = 14 tiles total
      const c = countMap(tiles); let trips = 0, pairs = 0;
      for (const v of Object.values(c)) { if (v >= 3) trips++; else if (v >= 2) pairs++; }
      // Need 4 triplets and a pair; pair can come from leftover after 4 triplets
      const needTrips = Math.max(0, 4 - trips);
      const hasPair = pairs > 0 || trips > 4;
      return Math.max(0, needTrips * 2 + (hasPair ? 0 : 1));
    }
    case "Pinfu": {
      // BUG-09 fix: each triplet costs ~1 extra swap to become a sequence,
      // each honor tile must be removed (costs 1). Both were previously
      // double-counted or divided by incorrect factors.
      const c = countMap(tiles);
      const tripletPenalty = Object.values(c).filter(v => v >= 3).length;
      const honorPenalty = tiles.filter(t => isHonor(t.suit)).length;
      return Math.max(0, standardShanten(tiles) + tripletPenalty + honorPenalty);
    }
    case "Twin Sequences": {
      // Need two copies of the same sequence, plus a valid hand around them.
      // For each candidate sequence, count how many tiles of it we already have (capped at 6 for two copies).
      // Cost = tiles still needed for the two copies + shanten of remaining tiles.
      let best = 99;
      for (const suit of SUITS) {
        for (let s = 1; s <= 7; s++) {
          const seq = [s, s+1, s+2].map(n => ({ suit, num: n }));
          // Count how many of the 6 tiles (2x seq) we have
          const pool = [...tiles];
          let have = 0;
          for (const t of [...seq, ...seq]) {
            const i = pool.findIndex(p => tilesEqual(p, t));
            if (i !== -1) { pool.splice(i, 1); have++; }
          }
          const need = 6 - have;
          const rem = pool; // tiles not used by the two sequences
          best = Math.min(best, need + standardShanten(rem));
        }
      }
      return Math.max(0, best);
    }
    case "Half Flush": {
      let best=99;
      for(const suit of SUITS){const st=tiles.filter(t=>t.suit===suit||t.suit==="honor");const off=tiles.length-st.length;best=Math.min(best,standardShanten(st)+off);}
      return Math.max(0,best);
    }
    case "Full Flush": {
      let best=99;
      for(const suit of SUITS){const st=tiles.filter(t=>t.suit===suit);const off=tiles.length-st.length;best=Math.min(best,standardShanten(st)+off);}
      return Math.max(0,best);
    }
    case "All Honors": {const nh=tiles.filter(t=>!isHonor(t.suit)).length;return Math.max(0,standardShanten(tiles.filter(t=>isHonor(t.suit)))+nh);}
    case "All Terminals": {const nt=tiles.filter(t=>!isTerminal(t.suit,t.num)).length;return Math.max(0,standardShanten(tiles.filter(t=>isTerminal(t.suit,t.num)))+nt);}
    // BUG-K fix: Terminals and Honors was in YAKU_INFO but had no proximity case and
    // was not in buildProximityList, so it never appeared. Added both here and above.
    case "Terminals and Honors": {
      const nonTH = tiles.filter(t => !isTerminalOrHonor(t.suit, t.num)).length;
      return Math.max(0, standardShanten(tiles.filter(t => isTerminalOrHonor(t.suit, t.num))) + nonTH);
    }
    case "All Green": {
      const gk=new Set(["sou|2","sou|3","sou|4","sou|6","sou|8","honor|6"]);
      const ng=tiles.filter(t=>!gk.has(`${t.suit}|${t.num}`)).length;
      return Math.max(0,standardShanten(tiles.filter(t=>gk.has(`${t.suit}|${t.num}`)))+ng);
    }
    case "Nine Gates": {
      let best=99;
      for(const suit of SUITS){
        const base=[1,1,1,2,3,4,5,6,7,8,9,9,9].map(n=>({suit,num:n}));
        const st=tiles.filter(t=>t.suit===suit);const off=tiles.filter(t=>t.suit!==suit).length;
        best=Math.min(best,(13-overlapCount(st,base))+off);
      }
      return Math.max(0,best);
    }
    case "Three Big Dragons": {
      // BUG-13 fix: compute shanten only on tiles not consumed by dragon triplets.
      const c={};
      tiles.filter(t=>t.suit==="honor"&&[5,6,7].includes(t.num)).forEach(t=>c[t.num]=(c[t.num]||0)+1);
      const dragonNeed = [5,6,7].reduce((a,n)=>a+Math.max(0,3-(c[n]||0)),0);
      // Remove allocated dragon tiles from the pool before computing shanten
      const pool = [...tiles];
      for (const dn of [5,6,7]) {
        const take = Math.min(c[dn]||0, 3);
        for (let i=0;i<take;i++) { const idx=pool.findIndex(t=>t.suit==="honor"&&t.num===dn); if(idx!==-1) pool.splice(idx,1); }
      }
      return Math.max(0, dragonNeed + standardShanten(pool));
    }
    case "Four Big Winds": {
      // BUG-E fix: same double-count class as BUG-D. Allocate wind triplet tiles out
      // of the pool before calling standardShanten on the remainder (which just needs
      // to form a pair — the only unconstrained group for this yakuman).
      const c = {};
      tiles.filter(t => t.suit === "honor" && [1,2,3,4].includes(t.num))
           .forEach(t => c[t.num] = (c[t.num] || 0) + 1);
      let need = 0;
      const pool = [...tiles];
      for (const w of [1,2,3,4]) {
        const have = c[w] || 0;
        need += Math.max(0, 3 - have);
        for (let i = 0; i < Math.min(have, 3); i++) {
          const idx = pool.findIndex(t => t.suit === "honor" && t.num === w);
          if (idx !== -1) pool.splice(idx, 1);
        }
      }
      // Remaining tiles just need to form a pair
      const pairShanten = Object.values(countMap(pool)).some(v => v >= 2) ? 0 : 1;
      return Math.max(0, need + pairShanten);
    }
    case "Four Little Winds": {
      // BUG-13 fix: `best` already counts the tiles needed to complete the wind requirements.
      // Adding standardShanten(tiles) of the full hand double-counts that work.
      // Instead, compute shanten only on the tiles NOT consumed by the wind groups.
      // Need 3 wind triplets + 1 wind pair — try each wind as the pair candidate.
      const c = {};
      tiles.filter(t => t.suit === "honor" && [1,2,3,4].includes(t.num))
           .forEach(t => c[t.num] = (c[t.num] || 0) + 1);
      let best = 99;
      for (const pairWind of [1,2,3,4]) {
        let need = 0;
        // Build the pool of tiles left after allocating wind groups
        const pool = [...tiles];
        const allocate = (num, count) => {
          for (let i = 0; i < count; i++) {
            const idx = pool.findIndex(t => t.suit === "honor" && t.num === num);
            if (idx !== -1) pool.splice(idx, 1);
          }
        };
        for (const w of [1,2,3,4]) {
          const have = c[w] || 0;
          if (w === pairWind) {
            need += Math.max(0, 2 - have);
            allocate(w, Math.min(have, 2));
          } else {
            need += Math.max(0, 3 - have);
            allocate(w, Math.min(have, 3));
          }
        }
        best = Math.min(best, need + standardShanten(pool));
      }
      return Math.max(0, best);
    }
    case "Three Little Dragons": {
      // BUG-D fix: mirror BUG-13 / Four Little Winds pattern — allocate the best
      // dragon configuration tiles out of a pool, then call standardShanten only on
      // the remainder. The old code added `need` (dragon tile deficit) ON TOP of
      // standardShanten(tiles) for the whole hand, double-counting that work.
      const c = {};
      tiles.filter(t => t.suit === "honor" && [5,6,7].includes(t.num))
           .forEach(t => c[t.num] = (c[t.num] || 0) + 1);
      let best = 99;
      for (const pairDragon of [5, 6, 7]) {
        let need = 0;
        const pool = [...tiles];
        const allocate = (num, count) => {
          for (let i = 0; i < count; i++) {
            const idx = pool.findIndex(t => t.suit === "honor" && t.num === num);
            if (idx !== -1) pool.splice(idx, 1);
          }
        };
        for (const d of [5, 6, 7]) {
          const have = c[d] || 0;
          const want = d === pairDragon ? 2 : 3;
          need += Math.max(0, want - have);
          allocate(d, Math.min(have, want));
        }
        best = Math.min(best, need + standardShanten(pool));
      }
      return Math.max(0, best);
    }
    case "Straight": {
      // BUG-G fix: after allocating the 9 straight tiles into the pool, call
      // standardShanten only on the remainder (the 4th meld + pair tiles), not the
      // full tile set. The old code also called standardShanten on the full unmodified
      // hand, inflating the score.
      let best = 99;
      for (const suit of SUITS) {
        const pool = [...tiles];
        let have = 0;
        for (let n = 1; n <= 9; n++) {
          const idx = pool.findIndex(t => t.suit === suit && t.num === n);
          if (idx !== -1) { pool.splice(idx, 1); have++; }
        }
        const need = 9 - have;
        best = Math.min(best, need + standardShanten(pool));
      }
      return Math.max(0, best);
    }
    case "Half Outside Hand": return Math.max(0,standardShanten(tiles)+Math.floor(tiles.filter(t=>!isTerminalOrHonor(t.suit,t.num)).length/3));
    case "Full Outside Hand": return Math.max(0,standardShanten(tiles)+Math.floor(tiles.filter(t=>!isTerminal(t.suit,t.num)).length/3));
    case "Three Suit Sequences": {
      // Need the same sequence (same starting number) in all three suits, plus a pair.
      let best = 99;
      for (let s = 1; s <= 7; s++) {
        const pool = [...tiles];
        let have = 0;
        for (const suit of SUITS) {
          for (const n of [s, s+1, s+2]) {
            const i = pool.findIndex(p => p.suit === suit && p.num === n);
            if (i !== -1) { pool.splice(i, 1); have++; }
          }
        }
        const need = 9 - have; // 3 sequences × 3 tiles
        const rem = pool;
        const pairShanten = rem.length >= 2
          ? (Object.values(countMap(rem)).some(v => v >= 2) ? 0 : 1)
          : 1;
        best = Math.min(best, need + pairShanten);
      }
      return Math.max(0, best);
    }
    case "Three Suit Triplets": {
      // BUG-F fix: remove the 9 matched triplet tiles from a pool copy before calling
      // standardShanten, so the remaining shanten is only for the unconstrained meld+pair.
      let best = 99;
      for (let n = 1; n <= 9; n++) {
        let need = 0;
        const pool = [...tiles];
        for (const suit of SUITS) {
          const have = tiles.filter(t => t.suit === suit && t.num === n).length;
          need += Math.max(0, 3 - have);
          for (let i = 0; i < Math.min(have, 3); i++) {
            const idx = pool.findIndex(t => t.suit === suit && t.num === n);
            if (idx !== -1) pool.splice(idx, 1);
          }
        }
        best = Math.min(best, need + standardShanten(pool));
      }
      return Math.max(0, best);
    }
    case "Three Concealed Triplets": {
      // BUG-H fix: the old estimate added standardShanten(tiles) on top of the tile-
      // need estimate, double-counting. Instead allocate the best 3 triplets (or
      // partials) from the pool and call standardShanten on what's left.
      const c = countMap(tiles);
      const entries = Object.entries(c).map(([k, v]) => ({ k, v })).sort((a,b) => b.v - a.v);
      const pool = [...tiles];
      let need = 0;
      let tripsFilled = 0;
      for (const { k, v } of entries) {
        if (tripsFilled >= 3) break;
        const [suit, numStr] = k.split("|");
        const num = parseInt(numStr);
        const take = Math.min(v, 3);
        need += Math.max(0, 3 - v);
        for (let i = 0; i < take; i++) {
          const idx = pool.findIndex(t => t.suit === suit && t.num === num);
          if (idx !== -1) pool.splice(idx, 1);
        }
        tripsFilled++;
      }
      return Math.max(0, need + standardShanten(pool));
    }
    case "Double Twin Sequences": {
      // Need two pairs of identical sequences (4 melds total), each pair being the same sequence.
      // Try every combination of two sequence types (same suit, can be same or different starting num).
      let best = 99;
      for (const suit of SUITS) {
        for (let s1 = 1; s1 <= 7; s1++) {
          for (let s2 = s1; s2 <= 7; s2++) {
            const seq1 = [s1, s1+1, s1+2].map(n => ({ suit, num: n }));
            const seq2 = [s2, s2+1, s2+2].map(n => ({ suit, num: n }));
            // Count tiles for 2x seq1 + 2x seq2 (12 tiles total)
            const pool = [...tiles];
            let have = 0;
            const want = [...seq1, ...seq1, ...seq2, ...seq2];
            for (const t of want) {
              const i = pool.findIndex(p => tilesEqual(p, t));
              if (i !== -1) { pool.splice(i, 1); have++; }
            }
            const need = want.length - have;
            // Remaining tiles must form a pair (2 tiles); approximate with what's left
            const rem = pool;
            const pairShanten = rem.length >= 2
              ? (Object.values(countMap(rem)).some(v => v >= 2) ? 0 : 1)
              : 1;
            best = Math.min(best, need + pairShanten);
          }
        }
      }
      return Math.max(0, best);
    }
    default: return standardShanten(tiles);
  }
}

function buildProximityList(sw, rw) {
  const base = [
    "Seven Pairs","All Simples","Pinfu","Twin Sequences","Double Twin Sequences","All Triplets",
    "Three Concealed Triplets",
    "Half Flush","Full Flush","Half Outside Hand","Full Outside Hand",
    "Straight","Three Suit Sequences","Three Suit Triplets",
    "All Honors","All Terminals","All Green","Terminals and Honors","Nine Gates","Thirteen Orphans",
    "Three Little Dragons","Three Big Dragons","Four Little Winds","Four Big Winds",
  ];
  const yakuhai = [
    `Yakuhai (${sw} — Seat Wind)`,
    ...(rw !== sw ? [`Yakuhai (${rw} — Round Wind)`] : []),
    "Yakuhai (Haku)","Yakuhai (Hatsu)","Yakuhai (Chun)",
  ];
  return [...yakuhai, ...base];
}

function scoreAllYaku(tiles, sw, rw) {
  if (!tiles.length) return [];
  const list = buildProximityList(sw, rw);
  const awayList = list.map(name => yakuProximity(name, tiles, sw, rw));
  // BUG-07 fix: normalize against observed max so short-range yaku aren't misrepresented
  const maxAway = Math.max(...awayList, 1);
  return list.map((name, idx) => {
    const info = YAKU_INFO[name] || (name.startsWith("Yakuhai") ? getYakuhaiInfo() : { hanClosed:"?", freq:"Unusual", desc:"" });
    const away = awayList[idx];
    const progress = Math.max(0, Math.min(100, Math.round((1 - away / maxAway) * 100)));
    return { name, tilesAway:away, progress, achieved:away<=0, info };
  }).sort((a,b) => a.tilesAway-b.tilesAway || a.name.localeCompare(b.name));
}

// ─── Yaku Info ────────────────────────────────────────────────────────────────
const YAKU_INFO = {
  "Riichi":                   { hanClosed:1,  hanOpen:null, freq:"Frequent",   desc:"Declare tenpai on a closed hand.", closedOnly:true },
  "Ippatsu":                  { hanClosed:1,  hanOpen:null, freq:"Frequent",   desc:"Win before your next uninterrupted turn after Riichi.", closedOnly:true },
  "Menzen Tsumo":             { hanClosed:1,  hanOpen:null, freq:"Frequent",   desc:"Self-draw win on a fully closed hand.", closedOnly:true },
  "Double Riichi":            { hanClosed:2,  hanOpen:null, freq:"Rare",       desc:"Riichi declared on your very first uninterrupted turn.", closedOnly:true },
  "Pinfu":                    { hanClosed:1,  hanOpen:null, freq:"Frequent",   desc:"Four sequences, non-yakuhai pair, two-sided wait.", closedOnly:true },
  "Twin Sequences":           { hanClosed:1,  hanOpen:null, freq:"Frequent",   desc:"Same sequence twice in one suit.", closedOnly:true },
  "Double Twin Sequences":    { hanClosed:3,  hanOpen:null, freq:"Rare",       desc:"Two pairs of identical sequences.", closedOnly:true },
  "Nine Gates":               { hanClosed:13, hanOpen:null, freq:"Ultra Rare", desc:"1-1-1-2-3-4-5-6-7-8-9-9-9 of one suit plus any extra.", closedOnly:true, yakuman:true },
  "Thirteen Orphans":         { hanClosed:13, hanOpen:null, freq:"Very Rare",  desc:"One of each terminal/honor plus one duplicate.", closedOnly:true, yakuman:true },
  "All Simples":              { hanClosed:1,  hanOpen:1,    freq:"Frequent",   desc:"No terminals or honors in the hand." },
  "All Triplets":             { hanClosed:2,  hanOpen:2,    freq:"Unusual",    desc:"Four triplets plus a pair." },
  "Three Suit Sequences":     { hanClosed:2,  hanOpen:1,    freq:"Unusual",    desc:"Same sequence number in all three suits." },
  "Straight":                 { hanClosed:2,  hanOpen:1,    freq:"Unusual",    desc:"1-2-3, 4-5-6, and 7-8-9 of the same suit." },
  "Half Outside Hand":        { hanClosed:2,  hanOpen:1,    freq:"Unusual",    desc:"Every group contains a terminal or honor." },
  "Full Outside Hand":        { hanClosed:3,  hanOpen:2,    freq:"Rare",       desc:"Every group contains a terminal (no honors)." },
  "Half Flush":               { hanClosed:3,  hanOpen:2,    freq:"Frequent",   desc:"One suit plus honor tiles." },
  "Full Flush":               { hanClosed:6,  hanOpen:5,    freq:"Rare",       desc:"Entire hand is one suit, no honors." },
  "Three Suit Triplets":      { hanClosed:2,  hanOpen:2,    freq:"Rare",       desc:"Same triplet value in all three suits." },
  "Three Concealed Triplets": { hanClosed:2,  hanOpen:2,    freq:"Rare",       desc:"Three triplets must be self-drawn." },
  "Three Little Dragons":     { hanClosed:2,  hanOpen:2,    freq:"Rare",       desc:"Triplets of two dragons plus a pair of the third." },
  "Terminals and Honors":     { hanClosed:2,  hanOpen:2,    freq:"Rare",       desc:"Every tile is a terminal or honor." },
  "Three Kans":               { hanClosed:2,  hanOpen:2,    freq:"Ultra Rare", desc:"Three quads (kan) declared in one hand." },
  "Robbing a Kan":            { hanClosed:1,  hanOpen:1,    freq:"Rare",       desc:"Win by taking a tile added to an opponent's open kan." },
  "Under the River":          { hanClosed:1,  hanOpen:1,    freq:"Rare",       desc:"Win by ron on the very last discard." },
  "Under the Sea":            { hanClosed:1,  hanOpen:1,    freq:"Rare",       desc:"Win by tsumo on the very last draw." },
  "Dead Wall Victory":        { hanClosed:1,  hanOpen:1,    freq:"Rare",       desc:"Win by drawing from the dead wall after a kan." },
  "Mangan at Draw":           { hanClosed:5,  hanOpen:5,    freq:"Ultra Rare", desc:"Exhaustive draw; only honors/terminals in your discard." },
  "Seven Pairs":              { hanClosed:2,  hanOpen:null, freq:"Unusual",    desc:"Seven different pairs.", closedOnly:true },
  "Three Big Dragons":        { hanClosed:13, hanOpen:13,   freq:"Ultra Rare", desc:"Triplets of all three dragons.", yakuman:true },
  "Four Little Winds":        { hanClosed:13, hanOpen:13,   freq:"Ultra Rare", desc:"Three wind triplets plus a pair of the fourth.", yakuman:true },
  "Four Big Winds":           { hanClosed:13, hanOpen:13,   freq:"Ultra Rare", desc:"Triplets of all four wind tiles.", yakuman:true },
  "All Honors":               { hanClosed:13, hanOpen:13,   freq:"Ultra Rare", desc:"Entire hand is honor tiles only.", yakuman:true },
  "All Terminals":            { hanClosed:13, hanOpen:13,   freq:"Ultra Rare", desc:"Entire hand is terminal tiles only.", yakuman:true },
  "All Green":                { hanClosed:13, hanOpen:13,   freq:"Ultra Rare", desc:"Only 2/3/4/6/8 sou and/or Hatsu.", yakuman:true },
  "Four Kans":                { hanClosed:13, hanOpen:13,   freq:"Ultra Rare", desc:"Four quads declared in one hand.", yakuman:true },
  "Four Concealed Triplets":  { hanClosed:13, hanOpen:null, freq:"Very Rare",  desc:"All four triplets are self-drawn.", closedOnly:true, yakuman:true },
  "Blessing of Heaven":       { hanClosed:13, hanOpen:null, freq:"Ultra Rare", desc:"Dealer wins on the first draw.", closedOnly:true, yakuman:true },
  "Blessing of Earth":        { hanClosed:13, hanOpen:null, freq:"Ultra Rare", desc:"Non-dealer wins on their very first draw.", closedOnly:true, yakuman:true },
};

// ─── Score Calculation ────────────────────────────────────────────────────────
const YAKUMAN_PTS = { nonDealerRon:32000, dealerRon:48000, label:"Yakuman" };

function hanToPoints(han, fu=30) {
  // BUG-10 fix: include tsumo payment breakdowns alongside ron values.
  // Non-dealer tsumo: tsumoNonDealerEach (×2 opponents) + tsumoNonDealerDealer (×1 dealer).
  // Dealer tsumo: tsumoDealer (×3 non-dealers each).
  if (han>=13) return { nonDealerRon:32000, dealerRon:48000,
    tsumoDealer:16000, tsumoNonDealerEach:8000, tsumoNonDealerDealer:16000, label:"Yakuman" };
  if (han>=11) return { nonDealerRon:24000, dealerRon:36000,
    tsumoDealer:12000, tsumoNonDealerEach:6000, tsumoNonDealerDealer:12000, label:"Triple Mangan" };
  if (han>=8)  return { nonDealerRon:16000, dealerRon:24000,
    tsumoDealer:8000,  tsumoNonDealerEach:4000, tsumoNonDealerDealer:8000,  label:"Double Mangan" };
  if (han>=5)  return { nonDealerRon:8000,  dealerRon:12000,
    tsumoDealer:4000,  tsumoNonDealerEach:2000, tsumoNonDealerDealer:4000,  label:"Mangan" };
  const basic = fu*Math.pow(2,han+2);
  if (basic>=2000) return { nonDealerRon:8000, dealerRon:12000,
    tsumoDealer:4000,  tsumoNonDealerEach:2000, tsumoNonDealerDealer:4000,  label:"Mangan" };
  const tsumoNonDealerEach   = Math.ceil(basic*2/100)*100;
  const tsumoNonDealerDealer = Math.ceil(basic*4/100)*100;
  const tsumoDealer          = Math.ceil(basic*2/100)*100;
  return {
    nonDealerRon: Math.ceil(basic*4/100)*100,
    dealerRon:    Math.ceil(basic*6/100)*100,
    tsumoDealer, tsumoNonDealerEach, tsumoNonDealerDealer,
    label: null,
  };
}
function formatPts(pts) {
  if (pts>=1000) return (pts/1000).toFixed(pts%1000===0?0:1)+"k";
  return pts.toString();
}
function getScoreDisplay(info, isClosed) {
  const han = isClosed ? info.hanClosed : info.hanOpen;
  if (han===null) return null;
  if (info.yakuman) return { label:"Yakuman", nonDealerRon: formatPts(32000), dealerRon: formatPts(48000), han:"役満", color:"#e84393" };
  const pts = hanToPoints(han);
  return { label:pts.label, han, nonDealerRon:formatPts(pts.nonDealerRon), dealerRon:formatPts(pts.dealerRon),
           color: pts.label==="Mangan"?"#fdcb6e":pts.label?"#e84393":null };
}
function getYakuHan(name, isClosed) {
  const info = YAKU_INFO[name] || (name.startsWith("Yakuhai") ? getYakuhaiInfo() : null);
  if (!info) return 0;
  if (info.yakuman) return 13;
  return isClosed ? (info.hanClosed||0) : (info.hanOpen||0);
}

const FREQ_COLORS = {
  "Frequent":"#00c896","Unusual":"#3b9eff","Rare":"#e17055","Very Rare":"#d63031","Ultra Rare":"#b09fff",
};

// ─── UI Components ────────────────────────────────────────────────────────────

function MahjongTile({ suit, num, selected, onClick, small, isDora }) {
  const key = tileKey(suit, num);
  const src = TILE_UNICODE[key];
  const color = TILE_COLORS[suit] || TILE_COLORS.honor;
  const imgSize = small ? 36 : 48;

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="tile-btn"
      style={{
        width: imgSize, height: imgSize,
        border: selected ? `2px solid ${color}` : isDora ? `2px solid #ffd166` : `2px solid transparent`,
        background: "none",
        boxShadow: selected ? `0 0 10px ${color}55` : isDora ? `0 0 8px #ffd16655` : "none",
        borderRadius: 4,
        padding: 0,
      }}
      title={tileLabel(suit, num)}
    >
      <img src={src} alt={key} style={{ width: imgSize, height: imgSize, objectFit: "contain", display: "block" }} />
    </button>
  );
}

function TileWithBadge({ suit, num, count, badgeColor, onAdd, small }) {
  return (
    <div style={{ position:"relative" }}>
      <MahjongTile suit={suit} num={num} small={small}
        onClick={count>=4 ? undefined : ()=>onAdd(suit,num)} />
      {count>0 && <div className="tile-count-badge" style={{background:badgeColor}}>{count}</div>}
    </div>
  );
}

function SuitSection({ label, suit, onAdd, handCount }) {
  const color = TILE_COLORS[suit]||TILE_COLORS.honor;
  return (
    <div className="suit-section">
      <div className="suit-label">{label}</div>
      <div className="tile-row">
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <TileWithBadge key={n} suit={suit} num={n}
            count={handCount(suit,n)} badgeColor={color} onAdd={onAdd} small />
        ))}
      </div>
    </div>
  );
}

function ScoreBadge({ type, han, score, isYakuman }) {
  if (type==="invalid") return (
    <div className="score-badge ib">
      <span style={{color:"#4a3d5e",fontWeight:700}}>OPEN</span>
      <span style={{color:"#3a2e55"}}>invalid</span>
    </div>
  );
  const lc = type==="closed" ? "#9b8eff" : "#3b9eff";
  return (
    <div className={`score-badge ${type==="closed"?"cb":"ob"}`}>
      <span style={{fontSize:8,color:lc,fontWeight:800}}>{type==="closed"?"CLOSED":"OPEN"}</span>
      <span style={{fontWeight:800,color:lc}}>{isYakuman?"役満":`${han}✦`}</span>
      <span style={{color:"#605078"}}>·</span>
      <span style={{fontWeight:700,color:score.color||"#ece7ff"}}>
        {score.label?`${score.label} `:""}{score.nonDealerRon}
      </span>
      <span style={{fontSize:8,color:"#4d3f6a"}}>/{score.dealerRon}</span>
    </div>
  );
}

// Wind selector pill
function WindPill({ label, value, options, onChange, color }) {
  return (
    <div>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",color,fontFamily:"'Space Mono',monospace",textTransform:"uppercase",marginBottom:5}}>{label}</div>
      <div style={{display:"flex",gap:3}}>
        {options.map(opt => (
          <button key={opt} onClick={()=>onChange(opt)} style={{
            padding:"3px 7px", borderRadius:6,
            border:`1px solid ${value===opt ? color : "rgba(255,255,255,0.1)"}`,
            background: value===opt ? `${color}22` : "rgba(255,255,255,0.04)",
            color: value===opt ? color : "var(--text3)",
            cursor:"pointer", fontSize:10, fontWeight:700, fontFamily:"'Sora',sans-serif", transition:"all 0.15s",
          }}>
            {TILE_UNICODE[opt] && <img src={TILE_UNICODE[opt]} alt={opt} style={{width:12,height:12,objectFit:"contain",verticalAlign:"middle",marginRight:2}}/>}{opt[0]}
          </button>
        ))}
      </div>
    </div>
  );
}

// Dora panel
function DoraPanel({ doraIndicators, onAddDora, onRemoveDora, redFives, onToggleRedFives }) {
  const [adding, setAdding] = useState(false);
  // BUG-08 fix: collapse the picker immediately after a tile is selected
  const handleAddDora = (t) => { onAddDora(t); setAdding(false); };
  return (
    <div style={{marginTop:12,padding:"10px 12px",borderRadius:8,background:"rgba(255,209,102,0.04)",border:"1px solid rgba(255,209,102,0.15)"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.12em",color:"#ffd166",fontFamily:"'Space Mono',monospace",textTransform:"uppercase"}}>Dora Indicators</span>
        <button onClick={()=>setAdding(v=>!v)} style={{
          marginLeft:"auto",padding:"2px 8px",borderRadius:6,
          border:"1px solid rgba(255,209,102,0.3)",background:"rgba(255,209,102,0.08)",
          color:"#ffd166",cursor:"pointer",fontSize:10,fontWeight:700,fontFamily:"'Sora',sans-serif",
        }}>{adding?"Done":"+ Add"}</button>
      </div>

      {doraIndicators.length>0 && (
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
          {doraIndicators.map((ind,i)=>(
            <div key={i} style={{position:"relative"}}>
              <MahjongTile suit={ind.suit} num={ind.num} small isDora />
              <button onClick={()=>onRemoveDora(i)} style={{
                position:"absolute",top:-5,right:-5,width:14,height:14,borderRadius:"50%",
                border:"none",background:"#e05252",color:"#fff",cursor:"pointer",
                fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",
              }}>×</button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div style={{marginBottom:8}}>
          <div style={{fontSize:9,color:"var(--text3)",marginBottom:5}}>Select indicator tile:</div>
          {["man","pin","sou"].map(suit=>(
            <div key={suit} style={{display:"flex",gap:2,marginBottom:3}}>
              {[1,2,3,4,5,6,7,8,9].map(n=>(
                <button key={n} onClick={()=>handleAddDora({suit,num:n})} style={{
                  width:36,height:36,borderRadius:4,
                  border:"2px solid transparent",
                  background:"none",cursor:"pointer",padding:0,lineHeight:1,
                }}><img src={TILE_UNICODE[`${suit}${n}`]} alt={`${suit}${n}`} style={{width:36,height:36,objectFit:"contain"}}/></button>
              ))}
            </div>
          ))}
          <div style={{display:"flex",gap:2}}>
            {[1,2,3,4,5,6,7].map(n=>(
              <button key={n} onClick={()=>handleAddDora({suit:"honor",num:n})} style={{
                width:36,height:36,borderRadius:4,
                border:"2px solid transparent",
                background:"none",cursor:"pointer",padding:0,lineHeight:1,
              }}><img src={TILE_UNICODE[HONORS[n-1]]} alt={HONORS[n-1]} style={{width:36,height:36,objectFit:"contain"}}/></button>
            ))}
          </div>
        </div>
      )}

      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div onClick={onToggleRedFives} style={{
          width:28,height:16,borderRadius:8,cursor:"pointer",position:"relative",transition:"all 0.2s",
          background:redFives?"#e05252":"rgba(255,255,255,0.1)",
          border:`1px solid ${redFives?"#e05252":"rgba(255,255,255,0.15)"}`,
        }}>
          <div style={{
            width:12,height:12,borderRadius:"50%",background:"#fff",
            position:"absolute",top:1,left:redFives?14:2,transition:"left 0.2s",
          }}/>
        </div>
        <span style={{fontSize:10,color:redFives?"#e05252":"var(--text3)",fontWeight:700,cursor:"pointer"}} onClick={onToggleRedFives}>Red 5s (+1 dora each)</span>
      </div>
    </div>
  );
}

// Score summary panel — shown when yaku detected
// BUG-10 fix: accepts winType prop and renders tsumo split payments when applicable.
function ScoreSummary({ detectedYaku, doraCount, fu, isClosed, winType }) {
  const isYakuman = detectedYaku.some(y => (YAKU_INFO[y] || {}).yakuman);
  const baseHan = detectedYaku.reduce((s, y) => s + getYakuHan(y, isClosed), 0);
  const totalHan = isYakuman ? baseHan : baseHan + doraCount;
  const pts = isYakuman ? hanToPoints(13, fu ?? 30) : (totalHan > 0 ? hanToPoints(totalHan, fu ?? 30) : null);
  if (totalHan === 0 && doraCount === 0) return null;

  const lc = pts?.label==="Mangan"?"#fdcb6e":pts?.label?"#e84393":"var(--accent2)";
  const isTsumo = winType === "tsumo";

  return (
    <div style={{
      marginTop:12,padding:"11px 13px",borderRadius:10,
      background:"rgba(155,142,255,0.07)",border:"1px solid rgba(155,142,255,0.2)",
    }}>
      <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.13em",color:"var(--accent)",fontFamily:"'Space Mono',monospace",textTransform:"uppercase",marginBottom:8}}>Hand Score</div>
      <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:24,fontWeight:800,color:"var(--accent2)",lineHeight:1}}>{isYakuman?"役満":totalHan}</div>
          <div style={{fontSize:9,color:"var(--text3)",fontFamily:"'Space Mono',monospace"}}>HAN</div>
        </div>
        {fu !== null && (
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:24,fontWeight:800,color:"var(--accent2)",lineHeight:1}}>{fu}</div>
            <div style={{fontSize:9,color:"var(--text3)",fontFamily:"'Space Mono',monospace"}}>FU</div>
          </div>
        )}
        {doraCount>0&&(
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:24,fontWeight:800,color:"#ffd166",lineHeight:1}}>+{doraCount}</div>
            <div style={{fontSize:9,color:"var(--text3)",fontFamily:"'Space Mono',monospace"}}>DORA</div>
          </div>
        )}
        {pts&&(
          <div style={{marginLeft:"auto",textAlign:"right"}}>
            {pts.label&&<div style={{fontSize:11,fontWeight:800,color:lc,marginBottom:2}}>{pts.label}</div>}
            {isTsumo ? (
              <>
                {/* Non-dealer tsumo: two non-dealers each pay tsumoNonDealerEach, dealer pays tsumoNonDealerDealer */}
                <div style={{fontSize:13,fontWeight:800,color:lc,lineHeight:1.3}}>
                  {formatPts(pts.tsumoNonDealerEach)} <span style={{fontSize:9,color:"var(--text3)"}}>× 2</span>
                  {" / "}{formatPts(pts.tsumoNonDealerDealer)} <span style={{fontSize:9,color:"var(--text3)"}}>dealer</span>
                </div>
                <div style={{fontSize:9,color:"var(--text3)",fontFamily:"'Space Mono',monospace",marginTop:1}}>
                  tsumo · non-dealer wins
                </div>
                <div style={{fontSize:11,fontWeight:700,color:"#6abcff",marginTop:4,lineHeight:1.3}}>
                  {formatPts(pts.tsumoDealer)} <span style={{fontSize:9,color:"var(--text3)"}}>× 3</span>
                </div>
                <div style={{fontSize:9,color:"var(--text3)",fontFamily:"'Space Mono',monospace",marginTop:1}}>
                  tsumo · dealer wins
                </div>
              </>
            ) : (
              <>
                <div style={{fontSize:20,fontWeight:800,color:lc,lineHeight:1}}>{formatPts(pts.nonDealerRon)}</div>
                <div style={{fontSize:9,color:"var(--text3)",fontFamily:"'Space Mono',monospace"}}>
                  non-dealer · <span style={{color:"var(--text2)"}}>{formatPts(pts.dealerRon)}</span> dealer
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {(detectedYaku.length>0||doraCount>0)&&(
        <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",gap:5,flexWrap:"wrap"}}>
          {detectedYaku.map(y=>{
            const han=getYakuHan(y,isClosed);
            const info=YAKU_INFO[y]||(y.startsWith("Yakuhai")?getYakuhaiInfo():{});
            return (
              <span key={y} style={{
                fontSize:9,padding:"2px 7px",borderRadius:5,fontWeight:700,
                background:info?.yakuman?"rgba(232,67,147,0.12)":"rgba(155,142,255,0.1)",
                border:`1px solid ${info?.yakuman?"rgba(232,67,147,0.25)":"rgba(155,142,255,0.2)"}`,
                color:info?.yakuman?"#e84393":"var(--accent2)",
              }}>{y} {info?.yakuman?"役満":`${han}✦`}</span>
            );
          })}
          {doraCount>0&&(
            <span style={{fontSize:9,padding:"2px 7px",borderRadius:5,fontWeight:700,background:"rgba(255,209,102,0.1)",border:"1px solid rgba(255,209,102,0.25)",color:"#ffd166"}}>
              Dora ×{doraCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ProxCard({ name, tilesAway, progress, achieved, info }) {
  const freqColor = FREQ_COLORS[info.freq]||"#9b8eff";
  const barColor = achieved?"#00c896":tilesAway<=2?"#ffd166":tilesAway<=5?"#3b9eff":"rgba(255,255,255,0.1)";
  const awayColor = achieved?"#00c896":tilesAway<=1?"#ffd166":tilesAway<=3?"#6abcff":"#524c70";
  const closedScore = getScoreDisplay(info,true);
  const openScore = info.hanOpen!==null ? getScoreDisplay(info,false) : null;
  const isClosedOnly = info.closedOnly||info.hanOpen===null;
  return (
    <div className={`prox-card${achieved?" achieved":""}`}>
      <div className="prox-row1">
        <span style={{fontSize:12,flexShrink:0}}>{achieved?"✅":tilesAway<=1?"🔥":tilesAway<=3?"⚡":"◦"}</span>
        <span className="prox-name" style={{color:achieved?"#00c896":"#ece7ff"}}>{name}</span>
        {isClosedOnly&&<span className="badge-closed-only">CLOSED</span>}
        <span className="prox-away" style={{color:awayColor}}>{achieved?"Complete!":`~${tilesAway} away`}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{width:`${progress}%`,background:barColor}}/>
      </div>
      <div className="score-badges">
        {closedScore&&<ScoreBadge type="closed" han={info.hanClosed} score={closedScore} isYakuman={info.yakuman}/>}
        {openScore?<ScoreBadge type="open" han={info.hanOpen} score={openScore} isYakuman={info.yakuman}/>
                  :!info.yakuman&&<ScoreBadge type="invalid"/>}
        <span style={{marginLeft:"auto",fontSize:8,fontWeight:700,color:freqColor,alignSelf:"center",fontFamily:"'Space Mono',monospace"}}>{info.freq}</span>
      </div>
      <div className="prox-desc">{info.desc}</div>
    </div>
  );
}

function YakuListTab() {
  const cats = [
    { title:"Riichi & Special", keys:["Riichi","Ippatsu","Menzen Tsumo","Double Riichi"] },
    { title:"Sequences & Suits", keys:["Pinfu","Twin Sequences","Double Twin Sequences","Three Suit Sequences","Straight","Half Flush","Full Flush"] },
    { title:"Triplets & Honors", keys:["All Simples","All Triplets","Seven Pairs","Half Outside Hand","Full Outside Hand","Three Concealed Triplets","Three Suit Triplets","Three Little Dragons","Terminals and Honors","Three Kans"] },
    { title:"Situational", keys:["Robbing a Kan","Under the River","Under the Sea","Dead Wall Victory","Mangan at Draw"] },
    { title:"Yakuman", keys:["Thirteen Orphans","Four Concealed Triplets","Three Big Dragons","Four Little Winds","Four Big Winds","All Honors","All Terminals","All Green","Nine Gates","Four Kans","Blessing of Heaven","Blessing of Earth"] },
  ];
  return (
    <div className="yaku-tab">
      <div className="yaku-legend">
        <span style={{fontWeight:700,color:"#a09ac0"}}>Legend:</span>
        <span><span style={{color:"#9b8eff",fontWeight:700}}>CLOSED</span> = closed hand only</span>
        <span><span style={{color:"#3b9eff",fontWeight:700}}>OPEN</span> = valid after calling</span>
        <span>Points: <span style={{color:"#ece7ff"}}>non-dealer</span> / dealer at 30 fu</span>
        <span><span style={{color:"#ffd166",fontWeight:700}}>Mangan</span> = 8,000 pt cap</span>
      </div>
      {cats.map(cat=>(
        <div key={cat.title} className="yaku-category">
          <div className="yaku-cat-title">{cat.title}</div>
          <div className="yaku-grid">
            {cat.keys.map(key=>{
              const y=YAKU_INFO[key]; if(!y) return null;
              const fc=FREQ_COLORS[y.freq]||"#9b8eff";
              const cs=getScoreDisplay(y,true);
              const os=y.hanOpen!==null?getScoreDisplay(y,false):null;
              return (
                <div key={key} className={`yaku-card${y.yakuman?" ym":""}`}>
                  <div className="yaku-card-header">
                    <span className="yaku-card-name" style={{color:y.yakuman?"#ff4da6":"#ece7ff"}}>{key}</span>
                    {y.closedOnly&&<span style={{fontSize:8,color:"#9b8eff",background:"rgba(155,142,255,0.14)",padding:"1px 5px",borderRadius:4,fontWeight:700}}>CLOSED</span>}
                    <span style={{fontSize:8,color:fc,fontWeight:700,fontFamily:"Space Mono,monospace"}}>{y.freq}</span>
                  </div>
                  <div className="score-badges" style={{marginBottom:6}}>
                    {cs&&<ScoreBadge type="closed" han={y.hanClosed} score={cs} isYakuman={y.yakuman}/>}
                    {os?<ScoreBadge type="open" han={y.hanOpen} score={os} isYakuman={y.yakuman}/>
                       :!y.yakuman&&<ScoreBadge type="invalid"/>}
                  </div>
                  <p className="yaku-card-desc">{y.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="yaku-footer">Point values at 30 fu. Actual fu varies by wait type, pair, and melds.</div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function RiichiAnalyzer() {
  const [hand, setHand] = useState([]);
  const [detected, setDetected] = useState([]);
  const [tenpai, setTenpai] = useState([]);
  const [proximity, setProximity] = useState([]);
  const [activeTab, setActiveTab] = useState("build");
  const [showAll, setShowAll] = useState(false);
  const [openFilter, setOpenFilter] = useState(false); // true = hide closed-only yaku from list
  const [isClosed, setIsClosed] = useState(true);
  const [seatWind, setSeatWind] = useState("East");
  const [roundWind, setRoundWind] = useState("East");
  const [doraIndicators, setDoraIndicators] = useState([]);
  const [winType, setWinType] = useState("ron"); // BUG-04 fix: track tsumo vs ron
  const [redFives, setRedFives] = useState(false);

  const runAnalysis = useCallback((tiles, sw, rw, closed = isClosed) => {
    setDetected(detectYaku(tiles, sw, rw, [], closed));
    setProximity(scoreAllYaku(tiles, sw, rw));
    setTenpai(tiles.length === 13 ? getTenpaiTiles(tiles, sw, rw, closed) : []);
  }, [isClosed]);

  const addTile = useCallback((suit, num) => {
    if (hand.length >= 14) return;
    const newHand = [...hand,{suit,num}].sort(tileSort);
    setHand(newHand);
    runAnalysis(newHand, seatWind, roundWind);
  }, [hand, seatWind, roundWind, runAnalysis]);

  const removeTile = useCallback((idx) => {
    const newHand = hand.filter((_,i)=>i!==idx);
    setHand(newHand);
    runAnalysis(newHand, seatWind, roundWind);
  }, [hand, seatWind, roundWind, runAnalysis]);

  const handleSeat  = (w) => { setSeatWind(w);  runAnalysis(hand, w, roundWind); };
  const handleRound = (w) => { setRoundWind(w); runAnalysis(hand, seatWind, w); };

  const clearHand = () => { setHand([]); setDetected([]); setTenpai([]); setProximity([]); };
  const tileCount = (suit, num) => hand.filter(t=>t.suit===suit&&t.num===num).length;

  const doraCount = useMemo(()=>countDora(hand, doraIndicators, redFives), [hand, doraIndicators, redFives]);

  const fu = useMemo(() => {
    if (hand.length < 14) return null;
    const decomps = decompose([...hand]);
    const valid = decomps.filter(d => d.pair && d.melds.length === 4);
    if (!valid.length) return null;
    return calcFu(valid[0], seatWind, roundWind, winType, isClosed); // BUG-04 fix: use winType state
  }, [hand, seatWind, roundWind, isClosed, winType]);

  const proxFiltered = useMemo(() => {
    let list = openFilter
      ? proximity.filter(p => !(p.info.closedOnly || p.info.hanOpen===null))
      : proximity;
    return showAll ? list : list.slice(0,10);
  }, [proximity, openFilter, showAll]);

  const proxLabel = hand.length===0 ? "Yaku Proximity"
    : detected.length>0 ? `✅ ${detected.length} Yaku Detected`
    : "Yaku Proximity — Closest First";

  return (
    <div className="app">
      <header className="app-header">
        <span className="header-icon">🀄</span>
        <div>
          <div className="header-title">Riichi Mahjong Analyzer</div>
          <div className="header-sub">Build · Detect · Score</div>
        </div>
        <div className="header-tabs">
          {[["build","🀇 Hand Builder"],["yaku","📋 Yaku List"]].map(([id,lbl])=>(
            <button key={id} className={`tab-btn${activeTab===id?" active":""}`} onClick={()=>setActiveTab(id)}>{lbl}</button>
          ))}
        </div>
      </header>

      {activeTab==="build" ? (
        <div className="build-layout">
          <aside className="sidebar">
            <div className="section-label">Tile Selector</div>
            <SuitSection label="🀇 Characters (Man)" suit="man" onAdd={addTile} handCount={tileCount}/>
            <SuitSection label="🀙 Circles (Pin)"    suit="pin" onAdd={addTile} handCount={tileCount}/>
            <SuitSection label="🀐 Bamboo (Sou)"     suit="sou" onAdd={addTile} handCount={tileCount}/>
            <div className="suit-section">
              <div className="suit-label">🀀 Honors</div>
              <div className="tile-row" style={{flexWrap:"wrap"}}>
                {[1,2,3,4,5,6,7].map(n=>(
                  <TileWithBadge key={n} suit="honor" num={n}
                    count={tileCount("honor",n)} badgeColor={TILE_COLORS.honor} onAdd={addTile} small/>
                ))}
              </div>
            </div>

            {/* Wind settings */}
            <div style={{marginTop:14,padding:"10px 12px",borderRadius:8,background:"rgba(176,159,255,0.05)",border:"1px solid rgba(176,159,255,0.14)"}}>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.12em",color:"var(--accent)",fontFamily:"'Space Mono',monospace",textTransform:"uppercase",marginBottom:10}}>Wind Settings</div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                <WindPill label="Seat Wind"  value={seatWind}  options={WINDS} onChange={handleSeat}  color="#b09fff"/>
                <WindPill label="Round Wind" value={roundWind} options={WINDS} onChange={handleRound} color="#3b9eff"/>
              </div>
              <div style={{marginTop:8,fontSize:9,color:"var(--text3)"}}>
                Seat: <span style={{color:"#b09fff"}}><img src={TILE_UNICODE[seatWind]} alt={seatWind} style={{width:12,height:12,objectFit:"contain",verticalAlign:"middle"}}/> {seatWind}</span>
                {" · "}Round: <span style={{color:"#3b9eff"}}><img src={TILE_UNICODE[roundWind]} alt={roundWind} style={{width:12,height:12,objectFit:"contain",verticalAlign:"middle"}}/> {roundWind}</span>
              </div>
            </div>

            {/* Dora */}
            <DoraPanel
              doraIndicators={doraIndicators}
              onAddDora={t=>setDoraIndicators(d=>[...d,t])}
              onRemoveDora={i=>setDoraIndicators(d=>d.filter((_,j)=>j!==i))}
              redFives={redFives}
              onToggleRedFives={()=>setRedFives(v=>!v)}
            />
          </aside>

          <div className="main-panel">
            <div className="hand-area">
              <div className="hand-header">
                <div className="section-label" style={{marginBottom:0}}>Your Hand ({hand.length}/14)</div>
                <div style={{display:"flex",gap:7,alignItems:"center"}}>
                  <button onClick={()=>setWinType(v=>v==="ron"?"tsumo":"ron")} style={{
                    padding:"4px 11px",borderRadius:12,cursor:"pointer",
                    border:`1px solid ${winType==="tsumo"?"rgba(0,200,150,0.4)":"rgba(255,209,102,0.4)"}`,
                    background:winType==="tsumo"?"rgba(0,200,150,0.1)":"rgba(255,209,102,0.1)",
                    color:winType==="tsumo"?"#00c896":"#ffd166",
                    fontSize:11,fontWeight:700,fontFamily:"'Sora',sans-serif",transition:"all 0.15s",
                  }}>{winType==="tsumo"?"🀄 Tsumo":"🎯 Ron"}</button>
                  <button onClick={()=>{const nc=!isClosed;setIsClosed(nc);runAnalysis(hand,seatWind,roundWind,nc);}} style={{
                    padding:"4px 11px",borderRadius:12,cursor:"pointer",
                    border:`1px solid ${isClosed?"rgba(176,159,255,0.4)":"rgba(58,158,255,0.4)"}`,
                    background:isClosed?"rgba(176,159,255,0.1)":"rgba(58,158,255,0.1)",
                    color:isClosed?"#b09fff":"#3b9eff",
                    fontSize:11,fontWeight:700,fontFamily:"'Sora',sans-serif",transition:"all 0.15s",
                  }}>{isClosed?"🔒 Closed":"📂 Open"}</button>
                  <button className="clear-btn" onClick={clearHand}>Clear</button>
                </div>
              </div>
              <div className="hand-row">
                {hand.length===0
                  ? <span className="hand-empty-hint">Click tiles on the left to build your hand…</span>
                  : hand.map((t,i)=>(
                    <MahjongTile key={i} suit={t.suit} num={t.num} selected onClick={()=>removeTile(i)}/>
                  ))
                }
                {hand.length>0 && Array.from({length:14-hand.length}).map((_,i)=>(
                  <div key={i} className="hand-empty-slot"/>
                ))}
              </div>
              {hand.length>0 && <div className="hand-click-hint">Click a tile to remove it</div>}
              {detected.length>0 && (
                <ScoreSummary detectedYaku={detected} doraCount={doraCount} fu={fu} isClosed={isClosed} winType={winType}/>
              )}
            </div>

            <div className="analysis-area">
              {tenpai.length>0 && (
                <div className="tenpai-box">
                  <div className="tenpai-title">✨ TENPAI — Waiting on:</div>
                  <div className="tenpai-tiles">
                    {tenpai.map((t,i)=><MahjongTile key={i} suit={t.suit} num={t.num} small/>)}
                  </div>
                </div>
              )}
              <div className="prox-header">
                <div className="section-label" style={{marginBottom:0}}>{proxLabel}</div>
                <div style={{display:"flex",gap:6}}>
                  <button className="show-all-btn"
                    style={{
                      borderColor:openFilter?"rgba(58,158,255,0.5)":undefined,
                      color:openFilter?"#3b9eff":undefined,
                      background:openFilter?"rgba(58,158,255,0.1)":undefined,
                    }}
                    onClick={()=>setOpenFilter(v=>!v)}
                  >{openFilter?"All Yaku":"📂 Open Only"}</button>
                  {proximity.length>0&&(
                    <button className="show-all-btn" onClick={()=>setShowAll(v=>!v)}>
                      {showAll?"Top 10":"Show All"}
                    </button>
                  )}
                </div>
              </div>
              {hand.length===0
                ? <div className="empty-state">Add tiles to see how close you are to each yaku.</div>
                : <div className="prox-list">{proxFiltered.map(p=><ProxCard key={p.name} {...p}/>)}</div>
              }
            </div>
          </div>
        </div>
      ) : <YakuListTab/>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<RiichiAnalyzer />);