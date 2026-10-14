/**
 * Customizing window (header button 「꾸미기」): the player's look (uniform colour, skin tone,
 * height, build: saved with the career and shown to the other player in a versus match) and
 * the stage (grass, clay, time of day, ball colour: only on this device).
 */
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Lock, Palette } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BaseballEngine } from "@/lib/game/engine";
import {
  BALLS,
  BUILDS,
  DEFAULT_TRIM,
  SKINS,
  TIER_NAMES,
  skinOf,
  skinsOf,
  type Skin,
  type SkinKind,
  CLAY,
  DEFAULT_LOOK,
  GRASS,
  HEIGHTS,
  SKIN_TONES,
  TIMES,
  UNIFORM_COLORS,
  cleanLook,
  getStage,
  setStage,
  subscribeStage,
  type Look,
  type Stage,
} from "@/lib/game/custom";

const SKIN_SWATCH = ["#f3d2b3", "#e2b48c", "#c99872", "#a8754f", "#7c4f33"];
const CREAM = "#ece6d6";

/** Little figure that shows the look (colour, skin, height, build) at a glance. */
function Preview({ look }: { look: Look }) {
  const h = HEIGHTS[look.height].f,
    w = BUILDS[look.build].f,
    shirt = look.uniform || CREAM,
    trim = look.trim || DEFAULT_TRIM,
    p = look.pattern,
    // Torso, sleeves: filled with the pattern when there is one.
    fill = (part: "torso" | "sleeve") =>
      p === "twotone" && part === "sleeve"
        ? trim
        : p === "rainbow"
          ? "url(#pv-rainbow)"
          : p === "aurora"
            ? "url(#pv-aurora)"
            : p === "fade"
              ? "url(#pv-fade)"
              : p && ["stripes", "band", "check", "dots"].includes(p)
                ? shirt
                : shirt;
  const over = p && ["stripes", "band", "check", "dots"].includes(p) ? `url(#pv-${p})` : null;
  return (
    <svg className="custom-preview" viewBox="0 0 120 150" role="img" aria-label="미리보기">
      <defs>
        <pattern id="pv-stripes" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect x="4.6" width="1.4" height="6" fill={trim} />
        </pattern>
        <pattern id="pv-band" width="6" height="7" patternUnits="userSpaceOnUse">
          <rect y="5" width="6" height="1.6" fill={trim} />
        </pattern>
        <pattern id="pv-check" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill={trim} />
          <rect x="6" y="6" width="6" height="6" fill={trim} />
        </pattern>
        <pattern id="pv-dots" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="5" r="2.3" fill={trim} />
        </pattern>
        <linearGradient id="pv-fade" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={shirt} />
          <stop offset="1" stopColor={trim} />
        </linearGradient>
        <linearGradient id="pv-aurora" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={shirt} />
          <stop offset="0.5" stopColor={trim} />
          <stop offset="1" stopColor={shirt} />
          <animateTransform attributeName="gradientTransform" type="translate" values="-0.5 -0.5;0.5 0.5;-0.5 -0.5" dur="4s" repeatCount="indefinite" />
        </linearGradient>
        <linearGradient id="pv-rainbow" x1="0" y1="0" x2="1" y2="1">
          {["#ff3b3b", "#ffb52e", "#f3e83a", "#46d36a", "#3aa8ff", "#8a5bff", "#ff3b3b"].map((c, i) => (
            <stop key={i} offset={i / 6} stopColor={c} />
          ))}
          <animateTransform attributeName="gradientTransform" type="translate" values="-1 -1;1 1;-1 -1" dur="3s" repeatCount="indefinite" />
        </linearGradient>
      </defs>
      <g transform={`translate(60 146) scale(${w} ${h}) translate(-60 -146)`}>
        <rect x="40" y="96" width="14" height="46" rx="6" fill="#2a3640" />
        <rect x="66" y="96" width="14" height="46" rx="6" fill="#2a3640" />
        <rect x="32" y="50" width="56" height="56" rx="14" fill={fill("torso")} stroke="#0003" />
        {over && <rect x="32" y="50" width="56" height="56" rx="14" fill={over} />}
        <rect x="18" y="54" width="16" height="42" rx="8" fill={fill("sleeve")} stroke="#0003" />
        <rect x="86" y="54" width="16" height="42" rx="8" fill={fill("sleeve")} stroke="#0003" />
        <circle cx="60" cy="34" r="17" fill={SKIN_SWATCH[look.skin]} />
        <path d="M42 30a18 18 0 0 1 36 0z" fill={shirt} stroke="#0003" />
        <rect x="40" y="29" width="42" height="5" rx="2" fill={shirt} stroke="#0003" />
      </g>
    </svg>
  );
}

