/**
 * Settings: personal save code. Issue a code (the career goes up to the server under it and
 * is updated after every match), or type a code to load that career on this computer.
 */
import { useState } from "react";
import { toast } from "sonner";
import type { BaseballEngine, Career } from "@/lib/game/engine";
import { ensureIdentity } from "@/lib/hall-of-fame";
import {
  cloudConfigured,
  downloadCareer,
  loadCode,
  newCode,
  normalizeCode,
  saveCode,
  uploadCareer,
} from "@/lib/cloud-save";

const why = (err: unknown) =>
  (err as Error).message === "no-function"
    ? "서버에 저장 기능이 아직 없어요 (cloud-save.sql 실행 필요)"
    : "서버에 연결하지 못했어요 · 잠시 뒤 다시 해 주세요";

/**
 * "Load my account by code": used on the start screen (no career yet, nothing to overwrite)
 * and in the settings (asks before replacing this computer's career).
 */
export function CodeLoader({
  engine,
  onLoaded,
  confirmOverwrite = false,
  label = "코드로 불러오기 (예: K7QF-2M9X)",
}: {
  engine: BaseballEngine;
  onLoaded: (code: string) => void;
  confirmOverwrite?: boolean;
  label?: string;
}) {
  const [input, setInput] = useState(""),
    [busy, setBusy] = useState(false);
  if (!cloudConfigured()) return null;
  const load = async () => {
    const c = normalizeCode(input);
    if (!c) {
      toast.error("코드는 영문·숫자 8자리예요 (예: K7QF-2M9X)");
      return;
    }
    if (
      confirmOverwrite &&
      !window.confirm(`코드 ${c} 의 기록을 불러올까요? 지금 이 컴퓨터의 기록은 덮어써져요.`)
    )
      return;
    setBusy(true);
    try {
      const data = await downloadCareer(c);
      if (!data) toast.error("그 코드로 저장된 기록이 없어요");
      else if (!engine.importCareer(data)) toast.error("저장된 기록을 읽지 못했어요");
      else {
        saveCode(c);
        setInput("");
        toast.success(`코드 ${c} 의 기록을 불러왔어요`);
        onLoaded(c);
      }
    } catch (err) {
      toast.error(why(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="hof-nick-row"
      onSubmit={(e) => {
        e.preventDefault();
        void load();
      }}
    >
      <input
        aria-label="불러올 저장 코드"
        placeholder={label}
        value={input}
        maxLength={9}
        onChange={(e) => setInput(e.target.value)}
      />
      <button type="submit" disabled={busy || !input.trim()}>
        {busy ? "불러오는 중…" : "불러오기"}
      </button>
    </form>
  );
}

export function CloudSave({
  engine,
  career,
  onLoaded,
}: {
  engine: BaseballEngine;
  career: Career;
  onLoaded: () => void;
}) {
  const [code, setCode] = useState(loadCode),
    [busy, setBusy] = useState(false);
  if (!cloudConfigured()) return null;

  const issue = async () => {
    const c = newCode();
    setBusy(true);
    // The code is tied to this player (its id), so another career cannot overwrite it.
    if (ensureIdentity(career)) engine.persist();
    try {
      await uploadCareer(c, career);
      saveCode(c);
      setCode(c);
      toast.success(`저장 코드 ${c} 를 발급했어요 · 꼭 적어 두세요`);
    } catch (err) {
      toast.error(why(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cloud-save">
      <h4>
        개인 저장 코드 <small>다른 컴퓨터에서도 이어 하기</small>
      </h4>
      {code ? (
        <div className="cloud-code">
          <b>{code}</b>
          <button
            className="subtle-button"
            onClick={() => {
              void navigator.clipboard?.writeText(code).then(
                () => toast.success("코드를 복사했어요"),
                () => toast.error("복사하지 못했어요 · 직접 적어 두세요"),
              );
            }}
          >
            복사
          </button>
          <small>
            경기가 끝날 때마다 이 코드로 자동 저장돼요. 코드를 아는 사람은 누구나 이 기록을 불러올
            수 있으니 친구에게 알려 주지 마세요.
          </small>
        </div>
      ) : (
        <button className="subtle-button" disabled={busy} onClick={issue}>
          {busy ? "발급 중…" : "내 저장 코드 발급받기"}
        </button>
      )}
      <CodeLoader
        engine={engine}
        confirmOverwrite
        onLoaded={(c) => {
          setCode(c);
          onLoaded();
        }}
      />
    </div>
  );
}

export type SyncResult = "off" | "ok" | "stale" | "other-career" | "fail";
/**
 * After every match (and day / stage change): the career goes up under the saved code.
 * "stale": the code already holds a career further along (played on another computer), so
 * this one was not saved over it. "other-career": the code belongs to another player.
 */
export async function syncCareer(career: Career): Promise<SyncResult> {
  const code = loadCode();
  if (!code || !cloudConfigured()) return "off";
  try {
    await uploadCareer(code, career);
    return "ok";
  } catch (err) {
    const m = (err as Error).message;
    return m === "stale" || m === "other-career" ? m : "fail";
  }
}

/** Loads the career saved under this browser's code (after "stale"). */
export async function pullCareer(engine: BaseballEngine): Promise<boolean> {
  const code = loadCode();
  if (!code) return false;
  const data = await downloadCareer(code).catch(() => null);
  return !!data && engine.importCareer(data);
}
