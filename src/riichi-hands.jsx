import { useState, useCallback, useEffect } from "react";

// ─── Tile Definitions ────────────────────────────────────────────────────────
const SUITS = ["man", "pin", "sou"];
const HONORS = ["East", "South", "West", "North", "Haku", "Hatsu", "Chun"];
const WINDS = ["East", "South", "West", "North"];
const DRAGONS = ["Haku", "Hatsu", "Chun"];

// Unicode mahjong tiles
const TILE_UNICODE = {
  // Man (Characters) 🀇-🀏
  man1:"🀇",man2:"🀈",man3:"🀉",man4:"🀊",man5:"🀋",man6:"🀌",man7:"🀍",man8:"🀎",man9:"🀏",
  // Pin (Circles) 🀙-🀡
  pin1:"🀙",pin2:"🀚",pin3:"🀛",pin4:"🀜",pin5:"🀝",pin6:"🀞",pin7:"🀟",pin8:"🀠",pin9:"🀡",
  // Sou (Bamboo) 🀐-🀘
  sou1:"🀐",sou2:"🀑",sou3:"🀒",sou4:"🀓",sou5:"🀔",sou6:"🀕",sou7:"🀖",sou8:"🀗",sou9:"🀘",
  // Honors
  East:"🀀",South:"🀁",West:"🀂",North:"🀃",Haku:"🀆",Hatsu:"🀅",Chun:"🀄",
};

const TILE_COLORS = {
  man: "#d63031",
  pin: "#0984e3",
  sou: "#00b894",
  honor: "#6c5ce7",
};

const TILE_LABELS = {
  man:["1m","2m","3m","4m","5m","6m","7m","8m","9m"],
  pin:["1p","2p","3p","4p","5p","6p","7p","8p","9p"],
  sou:["1s","2s","3s","4s","5s","6s","7s","8s","9s"],
  honor:["East","South","West","North","Haku","Hatsu","Chun"],
};

// ─── Tile Helpers ─────────────────────────────────────────────────────────────
function tileKey(suit, num) {
  if (suit === "honor") return HONORS[num - 1];
  return `${suit}${num}`;
}
function tileLabel(suit, num) {
  if (suit === "honor") return HONORS[num - 1];
  return `${num}${suit[0]}`;
}
function isTerminal(suit, num) {
  return suit !== "honor" && (num === 1 || num === 9);
}
function isHonor(suit) { return suit === "honor"; }
function isTerminalOrHonor(suit, num) { return isTerminal(suit, num) || isHonor(suit); }

// ─── Hand Solving ─────────────────────────────────────────────────────────────

