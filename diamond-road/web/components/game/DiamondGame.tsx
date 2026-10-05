"use client";
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  Target,
  Crosshair,
  Trophy,
  Dumbbell,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Settings2,
  ChevronRight,
  ArrowUpRight,
  RotateCcw,
  Shield,
  Zap,
  Activity,
  BookOpen,
  Moon,
  Flag,
  Camera as CameraIcon,
  MousePointer2,
  Wind,
  Medal,
  Check,
  UserRound,
  Maximize2,
  Lock,
  CalendarDays,
  Sparkles,
  Footprints,
} from "lucide-react";
import { TrainingMinigame, TRAINING_GAMES } from "@/components/game/Minigames";
import { PatchNotesButton } from "@/components/game/PatchNotes";
import { HallOfFameButton, HofResetForm } from "@/components/game/HallOfFame";
import { CloudSave, pullCareer, syncCareer } from "@/components/game/CloudSave";
import { AiLab } from "@/components/game/AiLab";
import { Sfx } from "@/lib/game/sound";
import { AI_LEVELS, applyLevel } from "@/lib/ai/levels";
import { saveCode } from "@/lib/cloud-save";
import { GuideDialog, GuideNotice } from "@/components/game/Guide";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Toaster, toast } from "sonner";
import {
  BaseballEngine,
  PITCHES,
  ALL_PITCHES,
  HIDDEN_PITCHES,
  isHiddenPitch,
  SWING_GOOD,
  SWING_SWEET,
  BLESSINGS,
  DAY_ACTIONS,
  STAT_BASE,
  STAT_CAP,
  STAT_POINTS,
  TEAMS,
  teamOf,
  batReach,
  controlSpread,
  clamp,
  pitchMovement,
  swingWindow,
  matchTeams,
  STAGES,
  statCapOf,
  LEGEND_PITCHES,
  formOf,
  tierOf,
  TIER_NAMES,
  TIER_RATINGS,
  gaugeName,
  MLB_TEAMS,
  mlbTeamOf,
  LIMITLESS_CAP,
  LIMIT_BREAK,
  PINE_TAR_BOOST,
  PINE_TAR_PENALTY,
  CHEER_DROP,
  RULES,
  isDecisive,
  weatherOf,
  STAT_NAMES,
  STAT_INFO,
  HOME_LINEUP,
  playerLabel,
  type RecapLine,
  fastballSpeed,
  josa,
  type StatKey,
  type GameState,
  type Difficulty,
  type Role,
  DIFFICULTIES,
  type Mode,
  type Camera,
  type Career,
} from "@/lib/game/engine";
import type { BaseballField } from "@/lib/game/field";
import type { SoftwareField } from "@/lib/game/software-field";

/**
 * The physical key as a lowercase letter/digit. With Korean input on, e.key is "ㄷ" for E and
 * "ㄹ" for F, so shortcuts read the key position (e.code) instead of the typed character.
 */
const keyOf = (e: KeyboardEvent) => {
  const letter = /^Key([A-Z])$/.exec(e.code),
    digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  if (letter) return letter[1].toLowerCase();
  if (digit) return digit[1];
  if (e.code === "Space") return " ";
  if (e.code === "Minus" || e.code === "NumpadSubtract") return "-";
  if (e.code === "Equal") return "=";
  if (e.code === "BracketLeft") return "[";
  if (e.code === "BracketRight") return "]";
  if (e.code === "Semicolon") return ";";
  if (e.code === "Quote") return "'";
  return e.key.toLowerCase();
};
const cameras: { id: Camera; label: string }[] = [
  { id: "pitcher", label: "투수" },
  { id: "catcher", label: "포수" },
  { id: "broadcast", label: "중계" },
  { id: "ball", label: "타구" },
  { id: "top", label: "탑뷰" },
];
const modes: { id: Mode; label: string; sub: string }[] = [
  { id: "match", label: "시즌 경기", sub: "투구 + 타격 · XP 획득" },
  { id: "bullpen", label: "불펜", sub: "투구 연습" },
  { id: "batting", label: "배팅 케이지", sub: "타격 연습" },
];
const statNames = STAT_NAMES;
/** Speed readout colour tier and label, so fast and slow pitches read differently at a glance. */
const speedTier = (kmh: number) =>
  !kmh
    ? { cls: "", label: "" }
    : kmh >= 160
      ? { cls: "blazing", label: "초강속구" }
      : kmh >= 145
        ? { cls: "fast", label: "강속구" }
        : kmh < 115
          ? { cls: "slow", label: "느린 공" }
          : { cls: "", label: "" };
/** Plain-word strengths and costs of a pitch, read from its data. */
const pitchTraits = (p: (typeof PITCHES)[number]) =>
  [
    p.whiff >= 0.12
      ? { text: "헛스윙 유도 강함", good: true }
      : p.whiff >= 0.09 && { text: "헛스윙 유도", good: true },
    p.soft >= 0.05 && { text: "땅볼·약한 타구 유도", good: true },
    p.soft > 0 && p.soft < 0.05 && { text: "약한 타구 유도", good: true },
    p.control >= 1.15 && { text: "제구 어려움", good: false },
    p.control > 1 && p.control < 1.15 && { text: "제구 약간 어려움", good: false },
    p.stamina >= 1.1 && { text: "체력 소모 큼", good: false },
    p.stamina < 1 && { text: "체력 소모 적음", good: true },
    !!p.flutter && { text: "예측 불가 흔들림", good: true },
    isDecisive(p) && { text: `결정구 · AI 타자 컨택 −${RULES.decisiveContactDrop}`, good: true },
    p.wild >= 1.2 && { text: "폭투 위험", good: false },
  ].filter(Boolean) as { text: string; good: boolean }[];
