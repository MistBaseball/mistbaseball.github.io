/** The one room this page is in (or none): the dialog and the ping badge both read it. */
import { useSyncExternalStore } from "react";
import { Room, newRoomCode, normalizeRoomCode, type RoomState } from "./room";
import { pickTransport } from "./transport";

let room: Room | null = null;
let unsub: (() => void) | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function enter(code: string, role: "host" | "guest", name: string) {
  const factory = pickTransport();
  if (!factory) return false;
  leave();
  room = new Room(code, role, name, factory);
  unsub = room.subscribe(notify);
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
  unsub?.();
  unsub = null;
  room?.leave();
  room = null;
  notify();
}
export const currentRoom = () => room;

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
/** The room's state (re-renders on every change), or null when not in a room. */
export const useRoom = (): RoomState | null =>
  useSyncExternalStore(subscribe, () => room?.state ?? null);
