import assert from "node:assert/strict";
import {
  BaseballEngine,
  newCareer,
  ballistic,
  insideZone,
  V,
  PITCHES,
  distance,
  BASES,
  BASE_PATH_LENGTH,
  runnerPose,
  playerYaw,
  pitchMovement,
  contactHintRadius,
  batReach,
  DAY_ACTIONS,
  BLESSINGS,
  TEAMS,
  RULES,
  STAGES,
  RIVALS,
  swingWindow,
  wildPitchChance,
  hitsBatter,
  runnerState,
  pitchData,
  STAT_INFO,
  STAT_NAMES,
  XP,
  HOME_LINEUP,
  validOrder,
  ALL_PITCHES,
  HIDDEN_PITCHES,
  LEGEND_PITCHES,
  flutterOffset,
  statCapOf,
  visualFlightTime,
  fieldSkill,
  teamRatings,
  isDecisive,
  weatherOf,
  makeProRoster,
  formOf,
  TEAM_GROWTH,
  tierOf,
  TIER_RATINGS,
  MLB_TEAMS,
  matchTeams,
  LIMITLESS_CAP,
  LIMIT_BREAK,
  CHEER_DROP,
  fastballSpeed,
  HOME_SCHOOL,
  SCHOOLS,
  makeRoster,
  opponentSchool,
  SWING_SWEET,
  SWING_STYLES,
  pitchEnergyCost,
  TIER_BALANCE,
  PINE_TAR_BOOST,
  PINE_TAR_PENALTY,
  WALL_DISTANCE,
  WALL_HEIGHT,
  carryScale,
  HOME_RUN_DISTANCE,
  zoneCall,
  zoneMiss,
} from "../lib/game/engine.ts";
import {
  touchDistance,
  ballHitsBody,
  batterBody,
  tagReaches,
  BAG_HALF,
  LEAD,
} from "../lib/game/hitbox.ts";
import { randomSituation, runPlay, engineFor, lcg as aiSeed } from "../lib/ai/scenario.ts";
import { applyLevel } from "../lib/ai/levels.ts";

let passed = 0;
const check = (name, fn) => {
  const t0 = performance.now();
  fn();
  passed++;
  const ms = performance.now() - t0;
  console.log(`PASS ${name}${process.env.TIMING ? ` (${(ms / 1000).toFixed(1)} s)` : ""}`);
};
const seed = (n) => () => {
  n = (Math.imul(1664525, n) + 1013904223) >>> 0;
  return n / 4294967296;
};
// Most checks exercise every pitch, so give the test pitcher the whole repertoire.
const allPitches = () => {
  const c = newCareer();
  c.pitches = PITCHES.map((p) => p.id);
  return c;
};
const advance = (g, n = 400) => {
  for (let i = 0; i < n; i++) g.tick(1 / 60);
};
/** Every fielder rated 65 (skill multipliers of 1), to test the base balance. */
const evenDefense = (g, rating = 65) =>
  Object.defineProperty(g, "fielders", {
    get: () =>
      Array(9).fill({
        name: "",
        hand: "R",
        contact: 65,
        power: rating,
        eye: rating,
        speed: rating,
      }),
  });
const finishPlay = (g, dt = 1 / 60) => {
  let n = 0;
  while (g.state.phase === "inplay" && n++ < 3000) g.tick(dt);
  assert.equal(g.state.phase, "result", "live play must settle");
};

check("Ballistic endpoint and release-speed invariants over the whole aiming zone", () => {
  for (const speed of [90, 110, 135, 165])
    for (const x of [-0.7, 0, 0.7])
      for (const y of [0.15, 0.95, 1.85]) {
        const start = V(0.35, 1.85, 18.44),
          target = V(x, y, 0),
          p = ballistic(start, target, speed / 3.6);
        assert(p);
        const t = p.duration,
          end = V(
            start.x + p.velocity.x * t,
            start.y + p.velocity.y * t - 4.905 * t * t,
            start.z + p.velocity.z * t,
          );
        assert(distance(end, target) < 1e-9);
        assert(Math.abs(Math.hypot(p.velocity.x, p.velocity.y, p.velocity.z) - speed / 3.6) < 1e-8);
      }
  assert.equal(ballistic(V(), V(0, 0, 1000), 1), null);
  assert.equal(ballistic(V(), V(0, 0, 18), NaN), null);
});
check("Strike-zone boundary includes baseball radius", () => {
  assert(insideZone(V(0.25, 0.52, 0)));
  assert(!insideZone(V(0.26, 0.52, 0)));
  assert(!insideZone(V(0, 1.4, 0)));
});
check("All pitch types arrive at locked target, double-click cannot launch another ball", () => {
  for (const p of PITCHES) {
    const g = new BaseballEngine(allPitches(), seed(42));
    g.start("bullpen");
    g.selectPitch(p.id);
    assert.equal(g.state.selected, p.id);
    assert(g.throwAt(0.1, 1.1));
    const target = { ...g.state.flight.target };
    g.setAim(-0.6, 0.2);
    assert.equal(g.throwAt(), false);
    assert(distance(g.pitchPosition(1), target) < 1e-8);
    g.state.career.stats.movement = 99;
    assert(distance(g.pitchPosition(1), target) < 1e-8);
    advance(g, 110);
    assert.equal(g.state.practice.pitches, 1);
  }
});
check("Pause freezes ball and counters, reset only aborts practice pitches", () => {
  const g = new BaseballEngine(newCareer(), seed(9));
  g.throwAt();
  g.set("paused", true);
  advance(g);
  assert.equal(g.state.phase, "windup");
  assert.equal(g.state.pitchCount[1], 0);
  g.set("paused", false);
  advance(g, 45);
  assert.equal(g.state.phase, "flight");
  g.resetPitch();
  assert.equal(g.state.phase, "flight");
  g.start("bullpen");
  g.throwAt();
  g.resetPitch();
  assert.equal(g.state.phase, "ready");
  assert.equal(g.state.flight, null);
});
check("Intentional walks apply forced advances for all eight base configurations", () => {
  const expected = [
    [true, false, false],
    [true, true, false],
    [true, true, false],
    [true, true, true],
    [true, false, true],
    [true, true, true],
    [true, true, true],
    [true, true, true],
  ];
  for (let mask = 0; mask < 8; mask++) {
    const g = new BaseballEngine();
    g.state.bases = [!!(mask & 1), !!(mask & 2), !!(mask & 4)];
    assert(g.intentionalWalk());
    assert.deepEqual(g.state.bases, expected[mask]);
    assert.equal(g.state.score[0], mask === 7 ? 1 : 0);
    assert.equal(g.state.pitchCount[1], 0);
  }
});
check("Four balls walk, three strikes retire batter, two-strike foul remains two strikes", () => {
  const g = new BaseballEngine();
  for (let i = 0; i < 4; i++) g.ball();
  assert(g.state.bases[0]);
  assert.equal(g.state.balls, 0);
  for (let i = 0; i < 3; i++) g.strike(true, "test");
  assert.equal(g.state.outs, 1);
  assert.equal(g.state.strikes, 0);
  g.state.strikes = 2;
  g.foul();
  assert.equal(g.state.strikes, 2);
  assert.equal(g.state.outs, 1);
  g.state.half = "bottom";
  g.state.swingStyle = "bunt";
  g.foul();
  assert.equal(g.state.outs, 2);
  assert.equal(g.state.strikes, 0);
});
check("Single/double/triple/home run preserve runners and runs", () => {
  for (let n = 1; n <= 4; n++) {
    const g = new BaseballEngine();
    g.state.bases = [true, true, true];
    g.advanceRunners(n);
    assert.equal(g.state.score[0], n);
    assert.equal(g.state.bases.filter(Boolean).length, 4 - n);
  }
});
check("No sacrifice run on third out", () => {
  const g = new BaseballEngine(newCareer(), () => 0.1);
  g.state.half = "bottom";
  g.state.outs = 2;
  g.state.bases = [false, false, true];
  g.state.swingStyle = "bunt";
  g.contact(0.2);
  finishPlay(g);
  assert.equal(g.state.outs, 3);
  assert.equal(g.state.score[1], 0);
});
check("Manual fielding honors occupied force base and invalid throw choices", () => {
  const g = new BaseballEngine(newCareer(), () => 0.7);
  g.state.autoField = false;
  g.state.bases = [true, false, false];
  g.contact(0.25);
  Object.assign(g.state.live.fielderPos, g.state.live.land);
  assert(g.selectThrowBase(2));
  finishPlay(g);
  assert.equal(g.state.outs, 1);
  assert.deepEqual(g.state.bases, [true, false, false]);
  const b = new BaseballEngine(newCareer(), () => 0.7);
  b.state.autoField = false;
  b.contact(0.25);
  Object.assign(b.state.live.fielderPos, b.state.live.land);
  assert(b.selectThrowBase(3));
  finishPlay(b);
  assert.equal(b.state.outs, 0);
  assert(b.state.bases[0]);
});
check("Base circuit is home-first-second-third-home, and both renderers face along it", () => {
  assert(BASES[0].x < 0 && BASES[2].x > 0, "first is right from catcher looking +Z");
  for (let i = 0; i < 4; i++) {
    const r = { progress: i + 0.5, target: 4, out: false },
      p = runnerPose(r),
      a = BASES[(i + 3) % 4],
      b = BASES[i];
    assert.equal(p.position.x, (a.x + b.x) / 2);
    assert.equal(p.position.z, (a.z + b.z) / 2);
    const yaw = playerYaw(p.facing),
      facing = V(-Math.sin(yaw), 0, -Math.cos(yaw));
    assert(facing.x * p.facing.x + facing.z * p.facing.z > 0);
  }
});
check("A batter already on second cannot be retired by a late throw to first", () => {
  for (const auto of [false, true]) {
    const g = new BaseballEngine(newCareer(), () => 0.5);
    g.state.autoField = auto;
    g.contact(0.6);
    const l = g.state.live;
    l.ground = true;
    l.bounced = true;
    l.flightTime = 0.1;
    l.elapsed = 1;
    l.resultBases = 2;
    l.runners[0].progress = 2;
    l.runners[0].target = 2;
    // The fielder has the ball in shallow center: only the late throw is tested here (a ball
    // still rolling away would let the runner AI take more bases).
    l.backedUp = true;
    Object.assign(l.fielderPos, l.land);
    l.fieldedAt = 1;
    l.state = "포구";
    if (!auto) assert(g.selectThrowBase(1));
    finishPlay(g);
    assert.equal(g.state.outs, 0);
    assert.deepEqual(g.state.bases, [false, true, false]);
    assert.equal(g.state.message, "DOUBLE");
    if (auto) assert.equal(l.throws, 0);
  }
});
check("Automatic second baseman chooses a live force runner, not an already-safe batter", () => {
  const g = new BaseballEngine(newCareer(), () => 0.5);
  g.state.bases = [true, false, false];
  g.contact(0.35);
  const l = g.state.live;
  l.fielder = 3;
  l.fielderPos = l.defenders[3];
  l.elapsed = 1;
  l.flightTime = 0.1;
  l.fieldedAt = 0.7;
  l.state = "포구";
  Object.assign(l.fielderPos, BASES[1]);
  l.runners[0].progress = 1;
  l.runners[0].target = 1;
  l.runners[1].progress = 1.4;
  finishPlay(g);
  assert.equal(l.outs.length, 1);
  assert.equal(l.outs[0].runnerId, 1);
  assert.equal(l.outs[0].base, 2);
  assert(!l.runners[0].out);
});
check("Throwing to an occupied non-force base does not retire its safe runner", () => {
  const g = new BaseballEngine(newCareer(), () => 0.5);
  g.state.autoField = false;
  g.state.bases = [false, true, false];
  g.contact(0.3);
  const l = g.state.live;
  l.runners.find((r) => r.from === 2).target = 2;
  Object.assign(l.fielderPos, l.land);
  g.selectThrowBase(2);
  finishPlay(g);
  assert.equal(g.state.outs, 0);
  assert.deepEqual(g.state.bases, [true, true, false]);
});
check("Non-force outs require a tag on a runner between bases", () => {
  const g = new BaseballEngine(newCareer(), () => 0.5);
  g.state.autoField = false;
  g.state.bases = [true, false, false];
  g.contact(0.3);
  const l = g.state.live;
  l.elapsed = 1;
  l.flightTime = 0.1;
  l.fieldedAt = 0.5;
  l.state = "포구";
  l.runners[0].out = true;
  g.state.outs = 1;
  l.runners[1].progress = 1.7;
  Object.assign(l.fielderPos, BASES[1]);
  Object.assign(l.defenders[3], BASES[1]);
  g.selectThrowBase(2);
  finishPlay(g);
  assert.equal(g.state.outs, 2);
  assert.equal(l.outs[0].kind, "tag");
  assert(l.runners[1].progress < 2);
  assert.equal(g.state.message, "TAG OUT");
});
check("Runners break on contact; a fly catch retires the batter and sends them back", () => {
  const g = new BaseballEngine(newCareer(), () => 0.5);
  g.state.bases = [true, true, false];
  g.contact(0.6);
  const l = g.state.live;
  // A routine fly: the fielder is already under the ball.
  l.fielderPos.x = l.catchPoint.x;
  l.fielderPos.z = l.catchPoint.z;
  while (g.state.phase === "inplay" && !l.caughtFly) g.tick(1 / 60);
  assert(l.runners[1].progress > 1 && l.runners[2].progress > 2, "runners left on contact");
  assert(l.caughtFly);
  assert(l.runners[1].target === 1 && l.runners[2].target === 2, "runners head back");
  assert.equal(g.state.outs, 1);
  assert.equal(g.state.message, "FLY OUT");
  assert(l.fieldedAt < l.flightTime);
  assert.equal(l.throw, null);
  finishPlay(g);
  assert.equal(l.throws, 0);
  assert.deepEqual(g.state.bases, [true, true, false]);
  assert.equal(g.state.hits[0], 0);
});
check("Missed air catch lands safely; a ground pickup cannot become a fly out", () => {
  const g = new BaseballEngine(newCareer(), () => 0.5);
  g.state.autoField = false;
  g.contact(0.65);
  const l = g.state.live;
  Object.assign(l.fielderPos, V(80, 0, -2));
  while (!l.bounced) g.tick(1 / 60);
  assert.equal(g.state.outs, 0);
  assert(!l.caughtFly);
  while (l.runners.some((r) => r.progress < r.target) && g.state.phase === "inplay") g.tick(1 / 60);
  finishPlay(g);
  assert.equal(g.state.outs, 0);
  // Nobody fields it (the player's fielder stays put): the runner AI takes what it can.
  assert(["DOUBLE", "TRIPLE", "HOME RUN"].includes(g.state.message), g.state.message);
});
check("Deep fly tag-up starts only after catch; third-out fly cancels all runs", () => {
  for (const outs of [0, 2]) {
    const g = new BaseballEngine(newCareer(), () => 0.5);
    g.state.bases = [false, false, true];
    g.state.outs = outs;
    g.contact(0.8);
    const l = g.state.live;
    finishPlay(g);
    assert(l.caughtFly);
    assert.equal(l.throws, 0);
    assert.equal(g.state.outs, outs + 1);
    assert.equal(g.state.score[0], outs === 2 ? 0 : 1);
    if (outs === 0) assert(l.runners[1].scoredAt > l.fieldedAt);
  }
});
check("Pitch movement ranges match the whole actual trajectory at every tested rating", () => {
  for (const p of PITCHES)
    for (const rating of [0, 62, 99]) {
      const g = new BaseballEngine(allPitches(), seed(15));
      g.state.career.stats.movement = rating;
      g.selectPitch(p.id);
      g.throwAt();
      const f = g.state.flight,
        m = pitchMovement(p.id, rating);
      for (let i = 0; i <= 100; i++) {
        const u = i / 100,
          t = f.duration * u,
          ball = g.pitchPosition(u),
          x = ball.x - (f.start.x + f.velocity.x * t),
          y = ball.y - (f.start.y + f.velocity.y * t - 4.905 * t * t);
        assert(x >= m.minX - 1e-8 && x <= m.maxX + 1e-8);
        assert(y >= m.minY - 1e-8 && y <= m.maxY + 1e-8);
        // Wobbling pitches (palmball) sit anywhere inside the box mid-flight.
        if (i === 50 && !pitchData(p.id).flutter) {
          assert(Math.abs(x - m.x) < 1e-8);
          assert(Math.abs(y - m.y) < 1e-8);
        }
      }
    }
  assert(pitchMovement("slider", 62).x > pitchMovement("fastball", 62).x);
  assert(pitchMovement("changeup", 62).x < 0);
});
check("Close force plays agree at 30, 60 and 144 fps; simultaneous arrival is safe", () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 144])
    for (const offset of [-0.005, 0, 0.005]) {
      const g = new BaseballEngine(newCareer(), () => 0.5);
      g.state.autoField = false;
      g.contact(0.3);
      const l = g.state.live;
      l.elapsed = 1;
      l.fieldedAt = 0.5;
      l.state = "포구";
      Object.assign(l.fielderPos, BASES[0]);
      Object.assign(l.defenders[2], BASES[0]);
      // The batter's foot reaches the bag (hitbox) a stride before his body is over it.
      l.runners[0].progress =
        1 - touchDistance("run") / BASE_PATH_LENGTH - l.runners[0].pace * (0.22 + offset);
      g.beginThrow(l, 1);
      finishPlay(g, dt);
      assert.equal(g.state.outs, offset > 0 ? 1 : 0);
      if (offset > 0) assert(Math.abs(l.outs[0].time - 1.22) < 1e-8);
    }
});
check("Three outs swap sides only after explicit continue action", () => {
  const g = new BaseballEngine();
  g.state.phase = "result";
  g.state.outs = 3;
  g.next();
  assert.equal(g.state.phase, "between");
  assert.equal(g.state.half, "top");
  g.continueInning();
  assert.equal(g.state.half, "bottom");
  assert.equal(g.state.outs, 0);
  assert.equal(g.state.camera, "catcher");
  g.state.phase = "result";
  g.state.outs = 3;
  g.next();
  g.continueInning();
  assert.equal(g.state.inning, 2);
  assert.equal(g.state.half, "top");
});
check("Walk-off victory and skipped home half; tie at regulation is a draw", () => {
  const a = new BaseballEngine();
  a.state.inning = 3;
  a.state.half = "bottom";
  a.state.score = [1, 2];
  a.state.phase = "result";
  a.next();
  assert.equal(a.state.phase, "finished");
  assert.equal(a.state.career.wins, 1);
  const b = new BaseballEngine();
  b.state.inning = 3;
  b.state.outs = 3;
  b.state.score = [0, 1];
  b.state.phase = "result";
  b.next();
  assert.equal(b.state.phase, "finished");
  const c = new BaseballEngine();
  c.state.inning = 3;
  c.state.half = "bottom";
  c.state.outs = 3;
  c.state.phase = "result";
  c.next();
  assert.equal(c.state.message, "DRAW");
  assert.equal(c.state.career.games, 1);
  c.next();
  assert.equal(c.state.career.games, 1);
});
check("Abandoned games do not leak strikeouts or conceded runs to saved career", () => {
  const g = new BaseballEngine();
  g.state.strikes = 2;
  g.strike(true, "test");
  g.addRuns(2);
  assert.equal(g.state.career.strikeouts, 0);
  assert.equal(g.state.career.runs, 0);
  g.start("bullpen");
  assert.equal(g.state.career.strikeouts, 0);
  assert.equal(g.state.career.games, 0);
});
check(
  "Five actions per day; finishing a match advances the day; live match blocks training",
  () => {
    const g = new BaseballEngine();
    assert(g.train("bullpen").ok);
    // An ordinary session (good, base +1) ×2 on normal since v12.4.
    assert.equal(g.state.career.stats.control, 67);
    assert.equal(g.state.career.day, 1);
    assert.equal(g.state.career.energy, 82);
    assert.equal(g.state.career.actions, DAY_ACTIONS - 1);
    for (let i = 1; i < DAY_ACTIONS; i++) assert(g.train(i % 2 ? "rest" : "study").ok);
    assert.equal(g.state.career.actions, 0);
    assert(!g.train("rest").ok, "no actions left today");
    g.state.inning = 3;
    g.state.half = "bottom";
    g.state.outs = 3;
    g.state.phase = "result";
    g.next();
    assert.equal(g.state.phase, "finished");
    assert.equal(g.state.career.day, 2);
    assert.equal(g.state.career.actions, DAY_ACTIONS);
    assert(g.train("rest").ok);
    assert.equal(g.state.career.energy, 100);
    g.start("match");
    g.throwAt();
    assert(!g.train("weights").ok);
    g.start("bullpen");
    g.state.career.energy = 5;
    assert(!g.train("weights").ok);
    assert(!g.train("unknown").ok);
  },
);
check("Match XP is credited on finish and buys locked pitches", () => {
  const g = new BaseballEngine();
  assert.deepEqual(g.state.career.pitches, ["fastball", "slider"], "starting pitches");
  g.selectPitch("changeup");
  assert.equal(g.state.selected, "fastball", "locked pitch cannot be selected");
  assert(!g.buyPitch("changeup").ok, "no XP yet");
  g.state.strikes = 2;
  g.strike(true, "test");
  assert.equal(g.state.matchXp, XP.strikeout);
  assert.equal(g.state.career.xp, 0, "XP is credited only when the match ends");
  g.state.inning = 3;
  g.state.half = "bottom";
  g.state.outs = 3;
  g.state.score = [0, 1];
  g.state.phase = "result";
  g.next();
  const total = XP.strikeout + XP.complete + XP.win;
  assert.equal(g.state.career.xp, total);
  assert.equal(g.state.lastXpGain, total);
  // The recap lists every reason, and the lines add up to the totals.
  assert.deepEqual(
    g.state.lastXpParts.map((p) => p.label),
    ["탈삼진 ×1", "경기 완주", "승리"],
  );
  assert.equal(
    g.state.lastXpParts.reduce((a, p) => a + p.value, 0),
    g.state.lastXpGain,
  );
  const sc = g.state.lastScout;
  assert.equal(
    g.state.lastScoutParts.reduce((a, p) => a + p.value, 0),
    sc.after - sc.before,
    "scout lines add up to the real gain",
  );
  assert(g.state.lastScoutParts.some((p) => p.label === "승리"));
  g.state.career.xp = 100;
  assert(g.buyPitch("changeup").ok);
  assert.equal(g.state.career.xp, 10);
  assert(!g.buyPitch("changeup").ok, "cannot buy twice");
  assert(!g.buyPitch("slider").ok, "the slider is already known");
  g.start("bullpen");
  g.selectPitch("changeup");
  assert.equal(g.state.selected, "changeup");
  const practice = new BaseballEngine();
  practice.start("bullpen");
  practice.state.strikes = 2;
  practice.strike(true, "test");
  assert.equal(practice.state.matchXp, 0, "practice modes give no match XP");
});
check("Batting range hint always contains the pitch and shrinks as contact rises", () => {
  for (const contact of [20, 60, 99]) {
    const g = new BaseballEngine(newCareer(), seed(contact));
    g.state.career.stats.contact = contact;
    g.start("batting");
    for (let i = 0; i < 40; i++) {
      g.launch(true);
      const f = g.state.flight;
      assert(f.hint);
      assert.equal(f.hint.r, contactHintRadius(contact));
      assert(Math.hypot(f.hint.x - f.target.x, f.hint.y - f.target.y) < f.hint.r);
      g.resetPitch();
    }
  }
  assert(contactHintRadius(99) < contactHintRadius(60));
  assert(contactHintRadius(60) < contactHintRadius(20));
  assert(
    batReach(60, "contact") < contactHintRadius(60),
    "the range alone must not guarantee contact",
  );
  assert(batReach(60, "power") < batReach(60, "contact"));
  const pitcher = new BaseballEngine();
  pitcher.throwAt();
  assert.equal(pitcher.state.flight.hint, null, "no hint for the player's own pitches");
});
check("Fatigue and form affect velocity and control with identical random samples", () => {
  const a = new BaseballEngine(newCareer(), seed(3)),
    c = newCareer();
  c.energy = 15;
  c.form = 25;
  const b = new BaseballEngine(c, seed(3));
  a.throwAt(0, 0.95);
  b.throwAt(0, 0.95);
  assert(a.state.flight.speed > b.state.flight.speed);
  assert(
    distance(a.state.flight.aim, a.state.flight.target) <
      distance(b.state.flight.aim, b.state.flight.target),
  );
});
check("Draft milestones and thresholds are reachable and finalized once", () => {
  for (const [scout, result] of [
    [30, "대학 진학"],
    [50, "육성선수 계약"],
    [80, "프로 구단 지명"],
  ]) {
    const g = new BaseballEngine();
    assert(!g.draft().ok);
    g.state.career.games = 3;
    g.state.career.scout = scout;
    assert(g.draft().ok);
    assert.equal(g.state.career.draft, result);
    assert(!g.draft().ok);
  }
});
check(
  "Six complete seeded games (five 3-inning and one 9-inning) end without invalid state",
  () => {
    for (let seedId = 1; seedId <= 6; seedId++) {
      const g = new BaseballEngine(newCareer(), seed(seedId));
      g.start("match", seedId === 6 ? 9 : 3);
      let ticks = 0;
      while (g.state.phase !== "finished" && ticks++ < 100000) {
        const s = g.state;
        if (s.phase === "ready" && !g.batting) g.throwAt(((seedId % 3) - 1) * 0.12, 0.9);
        if (s.phase === "between") g.continueInning();
        if (
          s.phase === "flight" &&
          g.batting &&
          s.flight.elapsed / s.flight.visualDuration > 0.88 &&
          !s.flight.swung
        ) {
          g.setAim(s.flight.target.x, s.flight.target.y);
          g.swing();
        }
        g.tick(1 / 30);
        assert(s.outs >= 0 && s.outs <= 3);
        assert(s.balls >= 0 && s.balls < 4);
        assert(s.strikes >= 0 && s.strikes < 3);
        assert(s.bases.length === 3);
        assert(s.score.every((v) => Number.isInteger(v) && v >= 0));
        assert(Number.isFinite(s.ball.x + s.ball.y + s.ball.z));
      }
      assert.equal(g.state.phase, "finished", `seed ${seedId} did not finish`);
      assert.equal(g.state.career.games, 1);
      assert.equal(
        g.state.lines[0].reduce((a, b) => a + b, 0),
        g.state.score[0],
      );
      assert.equal(
        g.state.lines[1].reduce((a, b) => a + b, 0),
        g.state.score[1],
      );
    }
  },
);
check("Batting feedback separates timing, aim error and taking a pitch", () => {
  const cases = [
    { ratio: 0.2, x: 0, y: 0.95, timing: "early", contact: false },
    { ratio: 0.92, x: 0, y: 0.95, timing: "good", contact: true },
    { ratio: 0.99, x: 0, y: 0.95, timing: "late", contact: true },
    { ratio: 0.92, x: 0.8, y: 1.7, timing: "good", contact: false },
  ];
  for (const test of cases) {
    const g = new BaseballEngine(newCareer(), seed(17));
    g.start("batting");
    g.launch(true);
    g.state.phase = "flight";
    const f = g.state.flight;
    f.target = V(0, 0.95, 0);
    f.elapsed = f.visualDuration * test.ratio;
    g.setAim(test.x, test.y);
    assert(g.swing());
    const fixedAim = { ...f.batAim };
    g.setAim(-0.5, 0.2);
    g.resolvePitch();
    const result = g.state.batFeedback;
    assert.equal(result.timing, test.timing);
    assert.equal(result.contact, test.contact);
    assert.deepEqual(result.batAim, fixedAim);
    assert.equal(result.errorCm, Math.round(Math.hypot(test.x, test.y - 0.95) * 100));
    assert(Number.isFinite(result.offsetMs));
    g.resetPitch();
    assert.equal(g.state.batFeedback, null);
  }
  const take = new BaseballEngine(newCareer(), seed(8));
  take.start("batting");
  take.launch(true);
  take.resolvePitch();
  assert.equal(take.state.batFeedback.timing, "take");
  assert.equal(take.state.batFeedback.offsetMs, null);
  assert.equal(take.state.batFeedback.batAim, null);
});
check("Starting blessing grants exactly one random extra pitch, weighted by rarity", () => {
  const seen = {};
  for (let i = 1; i <= 400; i++) {
    const rng = seed(i);
    rng(); // consecutive small seeds give nearly equal first values
    const g = new BaseballEngine(newCareer(), rng);
    const id = g.receiveBlessing();
    assert(BLESSINGS.some((b) => b.id === id));
    assert.deepEqual(g.state.career.pitches, ["fastball", "slider", id]);
    assert.notEqual(id, "slider", "the roulette never repeats a starting pitch");
    assert.equal(g.state.career.blessing, id);
    assert.equal(g.receiveBlessing(), null, "only once per career");
    seen[id] = (seen[id] ?? 0) + 1;
  }
  assert.equal(Object.keys(seen).length, BLESSINGS.length, "every pitch can come up");
  assert(seen.changeup > seen.forkball, "rare pitches come up less often");
});
check("Balls in play: fly outs are not dominant and the result waits for the fielder", () => {
  const out = { fly: 0, hit: 0, total: 0 };
  for (let i = 1; i <= 600; i++) {
    const g = evenDefense(new BaseballEngine(newCareer(), seed(i)));
    const r = seed(i * 7 + 3);
    g.contact(0.21 + r() * 0.75, (r() - 0.5) * 0.2);
    const l = g.state.live;
    finishPlay(g);
    if (l.resultBases < 4 && !l.caughtFly) assert(l.fieldedAt !== null, "result before fielding");
    out.total++;
    if (l.caughtFly) out.fly++;
    else if (!l.outs.length) out.hit++;
  }
  assert(out.fly / out.total < 0.45, `fly out rate ${out.fly / out.total}`);
  assert(out.hit / out.total > 0.25, `hit rate ${out.hit / out.total}`);
});
check("Landed balls keep rolling; a throw is caught the moment it reaches the bag", () => {
  let rolled = 0,
    throws = 0;
  for (let i = 1; i <= 300; i++) {
    const g = new BaseballEngine(newCareer(), seed(i * 13 + 5));
    const r = seed(i * 7 + 3);
    r();
    g.state.bases = [r() < 0.4, r() < 0.3, false];
    g.contact(0.21 + r() * 0.75, (r() - 0.5) * 0.2);
    const l = g.state.live;
    if (l.resultBases < 4) {
      const after = g.liveBall(l, l.flightTime + 0.6);
      if (Math.hypot(after.x, after.z) > Math.hypot(l.land.x, l.land.z) + 0.5) rolled++;
    }
    let n = 0;
    while (g.state.phase === "inplay" && n++ < 5000) {
      g.tick(1 / 60);
      const t = l.throw;
      if (t && l.elapsed >= t.startedAt + t.duration + 1e-6) {
        assert.notEqual(t.receivedAt, null, "ball reached the bag with nobody to catch it");
        throws++;
      }
    }
  }
  assert(rolled > 250, `balls rolled after landing: ${rolled}`);
  assert(throws > 0);
});
check("A fielder still throws when the runner is close; holds only when everyone is safe", () => {
  const g = new BaseballEngine(newCareer(), () => 0.5);
  g.contact(0.3);
  const l = g.state.live;
  l.elapsed = 1;
  l.fieldedAt = 0.9;
  l.state = "포구";
  Object.assign(l.fielderPos, V(0, 0, 40));
  l.runners[0].progress = 0.97;
  assert.equal(g.chooseThrow(l), 1, "late throw to first instead of standing still");
  l.runners[0].progress = 1;
  l.runners[0].target = 1;
  assert.equal(g.chooseThrow(l), 0);
});
check("Creation spends exactly the stat budget; minigame quality sets the training gain", () => {
  const g = new BaseballEngine();
  assert.equal(g.state.career.created, false);
  const even = {
    velocity: 62,
    control: 62,
    movement: 62,
    stamina: 61,
    contact: 61,
    power: 62,
    speed: 45,
  };
  assert(!g.createPlayer("과다", { ...even, power: 80 }).ok, "over budget");
  assert(!g.createPlayer("범위", { ...even, velocity: 90, control: 34 }).ok, "outside 45–80");
  assert(g.createPlayer("  김하늘  ", even).ok);
  assert.equal(g.state.career.name, "김하늘");
  assert(g.state.career.created);
  assert.deepEqual(g.state.career.stats, even);
  // ×2 since v12.4 (×1.5 before): 0 / 2 / 4 points.
  for (const [q, gain] of [
    [0.1, 0],
    [0.6, 2],
    [0.95, 4],
    [0.6, 2],
  ]) {
    const before = g.state.career.stats.contact;
    g.state.career.energy = 100;
    g.state.career.actions = DAY_ACTIONS;
    const r = g.train("batting", q);
    assert(r.ok);
    assert.equal(g.state.career.stats.contact - before, gain);
  }
  // Easy mode: ×3 every session; normal ×2.
  const total = (difficulty, n) => {
    const e = new BaseballEngine();
    e.createPlayer("평균", even);
    e.state.difficulty = difficulty;
    const before = e.state.career.stats.control;
    for (let i = 0; i < n; i++) {
      e.state.career.energy = 100;
      e.state.career.actions = DAY_ACTIONS;
      e.state.career.stats.control = Math.min(e.state.career.stats.control, 70);
      const was = e.state.career.stats.control;
      assert(e.train("bullpen", 0.6).ok);
      if (difficulty === "easy") assert.equal(e.state.career.stats.control - was, 3);
    }
    return e;
  };
  total("easy", 3);
  const normal = new BaseballEngine();
  normal.createPlayer("평균", even);
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    normal.state.career.energy = 100;
    normal.state.career.actions = DAY_ACTIONS;
    const was = normal.state.career.stats.control;
    normal.train("bullpen", 0.6);
    sum += normal.state.career.stats.control - was;
  }
  assert.equal(sum, 20, "ten 'good' sessions = 20 points");
});
check("Dream club scout watches season matches; reaching 100 brings the contract", () => {
  const g = new BaseballEngine();
  assert(!g.chooseTeam("not-a-team"));
  assert(g.chooseTeam(TEAMS[0].id));
  g.start("match");
  assert(g.state.detail.includes(TEAMS[0].name), "scout is announced at the ballpark");
  g.state.career.scout = 95;
  g.state.inning = 3;
  g.state.half = "bottom";
  g.state.outs = 3;
  g.state.score = [0, 2];
  g.state.phase = "result";
  g.next();
  assert.deepEqual(g.state.lastScout, { before: 95, after: 100 });
  assert.equal(g.state.career.draft, `${TEAMS[0].city} ${TEAMS[0].name} 입단`);
  const low = new BaseballEngine();
  low.chooseTeam(TEAMS[1].id);
  low.state.inning = 3;
  low.state.half = "bottom";
  low.state.outs = 3;
  low.state.phase = "result";
  low.next();
  assert(low.state.lastScout.after > low.state.lastScout.before);
  assert.equal(low.state.career.draft, "");
});

