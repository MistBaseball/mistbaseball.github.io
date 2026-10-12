/**
 * How two browsers talk in a room. A message is {e: event, from: sender id, d: data}.
 *  - supabaseTransport: Supabase Realtime Broadcast on the channel `dr-room-CODE` (the same
 *    project as the hall of fame; `self: true` so the sender gets its own message back, which
 *    is how a player measures his own ping to the server).
 *  - localTransport: BroadcastChannel between tabs of one browser, with a simulated ping.
 *    For testing only (`?mp=local&lag=60`), no server involved.
 */
import { HOF_KEY, HOF_URL } from "../hof-config";

export type Msg = { e: string; from: string; d?: Record<string, unknown> };
export type TransportStatus = "open" | "closed" | "error";
export type Transport = { send(m: Msg): void; close(): void };
export type TransportHandlers = {
  onMessage(m: Msg): void;
  onStatus(s: TransportStatus): void;
};
export type TransportFactory = (code: string, h: TransportHandlers) => Transport;

const topic = (code: string) => `dr-room-${code}`;

export const supabaseTransport: TransportFactory = (code, h) => {
  type Chan = import("@supabase/realtime-js").RealtimeChannel;
  type Client = import("@supabase/realtime-js").RealtimeClient;
  let client: Client | null = null,
    chan: Chan | null = null,
    closed = false;
  void (async () => {
    const { RealtimeClient } = await import("@supabase/realtime-js");
    if (closed) return;
    client = new RealtimeClient(`${HOF_URL.replace(/^http/, "ws")}/realtime/v1`, {
      params: { apikey: HOF_KEY },
    });
    chan = client.channel(topic(code), { config: { broadcast: { self: true, ack: false } } });
    chan.on("broadcast", { event: "m" }, (ev: { payload?: unknown }) => {
      const m = ev.payload as Msg | undefined;
      if (m && typeof m.e === "string" && typeof m.from === "string") h.onMessage(m);
    });
    chan.subscribe((status: string) => {
      if (closed) return;
      if (status === "SUBSCRIBED") h.onStatus("open");
      else if (status === "CLOSED") h.onStatus("closed");
      else h.onStatus("error");
    });
  })().catch(() => h.onStatus("error"));
  return {
    send(m) {
      if (chan) void chan.send({ type: "broadcast", event: "m", payload: m });
    },
    close() {
      closed = true;
      try {
        void chan?.unsubscribe();
        void client?.disconnect();
      } catch {
        /* already gone */
      }
    },
  };
};

/** Tabs of one browser; `lag` = simulated round trip to the "server" in ms (like a ping). */
export const localTransport =
  (lag = 0): TransportFactory =>
  (code, h) => {
    const bc = new BroadcastChannel(topic(code));
    let closed = false;
    const later = (ms: number, fn: () => void) =>
      setTimeout(() => {
        if (!closed) fn();
      }, ms);
    bc.onmessage = (ev: MessageEvent) => {
      const { m, lag: theirs } = ev.data as { m: Msg; lag: number };
      // Sender to server to receiver: half of each round trip.
      later((theirs + lag) / 2, () => h.onMessage(m));
    };
    later(0, () => h.onStatus("open"));
    return {
      send(m) {
        bc.postMessage({ m, lag });
        // The sender's own copy comes back after a full round trip (self echo).
        later(lag, () => h.onMessage(m));
      },
      close() {
        closed = true;
        bc.close();
      },
    };
  };

/** The transport this page uses: local (tabs) with ?mp=local, else Supabase. */
export function pickTransport(): TransportFactory | null {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("mp") === "local") return localTransport(Number(q.get("lag")) || 0);
  } catch {
    /* not in a browser */
  }
  return HOF_URL && HOF_KEY ? supabaseTransport : null;
}
