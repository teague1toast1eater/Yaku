const { useState, useCallback, useMemo } = React;

// ─── Tile Definitions ─────────────────────────────────────────────────────────
const SUITS = ["man", "pin", "sou"];
const HONORS = ["East", "South", "West", "North", "Haku", "Hatsu", "Chun"];
const WINDS = ["East", "South", "West", "North"];
const DRAGONS = ["Haku", "Hatsu", "Chun"];

const TILE_UNICODE = {
  man1:"🀇",man2:"🀈",man3:"🀉",man4:"🀊",man5:"🀋",man6:"🀌",man7:"🀍",man8:"🀎",man9:"🀏",
  pin1:"🀙",pin2:"🀚",pin3:"🀛",pin4:"🀜",pin5:"🀝",pin6:"🀞",pin7:"🀟",pin8:"🀠",pin9:"🀡",
  sou1:"🀐",sou2:"🀑",sou3:"🀒",sou4:"🀓",sou5:"🀔",sou6:"🀕",sou7:"🀖",sou8:"🀗",sou9:"🀘",
  East:"🀀",South:"🀁",West:"🀂",North:"🀃",Haku:"🀆",Hatsu:"🀅",Chun:"🀄",
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
  if (tiles.length === 0) { results.push({ pair, melds: [...melds] }); return; }
  const sorted = [...tiles].sort(tileSort);
  const first = sorted[0];

  const triIdx = findNInSorted(sorted, first, 3);
  if (triIdx !== -1) {
    const rem = removeIndices(sorted, triIdx);
    melds.push({ type: "tri", tiles: [first, first, first] });
    _decompose(rem, pair, melds, results);
    melds.pop();
  }

  if (first.suit !== "honor" && first.num <= 7) {
    const second = { suit: first.suit, num: first.num + 1 };
    const third  = { suit: first.suit, num: first.num + 2 };
    const i2 = findInSorted(sorted, second, 1);
    const i3 = findInSorted(sorted, third, 1);
    if (i2 !== -1 && i3 !== -1) {
      const rem = removeIndices(sorted, [0, i2, i3]);
      melds.push({ type: "seq", tiles: [first, second, third] });
      _decompose(rem, pair, melds, results);
      melds.pop();
    }
  }

  if (pair === null) {
    const pairIdx = findNInSorted(sorted, first, 2);
    if (pairIdx !== -1) {
      const rem = removeIndices(sorted, pairIdx);
      _decompose(rem, { tiles: [first, first] }, melds, results);
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
  return indices.length === n ? indices : -1;
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
function detectYaku(tiles, seatWind = "East", roundWind = "East") {
  if (tiles.length !== 13 && tiles.length !== 14) return [];
  const found = [];

  if (isThirteenOrphans(tiles)) { found.push("Thirteen Orphans"); return found; }
  if (isSevenPairs(tiles)) {
    found.push("Seven Pairs");
    if (isTsuuiisou(tiles)) found.push("All Honors");
    return found;
  }

  const decomps = decompose([...tiles]);
  const valid = decomps.filter(d => d.pair && d.melds.length === 4);
  if (valid.length === 0) return found;
  const best = valid[0];

  if (isTanyao(tiles)) found.push("All Simples");
  if (isToitoi(best)) found.push("All Triplets");
  if (isPinfu(best)) found.push("Pinfu");
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
    if (num === seatNum)  { found.push(`Yakuhai (${name} — Seat Wind)`); }
    else if (num === roundNum) { found.push(`Yakuhai (${name} — Round Wind)`); }
    else if (dragonNames[num]) { found.push(`Yakuhai (${name})`); }
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
  if (tiles.length < 14) return false;
  const c = {};
  for (const t of tiles) { const k = `${t.suit}|${t.num}`; c[k] = (c[k]||0)+1; }
  const v = Object.values(c);
  return v.length === 7 && v.every(x => x === 2);
}
function isTanyao(tiles) { return tiles.every(t => !isTerminalOrHonor(t.suit, t.num)); }
function isToitoi(d) { return d.melds.every(m => m.type === "tri" || m.type === "kan"); }
function isPinfu(d) {
  if (!d.pair) return false;
  const p = d.pair.tiles[0];
  if (isHonor(p.suit)) return false;
  if (DRAGONS.includes(HONORS[p.num-1])) return false;
  return d.melds.every(m => m.type === "seq");
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
function isSanankou(d) { return d.melds.filter(m => m.type==="tri").length >= 3; }
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
  if (tiles.length < 13) return false;
  const s = new Set(tiles.map(t => t.suit));
  if (s.size!==1||s.has("honor")) return false;
  const base=[1,1,1,2,3,4,5,6,7,8,9,9,9];
  const bc={};
  for (const n of base) bc[n]=(bc[n]||0)+1;
  for (const t of tiles) { if ((bc[t.num]||0)===0) return false; bc[t.num]--; }
  return Object.values(bc).every(v => v<=0);
}
function isSuukantsu(d) { return d.melds.filter(m => m.type==="kan").length===4; }

// ─── Tenpai ───────────────────────────────────────────────────────────────────
function getTenpaiTiles(tiles, sw, rw) {
  if (tiles.length !== 13) return [];
  const all = [];
  for (const suit of SUITS) for (let n=1;n<=9;n++) all.push({suit,num:n});
  for (let n=1;n<=7;n++) all.push({suit:"honor",num:n});
  return all.filter(c => {
    const test = [...tiles, c];
    const yaku = detectYaku(test, sw, rw);
    return yaku.length > 0 || isValidWinningHand(test);
  });
}
function isValidWinningHand(tiles) {
  if (tiles.length !== 14) return false;
  if (isThirteenOrphans(tiles)) return true;
  if (isSevenPairs(tiles)) return true;
  return decompose([...tiles]).some(d => d.pair && d.melds.length===4);
}

// ─── Fu Calculation ───────────────────────────────────────────────────────────
function calcFu(decomp, seatWind, roundWind, winType="ron") {
  if (!decomp || !decomp.pair) return 30;
  let fu = winType==="tsumo" ? 20 : 30;

  const pt = decomp.pair.tiles[0];
  if (pt.suit==="honor") {
    const hn = HONORS[pt.num-1];
    if (DRAGONS.includes(hn) || hn===seatWind || hn===roundWind) fu += 2;
  }

  for (const meld of decomp.melds) {
    if (meld.type==="seq") continue;
    const t = meld.tiles[0];
    const isTerm = isTerminal(t.suit,t.num) || t.suit==="honor";
    const base = isTerm ? 8 : 4;
    fu += base * (meld.type==="kan" ? 4 : 1);
  }
  return Math.ceil(fu/10)*10;
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
  for (const c of Object.values(hc)) { if(c>=3) mentsu++; else partial++; }
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
    return Math.max(0,Math.max(0,3-have)+standardShanten(tiles));
  }
  switch(name) {
    case "Thirteen Orphans": return thirteenOrphansShanten(tiles);
    case "Seven Pairs": return sevenPairsShanten(tiles);
    case "All Simples": return standardShanten(tiles)+tiles.filter(t=>isTerminalOrHonor(t.suit,t.num)).length;
    case "All Triplets": {
      const c=countMap(tiles); let trips=0,pairs=0;
      for(const v of Object.values(c)){if(v>=3)trips++;else if(v>=2)pairs++;}
      return Math.max(0,8-2*trips-pairs);
    }
    case "Pinfu": {
      const c=countMap(tiles);
      return standardShanten(tiles)+Math.floor(Object.values(c).filter(v=>v>=3).length/2)+Math.floor(tiles.filter(t=>isHonor(t.suit)).length/3);
    }
    case "Twin Sequences": {
      const sg={};
      for(const suit of SUITS) for(let s=1;s<=7;s++) sg[`${suit}${s}`]=overlapCount(tiles,[s,s+1,s+2].map(n=>({suit,num:n})));
      const sv=Object.values(sg).sort((a,b)=>b-a);
      return Math.max(0,6-(sv[0]||0)*2+standardShanten(tiles));
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
      const c={};tiles.filter(t=>t.suit==="honor"&&[5,6,7].includes(t.num)).forEach(t=>c[t.num]=(c[t.num]||0)+1);
      return Math.max(0,[5,6,7].reduce((a,n)=>a+Math.max(0,3-(c[n]||0)),0)+standardShanten(tiles));
    }
    case "Four Big Winds": {
      const c={};tiles.filter(t=>t.suit==="honor"&&[1,2,3,4].includes(t.num)).forEach(t=>c[t.num]=(c[t.num]||0)+1);
      return Math.max(0,[1,2,3,4].reduce((a,n)=>a+Math.max(0,3-(c[n]||0)),0)+standardShanten(tiles));
    }
    case "Four Little Winds": {
      const c={};tiles.filter(t=>t.suit==="honor"&&[1,2,3,4].includes(t.num)).forEach(t=>c[t.num]=(c[t.num]||0)+1);
      const sorted=Object.entries(c).sort((a,b)=>b[1]-a[1]);
      let need=0,tn=3;
      for(const[,v] of sorted){if(tn>0){need+=Math.max(0,3-v);tn--;}else{need+=Math.max(0,2-v);break;}}
      need+=[1,2,3,4].filter(n=>!c[n]).length*3;
      return Math.max(0,need+standardShanten(tiles));
    }
    case "Three Little Dragons": {
      const c={};tiles.filter(t=>t.suit==="honor"&&[5,6,7].includes(t.num)).forEach(t=>c[t.num]=(c[t.num]||0)+1);
      let need=0;
      [5,6,7].forEach((n,i)=>{const v=c[n]||0;need+=i<2?Math.max(0,3-v):Math.max(0,2-v);});
      return Math.max(0,need+standardShanten(tiles));
    }
    case "Straight": {
      let best=99;
      for(const suit of SUITS){const h=overlapCount(tiles,[1,2,3,4,5,6,7,8,9].map(n=>({suit,num:n})));best=Math.min(best,9-h+standardShanten(tiles));}
      return Math.max(0,best);
    }
    case "Half Outside Hand": return Math.max(0,standardShanten(tiles)+Math.floor(tiles.filter(t=>!isTerminalOrHonor(t.suit,t.num)).length/3));
    case "Full Outside Hand": return Math.max(0,standardShanten(tiles)+Math.floor(tiles.filter(t=>!isTerminal(t.suit,t.num)).length/3));
    case "Three Suit Sequences": {
      let best=99;
      for(let s=1;s<=7;s++){let need=0;for(const suit of SUITS){need+=3-overlapCount(tiles,[s,s+1,s+2].map(n=>({suit,num:n})));}best=Math.min(best,need+standardShanten(tiles));}
      return Math.max(0,best);
    }
    case "Three Suit Triplets": {
      let best=99;
      for(let n=1;n<=9;n++){let need=0;for(const suit of SUITS){need+=Math.max(0,3-tiles.filter(t=>t.suit===suit&&t.num===n).length);}best=Math.min(best,need+standardShanten(tiles));}
      return Math.max(0,best);
    }
    default: return standardShanten(tiles);
  }
}

function buildProximityList(sw, rw) {
  const base = [
    "Seven Pairs","All Simples","Pinfu","Twin Sequences","All Triplets",
    "Half Flush","Full Flush","Half Outside Hand","Full Outside Hand",
    "Straight","Three Suit Sequences","Three Suit Triplets",
    "All Honors","All Terminals","All Green","Nine Gates","Thirteen Orphans",
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
  return list.map(name => {
    const info = YAKU_INFO[name] || (name.startsWith("Yakuhai") ? getYakuhaiInfo() : { hanClosed:"?", freq:"Unusual", desc:"" });
    const away = yakuProximity(name, tiles, sw, rw);
    const progress = Math.max(0, Math.min(100, Math.round((1-away/13)*100)));
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
  if (han>=13) return YAKUMAN_PTS;
  if (han>=11) return { nonDealerRon:24000, dealerRon:36000, label:"Triple Mangan" };
  if (han>=8)  return { nonDealerRon:16000, dealerRon:24000, label:"Double Mangan" };
  if (han>=5)  return { nonDealerRon:8000,  dealerRon:12000, label:"Mangan" };
  const basic = fu*Math.pow(2,han+2);
  if (basic>=2000) return { nonDealerRon:8000, dealerRon:12000, label:"Mangan" };
  return {
    nonDealerRon: Math.ceil(basic*4/100)*100,
    dealerRon:    Math.ceil(basic*6/100)*100,
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
  if (info.yakuman) return { label:"Yakuman", nonDealerRon:"32,000", dealerRon:"48,000", han:"役満", color:"#e84393" };
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
  const emoji = TILE_UNICODE[key];
  const color = TILE_COLORS[suit] || TILE_COLORS.honor;
  const bg = TILE_BG[suit] || TILE_BG.honor;
  const size = small ? 30 : 38;

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="tile-btn"
      style={{
        width: size, height: size+10, fontSize: small ? 26 : 34,
        border: selected ? `2px solid ${color}` : isDora ? `2px solid #ffd166` : `1px solid ${color}55`,
        background: selected ? `${color}28` : bg,
        boxShadow: selected
          ? `0 0 10px ${color}55, inset 0 1px 0 ${color}44`
          : isDora ? `0 0 8px #ffd16655`
          : `inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
      title={tileLabel(suit, num)}
    >
      <span className="tile-emoji">{emoji}</span>
      {!small && (
        <span className="tile-label-small" style={{ color, fontWeight:800, fontSize:8, opacity:1 }}>
          {tileLabel(suit, num)}
        </span>
      )}
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
            {TILE_UNICODE[opt]}{opt[0]}
          </button>
        ))}
      </div>
    </div>
  );
}

// Dora panel
function DoraPanel({ doraIndicators, onAddDora, onRemoveDora, redFives, onToggleRedFives }) {
  const [adding, setAdding] = useState(false);
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
                <button key={n} onClick={()=>onAddDora({suit,num:n})} style={{
                  width:26,height:30,borderRadius:4,
                  border:`1px solid ${TILE_COLORS[suit]}44`,
                  background:TILE_BG[suit],cursor:"pointer",fontSize:20,padding:0,lineHeight:1,
                }}>{TILE_UNICODE[`${suit}${n}`]}</button>
              ))}
            </div>
          ))}
          <div style={{display:"flex",gap:2}}>
            {[1,2,3,4,5,6,7].map(n=>(
              <button key={n} onClick={()=>onAddDora({suit:"honor",num:n})} style={{
                width:26,height:30,borderRadius:4,
                border:`1px solid ${TILE_COLORS.honor}44`,
                background:TILE_BG.honor,cursor:"pointer",fontSize:20,padding:0,lineHeight:1,
              }}>{TILE_UNICODE[HONORS[n-1]]}</button>
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
function ScoreSummary({ detectedYaku, doraCount, fu, isClosed }) {
  const totalHan = detectedYaku.reduce((s,y)=>s+getYakuHan(y,isClosed),0)+doraCount;
  const isYakuman = detectedYaku.some(y=>(YAKU_INFO[y]||{}).yakuman);
  const pts = isYakuman ? YAKUMAN_PTS : (totalHan>0 ? hanToPoints(totalHan,fu) : null);
  if (totalHan===0 && doraCount===0) return null;

  const lc = pts?.label==="Mangan"?"#fdcb6e":pts?.label?"#e84393":"var(--accent2)";
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
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:24,fontWeight:800,color:"var(--accent2)",lineHeight:1}}>{fu}</div>
          <div style={{fontSize:9,color:"var(--text3)",fontFamily:"'Space Mono',monospace"}}>FU</div>
        </div>
        {doraCount>0&&(
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:24,fontWeight:800,color:"#ffd166",lineHeight:1}}>+{doraCount}</div>
            <div style={{fontSize:9,color:"var(--text3)",fontFamily:"'Space Mono',monospace"}}>DORA</div>
          </div>
        )}
        {pts&&(
          <div style={{marginLeft:"auto",textAlign:"right"}}>
            {pts.label&&<div style={{fontSize:11,fontWeight:800,color:lc,marginBottom:2}}>{pts.label}</div>}
            <div style={{fontSize:20,fontWeight:800,color:lc,lineHeight:1}}>{formatPts(pts.nonDealerRon)}</div>
            <div style={{fontSize:9,color:"var(--text3)",fontFamily:"'Space Mono',monospace"}}>
              non-dealer · <span style={{color:"var(--text2)"}}>{formatPts(pts.dealerRon)}</span> dealer
            </div>
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
  const [redFives, setRedFives] = useState(false);

  const runAnalysis = useCallback((tiles, sw, rw) => {
    setDetected(detectYaku(tiles, sw, rw));
    setProximity(scoreAllYaku(tiles, sw, rw));
    setTenpai(tiles.length===13 ? getTenpaiTiles(tiles, sw, rw) : []);
  }, []);

  const addTile = useCallback((suit, num) => {
    if (hand.length>=13) return;
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
    if (hand.length<13) return 30;
    const decomps = decompose([...hand]);
    const valid = decomps.filter(d=>d.pair&&d.melds.length===4);
    if (!valid.length) return 30;
    return calcFu(valid[0], seatWind, roundWind);
  }, [hand, seatWind, roundWind]);

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
                Seat: <span style={{color:"#b09fff"}}>{TILE_UNICODE[seatWind]} {seatWind}</span>
                {" · "}Round: <span style={{color:"#3b9eff"}}>{TILE_UNICODE[roundWind]} {roundWind}</span>
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
                <div className="section-label" style={{marginBottom:0}}>Your Hand ({hand.length}/13)</div>
                <div style={{display:"flex",gap:7,alignItems:"center"}}>
                  <button onClick={()=>setIsClosed(v=>!v)} style={{
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
                {hand.length>0 && Array.from({length:13-hand.length}).map((_,i)=>(
                  <div key={i} className="hand-empty-slot"/>
                ))}
              </div>
              {hand.length>0 && <div className="hand-click-hint">Click a tile to remove it</div>}
              {detected.length>0 && (
                <ScoreSummary detectedYaku={detected} doraCount={doraCount} fu={fu} isClosed={isClosed}/>
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