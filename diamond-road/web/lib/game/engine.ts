import { ballHitsBody, touchDistance, tagReaches, type RunnerPose } from "./hitbox.ts";
export type Vec = { x: number; y: number; z: number };
export type Mode = "match" | "bullpen" | "batting";
export type Camera = "pitcher" | "catcher" | "broadcast" | "ball" | "top";
export type Phase = "ready" | "windup" | "flight" | "inplay" | "result" | "between" | "finished";
export type PitchId =
  | "fastball"
  | "slider"
  | "curve"
  | "changeup"
  | "cutter"
  | "splitter"
  | "twoseam"
  | "sinker"
  | "forkball"
  | "sweeper"
  | "screwball"
  | "palmball"
  | "eephus"
  | "knucklecurve"
  | "slurve"
  | "knuckle";
/**
 * Pitch data table. Everything that makes one pitch different from another lives here:
 * - delta: speed change (km/h) from the pitcher's fastball
 * - breakX/breakY: mid-flight bend used by pitchMovement() (display and trajectory share it)
 * - control: multiplier on the control error (1 = fastball, higher = harder to locate)
 * - stamina: multiplier on the energy each pitch costs
 * - chase/whiff: how much more the AI batter chases it / swings through it
 * - soft: how much weaker the AI batter's contact is (more ground balls)
 * - wild: multiplier on the wild-pitch chance (pitches that dive into the dirt)
 */
export type PitchData = {
  id: PitchId;
  name: string;
  en: string;
  key: string;
  delta: number;
  breakX: number;
  breakY: number;
  color: string;
  desc: string;
  /** XP needed to learn this pitch. The four-seam fastball is known from day one. */
  cost: number;
  control: number;
  stamina: number;
  chase: number;
  whiff: number;
  soft: number;
  wild: number;
  /**
   * Knuckle-style wobble (m at movement 75): the ball zigzags inside a box of this size
   * around its path, in a direction chosen at release. 0/absent for ordinary pitches.
   */
  flutter?: number;
  /** Top speed (km/h) whatever the pitcher's velocity (the eephus is always a slow lob). */
  maxSpeed?: number;
};
export const PITCHES: PitchData[] = [
  {
    id: "fastball",
    name: "포심",
    en: "4-SEAM",
    key: "1",
    delta: 0,
    breakX: 0.025,
    breakY: 0.05,
    color: "#e8b65a",
    desc: "빠른 직구로 스트라이크 존을 공략",
    cost: 0,
    control: 1,
    stamina: 1.1,
    chase: 0,
    whiff: 0,
    soft: 0,
    wild: 1,
  },
  {
    id: "slider",
    name: "슬라이더",
    en: "SLIDER",
    key: "2",
    delta: -11,
    breakX: 0.43,
    breakY: -0.1,
    color: "#85bde4",
    desc: "타자 바깥쪽으로 날카롭게 휘는 공",
    cost: 60,
    control: 1,
    stamina: 1,
    chase: 0.1,
    whiff: 0.09,
    soft: 0,
    wild: 1,
  },
  {
    id: "curve",
    name: "커브",
    en: "CURVE",
    key: "3",
    delta: -23,
    breakX: 0.1,
    breakY: 0.55,
    color: "#c2a4eb",
    desc: "큰 낙차로 타자의 타이밍을 빼앗기",
    cost: 120,
    control: 1,
    stamina: 1,
    chase: 0.1,
    whiff: 0.09,
    soft: 0,
    wild: 1.2,
  },
  {
    id: "changeup",
    name: "체인지업",
    en: "CHANGEUP",
    key: "4",
    delta: -18,
    breakX: -0.22,
    breakY: 0.12,
    color: "#8bceb6",
    desc: "직구와 같은 폼, 느린 도착 시간",
    cost: 90,
    control: 1,
    stamina: 1,
    chase: 0.1,
    whiff: 0.09,
    soft: 0,
    wild: 1,
  },
  {
    id: "cutter",
    name: "커터",
    en: "CUTTER",
    key: "5",
    delta: -5,
    breakX: 0.2,
    breakY: -0.02,
    color: "#e58f7a",
    desc: "직구처럼 오다 끝에서 짧게 꺾이는 공",
    cost: 160,
    control: 1,
    stamina: 1.05,
    chase: 0.1,
    whiff: 0.09,
    soft: 0,
    wild: 1,
  },
  {
    id: "splitter",
    name: "스플리터",
    en: "SPLITTER",
    key: "6",
    delta: -9,
    breakX: -0.05,
    breakY: 0.42,
    color: "#d9d27a",
    desc: "직구 궤적에서 뚝 떨어지는 결정구",
    cost: 200,
    control: 1,
    stamina: 1.3,
    chase: 0.1,
    whiff: 0.09,
    soft: 0,
    wild: 1.3,
  },
  {
    id: "twoseam",
    name: "투심",
    en: "2-SEAM",
    key: "7",
    delta: -3,
    breakX: -0.18,
    breakY: 0.06,
    color: "#f0c987",
    desc: "직구 구속으로 몸쪽으로 파고드는 공 · 약한 타구 유도",
    cost: 80,
    control: 1.05,
    stamina: 1.05,
    chase: 0.04,
    whiff: 0.03,
    soft: 0.04,
    wild: 1,
  },
  {
    id: "sinker",
    name: "싱커",
    en: "SINKER",
    key: "8",
    delta: -6,
    breakX: -0.24,
    breakY: 0.22,
    color: "#a8c48a",
    desc: "가라앉으며 휘는 공 · 땅볼 유도에 강함",
    cost: 110,
    control: 1.1,
    stamina: 1.05,
    chase: 0.06,
    whiff: 0.05,
    soft: 0.09,
    wild: 1.15,
  },
  {
    id: "forkball",
    name: "포크볼",
    en: "FORKBALL",
    key: "9",
    delta: -15,
    breakX: 0,
    breakY: 0.62,
    color: "#e4a2c0",
    desc: "가장 크게 떨어지는 결정구 · 제구가 어렵고 체력 소모가 큼",
    cost: 240,
    control: 1.3,
    stamina: 1.4,
    chase: 0.15,
    whiff: 0.14,
    soft: 0.03,
    wild: 1.7,
  },
  {
    id: "sweeper",
    name: "스위퍼",
    en: "SWEEPER",
    key: "0",
    delta: -16,
    breakX: 0.62,
    breakY: -0.04,
    color: "#7fd3e0",
    desc: "옆으로 크게 쓸고 나가는 결정구 · 헛스윙 유도, 제구 난이도 높음",
    cost: 220,
    control: 1.18,
    stamina: 1.3,
    chase: 0.12,
    whiff: 0.12,
    soft: 0,
    wild: 1.1,
  },
  {
    // Breaks the "wrong" way: toward the pitcher's arm side and down (a reverse curve).
    id: "screwball",
    name: "스크류볼",
    en: "SCREWBALL",
    key: "=",
    delta: -19,
    breakX: -0.42,
    breakY: 0.36,
    color: "#f08fb0",
    desc: "슬라이더·커브와 반대로 휘며 떨어지는 역회전 공 · 팔에 부담이 커 체력 소모가 큼",
    cost: 260,
    control: 1.2,
    stamina: 1.25,
    chase: 0.13,
    whiff: 0.13,
    soft: 0.02,
    wild: 1.3,
  },
  {
    // Held deep in the palm: slow, little spin, a soft drop and a slight wobble.
    id: "palmball",
    name: "팜볼",
    en: "PALMBALL",
    key: "[",
    delta: -26,
    breakX: -0.08,
    breakY: 0.3,
    color: "#b9d98f",
    desc: "손바닥으로 감싸 던지는 느린 공 · 회전이 적어 살짝 흔들리며 떨어지고 약한 타구를 유도",
    cost: 150,
    control: 1.1,
    stamina: 0.95,
    chase: 0.1,
    whiff: 0.08,
    soft: 0.08,
    wild: 1.2,
    flutter: 0.04,
  },
  {
    // A high, slow lob that drops into the zone: the batter's timing falls apart.
    id: "eephus",
    name: "이퓨스볼",
    en: "EEPHUS",
    key: "]",
    delta: -60,
    breakX: 0,
    breakY: 0.12,
    color: "#9ad7f5",
    desc: "하늘 높이 떠서 천천히 떨어지는 초슬로볼 · 타이밍을 무너뜨리지만 읽히면 위험",
    cost: 120,
    control: 0.9,
    stamina: 0.5,
    chase: 0.08,
    whiff: 0.22,
    soft: 0.12,
    wild: 0.7,
    maxSpeed: 72,
  },
  {
    // Index finger dug into the ball: a harder, later-breaking curve.
    id: "knucklecurve",
    name: "너클 커브",
    en: "KNUCKLE CURVE",
    key: ";",
    delta: -17,
    breakX: 0.08,
    breakY: 0.6,
    color: "#b7a0ff",
    desc: "검지를 세워 강하게 채는 커브 · 빠르고 날카롭게 떨어지는 결정구",
    cost: 230,
    control: 1.2,
    stamina: 1.35,
    chase: 0.13,
    whiff: 0.15,
    soft: 0.03,
    wild: 1.4,
  },
  {
    // Between a slider and a curve: sideways and down at once.
    id: "slurve",
    name: "슬러브",
    en: "SLURVE",
    key: "'",
    delta: -14,
    breakX: 0.38,
    breakY: 0.38,
    color: "#ff9fd0",
    desc: "슬라이더처럼 옆으로, 커브처럼 아래로 휘는 대각선 결정구 · 헛스윙 유도",
    cost: 210,
    control: 1.15,
    stamina: 1.3,
    chase: 0.12,
    whiff: 0.14,
    soft: 0.02,
    wild: 1.2,
  },
];
/**
 * Hidden pitches: never sold in the shop or thrown by the AI. Each one unlocks by itself
 * when the player's stats meet its secret condition (see HIDDEN_UNLOCKS).
 */
export const HIDDEN_PITCHES: PitchData[] = [
  {
    id: "knuckle",
    name: "너클볼",
    en: "KNUCKLEBALL",
    key: "-",
    delta: -24,
    breakX: 0,
    breakY: 0.06,
    color: "#f3efd9",
    desc: "회전 없이 흔들리며 날아오는 마구 · 어디로 흔들릴지 아무도 모른다",
    cost: 0,
    control: 1.3,
    stamina: 0.6,
    chase: 0.16,
    whiff: 0.18,
    soft: 0.1,
    wild: 1.8,
    flutter: 0.16,
  },
];
/** Regular pitches first, then hidden ones. Use this for every id lookup. */
export const ALL_PITCHES: PitchData[] = [...PITCHES, ...HIDDEN_PITCHES];
export const isHiddenPitch = (id: PitchId) => HIDDEN_PITCHES.some((p) => p.id === id);
/** Secret unlock conditions (not shown anywhere in the UI). */
export const HIDDEN_UNLOCKS: { id: PitchId; test: (stats: Career["stats"]) => boolean }[] = [
  // Knuckleball: velocity never trained above the creation minimum, movement 75 or more.
  { id: "knuckle", test: (st) => st.velocity <= STAT_BASE && st.movement >= 75 },
];
export type Weather = "clear" | "rain";
/** Rain on/off from the settings, remembered in this browser (default on). */
const RAIN_KEY = "diamond-road-rain";
/** The match in progress (between pitches), so a refresh does not lose it. */
const MATCH_KEY = "diamond-road-match-v1";
const MATCH_FIELDS = [
  "maxInnings",
  "inning",
  "half",
  "score",
  "lines",
  "hits",
  "errors",
  "balls",
  "strikes",
  "outs",
  "bases",
  "order",
  "pitchCount",
  "energy",
  "selected",
  "effort",
  "swingStyle",
  "history",
  "log",
  "matchXp",
  "pickoffs",
  "weather",
  "limitUsed",
  "pineTar",
  "cheerUsed",
  "cheerInning",
  "coin",
] as const;
export const rainSetting = () => {
  try {
    return typeof localStorage === "undefined" || localStorage.getItem(RAIN_KEY) !== "off";
  } catch {
    return true;
  }
};
/**
 * The day's weather (fixed per day, so the daily screen can forecast it). Day 1 — the tutorial
 * match — is always clear; after that rain comes about RULES.rainChance of the days.
 */
export const weatherOf = (c: Pick<Career, "day" | "name" | "team">): Weather =>
  c.day > 1 && (hashName(`${c.day}|${c.name}|${c.team}|sky`) % 1000) / 1000 < RULES.rainChance
    ? "rain"
    : "clear";
/** Decisive pitch: any pitch whose description says "결정구" (data decides, no code list). */
export const isDecisive = (p: Pick<PitchData, "desc">) => p.desc.includes("결정구");
/** Our own pitcher's pitches (bat-only player): the first n, n as many as the rival ace's. */
const AUTO_ARSENAL: PitchId[] = [
  "fastball",
  "slider",
  "sinker",
  "changeup",
  "curve",
  "splitter",
  "twoseam",
  "cutter",
];
export const pitchData = (id: PitchId) => ALL_PITCHES.find((p) => p.id === id) ?? PITCHES[0];
// AI pitchers only use the four original pitch types.
const AI_PITCHES = 4;
/** Contact swing timing: the ideal moment as a share of the visible flight. */
export const SWING_SWEET = 0.92;
export const SWING_GOOD = 0.045;
/**
 * Tunable game-rule values in one place (the web counterpart of Unity Inspector fields).
 * Change numbers here; the rules read them, nothing else hard-codes them.
 */
export const RULES = {
  /** Wild pitch chance per pitch with runners on: base + fatigue * ((100 - energy) / 100)^2. */
  wildPitchBase: 0.004,
  wildPitchFatigue: 0.075,
  wildPitchMin: 0.002,
  wildPitchMax: 0.09,
  /** Diving catch: the fielder dives for a ball this far past his reach (m, fly / grounder). */
  diveReach: 3.0,
  /** Automatic fielding plans a catch this early (s) so the motion has its run-up. */
  planLead: 0.9,
  /** A dive leaves the ground this long before the glove meets the ball (s). */
  diveLead: 0.35,
  /** A ball outside a fielder's range counts this much later for him (s): ranges overlap softly. */
  zonePenalty: 0.4,
  /** Fly balls: an outfielder who can make the catch calls off an infielder (head start, s). */
  outfieldPriority: 0.35,
  /** Throws longer than this (m) lose speed (arc, bounce): time × (1 + longThrowSlow per m). */
  longThrow: 55,
  longThrowSlow: 0.012,
  /** Relay: the cutoff man stands this share of the way out from the base, holds it this long. */
  relayShare: 0.42,
  relayHold: 0.3,
  /** Toss: under this distance (m) and with this much time to spare (s), a soft flip. */
  tossRange: 9,
  tossSpare: 0.6,
  tossSpeed: 15,
  /** Spread of a throw-vs-runner race (s): out chance = logistic(margin / outSpread). */
  outSpread: 0.12,
  /** An outfielder takes over a grounder through the infield if he gets there this much sooner (s). */
  backupMargin: 0.25,
  /**
   * Runner AI (ball on the ground): every `runThink` s each runner works out his out chance
   * at the bases around him and heads for the farthest one under `runGo` (`runGo2` with two
   * outs); he keeps a base he is already going to while it stays under `runKeep`. His own
   * read is less sure than the real race (`runSpread`), and turning around costs `turnTime`.
   */
  runThink: 0.1,
  /** Learned AI (training ground): runners decide every brainThink s, a chasing holder every
   * holdThink s (fewer, weightier choices than the hand-written AI's 0.1 s reads). */
  brainThink: 0.1,
  /** Rival contact quality above aiHrKnee keeps only aiHrSqueeze of the rest (fewer homers). */
  aiHrKnee: 0.78,
  /** Role modes: our own AI pitcher (bat-only player) and AI batters (pitch-only player)
   * are tuned so each role wins about as often as a two-way player. */
  autoPitchVelocity: 3,
  autoPitchControl: 0.85,
  autoPitchMovement: 72,
  autoBatBoost: 0,
  autoPitchAim: 0.17,
  /** Bat-only player, our pitcher's pickoffs: chance before a pitch with a base stealer on
   * (scaled by how fast he is against the rival lineup), at most autoPickoffMax per batter. */
  autoPickoff: 0.3,
  autoPickoffMax: 2,
  /** Each pickoff this plate appearance keeps the runner closer: steal chance × this. */
  pickoffStealDrop: 0.7,
  /** Bat-only player: his team's batting is all he controls, so it carries a bit more. */
  batterRoleBoost: 0.05,
  aiHrSqueeze: 0.4,
  brainEvery: 1,
  /** Turns a learned runner may make on one play. */
  brainTurns: 2,
  holdThink: 0.15,
  runGo: 0.3,
  runGo2: 0.45,
  runKeep: 0.55,
  runSpread: 0.16,
  /** How far off a runner's read of the ball can be (s, one standard deviation, per play):
   *  an optimistic read sends him too far and gets him caught between bases. */
  runRead: 0.5,
  /** An outfielder's crow hop before throwing after a catch (s). */
  crowHop: 0.55,
  turnTime: 0.5,
  /**
   * A running runner trips and falls (per second of running): clear weather, rain. He is
   * down for `fallTime` s (stumble, lie, get up).
   */
  fallClear: 0.0008,
  fallRain: 0.007,
  fallTime: 2.6,
  /**
   * Ball holder AI (a runner caught off his base): the glove tags him (hitbox.ts), throw to the
   * base he is running to when the ball beats him there by `chaseMargin` s (release takes
   * `chaseRelease` s), otherwise run him down. At most `maxThrows` throws in one play.
   */
  /**
   * Rundown presentation: when the holder closes within `tagSlowRange` m of the trapped runner
   * the game runs at `tagSlow` × speed (slow motion, the camera zooms on the glove); after the
   * tag the play holds `tagHold` s (play time) before the verdict.
   */
  tagSlowRange: 4,
  tagSlow: 0.3,
  tagHold: 0.5,
  chaseMargin: 0,
  chaseRelease: 0.25,
  maxThrows: 6,
  /**
   * Errors (about one every two matches): chance per grounder pickup, per routine fly catch
   * and per throw, × (1 + (70 − skill) × errSkill) for the fielder's (speed+eye)/2, × errRain
   * in the rain. A fumble costs `fumbleTime` s before he can chase the ball again.
   */
  fieldErr: 0.04,
  dropErr: 0.018,
  throwErr: 0.028,
  errSkill: 0.02,
  errRain: 1.5,
  fumbleTime: 0.35,
  /** Pine tar: chance per pitch that the umpire checks the ball and ejects the pitcher. */
  pineTarCatch: 0.05,
  /** A throw and a runner this close at a base (s) make a slow-motion replay of the call. */
  closePlay: 0.35,
  groundDiveReach: 4.0,
  /** Our own fielders (the player's team in the field) go for more: they dive from farther
   *  (fly / grounder, m past reach) and leap more often (line drive / deep fly gap, m). The
   *  far dives mostly miss (the success chance still falls with distance from the normal
   *  reach), so it is the show more than the outs. */
  homeDiveReach: 4.6,
  homeGroundDiveReach: 6.5,
  homeJumpLine: 0.55,
  homeJumpFly: 0.25,
  /** Dive success: base chance at the edge of reach, + per point of (speed+eye)/2 over 65,
   *  − scaled by how far the ball is; capped. Rain takes some off. */
  diveBase: 0.45,
  diveSkill: 0.006,
  diveDistance: 0.38,
  diveMin: 0.08,
  diveMax: 0.85,
  diveRain: 0.15,
  /** After a dive: time on the ground (caught: before the throw; missed: before chasing again). */
  diveGetUp: 0.9,
  diveMissDown: 1.0,
  /** Every pitch's stamina cost × this (1.3 = 30% more than the original tuning). */
  staminaScale: 1.3,
  /** Decisive pitch ("결정구" in the description): the AI batter's contact −this. */
  decisiveContactDrop: 20,
  /** Limit break: free uses per match, then each extra one costs this much stamina. */
  limitBreakFree: 3,
  limitBreakEnergy: 25,
  /** Rain: chance per match, and the chance the game goes on at each new inning (coin toss). */
  rainChance: 0.1,
  rainContinue: 0.75,
  /** Rain: pitch control spread ×, km/h lost, stamina cost ×, base-running pace ×. */
  rainControl: 1.6,
  rainVelocity: 6,
  rainStamina: 1.25,
  rainRunPace: 0.9,
  /** Rain: fielders' first step (s) and arm ×; chance a fielder bobbles the pickup, and how long. */
  rainReaction: 0.08,
  rainArm: 0.9,
  rainBobble: 0.22,
  rainBobbleTime: 0.7,
  /** Rain: catcher — wild-pitch chance ×, catch-to-release (s) added, arm × on a steal. */
  rainWildPitch: 2.2,
  rainCatcherTransfer: 0.18,
  rainCatcherArm: 0.85,
  /** Runners' lead off the bag when a pitch or pickoff starts (m). */
  runnerLead: 4.2,
  /** Extra random lead an AI runner gambles with (m, 0..this). First pickoff ≈ 28% out. */
  runnerLeadGamble: 2.3,
  /** Runner reaction before going back on a pickoff / breaking on a wild pitch (s). */
  runnerReaction: 0.22,
  /** Extra random pickoff reaction when the runner is leaning the wrong way (s, 0..this). */
  runnerReactionGamble: 0.25,
  /**
   * Chance the runner still gambles on a big lead, per earlier pickoff at the same batter
   * (1st throw ≈ 23% out, 2nd ≈ 12%, 3rd ≈ 6%). Otherwise he keeps a short, safe lead.
   */
  pickoffCaution: 0.5,
  /** A pickoff throw costs this share of one pitch's energy. */
  pickoffEnergy: 0.6,
  /**
   * AI base stealing (when the player pitches): chance per pitch for a runner on first with
   * second open, × (speed − 55) / 45; a steal of third is tried `aiStealThird` as often.
   */
  aiSteal: 0.09,
  aiStealThird: 0.3,
  /** The rival only runs on a good read: this much more lead (m) and a quick first step (s). */
  aiStealLead: 0.9,
  aiStealJump: 0.04,
  /** Stealing runner: lead and first-step delay after the pitcher's first move (s). */
  stealLead: 3.2,
  stealJump: 0.12,
  /** How much later (s, 0..this) a runner may read the pitcher's first move. */
  stealJumpGamble: 0.2,
  /** How much slower (s, 0..this) the catcher's exchange may be on a given throw. */
  catcherTransferGamble: 0.22,
  /** Pitcher's pickoff move before the ball leaves the hand (s) and its throw speed (m/s). */
  pickoffMove: 0.2,
  pickoffThrowSpeed: 30,
  /**
   * Tags and slides with hitboxes (lib/game/hitbox.ts): after a catch the glove needs
   * `tagSweep` s to come down on the runner; a runner who touches the bag first is safe.
   * Runners slide (feet first, or head first `slideDive` of the time; more when the tag is
   * already waiting) from `slideStart` m before a bag a throw or the ball is going to.
   */
  tagSweep: 0.1,
  slideStart: 3.6,
  slideDive: 0.25,
  /** A runner takes an extra base on a wild pitch only with this much time to spare (s). */
  advanceMargin: 0.25,
  /** Bunt: a slow roller that stops between these distances (m) at this speed (m/s). */
  buntMin: 3,
  buntMax: 12,
  buntSweet: 10,
  /** Bunts: the fielder's extra reaction (s) and pickup-to-throw time (s). */
  buntReaction: 0.3,
  buntHold: 0.5,
  buntSpeed: 5.5,
  /** Runners on a fly ball with fewer than two outs run at this share of full speed until it lands. */
  flyReadPace: 0.55,
  /** ...scaled down for shallow flies: full share at flyReadFar (m), 20% at flyReadNear or less. */
  flyReadNear: 30,
  flyReadFar: 90,
  /** Reading runners decide this long after contact (s): if no fielder can get there in time
   *  (by flyReadMargin s, i.e. not even with a dive) the ball is dropping, so they run at full
   *  speed. (Crawling until it landed left the forced runner barely off first while the
   *  batter was most of the way there: 26–43% of them were forced out on a dropped liner.) */
  flyReadDecide: 0.45,
  lineReadDecide: 0.2,
  /** Secondary lead (m off the bag) a runner has when the ball is hit. */
  hitLead: 3.5,
  /** Double-play pivot: from the force at the bag to the throw on (s). At 0.3 s two of three
   *  grounders with a runner on first were turned into double plays (real: about 1 in 8). */
  pivotHold: 0.85,
  /** Scout / trust gauge after a match (points): a strong game gains much more (v12.4: was
   *  play 7, strikeout 1, hit 1, allowed −1, win 5, at most 18). */
  gauge: {
    play: 5,
    strikeout: 1.5,
    hit: 1.5,
    run: 1,
    allowed: 1,
    win: 6,
    shutout: 4,
    min: 3,
    max: 30,
    mlbMax: 22,
  },
  flyReadMargin: 0.45,
};
export type Stage = "high" | "pro";
/**
 * Difficulty profile per career stage. The pro stage is tuned to feel clearly harder than high
 * school without doubling everything.
 */
export const STAGES: Record<
  Stage,
  {
    name: string;
    /** Name of the post-season goal shown on the gauge. */
    goal: string;
    goalReward: string;
    /** AI pitcher base velocity (km/h) and how many of the PITCHES table it mixes in. */
    aiVelocity: number;
    aiPitchKinds: number;
    /** AI batter: added contact probability and plate-discipline (eye) points. */
    batterContact: number;
    batterEye: number;
    /** Player batting: timing window scale and range-hint scale. */
    swingWindow: number;
    hintScale: number;
    /** Fielders: chase speed (m/s), first-step reaction (s), throw speed (m/s). */
    fielderSpeed: number;
    fielderReaction: number;
    throwSpeed: number;
    /** Catcher on a steal: catch-to-release time (s) and arm speed (m/s). */
    catcherTransfer: number;
    catcherArm: number;
    /** AI runners' lead gamble scale (smaller = harder to pick off). */
    leadGamble: number;
    /** Scale of the gauge gain after each match. */
    gaugeGain: number;
    /** Highest rating any stat can reach on this stage. */
    statCap: number;
    /** Multiplier on the stat gain from one training session. */
    trainGain: number;
  }
> = {
  high: {
    name: "고교",
    goal: "스카우트 평가",
    goalReward: "입단 제의",
    aiVelocity: 135,
    aiPitchKinds: 4,
    batterContact: 0,
    batterEye: 0,
    swingWindow: 1,
    hintScale: 1,
    fielderSpeed: 5.6,
    fielderReaction: 0.4,
    throwSpeed: 29,
    catcherTransfer: 0.6,
    catcherArm: 30,
    leadGamble: 1,
    gaugeGain: 1,
    statCap: 100,
    trainGain: 1,
  },
  pro: {
    name: "프로",
    goal: "1군 신뢰도",
    goalReward: "1군 선발 로테이션 진입",
    aiVelocity: 142,
    aiPitchKinds: 6,
    batterContact: 0.06,
    batterEye: 8,
    swingWindow: 0.85,
    hintScale: 1.15,
    fielderSpeed: 6,
    fielderReaction: 0.34,
    throwSpeed: 31,
    catcherTransfer: 0.54,
    catcherArm: 31,
    leadGamble: 0.85,
    gaugeGain: 0.75,
    statCap: 200,
    trainGain: 2,
  },
};
/**
 * Difficulty (settings): timing room for the player, the rival's hitting, training speed,
 * and the rival team's runner/fielder AI (learned in the AI training ground, lib/ai/levels.ts;
 * "normal" keeps the hand-written AI). Remembered in this browser.
 */
export type Difficulty = "baby" | "easy" | "normal" | "hard" | "impossible";
export const DIFFICULTIES: { id: Difficulty; label: string; note: string }[] = [
  { id: "impossible", label: "불가능", note: "아주 빠른 승부" },
  { id: "hard", label: "어려움", note: "빠른 승부" },
  { id: "normal", label: "보통", note: "" },
  { id: "easy", label: "쉬움", note: "여유로운 타이밍 · 훈련 1.5배" },
  { id: "baby", label: "응애", note: "아주 여유로운 타이밍 · 훈련 1.5배" },
];
const DIFF_KEY = "diamond-road-difficulty";
const SOUND_KEY = "diamond-road-sound";
/** Sounds start off (browsers block sound before a click) unless turned on before. */
export const soundSetting = () => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
};
const isDifficulty = (v: unknown): v is Difficulty => DIFFICULTIES.some((d) => d.id === v);
export const difficultySetting = (): Difficulty => {
  try {
    const v = typeof localStorage === "undefined" ? null : localStorage.getItem(DIFF_KEY);
    return isDifficulty(v) ? v : "normal";
  } catch {
    return "normal";
  }
};
const byDifficulty = <T>(d: Difficulty, v: Record<Difficulty, T>) => v[d] ?? v.normal;
/** Easiest first. */
export const DIFFICULTY_ORDER: Difficulty[] = ["baby", "easy", "normal", "hard", "impossible"];
export const easierDifficulty = (a: Difficulty, b: Difficulty) =>
  DIFFICULTY_ORDER.indexOf(a) <= DIFFICULTY_ORDER.indexOf(b) ? a : b;
export const swingWindow = (
  difficulty: Difficulty,
  stage: Stage = "high",
  style: SwingStyle = "contact",
) =>
  byDifficulty(difficulty, { baby: 0.3, easy: 0.26, normal: 0.18, hard: 0.12, impossible: 0.1 }) *
  STAGES[stage].swingWindow *
  SWING_STYLES[style].window;
/** Wild-pitch chance for one pitch; rises sharply as the pitcher tires. */
export const wildPitchChance = (energy: number, pitchWild = 1) =>
  clamp(
    (RULES.wildPitchBase + RULES.wildPitchFatigue * ((100 - clamp(energy, 0, 100)) / 100) ** 2) *
      pitchWild,
    RULES.wildPitchMin,
    RULES.wildPitchMax,
  );
/** True when a pitch crossing the plate at (x, y) strikes a batter standing on `hand`'s side. */
/**
 * Would a pitch crossing the plate at p (straight in, at that height) touch the batter's body
 * hitbox? The game itself checks the pitch's real curved path (`pitchHit`).
 */
export const hitsBatter = (p: { x: number; y: number }, hand: "R" | "L") =>
  !!ballHitsBody(
    Array.from({ length: 28 }, (_, i) => V(p.x, p.y, 0.75 - i * 0.05)),
    hand,
  );
/** Clear result type of a single pitch. */
export type PitchOutcome = "Strike" | "Ball" | "HitByPitch" | "Foul" | "InPlay" | "WildPitch";
/** Readable runner state, derived from the RunnerTrack fields (no second copy of the state). */
export type RunnerState = "Idle" | "Running" | "Stealing" | "Returning" | "Safe" | "Out";
/** Radius (m) of the batter's read of where the pitch will cross the plate. */
export const contactHintRadius = (contact: number) => clamp(0.5 - contact * 0.0035, 0.15, 0.5);
export type SwingStyle = "contact" | "power" | "bunt";
/**
 * What each swing style trades (the web counterpart of Inspector fields):
 * - reach / window: bat-area and timing-window multipliers (bigger = easier to hit)
 * - cut: a near miss within cut × reach and cut × window is fouled off instead (0 = never)
 * - foulBelow: contact weaker than this quality is a foul
 * - boost / spread: batted-ball quality after contact = q × (spread[0] + rng × spread[1]) + boost
 */
export const SWING_STYLES: Record<
  SwingStyle,
  {
    reach: number;
    window: number;
    cut: number;
    foulBelow: number;
    boost: number;
    spread: [number, number];
  }
> = {
  contact: { reach: 1.15, window: 1.15, cut: 1.5, foulBelow: 0.3, boost: 0.02, spread: [0.7, 0.2] },
  power: { reach: 0.4, window: 0.45, cut: 0, foulBelow: 0.5, boost: 0.1, spread: [0.7, 0.35] },
  bunt: { reach: 1.4, window: 1.3, cut: 0, foulBelow: 0.15, boost: 0, spread: [1, 0] },
};
/** How far (m) the bat aim may miss the ball and still make contact. */
export const batReach = (contact: number, style: SwingStyle) =>
  (0.12 + clamp(over(contact), 0, 150) * 0.001) * SWING_STYLES[style].reach;
/** Experience points: in-match plays, match result and daily actions. */
/** Training stat gain multiplier: ×2 (×3 on easy and baby) since v12.4 (×1.5 / ×2 before). */
export const trainMultiplier = (difficulty: Difficulty) =>
  difficulty === "easy" || difficulty === "baby" ? 3 : 2;
/** Most a training session can raise a stat (a perfect minigame) on this stage and difficulty. */
export const trainMax = (stage: Stage, difficulty: Difficulty) =>
  2 * (STAGES[stage] ?? STAGES.high).trainGain * trainMultiplier(difficulty);
/** Experience (구종 상점). Raised ×1.5 in v11.3, then about ×0.7 in v12.4 (pitches came
 *  too fast). */
export const XP = {
  strikeout: 6,
  out: 2,
  walk: 2,
  hit: [0, 7, 10, 14, 21] as const,
  run: 4,
  complete: 40,
  win: 30,
  draw: 12,
  training: 8,
  rest: 3,
};
/** Actions (training, rest, study) available each day before the day's match. */
export const DAY_ACTIONS = 5;
export type StatKey = keyof Career["stats"];
export const STAT_NAMES: Record<StatKey, string> = {
  velocity: "구속",
  control: "제구",
  movement: "구위",
  // "지구력" so it is never confused with the current energy bar (체력).
  stamina: "지구력",
  contact: "컨택",
  power: "파워",
  speed: "주력",
};
/**
 * Ratings above 100 exist only in the pros (cap 200). Past 100 each point is worth `k` of a
 * point, so a 200 is clearly better than a 100 without breaking the physics.
 */
export const over = (v: number, k = 0.5) => (v <= 100 ? v : 100 + (v - 100) * k);
/** Player fastball speed (km/h) at 100% effort: 153 at a rating of 100, 170 at 200. */
export const fastballSpeed = (velocity: number) =>
  velocity <= 100 ? 110 + velocity * 0.43 : 153 + (velocity - 100) * 0.17;
/** Energy one pitch costs at this effort (%) and stamina rating (before the pitch's own cost). */
export const pitchEnergyCost = (effort: number, stamina: number) =>
  (0.38 + (effort - 70) * 0.012) * (1.3 - over(stamina) / 180) * RULES.staminaScale;
/** Batted-ball carry multiplier from the batter's power rating. */
export const carryScale = (power: number) => 0.78 + over(power) / 240;
/** Base-running speed (m/s) for a speed rating. */
export const runSpeed = (speed: number) => 6.2 + over(speed) * 0.02;
/** Batted balls that travel farther than this (m) are home runs. */
export const HOME_RUN_DISTANCE = 104;
/** Outfield wall (field.ts draws it): radius from home plate and padding height (m). */
export const WALL_DISTANCE = 108;
export const WALL_HEIGHT = 3.2;
/** A home run lands at least this far behind the wall. */
export const HR_CLEARANCE = 7;
/**
 * Arc height of a home run landing `dist` m away, so that it passes the wall at least 2 m
 * above the padding (the flight is start→land with a sine arc on top).
 */
