/**
 * Developer menu → AI 훈련장: the runner and fielder AI learn against each other (PPO
 * self-play, lib/ai) in Web Workers in the background, while one light 3D field plays random
 * situations at 10× speed with the latest AI. The top bar shows the win rates and how many
 * updates it has learned. Progress is kept in this browser (continues after a refresh).
 */
import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { BaseballEngine, newCareer } from "@/lib/game/engine";
import type { BaseballField } from "@/lib/game/field";
import { AI_CONFIG } from "@/lib/ai/config";
import { chooser, importPolicy, type PoliciesJson } from "@/lib/ai/agent";
import { lcg, randomSituation, startPlay } from "@/lib/ai/scenario";
import {
  mergeEval,
  summarize,
  type Collected,
  type EvalSums,
  type Job,
  type Matchup,
  type RoundLog,
} from "@/lib/ai/trainer";

const LAB_KEY = "diamond-road-ai-lab-v1";
const SPEED = 10;
const PLAYS = 24;
const EVAL_EVERY = 20;
const EVAL_PLAYS = 160;
const SAVE_EVERY = 20;
const QUICK: Matchup[] = ["L-L", "H-H", "L-H", "H-L"];

type Reply = Record<string, unknown> & { id: number };
class Pool {
  workers: Worker[];
  private next = 1;
  private waiting = new Map<number, (v: Reply) => void>();
  constructor(n: number) {
    this.workers = Array.from({ length: n }, () => {
      const w = new Worker(new URL("../../lib/ai/lab.worker.ts", import.meta.url), {
        type: "module",
      });
      w.onmessage = (e: MessageEvent<Reply>) => {
        const f = this.waiting.get(e.data.id);
        this.waiting.delete(e.data.id);
        f?.(e.data);
      };
      return w;
    });
  }
  ask<T>(i: number, msg: object): Promise<T> {
    const id = this.next++;
    return new Promise((res) => {
      this.waiting.set(id, res as (v: Reply) => void);
      this.workers[i].postMessage({ ...msg, id });
    });
  }
  stop() {
    for (const w of this.workers) w.terminate();
  }
}

type Summary = ReturnType<typeof summarize>;
const loadCheckpoint = () => {
  try {
    return JSON.parse(localStorage.getItem(LAB_KEY) ?? "null");
  } catch {
    return null;
  }
};

