/** The lobby's pure parts: limits, counting a Presence state, why something is refused. */

/** Free-plan safe: ~100 messages/s shared, a match uses about 5–10 (see docs). */
export const LOBBY_LIMIT = { players: 30, matches: 10 };
export type LobbyStats = { players: number; matches: number };

/** Counts from a Presence state ({key: [meta, ...]}): people in rooms, rooms in a match. */
export function countLobby(state: Record<string, { room?: unknown; play?: unknown }[]>): LobbyStats {
  let players = 0;
  const playing = new Set<string>();
  for (const metas of Object.values(state)) {
    const m = metas.find((x) => typeof x.room === "string");
    if (!m) continue;
    players++;
    if (m.play === true) playing.add(String(m.room));
  }
  return { players, matches: playing.size };
}
/** Why a new room is refused with these counts (null: fine, or counts unknown). */
export function roomRefusalFor(s: LobbyStats | null): string | null {
  if (s && s.players >= LOBBY_LIMIT.players)
    return `지금 접속자가 많아요 (${s.players}/${LOBBY_LIMIT.players}명) · 잠시 뒤 다시 해 주세요`;
  return null;
}
/** Why a match cannot start with these counts (null: fine, or counts unknown). */
export function matchRefusalFor(s: LobbyStats | null): string | null {
  if (s && s.matches >= LOBBY_LIMIT.matches)
    return `진행 중인 경기가 가득 찼어요 (${s.matches}/${LOBBY_LIMIT.matches}) · 잠시 뒤 다시 해 주세요`;
  return null;
}
