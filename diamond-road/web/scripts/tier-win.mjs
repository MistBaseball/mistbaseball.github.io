// Win rate per stage for a player at that stage's top stats (good-player bot, 3 innings).
// Usage (web folder): node --experimental-strip-types scripts/tier-win.mjs [tier] [matches] [seed] [profile]
//   tier: high | farm | first | mlb. TUNE='{"TIER":{"mlb":{"batBoost":0.01}}}' to try values.
import { BaseballEngine, newCareer, RULES, TIER_BALANCE, MLB_TEAMS } from "../lib/game/engine.ts";

const [tier = "high", N = "30", seedArg = "1", PROFILE = "good"] = process.argv.slice(2);
if (process.env.TUNE) {
  const t = JSON.parse(process.env.TUNE);
  Object.assign(RULES, t.RULES ?? {});
  for (const [k, v] of Object.entries(t.TIER ?? {})) Object.assign(TIER_BALANCE[k], v);
}
const P = {
  normal: { aim: 0.07, timing: 0.07, pitchAim: 0.14 },
  good: { aim: 0.04, timing: 0.045, pitchAim: 0.09 },
}[PROFILE];
let seedN = Number(seedArg);
const rng = () => (seedN = (Math.imul(1664525, seedN) + 1013904223) >>> 0) / 4294967296;
const gauss = () => {
  let u = 0,
    v = 0;
  while (!u) u = rng();
  while (!v) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const cap = { high: 100, farm: 200, first: 200, mlb: 250 }[tier];
const c = newCareer();
Object.assign(c, { created: true, team: "triples", name: "테스트", form: 60 });
if (tier !== "high") Object.assign(c, { stage: "pro", club: "triples", proUnlocked: true });
if (tier === "first" || tier === "mlb") c.proGoal = true;
if (tier === "mlb") Object.assign(c, { league: "mlb", mlbClub: MLB_TEAMS[0].id });
for (const k of Object.keys(c.stats)) c.stats[k] = cap;
c.pitches = ["fastball", "slider", "curve", "changeup", "sinker", "splitter"];
const g = new BaseballEngine(c, rng);
const res = { n: 0, w: 0, d: 0, l: 0, rf: 0, ra: 0 };
for (let m = 0; m < Number(N); m++) {
  g.state.career.day = 1 + m;
  g.state.career.form = 60;
  g.start("match", 3);
  g.state.energy = 100;
  let swingAt = null,
    seen = null,
    guard = 0;
  while (g.state.phase !== "finished" && guard++ < 200000) {
    const st = g.state;
    if (st.phase === "between") {
      g.continueInning();
      continue;
    }
    if (st.phase === "ready" && !g.batting && !g.autoHalf) {
      const owned = st.career.pitches;
      g.selectPitch(owned[Math.floor(rng() * owned.length)]);
      g.throwAt(gauss() * P.pitchAim, 0.85 + gauss() * P.pitchAim * 1.2);
      continue;
    }
    if (st.phase === "flight" && g.batting && st.flight && seen !== st.flight) {
      seen = st.flight;
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
    g.tick(1 / 30);
  }
  const s = g.state;
  res.n++;
  res.rf += s.score[1];
  res.ra += s.score[0];
  if (s.score[1] > s.score[0]) res.w++;
  else if (s.score[1] === s.score[0]) res.d++;
  else res.l++;
}
console.log(JSON.stringify({ tier, ...res }));