export function AiLab({ onClose }: { onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null),
    policies = useRef<PoliciesJson | null>(null),
    paused = useRef(false),
    [pausedView, setPausedView] = useState(false),
    [progress, setProgress] = useState({ updates: 0, plays: 0 }),
    [summary, setSummary] = useState<Summary | null>(null),
    [round, setRound] = useState<RoundLog | null>(null),
    [restart, setRestart] = useState(0),
    workers = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));

  // Background training: rounds of collect → PPO update, a quick check every EVAL_EVERY.
  useEffect(() => {
    let alive = true;
    const pool = new Pool(workers),
      sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const run = async () => {
      const init = await pool.ask<{ updates: number; plays: number; policies: PoliciesJson }>(0, {
        kind: "init",
        checkpoint: restart ? null : loadCheckpoint(),
      });
      policies.current = init.policies;
      let updates = init.updates;
      setProgress({ updates, plays: init.plays });
      let checked = -1;
      while (alive) {
        if (paused.current) {
          await sleep(200);
          continue;
        }
        if (updates % EVAL_EVERY === 0 && checked !== updates) {
          checked = updates;
          const parts = await Promise.all(
            pool.workers.map((_, i) =>
              pool.ask<{ sums: EvalSums }>(i, {
                kind: "eval",
                policies: policies.current,
                n: EVAL_PLAYS,
                seed: 4242,
                part: i,
                parts: workers,
                only: QUICK,
              }),
            ),
          );
          if (!alive) return;
          setSummary(summarize(mergeEval(parts.map((p) => p.sums))));
        }
        const { jobs } = await pool.ask<{ jobs: Job[] }>(0, {
          kind: "jobs",
          workers,
          plays: PLAYS,
        });
        const parts = await Promise.all(
          jobs.map((job, i) => pool.ask<{ result: Collected }>(i, { kind: "collect", job })),
        );
        if (!alive) return;
        const res = await pool.ask<{
          log: RoundLog;
          policies: PoliciesJson;
          checkpoint?: object;
        }>(0, {
          kind: "learn",
          parts: parts.map((p) => p.result),
          save: (updates + 1) % SAVE_EVERY === 0,
        });
        if (!alive) return;
        policies.current = res.policies;
        updates = res.log.updates;
        setProgress({ updates, plays: res.log.plays });
        setRound(res.log);
        if (res.checkpoint)
          try {
            localStorage.setItem(LAB_KEY, JSON.stringify(res.checkpoint));
          } catch {
            /* storage full or blocked: training goes on, it just will not resume */
          }
      }
    };
    void run().catch(() => toast.error("AI 훈련을 계속하지 못했어요 · 다시 열어 주세요"));
    return () => {
      alive = false;
      pool.stop();
    };
  }, [restart, workers]);

  // The 10× screen: random situations played by the latest AI (best choices).
  useEffect(() => {
    let field: BaseballField | undefined,
      frame = 0,
      disposed = false,
      last = performance.now(),
      wait = 0;
    const rnd = lcg(Date.now() % 2 ** 31),
      g = new BaseballEngine(newCareer(), lcg(7));
    g.state.nameTags = false;
    const next = () => {
      const p = policies.current;
      startPlay(
        randomSituation(rnd, AI_CONFIG),
        p ? chooser(importPolicy(p.runner, 0, AI_CONFIG.ppo.hidden), 0, { greedy: true }) : null,
        p ? chooser(importPolicy(p.holder, 1, AI_CONFIG.ppo.hidden), 1, { greedy: true }) : null,
        g,
      );
    };
    const setup = async () => {
      const { BaseballField } = await import("@/lib/game/field");
      if (disposed || !host.current) return;
      field = new BaseballField(host.current, g, { lite: true });
      next();
    };
    void setup().catch(() => toast.error("훈련장 화면을 열지 못했어요"));
    const tick = (now: number) => {
      const real = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (field && !paused.current) {
        if (g.state.phase === "inplay") {
          const sim = real * SPEED,
            steps = Math.max(1, Math.round(sim * 60));
          for (let i = 0; i < steps && g.state.phase === "inplay"; i++) g.tick(1 / 60);
          field.update(sim);
        } else {
          field.update(real);
          wait += real;
          if (wait > 0.45) {
            wait = 0;
            next();
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      field?.dispose();
    };
  }, []);

  const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`),
    gain = (v: { mean: number } | undefined) =>
      v === undefined ? "—" : `${v.mean > 0 ? "+" : ""}${v.mean.toFixed(2)}`;

  return (
    <div className="ai-lab" role="dialog" aria-label="AI 훈련장">
      <header className="ai-lab-bar">
        <div className="ai-lab-stat">
          <small>수비수 승률</small>
          <b>{pct(summary?.duel.fielder)}</b>
        </div>
        <div className="ai-lab-stat">
          <small>주자 승률</small>
          <b>{pct(summary?.duel.runner)}</b>
        </div>
        <div className="ai-lab-stat">
          <small>학습</small>
          <b>{progress.updates.toLocaleString()}번째</b>
          <em>{progress.plays.toLocaleString()}플레이</em>
        </div>
        <div className="ai-lab-buttons">
          <button
            className="icon-button"
            aria-label={pausedView ? "계속" : "일시정지"}
            onClick={() => {
              paused.current = !paused.current;
              setPausedView(paused.current);
            }}
          >
            {pausedView ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            className="icon-button"
            aria-label="처음부터 다시 학습"
            onClick={() => {
              if (!window.confirm("지금까지 학습한 AI를 지우고 처음부터 다시 학습할까요?")) return;
              try {
                localStorage.removeItem(LAB_KEY);
              } catch {}
              setSummary(null);
              setRound(null);
              setRestart((n) => n + 1);
            }}
          >
            <RotateCcw size={16} />
          </button>
          <button className="icon-button" aria-label="닫기" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </header>
      <p className="ai-lab-note">
        승률: 같은 상황을 기존 AI끼리 했을 때와 비교해 학습한 주자가 더 멀리 가면 주자 승, 학습한
        수비가 더 잘 막으면 수비 승 ({EVAL_EVERY}번마다 {EVAL_PLAYS}상황으로 측정) · 기존 AI 대비
        보상: 주자 {gain(summary?.vsHand.runner)}, 수비 {gain(summary?.vsHand.fielder)}
        {round
          ? ` · 플레이당 아웃 ${round.outsPerPlay.toFixed(2)} · 득점 ${round.runsPerPlay.toFixed(2)}`
          : ""}
        {` · 화면 ${SPEED}배속 · 작업자 ${workers}개`}
      </p>
      <div className="ai-lab-field" ref={host} />
    </div>
  );
}