check("A strong game raises the scout gauge much more than a quiet one (3–30 a match)", () => {
  const finish = (setup) => {
    const g = new BaseballEngine();
    g.chooseTeam(TEAMS[0].id);
    g.start("match");
    g.state.inning = 3;
    g.state.half = "bottom";
    g.state.outs = 3;
    setup(g);
    g.state.phase = "result";
    g.next();
    return g.state.lastScout.after - g.state.lastScout.before;
  };
  const quiet = finish((g) => (g.state.score = [2, 0])),
    strong = finish((g) => {
      g.state.score = [0, 5];
      g.state.hits = [2, 9];
    }),
    big = finish((g) => {
      g.state.score = [0, 15];
      g.state.hits = [0, 25];
    });
  assert(quiet >= RULES.gauge.min && quiet <= 6, `quiet loss ${quiet}`);
  assert(strong >= 25, `5:0 win with 9 hits ${strong}`);
  assert.equal(big, RULES.gauge.max, "one match tops out at the max");
});
check("Runners on base are not left crawling: dropped flies and grounders with a runner on first", () => {
  const plays = (half, bases, fn, n = 900) => {
    let seedN = 4242;
    const rng = () => ((seedN = (Math.imul(1664525, seedN) + 1013904223) >>> 0) / 4294967296);
    const g = new BaseballEngine(newCareer(), rng);
    g.start("match");
    for (let i = 0; i < n; i++) {
      const s = g.state;
      Object.assign(s, { half, phase: "ready", flight: null, live: null, outs: 0, balls: 0, strikes: 0 });
      s.bases = [...bases];
      g.contact(0.3 + rng() * 0.6, (rng() - 0.5) * 0.2);
      if (s.phase !== "inplay" || s.live?.kind !== "batted") continue;
      const l = s.live;
      let k = 0;
      while (s.phase === "inplay" && k++ < 4000) g.tick(1 / 60);
      fn(l, s);
    }
  };
  // A fly that drops in: the runner from first used to crawl until it landed and be forced
  // out at second (43%).
  let drops = 0,
    forced = 0;
  plays("bottom", [true, false, false], (l) => {
    if (l.ground || l.lineDrive || l.caughtFly) return;
    drops++;
    if (l.runners.find((r) => r.id === 1)?.out) forced++;
  });
  assert(drops > 30 && forced / drops < 0.15, `dropped flies: runner out ${forced}/${drops}`);
  // Grounders with a runner on first, nobody out: double plays used to be two in three.
  let grounders = 0,
    dp = 0;
  plays("bottom", [true, false, false], (l, s) => {
    if (!l.ground) return;
    grounders++;
    if (s.message === "DOUBLE PLAY") dp++;
  });
  assert(grounders > 200 && dp / grounders < 0.4 && dp / grounders > 0.08, `double plays ${dp}/${grounders}`);
});

