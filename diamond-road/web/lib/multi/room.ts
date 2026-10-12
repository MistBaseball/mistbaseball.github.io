/**
 * A two-player room (stage 1 of the multiplayer: meeting and measuring the connection).
 *
 * The host opens a room with a short code, the guest types it. Nobody keeps a server list:
 * the guest says hello until the host answers. Every 2 s each side
 *   - sends an `echo` to the channel and times how long its own copy takes to come back:
 *     that is MY PING (me to the server and back, the number a player knows from other games);
 *   - sends a `ping` to the other player (which is answered with a `pong`): that gives the
 *     round trip between the two and the difference between the two clocks (stage 2 starts
 *     both screens at the same moment with it). Both messages carry the sender's own ping,
 *     so each side also shows THE OTHER PLAYER'S PING.
 * Time comes from an injected clock and `tick()` can be called by hand, so the logic is tested
 * without timers or a network.
 */
import type { Msg, Transport, TransportFactory } from "./transport";

export type Role = "host" | "guest";
export type RoomStatus =
  | "connecting"
  | "waiting" // host: open, nobody yet
  | "ready" // both are in
  | "lost" // the other side went quiet
  | "notfound" // guest: no host answered
  | "full" // a third player
  | "error"
  | "closed";
export type Peer = {
  id: string;
  name: string;
  /** The other player's ping to the server (ms), as he measures it. */
  ping: number | null;
  /** Round trip between the two players (ms, median of the last samples). */
  rtt: number | null;
  /** His clock minus mine (ms), from the sample with the shortest round trip. */
  offset: number | null;
  /** When (my clock) we last heard from him. */
  seen: number;
};
export type RoomState = {
  code: string;
  role: Role;
  status: RoomStatus;
  id: string;
  name: string;
  /** My ping to the server (ms, median of the last samples). */
  ping: number | null;
  peer: Peer | null;
};

export const ROOM = { pingEvery: 2000, lostAfter: 7000, joinTries: 6 };