/** A stat's live effect, e.g. "138 km/h", from the same formula the game uses. */
const statMetric = (k: StatKey, v: number) => {
  const i = STAT_INFO[k],
    n = i.metric(v);
  return `${i.digits ? n.toFixed(i.digits) : Math.round(n)}${i.unit ? " " + i.unit : ""}`;
};
/** How much one more point changes the effect, e.g. "+0.4 km/h" or "−0.2 cm". */
const statStep = (k: StatKey, v: number) => {
  const i = STAT_INFO[k],
    d = i.metric(v + 1) - i.metric(v),
    digits = Math.abs(d) < 0.95 ? (Math.abs(d) < 0.095 ? 2 : 1) : 0;
  return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(digits)}${i.unit ? " " + i.unit : ""}`;
};
/**
 * Training page: what every stat does, with its current value and live in-game effect, so the
 * player can see what a training session will actually change.
 */
function StatGuide({ c }: { c: Career }) {
  const cap = statCapOf(c);
  return (
    <section className="stat-guide" aria-labelledby="stat-guide-title">
      <header>
        <h2 id="stat-guide-title">내 능력치와 효과</h2>
        <p>
          숫자는 지금 능력치로 게임에서 실제로 쓰이는 값입니다. 훈련으로 1 오를 때마다 오른쪽처럼
          바뀝니다. 최대 {cap}
          {c.stage === "pro" || c.legend ? "" : " (프로에 가면 200까지)"}.
        </p>
      </header>
      <ol>
        {(Object.keys(STAT_INFO) as StatKey[]).map((k) => {
          const i = STAT_INFO[k],
            v = c.stats[k];
          return (
            <li key={k} className={`stat-row role-${i.role === "투구" ? "pitch" : "bat"}`}>
              <div className="stat-name">
                <span className="stat-role">{i.role}</span>
                <strong>{statNames[k]}</strong>
                <b>{v}</b>
                <Progress value={(v / cap) * 100} aria-label={`${statNames[k]} ${v}`} />
              </div>
              <p className="stat-what">{i.what}</p>
              <div className="stat-effect">
                <span>{i.label}</span>
                <strong>{statMetric(k, v)}</strong>
                <small>{v >= cap ? "최대치에 도달" : `+1마다 ${statStep(k, v)}`}</small>
                <em>{i.training} 훈련으로 상승</em>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Field({
  engine,
  frozen = false,
  speed = 1,
}: {
  engine: BaseballEngine;
  frozen?: boolean;
  /** Fast-forward while the AI plays the player's off half (role modes). */
  speed?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  // Frozen (AI training ground open on top): the match waits and the field is not drawn.
  const still = useRef(frozen);
  still.current = frozen;
  const fast = useRef(speed);
  fast.current = speed;
  const [error, setError] = useState("");
  useEffect(() => {
    let field: BaseballField | SoftwareField | undefined,
      frame = 0,
      disposed = false,
      last = performance.now();
    const setup = async () => {
      if (!host.current) return;
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2");
      if (gl) {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        try {
          const { BaseballField } = await import("@/lib/game/field");
          if (!disposed && host.current) field = new BaseballField(host.current, engine);
          return;
        } catch {}
      }
      const { SoftwareField } = await import("@/lib/game/software-field");
      if (!disposed && host.current) {
        field = new SoftwareField(host.current, engine);
        setError("호환 그래픽 모드");
      }
    };
    void setup().catch(() => setError("야구장을 불러오지 못했습니다. 새로고침해 주세요."));
    const tick = (now: number) => {
      // Slow motion (a rundown tag about to land) slows the rules and the picture alike.
      const dt = Math.min((now - last) / 1000, 0.05) * engine.timeScale;
      last = now;
      if (!still.current) {
        // Fast-forward only the AI's half; rules step in pieces of at most 0.05 s.
        const mult = engine.autoHalf ? fast.current : 1;
        let left = dt * mult;
        while (left > 1e-6) {
          const step = Math.min(0.05, left);
          engine.tick(step);
          left -= step;
        }
        field?.update(dt * mult, dt);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      field?.dispose();
    };
  }, [engine]);
  // Keep React-owned labels outside the renderer-owned canvas container.
  return (
    <>
      <div className="field-render" ref={host} />
      {error && (
        <p className={error === "호환 그래픽 모드" ? "graphics-mode" : "render-error"}>{error}</p>
      )}
    </>
  );
}

function BaseMap({ bases }: { bases: boolean[] }) {
  return (
    <svg
      className="base-map"
      viewBox="0 0 76 68"
      aria-label={`1루 ${bases[0] ? "주자 있음" : "비어 있음"}, 2루 ${bases[1] ? "주자 있음" : "비어 있음"}, 3루 ${bases[2] ? "주자 있음" : "비어 있음"}`}
      role="img"
    >
      <path d="M38 9 64 34 38 59 12 34Z" fill="none" stroke="#50626a" strokeWidth="1.4" />
      {[
        [61, 34, 0],
        [38, 12, 1],
        [15, 34, 2],
      ].map(([x, y, i]) => (
        <rect
          key={i}
          x={x - 5}
          y={y - 5}
          width="10"
          height="10"
          transform={`rotate(45 ${x} ${y})`}
          fill={bases[i] ? "#e9b85b" : "#415158"}
        />
      ))}
      <path d="M33 56h10v5l-5 4-5-4Z" fill="#f2eee3" />
    </svg>
  );
}
function CountDots({
  label,
  count,
  max,
  color,
}: {
  label: string;
  count: number;
  max: number;
  color: string;
}) {
  return (
    <div className="count-dots">
      <span>{label}</span>
      <div>
        {Array.from({ length: max }, (_, i) => (
          <i key={i} style={{ background: i < count ? color : undefined }} />
        ))}
      </div>
    </div>
  );
}
/** Scoreboard badge: the team's first letter, in the club color when it is a pro club. */
function TeamLogo({ name }: { name: string }) {
  const club = TEAMS.find((t) => t.name === name);
  return (
    <span
      className="team-logo"
      style={club ? ({ background: club.color, color: "#fff" } as React.CSSProperties) : undefined}
    >
      {name.slice(0, 1)}
    </span>
  );
}
function Scoreboard({ s }: { s: GameState }) {
  const [away, home] = matchTeams(s.career);
  return (
    <div className="scoreboard">
      <div className="board-match">
        <span className="live-label">{s.mode === "match" ? "시즌" : "연습"}</span>
        <span>
          {s.mode === "match"
            ? `${s.maxInnings}이닝 시즌 경기`
            : s.mode === "bullpen"
              ? "불펜 피칭"
              : "배팅 케이지"}
        </span>
      </div>
      <div className={`team away ${s.half === "top" ? "at-bat" : ""}`}>
        <TeamLogo name={away} />
        <span>
          {away}
          <small>원정</small>
        </span>
        <strong>{s.score[0]}</strong>
      </div>
      <div className="inning">
        <span>
          {s.inning} <b>{s.half === "top" ? "▲" : "▼"}</b>
        </span>
        <small>{s.half === "top" ? "초" : "말"}</small>
      </div>
      <div className={`team home ${s.half === "bottom" ? "at-bat" : ""}`}>
        <strong>{s.score[1]}</strong>
        <span>
          {home}
          <small>홈</small>
        </span>
        <TeamLogo name={home} />
      </div>
      <div className="counts">
        <CountDots label="B" count={s.balls} max={3} color="#9fc9a8" />
        <CountDots label="S" count={s.strikes} max={2} color="#e9b85b" />
        <CountDots label="O" count={s.outs} max={3} color="#e88770" />
      </div>
      <BaseMap bases={s.bases} />
    </div>
  );
}

function AimPad({ engine, s }: { engine: BaseballEngine; s: GameState }) {
  const batting = engine.batting;
  // Batting uses the catcher camera, where world +X is on the left; mirror to match the screen.
  const side = batting ? -1 : 1;
  const toX = (x: number) => ((side * x + 0.7) / 1.4) * 280,
    toY = (y: number) => ((1.85 - y) / 1.7) * 240;
  const flight = s.flight,
    flying = s.phase === "flight" && !!flight;
  const locked = flight && (s.phase === "windup" || flying);
  const aim = locked ? (batting ? (flight.swung ? flight.batAim : s.aim) : flight.aim) : s.aim;
  const progress = flying ? clamp(flight.elapsed / flight.visualDuration, 0, 1) : 0;
  const previous = batting ? s.batFeedback : null;
  const hint = batting && locked ? flight.hint : null;
  const activePitch = ALL_PITCHES.find((p) => p.id === (locked ? flight.pitch : s.selected))!;
  const movement = pitchMovement(
    activePitch.id,
    locked ? flight.movement : s.career.stats.movement,
  );
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    engine.setAim(
      side * (((e.clientX - b.left) / b.width) * 1.4 - 0.7),
      1.85 - ((e.clientY - b.top) / b.height) * 1.7,
    );
  };
  const action = () => (batting ? engine.swing() : engine.throwAt());
  return (
    <div
      className="aim-pad"
      role="button"
      tabIndex={0}
      aria-label={
        batting ? "타격 조준판: 마우스 조준, 클릭 스윙" : "투구 조준판: 마우스 조준, 클릭 투구"
      }
      onPointerMove={move}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        move(e);
        action();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!e.repeat) action();
        }
      }}
    >
      <svg viewBox="0 0 280 240" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id="aimgrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="#ffffff" strokeOpacity=".035" />
          </pattern>
        </defs>
        <rect width="280" height="240" fill="url(#aimgrid)" />
        <rect
          x={Math.min(toX(-0.215), toX(0.215))}
          y={toY(1.35)}
          width={(0.43 / 1.4) * 280}
          height={(0.8 / 1.7) * 240}
          fill="#eac270"
          fillOpacity=".055"
          stroke="#c7ccb6"
          strokeOpacity=".65"
        />
        {[1, 2].map((i) => (
          <g key={i}>
            <path
              d={`M${toX(-0.215 + (i * 0.43) / 3)} ${toY(1.35)}V${toY(0.55)}`}
              stroke="#ccd0bc"
              strokeOpacity=".2"
            />
            <path
              d={`M${toX(-0.215)} ${toY(0.55 + (i * 0.8) / 3)}H${toX(0.215)}`}
              stroke="#ccd0bc"
              strokeOpacity=".2"
            />
          </g>
        ))}
        {!batting && (
          <g className="movement-envelope" stroke={activePitch.color}>
            <rect
              x={toX(aim.x + movement.minX)}
              y={toY(aim.y + movement.maxY)}
              width={Math.max(3, (movement.maxX - movement.minX) * 200)}
              height={Math.max(3, ((movement.maxY - movement.minY) * 240) / 1.7)}
              fill={activePitch.color}
              fillOpacity=".14"
              strokeOpacity=".6"
              strokeDasharray="4 3"
              rx="2"
            />
            <path
              d={`M${toX(aim.x)} ${toY(aim.y)}L${toX(aim.x + movement.x)} ${toY(aim.y + movement.y)}`}
              fill="none"
              strokeWidth="2"
              strokeDasharray="3 3"
            />
            <circle
              cx={toX(aim.x + movement.x)}
              cy={toY(aim.y + movement.y)}
              r="4"
              fill={activePitch.color}
            />
          </g>
        )}
        {!batting &&
          s.history
            .slice()
            .reverse()
            .map((p, i) => (
              <circle
                key={i}
                cx={toX(p.x)}
                cy={toY(p.y)}
                r="5"
                opacity={0.3 + i * 0.075}
                fill={p.kind === "strike" ? "#e5b85c" : "#85bde4"}
              />
            ))}
        {hint && (
          <g className="arrival-hint">
            <defs>
              <radialGradient id="hintglow">
                <stop offset="0" stopColor="#fff8df" stopOpacity=".26" />
                <stop offset=".65" stopColor="#fff8df" stopOpacity=".12" />
                <stop offset="1" stopColor="#fff8df" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse
              cx={toX(hint.x)}
              cy={toY(hint.y)}
              rx={(hint.r / 1.4) * 280 * 1.15}
              ry={(hint.r / 1.7) * 240 * 1.15}
              fill="url(#hintglow)"
            />
          </g>
        )}
        {previous && !locked && (
          <g opacity=".8">
            <circle cx={toX(previous.ball.x)} cy={toY(previous.ball.y)} r="6" fill="#f6f3dd" />
            {previous.batAim && (
              <g
                transform={`translate(${toX(previous.batAim.x)} ${toY(previous.batAim.y)})`}
                stroke="#e59ab4"
                strokeWidth="2"
              >
                <circle r="12" fill="none" />
                <path d="M-5-5 5 5M-5 5 5-5" />
              </g>
            )}
          </g>
        )}
        <g transform={`translate(${toX(aim.x)} ${toY(aim.y)})`} stroke="#f1c771" strokeWidth="1.6">
          {batting && (
            <ellipse
              rx={(batReach(formOf(engine.batter).contact, s.swingStyle) / 1.4) * 280}
              ry={(batReach(formOf(engine.batter).contact, s.swingStyle) / 1.7) * 240}
              fill="#f1c771"
              fillOpacity=".06"
              strokeOpacity=".5"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          )}
          <circle r="11" fill="none" />
          <path d="M-17 0h10M7 0h10M0-17v10M0 7v10" />
          <circle r="2" fill="#f1c771" stroke="none" />
        </g>
        {batting && flying && (
          <circle
            cx={toX(s.ball.x)}
            cy={toY(s.ball.y)}
            r={3 + progress * 4}
            fill="#fff8df"
            stroke="#152932"
            strokeWidth="1.5"
          />
        )}
        <path d="M127 217h26v8l-13 8-13-8Z" fill="#9aa9a6" fillOpacity=".4" />
      </svg>
      <span className="pad-top">
        {batting ? `포수 시점 · 흐린 원 = 공 도착 범위` : "투수 방향 기준 · 색 영역은 최대 휨"}
      </span>
      {batting && flying && <TimingBar s={s} className="pad-timing" />}
      <span className="pad-action">
        {batting
          ? flying
            ? "원 안으로 조준 → 금색 구간에서 클릭"
            : previous?.batAim
              ? "분홍색: 이전 스윙 지점"
              : "클릭 / Space로 스윙"
          : "클릭하여 투구"}
      </span>
    </div>
  );
}
/** Shared timing bar: faint = contact window, bright = perfect timing, white = ball now. */
function TimingBar({ s, className }: { s: GameState; className: string }) {
  const f = s.flight,
    progress = f ? clamp(f.elapsed / f.visualDuration, 0, 1) : 0,
    w = swingWindow(s.difficulty, s.career.stage, s.swingStyle),
    pct = (v: number) => `${clamp(v, 0, 1) * 100}%`;
  return (
    <div className={className} aria-label={`투구 진행 ${Math.round(progress * 100)}%`}>
      <i
        className="contact-window"
        style={{ left: pct(SWING_SWEET - w), right: `calc(100% - ${pct(SWING_SWEET + w)})` }}
      />
      <i
        className="perfect-window"
        style={{
          left: pct(SWING_SWEET - SWING_GOOD),
          right: `calc(100% - ${pct(SWING_SWEET + SWING_GOOD)})`,
        }}
      />
      <b style={{ left: pct(progress) }} />
    </div>
  );
}
function PitchMovementGuide({ s }: { s: GameState }) {
  const f = s.phase === "windup" || s.phase === "flight" ? s.flight : null;
  const p = ALL_PITCHES.find((p) => p.id === (f?.pitch ?? s.selected))!,
    m = pitchMovement(p.id, f?.movement ?? s.career.stats.movement);
  if (m.flutter > 0)
    return (
      <p className="pp-desc" aria-label={p.name + " 움직임"}>
        <i style={{ background: p.color }} />
        <span>
          <b>{p.name}</b> {p.desc}
          <small>
            날아오는 동안 상하좌우 최대 {Math.round(m.flutter * 100)} cm 흔들림 · 방향은 던질 때마다
            무작위 (조준판의 색 영역)
          </small>
        </span>
      </p>
    );
  return (
    <p className="pp-desc" aria-label={p.name + " 움직임"}>
      <i style={{ background: p.color }} />
      <span>
        <b>{p.name}</b> {p.desc}
        <small>
          최대 휨 {m.x >= 0 ? "→" : "←"} {Math.abs(m.x * 100).toFixed(0)} cm ·{" "}
          {m.y >= 0 ? "↑" : "↓"} {Math.abs(m.y * 100).toFixed(0)} cm (조준판의 색 영역)
        </small>
      </span>
    </p>
  );
}
function BattingFeedback({ s }: { s: GameState }) {
  const f = s.batFeedback;
  if (!f)
    return (
      <p className="pp-desc bat-tip">
        <span>
          <b>흐린 빛</b> = 공이 올 범위, <b>점선 원</b> = 배트가 닿는 범위. 원을 빛에 겹치고 위쪽
          게이지 <b>금색</b>에서 스윙!
        </span>
      </p>
    );
  const label = {
    early: "스윙이 빨랐어요",
    good: "좋은 타이밍",
    late: "스윙이 늦었어요",
    take: "공을 지켜봤어요",
  }[f.timing];
  return (
    <p className={`pp-desc bat-feedback-line ${f.contact ? "contact" : ""}`} role="status">
      <span>
        <b>{label}</b> · {f.contact ? "배트에 맞음" : f.timing === "take" ? "노 스윙" : "헛스윙"}
        {f.offsetMs !== null && (
          <small>
            타이밍 {f.offsetMs > 0 ? "+" : ""}
            {f.offsetMs} ms · 조준 오차 {f.errorCm} cm
          </small>
        )}
      </span>
    </p>
  );
}
function LineScore({ s }: { s: GameState }) {
  return (
    <div className="line-score">
      <table>
        <caption className="sr-only">이닝별 점수</caption>
        <thead>
          <tr>
            <th>팀</th>
            {Array.from({ length: s.maxInnings }, (_, i) => (
              <th key={i}>{i + 1}</th>
            ))}
            <th>R</th>
            <th>H</th>
            <th>E</th>
          </tr>
        </thead>
        <tbody>
          {matchTeams(s.career).map((name, i) => (
            <tr key={name}>
              <th>{name}</th>
              {s.lines[i].map((n, j) => (
                <td className={j === s.inning - 1 ? "current" : ""} key={j}>
                  {j < s.inning ? n : "—"}
                </td>
              ))}
              <td className="total">{s.score[i]}</td>
              <td>{s.hits[i]}</td>
              <td>{s.errors[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Both teams' strength side by side (lineup averages, defense, starting pitcher). */
function TeamStrength({ engine }: { engine: BaseballEngine }) {
  const teams = [engine.teamStrength(false), engine.teamStrength(true)],
    // Bars fill at the stage's top rating (100 in high school, 200 in the pros).
    top = STAGES[engine.state.career.stage].statCap,
    rows: [string, "contact" | "power" | "eye" | "speed" | "defense"][] = [
      ["컨택", "contact"],
      ["파워", "power"],
      ["선구", "eye"],
      ["주력", "speed"],
      ["수비", "defense"],
    ];
  return (
    <div className="team-strength" aria-label="양 팀 전력">
      <span className="eyebrow">양 팀 전력 · 라인업 평균</span>
      <div className="ts-grid">
        <span />
        {teams.map((t, i) => (
          <strong key={i} className={i ? "home" : "away"}>
            {t.name}
          </strong>
        ))}
        {rows.map(([label, k]) => (
          <Fragment key={k}>
            <span className="ts-label">{label}</span>
            {teams.map((t, i) => {
              const v = t[k],
                better = v > teams[1 - i][k];
              return (
                <span
                  key={i}
                  className={`ts-cell ${i ? "home" : "away"} ${better ? "better" : ""}`}
                >
                  <i style={{ width: `${Math.min(100, (v / top) * 100)}%` }} />
                  <b>{v}</b>
                </span>
              );
            })}
          </Fragment>
        ))}
        <span className="ts-label">선발</span>
        {teams.map((t, i) => (
          <span key={i} className="ts-pitcher">
            {t.pitcher} <small>{t.velocity} km/h</small>
          </span>
        ))}
      </div>
    </div>
  );
}
/**
 * Our batting order (v12): ▲▼ move a hitter up or down. Positions in the field stay with the
 * player; only who bats where changes. Locked while a match is under way.
 */
function LineupEditor({ engine, s }: { engine: BaseballEngine; s: GameState }) {
  // Dragging a hitter: the list shows where he would land while the pointer moves, and the
  // order is saved when he is let go. (Mouse: anywhere on the row; touch: the ⠿ handle, so
  // the page still scrolls with a finger elsewhere.)
  const [drag, setDrag] = useState<{ key: number; order: number[] } | null>(null),
    rows = useRef<Record<number, HTMLLIElement | null>>({}),
    order = engine.battingOrder,
    shown = drag?.order ?? order,
    locked = engine.matchActive,
    custom = order.some((k, i) => k !== i),
    me = order.indexOf(0),
    save = (next: number[]) => {
      if (!engine.setBattingOrder(next)) toast.error("경기 중에는 타순을 바꿀 수 없어요");
    },
    move = (i: number, d: number) => {
      const j = i + d;
      if (j < 0 || j > 8) return;
      const next = [...order];
      [next[i], next[j]] = [next[j], next[i]];
      save(next);
    },
    grab = (e: React.PointerEvent<HTMLLIElement>, k: number) => {
      const t = e.target as HTMLElement;
      if (locked || e.button !== 0 || t.closest("button")) return;
      if (e.pointerType !== "mouse" && !t.closest(".lineup-grip")) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ key: k, order: [...order] });
    },
    slide = (e: React.PointerEvent) => {
      if (!drag) return;
      const others = drag.order.filter((k) => k !== drag.key),
        at = others.filter((k) => {
          const r = rows.current[k]?.getBoundingClientRect();
          return r && r.top + r.height / 2 < e.clientY;
        }).length,
        next = [...others.slice(0, at), drag.key, ...others.slice(at)];
      if (next.some((k, i) => k !== drag.order[i])) setDrag({ ...drag, order: next });
    },
    drop = () => {
      if (!drag) return;
      if (drag.order.some((k, i) => k !== order[i])) save(drag.order);
      setDrag(null);
    };
  return (
    <>
      <p className="muted small">
        {engine.role === "pitcher"
          ? `투수만 모드라 내 자리에는 지명타자가 ${me + 1}번으로 섭니다.`
          : `나는 ${me + 1}번 타자.`}{" "}
        선수를 위아래로 끌어서(또는 ▲▼로) 타순을 바꿀 수 있어요(수비 위치는 그대로). 스윙은 모두
        내가 조작하고, 내 능력치
        평균이 오르면 동료 능력치도 그 75%만큼 함께 오릅니다.
        {locked && <b className="lineup-lock"> 경기 중에는 타순을 바꿀 수 없어요.</b>}
      </p>
      <ol className={`team-lineup editable ${locked ? "locked" : ""}`}>
        {shown.map((k, i) => {
          const p = engine.member(k);
          return (
            <li
              key={k}
              ref={(el) => {
                rows.current[k] = el;
              }}
              className={`${k === 0 ? "me" : ""} ${drag?.key === k ? "dragging" : ""}`}
              onPointerDown={(e) => grab(e, k)}
              onPointerMove={slide}
              onPointerUp={drop}
              onPointerCancel={drop}
            >
              <i className="lineup-grip" aria-hidden>
                ⠿
              </i>
              <span>{i + 1}</span>
              <strong>
                {p.nick ? (
                  <>
                    <em>[{p.nick}]</em> {p.name}
                  </>
                ) : (
                  p.name
                )}
                {k === 0 && engine.role !== "pitcher" && <i className="me-tag">나</i>}
              </strong>
              <small>
                컨 {p.contact} · 파 {p.power} · 주 {p.speed}
              </small>
              <span className="lineup-move">
                <button
                  disabled={locked || i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={`${p.name} 타순 올리기`}
                >
                  ▲
                </button>
                <button
                  disabled={locked || i === 8}
                  onClick={() => move(i, 1)}
                  aria-label={`${p.name} 타순 내리기`}
                >
                  ▼
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      {custom && !locked && (
        <button className="subtle-button lineup-reset" onClick={() => engine.setBattingOrder(null)}>
          기본 타순으로 되돌리기
        </button>
      )}
    </>
  );
}
function CareerView({ engine, s }: { engine: BaseballEngine; s: GameState }) {
  const c = s.career;
  const [name, setName] = useState(c.name);
  // The save loads after the first render; follow the stored name once it arrives.
  useEffect(() => setName(c.name), [c.name]);
  return (
    <section className="career-view embedded">
      <div className="section-intro shop-intro">
        <div>
          <h2>나의 선수와 진로</h2>
          <p>
            {c.stage === "pro"
              ? `${clubLine(c)} · ${TIER_NAMES[tierOf(c)]} 시즌. 하루의 선택이 내일의 선수를 만듭니다.`
              : "고교 마지막 시즌. 하루의 선택이 내일의 선수를 만듭니다."}
          </p>
        </div>
        <span className="season-stamp">
          {c.stage === "pro" ? TIER_NAMES[tierOf(c)] : "고교 3학년"}{" "}
          <b>DAY {String(c.day).padStart(2, "0")}</b>
        </span>
      </div>
      <div className="career-grid">
        <article className="player-card">
          <div className="jersey-number">18</div>
          <div className="player-card-top">
            <span>{clubLine(c)}</span>
            <Shield size={24} />
          </div>
          <div className="player-card-bottom">
            <h2>{c.name}</h2>
            <p>
              {c.stage === "pro" ? `${TIER_NAMES[tierOf(c)]} 우완 투수` : "고교 3학년 우완 투수"}
            </p>
            <div className="player-rating">
              <strong>
                {Math.round(
                  Object.values(c.stats).reduce((a, b) => a + b, 0) / Object.values(c.stats).length,
                )}
              </strong>
              <span>종합 능력</span>
            </div>
          </div>
        </article>
        <div className="career-main">
          <article className="panel">
            <div className="panel-heading">
              <h2>선수 정보</h2>
              <span>보유 {c.xp} XP</span>
            </div>
            <div className="known-pitches">
              <span>보유 구종</span>
              {ALL_PITCHES.filter((p) => c.pitches.includes(p.id)).map((p) => (
                <b key={p.id} style={{ borderColor: p.color }}>
                  {p.name}
                </b>
              ))}
            </div>
            <form
              className="rename"
              onSubmit={(e) => {
                e.preventDefault();
                if (engine.rename(name)) toast.success("선수 이름을 저장했습니다");
              }}
            >
              <label htmlFor="player-name">선수 이름</label>
              <input
                id="player-name"
                maxLength={12}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button className="subtle-button" type="submit">
                저장
              </button>
            </form>
          </article>
          <article className="panel scout-panel">
            <div className="panel-heading">
              <h2>
                {tierOf(c) === "first"
                  ? "MLB 스카우트"
                  : c.stage === "pro"
                    ? "프로 리포트"
                    : "스카우트 리포트"}
              </h2>
              <Medal size={20} />
            </div>
            <ScoutMeter s={s} big />
            <p>
              {tierOf(c) === "mlb"
                ? "MLB 하드 모드 · 무한 모드. 목표 없이 최강의 무대에서 끝없이 던지고 치세요."
                : tierOf(c) === "first"
                  ? c.limitless
                    ? `MLB 제안을 모두 거절하고 국내에 남았습니다. 능력치 상한 ${LIMITLESS_CAP}.`
                    : `1군 무대(상대 ${TIER_RATINGS.first.mean}±${TIER_RATINGS.first.spread}). MLB ${MLB_TEAMS.length}개 구단 스카우트가 동시에 평가합니다. 100이 된 구단과 계약하거나, 모두 100이 된 뒤 전부 거절하면 능력치 상한이 ${LIMITLESS_CAP}이 됩니다.`
                  : c.stage === "pro"
                    ? `2군 생활(상대 ${TIER_RATINGS.farm.mean}±${TIER_RATINGS.farm.spread}). 경기를 마칠 때마다 감독의 신뢰가 오르고, 100점이면 1군으로 올라갑니다.`
                    : c.draft
                      ? `진로 확정: ${c.draft}`
                      : "시즌 경기를 마칠 때마다 탈삼진·안타·승리에 따라 평가가 3~18점 오릅니다. 100점이 되면 입단 제의를 받습니다."}
            </p>
          </article>
        </div>
        <article className="panel career-log">
          <div className="panel-heading">
            <h2>시즌 기록</h2>
            <Flag size={18} />
          </div>
          <div className="record-grid">
            {[
              ["경기", c.games],
              ["승리", c.wins],
              ["탈삼진", c.strikeouts],
              ["안타", c.hits],
            ].map(([k, v]) => (
              <div key={k}>
                <b>{v}</b>
                <span>{k}</span>
              </div>
            ))}
          </div>
          <h3>
            {engine.homeRoster.name} 라인업 · 타순
            {Math.floor(c.teamBoost ?? 0) > 0 && (
              <small className="team-boost"> 팀 성장 +{Math.floor(c.teamBoost ?? 0)}</small>
            )}
          </h3>
          <LineupEditor engine={engine} s={s} />
          <h3>나의 야구 일지</h3>
          <ol>
            {c.history.map((item, i) => (
              <li key={i}>
                <span>{String(c.history.length - i).padStart(2, "0")}</span>
                {item}
              </li>
            ))}
          </ol>
          <p className="muted small">
            {s.saveStatus}
            <br />이 기기의 선수 기록만 저장됩니다.
          </p>
        </article>
      </div>
    </section>
  );
}

const trainings: {
  id: string;
  stat?: StatKey;
  icon: typeof Target;
  name: string;
  desc: string;
  gain: string;
  cost: number;
}[] = [
  {
    id: "bullpen",
    stat: "control" as StatKey,
    icon: Target,
    name: "불펜 피칭",
    desc: "모서리를 찌르는 한 구",
    gain: "제구 +0~2",
    cost: 18,
  },
  {
    id: "weights",
    stat: "velocity" as StatKey,
    icon: Dumbbell,
    name: "하체·코어",
    desc: "강한 하체에서 나오는 구속",
    gain: "구속 +0~2",
    cost: 22,
  },
  {
    id: "breaking",
    stat: "movement" as StatKey,
    icon: Wind,
    name: "변화구 그립",
    desc: "회전으로 만드는 다른 궤적",
    gain: "구위 +0~2",
    cost: 18,
  },
  {
    id: "running",
    stat: "stamina" as StatKey,
    icon: Activity,
    name: "장거리 러닝",
    desc: "마지막 이닝까지 흔들림 없이",
    gain: "지구력 +0~2",
    cost: 16,
  },
  {
    id: "sprint",
    stat: "speed" as StatKey,
    icon: Footprints,
    name: "스프린트",
    desc: "한 베이스를 더 훔치는 다리",
    gain: "주력 +0~2",
    cost: 16,
  },
  {
    id: "batting",
    stat: "contact" as StatKey,
    icon: Crosshair,
    name: "타격 훈련",
    desc: "공을 끝까지 보고 정확하게",
    gain: "컨택 +0~2",
    cost: 20,
  },
  {
    id: "power",
    stat: "power" as StatKey,
    icon: Zap,
    name: "장타 훈련",
    desc: "배트에 싣는 힘",
    gain: "파워 +0~2",
    cost: 22,
  },
  {
    id: "study",
    icon: BookOpen,
    name: "수업·영상 분석",
    desc: "책상에서도 이어지는 야구",
    gain: "컨디션 +2~6",
    cost: 6,
  },
  {
    id: "rest",
    icon: Moon,
    name: "충분한 휴식",
    desc: "잘 쉬는 것도 실력",
    gain: "체력 +38 · 컨디션 +8",
    cost: -38,
  },
];
function LifeView({
  engine,
  s,
  onPlay,
  onPractice,
}: {
  engine: BaseballEngine;
  s: GameState;
  onPlay: () => void;
  onPractice: (mode: Mode) => void;
}) {
  const c = s.career,
    out = c.actions <= 0,
    live = engine.matchActive;
  const [game, setGame] = useState<string | null>(null);
  const step = live || out ? 1 : 0;
  const headline = live
    ? "경기가 한창입니다. 그라운드로 돌아가세요."
    : out
      ? "오전 훈련 끝. 이제 경기장으로 향할 시간."
      : c.actions === DAY_ACTIONS
        ? "새로운 아침. 오늘은 무엇을 쌓을까?"
        : "땀이 식기 전에, 하나 더?";
  return (
    <section className="training-view life-view">
      <div className="section-intro">
        <div>
          <span className="eyebrow">
            {c.stage === "pro"
              ? `${TIER_NAMES[tierOf(c)]} · ${clubLine(c)} · ${c.name}`
              : `고교 3학년 · 마지막 시즌 · ${c.name}`}
          </span>
          <h1>{headline}</h1>
          <p>
            아침에는 행동력 {DAY_ACTIONS}으로 훈련·수업·휴식을 하고, 오후에는 시즌 경기를 치릅니다.
            경기가 끝나면 밤이 지나고 다음 날이 시작됩니다.
          </p>
        </div>
        <span className="season-stamp">
          시즌 <b>DAY {String(c.day).padStart(2, "0")}</b>
        </span>
      </div>
      <div className="life-timeline" aria-label={`DAY ${c.day} 하루 흐름`}>
        <div className={`life-step ${step === 0 ? "now" : "done"}`}>
          <span>아침 · 훈련</span>
          <strong>
            행동력 {c.actions}/{DAY_ACTIONS}
          </strong>
          <span className="action-pips" aria-hidden="true">
            {Array.from({ length: DAY_ACTIONS }, (_, i) => (
              <i key={i} className={i < c.actions ? "on" : ""} />
            ))}
          </span>
        </div>
        <ChevronRight className="life-arrow" size={18} />
        <div className={`life-step ${step === 1 ? "now" : ""}`}>
          <span>오후 · 시즌 경기</span>
          <strong>{live ? "경기 중" : `${matchTeams(c)[1]} vs ${matchTeams(c)[0]}`}</strong>
          <small>
            {engine.forecast === "rain"
              ? "🌧 비 예보 · 제구·구속·주루 저하, 수비 실수, 이닝마다 우천취소 판정"
              : "☀ 맑음 · 삼진·안타·승리로 XP"}
          </small>
        </div>
        <ChevronRight className="life-arrow" size={18} />
        <div className="life-step">
          <span>밤 · 휴식</span>
          <strong>다음 날로</strong>
          <small>체력 +25 · 행동력 {DAY_ACTIONS}</small>
        </div>
        <button className="primary-button life-cta" onClick={onPlay}>
          <span>
            <Play size={16} />
            {live ? "경기로 돌아가기" : "경기장으로 향하기"}
          </span>
          {!live && !out && <small>남은 행동력은 사라집니다</small>}
        </button>
      </div>
      <ScoutMeter s={s} />
      <MlbOffers engine={engine} s={s} />
      <div className="condition-bar">
        <div>
          <Activity />
          <span>현재 체력</span>
          <strong>
            {Math.round(c.energy)}
            <small>/ 100</small>
          </strong>
          <Progress value={c.energy} />
        </div>
        <div>
          <Zap />
          <span>컨디션</span>
          <strong>
            {c.form}
            <small>/ 100</small>
          </strong>
          <Progress value={c.form} />
        </div>
        <div>
          <Trophy />
          <span>보유 경험치</span>
          <strong>
            {c.xp}
            <small>XP</small>
          </strong>
        </div>
      </div>
      <StatGuide c={c} />
      <h2 className="training-title">오늘의 훈련</h2>
      <div className="training-grid">
        {trainings.map((t) => (
          <button
            className={`training-card ${t.id === "rest" ? "rest-card" : ""}`}
            key={t.id}
            disabled={c.energy < t.cost || live || out}
            onClick={() => {
              if (t.id !== "rest") {
                setGame(t.id);
                return;
              }
              const r = engine.train(t.id);
              r.ok ? toast.success(r.message) : toast.error(r.message);
            }}
          >
            <t.icon size={26} />
            <h2>{t.name}</h2>
            <p>{t.desc}</p>
            {t.stat ? (
              <dl className="training-stat">
                <dt>
                  {statNames[t.stat]} <b>{c.stats[t.stat]}</b>
                </dt>
                <dd>
                  {STAT_INFO[t.stat].label} {statMetric(t.stat, c.stats[t.stat])}
                </dd>
              </dl>
            ) : (
              <dl className="training-stat">
                <dt>{t.id === "rest" ? "현재 체력" : "컨디션"}</dt>
                <dd>
                  {t.id === "rest"
                    ? `${Math.round(c.energy)} / 100 · 낮으면 구속·제구가 떨어지고 폭투가 늘어요`
                    : `${c.form} / 100 · 낮으면 구속·제구·타구 질이 떨어져요`}
                </dd>
              </dl>
            )}
            {TRAINING_GAMES[t.id] && (
              <span className="mg-tag">미니게임 · {TRAINING_GAMES[t.id].title}</span>
            )}
            <div>
              <b>{c.stage === "pro" ? t.gain.replace("+0~2", "+0~4") : t.gain}</b>
              <span>
                {t.cost > 0 ? `체력 −${t.cost}` : "체력 회복"}
                <ArrowUpRight size={15} />
              </span>
            </div>
          </button>
        ))}
      </div>
      <TrainingMinigame
        kind={game}
        name={trainings.find((t) => t.id === game)?.name ?? ""}
        onCancel={() => setGame(null)}
        onFinish={(q) => {
          const r = engine.train(game!, q);
          setGame(null);
          r.ok ? toast.success(r.message) : toast.error(r.message);
        }}
      />
      <div className="practice-row">
        <span>
          <Target size={16} /> 자율 연습 <small>행동력·XP 없이 조작 연습</small>
        </span>
        <button className="subtle-button" onClick={() => onPractice("bullpen")}>
          불펜 피칭
        </button>
        <button className="subtle-button" onClick={() => onPractice("batting")}>
          배팅 케이지
        </button>
      </div>
      <div className="section-intro shop-intro">
        <div>
          <h2>구종 상점</h2>
          <p>
            경기에서 모은 경험치로 새 구종을 익힙니다. 익힌 구종은 투구 플랜에서 바로 선택됩니다.
          </p>
        </div>
        <span className="season-stamp">
          보유 <b>{c.xp} XP</b>
        </span>
      </div>
      <div className="pitch-shop">
        {PITCHES.map((p) => {
          const owned = c.pitches.includes(p.id),
            m = pitchMovement(p.id, c.stats.movement);
          return (
            <article
              key={p.id}
              className={`shop-card ${owned ? "owned" : ""}`}
              style={{ "--pitch-color": p.color } as React.CSSProperties}
            >
              <div>
                <i />
                <strong>{p.name}</strong>
                <small>{p.en}</small>
              </div>
              <p>{p.desc}</p>
              <span className="shop-meta">
                {p.delta ? `포심보다 ${-p.delta} km/h 느림` : "가장 빠른 공"} · 휨{" "}
                {Math.round(Math.hypot(m.x, m.y) * 100)} cm · 제구 난도 ×{p.control} · 체력 ×
                {p.stamina}
              </span>
              {pitchTraits(p).length > 0 && (
                <span className="shop-traits">
                  {pitchTraits(p).map((t) => (
                    <i key={t.text} className={t.good ? "good" : "bad"}>
                      {t.text}
                    </i>
                  ))}
                </span>
              )}
              <button
                className={owned ? "subtle-button" : "primary-button"}
                disabled={owned || c.xp < p.cost}
                onClick={() => {
                  const r = engine.buyPitch(p.id);
                  r.ok ? toast.success(r.message) : toast.error(r.message);
                }}
              >
                {owned ? (
                  <>
                    <Check size={15} /> 보유 중
                  </>
                ) : (
                  <>
                    {c.xp < p.cost ? <Lock size={15} /> : <ArrowUpRight size={15} />}
                    {p.cost} XP로 습득
                  </>
                )}
              </button>
            </article>
          );
        })}
        {HIDDEN_PITCHES.map((p) => {
          const owned = c.pitches.includes(p.id),
            m = pitchMovement(p.id, c.stats.movement);
          // Until unlocked the card shows nothing about the pitch or its condition.
          return owned ? (
            <article
              key={p.id}
              className="shop-card owned hidden"
              style={{ "--pitch-color": p.color } as React.CSSProperties}
            >
              <div>
                <i />
                <strong>{p.name}</strong>
                <small>{p.en}</small>
                <em className="hidden-badge">히든</em>
              </div>
              <p>{p.desc}</p>
              <span className="shop-meta">
                포심보다 {-p.delta} km/h 느림 · 흔들림 최대 {Math.round(m.flutter * 100)} cm
              </span>
              <span className="shop-traits">
                {pitchTraits(p).map((t) => (
                  <i key={t.text} className={t.good ? "good" : "bad"}>
                    {t.text}
                  </i>
                ))}
              </span>
              <button className="subtle-button" disabled>
                <Check size={15} /> 보유 중 · <kbd>{p.key}</kbd> 키
              </button>
            </article>
          ) : (
            <article
              key={p.id}
              className="shop-card hidden locked"
              style={{ "--pitch-color": "#c9a8ff" } as React.CSSProperties}
            >
              <div>
                <i />
                <strong>???</strong>
                <small>HIDDEN</small>
                <em className="hidden-badge">히든</em>
              </div>
              <p>정체를 알 수 없는 구종. 경험치로는 익힐 수 없습니다.</p>
              <span className="shop-meta">해금 조건 비공개</span>
              <button className="subtle-button" disabled>
                <Lock size={15} /> 어떤 조건을 만족하면 깨어납니다
              </button>
            </article>
          );
        })}
      </div>
      <div className="training-note">
        <BookOpen size={18} />
        <p>
          훈련·수업·휴식은 행동력을 1씩 씁니다. 미니게임 결과(아쉬움·좋음·완벽)에 따라 능력치가 0~2
          오르고, 바로 다음 투구와 타석부터 반영됩니다. 경기를 마치면 밤사이 체력이 25 회복되고
          행동력이 다시 {DAY_ACTIONS}이 됩니다.
        </p>
      </div>
      <CareerView engine={engine} s={s} />
      <p className="hidden-hint hint-footer">
        🔍 게임 곳곳에 히든 요소의 힌트가 숨어 있어요. 화면 구석의 작은 글씨를 잘 읽어 보세요.
      </p>
    </section>
  );
}

/** Role (fixed for the career): the half the player does not play is played by the AI. */
const ROLES: { id: Role; label: string; desc: string }[] = [
  { id: "two-way", label: "투타 겸업", desc: "던지고 친다 (지금까지와 같음)" },
  { id: "pitcher", label: "투수만", desc: "우리 공격은 AI가 진행 (배속 가능), 타석엔 지명타자" },
  { id: "batter", label: "타자만", desc: "우리 수비·투구는 AI가 진행 (배속 가능)" },
];
const statKeys = Object.keys(statNames) as (keyof Career["stats"])[];
/** First screen: choose a name and spread the starting stat points. */
function CreationDialog({ engine, s }: { engine: BaseballEngine; s: GameState }) {
  const needsTeam = !s.career.team;
  // New players: story → dream club → name & stats. Older saves only pick a club.
  const [step, setStep] = useState(0);
  const [team, setTeam] = useState("");
  useEffect(() => {
    if (!s.career.created) {
      setStep(0);
      setTeam("");
    }
  }, [s.career.created]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("two-way");
  // Every stat starts at the base; the player spends the free points himself.
  const [stats, setStats] = useState<Career["stats"]>(
    () => Object.fromEntries(statKeys.map((k) => [k, STAT_BASE])) as Career["stats"],
  );
  const left = STAT_POINTS - statKeys.reduce((a, k) => a + stats[k] - STAT_BASE, 0);
  const bump = (k: keyof Career["stats"], d: number) =>
    setStats((st) => {
      const v = st[k] + d;
      if (v < STAT_BASE || v > STAT_CAP || (d > 0 && left < d)) return st;
      return { ...st, [k]: v };
    });
  return (
    <Dialog open={!s.career.created || needsTeam}>
      <DialogContent className="creation-dialog" showCloseButton={false}>
        {s.career.created || step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>꿈의 구단을 고르세요</DialogTitle>
              <DialogDescription>
                고른 구단의 스카우트가 이번 시즌 미산고의 모든 경기를 지켜봅니다. 스카우트 평가
                100점을 채우면 그 구단의 입단 제의를 받습니다.
              </DialogDescription>
            </DialogHeader>
            <div className="team-grid">
              {TEAMS.map((t) => (
                <button
                  key={t.id}
                  className={`team-card ${team === t.id ? "selected" : ""}`}
                  style={{ "--team-color": t.color } as React.CSSProperties}
                  onClick={() => setTeam(t.id)}
                >
                  <small>{t.city}</small>
                  <strong>{t.name}</strong>
                  <span>{t.motto}</span>
                </button>
              ))}
            </div>
            {teamOf(team) && (
              <p className="team-pick">
                <b>
                  {teamOf(team)!.city} {teamOf(team)!.name}
                </b>{" "}
                {teamOf(team)!.scout} 스카우트가 당신을 지켜보기로 했습니다.
              </p>
            )}
            <button
              className="primary-button"
              disabled={!team}
              onClick={() => {
                if (s.career.created) engine.chooseTeam(team);
                else setStep(2);
              }}
            >
              이 구단을 목표로 <ChevronRight size={16} />
            </button>
          </>
        ) : step === 0 ? (
          <>
            <DialogHeader>
              <DialogTitle>프롤로그</DialogTitle>
              <DialogDescription>고교 3학년, 마지막 가을.</DialogDescription>
            </DialogHeader>
            <div className="story">
              <p>
                열 살 때 아버지 손을 잡고 처음 간 프로야구 경기장. 조명탑 아래 마운드에 선 투수가
                공을 뿌리던 그 밤, 당신은 결심했다.{" "}
                <b>언젠가 저 유니폼을 입고 저 마운드에 서겠다.</b>
              </p>
              <p>
                그리고 지금, 미산고 야구부 3학년. 드래프트까지 남은 기회는 이번 시즌뿐이다. 매일
                아침 훈련으로 몸을 만들고, 오후에는 시즌 경기에서 스카우트 앞에 선다.
              </p>
              <p>
                관중석 어딘가에 꿈의 구단 스카우트가 앉아 있다. <b>평가 100점</b>을 채우면, 그
                구단이 당신의 이름을 부를 것이다.
              </p>
            </div>
            <button className="primary-button" onClick={() => setStep(1)}>
              꿈의 구단 고르기 <ChevronRight size={16} />
            </button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>선수 등록</DialogTitle>
              <DialogDescription>
                {teamOf(team)?.name} 입단을 꿈꾸는 미산고 3학년. 역할을 고르고(나중에 못 바꿈) 이름을
                정한 뒤, 자유 능력치 {STAT_POINTS}포인트를 원하는 곳에 찍어 주세요. 모든 능력은{" "}
                {STAT_BASE}에서 시작해 최대 {STAT_CAP}까지 올릴 수 있습니다.
              </DialogDescription>
            </DialogHeader>
            <label className="creation-name">
              선수 이름
              <input
                maxLength={12}
                value={name}
                placeholder="예: 김하늘"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="creation-roles" role="radiogroup" aria-label="역할">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  role="radio"
                  aria-checked={role === r.id}
                  className={`subtle-button ${role === r.id ? "on" : ""}`}
                  onClick={() => setRole(r.id)}
                >
                  <strong>{r.label}</strong>
                  <small>{r.desc}</small>
                </button>
              ))}
            </div>
            {role !== "two-way" && (
              <p className="creation-notice">
                📢 <b>공지</b> · {role === "pitcher" ? "투수만" : "타자만"}을 골라도 투수·타자 능력치는
                모두 내 선수의 능력치입니다. AI가 대신하는 쪽도 훈련으로 올려야 해요(명예의 전당 종합
                점수에도 모든 능력치가 들어갑니다).
              </p>
            )}
            <div className="creation-difficulty" role="radiogroup" aria-label="난이도">
              <span>
                난이도 <small>명예의 전당은 이 선수가 경기한 가장 쉬운 난이도에 올라가요</small>
              </span>
              <div>
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.id}
                    role="radio"
                    aria-checked={s.difficulty === d.id}
                    className={`subtle-button ${s.difficulty === d.id ? "on" : ""}`}
                    onClick={() => engine.setDifficulty(d.id)}
                    title={d.note || undefined}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="creation-stats">
              {statKeys.map((k) => (
                <div key={k} className="creation-stat">
                  <span>
                    {statNames[k]}
                    <small>
                      {STAT_INFO[k].label} {statMetric(k, stats[k])}
                    </small>
                  </span>
                  <button aria-label={`${statNames[k]} 내리기`} onClick={() => bump(k, -5)}>
                    −
                  </button>
                  <b>{stats[k]}</b>
                  <button aria-label={`${statNames[k]} 올리기`} onClick={() => bump(k, 5)}>
                    +
                  </button>
                  <Progress value={((stats[k] - STAT_BASE) / (STAT_CAP - STAT_BASE)) * 100} />
                  <p>{STAT_INFO[k].what}</p>
                </div>
              ))}
            </div>
            <p className="hidden-hint">
              스카우트 수첩에 끼워진 오래된 쪽지 · &ldquo;공은 누구보다 느렸지만 손끝은 누구보다
              예민했던 투수가 있었다. 그의 공은 춤을 췄다.&rdquo;
            </p>
            <p className={`creation-left ${left === 0 ? "done" : ""}`}>
              남은 포인트 <b>{left}</b>
              {left > 0
                ? " · 모두 분배해야 등록할 수 있습니다"
                : !name.trim()
                  ? " · 선수 이름을 입력하면 등록할 수 있습니다"
                  : " · 준비 완료"}
            </p>
            <button
              className="primary-button"
              disabled={left !== 0 || !name.trim()}
              onClick={() => {
                engine.chooseTeam(team);
                const r = engine.createPlayer(name, stats, role);
                r.ok
                  ? toast.success(`${name.trim()}, ${teamOf(team)?.name}을 향한 시즌 시작!`)
                  : toast.error(r.message);
              }}
            >
              이 선수로 시즌 시작 <ChevronRight size={16} />
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
/** Dream-club scout evaluation, optionally animating from a previous value. */
function ScoutMeter({
  s,
  before,
  after,
  big = false,
}: {
  s: GameState;
  before?: number;
  after?: number;
  big?: boolean;
}) {
  const tier = tierOf(s.career);
  // The match that earned the promotion shows the trust gauge reaching 100, not empty MLB bars.
  const promotionRecap = before !== undefined && s.lastMlb.length === 0;
  if (tier === "first" && !promotionRecap)
    return <MlbScoutBoard s={s} recap={before !== undefined} big={big} />;
  if (tier === "mlb") {
    const m = mlbTeamOf(s.career.mlbClub);
    return (
      <div
        className={`scout-meter mlb-badge ${big ? "big" : ""}`}
        style={{ "--team-color": m?.color ?? "#2f5aa8" } as React.CSSProperties}
      >
        <div className="scout-meter-head">
          <span>
            <b>
              {m?.city} {m?.name}
            </b>{" "}
            MLB
          </span>
          <strong>
            하드 모드 <em>· 무한 모드</em>
          </strong>
        </div>
        <small className="scout-note">
          주변 선수 모두 능력치 {TIER_RATINGS.mlb.mean}±{TIER_RATINGS.mlb.spread} · 내 능력치 상한{" "}
          {LIMITLESS_CAP} · 끝없이 이어지는 시즌
        </small>
      </div>
    );
  }
  const pro = s.career.stage === "pro",
    t = teamOf(pro ? s.career.club : s.career.team),
    now = Math.round(after ?? s.career.scout),
    prev = before === undefined ? null : Math.round(before),
    gain = prev === null ? 0 : now - prev;
  if (!t) return null;
  return (
    <div
      className={`scout-meter ${big ? "big" : ""}`}
      style={{ "--team-color": t.color } as React.CSSProperties}
    >
      <div className="scout-meter-head">
        <span>
          <b>
            {t.city} {t.name}
          </b>{" "}
          {pro ? STAGES.pro.goal : `${t.scout} 스카우트 평가`}
        </span>
        <strong>
          {prev !== null && gain > 0 && <small>{prev} →</small>}
          {now}
          <em>/100</em>
          {gain > 0 && <i>+{gain}</i>}
        </strong>
      </div>
      <div className="scout-bar">
        {prev !== null && <span className="prev" style={{ width: `${prev}%` }} />}
        <span className="now" style={{ width: `${now}%` }} />
      </div>
      {now >= 100 ? (
        <small className="scout-note">{pro ? "1군 승격!" : "입단 제의를 받았습니다!"}</small>
      ) : (
        <small className="scout-note">
          {pro ? "1군 승격" : "입단 제의"}까지 {100 - now}점
        </small>
      )}
    </div>
  );
}
/**
 * First team: every MLB club's scout at once. With `recap`, the bars show the last match's
 * gains (before → after).
 */
function MlbScoutBoard({ s, recap, big }: { s: GameState; recap: boolean; big: boolean }) {
  const c = s.career;
  return (
    <div className={`mlb-board ${big ? "big" : ""}`}>
      <div className="mlb-board-head">
        <b>MLB 스카우트 평가</b>
        <small>
          {c.limitless ? "모든 제안 거절 · 국내 잔류" : "100이 된 구단과 언제든 계약 가능"}
        </small>
      </div>
      {MLB_TEAMS.map((t) => {
        const last = recap ? s.lastMlb.find((m) => m.id === t.id) : null,
          now = Math.round(last?.after ?? c.mlbScouts?.[t.id] ?? 0),
          prev = last ? Math.round(last.before) : null;
        return (
          <div
            key={t.id}
            className={`mlb-row ${now >= 100 ? "offer" : ""}`}
            style={{ "--team-color": t.color } as React.CSSProperties}
          >
            <span className="mlb-name">
              <b>
                {t.city} {t.name}
              </b>
              <small>
                {t.scout} · {t.likes} 중시
              </small>
            </span>
            <span className="scout-bar">
              {prev !== null && <span className="prev" style={{ width: `${prev}%` }} />}
              <span className="now" style={{ width: `${now}%` }} />
            </span>
            <strong>
              {now}
              {prev !== null && now > prev && <i>+{now - prev}</i>}
            </strong>
          </div>
        );
      })}
    </div>
  );
}
/** Contract offers from MLB scouts at 100: sign (hard mode), or turn every club down. */
function MlbOffers({ engine, s }: { engine: BaseballEngine; s: GameState }) {
  const offers = engine.mlbOffers;
  if (tierOf(s.career) !== "first" || s.career.limitless) return null;
  const all = offers.length === MLB_TEAMS.length;
  return (
    <div className="mlb-offers">
      {offers.length === 0 ? (
        <small>
          아직 계약 제안이 없어요. 경기를 할수록 스카우트 평가가 오르고, 100이 된 구단은 제안을 들고
          기다립니다.
        </small>
      ) : (
        offers.map((t) => (
          <button
            key={t.id}
            className="primary-button"
            style={{ "--team-color": t.color } as React.CSSProperties}
            onClick={() => {
              if (
                window.confirm(
                  `${t.city} ${t.name}와 계약할까요?\n\nMLB는 하드 모드 · 무한 모드입니다. 주변 선수 모두 능력치 ${TIER_RATINGS.mlb.mean}±${TIER_RATINGS.mlb.spread}, 내 능력치 상한 ${LIMITLESS_CAP}. 국내로는 돌아올 수 없어요.`,
                )
              ) {
                engine.signMlb(t.id);
                toast.success(`${t.name}와 계약! MLB 하드 모드 시작`);
              }
            }}
          >
            {t.name}와 계약 <small>하드 모드 시작 · 무한 모드</small>
          </button>
        ))
      )}
      <button
        className="subtle-button"
        disabled={!all}
        title={all ? "" : "모든 MLB 스카우트가 100이 되어야 거절할 수 있어요"}
        onClick={() => {
          if (
            window.confirm(
              `MLB의 모든 제안을 거절할까요?\n\n국내 리그에 남는 대신 내 능력치 상한이 ${LIMITLESS_CAP}으로 올라갑니다.`,
            )
          ) {
            engine.refuseMlb();
            toast.success(`모든 제안을 거절했습니다 · 능력치 상한 ${LIMITLESS_CAP}`);
          }
        }}
      >
        모두 거절하고 국내 잔류 <small>능력치 상한 {LIMITLESS_CAP}</small>
        {!all && <small> · 4개 구단 모두 100 필요</small>}
      </button>
    </div>
  );
}
/** End of the day: a short recap before the next morning. */
/** Why the scout gauge and XP moved: one line per reason, adding up to the totals. */
function RecapBreakdown({
  scoutParts,
  xpParts,
  scoutLabel,
}: {
  scoutParts: RecapLine[];
  xpParts: RecapLine[];
  scoutLabel: string;
}) {
  const block = (title: string, lines: RecapLine[], unit: string) => {
    const total = lines.reduce((a, p) => a + p.value, 0);
    return (
      <section>
        <h4>
          {title}
          <b>
            {total >= 0 ? "+" : ""}
            {total}
            {unit}
          </b>
        </h4>
        <ul>
          {lines.map((p, i) => (
            <li key={i} className={p.value < 0 ? "minus" : ""}>
              <span>{p.label}</span>
              <b>
                {p.value >= 0 ? "+" : ""}
                {p.value}
              </b>
            </li>
          ))}
        </ul>
      </section>
    );
  };
  if (!scoutParts.length && !xpParts.length) return null;
  return (
    <div className="recap-breakdown">
      {scoutParts.length > 0 && block(scoutLabel, scoutParts, "")}
      {xpParts.length > 0 && block("경험치", xpParts, " XP")}
    </div>
  );
}
function NightDialog({
  s,
  recap,
  onClose,
}: {
  s: GameState;
  recap: {
    day: number;
    message: string;
    score: string;
    xp: number;
    scout: { before: number; after: number } | null;
    scoutParts: RecapLine[];
    xpParts: RecapLine[];
  } | null;
  onClose: () => void;
}) {
  const t = teamOf(s.career.team),
    dream =
      s.career.stage !== "pro" &&
      !!recap?.scout &&
      recap.scout.before < 100 &&
      recap.scout.after >= 100;
  if (dream && t)
    return (
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent
          className="dream-dialog"
          style={{ "--team-color": t.color } as React.CSSProperties}
        >
          <DialogHeader>
            <DialogTitle>
              <Trophy size={20} /> {t.city} {t.name} 입단 제의!
            </DialogTitle>
            <DialogDescription>DAY {recap?.day}, 경기가 끝난 뒤 더그아웃 앞.</DialogDescription>
          </DialogHeader>
          <div className="story">
            <p>
              시즌 내내 관중석을 지키던 {t.scout} 스카우트가 다가와 손을 내밀었다. &ldquo;
              {s.career.name} 선수, 우리 {t.name}에서 함께 던져 보지 않겠나?&rdquo;
            </p>
            <p>
              열 살 때 꿈꿨던 그 유니폼.{" "}
              <b>
                {t.city} {t.name}
              </b>
              의 이름이 드디어 당신을 불렀다.
            </p>
          </div>
          <ScoutMeter s={s} before={recap!.scout!.before} after={recap!.scout!.after} big />
          <button className="primary-button" onClick={onClose}>
            입단식으로 <ChevronRight size={16} />
          </button>
        </DialogContent>
      </Dialog>
    );
  return (
    <Dialog open={!!recap} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="night-dialog">
        <DialogHeader>
          <DialogTitle>
            <Moon size={18} /> DAY {recap?.day}, 하루가 저물었다
          </DialogTitle>
          <DialogDescription>
            기숙사 불이 꺼지고, 오늘의 경기가 머릿속에서 다시 재생된다.
          </DialogDescription>
        </DialogHeader>
        {recap?.scout && (
          <ScoutMeter s={s} before={recap.scout.before} after={recap.scout.after} big />
        )}
        {recap && (
          <RecapBreakdown
            scoutParts={trustMaxed(s) ? [] : recap.scoutParts}
            xpParts={recap.xpParts}
            scoutLabel={gaugeName(s.career)}
          />
        )}
        <div className="night-recap">
          <div>
            <span>오늘의 경기</span>
            <strong>{recap?.message}</strong>
            <small>{recap?.score}</small>
          </div>
          <div>
            <span>획득 경험치</span>
            <strong>+{recap?.xp} XP</strong>
            <small>보유 {s.career.xp} XP</small>
          </div>
          <div>
            <span>밤사이 회복</span>
            <strong>체력 {Math.round(s.career.energy)}</strong>
            <small>행동력 {DAY_ACTIONS} 충전</small>
          </div>
        </div>
        <button className="primary-button" onClick={onClose}>
          DAY {s.career.day} 아침 맞이하기 <ChevronRight size={16} />
        </button>
      </DialogContent>
    </Dialog>
  );
}
/**
 * Signing ending: shown once the dream club's contract is in hand and before pro mode opens.
 * It cannot be skipped by clicking outside; the button moves the same player to the pros.
 */
function EndingDialog({
  engine,
  s,
  blocked,
  onPro,
}: {
  engine: BaseballEngine;
  s: GameState;
  blocked: boolean;
  onPro: () => void;
}) {
  const c = s.career,
    t = teamOf(c.club);
  if (!t || c.proUnlocked || blocked) return null;
  return (
    <Dialog open>
      <DialogContent
        className="dream-dialog ending-dialog"
        style={{ "--team-color": t.color } as React.CSSProperties}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            <Trophy size={20} /> {t.city} {t.name} 입단식
          </DialogTitle>
          <DialogDescription>고교 3학년의 마지막 시즌, 그 끝에서.</DialogDescription>
        </DialogHeader>
        <div className="story">
          <p>
            미산고 마운드에서 던진 공 하나하나가 결국 여기까지 왔다. 새벽 러닝, 불펜의 땀, 관중석의
            {` ${t.scout}`} 스카우트를 의식하며 던진 승부구들.
          </p>
          <p>
            입단식 날, {josa(c.name, "은는")} {t.name}의 유니폼을 받아 들었다. 등번호 18. &ldquo;
            {t.motto}.&rdquo; 구단의 슬로건이 가슴에 새겨진다.
          </p>
          <p>
            <b>
              고교 무대를 넘어 {t.city} {t.name}에 입단했다. 이제 프로 무대에서 뛰게 되었다.
            </b>
          </p>
        </div>
        <div className="night-recap">
          <div>
            <span>고교 통산</span>
            <strong>
              {c.games}경기 {c.wins}승
            </strong>
            <small>
              탈삼진 {c.strikeouts} · 안타 {c.hits}
            </small>
          </div>
          <div>
            <span>프로 모드 해금</span>
            <strong>난이도 상승</strong>
            <small>더 빠른 공 · 더 끈질긴 타자 · 더 빠른 수비</small>
          </div>
          <div>
            <span>새 목표</span>
            <strong>{STAGES.pro.goal} 100</strong>
            <small>{STAGES.pro.goalReward}</small>
          </div>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            if (engine.enterPro()) {
              toast.success(`${t.name} 소속 프로 선수로 첫날을 맞았습니다`);
              onPro();
            } else toast.error("진행 중인 경기를 먼저 마쳐 주세요.");
          }}
        >
          프로 무대로 <ChevronRight size={16} />
        </button>
      </DialogContent>
    </Dialog>
  );
}
const CONFETTI_COLORS = ["#e8b65a", "#f4d48c", "#85bde4", "#c9a8ff", "#8bceb6", "#e58f7a", "#fff"];
/** Falling paper confetti over the whole screen (pure CSS, clicks pass through). */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        duration: 2.4 + Math.random() * 1.8,
        drift: (Math.random() - 0.5) * 220,
        spin: 360 + Math.random() * 900,
        size: 6 + Math.random() * 7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [],
  );
  return createPortal(
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.45,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--drift": `${p.drift}px`,
              "--spin": `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>,
    document.body,
  );
}
/**
 * Fanfare for a secret condition: a hidden pitch (e.g. the knuckleball) or the legend start.
 * The conditions themselves are never shown.
 */