function PickerBuy({ engine }: { engine: BaseballEngine }) {
  const s = skinOf("picker")!;
  return (
    <button
      className="subtle-button skin t2 unowned"
      title={s.note}
      onClick={() => {
        const r = engine.buySkin("picker");
        if (r.ok) toast.success(r.message);
        else toast.error(r.message);
      }}
    >
      <b>직접 고르기</b>
      <small>
        <Lock size={10} /> {s.cost} XP
      </small>
    </button>
  );
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onPick,
  swatch,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; color?: string }[];
  onPick: (v: T) => void;
  swatch?: boolean;
}) {
  return (
    <div className="custom-row" role="radiogroup" aria-label={label}>
      <span>{label}</span>
      <div>
        {options.map((o) => (
          <button
            key={String(o.id)}
            role="radio"
            aria-checked={value === o.id}
            aria-label={o.label}
            title={o.label}
            className={`subtle-button ${value === o.id ? "on" : ""} ${swatch ? "swatch" : ""}`}
            style={swatch && o.color ? { background: o.color } : undefined}
            onClick={() => onPick(o.id)}
          >
            {swatch ? "" : o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const TIER_CLASS = ["", "t1", "t2", "t3", "t4"];

/** One shop row: the owned skins can be worn, the others are bought with XP. */
function SkinRow({
  engine,
  kind,
  label,
  value,
  locked,
  onWear,
}: {
  engine: BaseballEngine;
  kind: SkinKind;
  label: string;
  value: string;
  locked: boolean;
  onWear: (id: string) => void;
}) {
  const xp = engine.state.career.xp,
    click = (s: Skin) => {
      if (engine.ownsSkin(s.id)) {
        if (!locked) onWear(value === s.id ? "" : s.id);
        return;
      }
      const r = engine.buySkin(s.id);
      if (r.ok) {
        toast.success(r.message);
        onWear(s.id);
      } else toast.error(r.message);
    };
  return (
    <div className="custom-row" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="skin-list">
        <button
          className={`subtle-button ${value === "" ? "on" : ""}`}
          disabled={locked}
          onClick={() => onWear("")}
        >
          기본
        </button>
        {skinsOf(kind).map((s) => {
          const own = engine.ownsSkin(s.id);
          return (
            <button
              key={s.id}
              className={`subtle-button skin ${TIER_CLASS[s.tier]} ${value === s.id ? "on" : ""} ${own ? "" : "unowned"}`}
              title={`${TIER_NAMES[s.tier]} · ${s.note}`}
              aria-label={`${s.name} ${own ? "보유" : `${s.cost} XP`}`}
              disabled={own ? locked : false}
              onClick={() => click(s)}
            >
              <b>{s.name}</b>
              <small>
                {own ? (value === s.id ? "입는 중" : "보유") : (
                  <>
                    <Lock size={10} /> {s.cost.toLocaleString()} XP{xp < s.cost ? " (부족)" : ""}
                  </>
                )}
              </small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CustomizeButton({ engine }: { engine: BaseballEngine }) {
  const [open, setOpen] = useState(false),
    stage = useSyncExternalStore(subscribeStage, getStage, getStage),
    look = cleanLook({ ...DEFAULT_LOOK, ...engine.myLook }),
    locked = !!engine.versus,
    picker = engine.ownsSkin("picker"),
    change = (p: Partial<Look>) => engine.setLook(p),
    num = (a: readonly unknown[]) => a.map((x, i) => ({ id: i, label: (x as { label: string }).label }));
  return (
    <>
      <button className="patch-button" onClick={() => setOpen(true)} aria-label="꾸미기">
        <Palette size={15} />
        <span>꾸미기</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="multi-dialog custom-dialog">
          <DialogHeader>
            <DialogTitle>꾸미기</DialogTitle>
            <DialogDescription>
              내 선수의 모습은 저장되고 멀티에서 상대 화면에도 보여요. 구장·화면은 이 기기에서만
              적용돼요.
            </DialogDescription>
          </DialogHeader>
          <section className="custom-section">
            <h3>내 선수</h3>
            <div className="custom-look">
              <Preview look={look} />
              <div className="custom-rows">
                <Choice
                  label="피부톤"
                  value={look.skin}
                  options={SKIN_TONES.map((_, i) => ({ id: i, label: SKIN_TONES[i].label, color: SKIN_SWATCH[i] }))}
                  swatch
                  onPick={(v) => change({ skin: v })}
                />
                <Choice label="키" value={look.height} options={num(HEIGHTS)} onPick={(v) => change({ height: v })} />
                <Choice label="체형" value={look.build} options={num(BUILDS)} onPick={(v) => change({ build: v })} />
              </div>
            </div>
            <p className="multi-note custom-xp">
              보유 경험치 <b>{engine.state.career.xp.toLocaleString()} XP</b> · 잠긴 것은 눌러서 사요
            </p>
            <div className="custom-row" role="radiogroup" aria-label="유니폼 색">
              <span>유니폼 색</span>
              <div>
                {UNIFORM_COLORS.map((u) => (
                  <button
                    key={u.label}
                    role="radio"
                    aria-checked={look.uniform === u.color}
                    aria-label={u.label}
                    title={u.label}
                    className={`subtle-button swatch ${look.uniform === u.color ? "on" : ""}`}
                    style={{ background: u.color || CREAM }}
                    onClick={() => change({ uniform: u.color })}
                  />
                ))}
                {picker ? (
                  <label className="custom-picker" title="직접 고르기">
                    <input
                      type="color"
                      aria-label="유니폼 색 직접 고르기"
                      value={look.uniform || CREAM}
                      onChange={(e) => change({ uniform: e.target.value })}
                    />
                  </label>
                ) : (
                  <PickerBuy engine={engine} />
                )}
              </div>
            </div>
            <SkinRow
              engine={engine}
              kind="pattern"
              label="유니폼 무늬"
              value={look.pattern}
              locked={locked}
              onWear={(id) => change({ pattern: id })}
            />
            {look.pattern && look.pattern !== "rainbow" && (
              <div className="custom-row" role="radiogroup" aria-label="무늬 색">
                <span>무늬 색</span>
                <div>
                  {UNIFORM_COLORS.map((u) => (
                    <button
                      key={u.label}
                      role="radio"
                      aria-checked={look.trim === (u.color || DEFAULT_TRIM)}
                      aria-label={u.label}
                      title={u.label}
                      className={`subtle-button swatch ${look.trim === (u.color || DEFAULT_TRIM) ? "on" : ""}`}
                      style={{ background: u.color || CREAM }}
                      onClick={() => change({ trim: u.color || DEFAULT_TRIM })}
                    />
                  ))}
                  {picker && (
                    <label className="custom-picker" title="직접 고르기">
                      <input
                        type="color"
                        aria-label="무늬 색 직접 고르기"
                        value={look.trim}
                        onChange={(e) => change({ trim: e.target.value })}
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
            <SkinRow engine={engine} kind="ball" label="공 스킨" value={look.ball} locked={locked} onWear={(id) => change({ ball: id })} />
            <SkinRow engine={engine} kind="bat" label="배트 스킨" value={look.bat} locked={locked} onWear={(id) => change({ bat: id })} />
            {locked && <p className="multi-note">멀티 대결 중에는 모습을 바꿀 수 없어요.</p>}
            <p className="multi-note">팀 동료도 같은 유니폼 색을 입어요. 어두운 색은 옷의 그림자가 더 진하게 보여요.</p>
          </section>
          <section className="custom-section">
            <h3>구장 · 화면 <small>이 기기에서만</small></h3>
            {(
              [
                ["grass", "잔디", GRASS],
                ["clay", "흙", CLAY],
                ["time", "시간대", TIMES],
                ["ball", "공 색", BALLS],
              ] as const
            ).map(([key, label, list]) => (
              <Choice
                key={key}
                label={label}
                value={stage[key as keyof Stage]}
                options={num(list)}
                onPick={(v) => setStage({ [key]: v })}
              />
            ))}
            <p className="multi-note">비 오는 날에는 하늘과 빛이 비 날씨 그대로예요.</p>
          </section>
        </DialogContent>
      </Dialog>
    </>
  );
}