/** No 0/O, 1/I/L: easy to read out and type. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 5;
export const newRoomCode = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(CODE_LEN)),
    (b) => ALPHABET[b % ALPHABET.length],
  ).join("");
/** "k7qf2" → "K7QF2" (null if it cannot be a room code). */
export function normalizeRoomCode(input: string): string | null {
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === CODE_LEN && [...c].every((ch) => ALPHABET.includes(ch)) ? c : null;
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const SAMPLES = 7;

export class Room {
  /** This player in the room (kept across a page refresh, so the other side knows him). */
  readonly id: string;
  private transport: Transport;
  private status: RoomStatus = "connecting";
  private peer: Peer | null = null;
  private pings: number[] = [];
  private samples: { rtt: number; offset: number }[] = [];
  private tries = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private snap: RoomState;
  /** Events other than the room's own (stage 2: pitches, swings) go here. */
  onEvent: ((m: Msg) => void) | null = null;

  readonly code: string;
  readonly role: Role;
  private name: string;
  private clock: () => number;

  constructor(
    code: string,
    role: Role,
    name: string,
    factory: TransportFactory,
    clock: () => number = () => performance.now(),
    autoTick = true,
    id?: string,
  ) {
    this.id =
      id && /^[0-9a-f]{8}$/.test(id)
        ? id
        : Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join("");
    // (Plain fields, not constructor parameter properties: the checks run with Node's
    // type stripping, which does not accept those.)
    this.code = code;
    this.role = role;
    this.name = name;
    this.clock = clock;
    this.snap = this.build();
    this.transport = factory(code, {
      onMessage: (m) => this.receive(m),
      onStatus: (s) => {
        if (this.status === "closed") return;
        if (s === "open") {
          this.status = role === "host" ? "waiting" : "connecting";
          this.hello();
          this.tick();
        } else this.status = "error";
        this.emit();
      },
    });
    if (autoTick) this.timer = setInterval(() => this.tick(), ROOM.pingEvery);
  }

  get state() {
    return this.snap;
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  send(e: string, d?: Record<string, unknown>) {
    this.transport.send({ e, from: this.id, d });
  }

  /** One round of the room's upkeep: pings, hello retries, the "went quiet" check. */
  tick() {
    if (this.status === "closed" || this.status === "error" || this.status === "full") return;
    const now = this.clock();
    this.send("echo", { t0: now });
    if (this.peer) {
      this.send("ping", { t0: now, sp: this.ping });
      // A guest who lost the host (the host's page was refreshed) says hello again.
      if (this.role === "guest" && this.status === "lost") this.hello();
      if (this.status === "ready" && now - this.peer.seen > ROOM.lostAfter) this.status = "lost";
    } else if (this.role === "guest" && this.status === "connecting") {
      if (++this.tries > ROOM.joinTries) this.status = "notfound";
      else this.hello();
    }
    this.emit();
  }

  leave() {
    if (this.status === "closed") return;
    try {
      this.send("bye");
    } catch {
      /* already gone */
    }
    this.status = "closed";
    if (this.timer) clearInterval(this.timer);
    this.transport.close();
    this.emit();
  }

  private get ping() {
    const m = median(this.pings);
    return m === null ? null : Math.round(m);
  }
  private hello(to?: string) {
    this.send("hello", { name: this.name, host: this.role === "host", to });
  }
  private build(): RoomState {
    return {
      code: this.code,
      role: this.role,
      status: this.status,
      id: this.id,
      name: this.name,
      ping: this.ping,
      peer: this.peer ? { ...this.peer } : null,
    };
  }
  private emit() {
    this.snap = this.build();
    for (const l of this.listeners) l();
  }

  private receive(m: Msg) {
    if (this.status === "closed") return;
    const d = m.d ?? {};
    if (m.from === this.id) {
      // My own copy: the time it took is my ping.
      if (m.e === "echo" && typeof d.t0 === "number") {
        this.pings = [...this.pings, Math.max(0, this.clock() - d.t0)].slice(-SAMPLES);
        this.emit();
      }
      return;
    }
    if (typeof d.to === "string" && d.to !== this.id) return;
    const now = this.clock();
    if (m.e === "hello") {
      const name = typeof d.name === "string" ? d.name.slice(0, 16) : "상대";
      if (this.role === "host") {
        if (!this.peer)
          this.peer = { id: m.from, name, ping: null, rtt: null, offset: null, seen: now };
        else if (this.peer.id !== m.from) {
          this.send("full", { to: m.from });
          return;
        }
        this.peer.name = name;
        this.peer.seen = now;
        if (this.status === "waiting" || this.status === "lost") this.status = "ready";
        this.hello(m.from);
      } else if (d.host === true && (!this.peer || this.peer.id === m.from)) {
        this.peer = this.peer ?? {
          id: m.from,
          name,
          ping: null,
          rtt: null,
          offset: null,
          seen: now,
        };
        this.peer.name = name;
        this.peer.seen = now;
        if (this.status === "connecting" || this.status === "lost") this.status = "ready";
      }
      this.emit();
      return;
    }
    if (m.e === "full") {
      this.status = "full";
      this.emit();
      return;
    }
    // Everything else only counts from the player in the room.
    if (!this.peer || this.peer.id !== m.from) return;
    this.peer.seen = now;
    if (this.status === "lost") this.status = "ready";
    if (typeof d.sp === "number") this.peer.ping = Math.round(d.sp);
    if (m.e === "ping" && typeof d.t0 === "number") {
      this.send("pong", { to: m.from, t0: d.t0, t1: now, sp: this.ping });
    } else if (m.e === "pong" && typeof d.t0 === "number" && typeof d.t1 === "number") {
      const rtt = Math.max(0, now - d.t0);
      this.samples = [...this.samples, { rtt, offset: d.t1 - (d.t0 + rtt / 2) }].slice(-SAMPLES);
      this.peer.rtt = Math.round(median(this.samples.map((s) => s.rtt)) ?? rtt);
      this.peer.offset = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset;
    } else if (m.e === "bye") {
      this.peer = null;
      this.samples = [];
      this.status = this.role === "host" ? "waiting" : "closed";
    } else if (m.e !== "echo") this.onEvent?.(m);
    this.emit();
  }
}

/** Green up to 80 ms, yellow up to 150 ms, red above (null: not measured yet). */
export const pingLevel = (ms: number | null): "none" | "good" | "ok" | "bad" =>
  ms === null ? "none" : ms <= 80 ? "good" : ms <= 150 ? "ok" : "bad";
