/** The one room this page is in (or none) and its versus match: the UI reads them here. */
import { useSyncExternalStore } from "react";
import type { BaseballEngine } from "../game/engine";
import { profileOf } from "../hall-of-fame";
import { Room, newRoomCode, normalizeRoomCode, type RoomState } from "./room";
import { pickTransport } from "./transport";
import { Versus, type VersusInfo } from "./versus";
import { reportVersus } from "./rivals";

let room: Room | null = null;
let versus: Versus | null = null;
let engine: BaseballEngine | null = null;
let unsubs: (() => void)[] = [];
let pumpTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** The page's game engine (the versus match plays on it). */
export function bindEngine(e: BaseballEngine) {
  engine = e;
}

/** The room (and a match in it) survive a page refresh in this tab (sessionStorage). */
const SESSION_KEY = "diamond-road-multi";
type Session = {
  code: string;
  role: "host" | "guest";
  id: string;
  name: string;
  versus: ReturnType<Versus["save"]>;
};
let saveTick = 0;
function saveSession() {
  try {
    if (!room) sessionStorage.removeItem(SESSION_KEY);
    else {
      const d: Session = {
        code: room.code,
        role: room.role,
        id: room.id,
        name: room.state.name,
        versus: versus?.save() ?? null,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(d));
    }
  } catch {
    /* private mode or full: no resume after a refresh */
  }
}
/** After a page refresh: back into the room and the match (call after the career is loaded). */
export function restoreMulti(e: BaseballEngine) {
  engine = e;
  let d: Session | null = null;
  try {
    d = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
  } catch {
    d = null;
  }
  if (!d || !normalizeRoomCode(d.code) || (d.role !== "host" && d.role !== "guest")) return false;
  if (!enter(d.code, d.role, d.name, d.id)) return false;
  if (d.versus && versus) versus.restore(d.versus);
  return !!d.versus;
}

function enter(code: string, role: "host" | "guest", name: string, id?: string) {
  const factory = pickTransport();
  if (!factory || !engine) return false;
  leave();
  room = new Room(code, role, name, factory, undefined, true, id);
  versus = new Versus(engine, room);
  const e = engine;
  versus.onReport = (r) => reportVersus(e.state.career, profileOf(e.state.career), r);
  unsubs = [room.subscribe(notify), versus.subscribe(notify)];
  pumpTimer = setInterval(() => {
    versus?.pump();
    if (++saveTick % 30 === 0) saveSession();
  }, 16);
  saveSession();
  notify();
  return true;
}
export const multiAvailable = () => pickTransport() !== null;
/** Opens a room; returns its code (null if no connection is configured). */
export function hostRoom(name: string): string | null {
  const code = newRoomCode();
  return enter(code, "host", name) ? code : null;
}
export function joinRoom(input: string, name: string): "bad-code" | "off" | "ok" {
  const code = normalizeRoomCode(input);
  if (!code) return "bad-code";
  return enter(code, "guest", name) ? "ok" : "off";
}
export function leave() {
  versus?.quit();
  unsubs.forEach((u) => u());
  unsubs = [];
  if (pumpTimer) clearInterval(pumpTimer);
  pumpTimer = null;
  room?.leave();
  room = null;
  versus = null;
  saveSession();
  notify();
}
export const currentRoom = () => room;
export const currentVersus = () => versus;

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
/** The room's state (re-renders on every change), or null when not in a room. */
export const useRoom = (): RoomState | null =>
  useSyncExternalStore(subscribe, () => room?.state ?? null);
/** The versus match (invitation, playing, result), or null when not in a room. */
export const useVersus = (): VersusInfo | null =>
  useSyncExternalStore(subscribe, () => versus?.info ?? null);
