/**
 * Multiplayer (stage 1): the header button, the room window (open a room / join by code) and
 * the ping badge. The badge sits in the header, so it never covers the field.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { hostRoom, joinRoom, leave, multiAvailable, useRoom } from "@/lib/multi/store";
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

export function MultiButton({ name }: { name: string }) {
  const [open, setOpen] = useState(false),
    [code, setCode] = useState(""),
    room = useRoom(),
    nick = name.trim() || "선수";
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
              친구와 1:1 대결. 한 명은 투수, 한 명은 타자를 맡고 이닝마다 공수를 바꿉니다. 지금은 방
              만들기·입장과 핑 확인까지 되고, 대결은 다음 업데이트에서 열려요.
            </DialogDescription>
          </DialogHeader>
          {!multiAvailable() ? (
            <p className="multi-note">서버 연결이 설정되지 않아 멀티플레이를 쓸 수 없어요.</p>
          ) : !room || room.status === "closed" ? (
            <div className="multi-start">
              <button
                className="primary-button"
                onClick={() => {
                  if (!hostRoom(nick)) toast.error("서버 연결이 설정되지 않았어요");
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
            <RoomView room={room} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RoomView({ room }: { room: RoomState }) {
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
