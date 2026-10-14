/**
 * Customizing. Two kinds, kept apart on purpose:
 *  - Look (the player's own: uniform colour, skin tone, height, build, and the skins bought
 *    with XP: uniform pattern, ball, bat): saved in the career
 *    (`Career.look`, optional) and sent along in a versus match so the other player sees it.
 *  - Stage (the viewer's own taste: grass, clay, time of day, ball colour): kept in this
 *    browser only (`diamond-road-stage-v1`), never sent and never part of a save code.
 * No imports, so the rule checks can load it.
 */

export type Look = {
  /** "#rrggbb", or "" for the club's own cream. */
  uniform: string;
  /** Index into SKIN_TONES (2 = as modelled). */
  skin: number;
  /** Index into HEIGHTS (2 = as modelled). */
  height: number;
  /** Index into BUILDS (2 = as modelled). */
  build: number;
  /** Bought skins: uniform pattern id ("" none), the pattern's second colour, ball, bat. */
  pattern: string;
  trim: string;
  ball: string;
  bat: string;
};
export const DEFAULT_TRIM = "#ffffff";
export const DEFAULT_LOOK: Look = {
  uniform: "",
  skin: 2,
  height: 2,
  build: 2,
  pattern: "",
  trim: DEFAULT_TRIM,
  ball: "",
  bat: "",
};

/** Skins sold for XP. A 3-inning match gives about 110 XP, so 300 XP is a few matches. */
export type SkinKind = "pattern" | "ball" | "bat" | "tool";
export type Skin = {
  id: string;
  kind: SkinKind;
  name: string;
  /** 1 common, 2 rare, 3 legendary, 4 mythic. */
  tier: 1 | 2 | 3 | 4;
  cost: number;
  note: string;
  /** Moves by itself (colours change over time). */
  anim?: boolean;
};
export const TIER_NAMES = ["", "일반", "희귀", "전설", "신화"] as const;
export const SKINS: readonly Skin[] = [
  { id: "stripes", kind: "pattern", name: "세로줄", tier: 1, cost: 300, note: "가는 세로 줄무늬" },
  { id: "band", kind: "pattern", name: "가로 띠", tier: 1, cost: 300, note: "가는 가로 띠" },
  { id: "check", kind: "pattern", name: "체크", tier: 1, cost: 300, note: "바둑판 무늬" },
  { id: "twotone", kind: "pattern", name: "투톤 소매", tier: 2, cost: 800, note: "소매만 다른 색" },
  { id: "dots", kind: "pattern", name: "물방울", tier: 2, cost: 800, note: "동그란 무늬" },
  { id: "fade", kind: "pattern", name: "그라데이션", tier: 2, cost: 800, note: "아래에서 위로 색이 번져요" },
  { id: "aurora", kind: "pattern", name: "오로라", tier: 3, cost: 1500, note: "두 색이 물결처럼 움직여요", anim: true },
  { id: "rainbow", kind: "pattern", name: "무지개", tier: 4, cost: 3300, note: "무지개 색으로 계속 바뀌어요", anim: true },
  { id: "glow", kind: "ball", name: "야광볼", tier: 2, cost: 800, note: "연둣빛으로 빛나는 공" },
  { id: "gold", kind: "ball", name: "황금볼", tier: 2, cost: 800, note: "반짝이는 금색 공" },
  { id: "flame", kind: "ball", name: "불꽃볼", tier: 3, cost: 1500, note: "불타듯 깜빡이는 공", anim: true },
  { id: "rainbowball", kind: "ball", name: "무지개볼", tier: 3, cost: 1500, note: "색이 계속 바뀌는 공", anim: true },
  { id: "ebony", kind: "bat", name: "흑단 배트", tier: 1, cost: 300, note: "검은 배트" },
  { id: "redbat", kind: "bat", name: "빨강 배트", tier: 1, cost: 300, note: "빨간 배트" },
  { id: "bluebat", kind: "bat", name: "파랑 배트", tier: 1, cost: 300, note: "파란 배트" },
  { id: "whitebat", kind: "bat", name: "흰 배트", tier: 1, cost: 300, note: "하얀 배트" },
  { id: "goldbat", kind: "bat", name: "황금 배트", tier: 2, cost: 800, note: "금속 느낌의 금색 배트" },
  { id: "rainbowbat", kind: "bat", name: "무지개 배트", tier: 3, cost: 1500, note: "색이 계속 바뀌는 배트", anim: true },
  { id: "picker", kind: "tool", name: "색 고르기", tier: 2, cost: 600, note: "그림판처럼 유니폼·무늬 색을 마음대로 골라요" },
];
export const skinOf = (id: string) => SKINS.find((s) => s.id === id);
export const skinsOf = (kind: SkinKind) => SKINS.filter((s) => s.kind === kind);