// ── v05: hit by pitch, wild pitch, pickoff, E steal, running/fly returns, pro mode, pitches ──
const settle = (g, n = 6000) => {
  let i = 0;
  while (!["result", "between", "finished"].includes(g.state.phase) && i++ < n) g.tick(1 / 60);
  assert.equal(g.state.phase, "result", "play must reach a verdict");
};
/** Plays whole matches with simple scripted inputs; optional extra inputs per tick. */
const playMatch = (g, seedId, extra = () => {}) => {
  let ticks = 0;
  while (g.state.phase !== "finished" && ticks++ < 150000) {
    const s = g.state;
    extra(g, ticks);
    if (s.phase === "ready" && !g.batting) g.throwAt(((seedId % 3) - 1) * 0.12, 0.9);
    if (s.phase === "between") g.continueInning();
    if (
      s.phase === "flight" &&
      g.batting &&
      s.flight.elapsed / s.flight.visualDuration > 0.88 &&
      !s.flight.swung
    ) {
      g.setAim(s.flight.target.x, s.flight.target.y);
      g.swing();
    }
    g.tick(1 / 30);
    assert(s.outs >= 0 && s.outs <= 3);
    assert(s.balls >= 0 && s.balls < 4 && s.strikes >= 0 && s.strikes < 3);
    assert(s.bases.length === 3 && s.score.every((v) => Number.isInteger(v) && v >= 0));
    assert(Number.isFinite(s.ball.x + s.ball.y + s.ball.z));
    if (s.live) for (const r of s.live.runners) assert(r.progress >= 0 && r.progress <= 4);
  }
  assert.equal(g.state.phase, "finished", `seed ${seedId} did not finish`);
};
const FORCED = [
  [true, false, false],
  [true, true, false],
  [true, true, false],
  [true, true, true],
  [true, false, true],
  [true, true, true],
  [true, true, true],
  [true, true, true],
];
check(
  "A–C Hit by pitch comes from where the ball crosses; batter to first, forced runners move",
  () => {
    for (let mask = 0; mask < 8; mask++) {
      const g = new BaseballEngine(newCareer(), () => 0.5);
      g.state.bases = [!!(mask & 1), !!(mask & 2), !!(mask & 4)];
      const side = g.batter.hand === "L" ? -1 : 1;
      assert(g.throwAt(0.92 * side, 1.0), "aim at the batter's body");
      assert(!g.state.flight.wild);
      assert(hitsBatter(g.state.flight.target, g.batter.hand));
      settle(g);
      assert.equal(g.state.lastOutcome, "HitByPitch");
      assert.equal(g.state.message, "HIT BY PITCH");
      assert.deepEqual(g.state.bases, FORCED[mask], `bases after HBP, mask ${mask}`);
      assert.equal(g.state.score[0], mask === 7 ? 1 : 0, "bases loaded: runner from third scores");
      assert.equal(g.state.balls + g.state.strikes, 0, "next batter starts a fresh count");
    }
    // Over the plate or on the far side never hits the batter.
    assert(!hitsBatter(V(0, 1, 0), "R") && !hitsBatter(V(-0.9, 1, 0), "R"));
    assert(hitsBatter(V(-0.9, 1, 0), "L") && !hitsBatter(V(0.9, 0.1, 0), "R"), "feet-level miss");
    // Batting: a pitch at our batter's body that he takes is HBP; one he swings at is not.
    for (const swing of [false, true]) {
      const g = new BaseballEngine(newCareer(), () => 0.5);
      g.state.half = "bottom";
      g.state.timer = 0;
      g.tick(1 / 60);
      const side = g.batter.hand === "L" ? -1 : 1;
      g.state.flight.target = V(0.85 * side, 1.0, 0);
      g.state.flight.wild = false;
      while (g.state.phase === "windup") g.tick(1 / 60);
      if (swing) g.swing();
      settle(g);
      assert.equal(g.state.lastOutcome === "HitByPitch", !swing);
      if (!swing) assert.deepEqual(g.state.bases, [true, false, false]);
    }
  },
);
check(
  "D–E Wild pitch chance is rolled at release from stamina and rises sharply when tired",
  () => {
    assert(wildPitchChance(100) < wildPitchChance(60));
    assert(wildPitchChance(60) < wildPitchChance(20) && wildPitchChance(20) < wildPitchChance(0));
    assert(wildPitchChance(100) >= RULES.wildPitchMin && wildPitchChance(0) <= RULES.wildPitchMax);
    assert(
      wildPitchChance(50, pitchData("forkball").wild) > wildPitchChance(50),
      "data multiplier",
    );
    const rate = (energy, bases) => {
      const g = new BaseballEngine(newCareer(), seed(77));
      let wild = 0;
      for (let i = 0; i < 4000; i++) {
        g.state.phase = "ready";
        g.state.energy = energy;
        g.state.bases = [...bases];
        g.throwAt(0, 0.9);
        if (g.state.flight.wild) wild++;
      }
      return wild / 4000;
    };
    const fresh = rate(100, [true, false, false]),
      tired = rate(10, [true, false, false]);
    assert(fresh < 0.012, `fresh arm wild-pitch rate ${fresh}`);
    assert(tired > 0.045, `tired arm wild-pitch rate ${tired}`);
    assert.equal(rate(10, [false, false, false]), 0, "no runners, no wild-pitch play");
  },
);
check(
  "J Wild pitch: catcher misses, the ball goes to the backstop, runners advance, bases update",
  () => {
    const g = new BaseballEngine(newCareer(), () => 0.5);
    g.state.bases = [true, false, false];
    g.throwAt(0.3, 0.3);
    Object.assign(g.state.flight, { wild: true, target: V(0.3, 0.1, 0) });
    while (g.state.phase !== "inplay") g.tick(1 / 60);
    const l = g.state.live;
    assert.equal(l.kind, "wild");
    assert.equal(l.fielder, 1, "the catcher chases the ball");
    assert.equal(l.fieldedAt, null, "the catcher did not hold the pitch");
    assert(l.land.z < -5, "the ball got behind the plate");
    assert.equal(l.runners.find((r) => r.from === 1).target, 2);
    assert.equal(g.state.flash?.text, "폭투", "a big 폭투 callout the moment it happens");
    settle(g);
    assert.equal(g.state.message, "폭투");
    assert.equal(g.state.lastOutcome, "WildPitch");
    assert.deepEqual(g.state.bases, [false, true, false]);
    assert.equal(g.state.balls, 1, "the pitch itself still counts as a ball");
    assert.equal(g.state.outs, 0);
    // Bases loaded, ball far to the backstop: everyone moves up and the run scores.
    const b = new BaseballEngine(newCareer(), () => 0.5);
    b.state.bases = [true, true, true];
    // Away from the batter's side (a ball in the dirt at his feet would hit him).
    const away = b.batter.hand === "L" ? 0.6 : -0.6;
    b.throwAt(away, 0.2);
    Object.assign(b.state.flight, { wild: true, target: V(away, 0.09, 0) });
    settle(b);
    assert.equal(b.state.score[0], 1);
    assert.deepEqual(b.state.bases, [false, true, true], "the batter is still at the plate");
  },
);
check(
  "F E steal: runner breaks with the delivery, catcher throws to second, arrival decides",
  () => {
    const verdicts = new Set();
    // The runner on first is the previous slot: 옥동규 (speed 99) and 유동권 (speed 28).
    for (const order of [3, 5]) {
      const g = new BaseballEngine(newCareer(), () => 0.5);
      g.state.half = "bottom";
      g.state.bases = [true, false, false];
      g.state.order[1] = order;
      assert(g.steal());
      assert(g.state.stealCall, "STEAL_READY");
      while (g.state.phase === "ready") g.tick(1 / 60);
      const t = g.state.stealTrack;
      assert(t && t.stealing && !g.state.stealCall);
      const start = t.progress;
      for (let i = 0; i < 25 && g.state.phase === "windup"; i++) g.tick(1 / 60);
      assert(t.progress > start, "running during the windup");
      assert.equal(runnerState(t), "Stealing");
      while (g.state.phase === "windup" || g.state.phase === "flight") g.tick(1 / 60);
      const l = g.state.live;
      assert.equal(l.kind, "steal");
      assert.equal(l.fielder, 1);
      settle(g);
      assert.equal(l.throw.base, 2, "the catcher threw to second");
      assert.notEqual(l.throw.receivedAt, null);
      const r = l.runners.find((r) => r.from === 1);
      verdicts.add(g.state.message);
      if (g.state.message === "STOLEN BASE") {
        assert(!r.out && g.state.outs === 0);
        assert.deepEqual(g.state.bases, [false, true, false]);
      } else {
        assert.equal(g.state.message, "CAUGHT STEALING");
        assert(r.out && g.state.outs === 1 && l.outs[0].kind === "tag" && l.outs[0].base === 2);
        assert.deepEqual(g.state.bases, [false, false, false]);
        assert(l.outs[0].time >= l.throw.receivedAt - 1e-9, "tagged after the ball arrived");
      }
      assert.equal(g.state.balls, 1, "the pitch was a ball and still counts");
    }
    assert.deepEqual(
      [...verdicts].sort(),
      ["CAUGHT STEALING", "STOLEN BASE"],
      "fast safe, slow out",
    );
    // No E: nobody runs.
    const n = new BaseballEngine(newCareer(), () => 0.5);
    n.state.half = "bottom";
    n.state.bases = [true, false, false];
    while (n.state.phase === "ready") n.tick(1 / 60);
    assert.equal(n.state.stealTrack, null);
    // A ball put in play turns the steal into ordinary base running, keeping the jump.
    const c = new BaseballEngine(newCareer(), () => 0.5);
    c.state.half = "bottom";
    c.state.bases = [true, false, false];
    c.steal();
    while (c.state.phase !== "flight") c.tick(1 / 60);
    for (let i = 0; i < 20; i++) c.tick(1 / 60);
    const jump = c.state.stealTrack.progress;
    c.contact(0.5, 0);
    assert.equal(c.state.live.kind, "batted");
    assert.equal(c.state.live.runners.find((r) => r.from === 1).progress, jump);
    assert.equal(c.state.stealTrack, null);
    finishPlay(c);
    // A foul is a dead ball: the runner goes back to first.
    const f = new BaseballEngine(newCareer(), () => 0.5);
    f.state.half = "bottom";
    f.state.bases = [true, false, false];
    f.steal();
    while (f.state.phase !== "flight") f.tick(1 / 60);
    f.foul();
    assert.equal(f.state.stealTrack, null);
    assert.deepEqual(f.state.bases, [true, false, false]);
    // Second base occupied: the runner on second steals third; bases full: no steal.
    const o = new BaseballEngine();
    o.state.half = "bottom";
    o.state.bases = [true, true, false];
    assert.equal(o.stealTarget, 3);
    assert(o.steal());
    while (o.state.phase === "ready") o.tick(1 / 60);
    assert.equal(o.state.stealTrack?.from, 2);
    assert.equal(o.state.stealTrack?.target, 3);
    const full = new BaseballEngine();
    full.state.half = "bottom";
    full.state.bases = [true, true, true];
    assert(!full.steal());
    // The rival steals too (when we pitch), only with a runner who can make it.
    let tries = 0,
      made = 0;
    for (let i = 1; i <= 1500; i++) {
      const a = new BaseballEngine(newCareer(), seed(i));
      a.start("match");
      a.state.half = "top";
      a.state.bases = [true, false, false];
      a.state.order[0] = i % 9;
      a.state.phase = "ready";
      a.throwAt(0, 0.9);
      if (!a.state.stealTrack) continue;
      assert.equal(a.state.stealTrack.target, 2);
      assert.equal(a.state.message, "주자 도루!");
      tries++;
      let k = 0;
      while (a.state.phase !== "result" && k++ < 6000) a.tick(1 / 60);
      if (a.state.message === "STOLEN BASE") made++;
    }
    assert(tries > 10 && tries < 150, `rival steal tries ${tries}`);
    assert(made > 0 && made < tries, `rival steals ${made}/${tries}`);
  },
);
check("G–H Caught fly: batter out, runners RETURN; a throw beating one back retires him", () => {
  const g = new BaseballEngine(newCareer(), () => 0.5);
  g.state.bases = [true, true, false];
  g.contact(0.6);
  const l = g.state.live;
  l.fielderPos.x = l.catchPoint.x;
  l.fielderPos.z = l.catchPoint.z;
  let ranThrough = true;
  while (!l.caughtFly && g.state.phase === "inplay") {
    g.tick(1 / 60);
    if (l.elapsed > 0.2 && !l.caughtFly)
      ranThrough &&= l.runners.every((r) => runnerState(r) === "Running");
    // The runner from first got greedy and is far off the bag just before the catch.
    if (l.elapsed > l.catchAt - 0.1 && l.runners[1].progress < 1.8) l.runners[1].progress = 1.8;
  }
  assert(ranThrough, "nobody stops while the ball is in the air");
  assert.equal(runnerState(l.runners[0]), "Out", "the batter is out, not a returning runner");
  assert.equal(runnerState(l.runners[1]), "Returning");
  assert.equal(runnerState(l.runners[2]), "Returning");
  finishPlay(g);
  assert.equal(l.throw.base, 1, "throw behind the runner who strayed");
  assert(l.runners[1].out && !l.runners[2].out);
  assert.equal(g.state.outs, 2);
  assert.equal(g.state.message, "DOUBLE PLAY");
  assert.deepEqual(g.state.bases, [false, true, false], "the other runner got back safely");
  // Ball lands: runners keep going on, nobody turns back.
  const d = new BaseballEngine(newCareer(), () => 0.5);
  d.state.autoField = false;
  d.state.bases = [true, false, false];
  d.contact(0.65);
  const m = d.state.live;
  Object.assign(m.fielderPos, V(80, 0, -2));
  while (!m.bounced) d.tick(1 / 60);
  assert(m.runners.every((r) => r.target >= r.progress && r.pace === r.fullPace));
  finishPlay(d);
  assert.equal(d.state.outs, 0);
});
check("I Pickoff: runner dives back from his lead; a tag before the bag is out, else safe", () => {
  for (const [rng, out] of [
    [() => 0.999, true],
    [() => 0, false],
  ])
    for (const base of [1, 2, 3]) {
      const g = new BaseballEngine(newCareer(), rng);
      g.state.bases = [base === 1, base === 2, base === 3];
      assert(g.pickoff(base));
      const l = g.state.live;
      assert.equal(l.kind, "pickoff");
      assert.equal(l.fielder, 0, "the pitcher throws");
      assert.equal(runnerState(l.runners[0]), "Returning");
      settle(g);
      assert.equal(l.throw.base, base);
      assert.equal(g.state.message, out ? "PICKOFF OUT" : "SAFE", `base ${base}`);
      assert.equal(g.state.outs, out ? 1 : 0);
      assert.equal(g.state.bases[base - 1], !out);
      assert.equal(g.state.pitchCount[1] + g.state.balls + g.state.strikes, 0, "not a pitch");
    }
  const e = new BaseballEngine();
  assert(!e.pickoff(1), "nobody on first");
  e.state.half = "bottom";
  e.state.bases = [true, false, false];
  assert(!e.pickoff(1), "only the pitching side throws over");
});
check("K Scout 100 → contract → signing ending → pro mode, kept across reloads", () => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => (store[k] = String(v)),
  };
  try {
    const g = new BaseballEngine();
    g.chooseTeam(TEAMS[2].id);
    g.start("match");
    Object.assign(g.state, { inning: 3, half: "bottom", outs: 3, score: [0, 2], phase: "result" });
    g.state.career.scout = 96;
    g.next();
    const c = g.state.career;
    assert.equal(c.club, TEAMS[2].id, "signed with the dream club");
    assert.equal(c.stage, "high");
    assert(!c.proUnlocked, "pro opens after the ending, not before");
    assert(g.enterPro());
    assert.equal(c.stage, "pro");
    assert(c.proUnlocked && c.scout < 100);
    assert.equal(g.state.mode, "match");
    assert(g.state.detail.includes(TEAMS[2].name));
    assert(!g.draft().ok, "high-school draft no longer applies");
    const again = new BaseballEngine();
    again.load();
    assert.equal(again.state.career.stage, "pro");
    assert.equal(again.state.career.club, TEAMS[2].id);
    assert(again.state.career.proUnlocked);
    assert.equal(again.teams[1], `${TEAMS[2].name} 2군`, "a new pro starts in the 2nd team");
    // A save cannot claim pro without a club; an old save with the contract recovers its club.
    store["diamond-road-career-v1"] = JSON.stringify({ ...c, club: "", draft: "" });
    const fake = new BaseballEngine();
    fake.load();
    assert.equal(fake.state.career.stage, "high");
    const legacy = {
      ...newCareer(),
      team: TEAMS[0].id,
      draft: `${TEAMS[0].city} ${TEAMS[0].name} 입단`,
    };
    delete legacy.stage;
    delete legacy.club;
    delete legacy.proUnlocked;
    store["diamond-road-career-v1"] = JSON.stringify(legacy);
    const old = new BaseballEngine();
    old.load();
    assert.equal(old.state.career.club, TEAMS[0].id);
    assert(!old.state.career.proUnlocked, "the ending is still ahead");
    // Pro gauge: full trust reaches the new goal once.
    const p = new BaseballEngine(
      Object.assign(newCareer(), { stage: "pro", club: TEAMS[1].id, proUnlocked: true }),
    );
    p.start("match");
    Object.assign(p.state, { inning: 3, half: "bottom", outs: 3, score: [0, 2], phase: "result" });
    p.state.career.scout = 99;
    p.next();
    assert(p.state.career.proGoal);
    assert.equal(p.state.career.draft, "", "no second contract in the pros");
  } finally {
    delete globalThis.localStorage;
  }
});
check("L Pro mode is harder on every axis, still plays complete games", () => {
  const h = STAGES.high,
    p = STAGES.pro;
  assert(p.aiVelocity > h.aiVelocity && p.aiPitchKinds > h.aiPitchKinds);
  assert(p.batterContact > h.batterContact && p.batterEye > h.batterEye);
  assert(p.fielderSpeed > h.fielderSpeed && p.fielderReaction < h.fielderReaction);
  assert(p.throwSpeed > h.throwSpeed && p.catcherArm > h.catcherArm);
  assert(p.catcherTransfer < h.catcherTransfer && p.leadGamble < h.leadGamble);
  assert(swingWindow("normal", "pro") < swingWindow("normal", "high"));
  const pro = () =>
    Object.assign(newCareer(), { stage: "pro", club: TEAMS[3].id, proUnlocked: true });
  const avgSpeed = (career) => {
    const g = new BaseballEngine(career, seed(5));
    g.start("batting");
    let sum = 0;
    for (let i = 0; i < 300; i++) {
      g.state.phase = "ready";
      g.state.timer = 0;
      g.tick(1 / 60);
      sum += g.state.flight.speed;
    }
    return sum / 300;
  };
  assert(avgSpeed(pro()) > avgSpeed(newCareer()) + 4, "pro pitchers throw harder");
  // Same pitches, same seed: pro hitters put more balls in play.
  const contactRate = (career) => {
    let hit = 0;
    for (let i = 1; i <= 400; i++) {
      const g = new BaseballEngine(career(), seed(i));
      g.throwAt(0, 0.95);
      settle(g);
      if (g.state.lastOutcome === "InPlay" || g.state.lastOutcome === "Foul") hit++;
    }
    return hit;
  };
  assert(contactRate(pro) > contactRate(newCareer), "pro batters make more contact");
  for (let seedId = 1; seedId <= 3; seedId++) {
    const g = new BaseballEngine(pro(), seed(seedId * 11));
    g.start("match", 3);
    playMatch(g, seedId);
    assert.equal(g.state.career.games, 1);
  }
});
check(
  "M Data-driven pitches: all selectable, each with its own speed, break, control, stamina",
  () => {
    assert.equal(PITCHES.length, 15);
    assert.equal(new Set(PITCHES.map((p) => p.key)).size, 15, "unique keys 1–0, =, [, ], ;, '");
    // The three newer pitches keep their character.
    assert(
      pitchMovement("screwball", 75).x < 0 && pitchMovement("slider", 75).x > 0,
      "screwball breaks the other way",
    );
    assert(pitchData("screwball").stamina > 1.2, "screwball is hard on the arm");
    assert(pitchData("palmball").soft > 0 && pitchData("palmball").flutter > 0);
    assert(pitchData("eephus").delta <= -55 && pitchData("eephus").stamina < 1);
    for (const id of ["twoseam", "sinker", "forkball", "sweeper"]) assert(pitchData(id).cost > 0);
    for (const p of PITCHES) {
      const g = new BaseballEngine(allPitches(), () => 0.5);
      g.selectPitch(p.id);
      assert.equal(g.state.selected, p.id, `${p.name} selectable`);
      g.throwAt(0, 0.95);
      // rng 0.5 gives a fixed speed noise; the gap to the fastball is the data's delta.
      const fast = new BaseballEngine(allPitches(), () => 0.5);
      fast.throwAt(0, 0.95);
      if (p.maxSpeed) assert(g.state.flight.speed <= p.maxSpeed, `${p.name} stays slow`);
      else assert(Math.abs(g.state.flight.speed - fast.state.flight.speed - p.delta) < 1e-9);
    }
    // Control: harder pitches miss the target by more (same random draws).
    const miss = (id) => {
      const g = new BaseballEngine(allPitches(), seed(9));
      g.selectPitch(id);
      let sum = 0;
      for (let i = 0; i < 400; i++) {
        g.state.phase = "ready";
        g.throwAt(0, 0.95);
        sum += Math.hypot(g.state.flight.target.x, g.state.flight.target.y - 0.95);
      }
      return sum;
    };
    assert(miss("forkball") > miss("sweeper") && miss("sweeper") > miss("fastball"));
    // Stamina: one pitch of each costs energy in proportion to its data.
    const cost = (id) => {
      const g = new BaseballEngine(allPitches(), seed(4));
      g.selectPitch(id);
      g.throwAt(0, 0.95);
      while (g.state.phase === "windup") g.tick(1 / 60);
      return 100 - g.state.energy;
    };
    assert(
      Math.abs(
        cost("forkball") / cost("fastball") -
          pitchData("forkball").stamina / pitchData("fastball").stamina,
      ) < 1e-9,
    );
    // Movement: each new pitch bends its own way.
    const bends = ["twoseam", "sinker", "forkball", "sweeper"].map((id) => {
      const m = pitchMovement(id, 75);
      return `${Math.round(m.x * 100)},${Math.round(m.y * 100)}`;
    });
    assert.equal(new Set(bends).size, 4);
    // Batter reaction comes from data: sinkers induce weaker contact, sweepers more misses.
    assert(pitchData("sinker").soft > pitchData("fastball").soft);
    assert(pitchData("sweeper").whiff > pitchData("twoseam").whiff);
  },
);
check("Season games with steals, pickoffs and tired arms still end in a valid state", () => {
  for (let seedId = 1; seedId <= 4; seedId++) {
    const g = new BaseballEngine(allPitches(), seed(seedId * 23));
    g.start("match", 3);
    playMatch(g, seedId, (g, t) => {
      const s = g.state;
      if (t % 7 === 0) s.energy = Math.max(5, s.energy - 3);
      if (s.phase === "ready" && g.batting && s.bases[0] && !s.bases[1] && !s.stealCall) g.steal();
      if (s.phase === "ready" && !g.batting && s.bases[0] && t % 5 === 0) g.pickoff(1);
    });
    const l0 = g.state.lines[0].reduce((a, b) => a + b, 0),
      l1 = g.state.lines[1].reduce((a, b) => a + b, 0);
    assert.equal(l0, g.state.score[0]);
    assert.equal(l1, g.state.score[1]);
  }
});

