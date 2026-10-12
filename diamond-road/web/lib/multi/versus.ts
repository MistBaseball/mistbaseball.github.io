/**
 * A versus match between the two players of a room.
 *
 * Who runs the rules: the BATTER's browser, every half (its engine bats in the "bottom" half
 * just like a normal match). The pitcher's browser is a mirror: it sends its pitches
 * (`vs-throw`) and shows the batter's snapshots (`vs-snap`). When the half ends (three outs,
 * or a walk-off) the batter's side decides what comes next (`vs-turn`): the other player bats,
 * or the match is over. The guest bats first (top), the host second (bottom).
 *
 * Screens in step: a pitch on its way is moved on by the one-way delay (half the measured
 * round trip) when its snapshot arrives; a ball in play is shown slightly behind (INTERP)
 * and smoothed between snapshots.
 *
 * Driven by `pump()` (every frame in the browser, by hand in the checks); time comes from the
 * injected clock, like the room.
 */
import type {
  BaseballEngine,
  Difficulty,
  RemotePitch,
  TeamSheet,
  VersusSnap,
} from "../game/engine";
// (Kept here, not imported: the checks load this file with Node's type stripping, where a
// value import needs the file extension.)
const LEVELS: Difficulty[] = ["baby", "easy", "normal", "hard", "impossible"];
import type { Room } from "./room";
import type { Msg } from "./transport";

export type VersusStage = "idle" | "inviting" | "invited" | "playing" | "over";
export type ReportState = "none" | "skip" | "sending" | "counted" | "waiting" | "mismatch" | "fail";
export type VersusInfo = {
  stage: VersusStage;
  matchId: string | null;
  home: boolean;
  opponent: string | null;
  innings: number;
  /** The match's difficulty (the host picks it). */
  level: Difficulty;
  result: { mine: number; theirs: number; reason?: string } | null;
  report: ReportState;
};
type Turn = { over: boolean; inning: number; batter: "host" | "guest" };

/** Snapshot rate while the ball is in play (ms) and otherwise (keep-alive). */
export const VERSUS = { liveEvery: 50, idleEvery: 400, interp: 110, lostAfter: 40000 };

const LERP = new Set(["x", "y", "z", "progress", "elapsed"]);
/** Blend two snapshots: positions and times in between, everything else from the newer. */
export function blend(a: unknown, b: unknown, t: number, key = ""): unknown {
  if (typeof a === "number" && typeof b === "number" && LERP.has(key)) return a + (b - a) * t;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length ? b.map((v, i) => blend(a[i], v, t, key)) : b;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(b as object))
      o[k] = blend((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], t, k);
    return o;
  }
  return b;
}

const newMatchId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");

export class Versus {
  info: VersusInfo;
  private listeners = new Set<() => void>();
  private inviteSheet: TeamSheet | null = null;
  private seq = 0;
  private lastSeq = -1;
  private lastSent = -1e9;
  private lastPhase = "";
  private handed = false;
  private buffer: { at: number; snap: VersusSnap }[] = [];
  private lostSince: number | null = null;
  /** After a refresh: until then a room that is not back yet is not "the other one left". */
  private graceUntil = -1;
  private resumePending = false;
  private engine: BaseballEngine;
  private room: Room;
  private now: () => number;
  /** Sends the finished match to the win/loss board (set by the page; none in the checks). */
  onReport:
    | ((r: {
        matchId: string;
        opponentId?: string;
        mine: number;
        theirs: number;
      }) => Promise<ReportState>)
    | null = null;
  private opponentId: string | undefined;