/** Look of the ball and bat skins (colour factors on the ball; plain colours on bats). */
export const BALL_STYLE: Record<string, { color: [number, number, number]; emissive: string; glow: number; anim?: "rainbow" | "pulse" }> = {
  glow: { color: [0.85, 1.2, 0.55], emissive: "#8dff3a", glow: 0.95 },
  gold: { color: [1.3, 1.05, 0.38], emissive: "#a47c1a", glow: 0.55 },
  flame: { color: [1.3, 0.55, 0.3], emissive: "#ff5a1a", glow: 0.9, anim: "pulse" },
  rainbowball: { color: [1, 1, 1], emissive: "#ffffff", glow: 0.6, anim: "rainbow" },
};
export const BAT_STYLE: Record<string, { color: string; metal?: boolean; anim?: boolean }> = {
  ebony: { color: "#1e1e22" },
  redbat: { color: "#b02a2a" },
  bluebat: { color: "#2a4fb0" },
  whitebat: { color: "#ecebe6" },
  goldbat: { color: "#d8ac2c", metal: true },
  rainbowbat: { color: "#ffffff", anim: true },
};
/** Rainbow colour (linear 0..1) at time `t` (cycles every 1). */
export function rainbowRGB(t: number): [number, number, number] {
  const k = (n: number) => 0.5 + 0.5 * Math.cos(2 * Math.PI * (t + n));
  return [k(0), k(1 / 3), k(2 / 3)];
}
/** Colours anyone may use without the colour picker: the preset swatches and plain white. */
export const isPresetColor = (c: string) =>
  c === "" || c === DEFAULT_TRIM || UNIFORM_COLORS.some((u) => u.color === c);

export const UNIFORM_COLORS = [
  { color: "", label: "크림 (기본)" },
  { color: "#c8382f", label: "빨강" },
  { color: "#e07a2e", label: "주황" },
  { color: "#e3b72c", label: "노랑" },
  { color: "#3f9a55", label: "초록" },
  { color: "#2f8f9c", label: "청록" },
  { color: "#2f5fb8", label: "파랑" },
  { color: "#7a45b5", label: "보라" },
  { color: "#d4577f", label: "분홍" },
  { color: "#6f6f78", label: "회색" },
  { color: "#222831", label: "검정" },
  { color: "#f4f4f2", label: "흰색" },
] as const;
/** Brightness factors on the body texture (skin and hair together). */
export const SKIN_TONES = [
  { f: 1.18, label: "아주 밝게" },
  { f: 1.08, label: "밝게" },
  { f: 1, label: "기본" },
  { f: 0.84, label: "어둡게" },
  { f: 0.68, label: "아주 어둡게" },
] as const;
export const HEIGHTS = [
  { f: 0.92, label: "작게" },
  { f: 0.96, label: "조금 작게" },
  { f: 1, label: "기본" },
  { f: 1.04, label: "조금 크게" },
  { f: 1.08, label: "크게" },
] as const;
export const BUILDS = [
  { f: 0.88, label: "아주 마른" },
  { f: 0.94, label: "마른" },
  { f: 1, label: "기본" },
  { f: 1.07, label: "탄탄한" },
  { f: 1.14, label: "듬직한" },
] as const;