check("Stat guide numbers come from the game's own formulas; movement changes AI batters", () => {
  assert.equal(STAT_NAMES.stamina, "지구력", "never confused with the energy bar (체력)");
  for (const [k, info] of Object.entries(STAT_INFO)) {
    const lo = info.metric(50),
      hi = info.metric(80);
    assert(Number.isFinite(lo) && Number.isFinite(hi), k);
    assert(info.lowerIsBetter ? hi < lo : hi > lo, `${k}: a higher rating must help`);
  }
  // Velocity: an unhurried fastball at 100% effort equals the guide's number.
  const c = newCareer();
  const g = new BaseballEngine(c, () => 0.5);
  g.state.effort = 100;
  g.state.career.form = 100;
  g.throwAt(0, 0.95);
  // rng 0.5 gives the speed noise gaussian = sqrt(-2 ln 0.5) * cos(pi), times 0.9 km/h.
  const noise = Math.sqrt(-2 * Math.log(0.5)) * Math.cos(Math.PI) * 0.9;
  assert(Math.abs(g.state.flight.speed - fastballSpeed(c.stats.velocity) - noise) < 1e-9);
  // Stamina: one fastball costs exactly the guide's per-pitch cost.
  const e = new BaseballEngine(newCareer(), () => 0.5);
  e.throwAt(0, 0.95);
  while (e.state.phase === "windup") e.tick(1 / 60);
  assert(
    Math.abs(
      100 -
        e.state.energy -
        pitchEnergyCost(90, e.state.career.stats.stamina) * pitchData("fastball").stamina,
    ) < 1e-9,
  );
  // Movement: same pitches and seeds, better movement → fewer balls put in play by AI batters.
  const inPlay = (movement) => {
    let n = 0;
    for (let i = 1; i <= 500; i++) {
      const career = allPitches();
      career.stats.movement = movement;
      const m = new BaseballEngine(career, seed(i));
      m.selectPitch("slider");
      m.throwAt(0, 0.95);
      while (!["result", "inplay"].includes(m.state.phase)) m.tick(1 / 60);
      if (m.state.phase === "inplay" || m.state.lastOutcome === "Foul") n++;
    }
    return n;
  };
  assert(inPlay(85) < inPlay(45), "a sharper slider is harder to hit");
  // Every learnable pitch can also come from the starting roulette.
  for (const id of ["twoseam", "sinker", "forkball", "sweeper"])
    assert(
      BLESSINGS.some((b) => b.id === id),
      id,
    );
  assert.equal(
    BLESSINGS.reduce((a, b) => a + b.weight, 0),
    100,
    "odds add up to 100%",
  );
});

check("Pickoffs: about a quarter out on the first throw, rarer after, and never free", () => {
  const rates = [0, 0, 0],
    n = 500;
  for (let i = 1; i <= n; i++) {
    const g = new BaseballEngine(newCareer(), seed(i * 31));
    const base = 1 + (i % 3);
    for (let k = 0; k < 3; k++) {
      Object.assign(g.state, { bases: [base === 1, base === 2, base === 3], outs: 0 });
      Object.assign(g.state, { phase: "ready", live: null });
      const before = g.state.energy;
      assert(g.pickoff(base));
      assert(g.state.energy < before, "a throw-over costs the pitcher energy");
      settle(g);
      if (g.state.message === "PICKOFF OUT") rates[k]++;
    }
    assert.equal(g.state.pickoffs, 3);
    g.advanceBatter();
    assert.equal(g.state.pickoffs, 0, "a new batter resets the runner's caution");
  }
  const [first, second, third] = rates.map((r) => r / n);
  assert(first > 0.15 && first < 0.35, `first pickoff out rate ${first}`);
  assert(second < first && third < second, `caution: ${first} ${second} ${third}`);
});
check("Swing styles: contact is forgiving, power is narrow but carries, bunts die in front", () => {
  const c = SWING_STYLES.contact,
    p = SWING_STYLES.power;
  assert(p.reach < c.reach && p.window < c.window && p.boost > c.boost);
  assert(c.cut > 1 && p.cut === 0);
  assert(swingWindow("normal", "high", "power") < swingWindow("normal", "high", "contact"));
  // A contact near miss is fouled off; the same swing with power is a strike.
  for (const [style, foul] of [
    ["contact", true],
    ["power", false],
  ]) {
    const g = new BaseballEngine(newCareer(), () => 0.5);
    g.state.half = "bottom";
    g.state.swingStyle = style;
    g.state.strikes = 2;
    while (g.state.phase !== "flight") g.tick(1 / 60);
    const f = g.state.flight,
      reach = batReach(g.state.career.stats.contact, "contact");
    f.swung = true;
    f.swingTime = SWING_SWEET * f.visualDuration;
    f.batAim = { x: f.target.x + reach * 1.3, y: f.target.y, z: 0 };
    while (g.state.phase === "flight") g.tick(1 / 60);
    assert.equal(g.state.lastOutcome === "Foul", foul, style);
    assert.equal(g.state.outs, foul ? 0 : 1, "two-strike near miss: contact survives");
  }
  // Bunts: short slow rollers the catcher can field; sacrifices move the runner up.
  let hits = 0,
    advanced = 0;
  for (let i = 1; i <= 300; i++) {
    const g = new BaseballEngine(newCareer(), seed(i * 104729 + 7));
    g.state.half = "bottom";
    g.state.swingStyle = "bunt";
    g.state.bases = [i % 2 === 0, false, false];
    while (g.state.phase !== "flight") g.tick(1 / 60);
    const f = g.state.flight;
    f.swung = true;
    f.swingTime = SWING_SWEET * f.visualDuration;
    f.batAim = { ...f.target };
    while (g.state.phase === "flight") g.tick(1 / 60);
    const l = g.state.live;
    assert(l && l.bunt, "a clean bunt is put in play");
    const d = Math.hypot(l.land.x, l.land.z);
    assert(d >= RULES.buntMin - 1e-9 && d <= RULES.buntMax + 1e-9, `bunt distance ${d}`);
    // Where the untouched ball would come to rest (test-only access to the ball path).
    const still = g.liveBall(l, 30),
      rest = Math.hypot(still.x, still.z);
    assert(rest < RULES.buntMax + 2, `a bunt must not roll away (${rest} m)`);
    finishPlay(g);
    if (!l.runners[0].out) hits++;
    const runner = l.runners.find((r) => r.from === 1);
    if (runner && !runner.out && runner.progress >= 2) advanced++;
  }
  // Perfectly placed bunts: a real chance at a hit, still mostly outs.
  assert(hits > 30 && hits < 190, `bunt hits ${hits}/300`);
  assert(advanced > 120, `sacrifice advances ${advanced}/150`);
});
check("Steal sign is accepted while the last result is shown and carries to the next pitch", () => {
  const g = new BaseballEngine(newCareer(), () => 0.5);
  g.state.half = "bottom";
  g.state.bases = [true, false, false];
  g.result("BALL", "test");
  assert.equal(g.state.phase, "result");
  assert(g.steal(), "E during the result display");
  assert.equal(g.state.message, "BALL", "the result stays on screen");
  g.next();
  assert(g.state.stealCall, "the sign survives into the next pitch");
  g.state.outs = 3;
  g.state.phase = "result";
  g.state.stealCall = false;
  assert(!g.steal(), "no sign after the third out");
});
check("Stat caps: 100 in high school, 200 in the pros, where the fastball reaches 170", () => {
  assert.equal(STAGES.high.statCap, 100);
  assert.equal(STAGES.pro.statCap, 200);
  assert(Math.abs(fastballSpeed(100) - 153) < 1e-9 && Math.abs(fastballSpeed(200) - 170) < 1e-9);
  // Every stat formula keeps improving past 100 and stays sane at 200.
  for (const [k, info] of Object.entries(STAT_INFO)) {
    const a = info.metric(100),
      b = info.metric(200);
    assert(Number.isFinite(b) && b > 0, k);
    assert(info.lowerIsBetter ? b < a : b > a, `${k} improves past 100`);
  }
  const hs = new BaseballEngine(newCareer(), () => 0.99);
  hs.state.career.stats.control = 100;
  hs.state.career.energy = 100;
  hs.state.actions = 5;
  assert(!hs.train("bullpen", 1).ok, "high-school cap is 100");
  hs.devGauge99();
  assert.equal(hs.state.career.scout, 99, "dev: scout gauge to 99");
  hs.devSetStats(100);
  assert(Object.values(hs.state.career.stats).every((v) => v === 100));
  assert.equal(statCapOf(hs.state.career), 100, "the 100 button keeps the high-school cap");
  hs.devSetStats(200);
  assert(Object.values(hs.state.career.stats).every((v) => v === 200));
  assert.equal(
    statCapOf(hs.state.career),
    200,
    "the 200 button lifts the cap, even in high school",
  );
  const pro = new BaseballEngine(
    Object.assign(newCareer(), { stage: "pro", club: TEAMS[0].id, proUnlocked: true }),
    () => 0.5,
  );
  const before = pro.state.career.stats.control;
  assert(pro.train("bullpen", 1).ok);
  assert.equal(
    pro.state.career.stats.control,
    before + 8,
    "pro training gains are doubled (×2 → 8)",
  );
  pro.devSetStats(200);
  assert(Object.values(pro.state.career.stats).every((v) => v === 200));
  pro.state.effort = 100;
  pro.state.career.form = 100;
  pro.start("bullpen");
  pro.state.effort = 100;
  pro.state.energy = 100;
  pro.throwAt(0, 0.95);
  // rng 0.5 adds a fixed −1.06 km/h of release noise to the 170 km/h fastball.
  const noise = Math.sqrt(-2 * Math.log(0.5)) * Math.cos(Math.PI) * 0.9;
  assert(Math.abs(pro.state.flight.speed - (170 + noise)) < 1e-6, `${pro.state.flight.speed}`);
});
check("Speed stat: older saves get it, and it drives our player's base running", () => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => (store[k] = String(v)),
  };
  try {
    const old = newCareer();
    delete old.stats.speed;
    old.name = "예전선수";
    store["diamond-road-career-v1"] = JSON.stringify(old);
    const g = new BaseballEngine();
    g.load();
    assert.equal(g.state.career.name, "예전선수", "an old save is not thrown away");
    assert.equal(g.state.career.stats.speed, newCareer().stats.speed);
  } finally {
    delete globalThis.localStorage;
  }
  const fast = new BaseballEngine(newCareer()),
    slow = new BaseballEngine(newCareer());
  for (const e of [fast, slow]) {
    e.state.half = "bottom";
    e.state.order[1] = 0;
  }
  fast.state.career.stats.speed = 95;
  slow.state.career.stats.speed = 40;
  assert.equal(fast.batter.name, fast.state.career.name, "slot 0 is the player");
  assert(fast.runnerPace(fast.batter.speed) > slow.runnerPace(slow.batter.speed));
  assert(STAT_INFO.speed.metric(95) < STAT_INFO.speed.metric(40), "faster to first");
});
check("미산고 vs a new rival school each day; every school's players never change", () => {
  const c = newCareer();
  assert.equal(matchTeams(c)[1], HOME_SCHOOL);
  const names = new Set();
  for (let day = 1; day <= SCHOOLS.length; day++) names.add(matchTeams({ ...c, day })[0]);
  assert.equal(names.size, SCHOOLS.length, "a different school each match day");
  assert.notEqual(opponentSchool(1).name, opponentSchool(2).name);
  for (const school of SCHOOLS) {
    const a = makeRoster(school.name, school.strength, school.style),
      b = makeRoster(school.name, school.strength, school.style);
    assert.equal(a.lineup.length, 9);
    assert.deepEqual(a, b, "same school, same players");
    assert.equal(new Set(a.lineup.map((p) => p.name)).size, 9, "nine different players");
    for (const p of a.lineup)
      for (const k of ["contact", "power", "eye", "speed"]) assert(p[k] >= 35 && p[k] <= 95);
  }
  // Different schools field different players, and the strong school is stronger.
  const weak = SCHOOLS.reduce((a, b) => (a.strength < b.strength ? a : b)),
    strong = SCHOOLS.reduce((a, b) => (a.strength > b.strength ? a : b)),
    avg = (r) => r.lineup.reduce((t, p) => t + p.contact + p.power, 0) / 9;
  assert(
    avg(makeRoster(strong.name, strong.strength, strong.style)) >
      avg(makeRoster(weak.name, weak.strength, weak.style)),
  );
  // The engine bats the day's school, and its ace changes the AI pitcher.
  const g = new BaseballEngine(newCareer(), () => 0.5);
  g.state.career.day = 1;
  assert.equal(
    g.batter.name,
    makeRoster(SCHOOLS[0].name, SCHOOLS[0].strength, SCHOOLS[0].style).lineup[0].name,
  );
  const speedOn = (day) => {
    const e = new BaseballEngine(newCareer(), () => 0.5);
    e.state.career.day = day;
    e.start("batting");
    e.state.timer = 0;
    e.tick(1 / 60);
    return e.state.flight.speed;
  };
  const weakDay = SCHOOLS.indexOf(weak) + 1,
    strongDay = SCHOOLS.indexOf(strong) + 1;
  assert(speedOn(strongDay) > speedOn(weakDay), "a stronger school's ace throws harder");
});
check(
  "Scout recap lines always add up, including caps; player leads off, teammates bat 2–9",
  () => {
    // A blowout loss: the gain is held at the minimum and the recap says so.
    for (const [score, hits, ks] of [
      [[9, 0], 0, 0],
      [[0, 8], 14, 12],
    ]) {
      const g = new BaseballEngine();
      g.start("match");
      Object.assign(g.state, { inning: 3, half: "bottom", outs: 3, phase: "result", score });
      g.state.hits = [0, hits];
      for (let k = 0; k < ks; k++) {
        g.state.strikes = 2;
        g.state.half = "top";
        g.strike(true, "k");
      }
      Object.assign(g.state, { inning: 3, half: "bottom", outs: 3, phase: "result" });
      const before = g.state.career.scout;
      g.next();
      const parts = g.state.lastScoutParts,
        sum = parts.reduce((a, p) => a + p.value, 0);
      assert.equal(sum, g.state.career.scout - before);
      assert(parts.some((p) => p.label.includes(score[0] > score[1] ? "최소" : "최대")));
    }
    // The player leads off; slots 2–9 bat (and run) with the teammate's own stats.
    const g = new BaseballEngine();
    g.state.half = "bottom";
    for (let slot = 0; slot < 9; slot++) {
      g.state.order[1] = slot;
      const runner = g.ourRunner(slot);
      assert.deepEqual(g.batter, runner, "the hitter is the one who then runs");
      if (slot === 0) {
        assert.equal(g.batter.name, g.state.career.name, "the player is the leadoff hitter");
        assert.equal(g.batter.contact, g.state.career.stats.contact);
        assert.equal(g.batter.power, g.state.career.stats.power);
        assert(g.playerUp);
      } else {
        const t = HOME_LINEUP[slot];
        assert.equal(g.batter.name, t.name);
        assert.deepEqual(
          [g.batter.contact, g.batter.power, g.batter.eye, g.batter.speed],
          [t.contact, t.power, t.eye, t.speed],
        );
        assert(!g.playerUp);
      }
    }
    // Their contact really changes the at-bat: a wider bat reach for 김영호 (99) than 이지섭 (55).
    const reachOf = (slot) => {
      const x = new BaseballEngine(newCareer(), () => 0.5);
      x.start("match");
      x.state.half = "bottom";
      x.state.order[1] = slot;
      return batReach(x.batter.contact, "contact");
    };
    assert(reachOf(3) > reachOf(7));
    // Batting practice is always the player.
    const cage = new BaseballEngine();
    cage.start("batting");
    cage.state.order[1] = 5;
    assert.equal(cage.batter.name, cage.state.career.name);
    const named = HOME_LINEUP.slice(1);
    assert.equal(named.length, 8);
    assert(
      named.every((p) => p.nick),
      "all eight teammates have a nickname",
    );
    const by = (n) => named.find((p) => p.name === n);
    assert(["contact", "power", "eye", "speed"].every((k) => by("김영호")[k] === 99));
    assert(by("박시우").contact >= 90 && by("박시우").power >= 90);
    assert(by("양서준").contact >= 90 && by("양서준").power >= 90);
    assert(
      by("옥동규").speed === Math.max(...named.map((p) => (p.name === "김영호" ? 0 : p.speed))),
    );
    for (const n of ["이지섭", "유동권"]) assert(by(n).speed <= 35 && by(n).power >= 95);
  },
);
check("Hidden knuckleball: secret unlock at minimum velocity and movement 75+", () => {
  assert.equal(PITCHES.length, 15, "the shop list (knuckleball stays out of it)");
  assert(!PITCHES.some((p) => p.id === "knuckle") && HIDDEN_PITCHES[0].id === "knuckle");
  assert.equal(new Set(ALL_PITCHES.map((p) => p.key)).size, ALL_PITCHES.length, "unique keys");
  const at = (velocity, movement) => {
    const c = newCareer();
    Object.assign(c.stats, { velocity, movement });
    return new BaseballEngine(c, seed(3));
  };
  // Training movement 73 → 75 (+2 a session) with velocity at the creation minimum unlocks it.
  const g = at(45, 73);
  assert(g.train("breaking", 0.6).ok);
  assert.equal(g.state.career.stats.movement, 75);
  assert(g.state.career.pitches.includes("knuckle"));
  assert.equal(g.state.hiddenUnlock, "knuckle");
  g.clearHiddenUnlock();
  assert.equal(g.state.hiddenUnlock, null);
  // Raising velocity afterwards does not take it away.
  g.state.career.stats.velocity = 70;
  g.train("breaking", 0.6);
  assert(g.state.career.pitches.includes("knuckle"));
  // One point of velocity training, or movement below 75, keeps it locked.
  for (const [v, m] of [
    [46, 73],
    [45, 72],
  ]) {
    const x = at(v, m);
    x.train("breaking", 0.6);
    assert(!x.state.career.pitches.includes("knuckle"), `${v}/${m}`);
  }
  assert(!at(45, 60).buyPitch("knuckle").ok, "never sold in the shop");
  // A creation build that already meets the condition gets it immediately.
  const c = new BaseballEngine(newCareer());
  assert(
    c.createPlayer("너클러", {
      velocity: 45,
      control: 65,
      movement: 75,
      stamina: 65,
      contact: 60,
      power: 60,
      speed: 45,
    }).ok,
  );
  assert(c.state.career.pitches.includes("knuckle"));
  // Thrown: slow, little spin wobble inside the shown box, back on target at the plate.
  const k = at(45, 75);
  k.checkHiddenPitches();
  k.selectPitch("knuckle");
  assert.equal(k.state.selected, "knuckle");
  k.throwAt(0, 0.95);
  const f = k.state.flight,
    m = pitchMovement("knuckle", f.movement);
  assert(m.flutter > 0.1 && f.speed < 115, `${f.speed}`);
  for (let u = 0; u <= 1.0001; u += 0.05) {
    const w = flutterOffset(m.flutter, u, f.seed);
    assert(
      w.x >= m.minX - 1e-9 && w.x <= m.maxX + 1e-9 && w.y >= m.minY - 1e-9 && w.y <= m.maxY + 1e-9,
    );
  }
  const end = k.pitchPosition(1);
  assert(Math.abs(end.x - f.target.x) < 1e-6 && Math.abs(end.y - f.target.y) < 1e-6);
  // AI pitchers never throw it.
  const ai = new BaseballEngine(newCareer(), seed(8));
  ai.start("batting");
  for (let i = 0; i < 200; i++) {
    ai.state.phase = "ready";
    ai.state.flight = null;
    ai.launch(true);
    if (ai.state.flight) assert.notEqual(ai.state.flight.pitch, "knuckle");
  }
});
check("Hidden 오타니 start: all stats 200 in high school, seven pitches, no roulette", () => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => (store[k] = String(v)),
  };
  try {
    const g = new BaseballEngine(newCareer());
    const even = {
      velocity: 62,
      control: 62,
      movement: 62,
      stamina: 61,
      contact: 61,
      power: 62,
      speed: 45,
    };
    assert(g.createPlayer(" 오타니 ", even).ok);
    const c = g.state.career;
    assert.equal(c.stage, "high");
    assert(Object.values(c.stats).every((v) => v === 200));
    assert.deepEqual([...c.pitches].sort(), [...LEGEND_PITCHES].sort());
    assert.equal(c.pitches.length, 7);
    assert.notEqual(c.blessing, "", "the roulette is skipped");
    assert.equal(g.receiveBlessing(), null);
    assert.equal(g.state.hiddenUnlock, "legend");
    assert.equal(statCapOf(c), 200);
    assert(!g.train("weights", 1).ok, "already at the cap");
    g.throwAt(0, 0.95);
    assert(g.state.flight.speed > 165, "170 km/h fastball");
    // The high-school cap of 100 does not cut the legend down on reload.
    const again = new BaseballEngine();
    again.load();
    assert(Object.values(again.state.career.stats).every((v) => v === 200));
    // An ordinary name is untouched.
    const n = new BaseballEngine(newCareer());
    n.createPlayer("오타니팬", even);
    assert.deepEqual(n.state.career.stats, even);
    assert.equal(statCapOf(n.state.career), 100);
  } finally {
    delete globalThis.localStorage;
  }
});
check("Pitch speed is easier to see: on-screen time gap is wider than the physical one", () => {
  const slow = new BaseballEngine(newCareer(), () => 0.5),
    fast = new BaseballEngine(newCareer(), () => 0.5);
  slow.state.career.stats.velocity = 45;
  fast.state.career.stats.velocity = 100;
  fast.state.career.legend = true;
  fast.state.career.stats.velocity = 200;
  for (const g of [slow, fast]) g.throwAt(0, 0.95);
  const a = slow.state.flight,
    b = fast.state.flight;
  const physical = a.duration / b.duration,
    shown = a.visualDuration / b.visualDuration;
  assert(shown > physical * 1.25, `${physical.toFixed(2)} → ${shown.toFixed(2)}`);
  // The difficulty still sets the overall pace, and the swing window stays a share of it.
  assert(visualFlightTime(0.5, 140, "easy") > visualFlightTime(0.5, 140, "normal"));
  assert(visualFlightTime(0.5, 140, "normal") > visualFlightTime(0.5, 140, "hard"));
});
check("Fielders have names and their own stats: quick, sharp fielders take away hits", () => {
  const g = new BaseballEngine(newCareer());
  g.start("match");
  // Our defense: the player pitches, 김영호 plays shortstop, 고하운 center field.
  assert.equal(g.fielders.length, 9);
  assert.equal(g.fielders[0].name, g.state.career.name);
  assert.equal(g.fielders[4].name, "김영호");
  assert.equal(g.fielders[7].name, "고하운");
  assert.equal(new Set(g.fielders.map((p) => p.name)).size, 9, "nine different players");
  // Their defense: the rival ace pitches, the rest come from the fixed school roster.
  g.state.half = "bottom";
  assert.equal(g.fielders[0].name, g.awayRoster.ace.name);
  assert(g.fielders.slice(1).every((p) => g.awayRoster.lineup.includes(p)));
  // Faster legs, a quicker read and a stronger arm than an average (65) fielder.
  const fast = fieldSkill({ speed: 99, eye: 99, power: 99 }),
    slow = fieldSkill({ speed: 28, eye: 50, power: 40 });
  assert(fast.run > 1 && fast.react < 1 && fast.arm > 1);
  assert(slow.run < 1 && slow.react > 1 && slow.arm < 1);
  const hits = (rating) => {
    let n = 0;
    for (let i = 1; i <= 300; i++) {
      const x = evenDefense(new BaseballEngine(newCareer(), seed(i)), rating);
      const r = seed(i * 7 + 3);
      x.contact(0.21 + r() * 0.75, (r() - 0.5) * 0.2);
      const l = x.state.live;
      finishPlay(x);
      if (!l.caughtFly && !l.outs.length) n++;
    }
    return n;
  };
  assert(hits(95) < hits(65) && hits(65) < hits(35), `${hits(95)} ${hits(65)} ${hits(35)}`);
  // Team strength panel numbers are plain averages.
  assert.deepEqual(
    teamRatings([
      { contact: 60, power: 50, eye: 70, speed: 80 },
      { contact: 80, power: 70, eye: 50, speed: 60 },
    ]),
    { contact: 70, power: 60, eye: 60, speed: 70 },
  );
});
check(
  "Teammates grow with the player: 75% of his average gain, capped, saved, reset in the pros",
  () => {
    const store = {};
    globalThis.localStorage = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => (store[k] = String(v)),
    };
    try {
      const g = new BaseballEngine(newCareer(), () => 0.5);
      const before = g.ourRunner(1),
        avg = (c) => Object.values(c.stats).reduce((a, v) => a + v, 0) / 7,
        start = avg(g.state.career);
      // Seven "perfect" sessions (+3 each since the ×1.5 training) spread over a few days.
      const kinds = ["batting", "power", "sprint", "bullpen", "weights", "breaking", "running"];
      for (const k of kinds) {
        g.state.career.actions = 5;
        g.state.career.energy = 100;
        assert(g.train(k, 1).ok, k);
      }
      const rise = avg(g.state.career) - start;
      assert(Math.abs(g.state.career.teamBoost - rise * TEAM_GROWTH) < 1e-9);
      const after = g.ourRunner(1),
        boost = Math.floor(g.state.career.teamBoost);
      assert.equal(boost, 2, "three points of average → +2 for every teammate");
      assert.equal(after.contact, before.contact + boost);
      assert.equal(after.speed, Math.min(100, before.speed + boost));
      // The player himself is never boosted, and 99-rated teammates stop at the cap of 100.
      assert.equal(g.ourRunner(0).contact, g.state.career.stats.contact);
      g.state.career.teamBoost = 30;
      assert.equal(g.ourRunner(3).contact, 100, "김영호 stops at 100 in high school");
      g.persist();
      const again = new BaseballEngine();
      again.load();
      assert.equal(again.state.career.teamBoost, 30, "saved with the career");
      // Older saves have no team growth.
      const old = newCareer();
      delete old.teamBoost;
      store["diamond-road-career-v1"] = JSON.stringify(old);
      const legacy = new BaseballEngine();
      legacy.load();
      assert.equal(legacy.state.career.teamBoost, 0);
    } finally {
      delete globalThis.localStorage;
    }
  },
);
check(
  "Pro clubs: ratings average about 150 with a ±50 spread, playing like the tuned pro level",
  () => {
    const all = [];
    for (const t of TEAMS) {
      const r = makeProRoster(t.name);
      assert.equal(makeProRoster(t.name), r, "fixed roster per club");
      for (const p of r.lineup) {
        assert(p.pro);
        for (const k of ["contact", "power", "eye", "speed"]) {
          assert(p[k] >= 100 && p[k] <= 200, `${p[k]}`);
          all.push(p[k]);
        }
      }
    }
    const mean = all.reduce((a, v) => a + v, 0) / all.length;
    assert(Math.abs(mean - 150) < 8, `mean ${mean}`);
    assert(Math.max(...all) - Math.min(...all) > 70, "real spread");
    // In the formulas 150 plays like the 80-rated rosters the pro stage was tuned with.
    assert.equal(
      formOf({ name: "", hand: "R", contact: 150, power: 150, eye: 150, speed: 150, pro: true })
        .contact,
      80,
    );
    assert.equal(
      formOf({ name: "", hand: "R", contact: 150, power: 50, eye: 50, speed: 50 }).contact,
      150,
    );
    // A pro career plays against and with pro rosters; the move resets the team growth.
    const g = new BaseballEngine(
      Object.assign(newCareer(), {
        stage: "pro",
        club: TEAMS[0].id,
        proUnlocked: true,
        teamBoost: 12,
      }),
      () => 0.5,
    );
    assert(g.awayRoster.lineup.every((p) => p.pro));
    assert(g.ourRunner(4).pro);
    const hs = new BaseballEngine(
      Object.assign(newCareer(), {
        team: TEAMS[0].id,
        club: TEAMS[0].id,
        proUnlocked: true,
        teamBoost: 9,
      }),
    );
    hs.enterPro();
    assert.equal(hs.state.career.teamBoost, 0);
  },
);
const proCareer = (extra = {}) =>
  Object.assign(
    newCareer(),
    { stage: "pro", club: TEAMS[0].id, proUnlocked: true, team: TEAMS[0].id },
    extra,
  );
