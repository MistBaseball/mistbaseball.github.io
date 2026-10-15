/**
 * Multiplayer (stage 1): the header button, the room window (open a room / join by code) and
 * the ping badge. The badge sits in the header, so it never covers the field.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  bindEngine,
  currentVersus,
  hostRoom,
  joinRoom,
  leave,
  multiAvailable,
  useRoom,
  useVersus,
} from "@/lib/multi/store";
import {
  DERBY_COUNTS,
  DIFFICULTIES,
  PITCHES,
  type BaseballEngine,
  type Difficulty,
  type GameState,
} from "@/lib/game/engine";
import type { DerbyPick, ReportState, VersusInfo } from "@/lib/multi/versus";
import { RIVAL_LEAGUE } from "@/lib/multi/rivals";
import {
  LOBBY_LIMIT,
  matchRefusal,
  roomRefusal,
  connectLobby,
  useLobbyStats,
} from "@/lib/multi/lobby";
import { pingLevel, type RoomState, type RoomStatus } from "@/lib/multi/room";

const STATUS_TEXT: Record<RoomStatus, string> = {
  connecting: "방을 찾는 중…",
  waiting: "상대를 기다리는 중 · 위 코드를 알려 주세요",
  ready: "연결됐어요",
  lost: "상대 쪽 연결이 끊긴 것 같아요…",
  notfound: "그 코드의 방을 찾지 못했어요 (코드를 다시 확인해 주세요)",
  full: "이미 두 명이 들어 있는 방이에요",
  error: "서버에 연결하지 못했어요 · 잠시 뒤 다시 해 주세요",
  closed: "방이 닫혔어요",
};
const ms = (v: number | null) => (v === null ? "—" : `${v} ms`);

const pitchName = (id: string) =>
  id === "mix" ? "섞어서 (매번 다른 구종)" : (PITCHES.find((p) => p.id === id)?.name ?? id);
const derbyLabel = (d: DerbyPick) => `홈런 더비 · ${pitchName(d.pitch)} · ${d.count}구씩`;

export function MultiButton({
  engine,
  name,
  onStart,
}: {
  engine: BaseballEngine;
  name: string;
  onStart: () => void;
}) {
  const [open, setOpen] = useState(false),
    [code, setCode] = useState(""),
    room = useRoom(),
    vs = useVersus(),
    nick = name.trim() || "선수";
  useEffect(() => bindEngine(engine), [engine]);
  // While the window is open this page watches the lobby counts.
  useEffect(() => (open ? connectLobby() : undefined), [open]);
  // An invitation opens the window; a match that starts goes to the field.
  const stage = vs?.stage;
  useEffect(() => {
    if (stage === "invited") setOpen(true);
    if (stage === "playing") {
      setOpen(false);
      onStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);
  return (
    <>
      <button className="patch-button" onClick={() => setOpen(true)} aria-label="멀티플레이">
        <Users size={15} />
        <span>멀티</span>
        <small className="beta-tag">베타</small>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="multi-dialog">
          <DialogHeader>
            <DialogTitle>멀티플레이 (베타)</DialogTitle>
            <DialogDescription>
              친구와 1:1 대결(3이닝, 난이도는 방장이 골라요). 한 명이 던지면 한 명이 치고, 이닝마다
              공수를 바꿉니다. 수비는 AI가 맡아요. 나와 상대는 각자 자기 능력치 그대로, 팀 동료들은
              두 팀의 평균에 맞춰져요. 「홈런 더비」는 기계가 던지는 공을 번갈아 한 공씩 쳐서 홈런을
              더 많이 친 사람이 이겨요. 내 명예의 전당 난이도에는 영향이 없어요.
            </DialogDescription>
          </DialogHeader>
          {!multiAvailable() ? (
            <p className="multi-note">서버 연결이 설정되지 않아 멀티플레이를 쓸 수 없어요.</p>
          ) : !room || room.status === "closed" ? (
            <div className="multi-start">
              <LobbyLine />
              <button
                className="primary-button"
                onClick={() => {
                  const why = roomRefusal();
                  if (why) toast.error(why);
                  else if (!hostRoom(nick)) toast.error("서버 연결이 설정되지 않았어요");
                }}
              >
                방 만들기
              </button>
              <form
                className="hof-nick-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  const r = joinRoom(code, nick);
                  if (r === "bad-code") toast.error("방 코드는 영문·숫자 5자리예요 (예: K7QF2)");
                  else if (r === "full") toast.error(roomRefusal() ?? "지금은 입장할 수 없어요");
                  else if (r === "off") toast.error("서버 연결이 설정되지 않았어요");
                  else setCode("");
                }}
              >
                <input
                  aria-label="방 코드"
                  placeholder="방 코드로 입장 (예: K7QF2)"
                  value={code}
                  maxLength={6}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button type="submit" disabled={!code.trim()}>
                  입장
                </button>
              </form>
              {room?.status === "closed" && <p className="multi-note">{STATUS_TEXT.closed}</p>}
            </div>
          ) : (
            <RoomView room={room} vs={vs} engine={engine} onStart={onStart} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Online players and matches in progress, against the limits (nothing while unknown). */