function HiddenDialog({ engine, s }: { engine: BaseballEngine; s: GameState }) {
  const legend = s.hiddenUnlock === "legend",
    tar = s.hiddenUnlock === "pinetar",
    p = s.hiddenUnlock && !legend && !tar ? ALL_PITCHES.find((x) => x.id === s.hiddenUnlock) : null;
  // Wait until creation and the starting roulette are out of the way.
  const open =
    (legend || tar || !!p) && s.career.created && !!s.career.team && s.career.blessing !== "";
  useEffect(() => {
    if (open) engine.fanfare();
  }, [open, engine]);
  if (!open) return null;
  return (
    <>
      <Confetti />
      <Dialog open onOpenChange={(v) => !v && engine.clearHiddenUnlock()}>
        <DialogContent className="hidden-pitch-dialog">
          <DialogHeader>
            <DialogTitle>
              <Sparkles size={18} /> 히든 조건을 만족했습니다!
            </DialogTitle>
            <DialogDescription>
              {legend
                ? "그 이름을 듣는 순간, 모두가 숨을 멈췄습니다."
                : tar
                  ? "비밀번호는 끝내 열리지 않았지만, 누군가 슬며시 작은 통 하나를 건넸습니다."
                  : "아무도 가르쳐 주지 않은 공이 손끝에서 깨어났습니다."}
            </DialogDescription>
          </DialogHeader>
          {tar ? (
            <div
              className="hidden-pitch-card"
              style={{ "--pitch-color": "#8a5a2b" } as React.CSSProperties}
            >
              <small>HIDDEN SKILL · PINE TAR</small>
              <strong>파인타르</strong>
              <p>
                공에 몰래 바르는 끈적한 송진. 손끝이 공을 단단히 잡아 공이 살아납니다. 하지만 들키면
                끝장입니다.
              </p>
              <ul>
                <li className="good">이번 경기 동안 구속·구위·제구 +{PINE_TAR_BOOST}</li>
                <li className="bad">
                  공을 던질 때마다 {Math.round(RULES.pineTarCatch * 100)}% 확률로 심판 검사
                </li>
                <li className="bad">
                  걸리면 퇴장(패배) · 모든 능력치 −{PINE_TAR_PENALTY} · 명예의 전당 「불명예」
                </li>
              </ul>
              <span>
                경기 중 <kbd>V</kbd> 키 또는 스킬 버튼으로 사용
              </span>
            </div>
          ) : legend ? (
            <div
              className="hidden-pitch-card legend"
              style={{ "--pitch-color": "#e8b65a" } as React.CSSProperties}
            >
              <small>??? · TWO-WAY LEGEND</small>
              <strong>이도류 전설</strong>
              <p>
                모든 능력치 {STAGES.pro.statCap} · 직구 최고{" "}
                {Math.round(fastballSpeed(STAGES.pro.statCap))} km/h
              </p>
              <ul>
                {LEGEND_PITCHES.map((id) => {
                  const x = ALL_PITCHES.find((x) => x.id === id)!;
                  return (
                    <li key={id} className="good">
                      {x.name}
                    </li>
                  );
                })}
              </ul>
              <span>고교 무대에서도 능력치 상한 {STAGES.pro.statCap}</span>
            </div>
          ) : (
            p && (
              <div
                className="hidden-pitch-card"
                style={{ "--pitch-color": p.color } as React.CSSProperties}
              >
                <small>HIDDEN PITCH · {p.en}</small>
                <strong>{p.name}</strong>
                <p>{p.desc}</p>
                <ul>
                  {pitchTraits(p).map((t) => (
                    <li key={t.text} className={t.good ? "good" : "bad"}>
                      {t.text}
                    </li>
                  ))}
                </ul>
                <span>
                  투구 플랜에서 <kbd>{p.key}</kbd> 키로 선택
                </span>
              </div>
            )
          )}
          {tar ? (
            <div className="guide-notice-actions">
              <button className="primary-button" onClick={() => engine.clearHiddenUnlock()}>
                받아들이기 <Play size={16} />
              </button>
              <button
                className="subtle-button"
                onClick={() => {
                  engine.declinePineTar();
                  toast.success("파인타르를 돌려줬습니다 · 정정당당하게 던집니다");
                }}
              >
                거절하기
              </button>
            </div>
          ) : (
            <button className="primary-button" onClick={() => engine.clearHiddenUnlock()}>
              받아들이기 <Play size={16} />
            </button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
/** Starting roulette: "a blessing from the baseball gods" grants one random pitch. */
function BlessingDialog({
  engine,
  s,
  onFinish,
}: {
  engine: BaseballEngine;
  s: GameState;
  onFinish: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "spinning" | "done">("idle");
  const [reel, setReel] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const won = ALL_PITCHES.find((p) => p.id === s.career.blessing);
  const tier = BLESSINGS.find((b) => b.id === s.career.blessing)?.tier;
  const open =
    (s.career.created && !!s.career.team && s.career.blessing === "") || phase !== "idle";
  const CARD = 128;
  const spin = () => {
    const id = engine.receiveBlessing();
    if (!id) return;
    // A long reel of random pitches that stops on the granted one.
    const items = Array.from({ length: 34 }, () => {
      // The reel shows pitches as often as they can actually come up.
      let r = Math.random() * BLESSINGS.reduce((a, b) => a + b.weight, 0);
      return (BLESSINGS.find((b) => (r -= b.weight) < 0) ?? BLESSINGS[0]).id as string;
    });
    items[30] = id;
    setReel(items);
    setOffset(0);
    setPhase("spinning");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setOffset(30 * CARD + (Math.random() - 0.5) * CARD * 0.5)),
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && phase === "done") {
          setPhase("idle");
          onFinish();
        }
      }}
    >
      <DialogContent className="blessing-dialog" showCloseButton={phase === "done"}>
        <DialogHeader>
          <DialogTitle>
            <Sparkles size={18} /> 야구의 신이 내리는 은총
          </DialogTitle>
          <DialogDescription>
            고교 마지막 시즌의 첫날. 마운드에 선 당신에게 신이 구종 하나를 선물합니다. 포심·슬라이더
            말고 {BLESSINGS.length}개 구종 가운데 무엇이 손끝에 깃들지는 하늘만이 압니다.
          </DialogDescription>
        </DialogHeader>
        <div className={`blessing-reel ${phase}`}>
          <div
            className="reel-strip"
            style={{
              transform: `translateX(calc(50% - ${CARD / 2}px - ${offset}px))`,
              transition:
                phase === "spinning" && offset
                  ? "transform 4.2s cubic-bezier(.08,.7,.12,1)"
                  : "none",
            }}
            onTransitionEnd={(e) => {
              if (e.target !== e.currentTarget) return;
              setOffset(30 * CARD);
              setPhase("done");
            }}
          >
            {(reel.length ? reel : BLESSINGS.map((b) => b.id)).map((id, i) => {
              const p = ALL_PITCHES.find((p) => p.id === id)!;
              const b = BLESSINGS.find((b) => b.id === id)!;
              return (
                <div
                  key={i}
                  className={`reel-card tier-${b.tier} ${phase === "done" && i === 30 ? "winner" : ""}`}
                  style={{ "--pitch-color": p.color, width: CARD } as React.CSSProperties}
                >
                  <small>{b.tier}</small>
                  <strong>{p.name}</strong>
                  <span>{p.en}</span>
                </div>
              );
            })}
          </div>
          <i className="reel-pointer" />
        </div>
        {phase === "done" && won ? (
          <div className="blessing-result">
            <span className={`tier-badge tier-${tier}`}>{tier}</span>
            <h3>{josa(won.name, "이가")} 손끝에 깃들었다</h3>
            <p>{won.desc} · 포심·슬라이더와 함께 바로 던질 수 있습니다.</p>
            <button
              className="primary-button"
              onClick={() => {
                setPhase("idle");
                onFinish();
              }}
            >
              은총을 받고 훈련 시작 <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <div className="blessing-result">
            <div className="blessing-odds">
              {[...new Set(BLESSINGS.map((b) => b.tier))].map((tier) => {
                const list = BLESSINGS.filter((b) => b.tier === tier);
                return (
                  <div key={tier} className={`odds-tier tier-${tier}`}>
                    <b>
                      {tier} {list.reduce((a, b) => a + b.weight, 0)}%
                    </b>
                    {list.map((b) => (
                      <span key={b.id}>
                        {ALL_PITCHES.find((p) => p.id === b.id)!.name} <em>{b.weight}%</em>
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
            <button className="primary-button" disabled={phase === "spinning"} onClick={spin}>
              <Sparkles size={16} />
              {phase === "spinning" ? "신의 뜻을 기다리는 중…" : "기도하고 룰렛 돌리기"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const GUIDE_NOTICE_KEY = "diamond-road-guide-notice";
const BUILD_LABEL = (() => {
  const d = new Date(__BUILD__);
  return Number.isNaN(d.getTime())
    ? "개발용"
    : `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
})();
/** T: the cheer squad (pros only, once per match). Explains why when it cannot be used. */
const triggerCheer = (engine: BaseballEngine) => {
  const s = engine.state;
  if (engine.cheer())
    toast.success(`📣 응원단과 팬들의 함성! 이번 이닝 상대 능력치 −${CHEER_DROP}`);
  else if (s.mode !== "match") toast.error("응원은 시즌 경기에서만 쓸 수 있어요");
  else if (s.career.stage !== "pro") toast.error("응원 스킬은 프로 무대부터 열려요");
  else if (s.cheerUsed) toast.error("응원은 경기당 한 번만 쓸 수 있어요");
};
/** Role modes: how fast the AI's half plays (picked on the field, remembered). */
const AUTO_SPEEDS = [1, 2, 4, 8];
const AUTO_SPEED_KEY = "diamond-road-auto-speed";
/** G: limit break for the next pitch (every stat 250 first; 3 free a match, then stamina). */
const triggerLimit = (engine: BaseballEngine) => {
  const s = engine.state,
    cost = engine.limitCost;
  if (engine.autoHalf) {
    toast.error("AI가 진행하는 동안에는 쓸 수 없어요 · 내 차례에 써 주세요");
    return;
  }
  if (engine.limitBreak())
    toast.success(
      `⚡ 한계 돌파! 다음 1구 모든 능력치 ${LIMIT_BREAK}${cost ? ` · 체력 −${cost}` : ` · 무료 ${s.limitUsed}/${RULES.limitBreakFree}`}`,
    );
  else if (!engine.canLimitBreak)
    toast.error(`한계 돌파는 모든 능력치가 ${LIMITLESS_CAP}이 되면 열려요`);
  else if (s.mode !== "match") toast.error("한계 돌파는 시즌 경기에서만 쓸 수 있어요");
  else if (engine.limitActive) toast.error("이미 한계 돌파가 준비되어 있어요 · 다음 1구에 적용");
  else if (s.phase !== "ready" && s.phase !== "between")
    toast.error("투구가 끝난 뒤, 다음 공을 기다릴 때 쓸 수 있어요");
  else if (s.energy < cost)
    toast.error(`무료 ${RULES.limitBreakFree}회를 다 썼어요 · 체력 ${cost}이 필요해요`);
};
const triggerPineTar = (engine: BaseballEngine) => {
  const s = engine.state;
  if (!s.career.pineTar) return;
  if (engine.applyPineTar())
    toast.warning(
      `🫙 파인타르를 몰래 발랐다 · 구속·구위·제구 +${PINE_TAR_BOOST} · 공을 던질 때마다 ${Math.round(RULES.pineTarCatch * 100)}% 확률로 심판 검사`,
    );
  else if (s.mode !== "match") toast.error("파인타르는 시즌 경기에서만 쓸 수 있어요");
  else if (s.pineTar) toast.error("이미 파인타르를 발랐어요");
  else if (s.phase !== "ready" && s.phase !== "between")
    toast.error("투구가 끝난 뒤, 다음 공을 기다릴 때 쓸 수 있어요");
};
/** Skill buttons (T cheer, G limit break, V pine tar) with their current state. */
function SkillBar({ engine, s }: { engine: BaseballEngine; s: GameState }) {
  const cheerOpen = s.career.stage === "pro",
    limitOpen = engine.canLimitBreak,
    tarOpen = !!s.career.pineTar && engine.role !== "batter";
  if (s.mode !== "match" || (!cheerOpen && !limitOpen && !tarOpen)) return null;
  return (
    <div className="skill-bar" aria-label="스킬">
      {tarOpen && (
        <button
          className={`skill tar ${s.pineTar ? "on" : ""}`}
          disabled={s.pineTar || s.ejected}
          onClick={() => triggerPineTar(engine)}
          title={`이번 경기 동안 구속·구위·제구 +${PINE_TAR_BOOST}. 공을 던질 때마다 ${Math.round(RULES.pineTarCatch * 100)}% 확률로 심판이 검사 · 걸리면 퇴장(패배)·모든 능력치 −${PINE_TAR_PENALTY}·불명예`}
        >
          <kbd>V</kbd> 🫙 파인타르
          <small>
            {s.pineTar
              ? `효과 중 · 검사 ${Math.round(RULES.pineTarCatch * 100)}%/구`
              : `투구 +${PINE_TAR_BOOST} · 위험`}
          </small>
        </button>
      )}
      {cheerOpen && (
        <button
          className={`skill ${engine.cheerActive ? "on" : ""}`}
          disabled={s.cheerUsed && !engine.cheerActive}
          onClick={() => triggerCheer(engine)}
          title={`우리 팀 치어리더와 팬들의 응원으로 한 이닝 동안 상대 능력치 −${CHEER_DROP} (경기당 1회)`}
        >
          <kbd>T</kbd> 📣 응원
          <small>
            {engine.cheerActive ? "효과 중" : s.cheerUsed ? "사용함" : `상대 −${CHEER_DROP} · 1회`}
          </small>
        </button>
      )}
      {limitOpen && (
        <button
          className={`skill limit ${engine.limitActive ? "on" : ""}`}
          disabled={engine.limitActive}
          onClick={() => triggerLimit(engine)}
          title={`다음 투구 1회(던지기 또는 타격) 동안 모든 능력치 ${LIMIT_BREAK}. 경기당 ${RULES.limitBreakFree}회 무료, 이후 1회마다 체력 −${RULES.limitBreakEnergy}`}
        >
          <kbd>G</kbd> ⚡ 한계 돌파
          <small>
            {engine.limitActive
              ? "다음 1구 적용"
              : engine.limitCost
                ? `체력 −${engine.limitCost} · 다음 1구`
                : `무료 ${RULES.limitBreakFree - s.limitUsed}/${RULES.limitBreakFree} · 다음 1구`}
          </small>
        </button>
      )}
    </div>
  );
}
/** 1st team (after its promotion match) and the majors: the trust gauge no longer moves. */
const trustMaxed = (s: GameState) =>
  tierOf(s.career) === "mlb" || (tierOf(s.career) === "first" && s.lastMlb.length > 0);
/** Big centre-screen callout ("폭투", "풀카운트") for about 1.4 s; clicks pass through. */
function Callout({ s }: { s: GameState }) {
  const [shown, setShown] = useState<GameState["flash"]>(null);
  useEffect(() => {
    if (!s.flash) return;
    setShown(s.flash);
    const t = window.setTimeout(() => setShown(null), 1400);
    return () => window.clearTimeout(t);
  }, [s.flash?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;
  return (
    <div key={shown.id} className={`callout ${shown.tone}`} role="status">
      {shown.text}
    </div>
  );
}
/**
 * Rain: before each new inning a coin decides whether play goes on (75%) or the match is
 * called (25%). The coin spins for a moment, then shows its face and the verdict.
 */
function CoinToss({ coin, onDone }: { coin: NonNullable<GameState["coin"]>; onDone: () => void }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    setRevealed(false);
    const t = window.setTimeout(() => {
      setRevealed(true);
      onDone();
    }, 1700);
    return () => window.clearTimeout(t);
  }, [coin]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = coin.result === "go";
  return (
    <div className="coin-toss">
      <div className={`coin ${revealed ? (go ? "face-go" : "face-cancel") : "spinning"}`}>
        <span className="coin-front">진행</span>
        <span className="coin-back">취소</span>
      </div>
      <strong className={revealed ? (go ? "go" : "cancel") : ""}>
        {revealed ? (go ? "경기 진행" : "우천취소") : "동전을 던집니다…"}
      </strong>
      <small>
        앞면(진행) {Math.round(RULES.rainContinue * 100)}% · 뒷면(취소){" "}
        {Math.round((1 - RULES.rainContinue) * 100)}%
      </small>
    </div>
  );
}
/** "한강 트리플스 2군", "뉴욕 하버 나이츠", or the school. */
const clubLine = (c: Career) => {
  const tier = tierOf(c);
  if (tier === "mlb") {
    const m = mlbTeamOf(c.mlbClub);
    return m ? `${m.city} ${m.name}` : "MLB";
  }
  const t = teamOf(c.club);
  if (tier === "high" || !t) return "미산고등학교 야구부";
  return `${t.city} ${t.name}${tier === "farm" ? " 2군" : ""}`;
};
/** Developer-mode password (a simple lock for testers, not real security). */
const DEV_CODE = "1324";
export default function DiamondGame() {
  const [engine] = useState(() => new BaseballEngine());
  // Development only: lets browser tests drive the engine. Stripped from production builds.
  if (import.meta.env.DEV) (window as unknown as { __engine?: BaseballEngine }).__engine = engine;
  const s = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const [view, setView] = useState<"life" | "game">("life"),
    [recap, setRecap] = useState<{
      day: number;
      message: string;
      score: string;
      xp: number;
      scout: { before: number; after: number } | null;
      scoutParts: RecapLine[];
      xpParts: RecapLine[];
    } | null>(null),
    [help, setHelp] = useState(false),
    [settings, setSettings] = useState(false),
    [coinSeen, setCoinSeen] = useState<GameState["coin"]>(null),
    [devUnlocked, setDevUnlocked] = useState(false),
    [devCode, setDevCode] = useState(""),
    [devFails, setDevFails] = useState(0),
    [manualPause, setManualPause] = useState(false),
    [pending, setPending] = useState<Mode | null>(null),
    [guideNotice, setGuideNotice] = useState(false),
    [rouletteDone, setRouletteDone] = useState(false),
    [aiLab, setAiLab] = useState(false),
    [autoSpeed, setAutoSpeed] = useState(() => {
      try {
        const v = Number(localStorage.getItem(AUTO_SPEED_KEY));
        return AUTO_SPEEDS.includes(v) ? v : 2;
      } catch {
        return 2;
      }
    });
  // "Read the guide" notice, once per browser: after the starting roulette (a start that skips
  // it, or a career that already had it, gets it as soon as nothing else is on screen).
  const startedAtLoad = useRef(s.career.created && s.career.blessing !== "");
  useEffect(() => {
    const c = s.career;
    let seen = true;
    try {
      seen = localStorage.getItem(GUIDE_NOTICE_KEY) === "1";
    } catch {}
    const ready =
      c.created &&
      !!c.team &&
      c.blessing !== "" &&
      !s.hiddenUnlock &&
      (rouletteDone || startedAtLoad.current || c.blessing === "legend" || c.blessing === "none");
    if (seen || !ready || guideNotice) return;
    try {
      localStorage.setItem(GUIDE_NOTICE_KEY, "1");
    } catch {}
    setGuideNotice(true);
  }, [
    s.career,
    s.career.created,
    s.career.team,
    s.career.blessing,
    s.hiddenUnlock,
    rouletteDone,
    guideNotice,
  ]);
  // Hall of fame: a career played while the developer password is open gets the badge
  // (also a career started while it is still open). The mark is never removed.
  useEffect(() => {
    if (devUnlocked && !s.career.devUsed) {
      s.career.devUsed = true;
      engine.persist();
    }
  }, [devUnlocked, s.career, engine]);
  // Personal save code: the career goes up after every match (and day / stage change).
  // Difficulty sets the rival team's runner/fielder AI.
  useEffect(() => {
    applyLevel(engine, s.difficulty);
  }, [engine, s.difficulty]);
  // The first sync after opening the game is also the check for a newer save elsewhere.
  const staleAsked = useRef(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      void syncCareer(s.career).then((r) => {
        if (r === "stale" && !staleAsked.current) {
          staleAsked.current = true;
          toast("다른 컴퓨터에서 더 진행한 기록이 있어요", {
            description: "이 컴퓨터의 기록은 저장 코드에 올리지 않았어요. 최신 기록을 불러올까요?",
            duration: Infinity,
            action: {
              label: "불러오기",
              onClick: () =>
                void pullCareer(engine).then((ok) => {
                  staleAsked.current = false;
                  if (ok) {
                    setView("life");
                    toast.success("최신 기록을 불러왔어요");
                  } else toast.error("불러오지 못했어요 · 잠시 뒤 설정에서 다시 해 주세요");
                }),
            },
          });
        } else if (r === "other-career") {
          saveCode(null);
          toast("저장 코드 연결을 풀었어요", {
            description: "그 코드는 다른 선수의 기록이에요. 이 선수는 설정에서 새 코드를 받아 주세요.",
          });
        }
      });
    }, 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.career.games, s.career.day, s.career.stage, s.career.league, s.career.name, s.career.hofNick]);
  const stage = useRef<HTMLDivElement>(null);
  const sfx = useRef(new Sfx());
  // A quiet crowd murmur under matches (only with match sounds on).
  useEffect(() => {
    sfx.current.ambient(view === "game" && s.sound && s.mode === "match" && !aiLab);
  }, [view, s.sound, s.mode, aiLab]);
  const [innings, setInnings] = useState(3);
  const batting = engine.batting;
  const newGame = (mode: Mode) => {
    if (engine.matchActive) {
      setPending(mode);
      return;
    }
    engine.start(mode, innings);
    setManualPause(false);
  };
  useEffect(() => {
    engine.load();
    // A match left in the middle (refresh, closed tab) picks up where it stopped.
    if (engine.resumeMatch()) {
      setView("game");
      toast.success("하던 경기를 이어서 합니다");
    }
    engine.onSound((kind) => sfx.current.play(kind));
    return () => {
      sfx.current.close();
    };
  }, [engine]);
  // A tab left open keeps running the old version. Every 2 minutes, compare this page's script
  // with the one now on the site and offer a reload when a new build is out.
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const mine = document
      .querySelector<HTMLScriptElement>('script[src*="assets/index-"]')
      ?.src.split("/")
      .pop();
    if (!mine) return;
    let told = false;
    const check = async () => {
      try {
        const html = await (
          await fetch(`index.html?v=${Date.now()}`, { cache: "no-store" })
        ).text();
        const live = /assets\/(index-[^"']+\.js)/.exec(html)?.[1];
        if (live && live !== mine && !told) {
          told = true;
          toast("새 버전이 올라왔어요", {
            description: "새로고침하면 최신 버전으로 플레이합니다 (선수 기록은 그대로).",
            duration: Infinity,
            action: { label: "새로고침", onClick: () => location.reload() },
          });
        }
      } catch {}
    };
    const id = window.setInterval(check, 120000);
    void check();
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    engine.set(
      "paused",
      view !== "game" || help || settings || !!pending || manualPause || guideNotice,
    );
  }, [view, help, settings, pending, manualPause, engine, guideNotice]);
  // H: the guide (조작법) opens and closes from anywhere (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyH" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest?.("input,textarea,[role=combobox]")) return;
      setHelp((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        view !== "game" ||
        help ||
        settings ||
        pending ||
        target?.closest?.("input,textarea,[role=combobox]")
      )
        return;
      const k = keyOf(e);
      // A focused slider (투구 강도) keeps its arrow keys; every other shortcut still works.
      if (target?.closest?.("[role=slider]") && k.startsWith("arrow")) return;
      engine.keys.add(k);
      if (e.repeat) return;
      // P / Esc pause the game.
      if (k === "p" || k === "escape") {
        setManualPause((v) => !v);
        return;
      }
      if (engine.state.paused) return;
      if (engine.state.phase === "inplay" && engine.state.live) {
        if (["1", "2", "3", "4"].includes(k)) engine.selectThrowBase(Number(k));
      } else {
        const p = ALL_PITCHES.find((p) => p.key === k);
        if (p) engine.selectPitch(p.id);
      }
      if (k === " " && !target?.closest?.("button,[role=button],[role=slider]")) {
        e.preventDefault();
        engine.batting ? engine.swing() : engine.throwAt();
      }
      if (k === "c") {
        const i = cameras.findIndex((c) => c.id === engine.state.camera);
        engine.set("camera", cameras[(i + 1) % 5].id);
      }
      if (k === "r") engine.resetPitch();
      if (k === "e") engine.steal();
      if (k === "t") triggerCheer(engine);
      if (k === "g") triggerLimit(engine);
      if (k === "v") triggerPineTar(engine);
      // F: pickoff throw to the lowest occupied base.
      if (k === "f") engine.pickoff(engine.state.bases.findIndex(Boolean) + 1);
      if (k.startsWith("arrow")) {
        e.preventDefault();
        const a = engine.state.aim,
          side = engine.batting ? -1 : 1;
        engine.setAim(
          a.x + side * (k === "arrowright" ? 0.04 : k === "arrowleft" ? -0.04 : 0),
          a.y + (k === "arrowup" ? 0.04 : k === "arrowdown" ? -0.04 : 0),
        );
        engine.emit();
      }
    };
    const up = (e: KeyboardEvent) => engine.keys.delete(keyOf(e));
    const blur = () => {
      engine.keys.clear();
      setManualPause(true);
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [engine, view, help, settings, pending]);
  useEffect(() => {
    type Tool = {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean };
      execute: (input: unknown) => unknown;
    };
    const context = (
      document as Document & {
        modelContext?: { registerTool: (tool: Tool, options: { signal: AbortSignal }) => unknown };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const abort = new AbortController();
    const tools: Tool[] = [
      {
        name: "read_baseball_state",
        description: "현재 경기의 이닝, 카운트, 점수, 조작 가능 상태와 선수 기록 조회",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: () => ({
          phase: engine.state.phase,
          mode: engine.state.mode,
          paused: engine.state.paused,
          inning: engine.state.inning,
          half: engine.state.half,
          score: engine.state.score,
          balls: engine.state.balls,
          strikes: engine.state.strikes,
          outs: engine.state.outs,
          bases: engine.state.bases,
          pitch: engine.state.selected,
          lastResult: engine.state.lastResult,
        }),
      },
      {
        name: "select_baseball_pitch",
        description: "다음 투구의 구종 선택. 대기 중에만 가능",
        inputSchema: {
          type: "object",
          properties: { pitch: { type: "string", enum: ALL_PITCHES.map((p) => p.id) } },
          required: ["pitch"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: (input) => {
          const p = (input as { pitch: string })?.pitch;
          if (!ALL_PITCHES.some((x) => x.id === p) || engine.state.phase !== "ready")
            throw new Error("유효한 구종과 투구 대기 상태가 필요합니다");
          engine.selectPitch(p as GameState["selected"]);
          return { pitch: engine.state.selected };
        },
      },
      {
        name: "throw_baseball_at_target",
        description:
          "홈플레이트 목표점을 지정하고 실제 한 구를 투구. x는 좌우 미터, y는 지상 높이 미터",
        inputSchema: {
          type: "object",
          properties: {
            x: { type: "number", minimum: -0.7, maximum: 0.7 },
            y: { type: "number", minimum: 0.15, maximum: 1.85 },
          },
          required: ["x", "y"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: (input) => {
          const p = input as { x: number; y: number };
          if (
            !p ||
            !Number.isFinite(p.x) ||
            !Number.isFinite(p.y) ||
            Math.abs(p.x) > 0.7 ||
            p.y < 0.15 ||
            p.y > 1.85
          )
            throw new Error("조준 범위를 벗어났습니다");
          if (!engine.throwAt(p.x, p.y)) throw new Error("지금은 투구할 수 없습니다");
          return { phase: engine.state.phase, target: engine.state.flight?.aim };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: abort.signal })).catch(() => {});
      } catch {}
    }
    return () => abort.abort();
  }, [engine]);
  const pitch = ALL_PITCHES.find((p) => p.id === s.selected)!;
  const hiddenOwned = s.career.pitches.filter(isHiddenPitch).length,
    regularOwned = s.career.pitches.length - hiddenOwned;
  const canPitch = s.phase === "ready" && !s.paused;
  const status =
    s.phase === "inplay"
      ? s.live?.state
      : s.phase === "ready"
        ? batting
          ? "타격 준비"
          : "투구 준비"
        : s.phase === "windup"
          ? "와인드업"
          : s.phase === "flight"
            ? "승부 중"
            : s.phase === "between"
              ? "공수 교대"
              : s.phase === "finished"
                ? "경기 종료"
                : "투구 결과";
  return (
    <main className="diamond-app">
      <Toaster theme="dark" position="bottom-center" />
      <CreationDialog engine={engine} s={s} />
      <BlessingDialog engine={engine} s={s} onFinish={() => setRouletteDone(true)} />
      <HiddenDialog engine={engine} s={s} />
      <NightDialog s={s} recap={recap} onClose={() => setRecap(null)} />
      <EndingDialog
        engine={engine}
        s={s}
        blocked={!!recap || view !== "life"}
        onPro={() => setView("life")}
      />
      <header className="app-header">
        <div className="brand-row">
          <a
            className="brand"
            href="#"
            aria-label="다이아몬드 로드"
            onClick={(e) => {
              e.preventDefault();
              setView("life");
            }}
          >
            <span className="brand-mark">D</span>
            <span>
              DIAMOND <b>ROAD</b>
              <small>
                {s.career.stage === "pro" ? TIER_NAMES[tierOf(s.career)] : "고교 에이스"}
              </small>
            </span>
          </a>
          <PatchNotesButton />
          <HallOfFameButton engine={engine} career={s.career} />
          <button className="patch-button" onClick={() => setHelp(true)} aria-label="조작법">
            <BookOpen size={15} />
            <span>조작법</span>
          </button>
        </div>
        <button
          className="life-status"
          onClick={() => setView("life")}
          aria-label="오늘 하루 일정 보기"
        >
          <CalendarDays size={16} />
          <b>DAY {s.career.day}</b>
          <span>
            {view === "game" && s.mode !== "match"
              ? "자율 연습 중"
              : engine.matchActive || (view === "game" && s.mode === "match")
                ? "오후 · 시즌 경기"
                : s.career.actions > 0
                  ? `아침 · 행동력 ${s.career.actions}/${DAY_ACTIONS}`
                  : "오후 · 경기 전"}
          </span>
        </button>
        <div className="header-actions">
          <span className="prototype-tag">
            플레이 테스트 <b>05</b>
          </span>
          <button className="icon-button" onClick={() => setSettings(true)} aria-label="설정">
            <Settings2 size={20} />
          </button>
        </div>
      </header>
      <div className="game-view" hidden={view !== "game"} onDragStart={(e) => e.preventDefault()}>
        <div className="mode-row">
          <div className="mode-buttons">
            <button className="back-to-day" onClick={() => setView("life")}>
              ← 하루 일정
              <span>{s.mode === "match" ? "경기는 일시 정지" : "연습 끝내기"}</span>
            </button>
            <button className="active">
              {modes.find((m) => m.id === s.mode)!.label}
              <span>{modes.find((m) => m.id === s.mode)!.sub}</span>
            </button>
          </div>
          <span className="park-label">
            <Flag size={14} />
            {s.career.stage === "pro" ? "프로 구장" : "미산 야구장"}{" "}
            <span>
              15:00 ·{" "}
              {(view === "game" && s.mode === "match" ? s.weather : engine.forecast) === "rain"
                ? "🌧 비"
                : "☀ 맑음"}
            </span>
          </span>
        </div>
        <div className="game-layout">
          <section className="game-main">
            <Scoreboard s={s} />
            <div
              className={`game-stage ${batting && (s.phase === "windup" || s.phase === "flight") ? "batting-live" : ""}`}
              ref={stage}
            >
              <Field engine={engine} frozen={aiLab} speed={autoSpeed} />
              {engine.autoHalf && (
                <div className="auto-speed" role="group" aria-label="AI 진행 배속">
                  <span>
                    {engine.role === "pitcher" ? "우리 공격" : "우리 수비"} · AI가 진행 중
                  </span>
                  {AUTO_SPEEDS.map((v) => (
                    <button
                      key={v}
                      className={v === autoSpeed ? "on" : undefined}
                      aria-pressed={v === autoSpeed}
                      onClick={() => {
                        setAutoSpeed(v);
                        try {
                          localStorage.setItem(AUTO_SPEED_KEY, String(v));
                        } catch {}
                      }}
                    >
                      ×{v}
                    </button>
                  ))}
                </div>
              )}
              <div className="field-top">
                <div className="chip-stack">
                  <span className="inning-chip">{batting ? "공격 · 타격" : "수비 · 투구"}</span>
                  {s.mode === "match" && (
                    <span className="xp-chip">
                      DAY {s.career.day} · 경기 XP +{s.matchXp}
                    </span>
                  )}
                  {s.mode === "match" &&
                    s.career.stage === "pro" &&
                    (teamOf(s.career.club) || tierOf(s.career) === "mlb") && (
                      <span
                        className="xp-chip scout-chip"
                        style={
                          {
                            "--team-color":
                              mlbTeamOf(s.career.mlbClub)?.color ?? teamOf(s.career.club)?.color,
                          } as React.CSSProperties
                        }
                      >
                        {tierOf(s.career) === "mlb"
                          ? `🌎 MLB · 하드 모드 · 무한 모드`
                          : tierOf(s.career) === "first"
                            ? `🌎 MLB 스카우트 ${MLB_TEAMS.length}명 관전 · 최고 ${Math.round(Math.max(...MLB_TEAMS.map((t) => s.career.mlbScouts?.[t.id] ?? 0)))}`
                            : `🏟 ${teamOf(s.career.club)!.name} 2군 · 1군 신뢰도 ${Math.round(s.career.scout)}`}
                      </span>
                    )}
                  {s.mode === "match" && s.career.stage !== "pro" && teamOf(s.career.team) && (
                    <span
                      className="xp-chip scout-chip"
                      style={
                        { "--team-color": teamOf(s.career.team)!.color } as React.CSSProperties
                      }
                    >
                      👀 {teamOf(s.career.team)!.name} 스카우트 관전 · 평가{" "}
                      {Math.round(s.career.scout)}
                    </span>
                  )}
                  {engine.raining && (
                    <span className="xp-chip skill-chip rain">
                      🌧 비 · 제구·구속·주루 저하 · 수비 실수 증가
                    </span>
                  )}
                  {engine.cheerActive && (
                    <span className="xp-chip skill-chip cheer">
                      📣 응원 효과 · 상대 능력치 −{CHEER_DROP} ({s.cheerInning}회)
                    </span>
                  )}
                  {/* Pine tar (once unlocked): a button on the field itself while pitching,
                      so it is seen without looking at the side panel. */}
                  {s.mode === "match" &&
                    !!s.career.pineTar &&
                    engine.role !== "batter" &&
                    !batting &&
                    !s.ejected &&
                    (s.pineTar ? (
                      <span className="xp-chip skill-chip tar">
                        🫙 파인타르 효과 중 · 투구 +{PINE_TAR_BOOST} · 검사{" "}
                        {Math.round(RULES.pineTarCatch * 100)}%/구
                      </span>
                    ) : (
                      <button
                        className="xp-chip skill-chip tar tar-use"
                        onClick={() => triggerPineTar(engine)}
                        title={`이번 경기 동안 구속·구위·제구 +${PINE_TAR_BOOST}. 공을 던질 때마다 ${Math.round(RULES.pineTarCatch * 100)}% 확률로 심판이 검사 · 걸리면 퇴장(패배)·모든 능력치 −${PINE_TAR_PENALTY}·불명예`}
                      >
                        🫙 파인타르 바르기 <kbd>V</kbd>
                        <small>투구 +{PINE_TAR_BOOST} · 위험</small>
                      </button>
                    ))}
                  {engine.limitActive && (
                    <span className="xp-chip skill-chip limit">
                      ⚡ 한계 돌파 · 이번 1구 모든 능력치 {LIMIT_BREAK}
                    </span>
                  )}
                </div>
                <div className="field-actions">
                  <button
                    className="glass-button"
                    onClick={() => setManualPause((v) => !v)}
                    aria-label={manualPause ? "경기 재개" : "일시 정지"}
                  >
                    {manualPause ? <Play size={16} /> : <Pause size={16} />}
                  </button>
                  <button
                    className="glass-button"
                    aria-label={s.sound ? "소리 끄기" : "소리 켜기"}
                    onClick={() => engine.set("sound", !s.sound)}
                  >
                    {s.sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  </button>
                  <button
                    className="glass-button"
                    aria-label="전체 화면"
                    onClick={() => {
                      if (document.fullscreenElement) void document.exitFullscreen();
                      else
                        void stage.current
                          ?.requestFullscreen()
                          .catch(() => toast("브라우저에서 전체 화면을 지원하지 않습니다"));
                    }}
                  >
                    <Maximize2 size={16} />
                  </button>
                </div>
              </div>
              {batting && (s.phase === "flight" || s.phase === "windup") && s.flight && (
                <div className="timing-gauge">
                  <span>
                    {s.phase === "windup"
                      ? "준비"
                      : s.flight.swung
                        ? "스윙!"
                        : Math.abs(s.flight.elapsed / s.flight.visualDuration - SWING_SWEET) <=
                            SWING_GOOD
                          ? "지금!"
                          : "타이밍"}
                  </span>
                  <TimingBar s={s} className="timing-track" />
                </div>
              )}
              <div
                className={`field-message ${s.resultTone} ${s.phase === "result" ? "big-result" : ""}`}
                aria-live="polite"
                hidden={batting && (s.phase === "flight" || s.phase === "windup")}
              >
                <strong>{s.message}</strong>
                <span>{s.detail}</span>
              </div>
              <div className="field-bottom">
                <div className="pitcher-badge">
                  <span className="uniform-number">18</span>
                  <div>
                    <small>
                      {batting
                        ? `${(s.order[1] % 9) + 1}번 타자${engine.playerUp ? " · 나" : ""}`
                        : "마운드"}
                    </small>
                    <strong>{batting ? playerLabel(engine.batter) : s.career.name}</strong>
                    <span>
                      {batting
                        ? `${engine.batter.hand === "L" ? "좌" : "우"}타 · 컨택 ${engine.batter.contact} · 파워 ${engine.batter.power} · 주력 ${engine.batter.speed}`
                        : `우완 투수 · ${matchTeams(s.career)[1]}`}
                    </span>
                  </div>
                </div>
                <div className={`speed-readout ${speedTier(s.lastSpeed).cls}`}>
                  <b>{s.lastSpeed || "—"}</b>
                  <span>
                    km/h<small>{s.lastPitch}</small>
                    {speedTier(s.lastSpeed).label && <em>{speedTier(s.lastSpeed).label}</em>}
                  </span>
                </div>
              </div>
              <Callout s={s} />
              {(manualPause || s.phase === "between" || s.phase === "finished") && (
                <div className="game-overlay">
                  <span className="eyebrow">DIAMOND ROAD</span>
                  <h2>{manualPause ? "잠시, 숨 고르기." : s.message}</h2>
                  <p>{manualPause ? "준비되면 경기를 이어가세요." : s.detail}</p>
                  {!manualPause && s.phase === "between" && s.coin && (
                    <CoinToss coin={s.coin} onDone={() => setCoinSeen(s.coin)} />
                  )}
                  {!manualPause && s.phase === "finished" && (
                    <>
                      {s.lastScout && (
                        <ScoutMeter
                          s={s}
                          before={s.lastScout.before}
                          after={s.lastScout.after}
                          big
                        />
                      )}
                      <RecapBreakdown
                        scoutParts={trustMaxed(s) ? [] : s.lastScoutParts}
                        xpParts={s.lastXpParts}
                        scoutLabel={gaugeName(s.career)}
                      />
                      <p>
                        경험치 <b>+{s.lastXpGain} XP</b> 획득 · 보유 {s.career.xp} XP
                      </p>
                    </>
                  )}
                  <button
                    className="primary-button"
                    // Wait for the coin to land before going on.
                    disabled={
                      !manualPause && s.phase === "between" && !!s.coin && coinSeen !== s.coin
                    }
                    onClick={() => {
                      if (manualPause) setManualPause(false);
                      else if (s.phase === "between") engine.continueInning();
                      else {
                        setRecap({
                          day: s.career.day - 1,
                          message: s.message,
                          score: (([away, home]) =>
                            `${home} ${s.score[1]} : ${s.score[0]} ${away}`)(
                            matchTeams({ ...s.career, day: s.career.day - 1 }),
                          ),
                          xp: s.lastXpGain,
                          scout: s.lastScout,
                          scoutParts: s.lastScoutParts,
                          xpParts: s.lastXpParts,
                        });
                        engine.start("match");
                        setView("life");
                      }
                    }}
                  >
                    <Play size={17} />
                    {manualPause
                      ? "경기 재개"
                      : s.phase === "between" && s.coin?.result === "cancel"
                        ? coinSeen === s.coin
                          ? "우천취소 · 경기 종료"
                          : "동전 결과 기다리는 중"
                        : s.phase === "between"
                          ? s.half === "top"
                            ? "타격 시작"
                            : "다음 이닝 투구"
                          : "하루 마무리하기"}
                  </button>
                </div>
              )}
            </div>
            <div className="camera-row">
              <span>
                <CameraIcon size={15} />
                카메라
              </span>
              <div>
                {cameras.map((c, i) => (
                  <button
                    key={c.id}
                    className={s.camera === c.id ? "active" : ""}
                    onClick={() => engine.set("camera", c.id)}
                  >
                    {c.label}
                    <small>{i + 1}</small>
                  </button>
                ))}
              </div>
              <kbd>C</kbd>
            </div>
            <div className="below-field">
              <LineScore s={s} />
              <div className="match-report">
                <span className="eyebrow">직전 플레이</span>
                <p>{s.log[0]}</p>
                <span>
                  투구 {s.pitchCount[1]} · 스트라이크{" "}
                  {s.practice.pitches
                    ? Math.round((s.practice.strikes / s.practice.pitches) * 100)
                    : 0}
                  %
                </span>
              </div>
              {s.mode === "match" && <TeamStrength engine={engine} />}
            </div>
          </section>
          <aside className="pitch-panel compact">
            <div className="pp-head">
              <h2>{batting ? "타격 플랜" : "투구 플랜"}</h2>
              <span className="status-pill">{status}</span>
            </div>
            {/* Skills at the top: at the bottom the long pitch list pushed them off screen. */}
            <SkillBar engine={engine} s={s} />
            {engine.autoHalf && (
              <p className="auto-note">
                {engine.role === "pitcher"
                  ? "투수만 모드 · 우리 공격은 AI가 칩니다."
                  : "타자만 모드 · 우리 수비와 투구는 AI가 합니다."}{" "}
                화면 위에서 배속(×1~×8)을 바꿀 수 있어요.
              </p>
            )}
            {!batting && (
              <div className="pp-rival">
                <span className="pp-order">
                  {String((s.order[batting ? 1 : 0] % 9) + 1).padStart(2, "0")}
                </span>
                <span className="pp-rival-name">
                  <small>
                    {batting ? "현재 타자" : "상대 타자"} ·{" "}
                    {engine.batter.hand === "L" ? "좌" : "우"}타
                  </small>
                  <strong>{engine.batter.name}</strong>
                </span>
                <span className="pp-rival-stats">
                  <span>
                    컨택 <b>{engine.batter.contact}</b>
                  </span>
                  <span>
                    파워 <b>{engine.batter.power}</b>
                  </span>
                  <span>
                    선구 <b>{engine.batter.eye}</b>
                  </span>
                  <span>
                    주력 <b>{engine.batter.speed}</b>
                  </span>
                </span>
              </div>
            )}
            {batting && s.mode !== "bullpen" && (
              <div className="pp-rival">
                <span className="pp-order">{String((s.order[1] % 9) + 1).padStart(2, "0")}</span>
                <span className="pp-rival-name">
                  <small>
                    {engine.awayRoster.name} 에이스 ·{" "}
                    {engine.awayRoster.ace.hand === "L" ? "좌" : "우"}투
                  </small>
                  <strong>{engine.awayRoster.ace.name}</strong>
                </span>
                <span className="pp-rival-stats">
                  <span>
                    구속 <b>{STAGES[s.career.stage].aiVelocity + engine.awayRoster.ace.velocity}</b>
                  </span>
                  <span>
                    제구{" "}
                    <b>
                      {engine.awayRoster.ace.control <= 0.85
                        ? "A"
                        : engine.awayRoster.ace.control <= 1.05
                          ? "B"
                          : engine.awayRoster.ace.control <= 1.2
                            ? "C"
                            : "D"}
                    </b>
                  </span>
                  <span>
                    구종{" "}
                    <b>
                      {Math.min(
                        STAGES[s.career.stage].aiPitchKinds,
                        engine.awayRoster.ace.kinds + 2,
                      )}
                    </b>
                  </span>
                </span>
              </div>
            )}
            {!batting ? (
              <>
                <div className="pp-step">
                  <h3>
                    <i>1</i> 구종
                    <small>
                      키로 선택 · 보유 {regularOwned}/{PITCHES.length}
                      {hiddenOwned > 0 && <em className="hidden-count"> · 히든 {hiddenOwned}</em>}
                    </small>
                  </h3>
                  <div className="pp-pitches">
                    {ALL_PITCHES.filter((p) => s.career.pitches.includes(p.id)).map((p) => (
                      <button
                        key={p.id}
                        className={
                          (s.selected === p.id ? "selected " : "") +
                          (isHiddenPitch(p.id) ? "hidden-pitch" : "")
                        }
                        disabled={s.phase !== "ready"}
                        title={p.desc}
                        onClick={() => engine.selectPitch(p.id)}
                        style={{ "--pitch-color": p.color } as React.CSSProperties}
                      >
                        <span className="pp-pitch-name">
                          <kbd>{p.key}</kbd>
                          {p.name}
                        </span>
                        <small>
                          {Math.round(
                            Math.min(
                              p.maxSpeed ?? 999,
                              fastballSpeed(s.career.stats.velocity) +
                                p.delta -
                                (100 - s.effort) * 0.09,
                            ),
                          )}{" "}
                          km/h
                        </small>
                      </button>
                    ))}
                  </div>
                  {regularOwned < PITCHES.length && (
                    <p className="pp-more">
                      남은 {PITCHES.length - regularOwned}개 구종은 하루 일정의 구종 상점에서
                      경험치로 익힙니다.
                    </p>
                  )}
                  <PitchMovementGuide s={s} />
                </div>
                <div className="pp-step">
                  <h3>
                    <i>2</i> 투구 강도 <b>{s.effort}%</b>
                    <small>왼쪽 제구 · 오른쪽 구속</small>
                  </h3>
                  <Slider
                    aria-label="투구 강도"
                    value={[s.effort]}
                    min={70}
                    max={100}
                    step={1}
                    disabled={s.phase !== "ready"}
                    onValueChange={(v) => engine.set("effort", v[0])}
                  />
                </div>
              </>
            ) : (
              <div className="pp-step">
                <h3>
                  <i>1</i> 스윙
                  <small>타이밍 + 조준</small>
                </h3>
                <div className="pp-swings">
                  {[
                    { id: "contact", name: "컨택", sub: "넓게 · 아슬하면 파울" },
                    { id: "power", name: "강타", sub: "아주 좁게 · 장타" },
                    { id: "bunt", name: "번트", sub: "짧게 굴려 진루" },
                  ].map((p) => (
                    <button
                      className={s.swingStyle === p.id ? "selected" : ""}
                      key={p.id}
                      onClick={() => engine.set("swingStyle", p.id as GameState["swingStyle"])}
                    >
                      <strong>{p.name}</strong>
                      <small>{p.sub}</small>
                    </button>
                  ))}
                </div>
                <BattingFeedback s={s} />
                {s.mode === "match" && (
                  <button
                    className={`subtle-button steal-button ${s.stealCall ? "selected" : ""}`}
                    disabled={
                      !(canPitch || (s.phase === "result" && s.outs < 3 && !s.paused)) ||
                      !engine.stealTarget
                    }
                    onClick={() => engine.steal()}
                    aria-pressed={s.stealCall}
                  >
                    {s.stealTrack
                      ? `${s.stealTrack.from}루 주자 도루 중!`
                      : s.stealCall
                        ? `도루 사인 ON · 다음 투구에 ${engine.stealTarget || 2}루로`
                        : `${Math.max(1, engine.stealTarget - 1)}루 주자 도루 사인`}{" "}
                    <kbd>E</kbd>
                  </button>
                )}
                <p className="pp-keys">화면에서 조준 · 클릭/Space 스윙 · E 도루 사인</p>
              </div>
            )}
            {!batting && (
              <>
                <div className="pp-step">
                  <h3>
                    <i>3</i> 목표 지점
                    <small>지난 공 오차 {s.lastError.toFixed(1)} cm</small>
                  </h3>
                  <AimPad engine={engine} s={s} />
                </div>
                <div className="pp-actions">
                  {/* No throw button: moving the mouse to it dragged the aim off the pad. */}
                  <span className="throw-hint">
                    <MousePointer2 size={15} />
                    <span>
                      조준판 클릭 또는 <kbd>Space</kbd> → {pitch.name} 던지기
                    </span>
                  </span>
                  <button
                    className="subtle-button"
                    disabled={!canPitch || s.mode !== "match"}
                    onClick={() => engine.intentionalWalk()}
                  >
                    고의4구
                  </button>
                  {s.mode === "match" && s.bases.some(Boolean) && (
                    <span className="pickoff-buttons" aria-label="견제">
                      {[1, 2, 3]
                        .filter((b) => s.bases[b - 1])
                        .map((b) => (
                          <button
                            key={b}
                            className="subtle-button"
                            disabled={!canPitch}
                            onClick={() => engine.pickoff(b)}
                          >
                            {b}루 견제
                          </button>
                        ))}
                    </span>
                  )}
                  <button
                    className="subtle-button"
                    onClick={() => engine.resetPitch()}
                    disabled={s.mode === "match" && s.phase !== "result"}
                    aria-label={s.mode === "match" ? "다음 투구" : "공 초기화"}
                  >
                    <RotateCcw size={14} /> <kbd>R</kbd>
                  </button>
                </div>
                <div className="pp-stamina">
                  <span>
                    <Activity size={13} /> 투수 체력
                  </span>
                  <Progress value={s.energy} aria-label="투수 체력" />
                  <b>{Math.round(s.energy)}</b>
                  <small className="pp-fatigue">
                    제구 오차 ±
                    {Math.round(
                      controlSpread(s.career.stats.control, s.energy, s.effort, s.career.form) *
                        100,
                    )}{" "}
                    cm
                    {s.energy <= 97 &&
                      ` · 체력 저하로 +${Math.round(
                        (controlSpread(s.career.stats.control, s.energy, s.effort, s.career.form) -
                          controlSpread(s.career.stats.control, 100, s.effort, s.career.form)) *
                          100,
                      )} cm, 구속 −${((100 - s.energy) * 0.065).toFixed(1)} km/h`}
                  </small>
                </div>
              </>
            )}
          </aside>
        </div>
        <div className="controls-footer">
          <span>
            <MousePointer2 size={15} />
            <b>조준 + 클릭</b> 또는 <kbd>Space</kbd> 투구 / 스윙
          </span>
          <span>
            <kbd>1–0</kbd> <kbd>=</kbd> <kbd>[</kbd> <kbd>]</kbd> 구종 · <kbd>1–4</kbd> 송구 ·{" "}
            <kbd>F</kbd> 견제 · <kbd>E</kbd> 도루 · <kbd>T</kbd> 응원(프로) · <kbd>G</kbd> 한계 돌파
          </span>
          <span>
            <kbd>WASD</kbd> 수동 수비
          </span>
          <span>
            <kbd>C</kbd> 카메라 · <kbd>P</kbd> 일시 정지
          </span>
          <button onClick={() => setHelp(true)}>
            조작법 보기 <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
      {view === "life" && (
        <LifeView
          engine={engine}
          s={s}
          onPlay={() => {
            setView("game");
            if (!engine.matchActive && (s.mode !== "match" || s.phase === "finished"))
              newGame("match");
          }}
          onPractice={(mode) => {
            if (engine.matchActive) setPending(mode);
            else engine.start(mode, innings);
            setView("game");
          }}
        />
      )}
      <footer className="app-footer">
        <span>
          DIAMOND ROAD <b>·</b> 웹 플레이 테스트 05
        </span>
        <span>선수 기록 자동 저장 · 경기 진행은 현재 세션에 유지</span>
      </footer>
      <GuideDialog open={help} onOpenChange={setHelp} />
      <GuideNotice
        open={guideNotice}
        onRead={() => {
          setGuideNotice(false);
          setHelp(true);
        }}
        onLater={() => setGuideNotice(false)}
      />
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent className="settings-dialog">
          <DialogHeader>
            <DialogTitle>경기 설정</DialogTitle>
            <DialogDescription>나에게 맞는 속도와 조작으로 플레이하세요.</DialogDescription>
          </DialogHeader>
          <div className="dev-mode">
            <h4>
              개발자 모드 <small>테스트용 · 선수 기록에 바로 저장</small>
            </h4>
            {!devUnlocked ? (
              <form
                className="dev-lock"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (devCode === DEV_CODE) {
                    setDevUnlocked(true);
                    setDevFails(0);
                    toast.success("개발자 모드를 열었습니다");
                  } else {
                    // Hidden: the 2nd wrong try is a warning, the 3rd teaches pine tar.
                    const n = devFails + 1;
                    setDevFails(n);
                    if (n % 3 === 2) toast.error("[부정을 저지르려 하지 마세요]");
                    else if (n % 3 === 0 && engine.grantPineTar()) setSettings(false);
                    else toast.error("비밀번호가 틀렸습니다");
                  }
                  setDevCode("");
                }}
              >
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  placeholder="비밀번호"
                  aria-label="개발자 모드 비밀번호"
                  value={devCode}
                  onChange={(e) => setDevCode(e.target.value)}
                />
                <button className="subtle-button" type="submit">
                  <Lock size={14} /> 잠금 해제
                </button>
              </form>
            ) : (
              <div>
                {([100, 200, 250] as const).map((v) => (
                  <button
                    key={v}
                    className="subtle-button"
                    onClick={() => {
                      engine.devSetStats(v);
                      toast.success(
                        `모든 능력치를 ${v}로 올렸습니다${v > 100 ? ` (상한 ${v} 해금)` : ""}`,
                      );
                    }}
                  >
                    능력치 {v} 해금
                  </button>
                ))}
                <button
                  className="subtle-button"
                  disabled={tierOf(s.career) === "mlb"}
                  onClick={() => {
                    const was = tierOf(s.career);
                    if (!engine.devGauge100()) return;
                    toast.success(
                      was === "first"
                        ? "MLB 4개 구단 평가 100 · 계약하거나 모두 거절할 수 있어요"
                        : was === "farm"
                          ? "1군 신뢰도 100 · 1군으로 승격했습니다"
                          : "스카우트 평가 100 · 입단 제의를 받았습니다",
                    );
                    setSettings(false);
                    setView("life");
                  }}
                >
                  {tierOf(s.career) === "first"
                    ? "MLB 구단 평가 100"
                    : tierOf(s.career) === "mlb"
                      ? "게이지 없음 (MLB)"
                      : `${gaugeName(s.career)} 100`}
                </button>
                <button
                  className="subtle-button"
                  onClick={() => {
                    if (engine.devWin()) {
                      setSettings(false);
                      setView("game");
                      toast.success("경기를 3:0 승리로 끝냈습니다");
                    }
                  }}
                >
                  경기 3:0 승리
                </button>
                <button
                  className="subtle-button"
                  onClick={() => {
                    engine.devRain();
                    setSettings(false);
                    setView("game");
                    toast.success("🌧 이번 경기에 비가 내립니다");
                  }}
                >
                  🌧 지금 비 오게
                </button>
                <button
                  className="subtle-button"
                  onClick={() => {
                    engine.devGauge99();
                    toast.success(
                      tierOf(s.career) === "first"
                        ? "MLB 스카우트 4명을 모두 99로 올렸습니다 · 다음 경기에서 100"
                        : `${gaugeName(s.career)}를 99로 올렸습니다 · 다음 경기에서 목표 달성`,
                    );
                  }}
                >
                  {tierOf(s.career) === "first"
                    ? "MLB 스카우트 99"
                    : tierOf(s.career) === "mlb"
                      ? "게이지 없음 (MLB)"
                      : `${gaugeName(s.career)} 99`}
                </button>
                <button
                  className="subtle-button"
                  onClick={() => {
                    engine.devUnlockPitches();
                    toast.success("모든 구종을 열었습니다 (히든 구종 포함)");
                  }}
                >
                  모든 구종 열기
                </button>
                <button
                  className="subtle-button"
                  aria-pressed={s.showHitboxes}
                  onClick={() => {
                    engine.state.showHitboxes = !engine.state.showHitboxes;
                    engine.emit();
                    toast.success(
                      engine.state.showHitboxes
                        ? "히트박스를 보여 줍니다 (주자 · 베이스 · 베이스 근처 수비수 · 타자)"
                        : "히트박스를 숨겼습니다",
                    );
                  }}
                >
                  {s.showHitboxes ? "히트박스 숨기기" : "히트박스 보기"}
                </button>
                <button
                  className="subtle-button"
                  onClick={() => {
                    setSettings(false);
                    setAiLab(true);
                  }}
                >
                  AI 훈련장 열기 (주자·수비 강화학습)
                </button>
                <HofResetForm />
              </div>
            )}
          </div>
          <div className="settings-row">
            <label>난이도</label>
            <div className="difficulty-row">
              <Select
                value={s.difficulty}
                onValueChange={(v) => engine.setDifficulty(v as Difficulty)}
              >
                <SelectTrigger aria-label="난이도">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTIES.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                      {d.note ? ` · ${d.note}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span
                className="ai-power"
                title={`상대 팀 주자·수비 AI: ${AI_LEVELS[s.difficulty].detail}`}
              >
                <small>AI 성능</small>
                <span className="ai-power-meter" aria-hidden>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <i key={i} className={i <= AI_LEVELS[s.difficulty].meter ? "on" : undefined} />
                  ))}
                </span>
                <b>{AI_LEVELS[s.difficulty].name}</b>
              </span>
            </div>
          </div>
          <div className="settings-row">
            <label>다음 경기 길이</label>
            <Select value={String(innings)} onValueChange={(v) => setInnings(Number(v))}>
              <SelectTrigger aria-label="다음 경기 길이">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3이닝 · 빠른 점검</SelectItem>
                <SelectItem value="9">9이닝 · 전체 경기</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="settings-row">
            <label htmlFor="auto-field">
              자동 수비<small>끄면 WASD 이동 · 1–4 송구</small>
            </label>
            <Switch
              id="auto-field"
              checked={s.autoField}
              onCheckedChange={(v) => engine.set("autoField", v)}
            />
          </div>
          <div className="settings-row">
            <label htmlFor="auto-camera">상황별 카메라 전환</label>
            <Switch
              id="auto-camera"
              checked={s.autoCamera}
              onCheckedChange={(v) => engine.set("autoCamera", v)}
            />
          </div>
          <div className="settings-row">
            <label htmlFor="rain-on">
              비 날씨<small>끄면 항상 맑음 · 지금 내리는 비도 그침</small>
            </label>
            <Switch
              id="rain-on"
              checked={s.rainOn}
              onCheckedChange={(v) => {
                engine.setRain(v);
                toast.success(
                  v ? "비 날씨를 켰습니다 (약 10% 확률)" : "비 날씨를 껐습니다 · 항상 맑음",
                );
              }}
            />
          </div>
          <div className="settings-row">
            <label htmlFor="name-tags">수비수 이름 표시</label>
            <Switch
              id="name-tags"
              checked={s.nameTags}
              onCheckedChange={(v) => engine.set("nameTags", v)}
            />
          </div>
          <div className="settings-row">
            <label htmlFor="game-sound">효과음</label>
            <Switch
              id="game-sound"
              checked={s.sound}
              onCheckedChange={(v) => engine.set("sound", v)}
            />
          </div>
          <CloudSave
            engine={engine}
            career={s.career}
            onLoaded={() => {
              setSettings(false);
              setView("life");
            }}
          />
          <button
            className="primary-button"
            onClick={() => {
              setSettings(false);
              newGame(s.mode);
            }}
          >
            설정으로 새 경기
          </button>
          <button
            className="subtle-button"
            onClick={() => {
              if (
                window.confirm(
                  "선수 기록을 지우고 처음부터 시작할까요? (은총 룰렛을 다시 돌립니다)",
                )
              ) {
                engine.resetCareer();
                // The save code belongs to the old player.
                saveCode(null);
                setSettings(false);
                setView("life");
              }
            }}
          >
            선수 처음부터 다시 시작
          </button>
          <p className="build-stamp">게임 버전 {BUILD_LABEL}</p>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!pending}
        onOpenChange={(v) => {
          if (!v) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 플레이로 전환할까요?</DialogTitle>
            <DialogDescription>
              진행 중인 경기 점수는 초기화됩니다. 저장된 선수 능력과 완료한 경기 기록은 유지됩니다.
            </DialogDescription>
          </DialogHeader>
          <button
            className="primary-button"
            onClick={() => {
              if (pending) engine.start(pending, innings);
              setPending(null);
              setManualPause(false);
            }}
          >
            전환하기
          </button>
          <button className="subtle-button" onClick={() => setPending(null)}>
            현재 경기 계속하기
          </button>
        </DialogContent>
      </Dialog>
      {aiLab && <AiLab onClose={() => setAiLab(false)} />}
    </main>
  );
}