/** Ends the current match with a win (rewards and gauges as after a real game). */
const winMatch = (g) => {
  g.start("match");
  Object.assign(g.state, { inning: 3, half: "bottom", outs: 3, score: [0, 2], phase: "result" });
  g.next();
};
check(
  "Pro ladder: 2nd team 120±30 → 1st team 170±30 → MLB 225±25, every player on both sides",
  () => {
    const ratings = (g) =>
      [...g.awayRoster.lineup, ...Array.from({ length: 8 }, (_, i) => g.ourRunner(i + 1))].flatMap(
        (p) => [p.contact, p.power, p.eye, p.speed],
      );
    for (const [extra, tier] of [
      [{}, "farm"],
      [{ proGoal: true }, "first"],
      [{ proGoal: true, league: "mlb", mlbClub: MLB_TEAMS[1].id }, "mlb"],
    ]) {
      const all = [];
      for (let day = 1; day <= 6; day++) {
        const g = new BaseballEngine(proCareer({ ...extra, day }));
        assert.equal(tierOf(g.state.career), tier);
        all.push(...ratings(g));
      }
      const { mean, spread } = TIER_RATINGS[tier],
        avg = all.reduce((a, v) => a + v, 0) / all.length;
      assert(
        all.every((v) => v >= mean - spread && v <= mean + spread),
        tier,
      );
      assert(Math.abs(avg - mean) < spread * 0.35, `${tier} average ${avg}`);
    }
    // Names: 2nd teams, then the clubs, then MLB clubs.
    assert(matchTeams(proCareer()).every((n) => n.endsWith(" 2군")));
    assert.equal(matchTeams(proCareer({ proGoal: true }))[1], TEAMS[0].name);
    assert.equal(
      matchTeams(proCareer({ proGoal: true, league: "mlb", mlbClub: MLB_TEAMS[1].id }))[1],
      MLB_TEAMS[1].name,
    );
  },
);
check(
  "1st team: MLB scouts all evaluate; sign with any at 100, or refuse all for a 250 cap",
  () => {
    const store = {};
    globalThis.localStorage = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => (store[k] = String(v)),
    };
    try {
      // Trust 100 in the 2nd team promotes to the 1st team and opens the MLB scouts.
      const g = new BaseballEngine(proCareer({ scout: 96 }), () => 0.5);
      winMatch(g);
      assert.equal(tierOf(g.state.career), "first");
      assert.deepEqual(Object.values(g.state.career.mlbScouts), [0, 0, 0, 0]);
      // Each match moves every scout, by different amounts (each likes something else).
      winMatch(g);
      const after = MLB_TEAMS.map((t) => g.state.career.mlbScouts[t.id]);
      assert(after.every((v) => v > 0));
      assert.equal(g.state.lastMlb.length, MLB_TEAMS.length);
      assert(!g.signMlb(MLB_TEAMS[0].id), "no offer before 100");
      assert(!g.refuseMlb(), "cannot refuse before every scout is at 100");
      // One club at 100: the player may keep playing; the offer waits.
      g.state.career.mlbScouts[MLB_TEAMS[2].id] = 100;
      assert.deepEqual(
        g.mlbOffers.map((t) => t.id),
        [MLB_TEAMS[2].id],
      );
      winMatch(g);
      assert.equal(g.mlbOffers[0].id, MLB_TEAMS[2].id, "the offer is still there");
      // Refuse all (every scout at 100): the cap rises to 250 for the player only.
      const r = new BaseballEngine(proCareer({ proGoal: true }), () => 0.5);
      r.devGauge99();
      winMatch(r);
      assert.equal(r.mlbOffers.length, MLB_TEAMS.length);
      assert(r.refuseMlb());
      assert.equal(statCapOf(r.state.career), LIMITLESS_CAP);
      assert.equal(r.mlbOffers.length, 0, "offers are gone once refused");
      assert(
        r.awayRoster.lineup.every((p) => p.contact <= 200),
        "the rivals stay at the 1st-team level",
      );
      // Sign: MLB, cap 250, team growth restarts, kept after a reload.
      const m = new BaseballEngine(proCareer({ proGoal: true, teamBoost: 7 }), () => 0.5);
      m.state.career.mlbScouts = Object.fromEntries(MLB_TEAMS.map((t) => [t.id, 100]));
      assert(m.signMlb(MLB_TEAMS[3].id));
      assert.equal(tierOf(m.state.career), "mlb");
      assert.equal(statCapOf(m.state.career), LIMITLESS_CAP);
      assert.equal(m.state.career.teamBoost, 0);
      assert.equal(m.teams[1], MLB_TEAMS[3].name);
      const again = new BaseballEngine();
      again.load();
      assert.equal(tierOf(again.state.career), "mlb");
      assert.equal(again.state.career.mlbClub, MLB_TEAMS[3].id);
      again.state.career.stats.control = 240;
      again.state.career.energy = 100;
      again.state.career.actions = 5;
      assert(again.train("bullpen", 1).ok, "training past 200 in the major league");
      assert.equal(again.state.career.stats.control, 248, "pro ×2 and ×2: +8");
    } finally {
      delete globalThis.localStorage;
    }
  },
);
check(
  "Skills: T cheer (pros, once a match, rivals −15 for one inning); G limit break (all 250 → 300)",
  () => {
    // High school: no cheer.
    const hs = new BaseballEngine(newCareer());
    hs.start("match");
    assert(!hs.cheer());
    const g = new BaseballEngine(proCareer(), () => 0.5);
    g.start("match");
    const plain = { ...g.batter };
    assert(g.cheer());
    assert.equal(g.batter.contact, plain.contact - CHEER_DROP, "the rival batter is rattled");
    g.state.half = "bottom";
    const rival = g.defenseOf(false)[4],
      raw = g.awayRoster.lineup.find((p) => p.name === rival.name);
    assert.equal(rival.speed, raw.speed - CHEER_DROP, "rival fielders too");
    assert(!g.cheer(), "once per match");
    g.state.inning = 2;
    g.state.half = "top";
    assert.equal(
      g.batter.contact,
      g.awayRoster.lineup[g.state.order[0] % 9].contact,
      "only that inning",
    );
    g.start("match");
    assert(g.cheer(), "a new match, a new cheer");
    // Limit break needs every stat at 250.
    const L = new BaseballEngine(proCareer({ limitless: true, proGoal: true }), () => 0.5);
    L.start("match");
    assert(!L.limitBreak());
    for (const k of Object.keys(L.state.career.stats)) L.state.career.stats[k] = LIMITLESS_CAP;
    // One pitch only: armed → the next pitch is thrown at 300 → back to 250 after it.
    const pitchOnce = () => {
      L.state.effort = 100;
      L.state.energy = Math.max(L.state.energy, 0);
      L.throwAt(0, 0.95);
      const f = L.state.flight;
      let n = 0;
      while (L.state.phase !== "ready" && L.state.phase !== "between" && n++ < 4000) {
        if (L.state.phase === "result") L.next();
        else L.tick(1 / 60);
      }
      return f;
    };
    assert(L.limitBreak());
    assert(
      Object.values(L.playerStats).every((v) => v === LIMIT_BREAK),
      "armed",
    );
    assert(!L.limitBreak(), "not twice for the same pitch");
    L.state.career.form = 100;
    L.throwAt(0, 0.95);
    assert(L.state.flight.limit && !L.state.limitArmed, "spent on this pitch");
    assert(L.state.flight.speed > 180, `${L.state.flight.speed} km/h at 300`);
    assert(Math.abs(fastballSpeed(LIMIT_BREAK) - 187) < 1);
    L.state.phase = "ready";
    L.state.flight = null;
    assert.equal(L.playerStats.velocity, LIMITLESS_CAP, "the next pitch is back to 250");
    const next = pitchOnce();
    assert(!next.limit && next.speed < 181);
    // Three free uses a match, then 25 stamina each; below 25 it cannot be used.
    assert.equal(L.state.limitUsed, 1);
    for (const n of [2, 3]) {
      const before = L.state.energy;
      assert(L.limitBreak());
      assert.equal(L.state.energy, before, `use ${n} is free`);
      pitchOnce();
    }
    L.state.energy = 60;
    assert(L.limitBreak(), "a 4th use");
    assert.equal(L.state.energy, 60 - RULES.limitBreakEnergy, "costs 25 stamina");
    pitchOnce();
    L.state.energy = 20;
    assert(!L.limitBreak(), "not with less than 25 stamina");
    L.start("match");
    assert.equal(L.state.limitUsed, 0, "a new match resets the count");
    // Batting: the very next pitch faced (our swing) gets it, and only that one.
    L.state.half = "bottom";
    L.state.order[1] = 0;
    assert(L.limitBreak());
    L.launch(true);
    assert(L.state.flight.limit);
    assert.equal(L.batter.contact, LIMIT_BREAK, "our leadoff hitter swings at 300");
    L.state.phase = "ready";
    L.state.flight = null;
    assert.equal(L.batter.contact, LIMITLESS_CAP);
  },
);
check(
  "A batter who rounded first when a nearby fielder picks the ball up goes back: no free double",
  () => {
    let checked = 0;
    for (let i = 1; i <= 3000; i++) {
      const g = new BaseballEngine(newCareer(), seed(i)),
        r = seed(i * 7 + 3);
      g.contact(0.21 + r() * 0.75, (r() - 0.5) * 0.2);
      const l = g.state.live;
      if (!l || l.caughtFly) continue;
      let at = null,
        n = 0;
      while (g.state.phase === "inplay" && n++ < 3000) {
        const was = l.bounced;
        g.tick(1 / 60);
        if (!was && l.bounced) at = { progress: l.runners[0].progress, bases: l.resultBases };
      }
      if (!at || at.progress <= 1 || at.bases !== 1) continue;
      checked++;
      const batter = l.runners[0];
      // He either made second because the throw could not beat him, or is safe back at first.
      assert(!batter.out || batter.progress > 1.5, "never tagged going back to first");
      if (!batter.out) assert(batter.progress === 1 || batter.progress >= 2);
      assert(batter.progress < 2 || batter.target === 2);
    }
    assert(checked >= 3, `cases found: ${checked}`);
  },
);
check(
  "Dev tools: gauge 100 at every stage, stats 250, and a 3:0 win that counts like a real one",
  () => {
    // High school → contract (the signing ending follows on the daily screen).
    const hs = new BaseballEngine(Object.assign(newCareer(), { team: TEAMS[1].id }));
    assert(hs.devGauge100());
    assert.equal(hs.state.career.club, TEAMS[1].id);
    // 2nd team → 1st team; 1st team → every MLB offer.
    const farm = new BaseballEngine(proCareer());
    assert(farm.devGauge100());
    assert.equal(tierOf(farm.state.career), "first");
    assert(farm.devGauge100());
    assert.equal(farm.mlbOffers.length, MLB_TEAMS.length);
    assert(farm.refuseMlb());
    // Stats 250 (a dev cap that does not count as turning the majors down).
    const d = new BaseballEngine(newCareer());
    d.devSetStats(250);
    assert(Object.values(d.state.career.stats).every((v) => v === 250));
    assert.equal(statCapOf(d.state.career), 250);
    assert(!d.state.career.limitless);
    assert(d.canLimitBreak);
    // 3:0 win: a finished match with the usual rewards.
    const w = new BaseballEngine(newCareer(), () => 0.5),
      day = w.state.career.day;
    assert(w.devWin());
    assert.deepEqual(w.state.score, [0, 3]);
    assert.equal(w.state.message, "VICTORY");
    assert.equal(w.state.career.day, day + 1);
    assert.equal(w.state.career.wins, 1);
    assert(w.state.lastXpGain > 0);
  },
);
check(
  "Decisive pitches: '결정구' in the text decides; AI batters lose 20 contact, the player never",
  () => {
    const decisive = PITCHES.filter(isDecisive).map((p) => p.id);
    assert(decisive.length >= 5, decisive.join());
    for (const id of ["sweeper", "splitter", "forkball", "knucklecurve", "slurve"]) {
      assert(decisive.includes(id), id);
      assert(pitchData(id).stamina >= 1.3, `${id} is expensive on the arm`);
      assert(pitchData(id).stamina > pitchData("fastball").stamina);
    }
    assert(pitchMovement("knucklecurve", 75).y > pitchMovement("curve", 75).y * 0.9);
    assert(pitchMovement("slurve", 75).x > 0.3 && pitchMovement("slurve", 75).y > 0.3);
    // Same pitch, same dice: calling it a decisive pitch makes the AI batter miss more.
    const contacts = (decisiveText) => {
      const p = pitchData("slider"),
        desc = p.desc;
      if (decisiveText) p.desc = desc + " · 결정구";
      let n = 0;
      try {
        for (let i = 1; i <= 400; i++) {
          const g = new BaseballEngine(allPitches(), seed(i));
          g.selectPitch("slider");
          g.throwAt(0, 0.95);
          while (g.state.phase === "windup" || g.state.phase === "flight") g.tick(1 / 60);
          if (g.state.phase === "inplay" || g.state.lastOutcome === "Foul") n++;
        }
      } finally {
        p.desc = desc;
      }
      return n;
    };
    assert(contacts(true) < contacts(false), "fewer balls put in play");
    // Batting: the AI throws a decisive pitch, the player's contact is untouched.
    const b = new BaseballEngine(newCareer(), () => 0.5);
    b.start("batting");
    const before = b.batter.contact;
    b.launch(true);
    assert.equal(b.batter.contact, before);
    // Stamina: every pitch costs 30% more than the original tuning.
    assert(
      Math.abs(pitchEnergyCost(70, 65) / (0.38 * (1.3 - 65 / 180) * RULES.staminaScale) - 1) < 1e-9,
    );
    assert.equal(RULES.staminaScale, 1.3);
  },
);
check(
  "Rain: about 1 match in 10 (never the first), harder for everyone, coin toss every new inning",
  () => {
    let rain = 0;
    for (let day = 2; day <= 2001; day++)
      if (weatherOf({ day, name: "테스트", team: "triples" }) === "rain") rain++;
    assert(rain > 150 && rain < 250, `${rain} rainy days in 2000 (about 10%)`);
    for (const name of ["a", "b", "c", "d"])
      assert.equal(weatherOf({ day: 1, name, team: "" }), "clear");
    const rainyDay = Array.from({ length: 400 }, (_, i) => i + 2).find(
      (day) => weatherOf({ ...newCareer(), day }) === "rain",
    );
    const make = (day) => {
      const g = new BaseballEngine(Object.assign(allPitches(), { day }), () => 0.5);
      g.start("match");
      return g;
    };
    const wet = make(rainyDay),
      dry = make(rainyDay + 1 === rainyDay ? 2 : 1);
    assert(wet.raining && !dry.raining);
    // Pitcher: slower and wilder.
    wet.throwAt(0.1, 0.9);
    dry.throwAt(0.1, 0.9);
    assert(Math.abs(dry.state.flight.speed - wet.state.flight.speed - RULES.rainVelocity) < 1e-9);
    const miss = (g) => Math.hypot(g.state.flight.target.x - 0.1, g.state.flight.target.y - 0.9);
    assert(miss(wet) > miss(dry));
    // Runners slower, fielders slower to react with weaker arms, catcher slower on a steal.
    assert(Math.abs(wet.runnerPace(70) / dry.runnerPace(70) - RULES.rainRunPace) < 1e-9);
    assert(wet.fielderStats(4).reaction > dry.fielderStats(4).reaction);
    assert(wet.fielderStats(4).arm < dry.fielderStats(4).arm);
    // Stamina drains faster.
    const cost = (g) => {
      g.state.phase = "ready";
      g.state.flight = null;
      g.state.energy = 100;
      g.throwAt(0, 0.95);
      while (g.state.phase === "windup") g.tick(1 / 60);
      return 100 - g.state.energy;
    };
    assert(Math.abs(cost(wet) / cost(dry) - RULES.rainStamina) < 1e-9);
    // Coin toss before each new inning (not before the first): 75% go on, 25% called.
    const toss = (roll) => {
      const g = make(rainyDay);
      g.rng = () => roll;
      Object.assign(g.state, {
        inning: 1,
        half: "bottom",
        outs: 3,
        score: [1, 2],
        phase: "result",
      });
      g.next();
      return g;
    };
    const go = toss(0.5),
      stop = toss(0.9);
    assert.equal(go.state.coin.result, "go");
    assert.equal(stop.state.coin.result, "cancel");
    go.continueInning();
    assert.equal(go.state.inning, 2, "play goes on");
    assert.equal(go.state.coin, null);
    const games = stop.state.career.games;
    stop.continueInning();
    assert.equal(stop.state.phase, "finished");
    assert.equal(stop.state.message, "우천취소");
    assert(stop.state.rainedOut);
    assert.equal(stop.state.career.games, games + 1, "the called game still counts");
    assert.equal(stop.state.career.wins, 1, "leading when called = a win");
    // No coin between the halves of an inning, and none on a dry day.
    const half = make(rainyDay);
    Object.assign(half.state, { inning: 1, half: "top", outs: 3, phase: "result" });
    half.next();
    assert.equal(half.state.coin, null);
    const sunny = make(1);
    Object.assign(sunny.state, {
      inning: 1,
      half: "bottom",
      outs: 3,
      score: [1, 2],
      phase: "result",
    });
    sunny.next();
    assert.equal(sunny.state.coin, null);
  },
);
check("Full count: a big '풀카운트' once per plate appearance at 3 balls, 2 strikes", () => {
  const g = new BaseballEngine(newCareer(), () => 0.5);
  g.start("match");
  Object.assign(g.state, { balls: 3, strikes: 2, phase: "result" });
  g.next();
  assert.equal(g.state.flash?.text, "풀카운트");
  const id = g.state.flash.id;
  g.state.phase = "result";
  g.next();
  assert.equal(g.state.flash.id, id, "not again for the same batter");
  g.state.order[0]++;
  Object.assign(g.state, { balls: 2, strikes: 2, phase: "result" });
  g.next();
  assert.equal(g.state.flash.id, id, "2-2 is not a full count");
});
check("MLB rosters use English names; Korean clubs keep Korean ones", () => {
  const m = makeProRoster(MLB_TEAMS[0].name, 225, 25),
    k = makeProRoster(TEAMS[0].name, 170, 30);
  assert(
    m.lineup.every((p) => /^[A-Z][a-z]+ [A-Z][A-Za-z']+$/.test(p.name)),
    m.lineup[0].name,
  );
  assert(/^[A-Z]/.test(m.ace.name));
  assert(k.lineup.every((p) => /^[가-힣]{3}$/.test(p.name)));
  assert(MLB_TEAMS.every((t) => /^[A-Za-z' ]+$/.test(t.name + t.city + t.scout)));
});
check(
  "Rain setting: off means always clear (and stops the rain now); dev button makes it rain",
  () => {
    const store = {};
    globalThis.localStorage = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => (store[k] = String(v)),
    };
    try {
      const rainyDay = Array.from({ length: 400 }, (_, i) => i + 2).find(
        (day) => weatherOf({ ...newCareer(), day }) === "rain",
      );
      const g = new BaseballEngine(Object.assign(newCareer(), { day: rainyDay }));
      g.start("match");
      assert(g.raining && g.forecast === "rain");
      g.setRain(false);
      assert(!g.raining, "the rain stops at once");
      assert.equal(g.forecast, "clear");
      g.start("match");
      assert(!g.raining, "and stays off for the next matches");
      const again = new BaseballEngine(Object.assign(newCareer(), { day: rainyDay }));
      again.start("match");
      assert(!again.raining && !again.state.rainOn, "remembered in this browser");
      // Dev: rain now, even with rain switched off.
      assert(again.devRain());
      assert(again.raining);
      Object.assign(again.state, {
        inning: 1,
        half: "bottom",
        outs: 3,
        score: [0, 1],
        phase: "result",
      });
      again.next();
      assert(again.state.coin, "the coin toss comes with it");
      again.setRain(true);
      const on = new BaseballEngine(Object.assign(newCareer(), { day: rainyDay }));
      on.start("match");
      assert(on.raining);
    } finally {
      delete globalThis.localStorage;
    }
  },
);
check(
  "Diving, jumping and ground-ball catches: near misses get a dive, skill and rain decide; highlights are replayed",
  () => {
    const run = (rating, rain = false, n = 600) => {
      const o = {
        dives: 0,
        made: 0,
        missedDown: 0,
        ground: 0,
        jump: 0,
        buntDives: 0,
        planned: 0,
        callouts: new Set(),
      };
      for (let i = 1; i <= n; i++) {
        const g = evenDefense(new BaseballEngine(newCareer(), seed(i)), rating);
        if (rain) Object.defineProperty(g, "raining", { get: () => true });
        const r = seed(i * 7 + 3);
        g.contact(0.21 + r() * 0.75, (r() - 0.5) * 0.2);
        const l = g.state.live;
        let k = 0,
          downChecked = false;
        while (g.state.phase === "inplay" && k++ < 3000) {
          const diver = l.diver !== undefined ? l.defenders[l.diver] : null,
            before = diver && { ...diver },
            wasDown = l.downUntil !== undefined && l.elapsed < l.downUntil - 0.05;
          g.tick(1 / 60);
          // A fielder who missed a dive stays down until he gets up (a backup may take over).
          if (wasDown && l.elapsed < l.downUntil - 0.05 && l.fieldedAt === null) {
            assert.equal(diver.x, before.x);
            downChecked = true;
          }
        }
        if (g.state.replay) o.callouts.add(g.state.replay.text);
        // Automatic fielding plans the catch early (for the motion): the plan must match.
        if (l.caughtFly && l.plan && (l.plan.style === "catch" || l.plan.style === "jump")) {
          o.planned++;
          assert(
            Math.hypot(l.fielderPos.x - l.plan.foot.x, l.fielderPos.z - l.plan.foot.z) < 0.3,
            "the planned catch spot is where he catches",
          );
          assert.equal(l.catchStyle, l.plan.style);
        }
        assert(
          !g.state.flash || !/캐치|호수비/.test(g.state.flash.text),
          "highlights are replays, not callouts",
        );
        if (l.diveTried && !l.ground) {
          o.dives++;
          if (l.downUntil === undefined) {
            o.made++;
            assert(l.caughtFly, "a diving catch is a fly out");
          } else if (downChecked) o.missedDown++;
        }
        if (l.catchStyle === "ground") o.ground++;
        if (l.catchStyle === "jump") o.jump++;
      }
      return o;
    };
    const avg = run(65, false, 1500),
      good = run(95, false, 1500),
      wet = run(65, true, 1500);
    assert(avg.dives > 25 && avg.dives < 225, `dives ${avg.dives} of 1500`);
    assert(avg.made > 0 && avg.made < avg.dives, "some dives work, some do not");
    assert(good.made / good.dives > avg.made / avg.dives, "better fielders dive better");
    assert(wet.made / Math.max(1, wet.dives) < avg.made / avg.dives, "rain makes it harder");
    assert(avg.missedDown > 0, "a missed dive keeps the fielder down");
    assert(avg.ground > 50, "grounders are scooped up (ground-ball catch)");
    assert(avg.jump > 0, "liners and balls at the wall get jump catches");
    assert(avg.planned > 50, "catches are planned ahead for the motion");
    assert(avg.callouts.has("다이빙 캐치") && avg.callouts.has("점프 캐치"));
    // Bunts and the catcher never dive.
    for (let i = 1; i <= 200; i++) {
      const g = new BaseballEngine(newCareer(), seed(i));
      g.start("batting");
      g.state.swingStyle = "bunt";
      g.contact(0.4, 0);
      const l = g.state.live;
      assert(l.bunt);
      let k = 0;
      while (g.state.phase === "inplay" && k++ < 3000) g.tick(1 / 60);
      assert(!l.diveTried, "no dive on a bunt");
    }
    // Dive chance: the closer the ball and the better the fielder, the likelier.
    const g = new BaseballEngine(newCareer());
    assert(g.diveChance(4, 1.7, 3, 1.6) > g.diveChance(4, 2.9, 3, 1.6));
  },
);
check("Close plays at a base are replayed with the right call; the next batter waits", () => {
  let close = 0,
    outs = 0,
    safes = 0;
  for (let i = 1; i <= 900; i++) {
    const g = evenDefense(new BaseballEngine(newCareer(), seed(i)), 65);
    const r = seed(i * 13 + 5);
    g.contact(0.21 + r() * 0.75, (r() - 0.5) * 0.2);
    const l = g.state.live;
    let k = 0;
    while (g.state.phase === "inplay" && k++ < 3000) g.tick(1 / 60);
    const rp = g.state.replay;
    if (!rp?.base) continue;
    close++;
    const runner = l.runners.find((x) => x.id === rp.base.runner);
    assert.equal(runner.out, rp.base.out, `call matches the play (seed ${i})`);
    assert.equal(rp.text, rp.base.out ? "아웃" : "세이프");
    if (rp.base.out) outs++;
    else safes++;
  }
  assert(close >= 10 && close < 300, `close plays ${close} of 900`);
  assert(outs > 0 && safes > 0, `both calls happen (${outs} out, ${safes} safe)`);
  // While the 3D view shows a replay, the result screen does not move on (12 s at most).
  const g = new BaseballEngine(newCareer(), seed(3));
  g.state.phase = "result";
  g.state.timer = 0.5;
  g.state.replayBusy = true;
  for (let i = 0; i < 300; i++) g.tick(1 / 60);
  assert.equal(g.state.phase, "result", "waits for the replay");
  g.state.replayBusy = false;
  g.tick(1 / 60);
  assert.notEqual(g.state.phase, "result", "goes on once the replay ends");
});
check("A grounder through the infield is taken by an outfielder; runners read the new play", () => {
  let through = 0,
    backups = 0,
    extra = 0;
  for (let i = 1; i <= 900; i++) {
    const g = evenDefense(new BaseballEngine(newCareer(), seed(i)), 65);
    const r = seed(i * 17 + 1);
    g.contact(0.21 + r() * 0.75, (r() - 0.5) * 0.2);
    const l = g.state.live;
    if (!l.ground || l.bunt) continue;
    const first = l.fielder;
    let k = 0;
    while (g.state.phase === "inplay" && l.fieldedAt === null && k++ < 3000) g.tick(1 / 60);
    if (l.fieldedAt === null) continue;
    const deep = Math.hypot(l.fielderPos.x, l.fielderPos.z);
    if (deep > 45) {
      through++;
      // Nobody from the infield chases a ball out to the outfield grass.
      assert(l.fielder >= 6, `outfielder fields a ball at ${deep.toFixed(0)} m (seed ${i})`);
    }
    if (l.backedUp && !l.miscues) {
      backups++;
      assert(first < 6 && l.fielder >= 6);
      if (l.runners.some((x) => x.target > x.from + 1)) extra++;
    }
  }
  assert(through > 10 && backups > 0, `through ${through}, backups ${backups}`);
  if (process.env.SHOW) console.log({ through, backups, extra });
});
check("Tier balance applies in season matches only; AI homers stay realistic", () => {
  const c = newCareer();
  const g = new BaseballEngine(c, seed(4));
  g.start("match");
  assert.deepEqual(g.balance, TIER_BALANCE.high);
  g.start("bullpen");
  assert.deepEqual(g.balance, { aiPower: 1, batBoost: 0 }, "practice is neutral");
  // AI contact quality: the curve makes homers rarer than the flat roll (power 65 batter).
  const homerShare = (curve, power = 65) => {
    const r = seed(9);
    let hr = 0;
    for (let i = 0; i < 20000; i++) {
      const q0 = Math.min(1, 0.15 + r() ** curve * 0.75 + 0.065),
        q = q0 > RULES.aiHrKnee ? RULES.aiHrKnee + (q0 - RULES.aiHrKnee) * RULES.aiHrSqueeze : q0;
      if ((8 + q * q * 115) * carryScale(power) > HOME_RUN_DISTANCE) hr++;
    }
    return hr / 20000;
  };
  // Rival homers are squeezed (v11.16): well under the flat curve, but they still happen.
  assert(homerShare(TIER_BALANCE.high.aiPower, 110) > 0.005, "big hitters still homer");
  assert(homerShare(TIER_BALANCE.high.aiPower) < 0.04, `rival homer share ${homerShare(TIER_BALANCE.high.aiPower)}`);
  for (const t of Object.values(TIER_BALANCE)) {
    assert(t.aiPower >= 1 && t.aiPower <= 2 && t.batBoost >= -0.1 && t.batBoost <= 0.2);
  }
});
check(
  "Hall of fame: the day of the draft, the first team and the MLB contract are recorded",
  () => {
    const c = newCareer();
    c.created = true;
    c.team = TEAMS[0].id;
    const g = new BaseballEngine(c, seed(11));
    c.scout = 99;
    const draftDay = c.day;
    assert(g.devWin());
    assert.equal(c.proDay, draftDay, "draft offer on the day of that match");
    assert(g.enterPro());
    c.scout = 99;
    const firstDay = c.day;
    assert(g.devWin());
    assert.equal(tierOf(c), "first");
    assert.equal(c.firstDay, firstDay);
    c.mlbScouts = Object.fromEntries(MLB_TEAMS.map((t) => [t.id, 100]));
    g.state.phase = "finished";
    assert(g.signMlb(MLB_TEAMS[0].id));
    assert.equal(c.mlbDay, c.day);
    // A second promotion never rewrites the first record.
    c.proGoal = false;
    c.scout = 99;
    g.devWin();
    assert.equal(c.firstDay, firstDay);
  },
);
check(
  "Hidden pine tar: +20 pitching, 5% umpire check per pitch, ejection = loss, −20, dishonor",
  () => {
    const c = newCareer();
    c.created = true;
    c.team = TEAMS[0].id;
    // A fixed "dice" we can steer: 0.99 = the umpire notices nothing.
    let roll = 0.99;
    const g = new BaseballEngine(c, () => roll);
    g.start("match");
    assert(!g.applyPineTar(), "not learned yet");
    assert(g.grantPineTar());
    assert.equal(g.state.hiddenUnlock, "pinetar");
    assert(!g.grantPineTar(), "only once");
    // Turning it down leaves no skill; it can be offered again.
    assert(g.declinePineTar());
    assert(!c.pineTar && g.state.hiddenUnlock === null);
    assert(!g.applyPineTar(), "declined: no skill");
    assert(g.grantPineTar());
    g.clearHiddenUnlock();
    const base = { ...c.stats };
    assert(g.applyPineTar());
    assert(!g.applyPineTar(), "once a match");
    assert.equal(g.playerStats.velocity, base.velocity + PINE_TAR_BOOST);
    assert.equal(g.playerStats.control, base.control + PINE_TAR_BOOST);
    assert.equal(g.playerStats.movement, base.movement + PINE_TAR_BOOST);
    assert.equal(g.playerStats.contact, base.contact, "batting is untouched");
    assert(g.throwAt(0, 0.9));
    assert.notEqual(g.state.phase, "finished", "no check this time");
    advance(g, 600);
    while (g.state.phase !== "ready" && g.state.phase !== "finished") advance(g, 60);
    if (g.state.phase === "ready" && !g.batting) {
      const games = c.games,
        wins = c.wins;
      roll = 0.01;
      g.state.score = [0, 5];
      assert(g.throwAt(0, 0.9));
      assert.equal(g.state.phase, "finished");
      assert(g.state.ejected);
      assert.equal(g.state.message, "퇴장");
      assert.equal(c.games, games + 1);
      assert.equal(c.wins, wins, "ejected even while leading: a loss");
      for (const k of Object.keys(base))
        assert.equal(c.stats[k], Math.max(1, base[k] - PINE_TAR_PENALTY));
      assert(c.dishonor);
    } else assert.fail("expected a new pitch");
    // The next match starts clean (pine tar has to be applied again).
    g.start("match");
    assert(!g.state.pineTar && !g.state.ejected);
    assert.equal(RULES.pineTarCatch, 0.05);
  },
);
check("Home runs fly over the outfield wall, never through it or short of it", () => {
  let homers = 0;
  for (let i = 1; i <= 3000 && homers < 60; i++) {
    const g = new BaseballEngine(newCareer(), seed(i));
    g.contact(0.75 + seed(i * 3)() * 0.4, (seed(i * 5)() - 0.5) * 0.2);
    const l = g.state.live;
    if (l.resultBases !== 4) continue;
    homers++;
    const land = Math.hypot(l.land.x, l.land.z);
    assert(land >= WALL_DISTANCE + 6.9, `lands behind the wall (${land.toFixed(1)} m)`);
    // Find where the flight crosses the wall and check it is well above the padding.
    let crossed = false;
    for (let t = 0; t <= l.flightTime; t += 0.01) {
      const p = g.liveBall(l, t);
      if (Math.hypot(p.x, p.z) >= WALL_DISTANCE) {
        assert(p.y > WALL_HEIGHT + 1.5, `clears the wall (${p.y.toFixed(2)} m)`);
        crossed = true;
        break;
      }
    }
    assert(crossed);
  }
  assert(homers >= 20, `found ${homers} home runs`);
  // Balls that are not home runs stop in front of the wall.
  for (let i = 1; i <= 400; i++) {
    const g = new BaseballEngine(newCareer(), seed(i + 9000));
    g.contact(0.3 + seed(i)() * 0.7, 0);
    const l = g.state.live;
    if (l.resultBases === 4) continue;
    for (let t = 0; t <= 12; t += 0.25) {
      const p = g.liveBall(l, t);
      assert(Math.hypot(p.x, p.z) < WALL_DISTANCE, "a non-homer stays inside the wall");
    }
  }
});
check(
  "Fielder AI: ranges and handoffs, relays through the cutoff man, tosses, smart throws",
  () => {
    const o = { relay: 0, relayDone: 0, toss: 0, handoffs: 0, pitcherDeep: 0, plays: 0 };
    for (let i = 1; i <= 1500; i++) {
      const g = evenDefense(new BaseballEngine(newCareer(), seed(i)), 65);
      const r = seed(i * 7 + 3);
      g.state.bases = [r() < 0.4, r() < 0.25, r() < 0.15];
      g.contact(0.21 + r() * 0.75, (r() - 0.5) * 0.2);
      const l = g.state.live;
      if (l.bunt) continue;
      o.plays++;
      let k = 0,
        relayLeg = null;
      while (g.state.phase === "inplay" && k++ < 4000) {
        g.tick(1 / 60);
        const t = l.throw;
        if (t?.base === 0 && !relayLeg) {
          relayLeg = t;
          o.relay++;
          // Only an outfielder relays, through a middle infielder, toward a real base.
          assert(t.receiver === 3 || t.receiver === 4, "cutoff man is 2B or SS");
          assert(t.relayTo >= 1 && t.relayTo <= 4);
        }
        if (relayLeg && relayLeg.receivedAt !== null && !relayLeg.done) {
          relayLeg.done = true;
          o.relayDone++;
        }
        if (t?.kind === "toss") {
          o.toss++;
          assert(
            Math.hypot(t.to.x - t.from.x, t.to.z - t.from.z) < RULES.tossRange + 1e-9,
            "a toss is short",
          );
          t.kind = "counted";
        }
      }
      assert((l.handoffs ?? 0) <= 2, "a play changes hands at most twice");
      if (l.handoffs) o.handoffs++;
      if (
        l.fieldedAt !== null &&
        l.fielder === 0 &&
        Math.hypot(l.fielderPos.x, l.fielderPos.z) > 30
      )
        o.pitcherDeep++;
    }
    assert.equal(o.pitcherDeep, 0, "the pitcher never chases a ball into the outfield");
    assert(o.relay > 20 && o.relayDone > 10, `relays ${o.relay}, completed ${o.relayDone}`);
    assert(o.toss > 10, `tosses ${o.toss}`);
    assert(o.handoffs > 30, `handoffs ${o.handoffs}`);
    // Out chance grows with the runner's margin.
    const g = new BaseballEngine();
    assert(g.outChance(0.5, 1.2) > 0.95 && g.outChance(1, 0.9) < 0.2);
    if (process.env.SHOW) console.log(o);
  },
);
check(
  "Runner AI: a runner caught between bases turns back and is run down (callout, throws, slow-motion tag)",
  () => {
    const trap = (start) => {
      const g = new BaseballEngine(newCareer(), seed(5));
      g.state.bases = [false, true, false];
      g.contact(0.3, 0);
      const l = g.state.live;
      l.flightTime = 0.01;
      l.bounced = true;
      l.ground = true;
      // The third baseman has the ball on his bag; the runner from second is 2/3 of the way.
      l.fielder = 5;
      l.fielderPos = l.defenders[5];
      Object.assign(l.fielderPos, { x: BASES[2].x, z: BASES[2].z });
      l.fieldedAt = 0;
      l.state = "보유";
      l.elapsed = 1;
      Object.assign(l.runners[0], { progress: 1, target: 1 });
      Object.assign(l.runners[1], { progress: start, target: 3 });
      let slow = false,
        n = 0;
      while (g.state.phase === "inplay" && n++ < 4000) {
        if (g.timeScale < 1) slow = true;
        g.tick(1 / 60);
      }
      assert.equal(g.state.phase, "result");
      return { g, l, slow };
    };
    const { g, l, slow } = trap(2.5);
    assert(l.runners[1].turned, "he turns back when the ball is waiting ahead");
    assert(l.rundown, "a rundown");
    assert.equal(g.state.flash?.text, "런다운");
    assert(l.throws >= 1, "they throw him back and forth");
    assert.equal(g.state.outs, 1);
    assert(l.runners[1].out && l.outs[0].kind === "tag");
    assert(slow, "slow motion as the tag lands");
    assert.equal(g.state.message, "RUNDOWN OUT");
    assert(!l.runners[0].out, "the batter is safe at first");
    // Every rundown ends: the runner is tagged or back on a bag, never stuck between bases.
    for (const start of [2.15, 2.3, 2.45, 2.6, 2.75, 2.9]) {
      const { l: p } = trap(start),
        r = p.runners[1];
      assert(r.out || Math.abs(r.progress - Math.round(r.progress)) < 1e-9, `start ${start}`);
    }
  },
);
check(
  "Runner AI on live balls: every play settles cleanly, nobody shares a bag, forced runners never retreat",
  () => {
    let turned = 0;
    for (let i = 1; i <= 800; i++) {
      const g = evenDefense(new BaseballEngine(newCareer(), seed(i * 3 + 1)));
      const r = seed(i * 11 + 5);
      g.state.bases = [r() < 0.45, r() < 0.3, r() < 0.2];
      g.state.outs = Math.floor(r() * 3);
      const before = [...g.state.bases];
      g.contact(0.21 + r() * 0.75, (r() - 0.5) * 0.2);
      const l = g.state.live,
        forcedFirst = before[0] ? l.runners.find((x) => x.from === 1) : null;
      let n = 0,
        minFirst = 9;
      while (g.state.phase === "inplay" && n++ < 6000) {
        g.tick(1 / 60);
        // While the batter runs to first, a forced runner from first never heads back to it.
        if (
          forcedFirst &&
          !forcedFirst.out &&
          !l.runners[0].out &&
          l.runners[0].progress < 1 &&
          !l.caughtFly
        )
          minFirst = Math.min(minFirst, forcedFirst.target);
      }
      assert.equal(g.state.phase, "result", `seed ${i} settles`);
      assert(l.elapsed < 40);
      if (forcedFirst) assert(minFirst >= 2, `seed ${i}: forced runner retreated`);
      const on = l.runners.filter((x) => !x.out && x.progress < 4);
      for (const x of on) assert(Number.isInteger(x.progress) || g.state.outs >= 3, `seed ${i}`);
      if (g.state.outs < 3)
        assert.equal(
          on.length,
          g.state.bases.filter(Boolean).length,
          `seed ${i}: one runner per bag`,
        );
      if (l.runners.some((x) => x.turned)) turned++;
    }
    assert(turned > 15, `runners turned back ${turned}`);
  },
);
check(
  "Errors: fumbles, dropped flies and wild throws about every other match; worse fielders and rain make more",
  () => {
    const run = (rating, rain = false, n = 800) => {
      let errors = 0,
        kinds = new Set(),
        loose = 0;
      for (let i = 1; i <= n; i++) {
        const g = evenDefense(new BaseballEngine(newCareer(), seed(i * 5 + 2)), rating);
        if (rain) Object.defineProperty(g, "raining", { get: () => true });
        const r = seed(i * 13 + 7);
        g.state.bases = [r() < 0.4, r() < 0.25, false];
        g.contact(0.21 + r() * 0.75, (r() - 0.5) * 0.2);
        const l = g.state.live,
          e0 = g.state.errors[0] + g.state.errors[1];
        let k = 0;
        while (g.state.phase === "inplay" && k++ < 6000) g.tick(1 / 60);
        assert.equal(g.state.phase, "result");
        if (l.miscues) {
          errors += l.miscues;
          kinds.add(l.errorKind);
          if (l.loose) loose++;
          assert.equal(
            g.state.errors[0] + g.state.errors[1] - e0,
            l.miscues,
            "counted on the board",
          );
          if (l.errorKind === "drop") assert(!l.caughtFly, "a dropped fly is no out");
        }
      }
      return { errors, kinds, loose };
    };
    const avg = run(65),
      bad = run(35),
      wet = run(65, true);
    // About 15 balls in play a match: 1.5–7% a play ≈ 0.25–1 error a match.
    assert(avg.errors > 12 && avg.errors < 56, `errors ${avg.errors} of 800`);
    assert(avg.kinds.size >= 2, [...avg.kinds].join());
    assert(avg.loose === avg.errors || avg.loose > 0);
    assert(bad.errors > avg.errors, "worse fielders make more errors");
    assert(wet.errors > avg.errors, "rain makes more errors");
    if (process.env.SHOW) console.log({ avg: avg.errors, bad: bad.errors, wet: wet.errors });
  },
);
check("Runners trip now and then (more in the rain) and stay down before running on", () => {
  const clear = RULES.fallClear;
  RULES.fallClear = 0.5; // make it happen for the test
  try {
    const g = new BaseballEngine(newCareer(), seed(77));
    g.contact(0.3, 0);
    const l = g.state.live,
      b = l.runners[0];
    let k = 0,
      held = null;
    while (g.state.phase === "inplay" && k++ < 3000) {
      g.tick(1 / 60);
      if (b.fellAt !== undefined && held === null) held = b.progress;
      if (held !== null && l.elapsed < b.delay - 0.02) assert.equal(b.progress, held, "down");
    }
    assert(b.fellAt !== undefined, "he fell");
  } finally {
    RULES.fallClear = clear;
  }
  assert(RULES.fallRain > RULES.fallClear * 5 && RULES.fallClear < 0.002);
});
check(
  "Hitboxes: a pitch touching any part of the batter's body is a hit by pitch, and the part is named",
  () => {
    for (const hand of ["R", "L"]) {
      const side = hand === "L" ? -1 : 1;
      const part = (x, y) =>
        ballHitsBody(
          Array.from({ length: 28 }, (_, i) => V(x * side, y, 0.75 - i * 0.05)),
          hand,
        )?.part;
      assert.equal(part(0.58, 1.6), "머리");
      assert.equal(part(0.8, 1.05), "몸통");
      assert.equal(part(0.56, 1.37), "팔", "the front arm shields the hands");
      assert.equal(part(0.68, 0.5), "다리");
      assert.equal(part(0.25, 1.0), undefined, "over the inside corner misses him");
      assert.equal(part(-0.6, 1.0), undefined, "the far side never hits him");
      assert.equal(part(0.9, 2.2), undefined, "over his head");
      assert(
        batterBody(hand).every((c) => c.a.x * side > 0.4 && c.b.x * side > 0.4),
        "he stands beside the plate",
      );
    }
    // In a game: the call names the part and marks where the ball touched him.
    const g = new BaseballEngine(newCareer(), () => 0.5);
    const side = g.batter.hand === "L" ? -1 : 1;
    assert(g.throwAt(0.58 * side, 1.6));
    g.state.flight.target = V(0.58 * side, 1.6, 0);
    g.state.flight.wild = false;
    settle(g);
    assert.equal(g.state.lastOutcome, "HitByPitch");
    assert.match(g.state.detail, /머리에 맞음/);
    assert(g.state.hbp && g.state.hbp.part === "머리" && g.state.hbp.y > 1.3);
    assert.equal(
      g.state.showHitboxes,
      false,
      "the hitbox view is off unless the developer turns it on",
    );
  },
);
check(
  "Hitboxes: a slide touches the bag a leg's length early; the glove must come down first",
  () => {
    assert(
      touchDistance("slide") > touchDistance("run") + 0.5 &&
        touchDistance("dive") > touchDistance("slide"),
    );
    assert(Math.abs(touchDistance("run") - (BAG_HALF + LEAD.run)) < 1e-9);
    const play = (delta) => {
      const g = new BaseballEngine(newCareer(), () => 0.5);
      g.state.autoField = false;
      g.state.bases = [true, false, false];
      g.contact(0.3);
      const l = g.state.live;
      Object.assign(l, { elapsed: 1, flightTime: 0.1, fieldedAt: 0.5, state: "포구", fielder: 4 });
      l.fielderPos = l.defenders[4];
      Object.assign(l.fielderPos, V(9, 0, 28));
      Object.assign(l.defenders[3], BASES[1]);
      l.runners[0].out = true;
      g.state.outs = 1;
      const r = l.runners[1];
      r.target = 2;
      g.beginThrow(l, 2);
      // The glove comes down RULES.tagSweep after the catch; his lead foot reaches the bag
      // `delta` s after that (he slides: the foot is a leg's length ahead of his body).
      const ready = l.throw.startedAt + l.throw.duration + RULES.tagSweep,
        line = 2 - touchDistance("slide") / BASE_PATH_LENGTH;
      r.progress = line - r.pace * (ready - l.elapsed + delta);
      let touchedAt = null;
      finishPlay(g);
      touchedAt = r.touched?.base === 2 ? r.touched : null;
      return { g, l, r, touchedAt };
    };
    const late = play(0.05);
    assert.equal(late.g.state.outs, 2);
    assert(late.r.out && late.l.outs[0].kind === "tag", "the glove was down first: tagged");
    assert(late.l.outs[0].time >= late.l.throw.receivedAt + RULES.tagSweep - 1e-9);
    const early = play(-0.05);
    assert(!early.r.out, "his foot reached the bag first: safe");
    assert.equal(early.r.slide?.kind, "slide", "he slid in");
    assert(early.touchedAt, "the touch is recorded");
    assert.deepEqual(early.g.state.bases, [false, true, false]);
    // The tag needs reach: a holder on the bag reaches a runner's lead foot, not one 3 m away.
    const holder = V(0, 0, 38.8),
      dir = V(-0.7071, 0, 0.7071);
    assert(tagReaches(holder, V(1.1, 0, 37.7), dir, "slide"));
    assert(!tagReaches(holder, V(2.5, 0, 36.3), dir, "slide"));
  },
);
check("A refresh picks the match up again (a pitch under way counts against you); a bad save code career is refused", () => {
  const store = new Map(),
    had = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    // The empty starting career is never saved over a real one before the save is read.
    const real = newCareer();
    real.created = true;
    real.name = "진짜선수";
    store.set("diamond-road-career-v1", JSON.stringify(real));
    const early = new BaseballEngine();
    early.persist();
    assert.equal(JSON.parse(store.get("diamond-road-career-v1")).name, "진짜선수");
    assert(early.load() && early.state.career.name === "진짜선수");
    store.clear();
    const g = new BaseballEngine(),
      c = newCareer();
    g.load();
    c.created = true;
    c.team = "triples";
    g.state.career = c;
    g.start("match", 3);
    Object.assign(g.state, { inning: 2, half: "bottom", outs: 1, balls: 2, strikes: 1, bases: [true, false, true], score: [1, 2], pitchCount: [20, 18], order: [4, 3], phase: "ready" });
    g.emit();
    assert(store.has("diamond-road-match-v1"), "saved between pitches");
    g.persist();
    const h = new BaseballEngine();
    assert(h.load());
    assert(h.resumeMatch(), "the match comes back after a refresh");
    const s = h.state;
    assert.deepEqual([s.mode, s.inning, s.half, s.outs, s.balls, s.strikes, s.score], ["match", 2, "bottom", 1, 2, 1, [1, 2]]);
    assert.deepEqual(s.bases, [true, false, true]);
    // A different day (match already over elsewhere) does not resume.
    const k = new BaseballEngine();
    k.load();
    k.state.career.day += 1;
    assert(!k.resumeMatch());
    assert(!store.has("diamond-road-match-v1"));
    // A refresh with the ball in play counts against the player: pitching, the batter reaches.
    {
      const e = new BaseballEngine();
      e.load();
      e.start("match", 3);
      Object.assign(e.state, { half: "top", balls: 0, strikes: 0, outs: 0, bases: [false, false, false], pitchCount: [5, 5], order: [2, 2], phase: "ready" });
      e.emit();
      let inPlay = false;
      for (let n = 0; n < 60 && !inPlay; n++) {
        Object.assign(e.state, { half: "top", balls: 0, strikes: 0, outs: 0, bases: [false, false, false], phase: "ready", timer: 0 });
        e.emit();
        e.throwAt(0, 0.75);
        for (let i = 0; i < 400 && (e.state.phase === "windup" || e.state.phase === "flight"); i++) e.tick(1 / 60);
        inPlay = e.state.phase === "inplay";
        if (inPlay) e.tick(1 / 60);
      }
      assert(inPlay, "some pitch was put in play");
      const r = new BaseballEngine();
      r.load();
      assert(r.resumeMatch());
      assert.equal(r.state.phase, "result");
      assert.deepEqual([r.state.outs, r.state.bases[0]], [0, true], "the batter reached first");
      assert.match(r.state.detail, /새로고침/);
    }
    // A refresh while a result is shown keeps that result (no penalty, nothing replayed).
    {
      const e = new BaseballEngine();
      e.load();
      e.start("match", 3);
      Object.assign(e.state, { half: "top", balls: 1, strikes: 0, pitchCount: [5, 5], order: [2, 2], phase: "ready", timer: 0 });
      e.emit();
      e.throwAt(0.9, 1.9);
      for (let i = 0; i < 600 && e.state.phase !== "result"; i++) e.tick(1 / 60);
      const shown = [e.state.balls, e.state.strikes, e.state.outs, e.state.message];
      const r = new BaseballEngine();
      r.load();
      assert(r.resumeMatch());
      assert.deepEqual([r.state.balls, r.state.strikes, r.state.outs, r.state.message], shown);
      for (let i = 0; i < 300 && r.state.phase === "result"; i++) r.tick(1 / 60);
      assert.equal(r.state.phase, "ready", "play goes on after the resumed result");
    }
    // Loading a career by code: junk is refused and the old career stays.
    const name = h.state.career.name;
    assert(!h.importCareer({ hello: 1 }));
    assert.equal(h.state.career.name, name);
    assert(h.importCareer({ ...c, name: "코드선수" }));
    assert.equal(h.state.career.name, "코드선수");
  } finally {
    globalThis.localStorage = had;
  }
});
check("AI training ground: batted balls from the settings, learned-AI hooks stay within the rules", () => {
  // A ball given directly comes off the bat as asked.
  for (const kind of ["ground", "line", "fly", "bunt"]) {
    const g = new BaseballEngine(newCareer(), seed(3));
    g.battedBall({ kind, distance: kind === "bunt" ? 8 : 40, angle: 0.2, flightTime: 1.5 });
    const l = g.state.live;
    assert.equal(g.state.phase, "inplay");
    assert.equal(l.ground, kind === "ground" || kind === "bunt", kind);
    assert.equal(l.lineDrive, kind === "line", kind);
    assert.equal(l.bunt, kind === "bunt", kind);
  }
  // Random choices for every runner and ball holder: plays still settle by the rules.
  const rnd = aiSeed(11),
    pickAny = (ctx, options) => Math.floor(rnd() * options.length);
  let asked = 0;
  for (let i = 0; i < 80; i++) {
    const sit = randomSituation(rnd),
      choose = (ctx, options) => {
        asked++;
        assert(options.length > 1 && options.every((o) => o.every(Number.isFinite)));
        return pickAny(ctx, options);
      },
      { g, stats } = runPlay(sit, choose, choose);
    assert.equal(g.state.phase, "result", `play ${i} settles`);
    const l = g.state.live,
      on = l.runners.filter((x) => !x.out && x.progress < 4);
    if (g.state.outs < 3) {
      for (const x of on) assert(Number.isInteger(x.progress), `play ${i}: runner on a bag`);
      assert.equal(on.length, g.state.bases.filter(Boolean).length, `play ${i}: one per bag`);
    }
    // A learned runner turns around at most RULES.brainTurns times on a play.
    for (const x of l.runners) assert((x.reversals ?? 0) <= RULES.brainTurns, `play ${i}: turns`);
    assert(stats.reward.every(Number.isFinite));
  }
  assert(asked > 80, `the AI was asked ${asked} times`);
});
check("Difficulty: five levels, saved, and the learned AI plays for the rival team only", () => {
  const order = ["baby", "easy", "normal", "hard", "impossible"];
  for (let i = 1; i < order.length; i++) {
    assert(swingWindow(order[i - 1]) > swingWindow(order[i]), order[i]);
    assert(visualFlightTime(1, 140, order[i - 1]) > visualFlightTime(1, 140, order[i]));
  }
  const store = new Map(),
    had = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    new BaseballEngine(newCareer()).setDifficulty("impossible");
    assert.equal(new BaseballEngine().state.difficulty, "impossible", "remembered");
  } finally {
    globalThis.localStorage = had;
  }
  // Every level builds; "normal" keeps the hand-written AI.
  const e = new BaseballEngine(newCareer());
  for (const d of order) {
    applyLevel(e, d);
    assert.equal(e.opponentAI.runner === null, d === "normal", d);
    assert.equal(e.opponentAI.fielder === null, d === "normal", d);
  }
  // The rival AI decides for the rival's runners (we pitch) or fielders (we bat), never ours.
  const rnd = aiSeed(5);
  const asked = { top: { runner: 0, fielder: 0 }, bottom: { runner: 0, fielder: 0 } };
  for (let i = 0; i < 60; i++) {
    const sit = randomSituation(rnd);
    for (const half of ["top", "bottom"]) {
      const g = engineFor(sit);
      g.state.half = half;
      g.opponentAI = {
        runner: (_c, o) => (asked[half].runner++, 0),
        fielder: (_c, o) => (asked[half].fielder++, 0),
      };
      runPlay(sit, null, null, { g });
      assert.equal(g.state.phase, "result");
    }
  }
  assert(asked.top.runner > 0 && asked.top.fielder === 0, JSON.stringify(asked));
  assert(asked.bottom.fielder > 0 && asked.bottom.runner === 0, JSON.stringify(asked));
});
check("Manual fielding: with no key held the fielder still goes for the ball", () => {
  const rnd = aiSeed(4);
  for (let i = 0; i < 40; i++) {
    const sit = randomSituation(rnd);
    if (sit.ball.kind !== "ground") continue;
    const g = engineFor(sit);
    g.state.autoField = false;
    const { stats } = runPlay(sit, null, null, { g });
    const l = g.state.live;
    assert.equal(g.state.phase, "result");
    assert(l.fieldedAt !== null, `ground ball ${i} was picked up`);
    assert(stats.seconds < 12, `ground ball ${i} settled in ${stats.seconds.toFixed(1)} s`);
  }
});
check("Close pitches: the call says by how much it missed or clipped the zone", () => {
  assert.equal(zoneCall(V(0.27, 0.9, 0)), "존에서 공 2 cm 빠짐 · 볼");
  assert.equal(zoneCall(V(0.24, 0.9, 0)), "존 끝에 걸침 · 스트라이크");
  assert.equal(zoneCall(V(0, 0.9, 0)), "스트라이크 존 통과");
  assert.equal(zoneCall(V(0.6, 0.9, 0)), "스트라이크 존 바깥");
  // Every miss > 0 is a ball and every miss ≤ 0 a strike (same line as the call).
  for (let x = -0.4; x <= 0.4; x += 0.013)
    for (let y = 0.3; y <= 1.6; y += 0.017)
      assert.equal(zoneMiss(V(x, y, 0)) <= 0, insideZone(V(x, y, 0)));
});
check("Our own fielders go for more dives and leaps than the rival's (the out rate stays)", () => {
  const rate = (half) => {
    const o = { plays: 0, show: 0, outs: 0 };
    for (let i = 1; i <= 700; i++) {
      const g = new BaseballEngine(newCareer(), seed(i));
      g.start("match");
      g.state.half = half;
      const r = seed(i * 7 + 3);
      g.contact(0.21 + r() * 0.75, (r() - 0.5) * 0.2);
      const l = g.state.live;
      if (!l || l.kind !== "batted") continue;
      let k = 0,
        show = false;
      while (g.state.phase === "inplay" && k++ < 3000) {
        g.tick(1 / 60);
        if (l.diveTried || l.catchStyle === "jump") show = true;
      }
      o.plays++;
      if (show) o.show++;
      if (g.state.outs > 0) o.outs++;
    }
    return { show: o.show / o.plays, outs: o.outs / o.plays };
  };
  const home = rate("top"),
    away = rate("bottom");
  assert(home.show > away.show * 1.8, `dives + leaps: ours ${home.show} vs theirs ${away.show}`);
  assert(home.outs > 0.55 && home.outs < 0.75, `our out rate ${home.outs}`);
});
check("Difficulty chosen at creation is the career's hall-of-fame board from the start", () => {
  const g = new BaseballEngine(newCareer(), seed(6));
  g.setDifficulty("impossible");
  const base = Object.fromEntries(Object.keys(newCareer().stats).map((k) => [k, 45]));
  assert(g.createPlayer("불가능맨", base).ok);
  assert.equal(g.state.career.minDifficulty, "impossible");
  // Playing an easier match later moves it down (never up).
  g.setDifficulty("hard");
  g.start("match");
  g.state.pitchCount[1] = 1;
  g.setDifficulty("easy");
  assert.equal(g.state.career.minDifficulty, "easy");
  g.setDifficulty("normal");
});
check("Batting order: the player sets who bats where between matches; positions stay", () => {
  const c = newCareer();
  c.created = true;
  c.name = "나";
  const g = new BaseballEngine(c, seed(5));
  const defense = g.defenseOf(true).map((p) => p.name);
  // 김영호 (member 3) leads off, the player bats second.
  const order = [3, 0, 1, 2, 4, 5, 6, 7, 8];
  assert(g.setBattingOrder(order));
  assert.equal(g.ourRunner(0).name, HOME_LINEUP[3].name);
  assert.equal(g.ourRunner(1).name, "나");
  assert.deepEqual(g.defenseOf(true).map((p) => p.name), defense, "fielding positions unchanged");
  g.start("match");
  g.state.half = "bottom";
  g.state.order[1] = 0;
  assert(!g.playerUp, "slot 1 is 김영호");
  g.state.order[1] = 10; // slot 2 the second time through
  assert(g.playerUp, "the player bats second");
  // Not during a match, and only real orders (each of the nine once).
  g.state.pitchCount[1] = 3;
  assert(g.matchActive && !g.setBattingOrder(order.slice().reverse()));
  g.state.pitchCount[1] = 0;
  g.state.order = [0, 0];
  assert(!g.setBattingOrder([0, 0, 1, 2, 3, 4, 5, 6, 7]) && !g.setBattingOrder([0, 1, 2]));
  assert(!validOrder([0, 1, 2, 3, 4, 5, 6, 7, 9]));
  // Saved with the career; a broken saved order falls back to the default.
  const again = new BaseballEngine();
  assert(again.load(JSON.stringify(g.state.career)));
  assert.deepEqual(again.battingOrder, order);
  assert(again.load(JSON.stringify({ ...g.state.career, battingOrder: [1, 1, 1] })));
  assert.equal(again.ourRunner(0).name, "나");
  // Batting practice is always the player.
  g.start("batting");
  assert.equal(g.batter.name, "나");
  // Back to the default.
  assert(g.setBattingOrder(null) && g.state.career.battingOrder === undefined);
});
check("Bat-only: our AI pitcher calls pitches from the batter and the count, and throws over", () => {
  const c = newCareer();
  c.created = true;
  c.team = "triples";
  c.role = "batter";
  const g = new BaseballEngine(c, seed(11));
  g.start("match");
  const s = g.state;
  s.half = "top"; // the rival bats: our pitcher is the AI
  assert(g.autoHalf && !g.batting);
  const hitter = g.awayRoster.lineup[s.order[0] % 9],
    keep = { ...hitter },
    plans = (n) => Array.from({ length: n }, () => g.autoPitchPlan()),
    mode = (p, m) => p.filter((x) => x.mode === m);
  // A fast runner with an ordinary bat: sinkers/changeups down.
  Object.assign(hitter, { speed: 99, contact: 30, power: 30 });
  let p = plans(200);
  assert(mode(p, "ground").length > 150, "fast runner: grounder pitches");
  assert(mode(p, "ground").every((x) => x.pitch.soft > 0 || x.pitch.id === "changeup"));
  assert(p.reduce((a, x) => a + x.aim.y, 0) / p.length < 0.75, "kept low");
  // A big bat, slow: breaking balls on the corners.
  Object.assign(hitter, { speed: 20, contact: 99, power: 99 });
  p = plans(200);
  assert(mode(p, "break").filter((x) => x.pitch.id !== "fastball").length > 110, "big bat: breaking balls");
  // Both: a mix of the two.
  Object.assign(hitter, { speed: 99, contact: 99, power: 99 });
  p = plans(200);
  assert(mode(p, "ground").length && mode(p, "break").length, "both: mixed");
  // Three balls: a strike in the zone.
  s.balls = 3;
  assert(plans(50).every((x) => x.mode === "zone"));
  s.balls = 0;
  Object.assign(hitter, keep);
  // Pickoffs: a runner on first draws throws over, never past the limit per batter.
  let thrown = 0;
  for (let i = 0; i < 300; i++) {
    s.phase = "ready";
    s.live = null;
    s.bases = [true, false, false];
    s.pickoffs = i % 2 ? RULES.autoPickoffMax : 0;
    s.timer = 0;
    g.tick(1 / 60);
    if (s.live?.kind === "pickoff") {
      assert(i % 2 === 0, "no throw over past the limit");
      thrown++;
    }
  }
  assert(thrown > 10, `throws over (${thrown})`);
});
check("Roles: the AI plays the half the player does not; limit break needs only the role's stats", () => {
  for (const role of ["pitcher", "batter"]) {
    const c = newCareer();
    c.created = true;
    c.team = "triples";
    c.role = role;
    const g = new BaseballEngine(c, seed(role === "pitcher" ? 3 : 4));
    g.start("match");
    let auto = 0,
      mine = 0,
      n = 0;
    while (g.state.phase !== "finished" && n++ < 60 * 60 * 40) {
      const s = g.state;
      if (s.phase === "between") g.continueInning();
      else if (s.phase === "ready" && !g.autoHalf && !g.batting) g.throwAt(0, 0.9);
      if (s.phase === "ready") g.autoHalf ? auto++ : mine++;
      // The player cannot act in the AI's half.
      if (g.autoHalf) {
        assert(!g.throwAt(0, 0.9) && !g.swing() && !g.limitBreak());
        assert.equal(g.batting, role === "pitcher");
      }
      g.tick(1 / 30);
    }
    assert.equal(g.state.phase, "finished", `${role} match ends`);
    assert(auto > 0 && mine > 0, `${role}: both halves happen`);
  }
  // A pitch-only player does not bat (a designated hitter takes slot 0).
  const p = newCareer();
  p.role = "pitcher";
  p.name = "투수만";
  const gp = new BaseballEngine(p);
  assert.notEqual(gp.ourRunner(0).name, "투수만");
  // Limit break: a bat-only player needs only contact, power and speed at 250.
  const b = newCareer();
  b.role = "batter";
  Object.assign(b.stats, { contact: 250, power: 250, speed: 250 });
  assert(new BaseballEngine(b).canLimitBreak);
  const t = newCareer();
  Object.assign(t.stats, { contact: 250, power: 250, speed: 250 });
  assert(!new BaseballEngine(t).canLimitBreak, "a two-way player still needs every stat");
});
console.log(`\n${passed} gameplay checks passed.`);
