/**
 * 라이벌 리그: the win/loss board of versus matches (tools/hall-of-fame/versus.sql).
 * Each player reports his own match with his hall-of-fame id and secret; the server counts a
 * match only when both players have reported the same score (so nobody can write a win alone).
 */
import { HOF_KEY, HOF_URL } from "../hof-config";
import type { Career } from "../game/engine";
import type { HofProfile } from "../hall-of-fame";
import type { ReportState } from "./versus";

export type RivalRow = {
  player_id: string;
  nickname: string;
  tag: string;
  player_name: string;
  wins: number;
  losses: number;
  draws: number;
};
export const RIVAL_LEAGUE = "라이벌 리그";

const headers = (): Record<string, string> => ({
  apikey: HOF_KEY,
  "Content-Type": "application/json",
  ...(HOF_KEY.startsWith("eyJ") ? { Authorization: `Bearer ${HOF_KEY}` } : {}),
});

export async function fetchRivals(limit = 50): Promise<RivalRow[]> {
  const res = await fetch(
    `${HOF_URL}/rest/v1/versus_board?select=player_id,nickname,tag,player_name,wins,losses,draws` +
      `&order=wins.desc,losses.asc,draws.desc&limit=${limit}`,
    { headers: headers() },
  );
  // No table yet (versus.sql not run): 404.
  if (res.status === 404) throw new Error("no-table");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as RivalRow[];
}

/** Win rate shown on the board (draws count half). */
export const winRate = (r: Pick<RivalRow, "wins" | "losses" | "draws">) => {
  const n = r.wins + r.losses + r.draws;
  return n ? (r.wins + r.draws / 2) / n : 0;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * Reports a finished match. The other player's report may come a moment later (or at the same
 * moment), so a "waiting" answer is asked again a few times.
 */
export async function reportVersus(
  c: Career,
  p: HofProfile | null,
  r: { matchId: string; opponentId?: string; mine: number; theirs: number },
): Promise<ReportState> {
  if (!p || !c.hofId || !c.hofSecret || !r.opponentId) return "skip";
  const body = JSON.stringify({
    rec: {
      match_id: r.matchId,
      player_id: c.hofId,
      opponent_id: r.opponentId,
      my_score: r.mine,
      opp_score: r.theirs,
      nickname: p.nickname,
      tag: p.tag,
      player_name: (c.name || "선수").slice(0, 16),
    },
    secret: c.hofSecret,
  });
  let last: ReportState = "fail";
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(`${HOF_URL}/rest/v1/rpc/report_versus`, {
        method: "POST",
        headers: headers(),
        body,
      });
      if (!res.ok) return "fail";
      const answer = String(await res.json());
      last = answer === "counted" ? "counted" : answer === "mismatch" ? "mismatch" : "waiting";
      if (last !== "waiting") return last;
    } catch {
      return "fail";
    }
    await wait(2500);
  }
  return last;
}