// Represent a tile as {suit, num}
// Group = {type:'seq'|'tri'|'kan'|'pair', tiles:[]}
function countTiles(tiles) {
  const counts = {};
  for (const t of tiles) {
    const k = `${t.suit}|${t.num}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

// Try to decompose tiles into melds + pair
// Returns array of possible decompositions [{pair, melds:[]}]
function decompose(tiles) {
  if (tiles.length === 0) return [{ pair: null, melds: [] }];
  const results = [];
  _decompose(tiles, null, [], results);
  return results;
}

function _decompose(tiles, pair, melds, results) {
  if (tiles.length === 0) {
    results.push({ pair, melds: [...melds] });
    return;
  }
  // Must have pair exactly once
  const sorted = [...tiles].sort(tileSort);
  const first = sorted[0];

  // Try as part of a triplet
  const triIdx = findNInSorted(sorted, first, 3);
  if (triIdx !== -1) {
    const rem = removeIndices(sorted, triIdx);
    melds.push({ type: "tri", tiles: [first, first, first] });
    _decompose(rem, pair, melds, results);
    melds.pop();
  }

  // Try as part of a sequence (only for numbered suits)
  if (first.suit !== "honor" && first.num <= 7) {
    const second = { suit: first.suit, num: first.num + 1 };
    const third = { suit: first.suit, num: first.num + 2 };
    const i2 = findInSorted(sorted, second, 1);
    const i3 = findInSorted(sorted, third, 1);
    if (i2 !== -1 && i3 !== -1) {
      const rem = removeIndices(sorted, [[0], [i2], [i3]].flat());
      melds.push({ type: "seq", tiles: [first, second, third] });
      _decompose(rem, pair, melds, results);
      melds.pop();
    }
  }

  // Try as pair (only once)
  if (pair === null) {
    const pairIdx = findNInSorted(sorted, first, 2);
    if (pairIdx !== -1) {
      const rem = removeIndices(sorted, pairIdx);
      _decompose(rem, { tiles: [first, first] }, melds, results);
    }
  }
}

function tileSort(a, b) {
  const suitOrder = { man: 0, pin: 1, sou: 2, honor: 3 };
  if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
  return a.num - b.num;
}

function tilesEqual(a, b) { return a.suit === b.suit && a.num === b.num; }

function findNInSorted(sorted, tile, n) {
  const indices = [];
  for (let i = 0; i < sorted.length && indices.length < n; i++) {
    if (tilesEqual(sorted[i], tile)) indices.push(i);
  }
  return indices.length === n ? indices : -1;
}

function findInSorted(sorted, tile, skip = 0) {
  let found = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (tilesEqual(sorted[i], tile)) {
      if (found === skip) return i;
      found++;
    }
  }
  return -1;
}

function removeIndices(arr, indices) {
  const set = new Set(indices);
  return arr.filter((_, i) => !set.has(i));
}

// ─── Yaku Detection ───────────────────────────────────────────────────────────

function detectYaku(tiles) {
  if (tiles.length !== 13 && tiles.length !== 14) return [];
  const found = [];

  // Special hands first
  if (isThirteenOrphans(tiles)) { found.push("Thirteen Orphans"); return found; }
  if (isSevenPairs(tiles)) {
    found.push("Seven Pairs");
    checkHonorYaku(tiles, found);
    return found;
  }

  // Standard decomposition
  const decomps = decompose([...tiles]);
  const valid = decomps.filter(d => d.pair && d.melds.length === 4);
  if (valid.length === 0) return found;

  const best = valid[0];
  const allGroups = [best.pair, ...best.melds];

  // Check standard yaku
  if (isTanyao(tiles)) found.push("All Simples");
  if (isToitoi(best)) found.push("All Triplets");
  if (isPinfu(best, tiles)) found.push("Pinfu");
  if (isIipeiko(best)) found.push("Twin Sequences");
  if (isRyanpeikou(best)) found.push("Double Twin Sequences");
  if (isSanshokuDoujun(best)) found.push("Three Suit Sequences");
  if (isSanshokuDoukou(best)) found.push("Three Suit Triplets");
  if (isIttsuu(best)) found.push("Straight");
  if (isChanta(best)) found.push("Half Outside Hand");
  if (isJunchan(best)) found.push("Full Outside Hand");
  if (isHoniiSou(tiles)) found.push("Half Flush");
  if (isChiniiSou(tiles)) found.push("Full Flush");
  if (isSanankou(best)) found.push("Three Concealed Triplets");
  if (isShousangen(best)) found.push("Three Little Dragons");
  if (isDaisangen(best)) found.push("Three Big Dragons");
  if (isShousuushi(best)) found.push("Four Little Winds");
  if (isDaisuushi(best)) found.push("Four Big Winds");
  if (isTsuuiisou(tiles)) found.push("All Honors");
  if (isChinroutou(tiles)) found.push("All Terminals");
  if (isRyuuiisou(tiles)) found.push("All Green");
  if (isNineGates(tiles)) found.push("Nine Gates");
  if (isSuukantsu(best)) found.push("Four Kans");

  return found;
}

function isThirteenOrphans(tiles) {
  const required = [
    {suit:"man",num:1},{suit:"man",num:9},
    {suit:"pin",num:1},{suit:"pin",num:9},
    {suit:"sou",num:1},{suit:"sou",num:9},
    {suit:"honor",num:1},{suit:"honor",num:2},{suit:"honor",num:3},{suit:"honor",num:4},
    {suit:"honor",num:5},{suit:"honor",num:6},{suit:"honor",num:7},
  ];
  if (tiles.length < 13) return false;
  const rem = [...tiles];
  for (const req of required) {
    const idx = rem.findIndex(t => tilesEqual(t, req));
    if (idx === -1) return false;
    rem.splice(idx, 1);
  }
  return true;
}

function isSevenPairs(tiles) {
  if (tiles.length < 14) return false;
  const counts = {};
  for (const t of tiles) {
    const k = `${t.suit}|${t.num}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  const vals = Object.values(counts);
  return vals.length === 7 && vals.every(v => v === 2);
}

function isTanyao(tiles) {
  return tiles.every(t => !isTerminalOrHonor(t.suit, t.num));
}

function isToitoi(decomp) {
  return decomp.melds.every(m => m.type === "tri" || m.type === "kan");
}

function isPinfu(decomp, tiles) {
  if (!decomp.pair) return false;
  const pair = decomp.pair.tiles[0];
  if (isHonor(pair.suit)) return false;
  if (DRAGONS.includes(HONORS[pair.num - 1])) return false;
  if (!decomp.melds.every(m => m.type === "seq")) return false;
  return true;
}

function isIipeiko(decomp) {
  const seqs = decomp.melds.filter(m => m.type === "seq");
  for (let i = 0; i < seqs.length; i++) {
    for (let j = i + 1; j < seqs.length; j++) {
      if (seqEqual(seqs[i], seqs[j])) return true;
    }
  }
  return false;
}

function isRyanpeikou(decomp) {
  const seqs = decomp.melds.filter(m => m.type === "seq");
  if (seqs.length < 4) return false;
  const matched = new Set();
  let pairs = 0;
  for (let i = 0; i < seqs.length; i++) {
    if (matched.has(i)) continue;
    for (let j = i + 1; j < seqs.length; j++) {
      if (!matched.has(j) && seqEqual(seqs[i], seqs[j])) {
        matched.add(i); matched.add(j); pairs++; break;
      }
    }
  }
  return pairs === 2;
}

function seqEqual(a, b) {
  return a.tiles[0].suit === b.tiles[0].suit && a.tiles[0].num === b.tiles[0].num;
}

function isSanshokuDoujun(decomp) {
  const seqs = decomp.melds.filter(m => m.type === "seq");
  for (const s of seqs) {
    const num = s.tiles[0].num;
    const suits = new Set(seqs.filter(x => x.tiles[0].num === num).map(x => x.tiles[0].suit));
    if (suits.has("man") && suits.has("pin") && suits.has("sou")) return true;
  }
  return false;
}

function isSanshokuDoukou(decomp) {
  const tris = decomp.melds.filter(m => m.type === "tri");
  for (const t of tris) {
    const num = t.tiles[0].num;
    const suits = new Set(tris.filter(x => x.tiles[0].num === num).map(x => x.tiles[0].suit));
    if (suits.has("man") && suits.has("pin") && suits.has("sou")) return true;
  }
  return false;
}

function isIttsuu(decomp) {
  const seqs = decomp.melds.filter(m => m.type === "seq");
  for (const suit of SUITS) {
    const suitSeqs = seqs.filter(s => s.tiles[0].suit === suit).map(s => s.tiles[0].num);
    if ([1,4,7].every(n => suitSeqs.includes(n))) return true;
  }
  return false;
}

function isChanta(decomp) {
  const all = decomp.pair ? [decomp.pair, ...decomp.melds] : decomp.melds;
  return all.every(g => g.tiles.some(t => isTerminalOrHonor(t.suit, t.num)));
}

function isJunchan(decomp) {
  const all = decomp.pair ? [decomp.pair, ...decomp.melds] : decomp.melds;
  return all.every(g => g.tiles.some(t => isTerminal(t.suit, t.num)));
}

function isHoniiSou(tiles) {
  const suits = new Set(tiles.map(t => t.suit));
  return suits.size === 2 && suits.has("honor") && [...suits].some(s => s !== "honor");
}

function isChiniiSou(tiles) {
  const suits = new Set(tiles.map(t => t.suit));
  return suits.size === 1 && suits.has("man") || suits.size === 1 && suits.has("pin") || suits.size === 1 && suits.has("sou");
}

function isSanankou(decomp) {
  return decomp.melds.filter(m => m.type === "tri").length >= 3;
}

function isShousangen(decomp) {
  const dragonNums = [5, 6, 7];
  const dragonTris = decomp.melds.filter(m => m.type === "tri" && m.tiles[0].suit === "honor" && dragonNums.includes(m.tiles[0].num));
  const dragonPair = decomp.pair && decomp.pair.tiles[0].suit === "honor" && dragonNums.includes(decomp.pair.tiles[0].num);
  return dragonTris.length === 2 && dragonPair;
}

function isDaisangen(decomp) {
  const dragonNums = [5, 6, 7];
  const dragonTris = decomp.melds.filter(m => m.type === "tri" && m.tiles[0].suit === "honor" && dragonNums.includes(m.tiles[0].num));
  return dragonTris.length === 3;
}

function isShousuushi(decomp) {
  const windNums = [1, 2, 3, 4];
  const windTris = decomp.melds.filter(m => m.type === "tri" && m.tiles[0].suit === "honor" && windNums.includes(m.tiles[0].num));
  const windPair = decomp.pair && decomp.pair.tiles[0].suit === "honor" && windNums.includes(decomp.pair.tiles[0].num);
  return windTris.length === 3 && windPair;
}

function isDaisuushi(decomp) {
  const windNums = [1, 2, 3, 4];
  const windTris = decomp.melds.filter(m => m.type === "tri" && m.tiles[0].suit === "honor" && windNums.includes(m.tiles[0].num));
  return windTris.length === 4;
}

function isTsuuiisou(tiles) {
  return tiles.every(t => t.suit === "honor");
}

function isChinroutou(tiles) {
  return tiles.every(t => isTerminal(t.suit, t.num));
}

function isRyuuiisou(tiles) {
  const green = new Set(["sou2","sou3","sou4","sou6","sou8","Hatsu"]);
  return tiles.every(t => green.has(tileKey(t.suit, t.num)));
}

function isNineGates(tiles) {
  if (tiles.length < 13) return false;
  const suits = new Set(tiles.map(t => t.suit));
  if (suits.size !== 1 || suits.has("honor")) return false;
  const suit = [...suits][0];
  const nums = tiles.map(t => t.num).sort((a, b) => a - b);
  const base = [1,1,1,2,3,4,5,6,7,8,9,9,9];
  const extra = nums.filter((n, i) => {
    const baseCopy = [...base];
    const idx = baseCopy.indexOf(n);
    if (idx === -1) return true;
    baseCopy.splice(idx, 1);
    return false;
  });
  const baseCount = {};
  for (const n of base) baseCount[n] = (baseCount[n] || 0) + 1;
  for (const t of tiles) {
    const k = t.num;
    if ((baseCount[k] || 0) === 0) return false;
    baseCount[k]--;
  }
  return Object.values(baseCount).every(v => v <= 0);
}

function isSuukantsu(decomp) {
  return decomp.melds.filter(m => m.type === "kan").length === 4;
}

function checkHonorYaku(tiles, found) {
  if (isTsuuiisou(tiles)) found.push("All Honors");
}

// Tenpai detection: which tiles complete the hand
function getTenpaiTiles(tiles) {
  if (tiles.length !== 13) return [];
  const waiting = [];
  const allTiles = [];
  for (const suit of SUITS) for (let n = 1; n <= 9; n++) allTiles.push({ suit, num: n });
  for (let n = 1; n <= 7; n++) allTiles.push({ suit: "honor", num: n });

  for (const candidate of allTiles) {
    const test = [...tiles, candidate];
    const yaku = detectYaku(test);
    if (yaku.length > 0 || isValidWinningHand(test)) {
      waiting.push(candidate);
    }
  }
  return waiting;
}

function isValidWinningHand(tiles) {
  if (tiles.length !== 14) return false;
  if (isThirteenOrphans(tiles)) return true;
  if (isSevenPairs(tiles)) return true;
  const decomps = decompose([...tiles]);
  return decomps.some(d => d.pair && d.melds.length === 4);
}

// ─── Proximity Scoring ───────────────────────────────────────────────────────
// Returns {name, tilesAway, progress, achieved, neededTiles} for every scoreable yaku,
// sorted by tilesAway ascending (closest first).

function countMap(tiles) {
  const m = {};
  for (const t of tiles) {
    const k = `${t.suit}|${t.num}`;
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

function tileFromKey(k) {
  const [suit, num] = k.split("|");
  return { suit, num: Number(num) };
}

// How many tiles from `tiles` overlap with `target` tile list (greedy)
function overlapCount(tiles, target) {
  const pool = [...tiles];
  let count = 0;
  for (const t of target) {
    const idx = pool.findIndex(p => tilesEqual(p, t));
    if (idx !== -1) { pool.splice(idx, 1); count++; }
  }
  return count;
}

// Best shanten for standard hand (pair + 4 melds)
// Uses classic shanten formula based on partial melds / partial pairs
function standardShanten(tiles) {
  // Build counts per suit
  const sorted = [...tiles].sort(tileSort);
  let best = 8; // worst case

  // Try all possible pairs
  const tried = new Set();
  const withNoPair = shantenNoPair(sorted, false);
  best = Math.min(best, withNoPair);

  for (let i = 0; i < sorted.length; i++) {
    const pt = sorted[i];
    const pk = `${pt.suit}|${pt.num}`;
    if (tried.has(pk)) continue;
    // Check we have 2+
    if (sorted.filter(t => tilesEqual(t, pt)).length < 2) continue;
    tried.add(pk);
    const rem = [...sorted];
    rem.splice(rem.findIndex(t => tilesEqual(t, pt)), 1);
    rem.splice(rem.findIndex(t => tilesEqual(t, pt)), 1);
    const s = shantenNoPair(rem, true);
    best = Math.min(best, s);
  }
  return best;
}

function shantenNoPair(tiles, hasPair) {
  // Count complete melds and partial melds via DP per suit
  // Simplified: count mentsu + partial mentsu
  const suits = { man: [], pin: [], sou: [], honor: [] };
  for (const t of tiles) suits[t.suit].push(t.num);
  for (const s of Object.keys(suits)) suits[s].sort((a, b) => a - b);

  let mentsu = 0, partial = 0;

  for (const suit of ["man", "pin", "sou"]) {
    const [m, p] = countSuitMentsu(suits[suit]);
    mentsu += m; partial += p;
  }
  // Honors: only triplets
  const hCounts = {};
  for (const n of suits.honor) hCounts[n] = (hCounts[n] || 0) + 1;
  for (const c of Object.values(hCounts)) {
    if (c >= 3) mentsu++;
    else if (c >= 2) partial++;
    else partial++; // single honor counts as isolated
  }

  // Shanten = 8 - 2*mentsu - partial - (hasPair?1:0)
  // But partial is capped so total groups ≤ 4
  const maxGroups = 4;
  if (mentsu + partial > maxGroups) partial = maxGroups - mentsu;
  return 8 - 2 * mentsu - partial - (hasPair ? 1 : 0);
}

function countSuitMentsu(nums) {
  // DP to count complete sequences/triplets and partial ones
  if (nums.length === 0) return [0, 0];
  let best = [0, 0];
  function dp(arr, m, p) {
    if (arr.length === 0) {
      if (m > best[0] || (m === best[0] && p > best[1])) best = [m, p];
      return;
    }
    const n = arr[0];
    // triplet
    if (arr.filter(x => x === n).length >= 3) {
      const rem = [...arr]; [0,1,2].forEach(() => rem.splice(rem.indexOf(n),1));
      dp(rem, m+1, p);
    }
    // sequence
    if (arr.includes(n+1) && arr.includes(n+2)) {
      const rem = [...arr];
      [n,n+1,n+2].forEach(v => rem.splice(rem.indexOf(v),1));
      dp(rem, m+1, p);
    }
    // partial: pair
    if (arr.filter(x => x === n).length >= 2) {
      const rem = [...arr]; [0,1].forEach(() => rem.splice(rem.indexOf(n),1));
      dp(rem, m, p+1);
    }
    // partial: kanchan/sequential wait
    if (arr.includes(n+1)) {
      const rem = [...arr]; [n,n+1].forEach(v => rem.splice(rem.indexOf(v),1));
      dp(rem, m, p+1);
    }
    if (arr.includes(n+2)) {
      const rem = [...arr]; [n,n+2].forEach(v => rem.splice(rem.indexOf(v),1));
      dp(rem, m, p+1);
    }
    // skip isolated
    dp(arr.slice(1), m, p);
  }
  dp(nums, 0, 0);
  return best;
}

function sevenPairsShanten(tiles) {
  const counts = countMap(tiles);
  const pairs = Object.values(counts).filter(c => c >= 2).length;
  const unique = Object.keys(counts).length;
  // Need 7 pairs; each unique tile is 1 pair if count>=2, else need 1 more
  return 6 - pairs;
}

function thirteenOrphansShanten(tiles) {
  const terminals = [
    {suit:"man",num:1},{suit:"man",num:9},
    {suit:"pin",num:1},{suit:"pin",num:9},
    {suit:"sou",num:1},{suit:"sou",num:9},
    {suit:"honor",num:1},{suit:"honor",num:2},{suit:"honor",num:3},
    {suit:"honor",num:4},{suit:"honor",num:5},{suit:"honor",num:6},{suit:"honor",num:7},
  ];
  const uniqueHave = terminals.filter(t => tiles.some(h => tilesEqual(h, t))).length;
  const hasPair = terminals.some(t => tiles.filter(h => tilesEqual(h, t)).length >= 2);
  return 13 - uniqueHave - (hasPair ? 1 : 0);
}

// Per-yaku shanten-like proximity (0 = complete, positive = tiles away)
function yakuProximity(name, tiles) {
  const n = tiles.length;
  const baseTiles = 13;

  switch (name) {
    case "Thirteen Orphans":
      return thirteenOrphansShanten(tiles);

    case "Seven Pairs":
      return sevenPairsShanten(tiles);

    case "All Simples": {
      // All tiles must be simples (2-8, non-honor)
      const bad = tiles.filter(t => isTerminalOrHonor(t.suit, t.num)).length;
      const shantenBase = standardShanten(tiles);
      return shantenBase + bad; // each bad tile costs 1 replace + still need to complete hand
    }

    case "All Triplets": {
      // Need 4 triplets + 1 pair, all tiles same tile repeated
      const counts = countMap(tiles);
      let trips = 0, pairs = 0, singles = 0;
      for (const c of Object.values(counts)) {
        if (c >= 3) trips++;
        else if (c >= 2) pairs++;
        else singles++;
      }
      // Shanten = 8 - 2*trips - pairs - (hasPair?1:0) roughly
      return Math.max(0, 8 - 2*trips - pairs);
    }

    case "Pinfu": {
      // 4 sequences + non-yakuhai pair — approximate as standard shanten
      // penalize if we have triplets
      const counts = countMap(tiles);
      const tripletPenalty = Object.values(counts).filter(c => c >= 3).length;
      const honorTiles = tiles.filter(t => isHonor(t.suit)).length;
      return standardShanten(tiles) + Math.floor(tripletPenalty / 2) + Math.floor(honorTiles / 3);
    }

    case "Twin Sequences": {
      // Need 2 identical sequences; proxy: find best duplicate sequence potential
      const seqGroups = {};
      for (const suit of SUITS) {
        for (let start = 1; start <= 7; start++) {
          const need = [start, start+1, start+2].map(n => ({suit, num: n}));
          const have = overlapCount(tiles, need);
          const k = `${suit}${start}`;
          seqGroups[k] = have;
        }
      }
      const sorted = Object.values(seqGroups).sort((a,b) => b-a);
      const best2 = (sorted[0]||0) + (sorted[0]||0); // 2 copies of best seq
      return Math.max(0, 6 - best2 + standardShanten(tiles));
    }

    case "Half Flush": {
      // One suit + honors
      let best = 99;
      for (const suit of SUITS) {
        const suitTiles = tiles.filter(t => t.suit === suit || t.suit === "honor");
        const offSuit = tiles.length - suitTiles.length;
        const s = standardShanten(suitTiles) + offSuit;
        if (s < best) best = s;
      }
      return Math.max(0, best);
    }

    case "Full Flush": {
      let best = 99;
      for (const suit of SUITS) {
        const suitTiles = tiles.filter(t => t.suit === suit);
        const offSuit = tiles.length - suitTiles.length;
        const s = standardShanten(suitTiles) + offSuit;
        if (s < best) best = s;
      }
      return Math.max(0, best);
    }

    case "All Honors": {
      const nonHonor = tiles.filter(t => !isHonor(t.suit)).length;
      const honorOnly = tiles.filter(t => isHonor(t.suit));
      return Math.max(0, standardShanten(honorOnly) + nonHonor);
    }

    case "All Terminals": {
      const nonTerm = tiles.filter(t => !isTerminal(t.suit, t.num)).length;
      const termOnly = tiles.filter(t => isTerminal(t.suit, t.num));
      return Math.max(0, standardShanten(termOnly) + nonTerm);
    }

    case "All Green": {
      const greenKeys = new Set(["sou|2","sou|3","sou|4","sou|6","sou|8","honor|6"]);
      const nonGreen = tiles.filter(t => !greenKeys.has(`${t.suit}|${t.num}`)).length;
      const greenTiles = tiles.filter(t => greenKeys.has(`${t.suit}|${t.num}`));
      return Math.max(0, standardShanten(greenTiles) + nonGreen);
    }

    case "Nine Gates": {
      // 1112345678999 + 1 extra of same suit
      let best = 99;
      for (const suit of SUITS) {
        const base = [1,1,1,2,3,4,5,6,7,8,9,9,9].map(n => ({suit, num: n}));
        const suitOnly = tiles.filter(t => t.suit === suit);
        const offSuit = tiles.filter(t => t.suit !== suit).length;
        const overlap = overlapCount(suitOnly, base);
        const s = (13 - overlap) + offSuit;
        if (s < best) best = s;
      }
      return Math.max(0, best);
    }

    case "Three Big Dragons": {
      const dragonNums = [5, 6, 7];
      const dragonTiles = tiles.filter(t => t.suit === "honor" && dragonNums.includes(t.num));
      const counts = {};
      for (const t of dragonTiles) counts[t.num] = (counts[t.num]||0)+1;
      let need = 0;
      for (const n of dragonNums) need += Math.max(0, 3 - (counts[n]||0));
      return Math.max(0, need + standardShanten(tiles));
    }

    case "Four Big Winds": {
      const windNums = [1,2,3,4];
      const windTiles = tiles.filter(t => t.suit === "honor" && windNums.includes(t.num));
      const counts = {};
      for (const t of windTiles) counts[t.num] = (counts[t.num]||0)+1;
      let need = 0;
      for (const n of windNums) need += Math.max(0, 3 - (counts[n]||0));
      return Math.max(0, need + standardShanten(tiles));
    }

    case "Four Little Winds": {
      const windNums = [1,2,3,4];
      const windTiles = tiles.filter(t => t.suit === "honor" && windNums.includes(t.num));
      const counts = {};
      for (const t of windTiles) counts[t.num] = (counts[t.num]||0)+1;
      // 3 wind triplets + 1 wind pair
      const sorted2 = Object.entries(counts).sort((a,b) => b[1]-a[1]);
      let need = 0;
      let tripsNeeded = 3;
      for (const [num, c] of sorted2) {
        if (tripsNeeded > 0) { need += Math.max(0, 3-c); tripsNeeded--; }
        else { need += Math.max(0, 2-c); break; }
      }
      // remaining wind types not present
      const missingWinds = windNums.filter(n => !counts[n]);
      need += missingWinds.length * 3;
      return Math.max(0, need + standardShanten(tiles));
    }

    case "Three Little Dragons": {
      const dragonNums = [5,6,7];
      const counts = {};
      for (const t of tiles.filter(t => t.suit === "honor" && dragonNums.includes(t.num)))
        counts[t.num] = (counts[t.num]||0)+1;
      const sorted3 = Object.entries(counts).sort((a,b) => b[1]-a[1]);
      // 2 triplets + 1 pair of dragons
      let need = 0;
      for (let i = 0; i < dragonNums.length; i++) {
        const c = counts[dragonNums[i]] || 0;
        if (i < 2) need += Math.max(0, 3 - c);
        else need += Math.max(0, 2 - c);
      }
      return Math.max(0, need + standardShanten(tiles));
    }

    case "Straight": {
      // 123 456 789 of same suit
      let best = 99;
      for (const suit of SUITS) {
        const need = [1,2,3,4,5,6,7,8,9].map(n => ({suit, num:n}));
        const have = overlapCount(tiles, need);
        best = Math.min(best, 9 - have + standardShanten(tiles));
      }
      return Math.max(0, best);
    }

    case "Half Outside Hand": {
      // Every group has a terminal or honor — penalize pure simples groups
      const simplesCount = tiles.filter(t => !isTerminalOrHonor(t.suit, t.num)).length;
      return Math.max(0, standardShanten(tiles) + Math.floor(simplesCount / 3));
    }

    case "Full Outside Hand": {
      const nonTermCount = tiles.filter(t => !isTerminal(t.suit, t.num)).length;
      return Math.max(0, standardShanten(tiles) + Math.floor(nonTermCount / 3));
    }

    case "Three Suit Sequences": {
      // Best sequence number that exists across most suits
      let best = 99;
      for (let start = 1; start <= 7; start++) {
        let need = 0;
        for (const suit of SUITS) {
          const have = overlapCount(tiles, [start,start+1,start+2].map(n=>({suit,num:n})));
          need += 3 - have;
        }
        best = Math.min(best, need + standardShanten(tiles));
      }
      return Math.max(0, best);
    }

    case "Three Suit Triplets": {
      let best = 99;
      for (let n = 1; n <= 9; n++) {
        let need = 0;
        for (const suit of SUITS) {
          const have = tiles.filter(t => t.suit === suit && t.num === n).length;
          need += Math.max(0, 3 - have);
        }
        best = Math.min(best, need + standardShanten(tiles));
      }
      return Math.max(0, best);
    }

    case "All Simples":
    default:
      return standardShanten(tiles);
  }
}

const YAKU_PROXIMITY_LIST = [
  "Seven Pairs", "All Simples", "Pinfu", "Twin Sequences",
  "All Triplets", "Half Flush", "Full Flush", "Half Outside Hand",
  "Full Outside Hand", "Straight", "Three Suit Sequences", "Three Suit Triplets",
  "All Honors", "All Terminals", "All Green", "Nine Gates",
  "Thirteen Orphans", "Three Little Dragons", "Three Big Dragons",
  "Four Little Winds", "Four Big Winds",
];

function scoreAllYaku(tiles) {
  if (tiles.length === 0) return [];
  const results = [];
  for (const name of YAKU_PROXIMITY_LIST) {
    const info = YAKU_INFO[name] || { han: "?", freq: "Unusual", desc: "" };
    const away = yakuProximity(name, tiles);
    // progress: 0 tiles = 100%, 13 tiles away = 0%
    const maxAway = 13;
    const progress = Math.max(0, Math.min(100, Math.round((1 - away / maxAway) * 100)));
    results.push({ name, tilesAway: away, progress, achieved: away <= 0, info });
  }
  return results.sort((a, b) => a.tilesAway - b.tilesAway || a.name.localeCompare(b.name));
}

// ─── Yaku Info ────────────────────────────────────────────────────────────────
// hanClosed: han value when hand is closed (tsumo or riichi ron)
// hanOpen:   han value when hand is open (called tiles); null = closed only
// yakuman:   true if this is a yakuman (scored differently)
const YAKU_INFO = {
  "Riichi":                   { hanClosed:1,  hanOpen:null, freq:"Frequent",   desc:"Declare tenpai on a closed hand. +1 if won before your next turn (Ippatsu).", closedOnly:true },
  "Ippatsu":                  { hanClosed:1,  hanOpen:null, freq:"Frequent",   desc:"Win before your next uninterrupted turn after calling Riichi.", closedOnly:true },
  "Menzen Tsumo":             { hanClosed:1,  hanOpen:null, freq:"Frequent",   desc:"Self-draw win on a fully closed hand.", closedOnly:true },
  "Double Riichi":            { hanClosed:2,  hanOpen:null, freq:"Rare",       desc:"Riichi declared on your very first uninterrupted turn.", closedOnly:true },
  "Pinfu":                    { hanClosed:1,  hanOpen:null, freq:"Frequent",   desc:"Four sequences, non-yakuhai pair, two-sided (ryanmen) wait.", closedOnly:true },
  "Twin Sequences":           { hanClosed:1,  hanOpen:null, freq:"Frequent",   desc:"Same sequence twice in one suit.", closedOnly:true },
  "Double Twin Sequences":    { hanClosed:3,  hanOpen:null, freq:"Rare",       desc:"Two pairs of identical sequences (in two suits).", closedOnly:true },
  "Nine Gates":               { hanClosed:13, hanOpen:null, freq:"Ultra Rare", desc:"1-1-1-2-3-4-5-6-7-8-9-9-9 of one suit plus any extra tile.", closedOnly:true, yakuman:true },
  "Thirteen Orphans":         { hanClosed:13, hanOpen:null, freq:"Very Rare",  desc:"One of each terminal and honor tile, plus one duplicate.", closedOnly:true, yakuman:true },
  "All Simples":              { hanClosed:1,  hanOpen:1,    freq:"Frequent",   desc:"No terminals or honors in the hand." },
  "All Triplets":             { hanClosed:2,  hanOpen:2,    freq:"Unusual",    desc:"Four triplets (pon/ankou) plus a pair." },
  "Three Suit Sequences":     { hanClosed:2,  hanOpen:1,    freq:"Unusual",    desc:"Same sequence number in all three suits." },
  "Straight":                 { hanClosed:2,  hanOpen:1,    freq:"Unusual",    desc:"1-2-3, 4-5-6, and 7-8-9 of the same suit." },
  "Half Outside Hand":        { hanClosed:2,  hanOpen:1,    freq:"Unusual",    desc:"Every group (including pair) contains a terminal or honor." },
  "Full Outside Hand":        { hanClosed:3,  hanOpen:2,    freq:"Rare",       desc:"Every group contains a terminal (no honors count)." },
  "Half Flush":               { hanClosed:3,  hanOpen:2,    freq:"Frequent",   desc:"Entire hand uses one suit plus honor tiles." },
  "Full Flush":               { hanClosed:6,  hanOpen:5,    freq:"Rare",       desc:"Entire hand is one suit, no honors." },
  "Three Suit Triplets":      { hanClosed:2,  hanOpen:2,    freq:"Rare",       desc:"Same triplet value in all three suits." },
  "Three Concealed Triplets": { hanClosed:2,  hanOpen:2,    freq:"Rare",       desc:"Three of the four triplets must be self-drawn (ankou)." },
  "Three Little Dragons":     { hanClosed:2,  hanOpen:2,    freq:"Rare",       desc:"Triplets of two dragons plus a pair of the third." },
  "Terminals and Honors":     { hanClosed:2,  hanOpen:2,    freq:"Rare",       desc:"Every tile is a terminal or honor; each group has at least one." },
  "Three Kans":               { hanClosed:2,  hanOpen:2,    freq:"Ultra Rare", desc:"Three quads (kan) declared in one hand." },
  "Robbing a Kan":            { hanClosed:1,  hanOpen:1,    freq:"Rare",       desc:"Win by taking a tile added to an opponent's open kan." },
  "Under the River":          { hanClosed:1,  hanOpen:1,    freq:"Rare",       desc:"Win by ron on the very last discard of the game." },
  "Under the Sea":            { hanClosed:1,  hanOpen:1,    freq:"Rare",       desc:"Win by tsumo on the very last draw of the game." },
  "Dead Wall Victory":        { hanClosed:1,  hanOpen:1,    freq:"Rare",       desc:"Win by drawing from the dead wall after a kan." },
  "Mangan at Draw":           { hanClosed:5,  hanOpen:5,    freq:"Ultra Rare", desc:"Exhaustive draw; only honors/terminals in your discard pile." },
  "Seven Pairs":              { hanClosed:2,  hanOpen:null, freq:"Unusual",    desc:"Seven different pairs (no repeated pairs allowed).", closedOnly:true },
  "Three Big Dragons":        { hanClosed:13, hanOpen:13,   freq:"Ultra Rare", desc:"Triplets of all three dragon tiles.", yakuman:true },
  "Four Little Winds":        { hanClosed:13, hanOpen:13,   freq:"Ultra Rare", desc:"Three wind triplets plus a pair of the fourth wind.", yakuman:true },
  "Four Big Winds":           { hanClosed:13, hanOpen:13,   freq:"Ultra Rare", desc:"Triplets of all four wind tiles.", yakuman:true },
  "All Honors":               { hanClosed:13, hanOpen:13,   freq:"Ultra Rare", desc:"Entire hand is honor tiles (winds and dragons only).", yakuman:true },
  "All Terminals":            { hanClosed:13, hanOpen:13,   freq:"Ultra Rare", desc:"Entire hand is terminal tiles (1s and 9s only).", yakuman:true },
  "All Green":                { hanClosed:13, hanOpen:13,   freq:"Ultra Rare", desc:"Entire hand uses only 2/3/4/6/8 sou and/or green dragon (Hatsu).", yakuman:true },
  "Four Kans":                { hanClosed:13, hanOpen:13,   freq:"Ultra Rare", desc:"Four quads declared in one hand.", yakuman:true },
  "Four Concealed Triplets":  { hanClosed:13, hanOpen:null, freq:"Very Rare",  desc:"All four triplets are self-drawn (no open melds).", closedOnly:true, yakuman:true },
  "Blessing of Heaven":       { hanClosed:13, hanOpen:null, freq:"Ultra Rare", desc:"Dealer wins on the first draw of the game.", closedOnly:true, yakuman:true },
  "Blessing of Earth":        { hanClosed:13, hanOpen:null, freq:"Ultra Rare", desc:"Non-dealer wins on their very first draw, before anyone calls.", closedOnly:true, yakuman:true },
};

// ─── Score Calculator ─────────────────────────────────────────────────────────
// Standard riichi scoring table (non-dealer ron, base points rounded up to nearest 100)
// Points = fu * 2^(han+2), rounded up to nearest 100, then *4 for dealer, *6 for tsumo all
const YAKUMAN_POINTS = { nonDealerRon: 32000, dealerRon: 48000, label: "Yakuman" };

function hanToPoints(han, fu = 30) {
  if (han >= 13) return YAKUMAN_POINTS;
  if (han >= 11) return { nonDealerRon: 24000, dealerRon: 36000, label: "Triple Mangan" };
  if (han >= 8)  return { nonDealerRon: 16000, dealerRon: 24000, label: "Double Mangan" };
  if (han >= 5)  return { nonDealerRon: 8000,  dealerRon: 12000, label: "Mangan" };
  // Basic points: fu * 2^(han+2)
  const basic = fu * Math.pow(2, han + 2);
  if (basic >= 2000) return { nonDealerRon: 8000, dealerRon: 12000, label: "Mangan" };
  // Round up to nearest 100
  const nonDealerRon = Math.ceil((basic * 4) / 100) * 100;
  const dealerRon    = Math.ceil((basic * 6) / 100) * 100;
  return { nonDealerRon, dealerRon, label: null };
}

function formatPoints(pts) {
  if (pts >= 1000) return (pts / 1000).toFixed(pts % 1000 === 0 ? 0 : 1) + "k";
  return pts.toString();
}

function getScoreDisplay(info, isClosed) {
  const han = isClosed ? info.hanClosed : info.hanOpen;
  if (han === null) return null;
  if (info.yakuman) return { label: "Yakuman", nonDealerRon: "32,000", dealerRon: "48,000", han: "役満", color: "#e84393" };
  const pts = hanToPoints(han);
  return {
    label: pts.label,
    han,
    nonDealerRon: formatPoints(pts.nonDealerRon),
    dealerRon: formatPoints(pts.dealerRon),
    color: pts.label === "Mangan" ? "#fdcb6e" : pts.label ? "#e84393" : null,
  };
}

const FREQ_COLORS = {
  "Frequent":   "#00b894",
  "Unusual":    "#0984e3",
  "Rare":       "#e17055",
  "Very Rare":  "#d63031",
  "Ultra Rare": "#6c5ce7",
};

const HAN_LABEL_COLORS = {
  "Mangan":        "#fdcb6e",
  "Double Mangan": "#e84393",
  "Triple Mangan": "#e84393",
  "Yakuman":       "#e84393",
};

// ─── Tile Component ───────────────────────────────────────────────────────────
function MahjongTile({ suit, num, selected, onClick, small, ghost }) {
  const key = tileKey(suit, num);
  const emoji = TILE_UNICODE[key];
  const color = suit === "honor" ? TILE_COLORS.honor : TILE_COLORS[suit];
  const size = small ? 32 : 44;

  return (
    <button
      onClick={onClick}
      style={{
        width: size,
        height: size + 8,
        border: selected ? `2px solid ${color}` : "2px solid transparent",
        borderRadius: 6,
        background: ghost ? "rgba(255,255,255,0.05)" : selected ? `${color}22` : "rgba(255,255,255,0.08)",
        cursor: onClick ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontSize: small ? 20 : 28,
        lineHeight: 1,
        padding: 2,
        transition: "all 0.15s ease",
        boxShadow: selected ? `0 0 8px ${color}88` : "none",
        opacity: ghost ? 0.25 : 1,
        position: "relative",
        userSelect: "none",
      }}
      title={tileLabel(suit, num)}
    >
      <span>{emoji}</span>
      {!small && (
        <span style={{ fontSize: 8, color: color, fontFamily: "monospace", marginTop: 1, opacity: 0.8 }}>
          {tileLabel(suit, num)}
        </span>
      )}
    </button>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function RiichiAnalyzer() {
  const [hand, setHand] = useState([]);
  const [detected, setDetected] = useState([]);
  const [tenpai, setTenpai] = useState([]);
  const [proximity, setProximity] = useState([]);
  const [activeTab, setActiveTab] = useState("build");
  const [showAll, setShowAll] = useState(false);

  const addTile = useCallback((suit, num) => {
    if (hand.length >= 13) return;
    const newHand = [...hand, { suit, num }].sort(tileSort);
    setHand(newHand);
    analyze(newHand);
  }, [hand]);

  const removeTile = useCallback((idx) => {
    const newHand = hand.filter((_, i) => i !== idx);
    setHand(newHand);
    analyze(newHand);
  }, [hand]);

  const analyze = useCallback((tiles) => {
    const yaku = detectYaku(tiles);
    setDetected(yaku);
    setProximity(scoreAllYaku(tiles));
    if (tiles.length === 13) {
      setTenpai(getTenpaiTiles(tiles));
    } else {
      setTenpai([]);
    }
  }, []);

  const clearHand = () => {
    setHand([]);
    setDetected([]);
    setTenpai([]);
    setProximity([]);
  };

  const tileCountInHand = (suit, num) => hand.filter(t => t.suit === suit && t.num === num).length;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0d0d1a 0%, #1a0d2e 50%, #0d1a2e 100%)",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: "#e8e0f5",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "20px 24px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(0,0,0,0.3)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}>
        <div style={{ fontSize: 36, filter: "drop-shadow(0 0 12px #6c5ce7)" }}>🀄</div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "0.02em",
            background: "linear-gradient(90deg, #e8e0f5, #a29bfe)", WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent" }}>
            Riichi Mahjong Analyzer
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: "#a0a0c0", marginTop: 2 }}>
            Build your hand · Detect yaku · Find tenpai waits
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {["build","yaku"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: "6px 16px", borderRadius: 20, border: "1px solid",
              borderColor: activeTab === tab ? "#a29bfe" : "rgba(255,255,255,0.15)",
              background: activeTab === tab ? "rgba(162,155,254,0.2)" : "transparent",
              color: activeTab === tab ? "#a29bfe" : "#a0a0c0",
              cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all 0.2s",
            }}>
              {tab === "build" ? "🀇 Hand Builder" : "📋 Yaku List"}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "build" ? (
        <div style={{ flex: 1, display: "flex", gap: 0, overflow: "hidden" }}>
          {/* Left: Tile Picker */}
          <div style={{
            width: 360, flexShrink: 0,
            borderRight: "1px solid rgba(255,255,255,0.08)",
            padding: "16px 16px",
            overflowY: "auto",
            background: "rgba(0,0,0,0.2)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#a29bfe",
              textTransform: "uppercase", marginBottom: 12 }}>Tile Selector</div>

            {/* Man */}
            <SuitSection label="🀇 Characters (Man)" suit="man" onAdd={addTile} handCount={tileCountInHand} />
            {/* Pin */}
            <SuitSection label="🀙 Circles (Pin)" suit="pin" onAdd={addTile} handCount={tileCountInHand} />
            {/* Sou */}
            <SuitSection label="🀐 Bamboo (Sou)" suit="sou" onAdd={addTile} handCount={tileCountInHand} />
            {/* Honors */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: "#a0a0c0", marginBottom: 6, fontWeight: 600 }}>
                🀀 Honors
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {[1,2,3,4,5,6,7].map(n => {
                  const count = tileCountInHand("honor", n);
                  const disabled = count >= 4 || hand.length >= 13;
                  return (
                    <div key={n} style={{ position: "relative" }}>
                      <MahjongTile suit="honor" num={n} onClick={disabled ? undefined : () => addTile("honor", n)} small />
                      {count > 0 && (
                        <div style={{
                          position: "absolute", top: -4, right: -4,
                          background: "#a29bfe", borderRadius: "50%",
                          width: 14, height: 14, fontSize: 9, fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#0d0d1a",
                        }}>{count}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Hand + Analysis */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
            {/* Hand Display */}
            <div style={{
              padding: "16px 20px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(0,0,0,0.15)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#a29bfe", textTransform: "uppercase" }}>
                  Your Hand ({hand.length}/13)
                </div>
                <button onClick={clearHand} style={{
                  padding: "4px 12px", borderRadius: 12, border: "1px solid rgba(255,100,100,0.3)",
                  background: "rgba(255,100,100,0.1)", color: "#ff7675", cursor: "pointer",
                  fontSize: 11, fontWeight: 600,
                }}>Clear</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, minHeight: 56 }}>
                {hand.length === 0 ? (
                  <div style={{ color: "#504070", fontSize: 13, fontStyle: "italic", alignSelf: "center" }}>
                    Click tiles on the left to build your hand...
                  </div>
                ) : hand.map((t, i) => (
                  <MahjongTile key={i} suit={t.suit} num={t.num} onClick={() => removeTile(i)} selected />
                ))}
                {Array.from({ length: 13 - hand.length }).map((_, i) => (
                  <div key={i} style={{
                    width: 44, height: 52, border: "1px dashed rgba(255,255,255,0.1)",
                    borderRadius: 6, background: "rgba(255,255,255,0.02)",
                  }} />
                ))}
              </div>
              {hand.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 10, color: "#706090" }}>
                  Click a tile to remove it
                </div>
              )}
            </div>

            {/* Tenpai waits */}
            {tenpai.length > 0 && (
              <div style={{
                margin: "16px 20px 0",
                padding: 14,
                borderRadius: 10,
                background: "rgba(0,184,148,0.1)",
                border: "1px solid rgba(0,184,148,0.25)",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#00b894", marginBottom: 8, letterSpacing: "0.08em" }}>
                  ✨ TENPAI — Waiting on:
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {tenpai.map((t, i) => (
                    <MahjongTile key={i} suit={t.suit} num={t.num} small />
                  ))}
                </div>
              </div>
            )}

            {/* Proximity-sorted Yaku List */}
            <div style={{ padding: "16px 20px", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#a29bfe", textTransform: "uppercase" }}>
                  {hand.length === 0 ? "Yaku Proximity" :
                   detected.length > 0 ? `🀄 ${detected.length} Yaku Complete!` :
                   "Yaku Proximity — Closest First"}
                </div>
                {proximity.length > 0 && (
                  <button onClick={() => setShowAll(v => !v)} style={{
                    padding: "3px 10px", borderRadius: 10, border: "1px solid rgba(162,155,254,0.3)",
                    background: "rgba(162,155,254,0.08)", color: "#a29bfe",
                    cursor: "pointer", fontSize: 11, fontWeight: 600,
                  }}>
                    {showAll ? "Show Top 10" : "Show All"}
                  </button>
                )}
              </div>

              {hand.length === 0 ? (
                <div style={{
                  padding: 20, borderRadius: 10,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px dashed rgba(255,255,255,0.08)",
                  color: "#504070", fontSize: 13, textAlign: "center",
                }}>
                  Add tiles to see how close you are to each yaku.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(showAll ? proximity : proximity.slice(0, 10)).map(({ name, tilesAway, progress, achieved, info }) => {
                    const freqColor = FREQ_COLORS[info.freq] || "#a29bfe";
                    const barColor = achieved ? "#00b894" : tilesAway <= 2 ? "#fdcb6e" : tilesAway <= 5 ? "#0984e3" : "rgba(255,255,255,0.15)";
                    const closedScore = getScoreDisplay(info, true);
                    const openScore = info.hanOpen !== null ? getScoreDisplay(info, false) : null;
                    const isClosedOnly = info.closedOnly || info.hanOpen === null;

                    return (
                      <div key={name} style={{
                        padding: "10px 13px",
                        borderRadius: 10,
                        background: achieved ? "rgba(0,184,148,0.08)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${achieved ? "rgba(0,184,148,0.3)" : "rgba(255,255,255,0.07)"}`,
                        transition: "all 0.2s ease",
                      }}>
                        {/* Row 1: icon + name + tiles-away */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, flexShrink: 0 }}>
                            {achieved ? "✅" : tilesAway <= 1 ? "🔥" : tilesAway <= 3 ? "⚡" : "◦"}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: 13, color: achieved ? "#00b894" : "#e8e0f5", flex: 1 }}>
                            {name}
                          </span>
                          {isClosedOnly && (
                            <span style={{ fontSize: 9, color: "#a29bfe", fontWeight: 700, background: "rgba(162,155,254,0.15)", padding: "1px 5px", borderRadius: 4 }}>
                              CLOSED
                            </span>
                          )}
                          <span style={{
                            fontSize: 11, fontWeight: 700, flexShrink: 0, minWidth: 62, textAlign: "right",
                            color: achieved ? "#00b894" : tilesAway <= 1 ? "#fdcb6e" : tilesAway <= 3 ? "#74b9ff" : "#706090",
                          }}>
                            {achieved ? "Complete!" : `~${tilesAway} away`}
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 7 }}>
                          <div style={{ height: "100%", borderRadius: 2, width: `${progress}%`, background: barColor, transition: "width 0.3s ease" }} />
                        </div>

                        {/* Row 2: Score badges */}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
                          {/* Closed hand score */}
                          {closedScore && (
                            <div style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "3px 8px", borderRadius: 6,
                              background: "rgba(162,155,254,0.12)",
                              border: "1px solid rgba(162,155,254,0.25)",
                            }}>
                              <span style={{ fontSize: 9, color: "#a29bfe", fontWeight: 800 }}>CLOSED</span>
                              <span style={{ fontSize: 10, fontWeight: 800, color: "#a29bfe" }}>
                                {info.yakuman ? "役満" : `${closedScore.han}✦`}
                              </span>
                              <span style={{ fontSize: 9, color: "#706090" }}>·</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: closedScore.color || "#e8e0f5" }}>
                                {closedScore.label ? `${closedScore.label} ` : ""}{closedScore.nonDealerRon}
                              </span>
                              <span style={{ fontSize: 8, color: "#504070" }}>/ {closedScore.dealerRon}</span>
                            </div>
                          )}
                          {/* Open hand score */}
                          {openScore ? (
                            <div style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "3px 8px", borderRadius: 6,
                              background: "rgba(9,132,227,0.1)",
                              border: "1px solid rgba(9,132,227,0.25)",
                            }}>
                              <span style={{ fontSize: 9, color: "#74b9ff", fontWeight: 800 }}>OPEN</span>
                              <span style={{ fontSize: 10, fontWeight: 800, color: "#74b9ff" }}>
                                {info.yakuman ? "役満" : `${openScore.han}✦`}
                              </span>
                              <span style={{ fontSize: 9, color: "#706090" }}>·</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: openScore.color || "#e8e0f5" }}>
                                {openScore.label ? `${openScore.label} ` : ""}{openScore.nonDealerRon}
                              </span>
                              <span style={{ fontSize: 8, color: "#504070" }}>/ {openScore.dealerRon}</span>
                            </div>
                          ) : !info.yakuman && (
                            <div style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "3px 8px", borderRadius: 6,
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.08)",
                            }}>
                              <span style={{ fontSize: 9, color: "#504070", fontWeight: 700 }}>OPEN</span>
                              <span style={{ fontSize: 9, color: "#504070" }}>not valid</span>
                            </div>
                          )}
                          {/* Freq tag */}
                          <span style={{
                            marginLeft: "auto", fontSize: 9, fontWeight: 700,
                            color: freqColor, alignSelf: "center",
                          }}>{info.freq}</span>
                        </div>

                        {/* Description */}
                        <div style={{ fontSize: 10, color: "#605070", lineHeight: 1.4 }}>
                          {info.desc}
                        </div>
                        {/* Score legend hint */}
                        <div style={{ fontSize: 9, color: "#3d2f4d", marginTop: 2 }}>
                          points shown: non-dealer ron / dealer ron (30 fu est.)
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <YakuListTab />
      )}
    </div>
  );
}