export const homerArc = (dist: number) => {
  const u = Math.min(0.99, WALL_DISTANCE / dist),
    need = WALL_HEIGHT + 2 - lerp(0.8, 0.12, u);
  return Math.max(25, need / Math.sin(Math.PI * u));
};
/**
 * How sharply the pitcher's pitches bite against AI batters (1 at a movement of 65): scales each
 * pitch's chase / whiff / weak-contact data and slightly lowers contact on every pitch.
 */
export const movementBite = (movement: number) => clamp(over(movement), 0, 150) / 65;
/**
 * What each stat does, in plain words, with a live number from the same formulas the game
 * uses. `metric` turns a rating into that number (lower is better when `lowerIsBetter`).
 */
export const STAT_INFO: Record<
  StatKey,
  {
    role: "투구" | "타격" | "주루";
    what: string;
    label: string;
    unit: string;
    digits: number;
    lowerIsBetter?: boolean;
    metric: (v: number) => number;
    /** Training card that raises it, as in "<training> 훈련으로 상승". */
    training: string;
  }
> = {
  velocity: {
    role: "투구",
    what: "공의 빠르기. 빠를수록 타자가 늦게 반응해 헛스윙과 빗맞은 타구가 늘어요.",
    label: "전력 포심",
    unit: "km/h",
    digits: 0,
    metric: fastballSpeed,
    training: "하체·코어",
  },
  control: {
    role: "투구",
    what: "던진 공이 노린 지점에 얼마나 가깝게 가는지. 낮으면 볼넷·사구·한가운데 실투가 늘어요.",
    label: "목표 오차",
    unit: "cm",
    digits: 1,
    lowerIsBetter: true,
    metric: (v) => controlSpread(v, 100, 90, 100) * 100,
    training: "불펜 피칭",
  },
  movement: {
    role: "투구",
    what: "변화구가 휘는 크기와 공의 위력. 높을수록 타자가 헛스윙하고 약하게 맞혀요.",
    label: "슬라이더 휨",
    unit: "cm",
    digits: 0,
    metric: (v) => {
      const m = pitchMovement("slider", v);
      return Math.hypot(m.x, m.y) * 100;
    },
    training: "변화구 그립",
  },
  stamina: {
    role: "투구",
    what: "던질 때 체력이 줄어드는 속도. 높을수록 경기 후반까지 구속과 제구가 유지되고 폭투가 줄어요.",
    label: "100구당 체력 소모",
    unit: "",
    digits: 0,
    lowerIsBetter: true,
    // A four-seam fastball at the default effort (the pitch's own cost factor included).
    metric: (v) => pitchEnergyCost(90, v) * pitchData("fastball").stamina * 100,
    training: "러닝",
  },
  contact: {
    role: "타격",
    what: "타석에서 공을 맞히는 능력. 배트 판정이 넓어지고 공이 올 범위가 좁게 보여요.",
    label: "배트 판정 반경",
    unit: "cm",
    digits: 1,
    metric: (v) => batReach(v, "contact") * 100,
    training: "타격",
  },
  power: {
    role: "타격",
    what: `타구를 멀리 보내는 힘. ${HOME_RUN_DISTANCE} m를 넘기면 홈런이에요.`,
    label: "정타 비거리",
    unit: "m",
    digits: 0,
    metric: (v) => (8 + 0.81 * 115) * carryScale(v),
    training: "장타",
  },
  speed: {
    role: "주루",
    what: "베이스 사이를 달리는 빠르기. 내야 안타, 한 베이스 더 가기, 도루가 쉬워져요.",
    label: "홈→1루",
    unit: "초",
    digits: 2,
    lowerIsBetter: true,
    metric: (v) => BASE_PATH_LENGTH / runSpeed(v),
    training: "스프린트",
  },
};
const statLabel = (k: StatKey) => STAT_NAMES[k];
/** Fictional pro clubs loosely inspired by the KBO (names deliberately changed). */
export const TEAMS: {
  id: string;
  city: string;
  name: string;
  color: string;
  scout: string;
  motto: string;
}[] = [
  {
    id: "pigeons",
    city: "한밭",
    name: "피죤스",
    color: "#f08a24",
    scout: "최강수",
    motto: "끝까지 날개를 접지 않는다",
  },
  {
    id: "pandas",
    city: "잠실",
    name: "판다스",
    color: "#2b3a8c",
    scout: "허경민호",
    motto: "뚝심 있는 곰 대신 판다의 끈기",
  },
  {
    id: "triples",
    city: "한강",
    name: "트리플스",
    color: "#c4123f",
    scout: "박용태",
    motto: "쌍둥이보다 하나 더",
  },
  {
    id: "villains",
    city: "고척",
    name: "빌런즈",
    color: "#7a1f3d",
    scout: "이정호",
    motto: "영웅보다 강한 악당들",
  },
  {
    id: "launchers",
    city: "인천",
    name: "런처스",
    color: "#ce0e2d",
    scout: "김광식",
    motto: "상륙 대신 발사",
  },
  {
    id: "magicians",
    city: "수원",
    name: "매지션스",
    color: "#1a1a1a",
    scout: "강백원",
    motto: "마법 같은 한 방",
  },
  {
    id: "raptors",
    city: "창원",
    name: "랩터스",
    color: "#1d467f",
    scout: "나성민",
    motto: "공룡의 후예, 더 빠르게",
  },
  {
    id: "pumas",
    city: "대구",
    name: "퓨마스",
    color: "#0b61a4",
    scout: "오승현",
    motto: "사자보다 날렵하게",
  },
  {
    id: "titans",
    city: "부산",
    name: "타이탄스",
    color: "#041e42",
    scout: "이대훈",
    motto: "거인보다 더 거대하게",
  },
  {
    id: "cheetahs",
    city: "광주",
    name: "치타스",
    color: "#c8102e",
    scout: "양현승",
    motto: "호랑이보다 빠른 발톱",
  },
];
export const teamOf = (id: string) => TEAMS.find((t) => t.id === id) ?? null;
/**
 * Major-league clubs (fictional). In the first team, all of their scouts watch at once; each
 * values something different (focus), so their evaluations rise at different speeds.
 */
export const MLB_TEAMS: {
  id: string;
  city: string;
  name: string;
  color: string;
  scout: string;
  focus: "strikeouts" | "wins" | "hits" | "runs";
  likes: string;
}[] = [
  {
    id: "harbor",
    city: "New York",
    name: "Harbor Knights",
    color: "#2f5aa8",
    scout: "Mike Johnson",
    focus: "strikeouts",
    likes: "탈삼진",
  },
  {
    id: "sunset",
    city: "Los Angeles",
    name: "Sunset Blaze",
    color: "#e0663a",
    scout: "Carlos Rivera",
    focus: "wins",
    likes: "승리",
  },
  {
    id: "bay",
    city: "Boston",
    name: "Bay Hammers",
    color: "#b23a48",
    scout: "Kevin O'Connor",
    focus: "hits",
    likes: "팀 타격",
  },
  {
    id: "lake",
    city: "Chicago",
    name: "Lake Wolves",
    color: "#3d8f6a",
    scout: "Derek Smith",
    focus: "runs",
    likes: "최소 실점",
  },
];
export const mlbTeamOf = (id: string | undefined) => MLB_TEAMS.find((t) => t.id === id) ?? null;
/** Career ladder: high school → pro 2nd team → pro 1st team → major league. */
export type Tier = "high" | "farm" | "first" | "mlb";
export const tierOf = (c: Pick<Career, "stage" | "proGoal" | "league">): Tier =>
  c.stage !== "pro" ? "high" : c.league === "mlb" ? "mlb" : c.proGoal ? "first" : "farm";
/** Player ratings around each tier: mean ± spread (pro scale). */
export const TIER_RATINGS: Record<Exclude<Tier, "high">, { mean: number; spread: number }> = {
  farm: { mean: 120, spread: 30 },
  first: { mean: 170, spread: 30 },
  mlb: { mean: 225, spread: 25 },
};
/**
 * Win-rate balance per tier (tuned with scripts/balance.mjs so an ordinary player wins about
 * 45% of matches):
 * - aiPower: AI batter's contact quality is 0.15 + random^aiPower × 0.75 + power. 1 = flat
 *   (about one ball in eight in play left the park); higher makes hard-hit balls rarer.
 * - batBoost: added to the quality of the player's own swings (all our batters).
 * The timing window (shown on screen) stays in STAGES.swingWindow.
 */
export const TIER_BALANCE: Record<Tier, { aiPower: number; batBoost: number }> = {
  // Measured with AI steals, tag-ups, hitbox tags/slides, the runner AI and errors
  // (normal-player bot, 32 careers, 3 innings): see docs/CHANGELOG.md (v11.16: rival homers
  // squeezed, so the rivals hit a bit harder overall and our boost is lower).
  // v12.4: runners no longer crawl on dropped flies or start on the bag, so our side scores
  // more; the boost comes down 0.035 to keep normal near half the games.
  high: { aiPower: 1.0, batBoost: -0.095 },
  farm: { aiPower: 1.14, batBoost: 0.02 },
  first: { aiPower: 1.04, batBoost: -0.027 },
  mlb: { aiPower: 1.01, batBoost: -0.017 },
};
const NEUTRAL_BALANCE = { aiPower: 1, batBoost: 0 };
/** What the career gauge measures in this tier. */
export const gaugeName = (c: Pick<Career, "stage" | "proGoal" | "league">) =>
  ({ high: "스카우트 평가", farm: "1군 신뢰도", first: "1군 신뢰도", mlb: "무한 모드" })[tierOf(c)];
export const TIER_NAMES: Record<Tier, string> = {
  high: "고교",
  farm: "프로 2군",
  first: "프로 1군",
  mlb: "MLB",
};
/** [visiting team, our team]: high-school rivals, pro clubs (2군 teams first), or MLB clubs. */
export const matchTeams = (
  c: Pick<Career, "stage" | "club" | "day" | "proGoal" | "league" | "mlbClub">,
): [string, string] => {
  const tier = tierOf(c);
  if (tier === "mlb") {
    const club = mlbTeamOf(c.mlbClub) ?? MLB_TEAMS[0],
      rivals = MLB_TEAMS.filter((t) => t.id !== club.id);
    return [rivals[c.day % rivals.length].name, club.name];
  }
  const club = c.stage === "pro" ? teamOf(c.club) : null;
  if (!club) return [opponentSchool(c.day).name, HOME_SCHOOL];
  const rivals = TEAMS.filter((t) => t.id !== club.id),
    suffix = tier === "farm" ? " 2군" : "";
  return [rivals[c.day % rivals.length].name + suffix, club.name + suffix];
};
/** Player creation: every stat starts at STAT_BASE and STAT_POINTS are spread freely. */
export const STAT_BASE = 45;
export const STAT_POINTS = 100;
export const STAT_CAP = 80;
/** Starting-pitch roulette: rarer pitches have smaller weights. */
export const BLESSINGS: { id: PitchId; weight: number; tier: string }[] = [
  { id: "changeup", weight: 20, tier: "축복" },
  { id: "twoseam", weight: 18, tier: "축복" },
  { id: "curve", weight: 13, tier: "은총" },
  { id: "cutter", weight: 11, tier: "은총" },
  { id: "sinker", weight: 10, tier: "은총" },
  { id: "palmball", weight: 7, tier: "은총" },
  { id: "splitter", weight: 6, tier: "신탁" },
  { id: "sweeper", weight: 5, tier: "신탁" },
  { id: "forkball", weight: 4, tier: "신탁" },
  { id: "eephus", weight: 3, tier: "신탁" },
  { id: "screwball", weight: 3, tier: "신탁" },
];
/** Every new player starts with these; the roulette adds one more. */
export const STARTING_PITCHES: PitchId[] = ["fastball", "slider"];
/** Word plus the Korean particle that fits its last syllable, e.g. josa("커브", "을를") = "커브를". */
export const josa = (word: string, pair: "이가" | "을를" | "은는" | "과와") => {
  const code = word.charCodeAt(word.length - 1) - 0xac00,
    batchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (batchim ? pair[0] : pair[1]);
};
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const V = (x = 0, y = 0, z = 0): Vec => ({ x, y, z });
export function gaussian(rng = Math.random) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, rng()))) * Math.cos(2 * Math.PI * rng());
}
export function ballistic(
  start: Vec,
  end: Vec,
  speed: number,
): { velocity: Vec; duration: number } | null {
  const dx = end.x - start.x,
    dy = end.y - start.y,
    dz = end.z - start.z,
    d2 = dx * dx + dy * dy + dz * dz,
    b = speed * speed - 9.81 * dy,
    disc = b * b - 9.81 * 9.81 * d2;
  if (speed <= 0 || !Number.isFinite(speed) || disc < 0 || b <= 0 || d2 < 1e-8) return null;
  const duration = Math.sqrt((2 * d2) / (b + Math.sqrt(disc)));
  return { duration, velocity: V(dx / duration, dy / duration + 4.905 * duration, dz / duration) };
}
/** Reference speed (km/h) whose on-screen travel time is not stretched by speed. */
export const SPEED_LOOK_REF = 135;
/**
 * On-screen travel time of a pitch (s). The difficulty slows every pitch down for reaction
 * time, and the speed term widens the gap between slow and fast pitches beyond the physical
 * one, so 170 km/h looks clearly faster than 130 km/h. Swing timing uses shares of this time.
 */
export const visualFlightTime = (duration: number, speed: number, difficulty: Difficulty) =>
  duration *
  byDifficulty(difficulty, { baby: 2.8, easy: 2.5, normal: 1.8, hard: 1.2, impossible: 1.05 }) *
  clamp((SPEED_LOOK_REF / speed) ** 0.9, 0.72, 1.4);
export function insideZone(p: Vec) {
  return Math.abs(p.x) <= 0.2515 && p.y >= 0.5135 && p.y <= 1.3865;
}
/**
 * How far the ball was from touching the zone (m): + = it missed by that much (a ball),
 * − = it was inside by that much (a strike). The ball's radius is counted (insideZone).
 */
export function zoneMiss(p: Vec) {
  const out = Math.max(Math.abs(p.x) - 0.2515, 0.5135 - p.y, p.y - 1.3865);
  if (out > 0) {
    // Off a corner: distance to the corner, not to the nearer edge's line.
    const dx = Math.max(0, Math.abs(p.x) - 0.2515),
      dy = Math.max(0, 0.5135 - p.y, p.y - 1.3865);
    return Math.hypot(dx, dy);
  }
  return out;
}
/** Detail text of a taken pitch; close ones say by how much (the ball reads big on screen). */
export function zoneCall(p: Vec) {
  const m = zoneMiss(p),
    cm = Math.max(1, Math.round(Math.abs(m) * 100));
  if (m > 0) return m < 0.06 ? `존에서 공 ${cm} cm 빠짐 · 볼` : "스트라이크 존 바깥";
  return -m < 0.04 ? `존 끝에 걸침 · 스트라이크` : "스트라이크 존 통과";
}
// Looking out from home, first base is on the right (world -X).
export const BASES = [V(-19.4, 0.12, 19.4), V(0, 0.12, 38.8), V(19.4, 0.12, 19.4), V(0, 0.12, 0)];
export const DEFENSE = [
  V(0, 0, 18.44),
  V(0, 0, -1.25),
  V(-23, 0, 24),
  V(-10, 0, 35),
  V(11, 0, 33),
  V(23, 0, 24),
  V(34, 0, 62),
  V(0, 0, 76),
  V(-34, 0, 62),
];
export const BASE_PATH_LENGTH = Math.hypot(19.4, 19.4);
/**
 * Fielding range of each position (m around its spot in DEFENSE): the chase goes to a fielder
 * whose range holds the place he would field the ball. Neighbours overlap (2B/SS up the
 * middle, infield/outfield in the shallow grass, CF with both corners); in an overlap the
 * one who gets there first takes it, outfielders calling off infielders on fly balls.
 */
export const FIELD_ZONES = [9, 7, 15, 17, 17, 15, 30, 34, 30];
/** Fielder chase speed (m/s), first-step reaction (s) and glove reach (m) for batted balls. */
// Tuned so roughly a third of balls in play fall for hits (see scripts/check-game.mjs).
export const FIELDER_SPEED = STAGES.high.fielderSpeed;
export const FIELDER_REACTION = STAGES.high.fielderReaction;
/** How far (m) from the ball a chasing fielder stops and catches a fly / picks up a grounder. */
export const CATCH_REACH = 1.6;
export const GROUND_REACH = 2.2;
const HANG_BASE = 1.4;
const HANG_DIV = 38;
export function pitchMovement(id: PitchId, movement: number) {
  const p = pitchData(id),
    scale = over(movement, 0.4) / 75,
    x = p.breakX * scale,
    y = p.breakY * scale,
    flutter = (p.flutter ?? 0) * scale;
  return {
    x,
    y,
    /** Knuckle wobble amplitude (m); the box below already includes it. */
    flutter,
    minX: Math.min(0, x) - flutter,
    maxX: Math.max(0, x) + flutter,
    minY: Math.min(0, y) - flutter,
    maxY: Math.max(0, y) + flutter,
  };
}
/**
 * Knuckle wobble at flight share u (0–1) for a release seed: zero at release and at the plate,
 * never larger than the flutter amplitude, so it stays inside the pitchMovement() box.
 */
export const flutterOffset = (flutter: number, u: number, seed: number) => {
  const env = Math.sin(Math.PI * u);
  return {
    x: flutter * env * Math.sin(2 * Math.PI * 2.3 * u + seed),
    y: flutter * env * Math.sin(2 * Math.PI * 1.6 * u + seed * 1.7 + 1),
  };
};
/**
 * Control error (m, one standard deviation) of the player's pitches. Lower stamina (energy),
 * higher effort and poor form all widen it; the control stat narrows it.
 */
export const controlSpread = (control: number, energy: number, effort: number, form: number) =>
  Math.max(
    0.008,
    (0.022 +
      (100 - Math.min(control, 100)) * 0.0019 -
      Math.max(0, control - 100) * 0.00012 +
      (100 - energy) * 0.0016 +
      (effort - 70) * 0.001) *
      (1 + (100 - form) * 0.003),
  );
export type RunnerTrack = {
  id: number;
  from: number;
  progress: number;
  target: number;
  pace: number;
  delay: number;
  out: boolean;
  scoredAt: number | null;
  /** After a caught fly: retouch the original base, then run for home. */
  tagUp?: boolean;
  /** Broke for the next base with the pitch (E steal call). */
  stealing?: boolean;
  /** Full sprint pace; `pace` may be lower while a fly ball is still in the air. */
  fullPace?: number;
  /** Last base he touched while advancing, and when (play time, s): judges close plays. */
  touched?: { base: number; at: number };
  /** Runner AI: next time he re-reads the play, and whether he has turned back (taggable). */
  thinkAt?: number;
  turned?: boolean;
  /** Times he has turned around on this play (learned AI: limited outside a rundown). */
  reversals?: number;
  /** Play time he last turned around (turning takes RULES.turnTime: the animation's clock). */
  turnAt?: number;
  /** His misread of the ball this play (s, + = thinks it is slower than it is). */
  read?: number;
  /** Learned AI: what the play looked like at his last choice, and when he chooses anyway. */
  brainKey?: string;
  brainAt?: number;
  /** Play time he tripped and fell (down until `delay`). */
  fellAt?: number;
  /** Sliding into `base` since play time `at`: feet first ("slide") or head first ("dive"). */
  slide?: { base: number; at: number; kind: "slide" | "dive" };
};
/** A runner is at rest when standing on the base it is heading to (or out). */
export const runnerSettled = (r: RunnerTrack) =>
  r.out || (Math.abs(r.progress - r.target) < 1e-6 && !r.tagUp);
export function runnerState(r: RunnerTrack): RunnerState {
  if (r.out) return "Out";
  if (r.progress > r.target + 1e-6 || r.tagUp) return "Returning";
  if (r.progress < r.target - 1e-6) return r.stealing ? "Stealing" : "Running";
  return Math.abs(r.progress - r.from) < 1e-6 ? "Idle" : "Safe";
}
export function runnerPose(r: RunnerTrack) {
  const step = Math.min(3, Math.floor(r.progress)),
    t = clamp(r.progress - step, 0, 1),
    a = BASES[(step + 3) % 4],
    b = BASES[step];
  return {
    position: V(lerp(a.x, b.x, t), 0, lerp(a.z, b.z, t)),
    // Runners going back to retouch a base face the base behind them.
    facing: r.progress > r.target ? V(a.x - b.x, 0, a.z - b.z) : V(b.x - a.x, 0, b.z - a.z),
    moving: !r.out && Math.abs(r.progress - r.target) > 1e-6,
    visible: !r.out && r.progress < 4,
  };
}
// Player models face local -Z, unlike Object3D.lookAt's +Z convention.
export const playerYaw = (direction: Vec) => Math.atan2(-direction.x, -direction.z);
type FieldThrow = {
  from: Vec;
  /** Where the ball goes: a bag, or the cutoff man's relay spot. */
  to: Vec;
  /** Base it is thrown to (0 = to the cutoff man, who relays it to `relayTo`). */
  base: number;
  relayTo?: number;
  /** "toss": a short underhand flip to a teammate (only when there is time to spare). */
  kind?: "throw" | "toss";
  receiver: number;
  /** Who threw it (for the follow-through animation). */
  thrower?: number;
  /** A throwing error: it sails past the receiver and rolls away. */
  wild?: boolean;
  startedAt: number;
  duration: number;
  receivedAt: number | null;
  runnerId: number | null;
};
type PlayOut = {
  runnerId: number;
  base: number;
  force: boolean;
  time: number;
  kind: "fly" | "force" | "tag";
};
/** One line of the end-of-match recap: what happened and how many points it was worth. */
export type RecapLine = { label: string; value: number };
export type Player = {
  name: string;
  /** Nickname shown in front of the name, e.g. [번개맨]. */
  nick?: string;
  hand: "R" | "L";
  contact: number;
  power: number;
  eye: number;
  speed: number;
  /** A pro-club player: ratings on the pro scale (150 ± 50), see proForm(). */
  pro?: boolean;
};
/** Our school. The player bats first in its lineup; the eight teammates never change. */
export const HOME_SCHOOL = "미산고";
export const HOME_LINEUP: Player[] = [
  { name: "", hand: "R", contact: 0, power: 0, eye: 66, speed: 0 },
  { name: "고하운", nick: "번개맨", hand: "R", contact: 76, power: 55, eye: 66, speed: 92 },
  { name: "옥동규", nick: "미산고 요정", hand: "L", contact: 72, power: 45, eye: 70, speed: 99 },
  { name: "김영호", nick: "학과장", hand: "R", contact: 99, power: 99, eye: 99, speed: 99 },
  { name: "유동권", nick: "진격의 거인", hand: "R", contact: 58, power: 99, eye: 52, speed: 28 },
  { name: "양서준", nick: "야구괴인", hand: "L", contact: 95, power: 95, eye: 75, speed: 62 },
  { name: "박시우", nick: "편집 노예", hand: "R", contact: 92, power: 90, eye: 90, speed: 88 },
  { name: "이지섭", nick: "F=ma", hand: "R", contact: 55, power: 98, eye: 50, speed: 30 },
  { name: "아모스", nick: "몽골리안", hand: "L", contact: 99, power: 84, eye: 99, speed: 74 },
];
/** The default batting order: roster members in order, the player (member 0) leading off. */
export const DEFAULT_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8];
/** A batting order is valid when it holds each of the nine members exactly once. */
export const validOrder = (o: unknown): o is number[] =>
  Array.isArray(o) &&
  o.length === 9 &&
  DEFAULT_ORDER.every((k) => o.filter((v) => v === k).length === 1);
/** "[별호] 이름", or just the name. */
export const playerLabel = (p: Pick<Player, "name" | "nick">) =>
  p.nick ? `[${p.nick}] ${p.name}` : p.name;
/** Position names in DEFENSE order. */
export const POSITIONS = [
  "투수",
  "포수",
  "1루수",
  "2루수",
  "유격수",
  "3루수",
  "좌익수",
  "중견수",
  "우익수",
];
/**
 * Lineup slot playing each DEFENSE position. Ours: the player pitches (slot 0), 김영호 at
 * shortstop, the fastest legs (옥동규, 고하운) up the middle, the slow sluggers at C and 1B.
 */
export const HOME_POSITIONS = [0, 7, 4, 2, 3, 6, 5, 1, 8];
/** Opponents: the ace pitches; lineup slots by position (slot 8 is the DH). */
export const AWAY_POSITIONS = [-1, 7, 4, 1, 2, 5, 3, 0, 6];
/**
 * A fielder's skill as multipliers of the stage's base values (1 at rating 65):
 * speed → chase speed, eye → first-step reaction (lower is quicker), power → throwing arm.
 */
export const fieldSkill = (p: Pick<Player, "speed" | "eye" | "power">) => ({
  run: clamp(1 + (p.speed - 65) * 0.004, 0.8, 1.2),
  react: clamp(1 - (p.eye - 65) * 0.004, 0.82, 1.15),
  arm: clamp(1 + (p.power - 65) * 0.004, 0.84, 1.2),
});
/** Team averages for the strength panel. */
export const teamRatings = (players: Player[]) => {
  const avg = (k: "contact" | "power" | "eye" | "speed") =>
    Math.round(players.reduce((a, p) => a + p[k], 0) / Math.max(1, players.length));
  return { contact: avg("contact"), power: avg("power"), eye: avg("eye"), speed: avg("speed") };
};
/** Kept for older code paths: our teammates (slot 0 is filled in from the career). */
export const RIVALS = HOME_LINEUP;
/** An AI team's ace: km/h above the stage's base speed, control spread multiplier, pitch mix. */
export type Ace = {
  name: string;
  hand: "R" | "L";
  velocity: number;
  control: number;
  kinds: number;
};
export type Roster = { name: string; style: string; lineup: Player[]; ace: Ace };
/**
 * Rival high schools. A new one comes each match day; each has its own style and strength, and
 * its players (made from the school's name) are the same every time you meet them.
 */
export const SCHOOLS: {
  name: string;
  strength: number;
  style: "speed" | "power" | "contact" | "balanced";
}[] = [
  { name: "한빛고", strength: 58, style: "balanced" },
  { name: "청운고", strength: 62, style: "speed" },
  { name: "동해고", strength: 66, style: "power" },
  { name: "새벽고", strength: 56, style: "contact" },
  { name: "백송고", strength: 64, style: "balanced" },
  { name: "금강고", strength: 70, style: "power" },
  { name: "은하고", strength: 60, style: "contact" },
  { name: "해솔고", strength: 63, style: "speed" },
  { name: "보람고", strength: 55, style: "balanced" },
  { name: "태백고", strength: 72, style: "contact" },
  { name: "서림고", strength: 61, style: "power" },
  { name: "가람고", strength: 67, style: "speed" },
];
export const STYLE_NAMES = {
  speed: "발 빠른 팀",
  power: "장타 팀",
  contact: "정교한 팀",
  balanced: "균형 잡힌 팀",
} as const;
const SURNAMES = "김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허남심노".split("");
const GIVEN = "민서준도윤시우하지현예건우진태영성재호수빈현석동훈승찬유원규한결".split("");
/** English names for major-league rosters (fictional players). */
const EN_FIRST =
  "Jake Ryan Tyler Cody Mason Logan Austin Blake Evan Nolan Caleb Owen Luke Dylan Grant Shane Trevor Wyatt Cole Brady Miguel Diego Luis Rafael Marco Hiroshi Kenji Daniel Victor Andre".split(
    " ",
  );
const EN_LAST =
  "Miller Carter Brooks Hayes Turner Parker Collins Reed Morgan Foster Bennett Sullivan Hughes Price Ramirez Torres Castillo Ortega Mendez Navarro Walker Fisher Coleman Barnes Tanaka Sato Kim Park Wright Lawson".split(
    " ",
  );
const hashName = (text: string) => {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};
/** Batting-order roles: leadoff speed, table-setters, the heart of the order, the bottom. */
const SLOT_ROLES = [
  { contact: 6, power: -12, eye: 4, speed: 18 },
  { contact: 8, power: -6, eye: 6, speed: 8 },
  { contact: 8, power: 8, eye: 6, speed: 0 },
  { contact: 0, power: 20, eye: -2, speed: -12 },
  { contact: 2, power: 12, eye: 0, speed: -6 },
  { contact: 0, power: 2, eye: 0, speed: 0 },
  { contact: -4, power: -2, eye: -2, speed: 2 },
  { contact: -8, power: -8, eye: -4, speed: 6 },
  { contact: -10, power: -10, eye: -4, speed: 10 },
];
const STYLE_BONUS = {
  speed: { contact: 2, power: -4, eye: 0, speed: 10 },
  power: { contact: -3, power: 10, eye: -2, speed: -4 },
  contact: { contact: 8, power: -4, eye: 6, speed: 0 },
  balanced: { contact: 2, power: 2, eye: 2, speed: 2 },
};
const rosterCache = new Map<string, Roster>();
/** The fixed roster of a team: same names and ratings every time (seeded by the team name). */
export function makeRoster(
  name: string,
  strength: number,
  style: keyof typeof STYLE_BONUS = "balanced",
): Roster {
  const key = `${name}|${strength}|${style}`,
    cached = rosterCache.get(key);
  if (cached) return cached;
  let seed = hashName(name);
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296,
    pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)],
    used = new Set<string>(),
    person = () => {
      let n = "";
      do n = pick(SURNAMES) + pick(GIVEN) + pick(GIVEN);
      while (used.has(n) || n[1] === n[2]);
      used.add(n);
      return n;
    },
    bonus = STYLE_BONUS[style],
    rate = (base: number) => Math.round(clamp(base + (rnd() - 0.5) * 10, 35, 95));
  const lineup = SLOT_ROLES.map((r) => ({
    name: person(),
    hand: (rnd() < 0.32 ? "L" : "R") as "L" | "R",
    contact: rate(strength + r.contact + bonus.contact),
    power: rate(strength + r.power + bonus.power),
    eye: rate(strength + r.eye + bonus.eye),
    speed: rate(strength + r.speed + bonus.speed),
  }));
  const roster: Roster = {
    name,
    style: STYLE_NAMES[style],
    lineup,
    ace: {
      name: person(),
      hand: rnd() < 0.3 ? "L" : "R",
      velocity: Math.round((strength - 62) * 0.45 + (rnd() - 0.5) * 4),
      control:
        Math.round(clamp(1.25 - (strength - 50) * 0.014 + (rnd() - 0.5) * 0.15, 0.7, 1.4) * 100) /
        100,
      kinds: strength >= 68 ? 4 : strength >= 60 ? 3 : 2,
    },
  };
  rosterCache.set(key, roster);
  return roster;
}
/** Pro ratings: average 150, spread ±50 (100–200). */
export const PRO_MEAN = 150;
export const PRO_SPREAD = 50;
/**
 * A pro club's fixed roster (seeded by the club name). Ratings are 150 ± 50 by batting-order
 * role; the ace's speed and control come from his own rating on the same scale.
 */
export function makeProRoster(name: string, mean = PRO_MEAN, spread = PRO_SPREAD): Roster {
  const key = `${name}|pro|${mean}|${spread}`,
    cached = rosterCache.get(key);
  if (cached) return cached;
  let seed = hashName(name) ^ 0x5bd1e995;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296,
    pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)],
    used = new Set<string>(),
    // Major-league clubs have English names; Korean clubs Korean ones.
    english = MLB_TEAMS.some((t) => t.name === name),
    person = () => {
      let n = "";
      if (english)
        do n = `${pick(EN_FIRST)} ${pick(EN_LAST)}`;
        while (used.has(n));
      else
        do n = pick(SURNAMES) + pick(GIVEN) + pick(GIVEN);
        while (used.has(n) || n[1] === n[2]);
      used.add(n);
      return n;
    },
    rate = (role: number) =>
      Math.round(clamp(mean + role + (rnd() - 0.5) * 2 * spread, mean - spread, mean + spread));
  const lineup: Player[] = SLOT_ROLES.map((r) => ({
    name: person(),
    hand: (rnd() < 0.32 ? "L" : "R") as "L" | "R",
    contact: rate(r.contact),
    power: rate(r.power),
    eye: rate(r.eye),
    speed: rate(r.speed),
    pro: true,
  }));
  const aceRating = rate(0),
    strength = proForm(aceRating);
  const roster: Roster = {
    name,
    style: "프로",
    lineup,
    ace: {
      name: person(),
      hand: rnd() < 0.3 ? "L" : "R",
      velocity: Math.round((strength - 62) * 0.45 + (rnd() - 0.5) * 4),
      control:
        Math.round(clamp(1.25 - (strength - 50) * 0.014 + (rnd() - 0.5) * 0.15, 0.7, 1.4) * 100) /
        100,
      kinds: 4,
    },
  };
  rosterCache.set(key, roster);
  return roster;
}
/**
 * What a pro rating means in the game formulas: 150 (pro average) plays like the 80-rated pro
 * rosters the pro stage was tuned with; 100 like 60, 200 like 100.
 */
export const proForm = (v: number) => 80 + (v - PRO_MEAN) * 0.4;
/** The player as the formulas see him (pro players mapped by proForm, everyone else as is). */
export const formOf = (p: Player): Player =>
  p.pro
    ? {
        ...p,
        contact: proForm(p.contact),
        power: proForm(p.power),
        eye: proForm(p.eye),
        speed: proForm(p.speed),
      }
    : p;
