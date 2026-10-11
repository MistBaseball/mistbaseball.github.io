// Balance check: like playtime.mjs, plus results per tier (MLB=n plays n MLB games after signing).
// Real time = engine clock (every tick) + human think/menu time (assumptions in T).
// Usage (web folder): MLB=12 node --experimental-strip-types scripts/balance.mjs [normal|good] [seed]
//   INN=9 for 9-inning matches. DIFF=impossible (etc.) for another difficulty and its rival AI.
import {
  BaseballEngine,
  newCareer,
  tierOf,
  PITCHES,
  RULES,
  STAGES,
  TIER_BALANCE,
} from "../lib/game/engine.ts";

const PROFILE = process.argv[2] ?? "normal";
// Balance overrides for trying settings: TUNE='{"RULES":{...},"STAGES":{"pro":{...}}}'
if (process.env.TUNE) {
  const t = JSON.parse(process.env.TUNE);
  Object.assign(RULES, t.RULES ?? {});
  for (const [k, v] of Object.entries(t.STAGES ?? {})) Object.assign(STAGES[k], v);
  for (const [k, v] of Object.entries(t.TIER ?? {})) Object.assign(TIER_BALANCE[k], v);
}
const P = {
  normal: { aim: 0.07, timing: 0.07, pitchAim: 0.14, train: 0.6, think: 2.5 },
  good: { aim: 0.04, timing: 0.045, pitchAim: 0.09, train: 0.9, think: 2.0 },
}[PROFILE];
// Human time outside the engine clock (seconds).
const T = {
  minigame: 25, // one training minigame incl. reading the result
  rest: 4,
  dayScreen: 20, // morning screen, choosing, shop browsing
  matchIntro: 10,
  matchRecap: 20, // end-of-match screen + night recap
  inningBreak: 4,
  replay: 7, // slow-motion TV window holds the next batter
  story: 90, // draft / pro entrance story screens
};

