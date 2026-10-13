/**
 * The lobby: who is online and how many matches are being played, counted with Supabase
 * Realtime Presence on the channel `dr-lobby`. Everyone in a room tracks `{room, play}`;
 * a page that only looks at the room window watches without tracking. Presence disappears
 * by itself when a tab closes. There is no server of our own, so the limits are enforced by
 * the pages themselves (they keep honest players out; they are not a lock).
 * No Supabase (or `?mp=local`): no counts and no limits.
 */
import { useSyncExternalStore } from "react";
import { HOF_KEY, HOF_URL } from "../hof-config";
import {
  LOBBY_LIMIT,
  countLobby,
  matchRefusalFor,
  roomRefusalFor,
  type LobbyStats,
} from "./lobby-core";

type Track = { room: string; play: boolean } | null;

let client: import("@supabase/realtime-js").RealtimeClient | null = null;
let chan: import("@supabase/realtime-js").RealtimeChannel | null = null;
let users = 0;
let stats: LobbyStats | null = null;
let want: Track = null;
let sent = "";
const key = Math.random().toString(36).slice(2, 12);
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const lobbyAvailable = () => {
  try {
    if (new URLSearchParams(location.search).get("mp") === "local") return false;
  } catch {
    return false;
  }
  return !!(HOF_URL && HOF_KEY);
};

function push() {
  if (!chan) return;
  const next = JSON.stringify(want);
  if (next === sent) return;
  sent = next;
  try {
    if (want) void chan.track({ room: want.room, play: want.play });
    else void chan.untrack();
  } catch {
    /* connection not ready: retried on the next change */
    sent = "";
  }
}

async function open() {
  const { RealtimeClient } = await import("@supabase/realtime-js");
  if (users === 0 || client) return;
  client = new RealtimeClient(`${HOF_URL.replace(/^http/, "ws")}/realtime/v1`, {
    params: { apikey: HOF_KEY },
  });
  const c = client.channel("dr-lobby", { config: { presence: { key } } });
  chan = c;
  c.on("presence", { event: "sync" }, () => {
    stats = countLobby(c.presenceState() as never);
    notify();
  });
  c.subscribe((status: string) => {
    if (status === "SUBSCRIBED") {
      sent = "";
      push();
    } else if (status !== "JOINING") {
      stats = null;
      notify();
    }
  });
}

/** A page needs the lobby (the room window is open, or it is in a room). Returns the release. */
export function connectLobby(): () => void {
  if (!lobbyAvailable()) return () => {};
  users++;
  if (users === 1) void open().catch(() => {});
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--users > 0) return;
    users = 0;
    try {
      void chan?.unsubscribe();
      void client?.disconnect();
    } catch {
      /* already gone */
    }
    client = chan = null;
    stats = null;
    sent = "";
    notify();
  };
}

/** What this page tells the others (null: only watching). */
export function trackLobby(t: Track) {
  want = t;
  push();
}

export const lobbyStats = () => stats;
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
/** The lobby counts (null: unknown, so nothing is limited). */
export const useLobbyStats = (): LobbyStats | null =>
  useSyncExternalStore(subscribe, () => stats);

export const roomRefusal = (s: LobbyStats | null = stats) => roomRefusalFor(s);
export const matchRefusal = (s: LobbyStats | null = stats) => matchRefusalFor(s);
export { LOBBY_LIMIT, countLobby, type LobbyStats };