function LobbyLine() {
  const s = useLobbyStats();
  if (!s) return null;
  const full = s.players >= LOBBY_LIMIT.players || s.matches >= LOBBY_LIMIT.matches;
  return (
    <p className={`multi-note lobby-line ${full ? "full" : ""}`} aria-label="접속 현황">
      접속 <b>{s.players}</b>/{LOBBY_LIMIT.players}명 · 진행 중인 경기 <b>{s.matches}</b>/
      {LOBBY_LIMIT.matches}
      {full && " · 자리가 가득 찼어요"}
    </p>
  );
}

function RoomView({
  room,
  vs,
  engine,
  onStart,
}: {
  room: RoomState;
  vs: VersusInfo | null;
  engine: BaseballEngine;
  onStart: () => void;
}) {
  const lag =
    room.peer && room.ping !== null && room.peer.ping !== null
      ? Math.round((room.ping + room.peer.ping) / 2)
      : null;
  return (
    <div className="multi-room">
      <div className="multi-code">
        <small>방 코드</small>
        <b>{room.code}</b>
        <button
          className="subtle-button"
          onClick={() => {
            void navigator.clipboard?.writeText(room.code).then(
              () => toast.success("코드를 복사했어요"),
              () => toast.error("복사하지 못했어요 · 직접 알려 주세요"),
            );
          }}
        >
          복사
        </button>
      </div>
      <p className={`multi-status ${room.status}`}>{STATUS_TEXT[room.status]}</p>
      <LobbyLine />
      <div className="multi-players">
        <div>
          <span>
            {room.name} <small>{room.role === "host" ? "방장 · 나" : "손님 · 나"}</small>
          </span>
          <Ping label="내 핑" value={room.ping} />
        </div>
        <div className={room.peer ? "" : "empty"}>
          <span>
            {room.peer ? room.peer.name : "—"}{" "}
            <small>{room.peer ? (room.role === "host" ? "손님" : "방장") : "아직 없음"}</small>
          </span>
          <Ping label="상대 핑" value={room.peer?.ping ?? null} />
        </div>
      </div>
      {lag !== null && (
        <p className="multi-note">
          두 사람 사이 지연은 약 <b>{lag} ms</b>예요
          {room.peer?.rtt != null && ` (직접 잰 왕복 ${room.peer.rtt} ms)`}.{" "}
          {lag <= 100
            ? "이 정도면 화면 차이를 느끼기 어려워요."
            : lag <= 200
              ? "조금 늦어요. 타이밍이 어긋나 보일 수 있어요."
              : "많이 늦어요. 대결하기엔 불편할 수 있어요."}
        </p>
      )}
      {room.status === "ready" && vs && (
        <VersusControls room={room} vs={vs} engine={engine} onStart={onStart} />
      )}
      <button className="subtle-button" onClick={() => leave()}>
        {room.status === "ready" || room.status === "waiting" || room.status === "lost"
          ? "방 나가기"
          : "닫기"}
      </button>
    </div>
  );
}

const Ping = ({ label, value }: { label: string; value: number | null }) => (
  <span className={`ping-chip ${pingLevel(value)}`}>
    <i />
    {label} <b>{ms(value)}</b>
  </span>
);

/** Small pill in the header: my ping and the other player's, colored by how good they are. */
export function PingBadge() {
  const room = useRoom();
  if (!room || room.status === "closed" || room.status === "notfound" || room.status === "full")
    return null;
  const peer = room.peer?.ping ?? null;
  return (
    <span
      className="ping-badge"
      role="status"
      aria-label="핑"
      title={`내 핑 ${ms(room.ping)} · 상대 핑 ${ms(peer)}`}
    >
      <span className={pingLevel(room.ping)}>
        <i />내 {room.ping === null ? "—" : room.ping}
      </span>
      <span className={room.peer ? pingLevel(peer) : "none"}>
        <i />
        상대 {room.peer ? (peer === null ? "—" : peer) : "—"}
      </span>
    </span>
  );
}

