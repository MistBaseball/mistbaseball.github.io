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

function enter(code: string, role: "host" | "guest", name: string) {
  const factory = pickTransport();
  if (!factory || !engine) return false;
  leave();
  room = new Room(code, role, name, factory);
  versus = new Versus(engine, room);
  const e = engine;
  versus.onReport = (r) => reportVersus(e.state.career, profileOf(e.state.career), r);
  unsubs = [room.subscribe(notify), versus.subscribe(notify)];
  pumpTimer = setInterval(() => versus?.pump(), 16);
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