/** Share of the player's average stat gain that the teammates gain too. */
export const TEAM_GROWTH = 0.75;
/** Today's rival school (a different one each match day). */
export const opponentSchool = (day: number) => SCHOOLS[(Math.max(1, day) - 1) % SCHOOLS.length];
export type Career = {
  version: 1;
  name: string;
  day: number;
  energy: number;
  form: number;
  stats: {
    velocity: number;
    control: number;
    movement: number;
    stamina: number;
    contact: number;
    power: number;
    /** Base-running speed (added later; older saves get the default). */
    speed: number;
  };
  scout: number;
  xp: number;
  games: number;
  wins: number;
  strikeouts: number;
  hits: number;
  runs: number;
  outs: number;
  draft: string;
  history: string[];
  /** Learned pitch types (bought with XP). */
  pitches: PitchId[];
  /** Actions left today; refilled to DAY_ACTIONS when a match ends the day. */
  actions: number;
  /** Pitch granted by the starting roulette ("" = not received yet). */
  blessing: string;
  /** Name and starting stats were chosen on the creation screen. */
  created: boolean;
  /** Dream club (TEAMS id). Its scout watches every season match. */
  team: string;
  /** Current career stage. "pro" after the signing ending. */
  stage: Stage;
  /** Club the player signed with (TEAMS id, "" = not signed yet). */
  club: string;
  /** The signing ending was watched and pro play is open. */
  proUnlocked: boolean;
  /** The pro goal (STAGES.pro.goalReward) has been reached. */
  proGoal: boolean;
  /** Secret "오타니" start: stats may stay above the high-school cap (optional, older saves lack it). */
  legend?: boolean;
  /** Rating points every teammate has gained with the player (optional, older saves: 0). */
  teamBoost?: number;
  /** Batting order chosen by the player: slot (0–8) → roster member (0 = the player).
   * Missing = the default order (the player leads off). */
  battingOrder?: number[];
  /** "mlb" after signing with a major-league club (absent = Korean pro league). */
  league?: "mlb";
  /** Major-league club signed with (MLB_TEAMS id). */
  mlbClub?: string;
  /** First team: each MLB club scout's evaluation (0–100). */
  mlbScouts?: Record<string, number>;
  /** Turned every MLB club down: stays home with the stat cap raised to 250. */
  limitless?: boolean;
  /** Developer mode: stat cap lifted for testing (250). */
  devCap?: number;
  /** The developer password was entered during this career (hall-of-fame badge, never cleared). */
  devUsed?: boolean;
  /** Day each stage was reached (hall of fame): draft offer, first team, MLB contract. */
  proDay?: number;
  firstDay?: number;
  mlbDay?: number;
  /** Training: fraction of a stat point carried to the next session (×1.5 gains). */
  trainCarry?: number;
  /** Hidden skill pine tar (V) is learned. */
  pineTar?: boolean;
  /** Caught with pine tar and ejected: hall-of-fame title 「불명예」 (never cleared). */
  dishonor?: boolean;
  /** Hall-of-fame identity of this career: row id and the secret that lets it update its row. */
  hofId?: string;
  hofSecret?: string;
  /** Ranking nickname and #tag of this career (travels with the save code). */
  hofNick?: string;
  hofTag?: string;
  /** Easiest difficulty a match of this career was played on (its hall-of-fame board). */
  minDifficulty?: Difficulty;
  /** Chosen at creation, fixed: pitch and bat (default), pitch only, or bat only. */
  role?: Role;
};
export type Role = "two-way" | "pitcher" | "batter";
/** Stats each role uses (limit break needs them all at 250). */
export const ROLE_STATS: Record<Role, (keyof Career["stats"])[]> = {
  "two-way": ["velocity", "control", "movement", "stamina", "contact", "power", "speed"],
  pitcher: ["velocity", "control", "movement", "stamina"],
  batter: ["contact", "power", "speed"],
};
/** Highest a stat can go for this career (the pro cap for a legend start). */
export const statCapOf = (
  c: Pick<Career, "stage" | "legend" | "league" | "limitless" | "devCap">,
) =>
  Math.max(
    c.devCap ?? 0,
    c.league === "mlb" || c.limitless
      ? LIMITLESS_CAP
      : c.legend
        ? STAGES.pro.statCap
        : STAGES[c.stage].statCap,
  );
/** Stat cap in the major league, or for staying home after turning every MLB club down. */
export const LIMITLESS_CAP = 250;
/** Limit break (G): every stat counts as this for one inning. */
export const LIMIT_BREAK = 300;
/** Hidden skill pine tar: pitching ratings bonus, and the penalty when the umpire finds it. */
export const PINE_TAR_BOOST = 20;
export const PINE_TAR_PENALTY = 20;
/** Cheer (T): opponents' ratings drop by this for one inning. */
export const CHEER_DROP = 15;
/** Secret name: typing it on the creation screen starts a two-way legend. */
export const isLegendName = (name: string) => /^오타니(쇼헤이)?$/.test(name.replace(/\s/g, ""));
/** Pitches the legend start begins with (no roulette). */
export const LEGEND_PITCHES: PitchId[] = [
  "fastball",
  "curve",
  "sinker",
  "cutter",
  "slider",
  "sweeper",
  "splitter",
];
export const newCareer = (): Career => ({
  version: 1,
  name: "나의 선수",
  day: 1,
  energy: 100,
  form: 76,
  stats: {
    velocity: 64,
    control: 65,
    movement: 62,
    stamina: 66,
    contact: 60,
    power: 56,
    speed: 60,
  },
  scout: 22,
  xp: 0,
  games: 0,
  wins: 0,
  strikeouts: 0,
  hits: 0,
  runs: 0,
  outs: 0,
  draft: "",
  history: ["고교 3학년, 마지막 시즌의 첫날."],
  pitches: [...STARTING_PITCHES],
  actions: DAY_ACTIONS,
  blessing: "",
  created: false,
  team: "",
  stage: "high",
  club: "",
  proUnlocked: false,
  proGoal: false,
});
export type Flight = {
  start: Vec;
  target: Vec;
  aim: Vec;
  velocity: Vec;
  duration: number;
  visualDuration: number;
  elapsed: number;
  pitch: PitchId;
  speed: number;
  movement: number;
  swung: boolean;
  swingTime: number;
  batAim: Vec;
  /** Batting only: faint area around the true crossing point; smaller with higher contact. */
  hint: { x: number; y: number; r: number } | null;
  /** Decided at release from the pitcher's stamina: the catcher cannot hold this pitch. */
  wild: boolean;
  /** Knuckle wobble phase, rolled at release. */
  seed?: number;
  /** Limit break was armed for this pitch: every player stat counts as 300 for it and its play. */
  limit?: boolean;
  /** The AI batter swung at this pitch (for the swing animation; set when the pitch arrives). */
  aiSwing?: boolean;
};
export type BatFeedback = {
  timing: "early" | "good" | "late" | "take";
  offsetMs: number | null;
  errorCm: number | null;
  contact: boolean;
  ball: Vec;
  batAim: Vec | null;
};
export type LivePlay = {
  /** A bunt: deadened roller that barely rolls on after it slows. */
  bunt?: boolean;
  /** Extra first-step delay for this play's fielder (s): charging and barehanding a bunt. */
  reactionExtra?: number;
  /**
   * batted: ball put in play (runners[0] is the batter).
   * wild: wild pitch, the catcher chases the ball to the backstop.
   * steal: the catcher throws to second on an E steal call.
   * pickoff: the pitcher throws to a base instead of home.
   */
  kind: "batted" | "wild" | "steal" | "pickoff";
  /** Time from fielding the ball to releasing the throw (s). */
  hold: number;
  /** Throw speed of the current fielder (m/s). */
  throwSpeed: number;
  /** Ball/strike call of the pitch that started a wild/steal play, shown with the verdict. */
  call: string;
  start: Vec;
  land: Vec;
  duration: number;
  elapsed: number;
  fielder: number;
  fielderPos: Vec;
  state: "추적" | "포구" | "송구" | "보유";
  throwBase: number;
  manual: boolean;
  quality: number;
  resultBases: number;
  runnerStart: boolean[];
  ground: boolean;
  bounced: boolean;
  flightTime: number;
  height: number;
  catchAt: number;
  catchPoint: Vec;
  caughtFly: boolean;
  fieldedAt: number | null;
  defenders: Vec[];
  runners: RunnerTrack[];
  throw: FieldThrow | null;
  requestedBase: number | null;
  throws: number;
  outs: PlayOut[];
  error: boolean;
  sacrifice: boolean;
  /** How the ball was fielded (for the animation and the callout). */
  catchStyle?: "catch" | "jump" | "dive" | "ground";
  /** When the dive or jump happened (s from play start). */
  catchMoment?: number;
  /** A dive was tried on this ball (one per play); the fielder is down until this time. */
  diveTried?: boolean;
  downUntil?: number;
  /** Who made the dive (the play may then pass to a backup fielder). */
  diver?: number;
  /**
   * Automatic fielding decides a catch or dive a moment early (`RULES.planLead`), so the
   * animation can show the run-up, crouch and take-off. `gap` is how far he would be from the
   * ball on foot (the same number the rules use); a dive's outcome is rolled when it is
   * planned, and he flies from `launch` to `end` between `launchAt` and `at`.
   */
  plan?: {
    style: "catch" | "jump" | "dive" | "none";
    at: number;
    gap: number;
    foot: Vec;
    success?: boolean;
    end?: Vec;
    ball?: Vec;
    launchAt?: number;
    launch?: Vec;
  };
  /** An outfielder took over a grounder that got through the infield. */
  backedUp?: boolean;
  /** Runners have read the fly (dropping: running at full speed). */
  readDone?: boolean;
  /** Relay planned or under way: the cutoff man, his spot and the base it goes on to. */
  relay?: { who: number; spot: Vec; base: number };
  /** Next play time the chase assignment is re-read. */
  chaseAt?: number;
  /** How many times the chase was handed to another fielder (zones), and when last. */
  handoffs?: number;
  handoffAt?: number;
  /** Low, hard liner (the fielder may have to leap for it). */
  lineDrive?: boolean;
  /** After an error the ball rolls loose from `from` (play time `at`, m/s `v0` along dx/dz). */
  loose?: { from: Vec; dx: number; dz: number; v0: number; at: number };
  /** A fielder who just fumbled the ball cannot chase it until `until`. */
  recover?: { who: number; until: number };
  /** Errors made on this play, and the kind of the first one. */
  miscues?: number;
  errorKind?: "field" | "drop" | "throw";
  /** A runner caught between two bases (the holder chases him or they throw him back). */
  rundown?: { runnerId: number; since: number; base: number; tagAt?: number; end?: number };
  /** Learned fielder AI chasing a runner: when it decides again, and what it decided. */
  holdThinkAt?: number;
  holdPlan?: number;
};
/**
 * A learned decision maker (AI training ground, `lib/ai`): gets the play's context and one
 * feature row per legal option and returns the index of the option it takes. Only batted-ball
 * plays ask it; what is legal (forces, tags, who may go where) is still the engine's.
 */
export type Chooser = (ctx: number[], options: number[][]) => number;
/** Sizes of the context row and of one option row (runner / ball holder). */
export const AI_CTX = 10,
  AI_RUNNER = 12,
  AI_HOLDER = 13;
