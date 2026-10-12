/**
 * Hall of fame button (header) and window: ranking nickname, my record, public boards.
 * The record is sent again after every match (games/day/stage change) once a nickname is set.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trophy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BaseballEngine, Career } from "@/lib/game/engine";
import { tierOf } from "@/lib/game/engine";
import {
  BOARDS,
  NICK_MAX,
  ROLE_LABEL,
  SCORE_RULE,
  scoreOf,
  TIER_LABEL,
  displayName,
  ensureIdentity,
  fetchBoard,
  hofConfigured,
  attachProfile,
  profileOf,
  recordOf,
  resetHallOfFame,
  saveProfile,
  submitRecord,
  type HofProfile,
  type HofRow,
} from "@/lib/hall-of-fame";
import { RIVAL_LEAGUE, fetchRivals, winRate, type RivalRow } from "@/lib/multi/rivals";

type Sync = "idle" | "sending" | "ok" | "fail";
/** How often an open hall of fame asks for the boards again. */
const LIVE_MS = 10_000;

export function HallOfFameButton({ engine, career }: { engine: BaseballEngine; career: Career }) {
  const [open, setOpen] = useState(false),
    [profile, setProfile] = useState<HofProfile | null>(() => profileOf(career)),
    [draft, setDraft] = useState(""),
    [editing, setEditing] = useState(false),
    [sync, setSync] = useState<Sync>("idle"),
    // Opens on this career's own board.
    [board, setBoard] = useState(
      () => BOARDS.find((b) => b.id === (career.minDifficulty ?? "normal")) ?? BOARDS[2],
    ),
    [rows, setRows] = useState<HofRow[] | null>(null),
    [error, setError] = useState<false | "old" | "net">(false),
    // The 라이벌 리그 tab (versus wins and losses) instead of a difficulty board.
    [rival, setRival] = useState(false),
    [rivals, setRivals] = useState<RivalRow[] | null>(null),
    [rivalError, setRivalError] = useState<false | "none" | "net">(false);

  // Opening the window shows this career's own board (the easiest difficulty it played).
  useEffect(() => {
    if (open)
      setBoard(BOARDS.find((b) => b.id === (career.minDifficulty ?? "normal")) ?? BOARDS[2]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // Another career (loaded with a save code, or a new one): its own nickname#tag.
  useEffect(() => {
    const next = profileOf(career);
    setProfile((prev) =>
      prev && next && prev.nickname === next.nickname && prev.tag === next.tag ? prev : next,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [career.hofId, career.hofNick, career.hofTag]);

  // Auto update: after every match (and when the career moves up a stage).
  useEffect(() => {
    // Only a real player (after the save is read and the player is made) has a record.
    if (!profile || !hofConfigured() || !career.created) return;
    const named = attachProfile(career, profile),
      id = ensureIdentity(career);
    if (named || id) engine.persist();
    let alive = true;
    setSync("sending");
    submitRecord(career, profile).then((ok) => alive && setSync(ok ? "ok" : "fail"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profile,
    career.created,
    career.hofId,
    career.games,
    career.day,
    career.stage,
    career.proGoal,
    career.league,
    career.name,
  ]);

  // Boards load when the window opens or the board changes (after our own row is sent), then
  // again every 10 s while the window is open and the tab is on screen: friends' records live.
  useEffect(() => {
    if (!open || !hofConfigured()) return;
    let alive = true,
      shown = false;
    setRows(null);
    setError(false);
    // A failed refresh keeps the board on screen; only a first load that fails says so.
    const pull = () =>
      fetchBoard(board)
        .then((r) => {
          if (!alive) return;
          shown = true;
          setRows(r);
          setError(false);
        })
        .catch(
          (e: Error) => alive && !shown && setError(e.message === "old-server" ? "old" : "net"),
        );
    void pull();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void pull();
    }, LIVE_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [open, board, sync]);

  useEffect(() => {
    if (!open || !rival || !hofConfigured()) return;
    let alive = true,
      shown = false;
    setRivals(null);
    setRivalError(false);
    const pull = () =>
      fetchRivals()
        .then((r) => {
          if (!alive) return;
          shown = true;
          setRivals(r);
          setRivalError(false);
        })
        .catch(
          (e: Error) => alive && !shown && setRivalError(e.message === "no-table" ? "none" : "net"),
        );
    void pull();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void pull();
    }, LIVE_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [open, rival]);

  const register = () => {
    const p = saveProfile(draft, profile);
    if (!p) return;
    if (attachProfile(career, p)) engine.persist();
    setProfile(p);
    setEditing(false);
  };
  const mine = profile && career.hofId ? career.hofId : null,
    me = profile ? recordOf(career, profile) : null,
    tier = tierOf(career);

  return (
    <>
      <button
        className="patch-button hof-button"
        onClick={() => setOpen(true)}
        aria-label="명예의 전당"
      >
        <Trophy size={15} />
        <span>명예의 전당</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="patch-dialog hof-dialog">
          <DialogHeader>
            <DialogTitle>명예의 전당</DialogTitle>
            <DialogDescription>
              친구들과 커리어 기록을 겨뤄요 · 닉네임을 정하면 경기마다 기록이 자동으로 올라가요.
            </DialogDescription>
          </DialogHeader>
          <p className="hof-warn">
            ⚠️ 일주일 이상 아무도 접속하지 않으면 명예의 전당이 자동으로 비활성화됩니다(무료 서버
            일시정지). 그동안 게임은 정상이고, 서버가 다시 켜지면 기록도 그대로 돌아와요.
          </p>

          <section className="hof-profile">
            {!profile || editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  register();
                }}
              >
                <label htmlFor="hof-nick">랭킹 닉네임</label>
                <div className="hof-nick-row">
                  <input
                    id="hof-nick"
                    value={draft}
                    maxLength={NICK_MAX}
                    placeholder={profile?.nickname ?? "예: 철수"}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button type="submit" disabled={!draft.trim()}>
                    {profile ? "바꾸기" : "등록"}
                  </button>
                </div>
                <small>
                  선수 이름은 그대로 두고, 랭킹에는 「선수 이름 (닉네임#4자리)」로 보여요. 4자리
                  번호는 자동으로 붙어 같은 이름끼리도 구분돼요.
                </small>
              </form>
            ) : (
              <div className="hof-me-line">
                <b>
                  {profile.nickname}#{profile.tag}
                </b>
                <span>
                  {!hofConfigured()
                    ? "서버 연결 전 · 내 기록만 보여요"
                    : sync === "sending"
                      ? "기록 올리는 중…"
                      : sync === "fail"
                        ? "올리기 실패 · 다음 경기 뒤 다시 시도"
                        : "경기마다 자동 갱신 · 순위는 10초마다"}
                </span>
                <button
                  onClick={() => {
                    setDraft(profile.nickname);
                    setEditing(true);
                  }}
                >
                  닉네임 바꾸기
                </button>
              </div>
            )}
          </section>

          <section className="hof-card">
            <header>
              <strong>내 기록</strong>
              {me?.dev || career.devUsed ? <em className="hof-dev">개발자(버그 찾는 중)</em> : null}
              {career.dishonor && <em className="hof-dishonor">불명예</em>}
            </header>
            <p>
              {career.name} · {TIER_LABEL[tier]} · {ROLE_LABEL[career.role ?? "two-way"]} ·{" "}
              {career.day}일차 ·{" "}
              {BOARDS.find((b) => b.id === (career.minDifficulty ?? "normal"))?.label} 랭킹
            </p>
            <dl>
              <div>
                <dt>종합 점수</dt>
                <dd>{scoreOf(career)}</dd>
              </div>
              <div>
                <dt>경기</dt>
                <dd>{career.games}</dd>
              </div>
              <div>
                <dt>승리</dt>
                <dd>{career.wins}</dd>
              </div>
              <div>
                <dt>탈삼진</dt>
                <dd>{career.strikeouts}</dd>
              </div>
              <div>
                <dt>안타</dt>
                <dd>{career.hits}</dd>
              </div>
              <div>
                <dt>입단</dt>
                <dd>{career.proDay ? `${career.proDay}일차` : "—"}</dd>
              </div>
              <div>
                <dt>1군</dt>
                <dd>{career.firstDay ? `${career.firstDay}일차` : "—"}</dd>
              </div>
              <div>
                <dt>MLB</dt>
                <dd>{career.mlbDay ? `${career.mlbDay}일차` : "—"}</dd>
              </div>
            </dl>
          </section>

          {!hofConfigured() ? (
            <p className="hof-note">
              온라인 랭킹은 서버를 연결하면 열려요. 지금은 내 기록만 보여요.
            </p>
          ) : (
            <section>
              <div className="hof-tabs" role="tablist">
                {BOARDS.map((b) => (
                  <button
                    key={b.id}
                    role="tab"
                    aria-selected={!rival && b.id === board.id}
                    className={!rival && b.id === board.id ? "on" : undefined}
                    onClick={() => {
                      setRival(false);
                      setBoard(b);
                    }}
                  >
                    {b.label}
                  </button>
                ))}
                <button
                  role="tab"
                  aria-selected={rival}
                  className={`rival-tab ${rival ? "on" : ""}`}
                  onClick={() => setRival(true)}
                >
                  ⚔️ {RIVAL_LEAGUE}
                </button>
              </div>
              {rival ? (
                <RivalBoard rows={rivals} error={rivalError} mine={mine} />
              ) : (
                <>
                  <p className="hof-rule">
                    난이도별 랭킹 · 경기를 한 가장 쉬운 난이도에 기록돼요. {SCORE_RULE}
                  </p>
                  {error === "old" ? (
                    <p className="hof-note">
                      랭킹 서버 업데이트가 필요해요 (관리자: setup.sql 다시 실행).
                    </p>
                  ) : error ? (
                    <p className="hof-note">랭킹을 불러오지 못했어요. 10초 뒤 다시 시도해요.</p>
                  ) : !rows ? (
                    <p className="hof-note">불러오는 중…</p>
                  ) : rows.length === 0 ? (
                    <p className="hof-note">아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</p>
                  ) : (
                    <ol className="hof-list">
                      {rows.map((r, i) => (
                        <li key={r.player_id} className={r.player_id === mine ? "mine" : undefined}>
                          <span className={`hof-rank r${i + 1}`}>{i + 1}</span>
                          <span className="hof-name">
                            {displayName(r)}
                            {r.dev && <em className="hof-dev">개발자(버그 찾는 중)</em>}
                            {r.dishonor && <em className="hof-dishonor">불명예</em>}
                            <small>
                              {r.team} · {TIER_LABEL[r.tier]} · {ROLE_LABEL[r.role ?? "two-way"]} ·{" "}
                              {r.games}경기 {r.wins}승 · K {r.strikeouts} · 안타 {r.hits}
                            </small>
                          </span>
                          <b>{board.value(r)}</b>
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </section>
          )}
          <p className="hidden-hint">
            전당 입구의 낡은 명판 · 『투타 모두 정상에 섰던 그 이름으로 첫발을 뗀 자, 처음부터
            하늘에 닿으리라』
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 라이벌 리그: multiplayer wins and losses (most wins first). */
function RivalBoard({
  rows,
  error,
  mine,
}: {
  rows: RivalRow[] | null;
  error: false | "none" | "net";
  mine: string | null;
}) {
  return (
    <>
      <p className="hof-rule">
        멀티 대결 승·패 순위 · 두 사람이 모두 같은 결과를 보고한 경기만 올라가요(끊기거나 중간에
        나간 경기는 기록 없음).
      </p>
      {error === "none" ? (
        <p className="hof-note">라이벌 리그 서버 준비 중이에요 (관리자: versus.sql 실행).</p>
      ) : error ? (
        <p className="hof-note">순위를 불러오지 못했어요. 10초 뒤 다시 시도해요.</p>
      ) : !rows ? (
        <p className="hof-note">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="hof-note">아직 대결 기록이 없어요. 멀티에서 친구에게 도전해 보세요!</p>
      ) : (
        <ol className="hof-list">
          {rows.map((r, i) => (
            <li key={r.player_id} className={r.player_id === mine ? "mine" : undefined}>
              <span className={`hof-rank r${i + 1}`}>{i + 1}</span>
              <span className="hof-name">
                {displayName(r)}
                <small>
                  {r.wins + r.losses + r.draws}전 · 승률 {Math.round(winRate(r) * 100)}%
                </small>
              </span>
              <b>
                {r.wins}승 {r.losses}패{r.draws ? ` ${r.draws}무` : ""}
              </b>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

/** Developer window: wipe the whole ranking with the server-side admin password. */
export function HofResetForm() {
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false);
  if (!hofConfigured()) return null;
  return (
    <form
      className="hof-reset"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!code || busy) return;
        if (!window.confirm("명예의 전당의 모든 기록을 지울까요? 되돌릴 수 없습니다.")) return;
        setBusy(true);
        try {
          const n = await resetHallOfFame(code);
          toast.success(`명예의 전당을 초기화했습니다 (기록 ${n}개 삭제)`);
          setCode("");
        } catch (err) {
          toast.error(
            (err as Error).message === "no-function"
              ? "서버에 초기화 기능이 없습니다 (reset.sql을 실행하세요)"
              : "관리자 비밀번호가 틀렸습니다",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="hof-admin">명예의 전당 초기화</label>
      <div className="hof-nick-row">
        <input
          id="hof-admin"
          type="password"
          autoComplete="off"
          placeholder="관리자 비밀번호"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit" disabled={!code || busy}>
          {busy ? "지우는 중…" : "모두 지우기"}
        </button>
      </div>
    </form>
  );
}