function SuitSection({ label, suit, onAdd, handCount }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "#a0a0c0", marginBottom: 6, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", gap: 3 }}>
        {[1,2,3,4,5,6,7,8,9].map(n => {
          const count = handCount(suit, n);
          const disabled = count >= 4;
          return (
            <div key={n} style={{ position: "relative" }}>
              <MahjongTile suit={suit} num={n} onClick={disabled ? undefined : () => onAdd(suit, n)} small />
              {count > 0 && (
                <div style={{
                  position: "absolute", top: -4, right: -4,
                  background: TILE_COLORS[suit], borderRadius: "50%",
                  width: 14, height: 14, fontSize: 9, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff",
                }}>{count}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YakuListTab() {
  const categories = [
    {
      title: "Riichi & Special",
      keys: ["Riichi","Ippatsu","Menzen Tsumo","Double Riichi"],
    },
    {
      title: "Sequences & Suits",
      keys: ["Pinfu","Twin Sequences","Double Twin Sequences","Three Suit Sequences","Straight","Half Flush","Full Flush"],
    },
    {
      title: "Triplets & Honors",
      keys: ["All Simples","All Triplets","Seven Pairs","Half Outside Hand","Full Outside Hand",
             "Three Concealed Triplets","Three Suit Triplets","Three Little Dragons","Terminals and Honors","Three Kans"],
    },
    {
      title: "Situational",
      keys: ["Robbing a Kan","Under the River","Under the Sea","Dead Wall Victory","Mangan at Draw"],
    },
    {
      title: "Yakuman",
      keys: ["Thirteen Orphans","Four Concealed Triplets","Three Big Dragons","Four Little Winds",
             "Four Big Winds","All Honors","All Terminals","All Green","Nine Gates","Four Kans",
             "Blessing of Heaven","Blessing of Earth"],
    },
  ];

  return (
    <div style={{ overflowY: "auto", flex: 1, padding: "20px 24px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* Legend */}
        <div style={{
          display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap",
          padding: "10px 14px", borderRadius: 10,
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          fontSize: 11, color: "#706090",
        }}>
          <span style={{ fontWeight: 700, color: "#a0a0c0" }}>Legend:</span>
          <span><span style={{ color: "#a29bfe", fontWeight: 700 }}>CLOSED</span> = closed hand only</span>
          <span><span style={{ color: "#74b9ff", fontWeight: 700 }}>OPEN</span> = valid after calling tiles</span>
          <span>Points shown as <span style={{ color: "#e8e0f5" }}>non-dealer ron</span> / <span style={{ color: "#a0a0c0" }}>dealer ron</span> at 30 fu</span>
          <span><span style={{ color: "#fdcb6e", fontWeight: 700 }}>Mangan</span> = score cap at 8,000 pts</span>
        </div>

        {categories.map(cat => (
          <div key={cat.title} style={{ marginBottom: 28 }}>
            <h2 style={{
              margin: "0 0 12px", fontSize: 14, fontWeight: 800,
              letterSpacing: "0.1em", textTransform: "uppercase",
              color: "#a29bfe", borderBottom: "1px solid rgba(162,155,254,0.2)",
              paddingBottom: 8,
            }}>{cat.title}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
              {cat.keys.map(key => {
                const y = YAKU_INFO[key];
                if (!y) return null;
                const freqColor = FREQ_COLORS[y.freq] || "#a29bfe";
                const closedScore = getScoreDisplay(y, true);
                const openScore = y.hanOpen !== null ? getScoreDisplay(y, false) : null;
                return (
                  <div key={key} style={{
                    padding: "11px 13px", borderRadius: 10,
                    background: y.yakuman ? "rgba(232,67,147,0.06)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${y.yakuman ? "rgba(232,67,147,0.2)" : "rgba(255,255,255,0.08)"}`,
                  }}>
                    {/* Header row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: y.yakuman ? "#e84393" : "#e8e0f5", flex: 1 }}>{key}</span>
                      {y.closedOnly && (
                        <span style={{ fontSize: 8, color: "#a29bfe", background: "rgba(162,155,254,0.15)", padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>CLOSED ONLY</span>
                      )}
                      <span style={{ fontSize: 9, color: freqColor, fontWeight: 700 }}>{y.freq}</span>
                    </div>

                    {/* Score row */}
                    <div style={{ display: "flex", gap: 5, marginBottom: 7, flexWrap: "wrap" }}>
                      {/* Closed badge */}
                      {closedScore && (
                        <div style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "3px 7px", borderRadius: 5,
                          background: "rgba(162,155,254,0.12)", border: "1px solid rgba(162,155,254,0.2)",
                        }}>
                          <span style={{ fontSize: 8, color: "#a29bfe", fontWeight: 800 }}>✕ CLOSED</span>
                          <span style={{ fontSize: 9, fontWeight: 800, color: "#a29bfe" }}>
                            {y.yakuman ? "役満" : `${closedScore.han}✦`}
                          </span>
                          <span style={{ fontSize: 9, color: closedScore.color || "#e8e0f5", fontWeight: 700 }}>
                            {closedScore.label ? closedScore.label + " " : ""}{closedScore.nonDealerRon}
                          </span>
                          <span style={{ fontSize: 8, color: "#504070" }}>/{closedScore.dealerRon}</span>
                        </div>
                      )}
                      {/* Open badge */}
                      {openScore ? (
                        <div style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "3px 7px", borderRadius: 5,
                          background: "rgba(9,132,227,0.1)", border: "1px solid rgba(9,132,227,0.2)",
                        }}>
                          <span style={{ fontSize: 8, color: "#74b9ff", fontWeight: 800 }}>◎ OPEN</span>
                          <span style={{ fontSize: 9, fontWeight: 800, color: "#74b9ff" }}>
                            {y.yakuman ? "役満" : `${openScore.han}✦`}
                          </span>
                          <span style={{ fontSize: 9, color: openScore.color || "#e8e0f5", fontWeight: 700 }}>
                            {openScore.label ? openScore.label + " " : ""}{openScore.nonDealerRon}
                          </span>
                          <span style={{ fontSize: 8, color: "#504070" }}>/{openScore.dealerRon}</span>
                        </div>
                      ) : !y.yakuman && (
                        <div style={{
                          padding: "3px 7px", borderRadius: 5,
                          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                          fontSize: 8, color: "#3d2f4d", fontWeight: 700,
                        }}>◎ OPEN — invalid</div>
                      )}
                    </div>

                    {/* Description */}
                    <p style={{ margin: 0, fontSize: 11, color: "#706090", lineHeight: 1.5 }}>{y.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ fontSize: 10, color: "#3d2f4d", textAlign: "center", paddingBottom: 20 }}>
          Point values calculated at 30 fu (standard). Actual fu may vary based on wait type, pair, and melds.
        </div>
      </div>
    </div>
  );
}