function VersusControls({
  room,
  vs,
  engine,
  onStart,
}: {
  room: RoomState;
  vs: VersusInfo;
  engine: BaseballEngine;
  onStart: () => void;
}) {
  const stats = useLobbyStats(),
    busy = engine.matchActive && !engine.versus,
    [level, setLevel] = useState<Difficulty>(vs.level),
    [kind, setKind] = useState<"match" | "derby">(vs.derby ? "derby" : "match"),
    [pitch, setPitch] = useState<string>(vs.derby?.pitch ?? "fastball"),
    [count, setCount] = useState<number>(vs.derby?.count ?? 10);
  if (vs.stage === "invited")
    return (
      <div className="vs-invite">
        <b>
          {vs.opponent}님이 {vs.derby ? derbyLabel(vs.derby) : "대결"}을 신청했어요! (난이도{" "}
          {DIFFICULTIES.find((d) => d.id === vs.level)?.label ?? "보통"})
        </b>
        <div>
          <button
            className="primary-button"
            onClick={() => {
              if (!currentVersus()?.accept())
                toast.error("진행 중인 시즌 경기를 끝낸 뒤에 받을 수 있어요");
            }}
          >
            수락
          </button>
          <button className="subtle-button" onClick={() => currentVersus()?.decline()}>
            거절
          </button>
        </div>
        {busy && <small>진행 중인 시즌 경기가 있으면 먼저 끝내야 해요.</small>}
      </div>
    );
  if (vs.stage === "inviting") return <p className="multi-note">상대의 수락을 기다리는 중…</p>;
  if (vs.stage === "playing")
    return (
      <button className="primary-button" onClick={onStart}>
        대결 화면으로
      </button>
    );
  if (room.role !== "host") return <p className="multi-note">방장이 대결을 신청하면 시작돼요.</p>;
  const derby: DerbyPick | null =
    kind === "derby" ? { pitch: pitch as DerbyPick["pitch"], count } : null;
  return (
    <>
      <div className="creation-difficulty" role="radiogroup" aria-label="게임 종류">
        <span>게임 종류</span>
        <div>
          {(
            [
              ["match", "대결 (3이닝)"],
              ["derby", "홈런 더비"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="radio"
              aria-checked={kind === id}
              className={`subtle-button ${kind === id ? "on" : ""}`}
              onClick={() => setKind(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {kind === "derby" && (
        <>
          <div className="creation-difficulty" role="radiogroup" aria-label="더비 공 개수">
            <span>
              공 개수 <small>한 사람당 · 한 공씩 번갈아 쳐요</small>
            </span>
            <div>
              {DERBY_COUNTS.map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={count === n}
                  className={`subtle-button ${count === n ? "on" : ""}`}
                  onClick={() => setCount(n)}
                >
                  {n}구
                </button>
              ))}
            </div>
          </div>
          <label className="derby-pitch">
            <span>
              던질 공 <small>기계가 던져요 · 두 사람에게 같은 순서로</small>
            </span>
            <select value={pitch} onChange={(e) => setPitch(e.target.value)} aria-label="던질 공">
              <option value="mix">섞어서 (매번 다른 구종)</option>
              {PITCHES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <div className="creation-difficulty" role="radiogroup" aria-label="대결 난이도">
        <span>
          대결 난이도 <small>멀티 대결은 명예의 전당 난이도에 영향이 없어요</small>
        </span>
        <div>
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              role="radio"
              aria-checked={level === d.id}
              className={`subtle-button ${level === d.id ? "on" : ""}`}
              onClick={() => setLevel(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <button
        className="primary-button"
        disabled={busy}
        onClick={() => {
          const why = matchRefusal(stats);
          if (why) toast.error(why);
          else if (!currentVersus()?.invite(3, level, derby))
            toast.error("지금은 대결을 신청할 수 없어요");
        }}
      >
        {derby ? `홈런 더비 신청 (${count}구)` : "대결 신청 (3이닝)"}
      </button>
      {busy && <small className="multi-note">진행 중인 시즌 경기를 끝내야 대결할 수 있어요.</small>}
    </>
  );
}

const REPORT_TEXT: Record<ReportState, string> = {
  none: "",
  skip: "",
  sending: `${RIVAL_LEAGUE}에 결과를 올리는 중…`,
  counted: `${RIVAL_LEAGUE}에 기록됐어요!`,
  waiting: "상대의 결과 보고를 기다리는 중이에요 (상대가 보고하면 반영돼요)",
  mismatch: "두 사람의 점수가 달라 기록되지 않았어요",
  fail: `${RIVAL_LEAGUE} 기록 실패 (서버 설정을 확인해 주세요)`,
};

/** Over the field in a versus match: the change of sides, and the end of the match. */
export function VersusOverlay({
  engine,
  s,
  onLeave,
}: {
  engine: BaseballEngine;
  s: GameState;
  onLeave: () => void;
}) {
  const vs = useVersus(),
    room = useRoom();
  if (s.phase === "between")
    return (
      <div className="game-overlay">
        <span className="eyebrow">멀티 대결</span>
        <h2>{s.message}</h2>
        <p>상대 화면과 맞추는 중…</p>
      </div>
    );
  const result = engine.versus?.result,
    report = vs?.report ?? "none";
  return (
    <div className="game-overlay">
      <span className="eyebrow">
        {vs?.derby ? "홈런 더비" : "멀티 대결"} · {engine.teams[1]} vs {engine.teams[0]}
      </span>
      <h2>{s.message}</h2>
      <p>{s.detail}</p>
      {!result?.reason && report === "skip" && !vs?.derby && (
        <p className="multi-note">
          명예의 전당 닉네임이 두 사람 모두 있어야 {RIVAL_LEAGUE}에 기록돼요.
        </p>
      )}
      {REPORT_TEXT[report] && <p className="multi-note">{REPORT_TEXT[report]}</p>}
      {vs?.stage === "invited" ? (
        <div className="vs-invite">
          <b>{vs.opponent}님이 한 판 더 하재요!</b>
          <div>
            <button className="primary-button" onClick={() => currentVersus()?.accept()}>
              수락
            </button>
            <button className="subtle-button" onClick={() => currentVersus()?.decline()}>
              거절
            </button>
          </div>
        </div>
      ) : room?.role === "host" && room.status === "ready" ? (
        <button
          className="primary-button"
          disabled={vs?.stage === "inviting"}
          onClick={() => currentVersus()?.invite(3, vs?.level, vs?.derby ?? null)}
        >
          {vs?.stage === "inviting" ? "상대 수락 기다리는 중…" : "한 판 더"}
        </button>
      ) : (
        <p className="multi-note">방장이 한 판 더 신청하면 바로 시작돼요.</p>
      )}
      <button
        className="subtle-button"
        onClick={() => {
          currentVersus()?.quit();
          onLeave();
        }}
      >
        멀티 대결 끝내기 (혼자 하기로)
      </button>
    </div>
  );
}

/** Side panel in a home-run derby: both tallies, the last pitch, whose turn it is. */
export function DerbyPanel({ engine, s }: { engine: BaseballEngine; s: GameState }) {
  const d = s.derby;
  if (!d) return null;
  const myTurn = !!engine.versus && !engine.versus.mirror,
    row = (who: string, hr: number, taken: number, on: boolean) => (
      <div className={`derby-row ${on ? "on" : ""}`}>
        <span>{who}</span>
        <b>{hr}</b>
        <small>
          홈런 · {taken}/{d.count}구
        </small>
      </div>
    );
  return (
    <div className="derby-panel" aria-label="홈런 더비">
      <div className="derby-head">
        <b>홈런 더비</b>
        <small>
          {pitchName(d.pitch)} · {d.count}구씩
        </small>
      </div>
      {row(`나 · ${engine.teams[1]}`, d.hr[1], d.taken[1], myTurn)}
      {row(`상대 · ${engine.teams[0]}`, d.hr[0], d.taken[0], !myTurn)}
      <p className="multi-note">
        {s.phase === "finished"
          ? "경기 끝!"
          : myTurn
            ? "내 차례 · 공을 보고 스윙! (강타 스윙이 홈런에 유리해요)"
            : "상대 차례 · 지켜보세요"}
        {d.last && ` · 지난 공: ${d.last}`}
      </p>
    </div>
  );
}