export type GameState = {
  mode: Mode;
  phase: Phase;
  paused: boolean;
  inning: number;
  half: "top" | "bottom";
  maxInnings: number;
  score: [number, number];
  lines: [number[], number[]];
  hits: [number, number];
  errors: [number, number];
  balls: number;
  strikes: number;
  outs: number;
  bases: boolean[];
  order: [number, number];
  pitchCount: [number, number];
  energy: number;
  camera: Camera;
  autoCamera: boolean;
  autoField: boolean;
  /** Show name tags above the fielders. */
  nameTags: boolean;
  aim: Vec;
  selected: PitchId;
  effort: number;
  difficulty: Difficulty;
  /** Carry of the last ball hit in the air (m), for the result line; null for grounders. */
  lastDistance: number | null;
  swingStyle: "contact" | "power" | "bunt";
  sound: boolean;
  message: string;
  detail: string;
  resultTone: string;
  timer: number;
  flight: Flight | null;
  live: LivePlay | null;
  ball: Vec;
  lastSpeed: number;
  lastError: number;
  lastPitch: string;
  history: { x: number; y: number; kind: string; pitch: string }[];
  log: string[];
  practice: { pitches: number; strikes: number; hits: number; best: number };
  career: Career;
  saveStatus: string;
  lastResult: string;
  batFeedback: BatFeedback | null;
  /** XP earned so far in the current season match, credited when the match finishes. */
  matchXp: number;
  lastXpGain: number;
  /** Dream-club scout evaluation before/after the last finished match. */
  lastScout: { before: number; after: number } | null;
  /** Why the gauge and XP moved after the last finished match (lines add up to the totals). */
  lastScoutParts: RecapLine[];
  lastXpParts: RecapLine[];
  /** Result type of the last pitch. */
  lastOutcome: PitchOutcome | null;
  /** E pressed: the runner on first goes with the next pitch (STEAL_READY). */
  stealCall: boolean;
  /** The stealing runner while the pitch is being delivered (null otherwise). */
  stealTrack: RunnerTrack | null;
  /** Pickoff throws during this plate appearance; runners shorten their lead after each. */
  pickoffs: number;
  /** First team: each MLB scout's evaluation before/after the last match. */
  lastMlb: { id: string; before: number; after: number }[];
  /** Today's weather (rain changes the whole match) and the rain coin toss between innings. */
  weather: Weather;
  coin: { result: "go" | "cancel" } | null;
  /** Big centre-screen callout ("폭투", "풀카운트"); `id` changes each time one fires. */
  flash: { text: string; tone: string; id: number } | null;
  /**
   * Fielding highlight (diving/jumping catch, diving stop): the 3D view shows it again in a
   * small slow-motion "TV" window. `fielder` made it at play time `at` (s); `id` is new each time.
   */
  replay: {
    text: string;
    fielder: number;
    at: number;
    id: number;
    /** Close play at a base: the runner (track id), the base, and the call. */
    base?: { runner: number; base: number; out: boolean };
  } | null;
  /** The 3D view is still showing a replay: the next batter/inning waits for it. */
  replayBusy: boolean;
  /** Hit by pitch: where the ball touched the batter's body and which part (new `id` each time). */
  hbp: { x: number; y: number; z: number; part: string; id: number } | null;
  /** Developer view: draw the hitboxes (runners, bags, fielders at the bags, the batter). */
  showHitboxes: boolean;
  /** Settings: rain may fall (off = always clear). Kept in this browser. */
  rainOn: boolean;
  /** The match was called off by rain. */
  rainedOut: boolean;
  /** Limit break: uses this match, and armed for the very next pitch. */
  limitUsed: number;
  limitArmed: boolean;
  /** Hidden skill V: pine tar on the ball for the rest of this match (pitching +20). */
  pineTar: boolean;
  /** The umpire found the pine tar: ejected, the match is lost. */
  ejected: boolean;
  /** Cheer (T) used in this match, and the inning it is active in (0 = none). */
  cheerUsed: boolean;
  cheerInning: number;
  /** A hidden condition just met: a hidden pitch, or the "legend" start (UI shows a reveal). */
  hiddenUnlock: PitchId | "legend" | "pinetar" | null;
};
const initial = (career: Career, mode: Mode = "match", maxInnings = 3): GameState => ({
  mode,
  phase: "ready",
  paused: false,
  inning: 1,
  half: mode === "batting" ? "bottom" : "top",
  maxInnings,
  score: [0, 0],
  lines: [Array(maxInnings).fill(0), Array(maxInnings).fill(0)],
  hits: [0, 0],
  errors: [0, 0],
  balls: 0,
  strikes: 0,
  outs: 0,
  bases: [false, false, false],
  order: [0, 0],
  pitchCount: [0, 0],
  energy: career.energy,
  camera: mode === "batting" ? "catcher" : "pitcher",
  autoCamera: true,
  autoField: true,
  nameTags: true,
  aim: V(0, 0.95, 0),
  selected: "fastball",
  effort: 90,
  difficulty: difficultySetting(),
  lastDistance: null,
  swingStyle: "contact",
  sound: soundSetting(),
  message: mode === "batting" ? "타석에 들어섰습니다" : "첫 공, 어디로 던질까요?",
  detail:
    mode === "batting"
      ? "공을 기다린 뒤 클릭해 스윙하세요"
      : "스트라이크 존 또는 오른쪽 조준판을 클릭해 투구",
  resultTone: "neutral",
  timer: 1.6,
  flight: null,
  live: null,
  ball: V(0.35, 1.85, 18.44),
  lastSpeed: 0,
  lastError: 0,
  lastPitch: "—",
  history: [],
  log: [`${HOME_SCHOOL} vs ${opponentSchool(career.day).name} · 경기 준비`],
  practice: { pitches: 0, strikes: 0, hits: 0, best: 0 },
  career,
  saveStatus: "이 브라우저에 자동 저장",
  lastResult: "",
  batFeedback: null,
  matchXp: 0,
  lastXpGain: 0,
  lastScout: null,
  lastScoutParts: [],
  lastXpParts: [],
  lastOutcome: null,
  stealCall: false,
  stealTrack: null,
  pickoffs: 0,
  hiddenUnlock: null,
  lastMlb: [],
  cheerUsed: false,
  cheerInning: 0,
  weather: mode === "match" && rainSetting() ? weatherOf(career) : "clear",
  rainOn: rainSetting(),
  coin: null,
  rainedOut: false,
  flash: null,
  replay: null,
  replayBusy: false,
  hbp: null,
  showHitboxes: false,
  limitUsed: 0,
  limitArmed: false,
  pineTar: false,
  ejected: false,
});
export class BaseballEngine {
  private matchStrikeouts = 0;
  private matchHits = 0;
  private matchRuns = 0;
  state: GameState;
  private listeners = new Set<() => void>();
  private snapshot: GameState;
  private rng: () => number;
  private emitClock = 0;
  private recorded = false;
  private soundCallback: (kind: string) => void = () => {};
  keys = new Set<string>();
  /** Learned AI for runners / for the fielder with the ball (null: the hand-written AI). */
  runnerBrain: Chooser | null = null;
  fielderBrain: Chooser | null = null;
  /** Learned AI of the other team (set from the difficulty, lib/ai/levels.ts); our own
   * runners and fielders always use the hand-written AI. */
  opponentAI: { runner: Chooser | null; fielder: Chooser | null } = { runner: null, fielder: null };
  /** Who decides for the runners / the ball holder on this play (null: hand-written AI). */
  get runnerAI(): Chooser | null {
    return this.runnerBrain ?? (this.batting ? null : this.opponentAI.runner);
  }
  get fielderAI(): Chooser | null {
    return this.fielderBrain ?? (this.batting ? this.opponentAI.fielder : null);
  }
  /** Training ground metrics: sees every throw decision (learned or hand-written AI). */
  throwObserver: ((ctx: number[], options: number[][], pick: number) => void) | null = null;
  constructor(career?: Career, rng = Math.random) {
    // A career handed in is this engine's own; the empty default waits for load().
    this.loaded = career !== undefined;
    this.state = initial(career ?? newCareer());
    this.snapshot = { ...this.state };
    this.rng = rng;
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.snapshot;
  emit() {
    this.autoSaveMatch();
    this.snapshot = { ...this.state };
    this.listeners.forEach((fn) => fn());
  }
  get batting() {
    return (
      this.state.mode === "batting" || (this.state.mode === "match" && this.state.half === "bottom")
    );
  }
  /** Rosters are rebuilt from the same inputs on every lookup: keep the last ones. */
  private rosterCache = new Map<string, Roster>();
  private cachedRoster(key: string, make: () => Roster) {
    let r = this.rosterCache.get(key);
    if (!r) {
      if (this.rosterCache.size > 8) this.rosterCache.clear();
      r = make();
      this.rosterCache.set(key, r);
    }
    return r;
  }
  /** Our team: 미산고 in high school, the signed club in the pros. Slot 0 is the player. */
  get homeRoster(): Roster {
    const c = this.state.career,
      club = c.stage === "pro" ? teamOf(c.club) : null;
    const tier = tierOf(c);
    if (tier === "mlb") {
      const r = TIER_RATINGS.mlb;
      return this.cachedRoster(`home|mlb|${this.teams[1]}|${r.mean}|${r.spread}`, () =>
        makeProRoster(this.teams[1], r.mean, r.spread),
      );
    }
    const r = TIER_RATINGS[tier === "first" ? "first" : "farm"];
    return club
      ? this.cachedRoster(`home|${tier}|${this.teams[1]}|${r.mean}|${r.spread}`, () =>
          makeProRoster(this.teams[1], r.mean, r.spread),
        )
      : this.cachedRoster("home|school", () => ({
          name: HOME_SCHOOL,
          style: "",
          lineup: HOME_LINEUP,
          ace: makeRoster(HOME_SCHOOL, 60).ace,
        }));
  }
  /** Today's opponent: a rival high school (new each day) or a rival pro club. */
  get awayRoster(): Roster {
    const c = this.state.career,
      [away] = matchTeams(c);
    const tier = tierOf(c);
    if (tier === "mlb" || (tier !== "high" && teamOf(c.club))) {
      const r = TIER_RATINGS[tier as Exclude<Tier, "high">];
      return this.cachedRoster(`away|${tier}|${away}|${r.mean}|${r.spread}`, () =>
        makeProRoster(away, r.mean, r.spread),
      );
    }
    const school = opponentSchool(c.day);
    return this.cachedRoster(`away|school|${school.name}|${school.strength}|${school.style}`, () =>
      makeRoster(school.name, school.strength, school.style),
    );
  }
  /** The batting order in use: lineup slot → roster member (0 = the player). */
  get battingOrder(): number[] {
    const o = this.state.career.battingOrder;
    return validOrder(o) ? o : DEFAULT_ORDER;
  }
  /**
   * Sets the batting order (slot → member). Only between matches: mid-game it would change
   * who is on base. False when refused or not a valid order.
   */
  setBattingOrder(order: number[] | null) {
    if (this.matchActive || (order && !validOrder(order))) return false;
    const c = this.state.career;
    if (!order || order.every((k, i) => k === i)) delete c.battingOrder;
    else c.battingOrder = [...order];
    this.persist();
    this.emit();
    return true;
  }
  /** Our hitter in lineup slot i (the batting order picks the member). */
  ourRunner(i: number): Player {
    return this.member(this.battingOrder[((i % 9) + 9) % 9]);
  }
  /**
   * Our roster member k: the player is member 0 (career stats); 1–8 are the teammates with
   * their own contact, power, eye and speed. The user swings for all of them.
   */
  member(k: number): Player {
    const c = this.state.career,
      i = k;
    let p = this.homeRoster.lineup[i % 9];
    // A pitch-only player does not bat: a designated hitter (the team's average bat) does.
    if (i % 9 === 0 && this.role === "pitcher") {
      const avg = teamRatings(this.homeRoster.lineup.slice(1));
      p = { ...p, ...avg, name: "지명타자", nick: "", hand: "L", pro: !!p.pro };
    } else if (i % 9 === 0)
      return {
        ...p,
        name: c.name,
        nick: "",
        hand: "R",
        contact: this.playerStats.contact,
        power: this.playerStats.power,
        speed: this.playerStats.speed,
        pro: false,
      };
    // Teammates grow with the player (TEAM_GROWTH of his average gain), up to the stage cap.
    const boost = Math.floor(c.teamBoost ?? 0),
      cap = STAGES[c.stage].statCap,
      up = (v: number) => Math.min(cap, Math.max(v, v + boost));
    return boost
      ? { ...p, contact: up(p.contact), power: up(p.power), eye: up(p.eye), speed: up(p.speed) }
      : p;
  }
  /** Our at-bat in slot i: the same player who then runs the bases. */
  private ourBatter(i: number): Player {
    return this.ourRunner(i);
  }
  /** True when the player character (leadoff, slot 0) is at the plate. */
  get playerUp() {
    return (
      this.batting &&
      this.role !== "pitcher" &&
      (this.state.mode !== "match" || this.battingOrder[this.state.order[1] % 9] === 0)
    );
  }
  /** The nine fielders now on defense, in DEFENSE order (index 0 = pitcher). */
  get fielders(): Player[] {
    return this.defenseOf(!this.batting);
  }
  /** Nine fielders of our team (home) or the rival (away), in DEFENSE order. */
  defenseOf(home: boolean): Player[] {
    // Positions belong to the members, whatever the batting order.
    if (home) return HOME_POSITIONS.map((k) => this.member(k));
    const r = this.awayRoster,
      // The ace fields like an average player of his team (pro scale in the pros).
      pro = !!r.lineup[0]?.pro,
      avg = teamRatings(r.lineup);
    return AWAY_POSITIONS.map((slot) =>
      this.cheered(
        slot < 0
          ? pro
            ? { name: r.ace.name, hand: r.ace.hand, ...avg, pro }
            : { name: r.ace.name, hand: r.ace.hand, contact: 50, power: 66, eye: 62, speed: 58 }
          : r.lineup[slot],
      ),
    );
  }
  /** Team strength for the panel: batting/running averages, defense, and the pitcher. */
  teamStrength(home: boolean) {
    const hitters = home
        ? Array.from({ length: 9 }, (_, i) => this.ourRunner(i))
        : this.awayRoster.lineup.map((p) => this.cheered(p)),
      d = this.defenseOf(home).slice(1),
      r = this.awayRoster;
    return {
      name: this.teams[home ? 1 : 0],
      ...teamRatings(hitters),
      defense: Math.round(d.reduce((a, p) => a + (p.speed + p.eye + p.power) / 3, 0) / d.length),
      pitcher: home ? this.state.career.name : r.ace.name,
      velocity: Math.round(
        home
          ? fastballSpeed(this.playerStats.velocity)
          : this.stageRules.aiVelocity + r.ace.velocity,
      ),
    };
  }
  /** Chase speed (m/s), first-step reaction (s) and throw speed (m/s) of fielder i. */
  fielderStats(i: number, l?: Pick<LivePlay, "reactionExtra" | "throwSpeed">) {
    const k = fieldSkill(
        this.fielders[i] ? formOf(this.fielders[i]) : { speed: 65, eye: 65, power: 65 },
      ),
      st = this.stageRules;
    return {
      speed: st.fielderSpeed * k.run,
      reaction:
        st.fielderReaction * k.react +
        (l?.reactionExtra ?? 0) +
        (this.raining ? RULES.rainReaction : 0),
      arm: (l?.throwSpeed ?? st.throwSpeed) * k.arm * (this.raining ? RULES.rainArm : 1),
    };
  }
  get batter(): Player {
    const s = this.state;
    // Batting practice is always the player; in a match the lineup slot decides.
    return this.batting
      ? s.mode === "match"
        ? this.ourBatter(s.order[1])
        : this.member(0)
      : this.cheered(this.awayRoster.lineup[s.order[0] % 9]);
  }
  onSound(fn: (kind: string) => void) {
    this.soundCallback = fn;
  }
  /** Difficulty profile of the current career stage (high school or pro). */
  get stageRules() {
    return STAGES[this.state.career.stage] ?? STAGES.high;
  }
  /** This tier's win-rate balance (match mode only; practice uses the neutral values). */
  get balance() {
    return this.state.mode === "match" ? TIER_BALANCE[tierOf(this.state.career)] : NEUTRAL_BALANCE;
  }
  /** [visiting team, our team] for the scoreboard and the log. */
  get teams(): [string, string] {
    return matchTeams(this.state.career);
  }
  sound(kind: string) {
    if (this.state.sound) this.soundCallback(kind);
  }
  /** One-off fanfare for a hidden condition; plays even when match sounds are off. */
  fanfare() {
    this.soundCallback("fanfare");
  }
  log(text: string) {
    this.state.log = [text, ...this.state.log].slice(0, 16);
  }
  /**
   * A save that has not been read yet (`load`) is never written over: the empty starting
   * career once replaced real saves when the hall of fame saved before the game loaded.
   */
  private loaded = false;
  persist() {
    try {
      if (
        !this.loaded &&
        typeof localStorage !== "undefined" &&
        localStorage.getItem("diamond-road-career-v1")
      )
        return;
    } catch {
      return;
    }
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("diamond-road-career-v1", JSON.stringify(this.state.career));
        // The save is this engine's own from now on.
        this.loaded = true;
        this.state.saveStatus = "이 브라우저에 자동 저장됨";
      }
    } catch {
      this.state.saveStatus = "저장 공간 사용 불가 · 현재 플레이는 유지";
    }
  }
  /**
   * Loads the saved career (this browser's, or `raw` JSON from a cloud save code).
   * Returns false when there was nothing valid to load.
   */
  load(raw: string | null = null): boolean {
    this.loaded = true;
    let ok = false;
    try {
      raw ??= localStorage.getItem("diamond-road-career-v1");
      if (raw) {
        const c = JSON.parse(raw),
          keys = Object.keys(newCareer().stats) as (keyof Career["stats"])[],
          // Stats added after the first release may be missing from older saves.
          required = keys.filter((k) => k !== "speed");
        if (
          c?.version !== 1 ||
          typeof c.name !== "string" ||
          !c.stats ||
          !required.every((k) => typeof c.stats[k] === "number" && Number.isFinite(c.stats[k])) ||
          ![
            c.day,
            c.energy,
            c.form,
            c.scout,
            c.games,
            c.xp,
            c.wins,
            c.strikeouts,
            c.hits,
            c.runs,
            c.outs,
          ].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0) ||
          !Array.isArray(c.history) ||
          !c.history.every((v: unknown) => typeof v === "string") ||
          typeof c.draft !== "string"
        )
          throw new Error("Invalid save");
        const clean = newCareer();
        Object.assign(clean, c);
        clean.name = c.name.slice(0, 12) || "나의 선수";
        clean.energy = clamp(c.energy, 0, 100);
        clean.form = clamp(c.form, 0, 100);
        clean.scout = clamp(c.scout, 0, 100);
        clean.history = c.history.slice(0, 12);
        clean.stats = { ...newCareer().stats };
        const cap =
          c.devCap === LIMITLESS_CAP ||
          (c.stage === "pro" && (c.league === "mlb" || c.limitless === true))
            ? LIMITLESS_CAP
            : c.stage === "pro" || c.legend === true
              ? STAGES.pro.statCap
              : STAGES.high.statCap;
        keys.forEach((k) => {
          const v = c.stats[k];
          if (typeof v === "number" && Number.isFinite(v)) clean.stats[k] = clamp(v, 0, cap);
        });
        // Saves made before the pitch shop already had the original four pitches.
        const known = Array.isArray(c.pitches)
          ? c.pitches.filter((id: unknown) => ALL_PITCHES.some((p) => p.id === id))
          : PITCHES.slice(0, AI_PITCHES).map((p) => p.id);
        clean.pitches = Array.from(new Set<PitchId>(["fastball", ...known]));
        clean.actions =
          typeof c.actions === "number" && Number.isFinite(c.actions)
            ? clamp(Math.round(c.actions), 0, DAY_ACTIONS)
            : DAY_ACTIONS;
        // Pre-shop saves already own four pitches, so they skip the starting roulette.
        clean.blessing =
          typeof c.blessing === "string" ? c.blessing : Array.isArray(c.pitches) ? "" : "legacy";
        delete (clean as Partial<{ trainedDay: number }>).trainedDay;
        // Players saved before the creation screen existed keep their name and stats.
        clean.created = typeof c.created === "boolean" ? c.created : true;
        clean.team = typeof c.team === "string" && teamOf(c.team) ? c.team : "";
        // Pro-stage fields (added later): older saves are high-school careers. A save that
        // already holds the dream-club contract keeps it and will see the signing ending.
        clean.club =
          typeof c.club === "string" && teamOf(c.club)
            ? c.club
            : clean.team && clean.draft.endsWith("입단")
              ? clean.team
              : "";
        clean.proUnlocked = c.proUnlocked === true && !!clean.club;
        clean.stage = c.stage === "pro" && clean.proUnlocked ? "pro" : "high";
        clean.proGoal = c.proGoal === true && clean.stage === "pro";
        clean.legend = c.legend === true;
        // Major-league fields (added later): only meaningful in the pros.
        clean.league =
          clean.stage === "pro" && c.league === "mlb" && mlbTeamOf(c.mlbClub) ? "mlb" : undefined;
        clean.mlbClub = clean.league ? c.mlbClub : undefined;
        clean.limitless = clean.stage === "pro" && c.limitless === true;
        clean.devCap = c.devCap === LIMITLESS_CAP ? LIMITLESS_CAP : undefined;
        clean.mlbScouts = Object.fromEntries(
          MLB_TEAMS.map((t) => {
            const v = c.mlbScouts?.[t.id];
            return [t.id, typeof v === "number" && Number.isFinite(v) ? clamp(v, 0, 100) : 0];
          }),
        );
        clean.teamBoost =
          typeof c.teamBoost === "number" && Number.isFinite(c.teamBoost)
            ? clamp(c.teamBoost, 0, 200)
            : 0;
        // Batting order (v12): kept only if it is a valid order of the nine.
        if (validOrder(c.battingOrder)) clean.battingOrder = [...c.battingOrder];
        else delete clean.battingOrder;
        this.state.career = clean;
        this.state.energy = clean.energy;
        // The match being prepared belongs to the loaded day: its weather too.
        if (this.state.mode === "match" && !this.matchActive)
          this.state.weather = this.state.rainOn ? weatherOf(clean) : "clear";
        if (this.checkHiddenPitches()) this.persist();
        ok = true;
      }
    } catch {
      this.state.saveStatus = "저장 데이터를 읽지 못해 기본 선수로 시작";
    }
    this.emit();
    return ok;
  }
  /**
   * A career from a cloud save code: checked like a local save, then it replaces this one
   * (any match in progress here is dropped). False if the data is not a valid career.
   */
  importCareer(data: unknown): boolean {
    const before = this.state.career;
    if (!this.load(JSON.stringify(data))) {
      this.state.career = before;
      return false;
    }
    this.clearMatchSave();
    this.start("match", this.state.maxInnings);
    this.persist();
    this.emit();
    return true;
  }
  /**
   * The match in progress is kept in this browser, so a refresh or a closed tab picks it up
   * again (`resumeMatch`). Between pitches the state itself is saved; once a pitch is on its
   * way (or the ball is in play) the save says so, and coming back counts that pitch against
   * the player (`refreshPenalty`) so a refresh cannot take a pitch back.
   */
  private matchSaved = "";
  /** The last between-pitches save, and what is under way since: a pitch, or a ball in play. */
  private calmSave: Record<string, unknown> | null = null;
  private underway: "pitch" | "play" | null = null;
  private autoSaveMatch() {
    const s = this.state;
    if (s.mode !== "match") return;
    if (s.phase === "finished") {
      this.clearMatchSave();
      return;
    }
    if (!this.matchActive) return;
    let save: Record<string, unknown>;
    if (s.phase === "ready" || s.phase === "between" || s.phase === "result") {
      this.underway = null;
      const fields = Object.fromEntries(MATCH_FIELDS.map((k) => [k, s[k]]));
      save = this.calmSave = {
        v: 1,
        name: s.career.name,
        day: s.career.day,
        games: s.career.games,
        phase: s.phase,
        fields,
        extra: {
          matchStrikeouts: this.matchStrikeouts,
          matchHits: this.matchHits,
          matchRuns: this.matchRuns,
          xpParts: [...this.xpParts],
          fullCountKey: this.fullCountKey,
          // The verdict on screen, when the save is made while it is shown.
          ...(s.phase === "result"
            ? { message: s.message, detail: s.detail, resultTone: s.resultTone }
            : {}),
        },
      };
    } else {
      // windup / flight / in play: the last calm save, marked with what is under way.
      if (s.phase === "windup" || s.phase === "flight") this.underway ??= "pitch";
      if (!this.calmSave || !this.underway) return;
      save = { ...this.calmSave, underway: this.underway };
    }
    const data = JSON.stringify(save);
    if (data === this.matchSaved) return;
    this.matchSaved = data;
    try {
      localStorage.setItem(MATCH_KEY, data);
    } catch {
      /* private mode: the match lasts for this visit */
    }
  }
  private clearMatchSave() {
    this.matchSaved = "";
    this.calmSave = null;
    this.underway = null;
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(MATCH_KEY);
    } catch {
      /* nothing saved */
    }
  }
  /** After load(): picks up a match left in the middle (same player, same day). */
  resumeMatch(): boolean {
    try {
      const m = JSON.parse(localStorage.getItem(MATCH_KEY) ?? "null"),
        c = this.state.career;
      if (
        !m ||
        m.v !== 1 ||
        m.name !== c.name ||
        m.day !== c.day ||
        m.games !== c.games ||
        !["ready", "between", "result"].includes(m.phase) ||
        typeof m.fields !== "object"
      ) {
        this.clearMatchSave();
        return false;
      }
      const prev = this.state,
        st = initial(c, "match", m.fields.maxInnings === 9 ? 9 : 3);
      for (const k of [
        "sound",
        "difficulty",
        "autoField",
        "autoCamera",
        "nameTags",
        "rainOn",
      ] as const)
        (st as Record<string, unknown>)[k] = prev[k];
      for (const k of MATCH_FIELDS)
        if (m.fields[k] !== undefined) (st as Record<string, unknown>)[k] = m.fields[k];
      st.phase = m.phase;
      st.timer = 1.5;
      st.message = "경기를 이어서 합니다";
      st.detail = `${st.inning}회${st.half === "top" ? "초" : "말"} · ${st.score[1]} : ${st.score[0]}`;
      if (m.phase === "result" && typeof m.extra?.message === "string") {
        st.message = m.extra.message;
        st.detail = String(m.extra.detail ?? "");
        st.resultTone = String(m.extra.resultTone ?? "neutral");
      }
      this.state = st;
      this.recorded = false;
      this.matchStrikeouts = Number(m.extra?.matchStrikeouts) || 0;
      this.matchHits = Number(m.extra?.matchHits) || 0;
      this.matchRuns = Number(m.extra?.matchRuns) || 0;
      this.xpParts = new Map(Array.isArray(m.extra?.xpParts) ? m.extra.xpParts : []);
      this.fullCountKey = typeof m.extra?.fullCountKey === "string" ? m.extra.fullCountKey : "";
      this.matchSaved = "";
      if ((m.underway === "pitch" || m.underway === "play") && st.phase === "ready")
        this.refreshPenalty(m.underway);
      this.emit();
      return true;
    } catch {
      return false;
    }
  }
  /**
   * The page was refreshed with a pitch on its way or a ball in play: that pitch counts
   * against the player. Pitching: a ball (in play: the batter reaches, like a walk).
   * Batting: a strike (in play: the batter is out, runners hold).
   */
  private refreshPenalty(kind: "pitch" | "play") {
    const s = this.state,
      note = "새로고침 · 던지던 공은 내 손해로 처리";
    if (kind === "pitch") {
      if (this.batting) this.strike(false, note);
      else this.ball();
    } else if (this.batting) {
      s.outs++;
      this.advanceBatter();
      this.result("OUT", note, "red");
    } else {
      this.walk();
      this.result("SAFE", note, "red");
    }
    s.detail = note;
  }
  setDifficulty(d: Difficulty) {
    if (!isDifficulty(d)) return;
    this.state.difficulty = d;
    // Switching in the middle of a match counts for this career's hall-of-fame board.
    if (this.matchActive) this.markDifficulty();
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(DIFF_KEY, d);
    } catch {
      /* private mode: lasts for this visit */
    }
    this.emit();
  }
  set<K extends keyof GameState>(key: K, value: GameState[K]) {
    this.state[key] = value;
    // Sounds on/off is remembered in this browser.
    if (key === "sound")
      try {
        if (typeof localStorage !== "undefined")
          localStorage.setItem(SOUND_KEY, value ? "on" : "off");
      } catch {
        /* private mode */
      }
    this.emit();
  }
  setAim(x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.state.aim = V(clamp(x, -0.95, 0.95), clamp(y, 0.12, 1.98), 0);
  }
  selectPitch(id: PitchId) {
    if (
      ALL_PITCHES.some((p) => p.id === id) &&
      this.state.career.pitches.includes(id) &&
      this.state.phase === "ready"
    ) {
      this.state.selected = id;
      this.emit();
    }
  }
  start(mode: Mode, maxInnings = this.state.maxInnings) {
    const previous = this.state;
    this.clearMatchSave();
    this.state = initial(previous.career, mode, maxInnings === 9 ? 9 : 3);
    this.state.sound = previous.sound;
    this.state.difficulty = previous.difficulty;
    this.state.autoField = previous.autoField;
    this.state.autoCamera = previous.autoCamera;
    this.state.nameTags = previous.nameTags;
    // Rain setting carries over; with rain off every match is clear.
    this.state.rainOn = previous.rainOn;
    if (!previous.rainOn) this.state.weather = "clear";
    this.state.hiddenUnlock = previous.hiddenUnlock;
    this.recorded = false;
    this.matchStrikeouts = 0;
    this.xpParts.clear();
    this.matchHits = 0;
    this.matchRuns = 0;
    this.keys.clear();
    const team = teamOf(this.state.career.team),
      [away, home] = this.teams;
    if (mode === "match") this.state.log = [`${home} vs ${away} · 경기 준비`];
    if (mode === "match" && this.state.career.stage === "pro") {
      const club = teamOf(this.state.career.club)!;
      this.state.detail = `프로 무대 · ${club.city} ${club.name} 소속으로 ${away}와 맞붙습니다`;
    } else if (mode === "match" && team) {
      this.state.detail = `${team.city} ${team.name} ${team.scout} 스카우트가 관중석에서 지켜봅니다`;
      this.state.log = [`${team.name} 스카우트 관전 · ${home} vs ${away}`];
    }
    this.emit();
  }
  /** Adds in-match XP for season matches only, tallied by reason for the end-of-match recap. */
  private earn(xp: number, reason: string) {
    const s = this.state;
    if (s.mode !== "match" || s.phase === "finished") return;
    s.matchXp += xp;
    const part = this.xpParts.get(reason) ?? { count: 0, xp: 0 };
    part.count++;
    part.xp += xp;
    this.xpParts.set(reason, part);
  }
  /** In-match XP by reason (reset each match). */
  private xpParts = new Map<string, { count: number; xp: number }>();
  throwAt(x = this.state.aim.x, y = this.state.aim.y) {
    const s = this.state;
    if (
      s.phase !== "ready" ||
      s.paused ||
      this.batting ||
      this.autoHalf ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      return false;
    this.setAim(x, y);
    // Pine tar: every pitch the umpire may notice something odd and check the ball.
    if (s.pineTar && s.mode === "match" && this.rng() < RULES.pineTarCatch) {
      this.ejectForPineTar();
      return true;
    }
    this.launch(false);
    return true;
  }
  /**
   * ai: the rival's pitcher (we bat). auto: our own pitcher on his own (bat-only player); he
   * pitches like the rival's ace (same numbers, so neither side gets a better arm).
   */
  private launch(ai: boolean, auto = false) {
    const s = this.state,
      stats = this.playerStats,
      stage = this.stageRules,
      machine = ai || auto,
      plan = auto ? this.autoPitchPlan() : null,
      pitch = plan
        ? plan.pitch
        : machine
          ? PITCHES[
              Math.floor(
                this.rng() *
                  Math.min(PITCHES.length, stage.aiPitchKinds, this.awayRoster.ace.kinds + 2),
              )
            ]
          : pitchData(s.selected);
    const fatigue = ai
      ? Math.max(0, s.pitchCount[0] - 25) * 0.18
      : auto
        ? Math.max(0, s.pitchCount[1] - 25) * 0.18
        : 100 - s.energy;
    const formPenalty = machine ? 0 : (100 - s.career.form) * 0.02;
    const speed = clamp(
      (machine
        ? stage.aiVelocity +
          this.awayRoster.ace.velocity +
          (auto ? RULES.autoPitchVelocity : 0) -
          (this.cheerActive && ai ? 3 : 0)
        : fastballSpeed(stats.velocity)) +
        pitch.delta -
        fatigue * 0.065 -
        (100 - s.effort) * 0.09 -
        formPenalty -
        (this.raining ? RULES.rainVelocity : 0) +
        gaussian(this.rng) * 0.9,
      60,
      pitch.maxSpeed ?? 190,
    );
    // Our own AI pitcher works the zone more (the rival's spread made walks and hit batters).
    const aim = plan
      ? plan.aim
      : machine
        ? V(gaussian(this.rng) * 0.29, 0.95 + gaussian(this.rng) * 0.34, 0)
        : { ...s.aim };
    const sigma =
      (machine
        ? 0.04 *
          this.awayRoster.ace.control *
          (auto ? RULES.autoPitchControl : this.cheerActive ? 1.08 : 1)
        : controlSpread(stats.control, s.energy, s.effort, s.career.form)) *
      pitch.control *
      (this.raining ? RULES.rainControl : 1);
    const target = V(
        clamp(aim.x + gaussian(this.rng) * sigma, -1.05, 1.05),
        clamp(aim.y + gaussian(this.rng) * sigma, 0.09, 2.1),
        0,
      ),
      start = V(0.35, 1.85, 18.44);
    // Stamina check at release: a tired arm sometimes buries the pitch where the catcher
    // cannot hold it. It only matters (and is only rolled) with runners on base.
    const wild =
      s.mode === "match" &&
      s.bases.some(Boolean) &&
      this.rng() <
        wildPitchChance(machine ? 100 - fatigue : s.energy, pitch.wild) *
          (this.raining ? RULES.rainWildPitch : 1);
    if (wild) {
      target.y = 0.09 + this.rng() * 0.12;
      target.x = clamp(target.x * 1.6, -0.6, 0.6);
    }
    const arc = ballistic(start, target, speed / 3.6)!;
    // The batter reads a zone around the true crossing point. The true point is always inside.
    let hint: Flight["hint"] = null;
    if (ai) {
      const r = contactHintRadius(formOf(this.batter).contact) * stage.hintScale,
        angle = this.rng() * Math.PI * 2,
        off = r * 0.8 * Math.sqrt(this.rng());
      hint = { x: target.x + Math.cos(angle) * off, y: target.y + Math.sin(angle) * off, r };
    }
    s.flight = {
      start,
      target,
      aim,
      velocity: arc.velocity,
      duration: arc.duration,
      visualDuration: visualFlightTime(arc.duration, speed, s.difficulty),
      elapsed: 0,
      pitch: pitch.id,
      speed,
      movement: auto ? RULES.autoPitchMovement : machine ? 65 : stats.movement,
      swung: false,
      swingTime: 0,
      batAim: { ...s.aim },
      hint,
      wild,
      seed: this.rng() * Math.PI * 2,
      // An armed limit break is spent on this pitch (ours or the rival's, i.e. our swing).
      limit: s.limitArmed,
    };
    s.limitArmed = false;
    // STEAL_READY (ours) or the rival's own decision → the lead runner breaks with the
    // pitcher's first move: first to second, or second to third.
    s.stealTrack = null;
    const stealTo = this.stealTarget,
      go =
        s.mode === "match" &&
        stealTo > 0 &&
        s.outs < 3 &&
        (this.batting ? s.stealCall : this.aiWantsToSteal(stealTo));
    if (go) {
      const from = stealTo - 1,
        pace = this.runnerPace(formOf(this.runnerOn(from)).speed);
      s.stealTrack = {
        id: from,
        from,
        progress:
          from + (RULES.stealLead + (this.batting ? 0 : RULES.aiStealLead)) / BASE_PATH_LENGTH,
        target: stealTo,
        pace,
        fullPace: pace,
        delay: this.batting
          ? RULES.stealJump + this.rng() * RULES.stealJumpGamble
          : RULES.aiStealJump + this.rng() * 0.08,
        out: false,
        scoredAt: null,
        stealing: true,
      };
    }
    s.stealCall = false;
    s.phase = "windup";
    s.batFeedback = null;
    s.timer = 0.62;
    s.lastSpeed = Math.round(speed);
    s.lastPitch = pitch.name;
    s.ball = { ...start };
    s.live = null;
    s.message = ai ? "타이밍을 기다리세요" : plan ? "우리 투수 투구" : "목표 지점 고정";
    s.detail = ai
      ? "흐린 원 = 공이 올 범위 · 조준 후 클릭 / Space"
      : plan
        ? `포수 사인 · ${plan.note} · ${pitch.name} ${Math.round(speed)} km/h`
        : `${pitch.name} · ${Math.round(speed)} km/h`;
    s.resultTone = "neutral";
    // The rival's runner breaks: the pitcher sees him go.
    if (s.stealTrack && !this.batting) {
      s.message = "주자 도루!";
      s.detail = `${s.stealTrack.from}루 주자가 ${s.stealTrack.target}루로 뜁니다`;
    }
    this.sound("wind");
    this.emit();
  }
  swing() {
    const s = this.state,
      f = s.flight;
    if (!this.batting || this.autoHalf || s.paused || s.phase !== "flight" || !f || f.swung)
      return false;
    f.swung = true;
    f.swingTime = f.elapsed;
    f.batAim = { ...s.aim };
    this.sound("swing");
    s.message = "스윙!";
    this.emit();
    return true;
  }
  tick(dt: number) {
    const s = this.state;
    if (s.paused) return;
    dt = Math.min(0.05, Math.max(0, dt));
    this.emitClock += dt;
    if (s.phase === "ready" && this.batting) {
      s.timer -= dt;
      if (s.timer <= 0) this.launch(true);
    } else if (s.phase === "ready" && this.autoHalf) {
      // Bat-only player: our own pitcher (a teammate) pitches on his own, and throws over
      // to keep a fast runner close.
      s.timer -= dt;
      if (s.timer <= 0 && !this.autoPickoff()) this.launch(false, true);
    } else if (s.phase === "windup") {
      s.timer -= dt;
      this.runSteal(dt);
      if (s.timer <= 0) {
        s.phase = "flight";
        this.sound("pitch");
        s.pitchCount[this.batting ? 0 : 1]++;
        s.practice.pitches++;
        if (!this.batting && !this.autoHalf && s.mode === "match")
          s.energy = clamp(
            s.energy -
              pitchEnergyCost(s.effort, this.playerStats.stamina) *
                pitchData(s.flight?.pitch ?? "fastball").stamina *
                (this.raining ? RULES.rainStamina : 1),
            0,
            100,
          );
      }
    } else if (s.phase === "flight" && s.flight) {
      const f = s.flight,
        before = f.elapsed;
      f.elapsed += dt;
      const u = clamp(f.elapsed / f.visualDuration, 0, 1);
      // The pitch is shown slowed down; the stealing runner moves in real (unslowed) time.
      this.runSteal(
        (Math.min(f.elapsed, f.visualDuration) - Math.min(before, f.visualDuration)) *
          (f.duration / f.visualDuration),
      );
      s.ball = this.pitchPosition(u);
      if (u >= 1) this.resolvePitch();
    } else if (s.phase === "inplay" && s.live) {
      this.tickLivePlay(dt);
    } else if (s.phase === "result") {
      s.timer -= dt;
      // A replay on screen holds the next batter/inning (at most 12 s, in case it never ends).
      if (s.timer <= 0 && (!s.replayBusy || s.timer < -12)) this.next();
    }
    if (this.emitClock > 0.05) {
      this.emitClock = 0;
      this.emit();
    }
  }
  /**
   * Game speed for the screen (1 = normal): slow motion while a rundown tag is about to land
   * (and just after it). The rules run on whatever time they are given.
   */
  get timeScale() {
    const s = this.state,
      l = s.live,
      rd = l?.rundown;
    if (s.phase !== "inplay" || !l || !rd) return 1;
    if (rd.tagAt !== undefined) return l.elapsed < rd.tagAt + RULES.tagHold ? RULES.tagSlow : 1;
    const r = l.runners.find((x) => x.id === rd.runnerId);
    if (rd.end !== undefined || !r || r.out || l.state !== "보유") return 1;
    const p = runnerPose(r).position;
    return Math.hypot(p.x - l.fielderPos.x, p.z - l.fielderPos.z) < RULES.tagSlowRange
      ? RULES.tagSlow
      : 1;
  }
  /** Base-running pace (bases per second) for a runner with this speed rating. */
  runnerPace(speed: number) {
    return (runSpeed(speed) / BASE_PATH_LENGTH) * (this.raining ? RULES.rainRunPace : 1);
  }
  /** Our runner on first is taken to be the previous batter in the order. */
  get runnerOnFirst(): Player {
    return this.ourRunner(this.state.order[1] + 8);
  }
  /** The runner on `base` (1–3) of the batting team: an earlier batter in the order. */
  runnerOn(base: number): Player {
    const s = this.state,
      back = 9 - Math.max(1, Math.min(3, base));
    return this.batting
      ? this.ourRunner(s.order[1] + back)
      : this.cheered(this.awayRoster.lineup[(s.order[0] + back) % 9]);
  }
  /** Base a steal would go for: third if second is taken and third open, else second (0 = none). */
  get stealTarget() {
    const b = this.state.bases;
    return b[1] && !b[2] ? 3 : b[0] && !b[1] ? 2 : 0;
  }
  /**
   * The rival decides on a steal before each pitch: only when his runner should beat our
   * catcher's throw (his speed against the pitch, the catcher's release and arm), mostly
   * second base, and more often with a full count.
   */
  private aiWantsToSteal(target: number) {
    const s = this.state,
      speed = formOf(this.runnerOn(target - 1)).speed,
      pace = this.runnerPace(speed) * BASE_PATH_LENGTH,
      run =
        RULES.aiStealJump +
        (BASE_PATH_LENGTH - RULES.stealLead - RULES.aiStealLead - touchDistance("slide")) / pace,
      bag = BASES[target - 1],
      arm = this.fielderStats(1).arm,
      ball =
        0.62 +
        (s.flight?.duration ?? 0.45) +
        this.stageRules.catcherTransfer +
        RULES.catcherTransferGamble / 2 +
        Math.hypot(bag.x, bag.z + 1.25) / arm +
        RULES.tagSweep;
    if (run > ball + 0.05) return false;
    const chance =
      RULES.aiSteal *
      clamp((speed - 50) / 40, 0.2, 1.4) *
      (target === 3 ? RULES.aiStealThird : 1) *
      (s.strikes === 2 && s.balls === 3 ? 1.5 : 1) *
      // Thrown over to already: he keeps a shorter lead.
      RULES.pickoffStealDrop ** s.pickoffs;
    return this.rng() < chance;
  }
  /** Moves the E-steal runner during the delivery (dt in real game seconds). */
  private runSteal(dt: number) {
    const r = this.state.stealTrack;
    if (!r || dt <= 0) return;
    const usable = Math.max(0, dt - r.delay);
    r.delay = Math.max(0, r.delay - dt);
    r.progress = Math.min(r.target, r.progress + r.pace * usable);
  }
  pitchPosition(u: number): Vec {
    const f = this.state.flight;
    if (!f) return V(0.35, 1.85, 18.44);
    const t = f.duration * u,
      m = pitchMovement(f.pitch, f.movement),
      bend = Math.sin(Math.PI * u),
      wobble = flutterOffset(m.flutter, u, f.seed ?? 0);
    return V(
      f.start.x + f.velocity.x * t + m.x * bend + wobble.x,
      f.start.y + f.velocity.y * t - 4.905 * t * t + m.y * bend + wobble.y,
      f.start.z + f.velocity.z * t,
    );
  }
  private result(message: string, detail: string, tone = "neutral", hold = 1.8) {
    const s = this.state;
    s.phase = "result";
    s.message = message;
    s.detail = detail;
    s.resultTone = tone;
    s.timer = hold;
    s.lastResult = message;
    this.log(message + (detail ? ` · ${detail}` : ""));
    // The crowd (home crowd: cheers for us, groans for the rivals' good plays).
    const good = tone === "gold";
    if (message === "HOME RUN") this.sound(good ? "homer" : "groan");
    else if (/SINGLE|DOUBLE|TRIPLE|BASE ON BALLS|HIT BY PITCH|ERROR|STOLEN/.test(message))
      this.sound(good ? "cheer" : "groan");
    else if (/OUT|DOUBLE PLAY|STRIKEOUT|FIELDER/.test(message))
      this.sound(good ? "cheer" : "groan");
    else if (message !== "BALL" && message !== "STRIKE" && message !== "FOUL")
      this.sound(good ? "cheer" : "call");
    this.emit();
  }
  private resolvePitch() {
    const s = this.state,
      f = s.flight!,
      zone = insideZone(f.target);
    s.lastError = Math.hypot(f.target.x - f.aim.x, f.target.y - f.aim.y) * 100;
    s.history = [
      { x: f.target.x, y: f.target.y, kind: zone ? "strike" : "ball", pitch: f.pitch },
      ...s.history,
    ].slice(0, 8);
    if (zone) s.practice.strikes++;
    if (s.mode === "bullpen") {
      this.result(
        zone ? "STRIKE" : "BALL",
        `조준 오차 ${s.lastError.toFixed(1)} cm · ${s.lastSpeed} km/h`,
        zone ? "gold" : "neutral",
      );
      return;
    }
    const stage = this.stageRules,
      data = pitchData(f.pitch),
      // Hit by pitch: the ball's real path (control error, movement) touches the batter's
      // body hitbox, not a separate dice roll.
      hbp = this.pitchHit();
    // Pitch-only player: our batters bat on their own, like the rival's (the branch below).
    if (this.batting && !this.autoHalf) {
      if (f.swung) {
        const timing = f.swingTime / f.visualDuration - SWING_SWEET,
          spatial = Math.hypot(f.batAim.x - f.target.x, f.batAim.y - f.target.y),
          style = SWING_STYLES[s.swingStyle],
          window = swingWindow(s.difficulty, s.career.stage, s.swingStyle),
          reach = batReach(formOf(this.batter).contact, s.swingStyle),
          contact = Math.abs(timing) < window && spatial < reach,
          // Contact swing: a near miss is fouled off, so the batter survives the pitch.
          cut =
            !contact &&
            style.cut > 0 &&
            Math.abs(timing) < window * style.cut &&
            spatial < reach * style.cut;
        s.batFeedback = {
          timing: Math.abs(timing) <= SWING_GOOD ? "good" : timing < 0 ? "early" : "late",
          offsetMs: Math.round(timing * f.visualDuration * 1000),
          errorCm: Math.round(spatial * 100),
          contact,
          ball: { ...f.target },
          batAim: { ...f.batAim },
        };
        if (contact) {
          const q = clamp(
            1 -
              (Math.abs(timing) / window) * 0.65 -
              (spatial / reach) * 0.3 +
              formOf(this.batter).contact * 0.001,
            0,
            1,
          );
          if (q < style.foulBelow) this.foul();
          else this.contact(q, timing);
        } else if (cut) this.foul("배트 끝에 걸려 파울로 걷어냈습니다");
        else
          this.strike(
            true,
            Math.abs(timing) > 0.2
              ? timing < 0
                ? "스윙이 빨랐습니다"
                : "스윙이 늦었습니다"
              : "배트 중심에서 벗어났습니다",
          );
      } else {
        s.batFeedback = {
          timing: "take",
          offsetMs: null,
          errorCm: null,
          contact: false,
          ball: { ...f.target },
          batAim: null,
        };
        if (hbp) this.hitByPitch();
        else if (zone) this.strike(false, zoneCall(f.target));
        else this.ball();
      }
    } else {
      // A decisive pitch takes 20 off the AI batter's contact (never off the player's).
      const b0 = formOf(this.batter),
        b = isDecisive(data) ? { ...b0, contact: b0.contact - RULES.decisiveContactDrop } : b0,
        eye = b.eye + stage.batterEye,
        // The pitcher's movement rating sharpens each pitch's bite (1 = rating 65).
        bite = movementBite(f.movement),
        edge = Math.max(Math.abs(f.target.x) / 0.25, Math.abs(f.target.y - 0.95) / 0.4),
        chase = clamp(0.46 - eye * 0.004 + data.chase * bite, 0.06, 0.45);
      if (hbp) {
        this.hitByPitch();
        return;
      }
      const swing = this.rng() < (zone ? 0.69 : chase * Math.max(0.1, 1.6 - edge * 0.5));
      f.aiSwing = swing;
      if (swing) {
        const difficulty = byDifficulty(s.difficulty, {
            baby: -0.18,
            easy: -0.12,
            normal: 0,
            hard: 0.1,
            impossible: 0.14,
          }),
          prob = clamp(
            0.3 +
              b.contact * 0.005 -
              (f.speed - 120) * 0.0035 +
              (100 - s.energy) * 0.002 -
              data.whiff * bite -
              (bite - 1) * 0.08 +
              stage.batterContact +
              difficulty,
            0.2,
            0.9,
          );
        if (this.rng() < prob) {
          const q0 = clamp(
              0.15 +
                this.rng() ** this.balance.aiPower * 0.75 +
                b.power * 0.001 -
                Math.max(0, edge - 0.65) * 0.25 -
                data.soft * bite,
              0.05,
              1,
            ),
            // The very top of the rivals' contact is squeezed: about a third of their hits
            // were home runs (a real season: about one in eight). Those balls now die at the
            // track or off the wall instead.
            q1 =
              q0 > RULES.aiHrKnee ? RULES.aiHrKnee + (q0 - RULES.aiHrKnee) * RULES.aiHrSqueeze : q0,
            // Our own batters batting on their own (pitch-only player).
            q = this.batting ? clamp(q1 + RULES.autoBatBoost, 0.05, 1) : q1;
          if (this.rng() < 0.19 || q < 0.25) this.foul();
          else this.contact(q, (this.rng() - 0.5) * 0.2);
        } else this.strike(true, "변화와 구속으로 헛스윙 유도");
      } else if (zone) this.strike(false, zoneCall(f.target));
      else this.ball();
    }
  }
  private strike(swing: boolean, detail: string) {
    const s = this.state;
    this.sound("mitt");
    s.strikes++;
    s.lastOutcome = "Strike";
    if (s.strikes >= 3) {
      s.outs++;
      if (!this.batting && s.mode === "match") {
        this.matchStrikeouts++;
        this.earn(XP.strikeout, "탈삼진");
      }
      this.advanceBatter();
      this.settlePitch(
        "STRIKEOUT",
        swing ? "헛스윙 삼진" : "루킹 삼진",
        this.batting ? "red" : "gold",
      );
    } else
      this.settlePitch(swing ? "SWING & MISS" : "STRIKE", detail, this.batting ? "red" : "gold");
  }
  private foul(detail = "") {
    const s = this.state;
    s.lastOutcome = "Foul";
    // A foul is a dead ball: a stealing runner goes back to first.
    s.stealTrack = null;
    if (this.batting && s.swingStyle === "bunt" && s.strikes === 2) {
      s.outs++;
      this.advanceBatter();
      this.result("STRIKEOUT", "2스트라이크에서 번트 파울 · 삼진", "red");
      return;
    }
    if (s.strikes < 2) s.strikes++;
    this.result(
      "FOUL",
      detail ? `${detail} · 카운트 ${s.balls}-${s.strikes}` : "파울 · 2스트라이크 이후 카운트 유지",
    );
  }
  private ball() {
    const s = this.state;
    this.sound("mitt");
    s.balls++;
    s.lastOutcome = "Ball";
    if (s.balls >= 4) {
      // Ball four forces the runner from first anyway, so a steal attempt is moot.
      s.stealTrack = null;
      this.walk();
      if (this.batting) this.earn(XP.walk, "볼넷·사구");
      this.result("BASE ON BALLS", "볼넷 · 타자 1루 진루", this.batting ? "gold" : "red");
    } else
      this.settlePitch(
        "BALL",
        s.flight ? zoneCall(s.flight.target) : "스트라이크 존 바깥",
        this.batting ? "gold" : "neutral",
      );
  }
  /** Hit by pitch: the batter takes first and forced runners move up one base. */
  /** Where the current pitch first touches the batter's body hitbox (or null). */
  pitchHit() {
    const f = this.state.flight;
    if (!f) return null;
    // From a metre in front of the plate to just behind it (the batter stands beside it).
    // (Anchored on the plate-crossing point the rules use for this pitch.)
    const end = this.pitchPosition(1),
      dx = f.target.x - end.x,
      dy = f.target.y - end.y,
      path = Array.from({ length: 60 }, (_, i) => {
        const q = this.pitchPosition(0.94 + i * 0.0015);
        return V(q.x + dx, q.y + dy, q.z);
      });
    return ballHitsBody(path, this.batter.hand);
  }
  hitByPitch() {
    const s = this.state;
    s.lastOutcome = "HitByPitch";
    s.stealTrack = null;
    if (s.history[0]) s.history[0].kind = "ball";
    const hit = this.pitchHit();
    if (hit) {
      this.hbpId++;
      s.hbp = { ...hit.point, part: hit.part, id: this.hbpId };
      s.ball = { ...hit.point };
    }
    this.walk();
    if (this.batting) this.earn(XP.walk, "볼넷·사구");
    this.result(
      "HIT BY PITCH",
      `몸에 맞는 공${hit ? ` · ${hit.part}에 맞음` : ""} · 타자 1루, 밀려난 주자 진루`,
      this.batting ? "gold" : "red",
    );
  }
  private hbpId = 0;
  /**
   * After a ball/strike call: a wild pitch or a running steal turns into a live base play;
   * otherwise the call is announced as usual.
   */
  private settlePitch(message: string, detail: string, tone: string) {
    const s = this.state,
      f = s.flight;
    if (s.mode === "match" && s.outs < 3 && f?.wild && s.bases.some(Boolean)) {
      this.startWildPitch(`${message} · ${detail}`);
      return;
    }
    if (s.mode === "match" && s.outs < 3 && s.stealTrack) {
      this.startStealThrow(`${message} · ${detail}`);
      return;
    }
    s.stealTrack = null;
    this.result(message, detail, tone);
  }
  advanceBatter() {
    const s = this.state;
    s.balls = 0;
    s.strikes = 0;
    s.pickoffs = 0;
    s.order[this.batting ? 1 : 0]++;
  }
  addRuns(n: number) {
    const s = this.state;
    if (!n) return;
    const i = this.batting ? 1 : 0;
    s.score[i] += n;
    s.lines[i][s.inning - 1] = (s.lines[i][s.inning - 1] ?? 0) + n;
    if (i === 0 && s.mode === "match") this.matchRuns += n;
    if (i === 1) for (let k = 0; k < n; k++) this.earn(XP.run, "득점");
  }
  walk() {
    const s = this.state;
    if (s.bases[0]) {
      if (s.bases[1]) {
        if (s.bases[2]) this.addRuns(1);
        s.bases[2] = true;
      }
      s.bases[1] = true;
    }
    s.bases[0] = true;
    this.advanceBatter();
  }
  intentionalWalk() {
    const s = this.state;
    if (s.mode !== "match" || this.batting || s.phase !== "ready" || s.paused) return false;
    this.walk();
    this.result("INTENTIONAL WALK", "고의4구 · 강제 진루 적용");
    return true;
  }
  contact(quality: number, timing = 0) {
    const s = this.state;
    this.sound("hit");
    let q = quality;
    const player = this.batting && !this.autoHalf,
      bunt = player && s.swingStyle === "bunt";
    if (player) {
      const style = SWING_STYLES[s.swingStyle];
      q =
        clamp(q - (100 - s.career.form) * 0.001, 0, 1) *
          (style.spread[0] + this.rng() * style.spread[1]) +
        style.boost;
      q = clamp(
        q + this.balance.batBoost + (this.role === "batter" ? RULES.batterRoleBoost : 0),
        0,
        1.15,
      );
    }
    // A bunt is deadened in front of the plate: a slow roller toward one foul line (early
    // timing → third-base side). A clean bunt hugs the line and dies around RULES.buntSweet m,
    // past the catcher and short of the pitcher; a poor one drifts toward the middle and comes
    // off too short or too hard.
    if (bunt) q = 0.18;
    const side = timing < 0 ? 1 : timing > 0 ? -1 : this.rng() < 0.5 ? 1 : -1,
      miss = 1 - clamp(quality, 0, 1),
      angle = bunt
        ? side * clamp(0.62 - miss * 0.6 + (this.rng() - 0.5) * 0.2, 0.05, 0.72)
        : clamp(timing * 4 + (this.rng() - 0.5) * 1.05, -0.76, 0.76),
      range = bunt
        ? clamp(RULES.buntSweet + (this.rng() - 0.5) * 2 * miss * 5, RULES.buntMin, RULES.buntMax)
        : (8 + q * q * 115) * carryScale(formOf(this.batter).power);
    this.launchBall({ q, bunt, angle, range });
  }
  /**
   * A batted ball given directly (AI training ground: drawn from the ball settings in
   * lib/ai/config.ts). angle: radians from the middle (+ = third-base side), distance in m,
   * flightTime in s (ground balls: until the ball reaches `distance`).
   */
  battedBall(spec: {
    kind: "ground" | "line" | "fly" | "bunt";
    distance: number;
    angle: number;
    flightTime: number;
  }) {
    this.sound("hit");
    const range = Math.max(1, spec.distance),
      bunt = spec.kind === "bunt",
      q = bunt ? 0.18 : clamp(Math.sqrt(Math.max(0, range - 8) / 115), 0, 1.15);
    this.launchBall({
      q,
      bunt,
      angle: clamp(spec.angle, -0.76, 0.76),
      range,
      kind: spec.kind,
      flightTime: spec.flightTime,
    });
  }
  /** Starts the live play of a batted ball (contact() or battedBall()). */
  private launchBall(b: {
    q: number;
    bunt: boolean;
    angle: number;
    range: number;
    kind?: "ground" | "line" | "fly" | "bunt";
    flightTime?: number;
  }) {
    const s = this.state,
      { q, bunt, angle, range } = b,
      // A home run (past HOME_RUN_DISTANCE) always flies over the outfield wall: it lands at
      // least HR_CLEARANCE beyond it (never in front of the wall or through the padding).
      flyTo =
        range > HOME_RUN_DISTANCE && !bunt ? Math.max(range, WALL_DISTANCE + HR_CLEARANCE) : range,
      land = V(Math.sin(angle) * flyTo, 0.12, Math.cos(angle) * flyTo);
    let fielder = 2,
      best = Infinity;
    DEFENSE.forEach((p, i) => {
      // The catcher only fields bunts; everything else goes to the seven fielders in front.
      if (i === 1 && !bunt) return;
      const d = distance(p, land);
      if (d < best) {
        best = d;
        fielder = i;
      }
    });
    const hr = range > HOME_RUN_DISTANCE && !bunt,
      bases = hr ? 4 : range > 78 ? 3 : range > 46 ? 2 : 1,
      ground = b.kind ? b.kind === "ground" || bunt : q <= 0.42;
    const lineDrive = b.kind ? b.kind === "line" && !hr : !ground && !hr && this.rng() < 0.4;
    const flightTime = hr
        ? 4.5
        : b.flightTime !== undefined
          ? b.flightTime
          : bunt
            ? range / RULES.buntSpeed
            : ground
              ? clamp(range / 24, 0.55, 1.8)
              : lineDrive
                ? clamp(range / 32, 1.1, 2.7)
                : clamp(HANG_BASE + range / HANG_DIV, 1.8, 4.2),
      height = hr
        ? homerArc(Math.hypot(land.x, land.z))
        : lineDrive
          ? 3.5
          : b.kind === "fly"
            ? // Apex of a fly in the air that long (g·t²/8).
              clamp((9.81 * flightTime * flightTime) / 8, 6, 26)
            : q > 0.7
              ? 17
              : 9;
    // Find the descending, glove-height point of this exact flight.
    let lo = 0.5,
      hi = 1;
    for (let i = 0; i < 24; i++) {
      const u = (lo + hi) / 2;
      if (lerp(0.8, 0.12, u) + Math.sin(Math.PI * u) * height > 1.55) lo = u;
      else hi = u;
    }
    const catchU = (lo + hi) / 2,
      catchPoint = V(land.x * catchU, 1.55, land.z * catchU),
      defenders = DEFENSE.map((p) => ({ ...p }));
    const pace = this.runnerPace(formOf(this.batter).speed) * (hr ? 1.65 : 1),
      // With fewer than two outs, runners read a fly ball: they keep going, but at a
      // careful pace until it lands, so a catch can still send them back.
      reading = !hr && !ground && s.outs < 2,
      steal = s.stealTrack;
    const runners: RunnerTrack[] = [0, 1, 2, 3]
      .filter((i) => i === 0 || s.bases[i - 1])
      .map((i) => {
        const jump = i === 1 && steal ? steal : null,
          share = clamp(
            (range - RULES.flyReadNear) / (RULES.flyReadFar - RULES.flyReadNear),
            0.2,
            1,
          ),
          own = i > 0 && reading ? pace * RULES.flyReadPace * share : pace,
          // Third (and second, on a deep fly) waits on the bag to tag up if it is caught.
          tagReady = reading && !jump && (i === 3 || (i === 2 && range > 70));
        return {
          id: i,
          from: i,
          // Runners have their lead when the ball is hit (they used to start on the bag:
          // most grounders with a runner on first became double plays). One waiting to tag
          // up stays on the bag.
          progress: jump
            ? jump.progress
            : i > 0 && !tagReady
              ? i + (bunt ? RULES.runnerLead : RULES.hitLead) / BASE_PATH_LENGTH
              : i,
          // Batter and runners run while the ball is alive (a runner ready to tag up waits).
          target: tagReady ? i : Math.min(4, i + bases),
          pace: jump ? pace : tagReady ? pace : own,
          fullPace: pace,
          delay: i === 0 ? 0.12 : 0,
          out: false,
          scoredAt: null,
        };
      });
    s.stealTrack = null;
    s.lastOutcome = "InPlay";
    s.live = {
      kind: "batted",
      hold: bunt ? RULES.buntHold : 0.3,
      throwSpeed: this.stageRules.throwSpeed,
      call: "",
      start: V(0, 0.8, 0),
      land,
      duration: Math.max(5, 4 / pace + 1),
      elapsed: 0,
      fielder,
      fielderPos: defenders[fielder],
      state: "추적",
      throwBase: 0,
      manual: false,
      quality: q,
      bunt,
      reactionExtra: bunt ? RULES.buntReaction : 0,
      resultBases: bases,
      runnerStart: [...s.bases],
      ground,
      bounced: ground,
      flightTime,
      height,
      lineDrive,
      catchAt: flightTime * catchU,
      catchPoint,
      caughtFly: false,
      fieldedAt: null,
      defenders,
      runners,
      throw: null,
      requestedBase: null,
      throws: 0,
      outs: [],
      error: false,
      sacrifice: false,
    };
    if (!hr) {
      // The fielder whose range holds the ball and who gets there first takes it.
      const l = s.live,
        { best } = this.chaseChoice(l);
      if (best) {
        l.fielder = best.i;
        l.fielderPos = l.defenders[best.i];
      }
    }
    s.phase = "inplay";
    this.underway = "play";
    // In-play text only describes the ball; the verdict comes when the fielder acts.
    s.message = hr ? "담장을 향해!" : ground ? "땅볼 타구" : "뜬공 타구";
    s.detail = ground
      ? "땅볼 · 주자가 다음 베이스로 달립니다"
      : hr
        ? "홈런 타구"
        : s.outs === 2
          ? "2아웃 · 주자는 타구와 함께 출발"
          : "뜬공 · 주자는 달리면서 포구를 확인합니다";
    s.resultTone = "gold";
    this.emit();
  }
  selectThrowBase(base: number) {
    const s = this.state,
      l = s.live;
    if (
      s.phase !== "inplay" ||
      !l ||
      s.paused ||
      this.batting ||
      l.kind !== "batted" ||
      l.caughtFly ||
      l.state === "송구" ||
      base < 1 ||
      base > 4
    )
      return false;
    l.requestedBase = base;
    l.throwBase = base;
    l.manual = true;
    this.emit();
    return true;
  }
  private liveBall(l: LivePlay, time: number): Vec {
    const loose = l.loose;
    if (loose && time >= loose.at) {
      // After an error: the ball rolls away from where it got loose and slows down.
      const decel = 5,
        tau = Math.min(time - loose.at, loose.v0 / decel),
        roll = loose.v0 * tau - 0.5 * decel * tau * tau;
      let x = loose.from.x + loose.dx * roll,
        z = loose.from.z + loose.dz * roll;
      const far = Math.hypot(x, z);
      if (far > 104) {
        x *= 104 / far;
        z *= 104 / far;
      }
      return V(x, 0.12, Math.max(-16, z));
    }
    // A wild pitch skips to the backstop and stops there.
    if (l.kind === "wild" && time >= l.flightTime) return { ...l.land };
    if (time > l.flightTime && l.resultBases < 4) {
      // After landing the ball keeps rolling and slows down on the grass.
      const len = Math.hypot(l.land.x - l.start.x, l.land.z - l.start.z) || 1,
        dirX = (l.land.x - l.start.x) / len,
        dirZ = (l.land.z - l.start.z) / len,
        v0 = (len / l.flightTime) * (l.bunt ? 0.25 : l.ground ? 1.15 : 0.3),
        decel = l.ground ? 5 : 6,
        tau = Math.min(time - l.flightTime, v0 / decel),
        roll = v0 * tau - 0.5 * decel * tau * tau,
        maxRoll = Math.max(0, 104 - Math.hypot(l.land.x, l.land.z));
      const d = Math.min(roll, maxRoll);
      return V(l.land.x + dirX * d, 0.12, l.land.z + dirZ * d);
    }
    const u = clamp(time / l.flightTime, 0, 1);
    return V(
      lerp(l.start.x, l.land.x, u),
      l.ground
        ? 0.12 + (l.bunt ? 0.15 : 0.55) * Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u)
        : lerp(l.start.y, l.land.y, u) + Math.sin(u * Math.PI) * l.height,
      lerp(l.start.z, l.land.z, u),
    );
  }
  private interceptTime(l: LivePlay, from: Vec, who = l.fielder) {
    const { speed: fielderSpeed, reaction: fielderReaction } = this.fielderStats(who, l);
    for (let t = 0.05; t <= 12; t += 0.05) {
      const p = this.liveBall(l, t);
      if (Math.hypot(p.x - from.x, p.z - from.z) / fielderSpeed + fielderReaction <= t) return t;
    }
    return Infinity;
  }
  /** Earliest point on the ball's ground path the chasing fielder can reach in time. */
  private interceptPoint(l: LivePlay) {
    const { speed: fielderSpeed, reaction: fielderReaction } = this.fielderStats(l.fielder, l),
      wait = Math.max(0, fielderReaction - l.elapsed);
    for (let dt = 0.05; dt <= 12; dt += 0.05) {
      const t = l.elapsed + dt;
      if (t < Math.min(l.flightTime, l.elapsed + 0.05) && !l.ground) continue;
      const p = this.liveBall(l, t);
      if (Math.hypot(p.x - l.fielderPos.x, p.z - l.fielderPos.z) / fielderSpeed + wait <= dt)
        return p;
    }
    return this.liveBall(l, l.elapsed + 12);
  }
  /** Leap rule for a fly he reaches (see the fly catch). Our own fielders leap more. */
  private jumpCatch(l: LivePlay, gap: number) {
    if (this.homeFielding)
      return (
        (l.lineDrive && gap > RULES.homeJumpLine) ||
        (Math.hypot(l.land.x, l.land.z) > 45 && gap > RULES.homeJumpFly)
      );
    return (l.lineDrive && gap > 1.15) || (Math.hypot(l.land.x, l.land.z) > 80 && gap > 0.6);
  }
  /** The player's team is in the field (a match, the rival batting). */
  private get homeFielding() {
    return this.state.mode === "match" && !this.batting;
  }
  /** How far past reach a fielder still dives for a fly / a grounder (ours go farther). */
  private get flyDiveReach() {
    return this.homeFielding ? RULES.homeDiveReach : RULES.diveReach;
  }
  private get groundDiveReach() {
    return this.homeFielding ? RULES.homeGroundDiveReach : RULES.groundDiveReach;
  }
  /**
   * Fly ball, automatic fielding: `planLead` s before the catch, predict where his run puts
   * him (straight at the catch point, as the movement code does) and settle catch/leap/dive.
   */
  private planFly(l: LivePlay) {
    if (
      l.plan ||
      l.ground ||
      l.bounced ||
      l.kind !== "batted" ||
      l.elapsed + 1e-8 < l.catchAt - RULES.planLead ||
      l.elapsed >= l.catchAt
    )
      return;
    const { speed, reaction } = this.fielderStats(l.fielder, l),
      move = Math.max(0, l.catchAt - Math.max(l.elapsed, reaction, this.downTime(l))),
      dx = l.catchPoint.x - l.fielderPos.x,
      dz = l.catchPoint.z - l.fielderPos.z,
      d = Math.hypot(dx, dz),
      step = Math.min(d, speed * move),
      foot = V(
        l.fielderPos.x + (d ? (dx / d) * step : 0),
        0,
        l.fielderPos.z + (d ? (dz / d) * step : 0),
      ),
      gap = d - step;
    if (gap <= CATCH_REACH)
      l.plan = { style: this.jumpCatch(l, gap) ? "jump" : "catch", at: l.catchAt, gap, foot };
    else if (gap <= this.flyDiveReach && !l.bunt && l.fielder !== 1) {
      const success = this.rng() < this.diveChance(l.fielder, gap, RULES.diveReach, CATCH_REACH),
        k = success ? 0.85 : 0.6;
      l.plan = {
        style: "dive",
        at: l.catchAt,
        gap,
        foot,
        success,
        end: V(lerp(foot.x, l.catchPoint.x, k), 0, lerp(foot.z, l.catchPoint.z, k)),
        launchAt: Math.max(l.elapsed, l.catchAt - RULES.diveLead),
      };
    } else l.plan = { style: "none", at: l.catchAt, gap, foot };
    if (l.plan.style !== "none") l.catchMoment = l.catchAt;
  }
  /**
   * Grounder, automatic fielding: look a third of a second ahead; if the ball will pass him
   * just out of reach (closest approach between GROUND_REACH and groundDiveReach), plan the
   * diving stop for that moment (outcome rolled now, as the instant check used to).
   */
  private planGroundDive(l: LivePlay) {
    const { speed } = this.fielderStats(l.fielder, l),
      p0 = l.fielderPos,
      tgt = this.interceptPoint(l),
      d0 = Math.hypot(tgt.x - p0.x, tgt.z - p0.z);
    let prev = Infinity,
      prevT = 0,
      prevPos = p0,
      prevBall = this.liveBall(l, l.elapsed);
    for (let k = 0; k <= 12; k++) {
      const t = k * 0.03,
        b = this.liveBall(l, l.elapsed + t),
        step = Math.min(d0, speed * t),
        fp = V(
          p0.x + (d0 ? ((tgt.x - p0.x) / d0) * step : 0),
          0,
          p0.z + (d0 ? ((tgt.z - p0.z) / d0) * step : 0),
        ),
        g = Math.hypot(b.x - fp.x, b.z - fp.z);
      if (g < GROUND_REACH) return; // he gets it on foot
      if (k > 0 && g >= prev) {
        if (prev <= this.groundDiveReach && prevBall.y < 1.1) {
          const at = l.elapsed + prevT,
            success =
              this.rng() < this.diveChance(l.fielder, prev, RULES.groundDiveReach, GROUND_REACH),
            kk = success ? 0.85 : 0.5;
          l.plan = {
            style: "dive",
            at,
            gap: prev,
            foot: prevPos,
            ball: prevBall,
            success,
            end: V(lerp(prevPos.x, prevBall.x, kk), 0, lerp(prevPos.z, prevBall.z, kk)),
            launchAt: Math.max(l.elapsed, at - RULES.diveLead),
          };
        }
        return;
      }
      prev = g;
      prevT = t;
      prevPos = fp;
      prevBall = b;
    }
  }
  /** Seconds the chasing fielder is still down after his own missed dive. */
  private downTime(l: LivePlay) {
    return Math.max(
      l.diver === l.fielder ? (l.downUntil ?? 0) : 0,
      l.recover?.who === l.fielder ? l.recover.until : 0,
    );
  }
  /** Earliest play time fielder `who`, from where he stands now, can reach the loose ball. */
  private interceptFrom(l: LivePlay, who: number) {
    const { speed, reaction } = this.fielderStats(who, l),
      from = l.defenders[who],
      wait = Math.max(
        0,
        reaction - l.elapsed,
        (who === l.diver ? (l.downUntil ?? 0) : 0) - l.elapsed,
        (who === l.recover?.who ? l.recover.until : 0) - l.elapsed,
      );
    for (let dt = 0.05; dt <= 12; dt += 0.05) {
      const p = this.liveBall(l, l.elapsed + dt);
      if (Math.hypot(p.x - from.x, p.z - from.z) / speed + wait <= dt) return l.elapsed + dt;
    }
    return Infinity;
  }
  /** Flight time of a throw (s): long throws arc and bounce, so they lose speed. */
  private throwSeconds(from: Vec, to: Vec, arm: number) {
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    return Math.max(0.22, (d / arm) * (1 + RULES.longThrowSlow * Math.max(0, d - RULES.longThrow)));
  }
  /** The infielder who cuts off a long throw from `from` to `base`. */
  private cutoffFor(from: Vec, base: number) {
    // Right side (world −X): the second baseman, unless he has to take the throw at second.
    return from.x < -8 && base !== 2 ? 3 : 4;
  }
  /**
   * Best way to get the ball from fielder `who` at `from` to `base`: straight, or through the
   * cutoff man when that is quicker. `time` = release to arrival (s).
   */
  private throwRoute(l: LivePlay, from: Vec, base: number, who: number) {
    const bag = BASES[base - 1],
      arm = this.fielderStats(who, l).arm,
      direct = this.throwSeconds(from, bag, arm);
    if (
      l.kind !== "batted" ||
      who < 6 ||
      Math.hypot(bag.x - from.x, bag.z - from.z) <= RULES.longThrow
    )
      return { time: direct };
    const cut = this.cutoffFor(from, base),
      spot = V(lerp(bag.x, from.x, RULES.relayShare), 0, lerp(bag.z, from.z, RULES.relayShare)),
      cutPos = l.defenders[cut],
      // He runs there while the first throw is in the air.
      cutReady = Math.hypot(spot.x - cutPos.x, spot.z - cutPos.z) / 8.2,
      relay =
        Math.max(this.throwSeconds(from, spot, arm), cutReady) +
        RULES.relayHold +
        this.throwSeconds(spot, bag, this.fielderStats(cut, l).arm);
    return relay < direct ? { time: relay, relay: { who: cut, spot, base } } : { time: direct };
  }
  /** Chance a throw arriving `travel` s from now beats a runner arriving in `arrival` s. */
  private outChance(travel: number, arrival: number) {
    return 1 / (1 + Math.exp(-(arrival - travel - 0.08) / RULES.outSpread));
  }
  /**
   * Who should chase this ball: every fielder works out where and when he would field it;
   * among those whose range (FIELD_ZONES) holds that spot, the quickest takes it (fly balls:
   * an outfielder who can make the catch calls the infielders off).
   */
  /**
   * A moment after contact the runners read the fly: when nobody will get there in time it is
   * dropping, and they stop holding back (full speed; a runner waiting to tag up goes too).
   */
  private readFly(l: LivePlay) {
    if (l.readDone || l.ground || l.bounced || l.caughtFly || l.kind !== "batted") return;
    // A line drive is read almost at once; a fly takes a moment to judge.
    if (l.elapsed + 1e-8 < (l.lineDrive ? RULES.lineReadDecide : RULES.flyReadDecide)) return;
    l.readDone = true;
    if (this.state.outs >= 2) return; // with two outs they were running all along
    // Soonest any fielder gets to the catch point (the catcher only on a bunt).
    let soonest = Infinity;
    for (let i = 0; i < 9; i++) {
      if (i === 1 && !l.bunt) continue;
      const { speed, reaction } = this.fielderStats(i, l),
        from = l.defenders[i];
      soonest = Math.min(
        soonest,
        Math.max(l.elapsed, reaction) +
          Math.hypot(l.catchPoint.x - from.x, l.catchPoint.z - from.z) / speed,
      );
    }
    if (soonest < l.catchAt + RULES.flyReadMargin) return;
    for (const r of l.runners) {
      if (r.id === 0 || r.out) continue;
      r.pace = r.fullPace ?? r.pace;
      if (r.target <= r.from) r.target = Math.min(4, r.from + Math.max(1, l.resultBases));
    }
  }
  private chaseChoice(l: LivePlay) {
    const fly = !l.ground && !l.bounced,
      out: { i: number; score: number; inZone: boolean }[] = [];
    for (let i = 0; i < 9; i++) {
      if (i === 1 && !l.bunt) continue;
      const { speed, reaction } = this.fielderStats(i, l),
        from = l.defenders[i],
        down = i === l.diver ? (l.downUntil ?? 0) : 0;
      let t: number, at: Vec;
      if (fly) {
        at = l.catchPoint;
        t = Math.max(l.elapsed, reaction, down) + Math.hypot(at.x - from.x, at.z - from.z) / speed;
      } else {
        t = this.interceptFrom(l, i);
        at = this.liveBall(l, Math.min(t, l.elapsed + 12));
      }
      const home = DEFENSE[i],
        inZone = Math.hypot(at.x - home.x, at.z - home.z) <= FIELD_ZONES[i];
      // Outside his range he still goes for a ball he clearly gets to first.
      let score = t + (inZone ? 0 : RULES.zonePenalty);
      if (fly && i >= 6 && t <= l.catchAt + 0.05)
        score -= RULES.outfieldPriority + (i === 7 ? 0.1 : 0);
      out.push({ i, score, inZone });
    }
    return { best: [...out].sort((a, b) => a.score - b.score)[0], all: out };
  }
  /** Hand the chase over when the ball leaves his range or a teammate clearly gets there first. */
  private assignChaser(l: LivePlay) {
    // A bunt is charged at once by whoever was picked (no second thoughts), and an
    // outfielder who took over a grounder keeps it.
    if (l.kind !== "batted" || l.bunt || l.backedUp || l.fieldedAt !== null || l.resultBases === 4)
      return;
    const auto = this.state.autoField || this.batting,
      fly = !l.ground && !l.bounced,
      diverDown = l.diver === l.fielder && l.elapsed < (l.downUntil ?? 0);
    // Committed: about to catch, mid-dive, or (manual fielding) the player steers the chaser.
    // A new chaser also keeps it for a moment, and a play changes hands at most twice.
    if (!diverDown) {
      if ((l.handoffs ?? 0) >= 2 || l.elapsed < (l.handoffAt ?? -9) + 0.6) return;
      if (l.plan && l.plan.style !== "none") return;
      if (fly && (!auto || l.elapsed > l.catchAt - RULES.planLead)) return;
    }
    // (Re-read every 50 ms of play: nine fielders' intercepts are not cheap.)
    if (!diverDown && l.elapsed < (l.chaseAt ?? 0)) return;
    l.chaseAt = l.elapsed + 0.05;
    const { best, all } = this.chaseChoice(l),
      cur = all.find((o) => o.i === l.fielder);
    if (!best || best.i === l.fielder) return;
    // Manual fielding: the player steers his fielder; only a grounder that already got past
    // the infield (or a fielder down after a missed dive) goes to an outfielder.
    const ball = this.state.ball,
      past = Math.hypot(ball.x, ball.z) > Math.hypot(l.fielderPos.x, l.fielderPos.z) + 1.5,
      // Grounders change hands only when they get through (the infielders stay on their
      // covering jobs); fly balls can be called off while the ball is still in the air.
      // (to whoever is next in line: a middle infielder behind the pitcher, or an outfielder)
      through = diverDown || ((l.ground || l.bounced) && past && l.fielder < 6),
      switchIt =
        auto && fly
          ? !cur || best.score + RULES.backupMargin < cur.score
          : through && best.score + RULES.backupMargin < (cur?.score ?? Infinity);
    if (!switchIt) return;
    const old = l.fielder;
    l.fielder = best.i;
    l.fielderPos = l.defenders[best.i];
    l.handoffs = (l.handoffs ?? 0) + 1;
    l.handoffAt = l.elapsed;
    // A grounder through the infield: the runners read the new play.
    if (l.ground && !l.bunt && old < 6 && best.i >= 6 && !l.backedUp) {
      l.backedUp = true;
      this.state.detail = "공이 내야를 빠져나갔습니다 · 외야수가 처리";
      this.rereadRunners(l, this.interceptFrom(l, best.i) + l.hold);
    }
  }
  /** Runners re-read the play (lead runner first; nobody passes the runner ahead). */
  private rereadRunners(l: LivePlay, pickup: number) {
    let ahead = 5;
    for (const r of [...l.runners].filter((x) => !x.out).sort((a, b) => b.progress - a.progress)) {
      if (r.progress <= r.target + 1e-9)
        while (r.target < 4 && (r.target + 1 < ahead || r.target + 1 === 4)) {
          const next = r.target + 1,
            pace = r.fullPace ?? r.pace,
            runAt = l.elapsed + Math.max(0, r.delay - l.elapsed) + (next - r.progress) / pace;
          if (runAt + RULES.advanceMargin >= this.throwArrival(l, next, pickup)) break;
          r.target = next;
          r.pace = pace;
        }
      ahead = r.target === 4 ? 5 : r.target;
    }
  }
  private moveFielder(p: Vec, target: Vec, dt: number, speed = 8.2) {
    const d = Math.hypot(target.x - p.x, target.z - p.z),
      k = d ? Math.min(1, (dt * speed) / d) : 0;
    p.x = lerp(p.x, target.x, k);
    p.z = lerp(p.z, target.z, k);
  }
  private receiver(base: number, fielder: number) {
    const normal = [2, 3, 5, 1][base - 1];
    // When the catcher chases a ball (wild pitch), the pitcher covers home.
    return normal === fielder ? (base === 1 || base === 4 ? 0 : 4) : normal;
  }
  private forcedRunner(l: LivePlay, base: number) {
    // Forces exist only while the batter is running to first (never after a caught fly,
    // and never on a steal, pickoff or wild pitch).
    if (l.kind !== "batted" || l.caughtFly) return null;
    const r = l.runners.find((r) => r.from === base - 1 && !r.out);
    if (!r || r.progress >= base - 1e-8) return null;
    // Retiring any trailing forced runner removes the force on runners ahead.
    return Array.from({ length: base }, (_, i) =>
      l.runners.some((r) => r.from === i && !r.out),
    ).every(Boolean)
      ? r
      : null;
  }
  private candidateRunner(l: LivePlay, base: number) {
    return (
      this.forcedRunner(l, base) ??
      l.runners.find(
        (r) => !r.out && r.progress > base - 1 && r.progress < base - 1e-8 && r.target >= base,
      ) ??
      this.returningRunner(l, base)
    );
  }
  /** A runner heading back to `base` (caught fly or pickoff) who has not touched it yet. */
  private returningRunner(l: LivePlay, base: number) {
    return (
      l.runners.find(
        (r) =>
          !r.out &&
          base < 4 &&
          r.target === base &&
          r.progress > base + 1e-8 &&
          // A batter coming back after overrunning first cannot be tagged out.
          !(r.from === 0 && base === 1 && !l.caughtFly),
      ) ?? null
    );
  }
  /** Chance a diving attempt by fielder i succeeds when the ball is `gap` m away. */
  diveChance(i: number, gap: number, reach: number, near: number) {
    const p = this.fielders[i] ? formOf(this.fielders[i]) : { speed: 65, eye: 65 },
      skill = (p.speed + p.eye) / 2;
    return clamp(
      RULES.diveBase +
        (skill - 65) * RULES.diveSkill -
        ((gap - near) / Math.max(0.1, reach - near)) * RULES.diveDistance -
        (this.raining ? RULES.diveRain : 0),
      RULES.diveMin,
      RULES.diveMax,
    );
  }
  /** Chance fielder i makes an error on a play whose base chance is `base` (skill, rain). */
  errorChance(i: number, base: number) {
    const p = this.fielders[i] ? formOf(this.fielders[i]) : { speed: 65, eye: 65 },
      skill = (p.speed + p.eye) / 2;
    return (
      base *
      clamp(1 + (70 - skill) * RULES.errSkill, 0.35, 2.2) *
      (this.raining ? RULES.errRain : 1)
    );
  }
  /**
   * An error: the ball gets loose at `from` and rolls along (dx, dz) at v0 m/s. Whoever gets
   * to it first chases it (the fumbler needs a moment); the runners see it and read the play.
   */
  private looseBall(
    l: LivePlay,
    from: Vec,
    dx: number,
    dz: number,
    v0: number,
    kind: "field" | "drop" | "throw",
    fumbler: number | null,
  ) {
    let n = Math.hypot(dx, dz);
    if (n < 1e-3) {
      const a = this.rng() * Math.PI * 2;
      dx = Math.sin(a);
      dz = Math.cos(a);
      n = 1;
    }
    l.loose = { from: V(from.x, 0.12, from.z), dx: dx / n, dz: dz / n, v0, at: l.elapsed };
    l.miscues = (l.miscues ?? 0) + 1;
    l.errorKind ??= kind;
    l.recover =
      fumbler === null ? undefined : { who: fumbler, until: l.elapsed + RULES.fumbleTime };
    l.ground = true;
    l.bounced = true;
    l.fieldedAt = null;
    l.throw = null;
    l.relay = undefined;
    l.plan = undefined;
    l.requestedBase = null;
    l.state = "추적";
    // The quickest fielder to the loose ball takes it (no more handing over on this ball).
    let best = l.fielder,
      bestT = Infinity;
    for (let i = 0; i < 9; i++) {
      const t = this.interceptFrom(l, i);
      if (t < bestT) {
        bestT = t;
        best = i;
      }
    }
    l.fielder = best;
    l.fielderPos = l.defenders[best];
    l.handoffs = 2;
    l.backedUp = true;
    for (const r of l.runners) {
      r.thinkAt = l.elapsed;
      r.pace = r.fullPace ?? r.pace;
    }
    // A fumbled infield grounder or a dropped fly would have been an out: no hit.
    if (kind === "drop" || (kind === "field" && (fumbler ?? 9) < 6)) l.error = true;
    const s = this.state;
    s.message = "ERROR";
    s.detail =
      kind === "throw"
        ? "송구 실책! 공이 뒤로 빠졌습니다"
        : kind === "drop"
          ? "포구 실책! 뜬공을 떨어뜨렸습니다"
          : "포구 실책! 공을 놓쳤습니다";
    this.log(kind === "throw" ? "송구 실책" : "포구 실책");
    this.sound("call");
  }
  /** A fielding highlight: replayed in slow motion in the 3D view's small TV window. */
  private highlight(l: LivePlay, text: string, at: number) {
    this.replayId++;
    this.state.replay = { text, fielder: l.fielder, at, id: this.replayId };
    this.log(text + "!");
  }
  private replayId = 0;
  /**
   * Bang-bang play at a base (throw and runner within RULES.closePlay seconds): replayed in
   * slow motion with the call. Runs right after the force/tag decision at the catch.
   */
  private closePlay(l: LivePlay, t: FieldThrow) {
    const r = l.runners.find((x) => x.id === t.runnerId);
    if (!r || !t.receivedAt) return;
    let margin: number,
      out = r.out;
    if (r.touched?.base === t.base) margin = t.receivedAt - r.touched.at;
    else if (r.progress < t.base - 1e-8 && r.target >= t.base) {
      // Still on his way: forced out.
      margin = (this.touchLine(r, t.base) - r.progress) / r.pace;
      out = true;
    } else return;
    if (margin > RULES.closePlay) return;
    this.replayId++;
    this.state.replay = {
      text: out ? "아웃" : "세이프",
      fielder: t.receiver,
      at: t.receivedAt,
      id: this.replayId,
      base: { runner: r.id, base: t.base, out },
    };
  }
  /** Throw speed of the fielder holding the ball (the pitcher's pickoff throw is fixed). */
  private armOf(l: LivePlay) {
    return l.kind === "pickoff" ? l.throwSpeed : this.fielderStats(l.fielder, l).arm;
  }
  /** Throw flight time; it never lands before the covering fielder reaches the bag. */
  private throwTime(l: LivePlay, base: number) {
    const bag = BASES[base - 1],
      cover = l.defenders[this.receiver(base, l.fielder)],
      eta = Math.max(0, Math.hypot(cover.x - bag.x, cover.z - bag.z) - 0.9) / 8.2,
      flight =
        l.kind === "pickoff"
          ? Math.max(0.22, distance(l.fielderPos, bag) / this.armOf(l))
          : this.throwRoute(l, l.fielderPos, base, l.fielder).time;
    return Math.max(flight, eta + 0.02);
  }
  /**
   * Picks the base to throw to. forceOnly: only a force out (relay). sureOnly: only a throw
   * that beats its runner (after a caught fly, nobody throws just to hold runners).
   */
  private chooseThrow(l: LivePlay, forceOnly = false, sureOnly = false) {
    const fielderAI = this.fielderAI;
    if (fielderAI && l.kind === "batted" && !sureOnly) {
      const opts = [{ base: 0, f: this.holdOption() }];
      for (let base = 1; base <= 4; base++) {
        const forced = this.forcedRunner(l, base),
          r = forced ?? (!forceOnly ? this.candidateRunner(l, base) : null);
        if (r) opts.push({ base, f: this.throwOption(l, base, r, !!forced, 0) });
      }
      if (opts.length === 1) return 0;
      const ctx = this.playContext(l),
        rows = opts.map((o) => o.f),
        pick = fielderAI(ctx, rows);
      this.throwObserver?.(ctx, rows, pick);
      return opts[pick]?.base ?? 0;
    }
    // Every base with a runner to get: how likely the throw beats him there, weighted by
    // how much that out is worth (a force, and the lead runner, count more).
    const options: { base: number; priority: number }[] = [];
    for (let base = 1; base <= 4; base++) {
      const forced = this.forcedRunner(l, base),
        r = forced ?? (!forceOnly ? this.candidateRunner(l, base) : null);
      if (!r) continue;
      // A tag needs the glove to come down after the catch; a force only the foot on the bag.
      const travel = this.throwTime(l, base) + (forced ? 0 : RULES.tagSweep),
        arrival = this.arriveTime(l, r, base);
      if (travel + 0.08 < arrival)
        options.push({
          base,
          priority: this.outChance(travel, arrival) * (forced ? 1.3 : 1) * (1 + 0.1 * base),
        });
    }
    const best = options.sort((a, b) => b.priority - a.priority)[0]?.base;
    if (this.throwObserver && l.kind === "batted" && !sureOnly)
      this.observeThrow(l, forceOnly, best);
    if (best || forceOnly || sureOnly) return best ?? 0;
    // No sure out: still throw ahead of the lead runner who is still running.
    const running = l.runners
      .filter((r) => !r.out && r.progress < r.target - 1e-6)
      .sort((a, b) => b.progress - a.progress)[0];
    return running ? Math.min(4, Math.floor(running.progress + 1e-9) + 1) : 0;
  }
  /** Metrics: the hand-written AI's throw choice, in the learned AI's terms. */
  private observeThrow(l: LivePlay, forceOnly: boolean, best: number | undefined) {
    const opts = [{ base: 0, f: this.holdOption() }];
    for (let base = 1; base <= 4; base++) {
      const forced = this.forcedRunner(l, base),
        r = forced ?? (!forceOnly ? this.candidateRunner(l, base) : null);
      if (r) opts.push({ base, f: this.throwOption(l, base, r, !!forced, 0) });
    }
    if (opts.length === 1) return;
    let pick = opts.findIndex((o) => o.base === (best ?? -1));
    if (pick < 0 && !best && !forceOnly) {
      // No sure out: the hand-written AI still throws ahead of the lead runner.
      const running = l.runners
        .filter((r) => !r.out && r.progress < r.target - 1e-6)
        .sort((a, b) => b.progress - a.progress)[0];
      const ahead = running ? Math.min(4, Math.floor(running.progress + 1e-9) + 1) : 0;
      pick = Math.max(
        0,
        opts.findIndex((o) => o.base === ahead),
      );
    }
    this.throwObserver!(
      this.playContext(l),
      opts.map((o) => o.f),
      Math.max(0, pick),
    );
  }
  /** The play as the learned AI sees it (AI_CTX numbers, about 0–1). */
  private playContext(l: LivePlay): number[] {
    const s = this.state,
      t = l.throw,
      inAir = !!t && t.receivedAt === null,
      live = l.runners.filter((r) => !r.out && r.progress < 4);
    return [
      s.outs / 2,
      l.fieldedAt === null ? 1 : 0,
      inAir ? 1 : 0,
      l.fieldedAt !== null && !inAir ? 1 : 0,
      Math.hypot(s.ball.x, s.ball.z) / 60,
      Math.min(l.elapsed, 15) / 10,
      live.length / 4,
      live.reduce((m, r) => Math.max(m, r.progress), 0) / 4,
      l.outs.length / 2,
      l.ground ? 1 : 0,
    ];
  }
  /** The career's hall-of-fame board is the easiest difficulty it ever played a match on. */
  private markDifficulty() {
    const s = this.state,
      c = s.career;
    c.minDifficulty = isDifficulty(c.minDifficulty)
      ? easierDifficulty(c.minDifficulty, s.difficulty)
      : s.difficulty;
  }
  /** Ball holder option "keep the ball" (no throw / run at the runner): AI_HOLDER numbers. */
  private holdOption(): number[] {
    return [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }
  /** Ball holder option "throw to `base` for runner r" (`wait`: s before he can let it go). */
  private throwOption(l: LivePlay, base: number, r: RunnerTrack, forced: boolean, wait: number) {
    const bag = BASES[base - 1],
      route = this.throwRoute(l, l.fielderPos, base, l.fielder),
      travel = wait + this.throwTime(l, base) + (forced ? 0 : RULES.tagSweep),
      arrival = this.arriveTime(l, r, base);
    return [
      0,
      clamp(arrival - travel, -4, 4) / 2,
      Math.min(travel, 8) / 4,
      Math.min(arrival, 8) / 4,
      forced ? 1 : 0,
      base / 4,
      base === 4 ? 1 : 0,
      r.id === 0 ? 1 : 0,
      r.target < r.progress ? 1 : 0,
      "relay" in route && route.relay ? 1 : 0,
      Math.hypot(bag.x - l.fielderPos.x, bag.z - l.fielderPos.z) / 60,
      // Is he running at that bag, and how soon could he be safe on another one instead?
      // (A runner who can just turn back is not worth a throw.)
      r.target === base ? 1 : 0,
      Math.min(this.escapeTime(l, r, base), 8) / 4,
    ];
  }
  /** Seconds until runner r could be safe on a bag other than `base` (8: nowhere to go). */
  private escapeTime(l: LivePlay, r: RunnerTrack, base: number) {
    const k = Math.floor(r.progress + 1e-9),
      other = r.target !== base ? r.target : base === k + 1 ? k : k + 1;
    // The batter cannot go back home; nobody can stay on a bag a forced runner must leave.
    if (other < 1 || other > 4 || (r.id === 0 && other < 1) || other === base) return 8;
    const turn = Math.sign(other - r.progress) !== Math.sign(r.target - r.progress);
    return this.arriveTime(l, r, other, r.fullPace ?? r.pace) + (turn ? RULES.turnTime : 0);
  }
  private beginThrow(l: LivePlay, base: number, runner?: RunnerTrack) {
    if (!base) {
      l.state = "보유";
      l.throwBase = 0;
      this.state.detail = "주자가 모두 베이스에 도착 · 공을 내야로 돌려보냅니다";
      return;
    }
    const r = runner ?? this.candidateRunner(l, base),
      bag = BASES[base - 1],
      where = base === 4 ? "홈" : base + "루",
      route =
        l.kind === "pickoff" ? { time: 0 } : this.throwRoute(l, l.fielderPos, base, l.fielder);
    if ("relay" in route && route.relay) {
      // Long throw: to the cutoff man first; he turns and relays it (re-deciding the base).
      const { who, spot } = route.relay;
      l.relay = route.relay;
      l.throw = {
        from: { ...l.fielderPos, y: 1.2 },
        to: { ...spot },
        base: 0,
        relayTo: base,
        kind: "throw",
        receiver: who,
        thrower: l.fielder,
        startedAt: l.elapsed,
        duration: Math.max(
          this.throwSeconds(l.fielderPos, spot, this.armOf(l)),
          Math.hypot(spot.x - l.defenders[who].x, spot.z - l.defenders[who].z) / 8.2,
        ),
        receivedAt: null,
        runnerId: r?.id ?? null,
      };
      l.throws++;
      l.throwBase = base;
      l.state = "송구";
      this.state.detail = `중계 플레이 · ${where} 방향`;
      return;
    }
    const duration = this.throwTime(l, base),
      near = Math.hypot(bag.x - l.fielderPos.x, bag.z - l.fielderPos.z),
      // A soft flip only to a teammate a few steps away and with time to spare.
      arrival = r ? this.arriveTime(l, r, base) : 9,
      tossTime = Math.max(0.25, near / RULES.tossSpeed),
      toss =
        l.kind === "batted" &&
        near < RULES.tossRange &&
        arrival - Math.max(tossTime, duration) > RULES.tossSpare,
      // A throwing error: it sails wide of the bag, past the receiver.
      wild =
        l.kind === "batted" && !toss && this.rng() < this.errorChance(l.fielder, RULES.throwErr),
      to = { ...bag };
    if (wild) {
      const dx = bag.x - l.fielderPos.x,
        dz = bag.z - l.fielderPos.z,
        n = Math.hypot(dx, dz) || 1,
        side = (this.rng() < 0.5 ? -1 : 1) * (2.2 + this.rng() * 1.8);
      to.x += (dx / n) * 1.5 - (dz / n) * side;
      to.z += (dz / n) * 1.5 + (dx / n) * side;
    }
    l.throw = {
      from: { ...l.fielderPos, y: 1.2 },
      to,
      base,
      kind: toss ? "toss" : "throw",
      wild,
      thrower: l.fielder,
      receiver: this.receiver(base, l.fielder),
      startedAt: l.elapsed,
      duration: toss ? Math.max(tossTime, duration) : duration,
      receivedAt: null,
      runnerId: r?.id ?? null,
    };
    l.throws++;
    l.throwBase = base;
    l.state = "송구";
    this.state.detail = toss ? `${where}로 토스` : where + " 송구 · 공과 주자의 도착 순서 판정";
  }
  /** Runner AI and the ball holder's chase run on batted balls that are down and live. */
  private runnersThink(l: LivePlay) {
    return (
      l.kind === "batted" &&
      l.resultBases < 4 &&
      !l.caughtFly &&
      (l.ground || l.bounced) &&
      this.state.outs < 3
    );
  }
  /** Seconds from now until the defence can have the ball on `base`, as things stand. */
  private ballEta(l: LivePlay, base: number, pickupAt: number) {
    const bag = BASES[base - 1],
      now = l.elapsed,
      t = l.throw,
      // From a fielder at `pos`: run it to the bag or throw it to whoever covers it.
      fromHolder = (who: number, pos: Vec, ready: number) => {
        const foot = Math.max(0, Math.hypot(pos.x - bag.x, pos.z - bag.z) - 0.9) / 8.2,
          cover = l.defenders[this.receiver(base, who)],
          coverEta = Math.max(0, Math.hypot(cover.x - bag.x, cover.z - bag.z) - 0.9) / 8.2,
          thrown = ready + Math.max(this.throwRoute(l, pos, base, who).time, coverEta - ready);
        return Math.min(foot, thrown);
      };
    if (l.fieldedAt === null) {
      // Loose: the chaser picks it up first.
      const at = this.liveBall(l, pickupAt);
      return pickupAt - now + fromHolder(l.fielder, at, l.hold);
    }
    if (t && t.receivedAt === null) {
      const arrive = Math.max(0, t.startedAt + t.duration - now);
      if (t.base === base) return arrive;
      if (t.base === 0)
        return arrive + RULES.relayHold + this.throwRoute(l, t.to, base, t.receiver).time;
      return arrive + fromHolder(t.receiver, t.to, RULES.chaseRelease);
    }
    const ready =
      l.state === "포구"
        ? Math.max(0, l.fieldedAt + l.hold - now)
        : Math.max(0, (t?.receivedAt ?? l.fieldedAt) + RULES.chaseRelease - now);
    return fromHolder(l.fielder, l.fielderPos, ready);
  }
  /**
   * Runner AI: each runner reads the play every RULES.runThink s and heads for the base
   * where his out chance is low enough, the farthest one he can risk. A runner caught
   * between bases turns back and forth on his own, so rundowns just happen.
   */
  private thinkRunners(l: LivePlay) {
    const s = this.state,
      now = l.elapsed,
      live = l.runners.filter((r) => !r.out && r.progress < 4);
    if (!live.some((r) => (r.thinkAt ?? 0) <= now + 1e-9)) return;
    const holder = l.fieldedAt !== null && (!l.throw || l.throw.receivedAt !== null),
      // The ball is back in the infield in someone's hands: nobody takes off from a bag.
      dead = holder && Math.hypot(l.fielderPos.x, l.fielderPos.z) < 32,
      pickupAt = l.fieldedAt === null ? this.interceptFrom(l, l.fielder) : now,
      go = s.outs === 2 ? RULES.runGo2 : RULES.runGo,
      etas = new Map<number, number>(),
      eta = (b: number) => {
        if (!etas.has(b)) etas.set(b, this.ballEta(l, b, pickupAt));
        return etas.get(b)!;
      };
    let limit = 5;
    for (const r of [...live].sort((a, b) => b.progress - a.progress)) {
      const full = r.fullPace ?? r.pace,
        k = Math.floor(r.progress + 1e-9),
        onBag = Math.abs(r.progress - Math.round(r.progress)) * BASE_PATH_LENGTH < 0.3,
        settled = runnerSettled(r),
        behind = live.filter((x) => x !== r && x.progress < r.progress),
        trail = behind.reduce((m, x) => Math.max(m, x.progress), -1),
        forcedTo = [1, 2, 3, 4].find((b) => this.forcedRunner(l, b) === r) ?? 0,
        dir = Math.sign(r.target - r.progress);
      if ((r.thinkAt ?? 0) > now + 1e-9 || (settled && dead) || r.delay > now + 1e-9) {
        limit = r.target === 4 ? limit : Math.min(limit, r.target);
        continue;
      }
      r.thinkAt = now + (this.runnerAI && l.kind === "batted" ? RULES.brainThink : RULES.runThink);
      // He misjudges a loose ball more than one already in a fielder's hands.
      r.read ??= (this.rng() + this.rng() + this.rng() - 1.5) * 2 * RULES.runRead;
      const misread = r.read * (l.fieldedAt === null || l.state === "포구" ? 1 : 0.3);
      const options: { base: number; p: number; f?: number[] }[] = [];
      const brain = l.kind === "batted" ? this.runnerAI : null,
        t = l.throw;
      for (const b of [k, k + 1, k + 2]) {
        if (b < Math.max(1, r.from) || b > 4) continue;
        if (b < forcedTo) continue;
        if (b >= limit && b < 4) continue;
        if (b <= trail) continue;
        if (settled && b < r.target) continue;
        const turn =
            dir !== 0 && Math.sign(b - r.progress) !== 0 && Math.sign(b - r.progress) !== dir,
          runT = this.arriveTime(l, r, b, full) + (turn ? RULES.turnTime : 0),
          // A force needs only the ball on the bag; a tag also the glove coming down.
          ball = eta(b) + (b === forcedTo ? 0 : RULES.tagSweep),
          p =
            onBag && Math.round(r.progress) === b && b >= forcedTo
              ? 0
              : 1 / (1 + Math.exp(-(runT - ball - misread - 0.05) / RULES.runSpread));
        options.push({
          base: b,
          p,
          f: brain
            ? [
                // How he sees it: + = he gets there before the ball (and the glove).
                clamp(ball + misread - runT, -4, 4) / 2,
                Math.min(runT, 10) / 5,
                Math.min(ball, 10) / 5,
                b === forcedTo ? 1 : 0,
                (b - r.progress) / 2,
                b === r.target ? 1 : 0,
                b === 4 ? 1 : 0,
                b < r.progress ? 1 : 0,
                turn ? 1 : 0,
                onBag && Math.round(r.progress) === b ? 1 : 0,
                r.id === 0 ? 1 : 0,
                t && t.receivedAt === null && t.base === b ? 1 : 0,
              ]
            : undefined,
        });
      }
      if (options.length) {
        const cur = options.find((o) => o.base === r.target);
        let pick: (typeof options)[number] | undefined;
        // Learned AI: a new choice only when the play changes for him (the ball is picked
        // up, thrown or caught, he reaches a bag) or every RULES.brainEvery s; otherwise he
        // keeps going where he was going.
        const key = brain
          ? `${l.fieldedAt !== null}|${l.throws}|${l.throw?.receivedAt != null}|${l.fielder}|${k}|${r.progress >= r.target - 1e-6}`
          : "";
        // Real runners do not dance: after RULES.brainTurns turns (rundowns included) he is
        // committed and may not turn around again. (Learned runners found that flip-flopping
        // on every throw makes the fielders throw back and forth while everyone scores.)
        const allowed =
          brain && (r.reversals ?? 0) >= RULES.brainTurns && dir !== 0
            ? options.filter((o) => Math.sign(o.base - r.progress) !== -dir)
            : options;
        if (
          brain &&
          allowed.length > 1 &&
          (!cur || key !== r.brainKey || now >= (r.brainAt ?? 0))
        ) {
          r.brainKey = key;
          r.brainAt = now + RULES.brainEvery;
          pick =
            allowed[
              brain(
                this.playContext(l),
                allowed.map((o) => o.f!),
              )
            ] ?? allowed[0];
        } else if (brain) pick = cur ?? allowed[0] ?? options[0];
        else {
          pick = [...options].sort((a, b) => b.base - a.base).find((o) => o.p < go);
          if (cur && cur.p < RULES.runKeep && (!pick || pick.base < cur.base)) pick = cur;
        }
        pick ??= [...options].sort((a, b) => a.p - b.p)[0];
        // Just turned around: give it a moment unless he is sure to be out.
        const fresh = r.turnAt !== undefined && now - r.turnAt < 0.6 && (cur?.p ?? 1) < 0.85;
        if (pick.base !== r.target && !fresh) {
          const turn = Math.sign(pick.base - r.progress);
          if (dir !== 0 && turn !== 0 && turn !== dir) {
            r.turned = true;
            r.reversals = (r.reversals ?? 0) + 1;
            r.turnAt = now;
            r.delay = Math.max(r.delay, now + RULES.turnTime);
          }
          r.target = pick.base;
          r.pace = full;
          r.stealing = false;
          if (pick.base < 4) r.scoredAt = null;
        }
      }
      limit = r.target === 4 ? limit : Math.min(limit, r.target);
    }
  }
  /** Runners on the move now and then trip and fall (more often on a wet field). */
  private runnerFalls(l: LivePlay, dt: number) {
    const rate = this.raining ? RULES.fallRain : RULES.fallClear;
    for (const r of l.runners) {
      if (r.out || r.fellAt !== undefined || r.progress >= r.target - 0.05) continue;
      if (r.delay > l.elapsed || this.rng() >= rate * dt) continue;
      r.fellAt = l.elapsed;
      r.delay = l.elapsed + RULES.fallTime;
      r.thinkAt = l.elapsed;
      this.state.detail = "주자가 넘어졌습니다!";
      this.log("주자 넘어짐");
    }
  }
  /**
   * The ball holder works on a runner caught off his base: tags him if he is within reach,
   * throws ahead of him when the ball beats him there, otherwise runs at him.
   */
  private chaseRunners(l: LivePlay, dt: number) {
    const s = this.state,
      t = l.throw;
    if (l.state !== "보유" || (t && t.receivedAt === null) || l.fieldedAt === null) return;
    const auto = s.autoField || this.batting;
    // Manual fielding: the player calls any further throw (after the first one).
    if (!auto && l.requestedBase && t?.receivedAt != null && l.throws < RULES.maxThrows) {
      const bag = BASES[l.requestedBase - 1];
      if (Math.hypot(bag.x - l.fielderPos.x, bag.z - l.fielderPos.z) > 1.5) {
        if (l.elapsed < t.receivedAt + RULES.chaseRelease) return;
        this.beginThrow(l, l.requestedBase);
        l.requestedBase = null;
        return;
      }
    }
    const pos = l.fielderPos,
      off = l.runners.filter(
        (r) =>
          !r.out &&
          r.progress < 4 &&
          Math.abs(r.progress - Math.round(r.progress)) * BASE_PATH_LENGTH > 0.45 &&
          // The batter who just overran first may go back untouched.
          !(r.id === 0 && r.progress > 1 && r.target === 1 && !r.turned),
      );
    if (!off.length) {
      if (l.rundown) l.rundown.end ??= l.elapsed;
      return;
    }
    const near = off
      .map((r) => {
        const p = runnerPose(r).position;
        return { r, d: Math.hypot(p.x - pos.x, p.z - pos.z), p };
      })
      .sort((a, b) => a.d - b.d)[0];
    const { r, d, p } = near;
    if (d > 40) return;
    // Caught between bases with the ball on him: a rundown (announced once per play).
    if (
      r.turned &&
      (!l.rundown || l.rundown.end !== undefined) &&
      Math.abs(r.progress - Math.round(r.progress)) * BASE_PATH_LENGTH > 3
    ) {
      if (!l.rundown) this.callout("런다운", this.batting ? "red" : "gold");
      l.rundown = { runnerId: r.id, since: l.elapsed, base: r.target };
    }
    const got = t?.receivedAt ?? l.fieldedAt,
      ready = Math.max(0, got + RULES.chaseRelease - l.elapsed),
      b = r.target,
      bag = BASES[b - 1],
      heading = Math.hypot(bag.x - pos.x, bag.z - pos.z) > 1.5;
    if (
      this.fielderAI &&
      l.kind === "batted" &&
      auto &&
      heading &&
      Math.abs(b - r.progress) * BASE_PATH_LENGTH > 0.45 &&
      l.throws < RULES.maxThrows
    ) {
      // Learned holder: every RULES.holdThink s, throw ahead of him or keep running at him.
      if ((l.holdThinkAt ?? 0) <= l.elapsed + 1e-9) {
        l.holdThinkAt = l.elapsed + RULES.holdThink;
        const forced = this.forcedRunner(l, b) === r,
          pick = this.fielderAI!(this.playContext(l), [
            this.holdOption(),
            this.throwOption(l, b, r, forced, ready),
          ]);
        l.holdPlan = pick === 1 ? b : 0;
      }
      if (l.holdPlan === b) {
        if (ready > 0) return; // gets set to throw
        l.holdPlan = 0;
        this.beginThrow(l, b, r);
        return;
      }
    } else if (
      auto &&
      heading &&
      Math.abs(b - r.progress) * BASE_PATH_LENGTH > 0.45 &&
      l.throws < RULES.maxThrows
    ) {
      const cover = l.defenders[this.receiver(b, l.fielder)],
        coverEta = Math.max(0, Math.hypot(cover.x - bag.x, cover.z - bag.z) - 0.9) / 8.2,
        ball =
          ready + Math.max(this.throwRoute(l, pos, b, l.fielder).time, coverEta) + RULES.tagSweep,
        run = this.arriveTime(l, r, b);
      if (ball + RULES.chaseMargin < run) {
        if (ready > 0) return; // gets set to throw
        this.beginThrow(l, b, r);
        return;
      }
    }
    // Run him down; a holder on the bag the runner is coming to waits there for him.
    if (heading) this.moveFielder(pos, p, dt, this.fielderStats(l.fielder, l).speed);
    s.detail = l.rundown ? "런다운! 주자가 베이스 사이에 갇혔습니다" : s.detail;
  }
  private retire(
    l: LivePlay,
    r: RunnerTrack,
    base: number,
    kind: PlayOut["kind"],
    time = l.elapsed,
  ) {
    if (r.out || this.state.outs >= 3) return;
    r.out = true;
    const rd = l.rundown;
    if (kind === "tag" && rd?.runnerId === r.id && rd.end === undefined) rd.tagAt = time;
    l.outs.push({ runnerId: r.id, base, force: kind === "force", time, kind });
    this.state.outs++;
    if (!this.batting) this.earn(XP.out, "수비 아웃");
    this.state.message = kind === "fly" ? "FLY OUT" : kind === "tag" ? "TAG OUT" : "FORCE OUT";
    this.state.detail =
      kind === "fly"
        ? "땅에 닿기 전 포구 · 타자 아웃"
        : (base === 4 ? "홈" : base + "루") +
          (kind === "tag" ? "에서 주자 태그" : "에 공이 먼저 도착");
    this.sound("glove");
  }
  private advanceLiveRunners(l: LivePlay, dt: number, previousTime: number) {
    for (const r of l.runners) {
      if (r.out) continue;
      const remainingDelay = Math.max(0, r.delay - previousTime),
        usable = Math.max(0, dt - remainingDelay);
      if (r.progress > r.target + 1e-9) {
        // RETURN: going back to retouch the base (caught fly or pickoff).
        let back = Math.max(r.target, r.progress - r.pace * usable);
        if (back <= r.target + 1e-9) back = r.target;
        if (back <= r.target + 1e-9 && r.tagUp) {
          const reached = previousTime + remainingDelay + (r.progress - r.target) / r.pace;
          r.tagUp = false;
          r.target = r.from + 1;
          r.delay = reached + 0.18;
        }
        r.progress = back;
        continue;
      }
      if (r.progress >= r.target) continue;
      const before = r.progress;
      const next = Math.min(r.target, before + r.pace * usable);
      // He touches the next bag when his lead foot (or hand) reaches it, before his body
      // is over it: that moment decides force plays, tags and when a run scores.
      const ahead = Math.floor(before + 1e-9) + 1,
        line = this.touchLine(r, ahead);
      if (ahead <= 4 && before < line - 1e-12 && next >= line - 1e-12) {
        const at = previousTime + remainingDelay + Math.max(0, line - before) / r.pace;
        r.touched = { base: ahead, at };
        if (ahead === 4 && r.scoredAt === null) r.scoredAt = at;
        this.touchCall(l, r, ahead, at);
      }
      r.progress = next;
      if (next >= 4 && r.scoredAt === null)
        r.scoredAt = previousTime + remainingDelay + (4 - before) / r.pace;
    }
  }
  /**
   * Seconds until runner r touches `base` (from now, at `pace` bases/s): a batter runs through
   * first; otherwise a runner going for a bag with a play on it slides (back to a bag: dives).
   */
  arriveTime(l: LivePlay, r: RunnerTrack, base: number, pace = r.pace) {
    const pose: RunnerPose =
      r.slide?.base === base
        ? r.slide.kind
        : r.progress > base
          ? "dive"
          : r.id === 0 && base === 1
            ? "run"
            : "slide";
    const gap = Math.abs(base - r.progress) * BASE_PATH_LENGTH - touchDistance(pose);
    return Math.max(0, r.delay - l.elapsed) + Math.max(0, gap) / (pace * BASE_PATH_LENGTH);
  }
  /** How he would touch `base` now: running through, or sliding / diving if he is. */
  runnerPoseFor(r: RunnerTrack, base: number): RunnerPose {
    return r.slide?.base === base ? r.slide.kind : "run";
  }
  /** Progress at which the runner touches `base` (his lead foot/hand reaches the bag). */
  touchLine(r: RunnerTrack, base: number) {
    const d = touchDistance(this.runnerPoseFor(r, base)) / BASE_PATH_LENGTH;
    return r.progress > base ? base + d : base - d;
  }
  /** Is the runner touching a bag right now (safe from a tag there)? */
  private touchingBag(l: LivePlay, r: RunnerTrack) {
    if (r.scoredAt !== null) return true;
    const n = Math.round(r.progress);
    if (n < 1 || n > 4) return false;
    // A forced runner gets no protection from the bag he was forced off.
    const forcedTo = [1, 2, 3, 4].find((b) => this.forcedRunner(l, b) === r) ?? 0;
    if (forcedTo && n < forcedTo) return false;
    return (
      Math.abs(r.progress - n) * BASE_PATH_LENGTH <= touchDistance(this.runnerPoseFor(r, n)) + 1e-9
    );
  }
  /** Direction the runner moves (unit, ground plane), or zero when standing. */
  private runnerHeading(r: RunnerTrack) {
    if (runnerSettled(r)) return V();
    const pose = runnerPose(r);
    const n = Math.hypot(pose.facing.x, pose.facing.z) || 1;
    return V(pose.facing.x / n, 0, pose.facing.z / n);
  }
  /**
   * Runners slide (or dive head first) into a bag the play is going to: a throw on its way
   * there, the ball already waiting there, or a steal. A runner diving back to his bag on a
   * pickoff or a caught fly goes in head first.
   */
  private updateSlides(l: LivePlay) {
    const t = l.throw,
      holding = l.fieldedAt !== null && (!t || t.receivedAt !== null);
    for (const r of l.runners) {
      if (r.out || runnerSettled(r)) continue;
      const b = r.target,
        back = r.progress > b;
      if (r.slide && r.slide.base !== b) r.slide = undefined;
      if (r.slide || b < 1 || (r.id === 0 && b === 1 && !back)) continue;
      const left = Math.abs(b - r.progress) * BASE_PATH_LENGTH;
      if (left > RULES.slideStart || left <= touchDistance("run")) continue;
      const bag = BASES[b - 1],
        waiting = holding && Math.hypot(l.fielderPos.x - bag.x, l.fielderPos.z - bag.z) < 2.5,
        coming = !!t && t.receivedAt === null && (t.base === b || t.relayTo === b);
      if (!(waiting || coming || r.stealing)) continue;
      const dive = back || this.rng() < (waiting ? 0.5 : RULES.slideDive);
      r.slide = { base: b, at: l.elapsed, kind: dive ? "dive" : "slide" };
    }
  }
  /**
   * The ball holder on a bag a runner is coming to steps to the runner's side of it, so his
   * glove is between the runner and the bag.
   */
  private straddleBag(l: LivePlay, dt: number) {
    const t = l.throw;
    if (l.fieldedAt === null || (t && t.receivedAt === null)) return;
    const pos = l.fielderPos;
    for (let b = 1; b <= 4; b++) {
      const bag = BASES[b - 1];
      if (Math.hypot(pos.x - bag.x, pos.z - bag.z) > 2) continue;
      const r = l.runners
        .filter((x) => !x.out && x.target === b && !runnerSettled(x) && x.scoredAt === null)
        .sort((x, y) => Math.abs(x.progress - b) - Math.abs(y.progress - b))[0];
      if (!r) return;
      const at = runnerPose(r).position,
        dx = at.x - bag.x,
        dz = at.z - bag.z,
        n = Math.hypot(dx, dz) || 1;
      this.moveFielder(pos, V(bag.x + (dx / n) * 0.3, 0, bag.z + (dz / n) * 0.3), dt);
      return;
    }
  }
  /**
   * Tags with hitboxes: the ball holder's glove (once it is down, RULES.tagSweep after the
   * catch) touching a runner who is off his bag is an out.
   */
  private applyTags(l: LivePlay) {
    const s = this.state,
      t = l.throw;
    if (s.outs >= 3 || l.fieldedAt === null || (t && t.receivedAt === null)) return;
    const got = t?.receivedAt ?? l.fieldedAt;
    if (l.elapsed + 1e-9 < got + RULES.tagSweep) return;
    for (const r of l.runners) {
      if (r.out || r.progress >= 4 || this.touchingBag(l, r)) continue;
      // The batter who just overran first may walk back untouched.
      if (r.id === 0 && r.progress > 1 && r.target === 1 && !r.turned && !l.caughtFly) continue;
      const at = runnerPose(r).position,
        dir = this.runnerHeading(r),
        pose = this.runnerPoseFor(r, r.target);
      if (!tagReaches(l.fielderPos, at, dir, pose)) continue;
      // How close it was: time until he would have touched the bag.
      const margin = Math.abs(this.touchLine(r, r.target) - r.progress) / r.pace;
      this.retire(l, r, Math.max(1, r.target), "tag");
      if (margin <= RULES.closePlay) this.closeCall(l, r, r.target, true, l.fielder);
      if (s.outs >= 3) return;
    }
  }
  /** A runner just touched `base`: a close call if the tag came a moment too late. */
  private touchCall(l: LivePlay, r: RunnerTrack, base: number, at: number) {
    const t = l.throw;
    if (!t || t.base !== base || this.forcedRunner(l, base) === r) return;
    const ready = (t.receivedAt ?? t.startedAt + t.duration) + RULES.tagSweep;
    if (ready >= at && ready - at <= RULES.closePlay) this.closeCall(l, r, base, false, t.receiver);
  }
  private closeCall(l: LivePlay, r: RunnerTrack, base: number, out: boolean, fielder: number) {
    this.replayId++;
    this.state.replay = {
      text: out ? "아웃" : "세이프",
      fielder,
      at: l.elapsed,
      id: this.replayId,
      base: { runner: r.id, base, out },
    };
  }
  private tickLivePlay(dt: number) {
    // Split at ball events so a 30/60 fps boundary cannot change a close play.
    let remaining = dt;
    while (remaining > 1e-8 && this.state.phase === "inplay") {
      const l = this.state.live!,
        events = [l.flightTime, l.catchAt];
      if (l.fieldedAt !== null) events.push(l.fieldedAt + l.hold);
      if (l.throw) events.push(l.throw.startedAt + l.throw.duration);
      if (l.throw?.receivedAt != null) events.push(l.throw.receivedAt + RULES.tagSweep);
      const next = events.filter((t) => t > l.elapsed + 1e-8).sort((a, b) => a - b)[0];
      const step = next === undefined ? remaining : Math.min(remaining, next - l.elapsed);
      this.stepLivePlay(step);
      remaining -= step;
    }
  }
  /**
   * After a caught fly every runner (lead runner first) works out whether he can retouch and
   * beat the throw to the next bag; he tags up only then (a misread can still send him).
   */
  private decideTagUps(l: LivePlay, catchAt: Vec) {
    let free = 5;
    const hold = l.hold;
    for (const r of [...l.runners].filter((x) => !x.out).sort((a, b) => b.from - a.from)) {
      const next = r.from + 1;
      if (next >= free && next < 4) {
        free = r.from;
        continue;
      }
      const pace = (r.fullPace ?? r.pace) * BASE_PATH_LENGTH,
        back = Math.max(0, r.progress - r.from) * BASE_PATH_LENGTH,
        // On the bag he leaves the moment it is caught (a rolling start).
        run =
          back / pace + (back ? 0.18 : 0.05) + (BASE_PATH_LENGTH - touchDistance("slide")) / pace,
        ball =
          hold +
          this.throwRoute(l, catchAt, next, l.fielder).time +
          (next === 4 ? 0 : 0.05) +
          RULES.tagSweep,
        read = (r.read ??= (this.rng() + this.rng() + this.rng() - 1.5) * 2 * RULES.runRead);
      if (run + 0.05 < ball + read * 0.3) {
        if (r.progress <= r.from + 1e-9) {
          r.target = next;
          r.delay = l.elapsed + 0.05;
        } else r.tagUp = true;
        if (r.from === 3) l.sacrifice = true;
        this.state.detail = `플라이 아웃 · ${r.from}루 주자 태그업`;
        free = next === 4 ? free : next;
      } else free = r.from;
    }
  }
  /** After a caught fly: a throw to the bag a tagging runner is heading for, if it beats him. */
  private tagUpThrow(l: LivePlay) {
    for (const r of [...l.runners].filter((x) => !x.out).sort((a, b) => b.from - a.from)) {
      if (!(r.tagUp || r.target > r.progress)) continue;
      const next = r.from + 1,
        pace = r.pace * BASE_PATH_LENGTH,
        back = r.tagUp ? Math.max(0, r.progress - r.from) * BASE_PATH_LENGTH : 0,
        run =
          Math.max(0, r.delay - l.elapsed) +
          (r.tagUp ? back / pace + 0.18 : 0) +
          Math.max(
            0,
            Math.abs(next - (r.tagUp ? r.from : r.progress)) * BASE_PATH_LENGTH -
              touchDistance("slide"),
          ) /
            pace;
      if (this.throwTime(l, next) + RULES.tagSweep + 0.05 < run) return next;
    }
    return 0;
  }
  /** After a caught fly: throw behind a runner only when the ball beats him back to his bag. */
  private chooseDoubleOff(l: LivePlay) {
    for (let base = 3; base >= 1; base--) {
      const r = this.returningRunner(l, base);
      if (!r) continue;
      if (this.throwTime(l, base) + RULES.tagSweep + 0.08 < this.arriveTime(l, r, base))
        return base;
    }
    return 0;
  }
  private stepLivePlay(dt: number) {
    const s = this.state,
      l = s.live!,
      previous = l.elapsed;
    l.elapsed += dt;
    this.advanceLiveRunners(l, dt, previous);
    if (this.runnersThink(l)) {
      this.runnerFalls(l, dt);
      this.thinkRunners(l);
    }
    // Cover the bags while the selected fielder follows the ball.
    for (let base = 1; base <= 4; base++) {
      const i = this.receiver(base, l.fielder);
      // A fielder still on the ground after a missed dive cannot cover yet.
      if (i === l.diver && l.elapsed < (l.downUntil ?? 0)) continue;
      if (l.relay && i === l.relay.who) continue;
      // Nobody else covers the bag the ball holder is standing on.
      const bag = BASES[base - 1];
      if (
        l.throw?.receivedAt != null &&
        Math.hypot(l.fielderPos.x - bag.x, l.fielderPos.z - bag.z) < 3
      )
        continue;
      this.moveFielder(l.defenders[i], bag, dt);
    }
    // Relay: the cutoff man heads for his spot (planned throw, or lining up on a deep ball).
    if (l.kind === "batted") {
      let cut = l.relay;
      if (!cut && l.fielder >= 6 && l.fieldedAt === null && !l.throw) {
        const lead = l.runners
            .filter((r) => !r.out)
            .reduce((m, r) => Math.max(m, Math.floor(r.progress + 1e-9) + 1), 1),
          base = Math.min(4, lead),
          ball = l.bounced || l.ground ? this.state.ball : l.catchPoint,
          bag = BASES[base - 1];
        if (Math.hypot(ball.x - bag.x, ball.z - bag.z) > RULES.longThrow)
          cut = {
            who: this.cutoffFor(ball, base),
            spot: V(
              lerp(bag.x, ball.x, RULES.relayShare),
              0,
              lerp(bag.z, ball.z, RULES.relayShare),
            ),
            base,
          };
      }
      // (Not a fielder still on the ground after a missed dive: he gets up first.)
      if (
        cut &&
        cut.who !== l.fielder &&
        !(cut.who === l.diver && l.elapsed < (l.downUntil ?? 0))
      )
        this.moveFielder(l.defenders[cut.who], cut.spot, dt);
    }
    if (l.resultBases === 4) {
      s.ball = this.liveBall(l, l.elapsed);
      if (l.elapsed >= l.flightTime && l.runners.every((r) => r.progress >= r.target))
        this.resolvePlay();
      return;
    }
    if (l.fieldedAt === null) this.assignChaser(l);
    const auto = s.autoField || this.batting;
    if (l.fieldedAt === null && auto) this.planFly(l);
    if (l.fieldedAt === null) {
      const { speed: fielderSpeed, reaction: fielderReaction } = this.fielderStats(l.fielder, l),
        oldPos = { ...l.fielderPos },
        // Before landing: run to the catch point. After it lands: cut off the rolling ball.
        target = !l.ground && !l.bounced ? l.catchPoint : this.interceptPoint(l);
      // Manual fielding: WASD steers him; with no key held he runs to the ball on his own
      // (before, nobody moved and the batter circled the bases while the ball lay there).
      const steering =
        !s.autoField && !this.batting && ["w", "a", "s", "d"].some((k) => this.keys.has(k));
      if (steering) {
        const dx = (this.keys.has("d") ? 1 : 0) - (this.keys.has("a") ? 1 : 0),
          dz = (this.keys.has("w") ? 1 : 0) - (this.keys.has("s") ? 1 : 0),
          n = Math.hypot(dx, dz) || 1;
        l.fielderPos.x = clamp(l.fielderPos.x + (dx / n) * fielderSpeed * dt, -85, 85);
        l.fielderPos.z = clamp(l.fielderPos.z + (dz / n) * fielderSpeed * dt, -20, 105);
      } else {
        // The fielder needs a moment to read the ball before the first step (and to get up
        // after a missed dive).
        const moving = Math.max(
          0,
          l.elapsed - Math.max(previous, fielderReaction, this.downTime(l)),
        );
        const plan = l.plan;
        if (
          plan?.end &&
          plan.launchAt !== undefined &&
          l.elapsed + 1e-8 >= plan.launchAt &&
          l.elapsed <= plan.at + 1e-8
        ) {
          // In the air: from the take-off spot to where the dive ends.
          plan.launch ??= { ...l.fielderPos };
          const u = clamp(
            (l.elapsed - plan.launchAt) / Math.max(1e-3, plan.at - plan.launchAt),
            0,
            1,
          );
          l.fielderPos.x = lerp(plan.launch.x, plan.end.x, u);
          l.fielderPos.z = lerp(plan.launch.z, plan.end.z, u);
        } else if (moving > 0) this.moveFielder(l.fielderPos, target, moving, fielderSpeed);
      }
      s.ball = this.liveBall(l, l.elapsed);
      if (!l.ground && !l.bounced && previous < l.catchAt - 1e-8 && l.elapsed + 1e-8 >= l.catchAt) {
        const fraction = clamp((l.catchAt - previous) / dt, 0, 1),
          atCatch = V(
            lerp(oldPos.x, l.fielderPos.x, fraction),
            0,
            lerp(oldPos.z, l.fielderPos.z, fraction),
          );
        const plan = l.plan && l.plan.style !== "none" ? l.plan : null,
          // Planned: the on-foot gap he would have had (the dive itself moved him already).
          gap = plan
            ? plan.gap
            : Math.hypot(atCatch.x - l.catchPoint.x, atCatch.z - l.catchPoint.z);
        // Just out of reach: the fielder dives for it (once). Skill and luck decide.
        let dove = false;
        if (
          gap > CATCH_REACH &&
          gap <= this.flyDiveReach &&
          !l.diveTried &&
          l.kind === "batted" &&
          !l.bunt &&
          l.fielder !== 1
        ) {
          l.diveTried = true;
          l.diver = l.fielder;
          l.catchMoment = l.catchAt;
          dove = true;
          const made =
            plan?.style === "dive"
              ? !!plan.success
              : this.rng() < this.diveChance(l.fielder, gap, RULES.diveReach, CATCH_REACH);
          if (made) {
            l.catchStyle = "dive";
            // He ends up where the ball was, on the ground: getting up delays any throw.
            const end =
              plan?.end ??
              V(lerp(atCatch.x, l.catchPoint.x, 0.85), 0, lerp(atCatch.z, l.catchPoint.z, 0.85));
            atCatch.x = end.x;
            atCatch.z = end.z;
            l.hold += RULES.diveGetUp;
            this.highlight(l, "다이빙 캐치", l.catchAt);
          } else {
            l.catchStyle = "dive";
            l.downUntil = l.catchAt + RULES.diveMissDown;
            const end =
              plan?.end ??
              V(lerp(atCatch.x, l.catchPoint.x, 0.6), 0, lerp(atCatch.z, l.catchPoint.z, 0.6));
            l.fielderPos.x = end.x;
            l.fielderPos.z = end.z;
            s.detail = "몸을 날렸지만 글러브 끝에서 빠졌습니다!";
          }
        }
        if (gap <= CATCH_REACH || (dove && l.catchStyle === "dive" && l.downUntil === undefined)) {
          if (!dove) {
            // A leap only when he gets there just in time: a hard liner a step away, or a ball
            // at the wall he is still running to (not one he waits under).
            const jump = plan ? plan.style === "jump" : this.jumpCatch(l, gap);
            l.catchStyle = jump ? "jump" : "catch";
            if (jump) {
              l.catchMoment = l.catchAt;
              this.highlight(l, "점프 캐치", l.catchAt);
            }
          }
          // A dropped routine fly: it pops out of the glove and the runners take off.
          if (
            !dove &&
            l.catchStyle === "catch" &&
            l.kind === "batted" &&
            !l.bunt &&
            this.rng() < this.errorChance(l.fielder, RULES.dropErr)
          ) {
            l.fielderPos.x = atCatch.x;
            l.fielderPos.z = atCatch.z;
            const a = this.rng() * Math.PI * 2;
            this.looseBall(l, l.catchPoint, Math.sin(a), Math.cos(a), 2.5, "drop", l.fielder);
            return;
          }
          l.caughtFly = true;
          l.fieldedAt = l.catchAt;
          l.state = "포구";
          l.throwBase = 0;
          l.fielderPos.x = atCatch.x;
          l.fielderPos.z = atCatch.z;
          // Caught: the batter is out; he is not a runner who goes back.
          this.retire(l, l.runners[0], 1, "fly", l.catchAt);
          // Every other runner turns around at once (RETURN) and sprints back.
          for (const r of l.runners.slice(1)) {
            r.target = r.from;
            r.scoredAt = null;
            r.stealing = false;
            r.pace = r.fullPace ?? r.pace;
          }
          // A throw after a catch on the run needs a crow hop first.
          if (l.fielder >= 6) l.hold = Math.max(l.hold, RULES.crowHop);
          if (s.outs < 3) this.decideTagUps(l, atCatch);
        } else if (!s.autoField && !this.batting && distance(DEFENSE[l.fielder], l.catchPoint) < 18)
          l.error = true;
      }
      this.readFly(l);
      if (!l.caughtFly && l.elapsed + 1e-8 >= l.flightTime && !l.bounced) {
        l.bounced = true;
        // Extra bases depend on how far the fielder still is from the ball, capped by distance.
        const gap = Math.hypot(l.fielderPos.x - l.land.x, l.fielderPos.z - l.land.z);
        l.resultBases = Math.min(l.resultBases, 1 + (gap > 9 ? 1 : 0) + (gap > 22 ? 1 : 0));
        // The ball is down. A runner who already rounded the base he is owed reads the play:
        // he takes the next one only if he beats the fielder's pickup and throw there;
        // otherwise he goes back to the base he just passed (a batter who overran first is
        // safe going back).
        const pickup = Math.max(l.elapsed, this.interceptTime(l, l.fielderPos)) + l.hold;
        for (const r of l.runners) {
          r.pace = r.fullPace ?? r.pace;
          const owed = Math.min(4, r.from + l.resultBases),
            next = Math.min(4, Math.ceil(r.progress - 1e-9));
          if (next <= owed) r.target = owed;
          else {
            const runAt = l.elapsed + (next - r.progress) / r.pace,
              throwAt = this.throwArrival(l, next, pickup);
            r.target = runAt + RULES.advanceMargin < throwAt ? next : Math.floor(r.progress + 1e-9);
          }
        }
        s.message = "FAIR BALL";
        s.detail = "타구가 땅에 닿았습니다 · 주자 진루";
      }
      // A grounder about to get past him: one diving stop, if he is up and ready.
      const ballGap = Math.hypot(s.ball.x - l.fielderPos.x, s.ball.z - l.fielderPos.z);
      let diveStop = false;
      const canDive =
        l.ground &&
        l.kind === "batted" &&
        !l.bunt &&
        l.fielder !== 1 &&
        !l.diveTried &&
        l.elapsed + 1e-8 >= Math.max(fielderReaction, this.downTime(l));
      // Automatic fielding sees the ball coming a moment ahead (for the take-off motion).
      if (canDive && auto && !l.plan) this.planGroundDive(l);
      const planned = canDive && auto && l.plan?.style === "dive" ? l.plan : null;
      if (
        planned
          ? l.elapsed + 1e-8 >= planned.at
          : canDive &&
            !auto &&
            ballGap >= GROUND_REACH &&
            ballGap <= this.groundDiveReach &&
            s.ball.y < 1.1
      ) {
        // The ball is going by right now (closest it will get) and he cannot reach it on foot.
        const ahead = this.liveBall(l, l.elapsed + 0.05),
          away =
            !!planned || Math.hypot(ahead.x - l.fielderPos.x, ahead.z - l.fielderPos.z) >= ballGap;
        if (away) {
          l.diveTried = true;
          l.diver = l.fielder;
          l.catchStyle = "dive";
          l.catchMoment = l.elapsed;
          if (
            planned
              ? planned.success
              : this.rng() <
                this.diveChance(l.fielder, ballGap, RULES.groundDiveReach, GROUND_REACH)
          ) {
            diveStop = true;
            l.fielderPos.x = planned?.end?.x ?? lerp(l.fielderPos.x, s.ball.x, 0.85);
            l.fielderPos.z = planned?.end?.z ?? lerp(l.fielderPos.z, s.ball.z, 0.85);
            l.hold += RULES.diveGetUp;
            this.highlight(l, "호수비", l.elapsed);
          } else {
            l.downUntil = l.elapsed + RULES.diveMissDown;
            l.fielderPos.x = planned?.end?.x ?? lerp(l.fielderPos.x, s.ball.x, 0.5);
            l.fielderPos.z = planned?.end?.z ?? lerp(l.fielderPos.z, s.ball.z, 0.5);
            s.detail = "다이빙했지만 공이 빠져나갔습니다!";
          }
        }
      }
      if (
        diveStop ||
        (l.bounced &&
          // Not while in the air on a planned dive (the dive itself decides).
          !(
            l.plan?.style === "dive" &&
            !l.diveTried &&
            l.elapsed + 1e-8 >= (l.plan.launchAt ?? Infinity)
          ) &&
          // Nobody fields the ball before reacting to it (the catcher stands next to a bunt).
          l.elapsed + 1e-8 >= Math.max(fielderReaction, this.downTime(l)) &&
          Math.hypot(s.ball.x - l.fielderPos.x, s.ball.z - l.fielderPos.z) < GROUND_REACH &&
          s.ball.y < 1.1)
      ) {
        // A fumble: the ball kicks off the glove and he has to chase it again.
        if (
          !diveStop &&
          l.kind === "batted" &&
          this.rng() < this.errorChance(l.fielder, RULES.fieldErr)
        ) {
          const back = this.liveBall(l, l.elapsed - 0.1),
            spin = (this.rng() - 0.5) * 2.4,
            dx = s.ball.x - back.x,
            dz = s.ball.z - back.z,
            c = Math.cos(spin),
            sn = Math.sin(spin);
          this.looseBall(
            l,
            s.ball,
            dx * c - dz * sn,
            dx * sn + dz * c,
            3 + this.rng() * 4,
            "field",
            l.fielder,
          );
          return;
        }
        if (!diveStop) l.catchStyle = l.ground ? "ground" : "catch";
        l.catchMoment ??= l.elapsed;
        l.fieldedAt = l.elapsed;
        l.state = "포구";
        s.detail =
          l.kind === "wild"
            ? "포수가 빠진 공을 잡았습니다 · 송구 판단"
            : "공을 잡았습니다 · 곧바로 송구";
        // Wet ball: sometimes the fielder bobbles it and loses time before the throw.
        if (this.raining && this.rng() < RULES.rainBobble) {
          l.hold += RULES.rainBobbleTime;
          s.detail = "빗물에 미끄러져 공을 더듬었습니다!";
          this.log("빗속 수비 실수 · 공을 더듬음");
        }
      }
    }
    if (l.fieldedAt !== null) {
      if (l.caughtFly && !l.throw) {
        s.ball = { ...l.fielderPos, y: 1.55 };
        if (l.state === "포구") {
          if (l.elapsed - l.fieldedAt + 1e-8 < l.hold) return;
          // Doubled off only if the throw beats the returning runner to his base; otherwise
          // a throw ahead of a runner tagging up, if it can get him.
          const base = s.outs < 3 ? this.chooseDoubleOff(l) || this.tagUpThrow(l) : 0;
          if (base) this.beginThrow(l, base);
          else l.state = "보유";
        }
        if (!l.throw) {
          if (l.elapsed - l.fieldedAt > 0.75 && (s.outs >= 3 || l.runners.every(runnerSettled)))
            this.resolvePlay();
          return;
        }
      }
      if (l.state === "포구") {
        s.ball = { ...l.fielderPos, y: l.kind === "batted" ? 1.2 : 1.4 };
        if (l.elapsed - l.fieldedAt + 1e-8 >= l.hold)
          this.beginThrow(l, l.requestedBase ?? this.chooseThrow(l));
      }
      const t = l.throw;
      if (t) {
        const u = clamp((l.elapsed - t.startedAt) / t.duration, 0, 1),
          base = t.to;
        s.ball = V(
          lerp(t.from.x, base.x, u),
          lerp(1.2, 1.05, u) +
            Math.sin(Math.PI * u) * (t.kind === "toss" ? 0.7 : l.kind === "batted" ? 1.5 : 0.6),
          lerp(t.from.z, base.z, u),
        );
        if (t.wild && t.receivedAt === null && l.elapsed + 1e-8 >= t.startedAt + t.duration) {
          // Wild throw: it gets by the receiver and keeps rolling the way it was thrown.
          const batterAtFirst = t.base === 1 && t.runnerId === 0;
          this.looseBall(
            l,
            t.to,
            t.to.x - t.from.x,
            t.to.z - t.from.z,
            8 + this.rng() * 6,
            "throw",
            null,
          );
          if (batterAtFirst) l.error = true;
          return;
        }
        if (
          t.base === 0 &&
          l.elapsed + 1e-8 >= t.startedAt + t.duration &&
          t.receivedAt === null &&
          Math.hypot(l.defenders[t.receiver].x - base.x, l.defenders[t.receiver].z - base.z) < 1
        ) {
          // Relay: the cutoff man has it; he turns and throws where the play is now.
          t.receivedAt = l.elapsed;
          l.fielder = t.receiver;
          l.fielderPos = l.defenders[t.receiver];
          l.fieldedAt = l.elapsed;
          l.hold = RULES.relayHold;
          l.throw = null;
          l.relay = undefined;
          l.requestedBase = null;
          l.state = "포구";
          s.detail = "중계 플레이 · 커트맨이 받아 다시 송구";
          return;
        }
        if (
          t.base > 0 &&
          l.elapsed + 1e-8 >= t.startedAt + t.duration &&
          t.receivedAt === null &&
          Math.hypot(l.defenders[t.receiver].x - base.x, l.defenders[t.receiver].z - base.z) < 1
        ) {
          t.receivedAt = l.elapsed;
          l.state = "보유";
          // The receiver has the ball now (he may chase a runner caught off his base).
          l.fielder = t.receiver;
          l.fielderPos = l.defenders[t.receiver];
          const forced = this.forcedRunner(l, t.base),
            target = l.runners.find((x) => x.id === t.runnerId);
          // Force: the fielder's foot is on the bag with the ball before the runner's foot.
          if (
            forced &&
            t.runnerId === forced.id &&
            forced.progress < this.touchLine(forced, t.base) - 1e-12
          )
            this.retire(l, forced, t.base, "force");
          else if (target && !target.out && !this.touchingBag(l, target) && !forced)
            s.detail = (t.base === 4 ? "홈" : t.base + "루") + " 포구 · 태그!";
          else
            s.detail =
              (t.base === 4 ? "홈" : t.base + "루") + " 포구 · 베이스에 도착한 주자는 세이프";
          if (forced && t.runnerId === forced.id) this.closePlay(l, t);
          if (
            forced?.out &&
            s.outs < 3 &&
            l.throws === 1 &&
            (s.autoField || this.batting) &&
            t.base > 1
          ) {
            l.fielder = t.receiver;
            l.fielderPos = l.defenders[t.receiver];
            const relay = this.chooseThrow(l, true);
            if (relay) {
              l.fieldedAt = l.elapsed;
              // The pivot: catch, step off the bag (or away from the slide), and throw.
              l.hold = RULES.pivotHold;
              l.throw = null;
              l.requestedBase = relay;
              l.state = "포구";
            }
          }
        }
      }
    }
    if (this.runnersThink(l)) this.chaseRunners(l, dt);
    this.updateSlides(l);
    this.straddleBag(l, dt);
    this.applyTags(l);
    // A rundown tag: a moment to see it before the verdict.
    const rd = l.rundown;
    if (rd?.tagAt !== undefined && l.elapsed < rd.tagAt + RULES.tagHold) return;
    const settled = l.runners.every(runnerSettled);
    if (
      s.outs >= 3 ||
      l.elapsed > l.flightTime + 30 ||
      (settled &&
        (l.throw?.receivedAt != null ||
          (l.state === "보유" && !l.throw) ||
          // Never announce the result while the ball is still loose (safety timeout only).
          (l.fieldedAt === null && l.elapsed > l.flightTime + 15)))
    )
      this.resolvePlay();
  }
  /** Runs that count on this play, and the base each surviving runner ends on. */
  private settleRunners(l: LivePlay, cancelRuns: boolean) {
    const s = this.state,
      thirdOut = s.outs >= 3 ? l.outs.at(-1) : null;
    const scored = l.runners.filter(
      (r) =>
        !r.out && r.scoredAt !== null && !cancelRuns && (!thirdOut || r.scoredAt! < thirdOut.time),
    ).length;
    const next = [false, false, false];
    for (const r of l.runners)
      if (!r.out && r.progress >= 1 && r.progress < 4) next[Math.floor(r.progress) - 1] = true;
    s.bases = next;
    this.addRuns(scored);
    return scored;
  }
  private resolvePlay() {
    const s = this.state,
      l = s.live;
    if (!l || s.phase !== "inplay") return;
    if (l.kind !== "batted") {
      this.resolveBasePlay(l);
      return;
    }
    const thirdOut = s.outs >= 3 ? l.outs.at(-1) : null;
    const cancelRuns =
      !!thirdOut &&
      (thirdOut.force ||
        thirdOut.kind === "fly" ||
        (thirdOut.runnerId === 0 && thirdOut.base === 1));
    const scored = this.settleRunners(l, cancelRuns);
    const force = l.outs.some((o) => o.force),
      batter = l.runners[0],
      n = Math.min(4, Math.floor(batter.progress));
    const hit = !l.caughtFly && !force && n >= 1;
    if (hit && !l.error) {
      s.hits[this.batting ? 1 : 0]++;
      if (this.batting && s.mode === "match") {
        this.matchHits++;
        this.earn(
          XP.hit[Math.min(4, n)],
          n >= 4 ? "홈런" : n === 3 ? "3루타" : n === 2 ? "2루타" : "안타",
        );
      }
    }
    s.errors[this.batting ? 0 : 1] += l.miscues ?? (l.error ? 1 : 0);
    if (hit) {
      s.practice.hits++;
      s.practice.best = Math.max(s.practice.best, Math.round(distance(V(), l.land)));
    }
    this.advanceBatter();
    let message = "",
      detail = "";
    if (l.caughtFly) {
      const doubled = l.outs.find((o) => o.kind === "tag");
      message = doubled ? "DOUBLE PLAY" : "FLY OUT";
      detail = doubled
        ? `뜬공 포구 · 귀루하던 주자를 ${doubled.base}루에서 태그 · 병살`
        : l.sacrifice && scored
          ? "뜬공 포구 · 태그업으로 1득점"
          : l.runners.length > 1
            ? "땅에 닿기 전 포구 · 타자 아웃, 주자 귀루"
            : "땅에 닿기 전 포구 · 타자 아웃";
    } else if (l.outs.length >= 2) {
      message = "DOUBLE PLAY";
      detail = "연속 포스 아웃 · 병살";
    } else if (l.outs.length) {
      const out = l.outs[0];
      message = out.kind === "tag" ? "TAG OUT" : out.runnerId === 0 ? "OUT" : "FIELDER’S CHOICE";
      detail =
        (out.base === 4 ? "홈" : out.base + "루") +
        (out.kind === "tag" ? " 태그 아웃" : " 포스 아웃") +
        (out.runnerId !== 0 ? " · 타자 출루" : "");
    } else if (l.error) {
      message = "ERROR";
      detail = l.errorKind === "throw" ? "송구 실책으로 출루" : "포구 실책으로 출루";
    } else {
      message = n === 4 ? "HOME RUN" : n === 3 ? "TRIPLE" : n === 2 ? "DOUBLE" : "SINGLE";
      detail = n === 4 ? "담장을 넘겼습니다!" : n + "루타 · 주자 도착 확인";
    }
    if (l.miscues && message !== "ERROR")
      detail += l.errorKind === "throw" ? " · 송구 실책" : " · 실책";
    if (l.outs.some((o) => o.kind === "tag") && l.rundown && !l.caughtFly) {
      message = "RUNDOWN OUT";
      detail = "런다운 끝에 태그 아웃" + (scored ? ` · ${scored}점 득점` : "");
    }
    // How far it flew (a ball in the air: where it came down or was caught).
    if (!l.ground && !l.bunt) {
      const at = l.caughtFly ? l.catchPoint : l.land;
      s.lastDistance = Math.round(Math.hypot(at.x, at.z));
      detail += ` · 비거리 ${s.lastDistance} m`;
      // A home run gets its distance up big.
      if (l.resultBases === 4)
        this.callout(`비거리 ${s.lastDistance}m`, this.batting ? "gold" : "red");
    } else s.lastDistance = null;
    this.result(
      message,
      detail,
      l.outs.length ? (this.batting ? "red" : "gold") : this.batting ? "gold" : "red",
      2.3,
    );
  }
  /** Verdict of a steal, pickoff or wild-pitch play. The batter and the count stay as they are. */
  private resolveBasePlay(l: LivePlay) {
    const s = this.state,
      scored = this.settleRunners(l, false),
      out = l.outs[0],
      where = (b: number) => (b === 4 ? "홈" : b + "루"),
      call = l.call ? ` · ${l.call}` : "";
    let message = "",
      detail = "",
      good: boolean;
    if (l.kind === "pickoff") {
      message = out ? "PICKOFF OUT" : "SAFE";
      detail = out
        ? `${where(out.base)} 견제사 · 귀루보다 태그가 빨랐습니다`
        : `${where(l.throwBase)} 견제 · 주자가 먼저 귀루했습니다`;
      good = !!out !== this.batting;
    } else if (l.kind === "steal") {
      message = out ? "CAUGHT STEALING" : "STOLEN BASE";
      detail =
        `${where(l.throwBase)} 도루 ${out ? "저지 · 송구가 먼저 도착" : "성공 · 주자가 먼저 도착"}` +
        call;
      good = !out === this.batting;
    } else {
      s.lastOutcome = "WildPitch";
      message = "폭투";
      detail =
        "폭투 · 포수가 공을 놓쳤습니다 · " +
        (scored ? `${scored}점 득점 · ` : "") +
        (out
          ? `${where(out.base)} 태그 아웃`
          : l.runners.some((r) => r.progress > r.from + 1e-6)
            ? "주자 진루"
            : "주자는 베이스에 머뭅니다") +
        call;
      good = this.batting;
    }
    this.result(message, detail, good ? "gold" : "red", 2.3);
  }
  advanceRunners(n: number) {
    const s = this.state;
    let runs = 0;
    const next = [false, false, false];
    for (let i = 2; i >= 0; i--)
      if (s.bases[i]) {
        if (i + n >= 3) runs++;
        else next[i + n] = true;
      }
    if (n >= 4) runs++;
    else next[n - 1] = true;
    s.bases = next;
    this.addRuns(runs);
  }
  /** Base runners still on their bags at the start of a non-batted play, with a lead. */
  private baseRunners(lead: number, reaction: number): RunnerTrack[] {
    const s = this.state,
      pace = this.runnerPace(formOf(this.batting ? this.runnerOnFirst : this.batter).speed);
    return [1, 2, 3]
      .filter((i) => s.bases[i - 1])
      .map((i) => ({
        id: i,
        from: i,
        progress: i + lead / BASE_PATH_LENGTH,
        target: i,
        pace,
        fullPace: pace,
        delay: reaction,
        out: false,
        scoredAt: null,
      }));
  }
  /** Shared shape of the steal / pickoff / wild-pitch plays (no batted ball, no batter runner). */
  private basePlay(
    kind: LivePlay["kind"],
    fielder: number,
    runners: RunnerTrack[],
    opts: Partial<LivePlay>,
  ): LivePlay {
    const defenders = DEFENSE.map((p) => ({ ...p })),
      at = { ...defenders[fielder] };
    return {
      kind,
      hold: 0.3,
      throwSpeed: this.stageRules.throwSpeed,
      call: "",
      start: at,
      land: at,
      duration: 6,
      elapsed: 0,
      fielder,
      fielderPos: defenders[fielder],
      state: "포구",
      throwBase: 0,
      manual: false,
      quality: 0,
      resultBases: 1,
      runnerStart: [...this.state.bases],
      ground: true,
      bounced: true,
      flightTime: 0,
      height: 0,
      catchAt: 0,
      catchPoint: at,
      caughtFly: false,
      fieldedAt: 0,
      defenders,
      runners,
      throw: null,
      requestedBase: null,
      throws: 0,
      outs: [],
      error: false,
      sacrifice: false,
      ...opts,
    };
  }
  /**
   * Wild pitch: the catcher cannot hold the ball, it skips to the backstop and the runners
   * take what the catcher's chase allows. The ball's path depends on how badly it missed.
   */
  private startWildPitch(call: string) {
    const s = this.state,
      f = s.flight!,
      side = f.target.x === 0 ? (this.rng() < 0.5 ? -1 : 1) : Math.sign(f.target.x),
      reach = clamp(9 + Math.abs(f.target.x) * 9 + (0.25 - f.target.y) * 30, 8, 18),
      // It has already skipped past the catcher's glove when the play starts.
      start = V(clamp(f.target.x * 1.5, -1.2, 1.2), 0.12, -3.2),
      land = V(clamp(f.target.x + side * reach * 0.45, -16, 16), 0.12, -reach),
      runners = this.baseRunners(RULES.runnerLead, RULES.runnerReaction);
    s.stealTrack = null;
    s.lastOutcome = "WildPitch";
    const l = this.basePlay("wild", 1, runners, {
      call,
      start,
      land,
      flightTime: Math.max(0.5, distance(start, land) / 14),
      fieldedAt: null,
      state: "추적",
    });
    // Each runner (lead runner first) reads the catcher's chase: he takes a base when he
    // beats the pickup-and-throw with time to spare, a second one if the ball got far
    // enough away. A runner never passes the one ahead of him.
    const chase = this.interceptTime(l, l.defenders[1], 1) + l.hold;
    let limit = 5;
    for (const r of [...runners].sort((a, b) => b.from - a.from)) {
      let target = r.from;
      for (const base of [r.from + 1, r.from + 2]) {
        if (base > 4 || base >= limit) break;
        const throwAt = this.throwArrival(l, base, chase),
          runAt = r.delay + (base - r.progress) / r.pace;
        if (runAt + RULES.advanceMargin >= throwAt) break;
        target = base;
      }
      r.target = target;
      limit = target === 4 ? 5 : target;
    }
    s.live = l;
    s.phase = "inplay";
    s.message = "폭투";
    s.detail = "공이 포수 뒤로 빠졌습니다 · 주자 진루 시도";
    this.callout("폭투", this.batting ? "gold" : "red");
    s.resultTone = this.batting ? "gold" : "red";
    this.sound("call");
    this.emit();
  }
  /** When a throw from where the ball will be picked up reaches `base` (s from play start). */
  private throwArrival(l: LivePlay, base: number, pickup: number) {
    const bag = BASES[base - 1],
      at = this.liveBall(l, pickup),
      cover = l.defenders[this.receiver(base, l.fielder)],
      eta = Math.max(0, Math.hypot(cover.x - bag.x, cover.z - bag.z) - 0.9) / 8.2;
    return Math.max(pickup + this.throwRoute(l, at, base, l.fielder).time, eta + 0.02);
  }
  /** E-steal: the pitch reached the catcher, who throws to second. Arrival order decides. */
  private startStealThrow(call: string) {
    const s = this.state,
      stage = this.stageRules,
      runner = s.stealTrack!,
      target = runner.target,
      others = this.baseRunners(RULES.runnerLead, RULES.runnerReaction).filter(
        (r) => r.from !== runner.from,
      );
    s.stealTrack = null;
    const l = this.basePlay("steal", 1, [{ ...runner }, ...others], {
      call,
      hold:
        stage.catcherTransfer +
        this.rng() * RULES.catcherTransferGamble +
        (this.raining ? RULES.rainCatcherTransfer : 0),
      throwSpeed: stage.catcherArm * (this.raining ? RULES.rainCatcherArm : 1),
      requestedBase: target,
    });
    // The fielder covering broke for the bag when the runner went (about one delivery ago).
    const cover = l.defenders[this.receiver(target, 1)];
    this.moveFielder(cover, BASES[target - 1], 1);
    l.start = V(s.flight?.target.x ?? 0, s.flight?.target.y ?? 1, 0);
    s.ball = { ...l.fielderPos, y: 1 };
    s.live = l;
    s.phase = "inplay";
    s.message = "도루!";
    s.detail = `포수가 공을 잡자마자 ${target}루로 송구합니다`;
    s.resultTone = "neutral";
    this.emit();
  }
  /** The rival lineup's average (what counts as a fast runner or a big bat this game). */
  private rivalAverage() {
    const l = this.awayRoster.lineup.map(formOf),
      avg = (k: "contact" | "power" | "speed") => l.reduce((a, p) => a + p[k], 0) / l.length;
    return { contact: avg("contact"), power: avg("power"), speed: avg("speed") };
  }
  /**
   * Bat-only player: our own pitcher (and catcher) call the next pitch from the batter and
   * the count. A runner faster than his lineup (speed 5+ over the average) gets sinkers and
   * changeups down (grounders: their soft contact and the low spot); a big bat (contact and
   * power together 5+ over) gets breaking balls on the corners (whiffs and chases); both
   * get a mix. 3 balls: a strike; 2 strikes: a chase pitch just off the plate.
   */
  autoPitchPlan(): { pitch: PitchData; aim: Vec; note: string; mode: string } {
    const s = this.state,
      stage = this.stageRules,
      g = () => gaussian(this.rng),
      n = Math.min(AUTO_ARSENAL.length, stage.aiPitchKinds, this.awayRoster.ace.kinds + 2),
      arsenal = AUTO_ARSENAL.slice(0, Math.max(1, n)).map(pitchData),
      has = (...ids: PitchId[]) => arsenal.find((p) => ids.includes(p.id)),
      fastball = arsenal[0],
      sinkers = arsenal.filter((p) => p.soft > 0 || p.id === "changeup"),
      breaking = arsenal
        .filter((p) => p.id !== "fastball" && !sinkers.includes(p))
        .sort((a, b) => b.whiff + b.chase - (a.whiff + a.chase)),
      b = formOf(this.batter),
      avg = this.rivalAverage(),
      fast = b.speed >= avg.speed + 5,
      big = (b.contact + b.power) / 2 >= (avg.contact + avg.power) / 2 + 5,
      side = this.rng() < 0.5 ? -1 : 1,
      low = (p: PitchData | undefined, note: string) => ({
        pitch: p ?? fastball,
        aim: V(g() * 0.14, 0.64 + g() * 0.1, 0),
        note,
        mode: "ground",
      }),
      corner = (p: PitchData | undefined, note: string) => ({
        pitch: p ?? fastball,
        aim: V(side * 0.19 + g() * 0.06, 0.74 + g() * 0.14, 0),
        note,
        mode: "break",
      }),
      pickBreak = () => breaking[this.rng() < 0.65 || breaking.length < 2 ? 0 : 1];
    // Behind 3-0 / 3-1 / 3-2: get it over (the sinker still down, a fastball otherwise).
    if (s.balls === 3)
      return {
        pitch: fast ? (has("sinker", "twoseam") ?? fastball) : fastball,
        aim: V(g() * 0.09, 0.9 + g() * 0.12, 0),
        note: "볼카운트 불리 · 스트라이크 넣기",
        mode: "zone",
      };
    // Two strikes: the best chase pitch just off the plate.
    if (s.strikes === 2 && breaking.length && this.rng() < 0.75)
      return {
        pitch: breaking[0],
        aim: V(side * 0.27 + g() * 0.05, 0.5 + g() * 0.08, 0),
        note: "2스트라이크 · 유인구",
        mode: "chase",
      };
    const mode =
      fast && big ? (this.rng() < 0.5 ? "ground" : "break") : fast ? "ground" : big ? "break" : "";
    if (mode === "ground" && sinkers.length)
      return low(
        sinkers[Math.floor(this.rng() * sinkers.length)],
        fast && big ? "발 빠른 강타자 · 땅볼 유도" : "발 빠른 타자 · 땅볼 유도",
      );
    if (mode === "break" && breaking.length && this.rng() < 0.8)
      return corner(
        pickBreak(),
        fast && big ? "발 빠른 강타자 · 변화구 승부" : "강타자 · 변화구 승부",
      );
    // Otherwise mostly fastballs, mixed with the rest.
    if (this.rng() < 0.5 || arsenal.length < 2)
      return {
        pitch: fastball,
        aim: V(g() * RULES.autoPitchAim, 0.92 + g() * 0.22, 0),
        note: big ? "강타자 · 직구로 카운트 잡기" : "직구 승부",
        mode: "normal",
      };
    const other = arsenal[1 + Math.floor(this.rng() * (arsenal.length - 1))];
    return {
      pitch: other,
      aim: V(g() * RULES.autoPitchAim, 0.85 + g() * 0.2, 0),
      note: "구종 섞기",
      mode: "normal",
    };
  }
  /**
   * Bat-only player: before a pitch, our pitcher may throw over to a runner who could steal
   * (more often the faster he is, less after each throw). True when he threw.
   */
  private autoPickoff() {
    const s = this.state,
      target = this.stealTarget;
    if (s.mode !== "match" || !target || s.pickoffs >= RULES.autoPickoffMax) return false;
    const speed = formOf(this.runnerOn(target - 1)).speed,
      avg = this.rivalAverage().speed,
      chance = RULES.autoPickoff * clamp(0.4 + (speed - avg) / 20, 0.15, 1.3) * 0.5 ** s.pickoffs;
    return this.rng() < chance && this.pickoff(target - 1);
  }
  /**
   * Pickoff: instead of pitching, the pitcher throws to a base. The runner dives back from his
   * lead; the fielder tags him if the ball wins the race to the bag.
   */
  pickoff(base: number) {
    const s = this.state;
    if (
      s.mode !== "match" ||
      this.batting ||
      s.phase !== "ready" ||
      s.paused ||
      base < 1 ||
      base > 3 ||
      !s.bases[base - 1]
    )
      return false;
    // Runners who have already been thrown at this plate appearance rarely gamble again.
    const leaning = this.rng() < RULES.pickoffCaution ** s.pickoffs,
      caution = leaning ? 1 : 0.3,
      gamble = RULES.runnerLeadGamble * this.stageRules.leadGamble * caution,
      runners = this.baseRunners(RULES.runnerLead, RULES.runnerReaction);
    s.pickoffs++;
    // (Our AI pitcher's throws over do not tire the bat-only player.)
    if (!this.autoHalf)
      s.energy = clamp(
        s.energy -
          pitchEnergyCost(s.effort, this.playerStats.stamina) *
            RULES.pickoffEnergy *
            (this.raining ? RULES.rainStamina : 1),
        0,
        100,
      );
    for (const r of runners) {
      r.progress = r.from + (RULES.runnerLead + this.rng() * gamble) / BASE_PATH_LENGTH;
      // Only the runner being thrown at dives back; the others just step back to the bag.
      r.delay =
        r.from === base
          ? RULES.runnerReaction +
            this.rng() * RULES.runnerReactionGamble * this.stageRules.leadGamble * caution
          : 0.4;
    }
    const l = this.basePlay("pickoff", 0, runners, {
      hold: RULES.pickoffMove,
      throwSpeed: RULES.pickoffThrowSpeed,
      requestedBase: base,
    });
    // The first baseman holds the runner on; at second and third the fielder breaks for the
    // bag on the pitcher's sign, a moment before the throw.
    if (base === 1) Object.assign(l.defenders[2], V(BASES[0].x - 1.2, 0, BASES[0].z + 0.6));
    else this.moveFielder(l.defenders[this.receiver(base, 0)], BASES[base - 1], 0.9);
    s.flight = null;
    s.ball = { ...l.fielderPos, y: 1.6 };
    s.live = l;
    s.phase = "inplay";
    s.message = "견제!";
    s.detail = `${base}루 견제구 · 주자 귀루`;
    s.resultTone = "neutral";
    this.sound("wind");
    this.emit();
    return true;
  }
  /**
   * E: steal call for the runner on first (STEAL_READY). He breaks with the next pitch;
   * pressing again cancels. Only first → second for now.
   */
  steal() {
    const s = this.state;
    // The sign can be given before the pitch, or while the last play's result is shown.
    const between = s.phase === "result" && s.outs < 3;
    if (!this.batting || s.mode !== "match" || (s.phase !== "ready" && !between) || s.paused)
      return false;
    const target = this.stealTarget;
    if (!target) return false;
    s.stealCall = !s.stealCall;
    // Keep the result of the last play on screen; the steal button shows the sign.
    if (between) {
      this.emit();
      return true;
    }
    s.message = s.stealCall ? "도루 사인!" : "도루 취소";
    s.detail = s.stealCall
      ? `투수가 투구를 시작하면 ${target - 1}루 주자가 ${target}루로 뜁니다`
      : `${target - 1}루 주자는 그대로 대기합니다`;
    this.emit();
    return true;
  }
  next() {
    const s = this.state;
    if (s.phase !== "result") return;
    if (s.mode !== "match") {
      s.balls = 0;
      s.strikes = 0;
      s.outs = 0;
      s.bases = [false, false, false];
      this.ready();
      return;
    }
    if (s.inning >= s.maxInnings && s.half === "bottom" && s.score[1] > s.score[0]) {
      this.finish();
      return;
    }
    if (s.outs >= 3) {
      if (s.half === "top" && s.inning >= s.maxInnings && s.score[1] > s.score[0]) {
        this.finish();
        return;
      }
      if (s.half === "bottom" && s.inning >= s.maxInnings) {
        this.finish();
        return;
      }
      s.phase = "between";
      s.message = s.half === "top" ? "공수 교대 · 우리의 공격" : "공수 교대 · 마운드로";
      s.detail = "준비되면 다음 이닝을 시작하세요";
      // Rain: before every new inning (never before the first) a coin decides if play goes on.
      if (this.raining && s.half === "bottom") {
        s.coin = { result: this.rng() < RULES.rainContinue ? "go" : "cancel" };
        s.message = "빗줄기가 거세다";
        s.detail = "동전 던지기로 경기 진행 여부를 정합니다";
      }
      this.emit();
      return;
    }
    this.ready();
  }
  /** Shows a big centre-screen callout. */
  callout(text: string, tone = "gold") {
    this.flashId++;
    this.state.flash = { text, tone, id: this.flashId };
  }
  private flashId = 0;
  private fullCountKey = "";
  private ready() {
    const s = this.state;
    // 3 balls, 2 strikes: once per plate appearance, announce the full count.
    const key = `${s.inning}|${s.half}|${s.order[0]}|${s.order[1]}`;
    if (s.mode === "match" && s.balls === 3 && s.strikes === 2 && this.fullCountKey !== key) {
      this.fullCountKey = key;
      this.callout("풀카운트", "gold");
    }
    s.phase = "ready";
    s.flight = null;
    s.live = null;
    s.stealTrack = null;
    // A steal call only stands while there is still a runner on first and second is open.
    if (!this.batting || !this.stealTarget) s.stealCall = false;
    s.timer = 1.6;
    s.ball = V(0.35, 1.85, 18.44);
    s.message = this.batting ? "다음 공을 기다리세요" : "다음 승부를 준비하세요";
    s.detail = this.batting ? "조준 후 클릭 / Space 스윙" : "목표 지점을 클릭하면 투구합니다";
    s.resultTone = "neutral";
    this.emit();
  }
  continueInning() {
    const s = this.state;
    if (s.phase !== "between") return;
    if (s.coin?.result === "cancel") {
      this.rainout();
      return;
    }
    s.coin = null;
    s.bases = [false, false, false];
    s.pickoffs = 0;
    s.outs = 0;
    s.strikes = 0;
    s.balls = 0;
    if (s.half === "top") s.half = "bottom";
    else {
      s.half = "top";
      s.inning++;
      s.energy = clamp(s.energy + 4, 0, 100);
    }
    if (s.autoCamera) s.camera = this.batting ? "catcher" : "pitcher";
    this.ready();
  }
  /** Rain called the match: it ends here and counts with the current score. */
  rainout() {
    const s = this.state;
    if (s.mode !== "match" || s.phase === "finished") return;
    s.rainedOut = true;
    s.coin = null;
    this.finish();
  }
  private finish() {
    const s = this.state;
    s.phase = "finished";
    const ejected = s.ejected;
    s.message = ejected
      ? "퇴장"
      : s.rainedOut
        ? "우천취소"
        : s.score[1] > s.score[0]
          ? "VICTORY"
          : s.score[1] === s.score[0]
            ? "DRAW"
            : "GAME OVER";
    const [away, home] = this.teams;
    s.detail = `${ejected ? "파인타르 적발 · 몰수패 · 모든 능력치 −20 · " : ""}${s.rainedOut ? `${s.inning - (s.half === "bottom" ? 0 : 1)}회까지 · 현재 점수로 결과 처리 · ` : ""}${away} ${s.score[0]} : ${s.score[1]} ${home}`;
    if (!this.recorded) {
      this.recorded = true;
      const c = s.career;
      this.markDifficulty();
      c.games++;
      if (!ejected && s.score[1] > s.score[0]) c.wins++;
      c.strikeouts += this.matchStrikeouts;
      c.hits += this.matchHits;
      c.runs += this.matchRuns;
      c.outs += (s.inning - 1) * 3 + (s.half === "bottom" ? 3 : s.outs);
      // A finished match closes the day; a night's sleep restores a little energy.
      c.energy = clamp(Math.round(s.energy) + 25, 0, 100);
      c.day++;
      c.actions = DAY_ACTIONS;
      c.form = clamp(c.form - 4, 0, 100);
      // Scout gauge: every reason as its own line; caps and the pro scale are lines too, so the
      // recap always adds up to the real gain.
      const won = !ejected && s.score[1] > s.score[0],
        drew = !ejected && s.score[1] === s.score[0],
        G = RULES.gauge,
        parts: RecapLine[] = [{ label: "경기 출전", value: G.play }];
      // A strong game counts for a lot more (v12.4): strikeouts, hits, runs and a win (more
      // for a shutout), so a good player is not stuck grinding the first days.
      if (this.matchStrikeouts)
        parts.push({
          label: `탈삼진 ${this.matchStrikeouts}개`,
          value: Math.round(this.matchStrikeouts * G.strikeout),
        });
      if (s.hits[1])
        parts.push({ label: `팀 안타 ${s.hits[1]}개`, value: Math.round(s.hits[1] * G.hit) });
      if (s.score[1]) parts.push({ label: `득점 ${s.score[1]}`, value: s.score[1] * G.run });
      if (s.score[0]) parts.push({ label: `실점 ${s.score[0]}`, value: -s.score[0] * G.allowed });
      if (won) parts.push({ label: "승리", value: G.win });
      if (won && !s.score[0]) parts.push({ label: "무실점 승리", value: G.shutout });
      const raw = parts.reduce((a, p) => a + p.value, 0),
        bounded = clamp(raw, G.min, G.max);
      if (bounded !== raw)
        parts.push({
          label: bounded > raw ? `최소 보장(${G.min})` : `한 경기 최대(${G.max})`,
          value: bounded - raw,
        });
      const scaled = clamp(Math.round(bounded * this.stageRules.gaugeGain), 2, G.max);
      if (scaled !== bounded)
        parts.push({ label: `프로 기준 ×${this.stageRules.gaugeGain}`, value: scaled - bounded });
      const gain = scaled;
      const before = c.scout;
      c.scout = clamp(c.scout + gain, 0, 100);
      if (c.scout - before < gain)
        parts.push({ label: "평가 최대 100", value: c.scout - before - gain });
      s.lastScout = { before, after: c.scout };
      s.lastScoutParts = parts;
      const team = teamOf(c.team);
      // The dream comes true: the watching club offers a contract at 100.
      if (c.stage === "high" && team && c.scout >= 100 && !c.draft) {
        c.draft = `${team.city} ${team.name} 입단`;
        c.proDay ??= c.day - 1;
        c.club = team.id;
        c.history = [`${team.name} 스카우트의 입단 제의! 꿈이 이루어졌다`, ...c.history];
      }
      // Pro stage: the same gauge is the manager's trust; full trust opens the rotation.
      if (c.stage === "pro" && c.scout >= 100 && !c.proGoal && c.league !== "mlb") {
        c.proGoal = true;
        c.firstDay ??= c.day - 1;
        c.mlbScouts = Object.fromEntries(MLB_TEAMS.map((t) => [t.id, 0]));
        c.history = [`${STAGES.pro.goalReward}! 2군을 졸업하고 1군으로 올라섰다`, ...c.history];
      } else if (tierOf(c) === "first") {
        // Major-league scouts all watch the first team; each likes something different.
        // A scout at 100 waits: the player keeps playing until he signs (or turns all down).
        const scouts = c.mlbScouts ?? Object.fromEntries(MLB_TEAMS.map((t) => [t.id, 0]));
        s.lastMlb = MLB_TEAMS.map((t) => {
          const before = scouts[t.id] ?? 0,
            liked =
              t.focus === "strikeouts"
                ? this.matchStrikeouts * 1.2
                : t.focus === "wins"
                  ? won
                    ? 7
                    : drew
                      ? 2
                      : 0
                  : t.focus === "hits"
                    ? s.hits[1] * 0.9
                    : Math.max(0, 6 - s.score[0]) * 1.2,
            gain = Math.round(clamp(bounded * 0.45 + liked, 2, G.mlbMax));
          scouts[t.id] = clamp(before + gain, 0, 100);
          if (before < 100 && scouts[t.id] >= 100)
            c.history = [`${t.city} ${t.name} 스카우트가 계약 제안을 들고 기다린다`, ...c.history];
          return { id: t.id, before, after: scouts[t.id] };
        });
        c.mlbScouts = scouts;
      }
      const xpParts: RecapLine[] = [...this.xpParts].map(([label, p]) => ({
        label: `${label} ×${p.count}`,
        value: p.xp,
      }));
      xpParts.push({ label: "경기 완주", value: XP.complete });
      if (won) xpParts.push({ label: "승리", value: XP.win });
      else if (drew) xpParts.push({ label: "무승부", value: XP.draw });
      const xp = xpParts.reduce((a, p) => a + p.value, 0);
      s.lastXpParts = xpParts;
      c.xp += xp;
      s.lastXpGain = xp;
      s.detail += ` · 경험치 +${xp} XP`;
      c.history = [
        `${c.day - 1}일차 경기 · ${won ? "승리" : drew ? "무승부" : "패배"} ${s.score[1]}:${s.score[0]} · +${xp} XP · 스카우트 +${c.scout - before}`,
        ...c.history,
      ].slice(0, 12);
      this.persist();
    }
    this.emit();
  }
  resetPitch() {
    const s = this.state;
    if (s.mode === "match") {
      if (s.phase === "result") this.next();
      return;
    }
    s.balls = 0;
    s.strikes = 0;
    s.batFeedback = null;
    this.ready();
  }
  get matchActive() {
    const s = this.state;
    return (
      s.mode === "match" &&
      s.phase !== "finished" &&
      (s.pitchCount[0] + s.pitchCount[1] > 0 || s.order[0] + s.order[1] > 0 || s.phase === "windup")
    );
  }
  /** quality 0–1 comes from the training minigame (0.6 = an ordinary session). */
  train(kind: string, quality = 0.6) {
    if (this.matchActive)
      return {
        ok: false,
        message: "경기 중에는 훈련할 수 없습니다. 경기를 마치거나 연습 모드로 전환하세요.",
      };
    const s = this.state,
      c = s.career,
      options: Record<
        string,
        { cost: number; stat?: keyof Career["stats"]; gain: number; name: string }
      > = {
        bullpen: { cost: 18, stat: "control", gain: 1, name: "불펜 제구 훈련" },
        weights: { cost: 22, stat: "velocity", gain: 1, name: "하체·코어 훈련" },
        breaking: { cost: 18, stat: "movement", gain: 1, name: "변화구 그립 훈련" },
        running: { cost: 16, stat: "stamina", gain: 1, name: "장거리 러닝" },
        sprint: { cost: 16, stat: "speed", gain: 1, name: "스프린트·주루 훈련" },
        batting: { cost: 20, stat: "contact", gain: 1, name: "타격 훈련" },
        power: { cost: 22, stat: "power", gain: 1, name: "타격 파워 훈련" },
        study: { cost: 6, gain: 4, name: "영상 분석·학교 수업" },
        rest: { cost: -38, gain: 8, name: "휴식·컨디션 회복" },
      },
      o = options[kind];
    if (!o) return { ok: false, message: "알 수 없는 훈련" };
    if (c.actions <= 0)
      return {
        ok: false,
        message: "오늘 행동력을 모두 썼습니다. 경기를 치르면 다음 날로 넘어갑니다.",
      };
    if (c.energy < o.cost) return { ok: false, message: "체력이 부족합니다. 먼저 휴식하세요." };
    const cap = statCapOf(c);
    if (o.stat && c.stats[o.stat] >= cap)
      return { ok: false, message: "이미 최고 능력치입니다. 다른 훈련을 선택하세요." };
    const q = clamp(Number.isFinite(quality) ? quality : 0, 0, 1),
      grade = q >= 0.85 ? "완벽" : q >= 0.4 ? "좋음" : "아쉬움";
    if (o.stat) {
      // ×2 (×3 on easy) since v12.4. Stats stay whole numbers: the fraction is carried over
      // to the next session (`trainCarry`), so on average nothing is lost.
      const base = (q >= 0.85 ? 2 : q >= 0.4 ? 1 : 0) * this.stageRules.trainGain,
        raw = base * trainMultiplier(s.difficulty) + (base > 0 ? (c.trainCarry ?? 0) : 0);
      o.gain = Math.floor(raw + 1e-9);
      if (base > 0) c.trainCarry = raw - o.gain;
    } else if (kind === "study") o.gain = Math.round(2 + q * 4);
    c.energy = clamp(c.energy - o.cost, 0, 100);
    c.actions--;
    c.xp += kind === "rest" ? XP.rest : XP.training;
    if (o.stat) {
      const before = c.stats[o.stat];
      c.stats[o.stat] = clamp(before + o.gain, 0, cap);
      // The team grows too: TEAM_GROWTH of the rise in the player's average (7 stats).
      const rise = c.stats[o.stat] - before,
        n = Object.keys(c.stats).length;
      c.teamBoost = (c.teamBoost ?? 0) + (rise / n) * TEAM_GROWTH;
    } else c.form = clamp(c.form + o.gain, 0, 100);
    if (o.stat) c.form = clamp(c.form - 2, 0, 100);
    c.scout = clamp(c.scout + (o.stat ? 0.5 : 0), 0, 100);
    c.history = [
      `${c.day}일차 · ${o.name}${o.stat ? ` (${grade}) +${o.gain}` : ""}`,
      ...c.history,
    ].slice(0, 12);
    this.checkHiddenPitches();
    s.energy = c.energy;
    this.persist();
    this.emit();
    return {
      ok: true,
      grade,
      gain: o.gain,
      message: `${o.name} ${o.stat ? `${grade} · ${statLabel(o.stat)} +${o.gain}` : "완료"} · 남은 행동력 ${c.actions}/${DAY_ACTIONS}`,
    };
  }
  /** Starting roulette: grants one random pitch once per career. Returns the pitch or null. */
  receiveBlessing() {
    const c = this.state.career;
    if (c.blessing) return null;
    const pool = BLESSINGS.filter((b) => !c.pitches.includes(b.id));
    if (!pool.length) {
      c.blessing = "none";
      return null;
    }
    let roll = this.rng() * pool.reduce((a, b) => a + b.weight, 0);
    const pick = pool.find((b) => (roll -= b.weight) < 0) ?? pool[pool.length - 1];
    const p = PITCHES.find((p) => p.id === pick.id)!;
    c.pitches = [...c.pitches, pick.id];
    c.blessing = pick.id;
    c.history = [
      `신이 내린 ${pick.tier} · ${josa(p.name, "을를")} 손에 넣었다`,
      ...c.history,
    ].slice(0, 12);
    this.persist();
    this.emit();
    return pick.id;
  }
  chooseTeam(id: string) {
    const t = teamOf(id);
    if (!t) return false;
    this.state.career.team = id;
    this.persist();
    this.emit();
    return true;
  }
  /** Creation screen: validates the point spread, then starts the career. */
  createPlayer(name: string, stats: Career["stats"], role: Role = "two-way") {
    const keys = Object.keys(newCareer().stats) as (keyof Career["stats"])[],
      spent = keys.reduce((a, k) => a + (stats[k] - STAT_BASE), 0);
    if (
      !keys.every(
        (k) => Number.isInteger(stats[k]) && stats[k] >= STAT_BASE && stats[k] <= STAT_CAP,
      ) ||
      spent > STAT_POINTS
    )
      return { ok: false, message: "능력치 분배가 올바르지 않습니다." };
    const c = this.state.career;
    c.name = name.trim().slice(0, 12) || "나의 선수";
    c.stats = { ...stats };
    c.created = true;
    c.role = role === "pitcher" || role === "batter" ? role : "two-way";
    // The hall-of-fame board starts at the difficulty chosen here (it can only get easier).
    c.minDifficulty = this.state.difficulty;
    c.history = [`${c.name}, 고교 3학년 마지막 시즌을 시작하다.`];
    if (isLegendName(c.name)) {
      // Hidden start: every stat at 200, seven pitches, and no roulette.
      c.legend = true;
      for (const k of keys) c.stats[k] = STAGES.pro.statCap;
      c.pitches = [...LEGEND_PITCHES];
      c.blessing = "legend";
      c.history = [`??? · 히든 조건 달성 · 이도류 전설이 고교 무대에 섰다`, ...c.history];
      this.state.hiddenUnlock = "legend";
    }
    this.checkHiddenPitches();
    this.persist();
    this.emit();
    return { ok: true, message: "선수 등록 완료" };
  }
  /**
   * Developer mode: every stat to 100 or 200. 200 also lifts the stat cap to 200 for this
   * career (even in high school), so later training and reloading keep it.
   */
  devSetStats(value: 100 | 200 | 250) {
    const c = this.state.career;
    if (value === 200) c.legend = true;
    if (value === LIMITLESS_CAP) c.devCap = LIMITLESS_CAP;
    for (const k of Object.keys(c.stats) as StatKey[]) c.stats[k] = value;
    c.history = [`개발자 모드 · 모든 능력치 ${value}`, ...c.history].slice(0, 12);
    this.persist();
    this.emit();
  }
  /**
   * Developer mode: the stage's gauge to 99 (scout evaluation in high school, first-team
   * trust in the pros), so the next good match reaches the goal.
   */
  /**
   * Developer mode: the stage's gauge straight to 100, with what 100 brings: the high-school
   * contract (signing ending), promotion to the 1st team, or every MLB offer at once.
   */
  devGauge100() {
    const c = this.state.career,
      tier = tierOf(c);
    if (tier === "mlb") return false;
    if (tier === "first") c.mlbScouts = Object.fromEntries(MLB_TEAMS.map((t) => [t.id, 100]));
    else if (tier === "farm") {
      c.scout = 100;
      c.proGoal = true;
      c.firstDay ??= c.day;
      c.mlbScouts = Object.fromEntries(MLB_TEAMS.map((t) => [t.id, 0]));
    } else {
      const team = teamOf(c.team);
      if (!team) return false;
      c.scout = 100;
      if (!c.draft) {
        c.draft = `${team.city} ${team.name} 입단`;
        c.club = team.id;
        c.proDay ??= c.day;
      }
    }
    c.history = [`개발자 모드 · ${gaugeName(c)} 100`, ...c.history].slice(0, 12);
    this.persist();
    this.start("match");
    return true;
  }
  /** Developer mode: end the current season match as a 3:0 win (rewards as after a real game). */
  devWin() {
    const s = this.state;
    if (s.mode !== "match" || s.phase === "finished") this.start("match");
    Object.assign(this.state, {
      inning: this.state.maxInnings,
      half: "bottom",
      outs: 3,
      score: [0, 3],
      phase: "result",
      flight: null,
      live: null,
    });
    this.state.lines[1][this.state.maxInnings - 1] = 3;
    this.next();
    return this.state.phase === "finished";
  }
  devGauge99() {
    const c = this.state.career;
    c.scout = tierOf(c) === "first" ? 100 : 99;
    // In the first team the gauges that matter are the MLB scouts.
    if (tierOf(c) === "first") c.mlbScouts = Object.fromEntries(MLB_TEAMS.map((t) => [t.id, 99]));
    c.history = [`개발자 모드 · ${gaugeName(c)} 99`, ...c.history].slice(0, 12);
    this.persist();
    this.emit();
  }
  /** Today's weather as the daily screen forecasts it (always clear with rain turned off). */
  get forecast(): Weather {
    return this.state.rainOn ? weatherOf(this.state.career) : "clear";
  }
  /** Settings: turn rain on or off. Off also stops the rain in the current match. */
  setRain(on: boolean) {
    const s = this.state;
    s.rainOn = on;
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(RAIN_KEY, on ? "on" : "off");
    } catch {}
    if (!on) {
      s.weather = "clear";
      s.coin = null;
    } else if (s.mode === "match" && !this.matchActive) s.weather = weatherOf(s.career);
    this.emit();
  }
  /** Developer mode: make it rain on this match now (a new match if the last one is over). */
  devRain() {
    if (this.state.mode !== "match" || this.state.phase === "finished") this.start("match");
    const s = this.state;
    s.weather = "rain";
    this.log("개발자 모드 · 비가 내리기 시작했다");
    this.emit();
    return true;
  }
  /** Rain is falling on this season match. */
  get raining() {
    return this.state.mode === "match" && this.state.weather === "rain";
  }
  /** Cheer is lowering the rivals this inning. */
  get cheerActive() {
    const s = this.state;
    return s.mode === "match" && s.cheerInning > 0 && s.cheerInning === s.inning;
  }
  /** Limit break is on this inning. */
  get limitActive() {
    const s = this.state;
    if (s.mode !== "match") return false;
    // Armed: waiting for the next pitch. Then it lasts for that one pitch (and the play it
    // makes) only; the next pitch is back to normal.
    return (
      s.limitArmed ||
      (!!s.flight?.limit && s.phase !== "ready" && s.phase !== "between" && s.phase !== "finished")
    );
  }
  /** Stamina the next limit break costs (0 while free uses remain). */
  get limitCost() {
    return this.state.limitUsed >= RULES.limitBreakFree ? RULES.limitBreakEnergy : 0;
  }
  /** Limit break is unlocked: every stat of the player's role at 250 (a bat-only player
   * needs only the batting stats, a pitch-only player only the pitching ones). */
  get canLimitBreak() {
    const st = this.state.career.stats;
    return ROLE_STATS[this.role].every((k) => (st[k] ?? 0) >= LIMITLESS_CAP);
  }
  /** The player's role (career creation, fixed). Older careers pitch and bat. */
  get role(): Role {
    const r = this.state.career.role;
    return r === "pitcher" || r === "batter" ? r : "two-way";
  }
  /** This half of a match is played by the AI while the player watches (pitch-only player
   * at bat, bat-only player in the field). */
  get autoHalf() {
    const s = this.state;
    if (s.mode !== "match") return false;
    return this.role === "pitcher" ? this.batting : this.role === "batter" ? !this.batting : false;
  }
  /** The player's stats as the game uses them right now (300 across the board in a limit break). */
  get playerStats(): Career["stats"] {
    const s = this.state,
      st0 = s.career.stats;
    // Pine tar: grip and spin, every pitching rating +20 (skill V, this match).
    const st =
      s.pineTar && s.mode === "match"
        ? {
            ...st0,
            velocity: st0.velocity + PINE_TAR_BOOST,
            control: st0.control + PINE_TAR_BOOST,
            movement: st0.movement + PINE_TAR_BOOST,
          }
        : st0;
    if (!this.limitActive) return st;
    return Object.fromEntries(Object.keys(st).map((k) => [k, LIMIT_BREAK])) as Career["stats"];
  }
  /** A rival player while our cheer squad is at work: every rating −15. */
  cheered(p: Player): Player {
    return this.cheerActive
      ? {
          ...p,
          contact: p.contact - CHEER_DROP,
          power: p.power - CHEER_DROP,
          eye: p.eye - CHEER_DROP,
          speed: p.speed - CHEER_DROP,
        }
      : p;
  }
  /** T: our cheerleaders and fans rattle the rivals for one inning. Once per match, pros only. */
  cheer() {
    const s = this.state;
    if (s.mode !== "match" || s.career.stage !== "pro" || s.cheerUsed || s.phase === "finished")
      return false;
    s.cheerUsed = true;
    s.cheerInning = s.inning;
    this.log(`${s.inning}회 · 응원단과 팬들의 함성! 상대 능력치 −${CHEER_DROP}`);
    this.sound("hit");
    this.emit();
    return true;
  }
  /**
   * G: limit break for the very next pitch (pitching or batting): every stat 300 for that one
   * pitch and its play. Needs every stat at 250. Three free uses a match, then stamina −25 each.
   */
  limitBreak() {
    const s = this.state;
    if (
      s.mode !== "match" ||
      // Only for a pitch or swing of the player's own (not while the AI plays this half).
      this.autoHalf ||
      !this.canLimitBreak ||
      this.limitActive ||
      (s.phase !== "ready" && s.phase !== "between")
    )
      return false;
    const cost = this.limitCost;
    if (s.energy < cost) return false;
    s.energy -= cost;
    s.limitUsed++;
    s.limitArmed = true;
    this.log(
      `한계 돌파 ${s.limitUsed}회째${cost ? ` · 체력 −${cost}` : " · 무료"} · 다음 1구 모든 능력치 ${LIMIT_BREAK}`,
    );
    this.sound("hit");
    this.emit();
    return true;
  }
  /**
   * Hidden skill V: pine tar for the rest of this match, velocity/control/movement +20. Every
   * pitch then has a RULES.pineTarCatch chance that the umpire checks the ball (ejection).
   */
  applyPineTar() {
    const s = this.state;
    if (
      !s.career.pineTar ||
      s.mode !== "match" ||
      s.pineTar ||
      s.ejected ||
      (s.phase !== "ready" && s.phase !== "between")
    )
      return false;
    s.pineTar = true;
    this.log(`파인타르를 몰래 발랐다 · 구속·구위·제구 +${PINE_TAR_BOOST} (심판 주의)`);
    this.callout("파인타르", "gold");
    this.emit();
    return true;
  }
  /** The umpire finds the pine tar: ejected (match lost), every stat −20, title 「불명예」. */
  private ejectForPineTar() {
    const s = this.state,
      c = s.career;
    s.ejected = true;
    s.pineTar = false;
    for (const k of Object.keys(c.stats) as StatKey[])
      c.stats[k] = Math.max(1, c.stats[k] - PINE_TAR_PENALTY);
    c.dishonor = true;
    c.history = [
      `심판이 파인타르를 적발 · 퇴장 · 모든 능력치 −${PINE_TAR_PENALTY}`,
      ...c.history,
    ].slice(0, 12);
    this.log("심판이 공을 검사했다 · 파인타르 적발 · 퇴장!");
    this.callout("퇴장!", "red");
    this.sound("out");
    this.finish();
  }
  /** Hidden: three wrong developer passwords in a row teach the pine tar trick (once). */
  grantPineTar() {
    const c = this.state.career;
    if (c.pineTar) return false;
    c.pineTar = true;
    this.state.hiddenUnlock = "pinetar";
    c.history = ["누군가 몰래 파인타르 한 통을 건넸다", ...c.history].slice(0, 12);
    this.persist();
    this.emit();
    return true;
  }
  /** Turned the pine tar down: no skill (three more wrong passwords offer it again). */
  declinePineTar() {
    const c = this.state.career;
    if (this.state.hiddenUnlock !== "pinetar") return false;
    c.pineTar = false;
    this.state.hiddenUnlock = null;
    c.history = ["건네받은 파인타르를 돌려줬다 · 정정당당하게", ...c.history].slice(0, 12);
    this.persist();
    this.emit();
    return true;
  }
  /** MLB clubs whose scout has reached 100 (contract offers on the table). */
  get mlbOffers() {
    const c = this.state.career;
    return tierOf(c) === "first" && !c.limitless
      ? MLB_TEAMS.filter((t) => (c.mlbScouts?.[t.id] ?? 0) >= 100)
      : [];
  }
  /** Sign with an MLB club whose scout reached 100: hard mode, endless play. */
  signMlb(id: string) {
    const c = this.state.career,
      t = mlbTeamOf(id);
    if (!t || !this.mlbOffers.includes(t) || this.matchActive) return false;
    c.league = "mlb";
    c.mlbDay ??= c.day;
    c.mlbClub = t.id;
    // New club, new teammates: the team growth and the batting order start again.
    c.teamBoost = 0;
    delete c.battingOrder;
    c.history = [`${t.city} ${t.name}와 계약! MLB 하드 모드가 시작된다`, ...c.history].slice(0, 12);
    this.persist();
    this.start("match");
    return true;
  }
  /** Every MLB scout at 100 and all turned down: stay home, stat cap 250 (for the player only). */
  refuseMlb() {
    const c = this.state.career;
    if (tierOf(c) !== "first" || c.limitless || this.mlbOffers.length < MLB_TEAMS.length)
      return false;
    c.limitless = true;
    c.history = [
      `MLB의 모든 제안을 거절했다 · 한계가 사라진다 (능력치 상한 ${LIMITLESS_CAP})`,
      ...c.history,
    ].slice(0, 12);
    this.persist();
    this.emit();
    return true;
  }
  /**
   * Adds any hidden pitch whose secret condition the current stats meet. Once learned it
   * stays, even if the stats change later. Returns the newly unlocked pitch or null.
   */
  checkHiddenPitches(): PitchId | null {
    const c = this.state.career;
    let found: PitchId | null = null;
    for (const h of HIDDEN_UNLOCKS) {
      if (c.pitches.includes(h.id) || !h.test(c.stats)) continue;
      c.pitches = [...c.pitches, h.id];
      c.history = [
        `??? · 히든 구종 ${josa(pitchData(h.id).name, "을를")} 깨우쳤다`,
        ...c.history,
      ].slice(0, 12);
      found = h.id;
    }
    if (found) this.state.hiddenUnlock = found;
    return found;
  }
  clearHiddenUnlock() {
    this.state.hiddenUnlock = null;
    this.emit();
  }
  /** Developer mode: learn every pitch (hidden ones too) without spending XP. */
  devUnlockPitches() {
    const c = this.state.career;
    c.pitches = ALL_PITCHES.map((p) => p.id);
    if (!c.blessing) c.blessing = "none";
    c.history = ["개발자 모드 · 모든 구종 열기", ...c.history].slice(0, 12);
    this.persist();
    this.emit();
  }
  resetCareer() {
    this.state.career = newCareer();
    this.persist();
    this.start("match");
  }
  buyPitch(id: PitchId) {
    const c = this.state.career,
      p = PITCHES.find((p) => p.id === id);
    if (!p) return { ok: false, message: "알 수 없는 구종" };
    if (c.pitches.includes(id)) return { ok: false, message: "이미 익힌 구종입니다." };
    if (c.xp < p.cost)
      return { ok: false, message: `경험치가 ${p.cost - c.xp} XP 부족합니다. 경기를 더 치르세요.` };
    c.xp -= p.cost;
    c.pitches = [...c.pitches, id];
    c.history = [`${c.day}일차 · 새 구종 ${p.name} 습득 (−${p.cost} XP)`, ...c.history].slice(
      0,
      12,
    );
    this.persist();
    this.emit();
    return { ok: true, message: `${josa(p.name, "을를")} 익혔습니다! 투구 플랜에서 선택하세요.` };
  }
  rename(name: string) {
    const n = name.trim().slice(0, 12);
    if (!n) return false;
    this.state.career.name = n;
    this.persist();
    this.emit();
    return true;
  }
  /**
   * After the signing ending: the same player continues on the pro stage. Pro mode stays
   * unlocked in the save; the gauge now measures the manager's trust (new goal).
   */
  enterPro() {
    const c = this.state.career,
      club = teamOf(c.club);
    if (!club || this.matchActive) return false;
    if (c.stage === "pro") return true;
    c.stage = "pro";
    // New club, new teammates: the team growth starts again from zero (and the order).
    c.teamBoost = 0;
    delete c.battingOrder;
    c.proUnlocked = true;
    c.proGoal = false;
    c.scout = 30;
    c.energy = 100;
    c.actions = DAY_ACTIONS;
    c.history = [
      `${club.city} ${club.name} 입단식 · 프로 무대 데뷔를 준비하다`,
      ...c.history,
    ].slice(0, 12);
    this.persist();
    this.start("match");
    return true;
  }
  draft() {
    const c = this.state.career;
    if (c.stage === "pro") return { ok: false, message: "이미 프로 무대에서 뛰고 있습니다." };
    if (c.games < 3)
      return { ok: false, message: "스카우트가 평가하려면 공식 경기 3회가 필요합니다." };
    if (c.draft) return { ok: false, message: "이번 시즌의 진로가 이미 결정되었습니다." };
    c.draft = c.scout >= 65 ? "프로 구단 지명" : c.scout >= 42 ? "육성선수 계약" : "대학 진학";
    c.history = [`시즌 결산 · ${c.draft}`, ...c.history].slice(0, 12);
    this.persist();
    this.emit();
    return { ok: true, message: c.draft };
  }
}
