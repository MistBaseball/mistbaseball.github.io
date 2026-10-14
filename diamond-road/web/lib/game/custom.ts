/**
 * Customizing. Two kinds, kept apart on purpose:
 *  - Look (the player's own: uniform colour, skin tone, height, build): saved in the career
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
};
export const DEFAULT_LOOK: Look = { uniform: "", skin: 2, height: 2, build: 2 };

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
  };
}
export const isDefaultLook = (l: Look) =>
  l.uniform === "" &&
  l.skin === DEFAULT_LOOK.skin &&
  l.height === DEFAULT_LOOK.height &&
  l.build === DEFAULT_LOOK.build;

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