let seedN = Number(process.argv[3] ?? 1);
const rng = () => {
  seedN = (Math.imul(1664525, seedN) + 1013904223) >>> 0;
  return seedN / 4294967296;
};
const gauss = () => {
  let u = 0,
    v = 0;
  while (!u) u = rng();
  while (!v) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const c = newCareer();
c.created = true;
c.team = "triples";
c.name = "테스트";
// ROLE=pitcher|batter: a pitch-only or bat-only career (the AI plays the other half).
if (process.env.ROLE) c.role = process.env.ROLE;
const g = new BaseballEngine(c, rng);
// DIFF=baby|easy|normal|hard|impossible: difficulty, with that level's rival AI.
if (process.env.DIFF) {
  const { applyLevel } = await import("../lib/ai/levels.ts");
  g.state.difficulty = process.env.DIFF;
  applyLevel(g, process.env.DIFF);
}
let real = 0;
const milestones = {};
const stats = {
  matches: 0,
  wins: 0,
  k: 0,
  hits: 0,
  runsAllowed: 0,
  matchSec: [],
  xp: 0,
  xpTrain: 0,
  trainN: 0,
};
// Per tier: wins, draws, losses, runs for/against, our hits, their hits.
const tiers = {};
const outcomes = {};
const TRAIN = ["bullpen", "weights", "breaking", "batting", "power", "running", "sprint"];
let ti = 0;

function morning() {
  const car = g.state.career;
  real += T.dayScreen;
  while (car.actions > 0) {
    if (car.energy < 45) {
      g.train("rest");
      real += T.rest;
      continue;
    }
    let ok = false;
    for (let k = 0; k < TRAIN.length && !ok; k++) {
      ok = g.train(TRAIN[ti++ % TRAIN.length], P.train).ok;
    }
    if (!ok) g.train("rest");
    real += ok ? T.minigame : T.rest;
  }
  // STATBUY=first: XP goes into the weakest stat first (upper bound); =left: only what the
  // pitch shop leaves over; unset: stats are never bought.
  const buyStats = () => {
    for (let guard = 0; guard < 400; guard++) {
      const keys = Object.keys(car.stats).sort((a, b) => car.stats[a] - car.stats[b]);
      if (!keys.some((k) => g.buyStat(k, 1).ok)) break;
    }
  };
  if (process.env.STATBUY === "first") buyStats();
  // Shop: buy the cheapest pitch we can afford.
  const shop = PITCHES.filter((p) => p.cost && !car.pitches.includes(p.id)).sort(
    (a, b) => a.cost - b.cost,
  );
  for (const p of shop) if (car.xp >= p.cost) g.buyPitch(p.id);
  if (process.env.STATBUY === "left") buyStats();
}

function match() {
  g.start("match", Number(process.env.INN ?? 3));
  const s = () => g.state;
  const dt = 1 / 30;
  let t0 = real,
    lastReplay = s().replay,
    swingAt = null,
    flightSeen = null;
  real += T.matchIntro;
  let guard = 0;
  while (s().phase !== "finished" && guard++ < 200000) {
    const st = s();
    if (st.phase === "between") {
      real += T.inningBreak;
      g.continueInning();
      continue;
    }
    if (st.phase === "ready" && !g.batting && !g.autoHalf) {
      real += P.think;
      const owned = st.career.pitches;
      g.selectPitch(owned[Math.floor(rng() * owned.length)]);
      g.throwAt(gauss() * P.pitchAim, 0.85 + gauss() * P.pitchAim * 1.2);
      continue;
    }
    if (st.phase === "flight" && g.batting && st.flight && flightSeen !== st.flight) {
      flightSeen = st.flight;
      const f = st.flight,
        inZone = Math.abs(f.target.x) < 0.24 && f.target.y > 0.48 && f.target.y < 1.12;
      swingAt =
        rng() < (inZone ? 0.78 : 0.25) ? f.visualDuration * (0.92 + gauss() * P.timing) : null;
      const h = f.hint ?? f.target;
      g.setAim(h.x + gauss() * P.aim, h.y + gauss() * P.aim);
    }
    if (st.phase === "flight" && g.batting && swingAt !== null && st.flight.elapsed >= swingAt) {
      g.swing();
      swingAt = null;
    }
    const prevPhase = st.phase,
      wasBatting = g.batting;
    g.tick(dt);
    real += dt;
    if (prevPhase !== "result" && s().phase === "result") {
      const m = s().message,
        key = (wasBatting ? "us:" : "them:") + m;
      outcomes[key] = (outcomes[key] ?? 0) + 1;
    }
    if (s().replay !== lastReplay) {
      lastReplay = s().replay;
      real += T.replay;
    }
  }
  real += T.matchRecap;
  const st = s(),
    tier = g.state.career.stage === "high" ? "high" : tierOf(g.state.career),
    agg = (tiers[tier] ??= { n: 0, w: 0, d: 0, l: 0, rf: 0, ra: 0, h: 0, oh: 0, k: 0, e: 0 });
  agg.n++;
  if (st.score[1] > st.score[0]) agg.w++;
  else if (st.score[1] === st.score[0]) agg.d++;
  else agg.l++;
  agg.rf += st.score[1];
  agg.ra += st.score[0];
  agg.h += st.hits[1];
  agg.oh += st.hits[0];
  agg.k += g.matchStrikeouts ?? 0;
  agg.e += st.errors[0] + st.errors[1];
  stats.matches++;
  stats.xp += st.lastXpGain ?? 0;
  if (st.score[1] > st.score[0]) stats.wins++;
  stats.k += g.matchStrikeouts ?? 0;
  stats.hits += st.hits[1];
  stats.runsAllowed += st.score[0];
  stats.matchSec.push(real - t0);
}

const tierName = () => {
  const car = g.state.career;
  return car.stage === "high" ? "high" : tierOf(car);
};
let days = 0;
while (days < 400) {
  days++;
  const before = tierName();
  morning();
  match();
  const car = g.state.career;
  if (car.stage === "high" && car.draft && !milestones.draft) {
    milestones.draft = { day: car.day - 1, min: +(real / 60).toFixed(1) };
    real += T.story;
    g.enterPro();
    // enterPro starts a match screen; the next loop's start() replaces it.
  }
  if (tierName() === "first" && before === "farm" && !milestones.first)
    milestones.first = { day: car.day - 1, min: +(real / 60).toFixed(1) };
  const scouts = Object.values(car.mlbScouts ?? {});
  if (scouts.some((v) => v >= 100) && !milestones.mlbOffer)
    milestones.mlbOffer = { day: car.day - 1, min: +(real / 60).toFixed(1) };
  if (scouts.length && scouts.every((v) => v >= 100) && !milestones.allOffers) {
    milestones.allOffers = { day: car.day - 1, min: +(real / 60).toFixed(1) };
    if (!process.env.MLB) break;
    // Sign with the first club and play some hard-mode games.
    g.signMlb(Object.keys(car.mlbScouts)[0]);
    for (let k = 0; k < Number(process.env.MLB); k++) {
      morning();
      match();
    }
    break;
  }
}
const ms = stats.matchSec;
console.log(
  JSON.stringify({
    profile: PROFILE,
    seed: process.argv[3] ?? 1,
    milestones,
    matchMin: +(ms.reduce((a, b) => a + b, 0) / ms.length / 60).toFixed(2),
    perMatch: {
      win: +(stats.wins / stats.matches).toFixed(2),
      xpMatch: +(stats.xp / stats.matches).toFixed(0),
      k: +(stats.k / stats.matches).toFixed(1),
      hits: +(stats.hits / stats.matches).toFixed(1),
      runsAllowed: +(stats.runsAllowed / stats.matches).toFixed(1),
    },
    stats: g.state.career.stats,
    tiers,
    outcomes,
  }),
);