  constructor(engine: BaseballEngine, room: Room, now: () => number = () => performance.now()) {
    this.engine = engine;
    this.room = room;
    this.now = now;
    this.info = {
      stage: "idle",
      matchId: null,
      home: room.role === "host",
      opponent: null,
      innings: 3,
      level: "normal",
      result: null,
      report: "none",
    };
    room.onEvent = (m) => this.receive(m);
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  private set(patch: Partial<VersusInfo>) {
    this.info = { ...this.info, ...patch };
    for (const l of this.listeners) l();
  }

  /** Host: ask the guest for a match. */
  invite(innings = 3, level: Difficulty = this.info.level) {
    if (this.room.role !== "host" || this.room.state.status !== "ready") return false;
    if (this.engine.matchActive && !this.engine.versus) return false;
    const matchId = newMatchId();
    this.room.send("vs-invite", { matchId, innings, level, sheet: this.engine.teamSheet() });
    this.set({ stage: "inviting", matchId, innings, level, result: null, report: "none" });
    return true;
  }
  /** Guest: take the invitation. */
  accept() {
    if (this.info.stage !== "invited" || !this.inviteSheet || !this.info.matchId) return false;
    if (this.engine.matchActive && !this.engine.versus) return false;
    this.room.send("vs-accept", { matchId: this.info.matchId, sheet: this.engine.teamSheet() });
    this.begin(this.inviteSheet);
    return true;
  }
  decline() {
    if (this.info.stage !== "invited") return;
    this.room.send("vs-decline", { matchId: this.info.matchId });
    this.set({ stage: "idle", matchId: null });
  }
  /** Leave the match (the other side is told) and go back to single player. */
  /** What a page refresh needs to go on with the match (null when not playing). */
  save() {
    const e = this.engine.versusSave();
    if (this.info.stage !== "playing" || !e || !this.info.matchId) return null;
    return {
      matchId: this.info.matchId,
      home: this.info.home,
      innings: this.info.innings,
      opponent: this.info.opponent,
      opponentId: this.opponentId,
      seq: this.seq,
      engine: e,
    };
  }
  /** After a refresh: the match comes back, and both sides check who is batting. */
  restore(d: NonNullable<ReturnType<Versus["save"]>>) {
    this.opponentId = d.opponentId;
    // Our snapshot numbers go on above the ones the other side has seen.
    this.seq = d.seq + 5000;
    this.lastSeq = -1;
    this.lastPhase = "";
    this.handed = false;
    this.buffer = [];
    this.lostSince = null;
    this.graceUntil = this.now() + VERSUS.lostAfter;
    this.resumePending = true;
    this.engine.versusRestore(d.engine, (p: RemotePitch) =>
      this.room.send("vs-throw", { matchId: this.info.matchId, p }),
    );
    this.set({
      stage: "playing",
      matchId: d.matchId,
      home: d.home,
      innings: d.innings,
      level: d.engine.level ?? "normal",
      opponent: d.opponent,
      result: null,
      report: "none",
    });
  }
  quit() {
    if (this.info.stage === "playing") this.room.send("vs-end", { matchId: this.info.matchId });
    if (this.engine.versus) this.engine.endVersus();
    this.set({ stage: "idle", matchId: null, result: null, report: "none" });
  }

  private begin(sheet: TeamSheet) {
    const home = this.room.role === "host";
    this.opponentId = sheet.playerId;
    this.seq = 0;
    this.lastSeq = -1;
    this.lastSent = -1e9;
    this.lastPhase = "";
    this.handed = false;
    this.buffer = [];
    this.lostSince = null;
    this.engine.beginVersus({
      home,
      sheet,
      innings: this.info.innings,
      level: this.info.level,
      onThrow: (p: RemotePitch) => this.room.send("vs-throw", { matchId: this.info.matchId, p }),
    });
    // Top of the first: the guest bats.
    this.engine.versusTurn(!home, 1);
    this.set({ stage: "playing", home, opponent: sheet.player, result: null, report: "none" });
  }

  private receive(m: Msg) {
    const d = (m.d ?? {}) as Record<string, unknown>;
    const mine = d.matchId === this.info.matchId;
    switch (m.e) {
      case "vs-invite":
        if (this.room.role !== "guest" || this.info.stage === "playing") return;
        this.inviteSheet = d.sheet as TeamSheet;
        this.set({
          stage: "invited",
          matchId: String(d.matchId),
          innings: d.innings === 9 ? 9 : 3,
          level: LEVELS.includes(d.level as Difficulty) ? (d.level as Difficulty) : "normal",
          opponent: this.inviteSheet?.player ?? "상대",
          result: null,
          report: "none",
        });
        return;
      case "vs-accept":
        if (this.room.role === "host" && this.info.stage === "inviting" && mine)
          this.begin(d.sheet as TeamSheet);
        return;
      case "vs-decline":
        if (this.info.stage === "inviting" && mine) this.set({ stage: "idle", matchId: null });
        return;
      case "vs-resume":
        // Someone comes back to a match that is already over here: tell him so.
        if (this.info.stage !== "playing" || !mine) {
          this.room.send("vs-end", { matchId: d.matchId });
          return;
        }
        break;
      case "vs-end":
        if (this.info.stage === "playing" && mine)
          this.finish("상대가 경기를 끝냈어요 · 기록 없음");
        return;
    }
    const v = this.engine.versus;
    if (!v || !mine || this.info.stage !== "playing") return;
    if (m.e === "vs-throw" && !v.mirror && this.engine.state.phase === "ready")
      v.pitch = d.p as RemotePitch;
    else if (m.e === "vs-snap" && v.mirror) {
      const seq = Number(d.seq);
      if (!(seq > this.lastSeq)) return;
      this.lastSeq = seq;
      const snap = d.snap as VersusSnap;
      if (snap.phase === "inplay") {
        this.buffer = [...this.buffer, { at: this.now(), snap }].slice(-4);
        if (this.buffer.length === 1) this.engine.applyVersusSnapshot(snap);
      } else {
        this.buffer = [];
        this.engine.applyVersusSnapshot(snap, this.oneWay());
      }
    } else if (m.e === "vs-turn") {
      const t = d as unknown as Turn,
        meBat = (t.batter === "host") === (this.room.role === "host");
      // Already in that half (the turn was sent again after a refresh): nothing to do.
      if (
        !t.over &&
        v.mirror === !meBat &&
        this.engine.state.inning === t.inning &&
        this.engine.state.phase !== "between"
      )
        return;
      this.applyTurn(t);
    } else if (m.e === "vs-resume") {
      // The other side came back after a refresh: tell it who bats now, and show it the state.
      this.room.send("vs-where", {
        matchId: this.info.matchId,
        mirror: v.mirror,
        inning: this.engine.state.inning,
      });
      this.lastPhase = "";
    } else if (m.e === "vs-where") {
      // Both think the same side bats: the one who came back takes the other side.
      if (d.mirror === v.mirror)
        this.engine.versusTurn(!!d.mirror, Number(d.inning) || this.engine.state.inning);
      this.lastPhase = "";
    }
  }
  /** One-way delay to the other player (s). */
  private oneWay() {
    const rtt = this.room.state.peer?.rtt;
    return rtt ? rtt / 2000 : 0;
  }

  /** Called every frame: connection watch, snapshots, the end of a half, smoothing. */
  pump() {
    if (this.info.stage !== "playing") return;
    const now = this.now(),
      v = this.engine.versus,
      status = this.room.state.status;
    if (!v) {
      this.set({ stage: "idle" });
      return;
    }
    const resuming = now < this.graceUntil;
    if (this.resumePending && status === "ready") {
      this.resumePending = false;
      this.room.send("vs-resume", { matchId: this.info.matchId });
    }
    if (!resuming && (status === "waiting" || status === "closed" || status === "error")) {
      this.finish("상대가 나갔어요 · 기록 없음");
      return;
    }
    if (status === "lost" || (resuming && status !== "ready")) {
      this.lostSince ??= now;
      if (now - this.lostSince > VERSUS.lostAfter) {
        this.finish("상대 연결이 끊겼어요 · 기록 없음");
        return;
      }
    } else this.lostSince = null;
    const s = this.engine.state;
    if (!v.mirror) {
      if (s.phase === "finished") return;
      const every =
        s.phase === "inplay" || s.phase === "flight" ? VERSUS.liveEvery : VERSUS.idleEvery;
      if (s.phase !== this.lastPhase || now - this.lastSent >= every) this.sendSnap(now);
      if (s.phase === "between" && !this.handed) {
        this.handed = true;
        this.sendSnap(now);
        const t = this.decideTurn();
        this.room.send("vs-turn", { matchId: this.info.matchId, ...t });
        this.applyTurn(t);
      }
    } else if (this.buffer.length > 1) {
      // Ball in play: shown INTERP ms behind, blended between the two snapshots around then.
      const at = now - VERSUS.interp,
        b = this.buffer;
      let i = b.length - 2;
      while (i > 0 && b[i].at > at) i--;
      const a = b[i],
        c = b[i + 1],
        t = c.at > a.at ? Math.max(0, Math.min(1, (at - a.at) / (c.at - a.at))) : 1;
      this.engine.applyVersusSnapshot(blend(a.snap, c.snap, t) as VersusSnap);
    }
  }
  private sendSnap(now: number) {
    const s = this.engine.state;
    this.lastSent = now;
    this.lastPhase = s.phase;
    this.room.send("vs-snap", {
      matchId: this.info.matchId,
      seq: ++this.seq,
      snap: this.engine.versusSnapshot(),
    });
  }
  /** Real score (host, guest) from this side's engine. */
  private realScore() {
    const s = this.engine.state,
      home = this.room.role === "host";
    return { host: home ? s.score[1] : s.score[0], guest: home ? s.score[0] : s.score[1] };
  }
  /** The batting side decides at the end of its half: the other one bats, or it is over. */
  private decideTurn(): Turn {
    const s = this.engine.state,
      { host, guest } = this.realScore(),
      last = s.inning >= s.maxInnings;
    if (this.room.role === "guest")
      // Top half done: in the last inning a home side already ahead does not need to bat.
      return { over: last && host > guest, inning: s.inning, batter: "host" };
    return { over: last, inning: s.inning + 1, batter: "guest" };
  }
  private applyTurn(t: Turn) {
    if (!this.engine.versus) return;
    this.handed = false;
    this.buffer = [];
    if (t.over) {
      this.finish();
      return;
    }
    const meBat = (t.batter === "host") === (this.room.role === "host");
    this.engine.versusTurn(meBat, t.inning);
    this.lastPhase = "";
  }
  private finish(reason?: string) {
    this.engine.versusFinish(reason);
    const r = this.engine.versus?.result ?? null;
    this.set({ stage: "over", result: r, report: reason ? "skip" : "none" });
    if (!reason && r && this.onReport && this.info.matchId) {
      this.set({ report: "sending" });
      void this.onReport({
        matchId: this.info.matchId,
        opponentId: this.opponentId,
        mine: r.mine,
        theirs: r.theirs,
      }).then((rep) => this.set({ report: rep }));
    }
  }
}