const idx = (v: unknown, n: number, d: number) => {
  const k = Math.round(Number(v));
  return Number.isFinite(k) && k >= 0 && k < n ? k : d;
};
/** A look from anything (a save, a message from the other player): valid fields only. */
export function cleanLook(x: unknown): Look {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  return {
    uniform:
      typeof o.uniform === "string" && /^#[0-9a-fA-F]{6}$/.test(o.uniform)
        ? o.uniform.toLowerCase()
        : "",
    skin: idx(o.skin, SKIN_TONES.length, DEFAULT_LOOK.skin),
    height: idx(o.height, HEIGHTS.length, DEFAULT_LOOK.height),
    build: idx(o.build, BUILDS.length, DEFAULT_LOOK.build),
    pattern: kindId(o.pattern, "pattern"),
    trim:
      typeof o.trim === "string" && /^#[0-9a-fA-F]{6}$/.test(o.trim)
        ? o.trim.toLowerCase()
        : DEFAULT_TRIM,
    ball: kindId(o.ball, "ball"),
    bat: kindId(o.bat, "bat"),
  };
}
const kindId = (v: unknown, kind: SkinKind) =>
  typeof v === "string" && SKINS.some((s) => s.id === v && s.kind === kind) ? v : "";
export const isDefaultLook = (l: Look) =>
  l.uniform === "" &&
  l.skin === DEFAULT_LOOK.skin &&
  l.height === DEFAULT_LOOK.height &&
  l.build === DEFAULT_LOOK.build &&
  l.pattern === "" &&
  l.ball === "" &&
  l.bat === "";

export type Stage = { grass: number; clay: number; time: number; ball: number };
export const DEFAULT_STAGE: Stage = { grass: 0, clay: 0, time: 0, ball: 0 };
export const GRASS = [
  { tint: [1, 1, 1], label: "기본" },
  { tint: [0.8, 0.96, 0.82], label: "진한 초록" },
  { tint: [1.12, 1.08, 0.78], label: "연두" },
  { tint: [1.22, 0.98, 0.7], label: "가을 들판" },
] as const;
export const CLAY = [
  { tint: [1, 1, 1], label: "기본" },
  { tint: [1.18, 0.82, 0.66], label: "붉은 흙" },
  { tint: [0.84, 0.85, 0.9], label: "회갈색" },
  { tint: [1.22, 1.16, 1.04], label: "밝은 모래" },
] as const;
export const BALLS = [
  { tint: [1, 1, 1], label: "흰색" },
  { tint: [1, 0.93, 0.35], label: "노랑" },
  { tint: [1, 0.6, 0.25], label: "주황" },
  { tint: [1, 0.58, 0.78], label: "분홍" },
] as const;
/** Clear-weather light and sky (rain always uses its own). */
export const TIMES = [
  { label: "노을 (기본)", bg: "#c9d6dc", fog: "#d4d9d4", sky: "#ffffff", sun: "#ffe2bf", sunI: 3.4, hemi: 1.15, exposure: 1.05 },
  { label: "한낮", bg: "#a9cfee", fog: "#cfe2ee", sky: "#dff0ff", sun: "#fff6e8", sunI: 4.1, hemi: 1.35, exposure: 1.1 },
  { label: "해질녘", bg: "#9b8590", fog: "#a89098", sky: "#e8a98c", sun: "#ff9a5c", sunI: 2.6, hemi: 0.85, exposure: 0.98 },
  { label: "밤", bg: "#0f1828", fog: "#1b2536", sky: "#3a4a72", sun: "#a9bcff", sunI: 1.5, hemi: 0.75, exposure: 1 },
] as const;

export function cleanStage(x: unknown): Stage {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  return {
    grass: idx(o.grass, GRASS.length, 0),
    clay: idx(o.clay, CLAY.length, 0),
    time: idx(o.time, TIMES.length, 0),
    ball: idx(o.ball, BALLS.length, 0),
  };
}

const STAGE_KEY = "diamond-road-stage-v1";
function readStage(): Stage {
  try {
    if (typeof localStorage !== "undefined")
      return cleanStage(JSON.parse(localStorage.getItem(STAGE_KEY) ?? "null"));
  } catch {
    /* private mode or broken value */
  }
  return { ...DEFAULT_STAGE };
}
let stage: Stage | null = null;
const listeners = new Set<() => void>();
/** The viewer's stage taste (one object; a new one after each change). */
export const getStage = (): Stage => (stage ??= readStage());
export function setStage(p: Partial<Stage>) {
  stage = cleanStage({ ...getStage(), ...p });
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STAGE_KEY, JSON.stringify(stage));
  } catch {
    /* private mode: lasts for this visit */
  }
  listeners.forEach((l) => l());
}
export const subscribeStage = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
