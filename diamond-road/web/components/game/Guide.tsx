/**
 * 조작법 window (replaces the old step-by-step tutorial): five tabs that can be opened at any
 * time from the header (or H). The game pauses while it is open. Hidden conditions are never
 * stated plainly: every tab carries riddle-like hints (small italic notes) instead.
 */
import { useState } from "react";
import { Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Tab = "rules" | "logic" | "pitcher" | "batter" | "hidden";
const TABS: { id: Tab; label: string }[] = [
  { id: "rules", label: "게임 규칙" },
  { id: "logic", label: "게임 기본 로직" },
  { id: "pitcher", label: "투수" },
  { id: "batter", label: "타자" },
  { id: "hidden", label: "히든" },
];

/** A hidden hint: a small italic note (a riddle, never the condition itself). */
const Hint = ({ from, children }: { from: string; children: React.ReactNode }) => (
  <p className="hidden-hint guide-hint">
    {from} · &ldquo;{children}&rdquo;
  </p>
);

const Keys = ({ rows }: { rows: [string[], string][] }) => (
  <dl className="guide-keys">
    {rows.map(([keys, what]) => (
      <div key={what}>
        <dt>
          {keys.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
        </dt>
        <dd>{what}</dd>
      </div>
    ))}
  </dl>
);

function Rules() {
  return (
    <>
      <section>
        <h3>하루 흐름</h3>
        <ul>
          <li>
            <b>아침</b>: 행동력 5로 훈련·수업·휴식을 합니다(1번에 1씩). 훈련은 미니게임 결과에 따라
            능력치가 오릅니다(고교 0~4, 프로 0~8, 설정에서 난이도
            &lsquo;쉬움&rsquo;·&lsquo;응애&rsquo;면 1.5배).
          </li>
          <li>
            <b>오후</b>: 시즌 경기 한 판. 경기를 끝내야 다음 날이 됩니다.
          </li>
          <li>
            <b>밤</b>: 체력 +25 회복, 행동력 다시 5. 경기 결과와 경험치·평가 변화를 보여 줍니다.
          </li>
        </ul>
      </section>
      <section>
        <h3>경기</h3>
        <ul>
          <li>기본 3이닝(설정에서 9이닝). 초에는 내가 던지고(수비), 말에는 우리가 칩니다.</li>
          <li>3스트라이크 삼진, 4볼 볼넷, 3아웃이면 공수 교대. 동점이면 무승부로 끝납니다.</li>
          <li>나는 1번 타자이고, 2~9번은 동료가 자기 능력치로 타석에 섭니다(스윙은 모두 내가).</li>
          <li>비 오는 날은 모두 실수가 늘고, 이닝마다 동전 던지기로 우천취소가 될 수 있습니다.</li>
        </ul>
      </section>
      <section>
        <h3>목표와 성장</h3>
        <ul>
          <li>
            <b>고교</b>: 꿈의 구단 스카우트 평가 100 → 입단 제의.
          </li>
          <li>
            <b>프로 2군</b>: 1군 신뢰도 100 → 1군 승격.
          </li>
          <li>
            <b>프로 1군</b>: 메이저리그 4개 구단 스카우트가 동시에 평가. 100이 된 구단과 계약하거나,
            모두 100이 된 뒤 전부 거절하면 국내에 남아 능력치 상한이 250이 됩니다.
          </li>
          <li>
            <b>MLB</b>: 하드 모드 · 무한 모드.
          </li>
          <li>
            능력치 상한은 고교 100, 프로 200. 경기에서 모은 경험치(XP)로 구종 상점에서 새 구종을
            익힙니다.
          </li>
          <li>로고 옆 명예의 전당에서 친구들과 기록을 겨룹니다.</li>
        </ul>
        <Hint from="스카우트 수첩 마지막 장">
          모든 제안을 웃으며 거절한 선수가 있었다. 그날 이후 그의 한계는 사라졌다.
        </Hint>
      </section>
      <section>
        <h3>경기 결과와 평가</h3>
        <ul>
          <li>
            경기마다 스카우트 평가(프로에서는 신뢰도)가 3~30점 오릅니다. 탈삼진·안타·득점·승리가
            많을수록, 무실점으로 이기면 더 많이 올라요.
          </li>
        </ul>
        <Hint from="선수 등록 서류 뒷면 낙서">
          처음부터 정상에 선 신입이 딱 한 명 있었다. 그는 등록 서류에 바다 건너 &lsquo;두 개의
          칼&rsquo;의 이름을 적었다.
        </Hint>
      </section>
    </>
  );
}

function Logic() {
  return (
    <>
      <section>
        <h3>투구</h3>
        <ul>
          <li>공은 노린 곳에서 제구 오차만큼 벗어납니다. 제구가 낮거나 지치면 더 벗어납니다.</li>
          <li>조준판의 색 영역은 그 구종이 최대로 휘는 범위입니다.</li>
          <li>던질 때마다 체력이 줄고, 지치면 구속·제구가 떨어지고 폭투가 늘어납니다.</li>
          <li>
            &lsquo;결정구&rsquo; 구종(스플리터·포크볼·스위퍼 등)은 상대가 맞히기 어렵지만 체력이 더
            듭니다.
          </li>
        </ul>
      </section>
      <section>
        <h3>타격과 타구</h3>
        <ul>
          <li>맞힌 타이밍과 배트 위치가 정확할수록, 컨택·파워가 높을수록 강한 타구가 나옵니다.</li>
          <li>
            약한 타구는 땅볼, 강한 타구는 뜬공·라이너, 아주 멀리 가면 홈런입니다. 빗맞으면
            파울입니다.
          </li>
        </ul>
      </section>
      <section>
        <h3>주루와 수비</h3>
        <ul>
          <li>타자와 주자는 공이 살아 있는 동안 계속 달립니다.</li>
          <li>뜬공을 땅에 떨어지기 전에 잡으면 타자 아웃, 주자는 원래 베이스로 돌아가야 합니다.</li>
          <li>공과 주자 중 누가 먼저 베이스에 닿는지로 아웃·세이프를 정합니다.</li>
          <li>
            공에 가장 빨리 닿는 수비수가 쫓습니다. 아깝게 닿지 않으면 다이빙·점프 캐치를 시도하고,
            멋진 수비나 아슬아슬한 접전은 왼쪽 아래 TV 창에서 슬로 모션으로 다시 보여 줍니다.
          </li>
        </ul>
      </section>
      <section>
        <h3>능력치</h3>
        <ul>
          <li>투수: 구속(공 빠르기) · 제구(정확도) · 구위(공의 휨과 위력) · 지구력(체력 소모).</li>
          <li>타자: 컨택(배트에 맞히기) · 파워(비거리) · 주력(달리기).</li>
          <li>
            지금 능력치가 게임에서 실제로 어떤 값인지는 하루 화면 &lsquo;내 능력치와 효과&rsquo;에
            나옵니다.
          </li>
        </ul>
        <Hint from="포수 미트 안쪽 낙서">
          빠르지 않아도 된다. 회전 없이 춤추는 공은 아무도 잡지 못한다.
        </Hint>
      </section>
    </>
  );
}

function Pitcher() {
  return (
    <>
      <section>
        <h3>던지는 법</h3>
        <ol>
          <li>오른쪽 투구 플랜에서 구종을 고릅니다(버튼 또는 구종 옆 숫자키).</li>
          <li>강도를 정합니다. 세게 던질수록 빠르지만 제구가 흔들리고 체력이 더 듭니다.</li>
          <li>조준판이나 화면의 스트라이크 존을 클릭하면 그곳을 노리고 바로 던집니다.</li>
        </ol>
      </section>
      <section>
        <h3>키</h3>
        <Keys
          rows={[
            [["1", "…", "0"], "구종 선택 (구종 옆에 표시된 키)"],
            [["Space"], "지금 조준점으로 던지기"],
            [["←", "↑", "→", "↓"], "조준점 조금씩 옮기기"],
            [["F"], "견제구 (주자가 있을 때)"],
            [["T"], "응원 스킬 · 한 이닝 상대 능력치 하락 (프로부터, 경기당 1번)"],
            [["G"], "한계 돌파 · 다음 공 하나 모든 능력치 300 (능력치 250 달성 후)"],
          ]}
        />
      </section>
      <section>
        <h3>수비</h3>
        <ul>
          <li>기본은 자동 수비입니다. 공이 맞으면 수비수가 알아서 쫓고 던집니다.</li>
          <li>
            설정에서 자동 수비를 끄면 <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd>로 수비수를 움직이고 <kbd>1</kbd>~<kbd>4</kbd>로 송구할 베이스를 고릅니다.
          </li>
          <li>&lsquo;고의4구&rsquo; 버튼은 타자를 바로 1루에 보냅니다.</li>
        </ul>
      </section>
      <section>
        <h3>투수 코치의 쪽지</h3>
        <Hint from="은퇴한 투수의 회고록">
          나는 빠른 공을 처음부터 버렸다. 단 1도 올리지 않았지. 대신 공이 휘는 힘만 75 넘게
          갈고닦았다.
        </Hint>
        <Hint from="불펜 벤치 밑 끈적한 통">
          심판 몰래 바르면 공이 손에 착 붙는다. 들키면… 끝장이다.
        </Hint>
      </section>
    </>
  );
}

function Batter() {
  return (
    <>
      <section>
        <h3>치는 법</h3>
        <ol>
          <li>
            스윙 스타일을 고릅니다: 컨택(맞히기 쉬움) · 강타(어렵지만 장타) · 번트(짧게 굴리기).
          </li>
          <li>
            공이 날아오면 <b>흐릿한 빛</b>이 공이 올 범위입니다(공은 항상 그 안). 마우스로 조준하면{" "}
            <b>노란 점선 원</b>이 배트가 닿는 범위입니다.
          </li>
          <li>
            화면 위쪽 게이지가 <b>밝은 금색</b>일 때 클릭(또는 Space)하면 좋은 타이밍입니다.
          </li>
          <li>치지 않으면 공이 존을 지났는지로 볼·스트라이크가 정해집니다.</li>
        </ol>
      </section>
      <section>
        <h3>키</h3>
        <Keys
          rows={[
            [["클릭"], "스윙"],
            [["Space"], "스윙"],
            [["←", "↑", "→", "↓"], "조준 옮기기"],
            [["E"], "도루 사인 (1루→2루, 2루가 차 있으면 2루→3루 · 다시 누르면 취소)"],
            [["T"], "응원 스킬 (프로부터)"],
            [["G"], "한계 돌파 (능력치 250 달성 후)"],
          ]}
        />
      </section>
      <section>
        <h3>팁</h3>
        <ul>
          <li>컨택 스윙은 아슬아슬하게 빗나가도 파울로 걷어내 삼진을 피합니다.</li>
          <li>
            도루는 투구와 함께 뛰고, 포수 송구와 도착 순서로 판정됩니다. 상대 팀 빠른 주자도 가끔
            도루를 시도해요.
          </li>
        </ul>
      </section>
      <section>
        <h3>타격 코치의 쪽지</h3>
        <Hint from="라커룸 명판">
          던지고 치는 두 칼을 모두 쥔 자, 이름 하나로 시작부터 전설이 된다.
        </Hint>
        <Hint from="배팅 케이지 철망에 걸린 메모">
          250을 넘긴 자에게만 들리는 소리가 있다. 경기 중 G를 눌러 봐라.
        </Hint>
      </section>
    </>
  );
}

function Hidden() {
  return (
    <>
      <section>
        <h3>히든 요소란?</h3>
        <ul>
          <li>이 게임에는 설명서에 나오지 않는 히든 요소가 숨어 있습니다.</li>
          <li>
            상점에서 살 수 없는 히든 구종, 특별한 방법으로만 할 수 있는 히든 시작, 경기 중에 쓰는
            히든 스킬 등이 있어요.
          </li>
          <li>
            조건을 만족하는 순간 팡파레와 함께 알려 줍니다. 한 번 얻은 히든 구종은 계속 유지됩니다.
          </li>
        </ul>
      </section>
      <section>
        <h3>조건은 비밀!</h3>
        <ul>
          <li>조건은 어디에도 직접 적혀 있지 않습니다.</li>
          <li>
            대신 게임 곳곳에 <i>작은 기울임 글씨</i>로 된 힌트가 숨어 있어요. 화면 구석의
            쪽지·명판·낙서를 잘 읽어 보세요.
          </li>
          <li>힌트를 풀었다면 친구에게는 비밀로!</li>
        </ul>
      </section>
      <section>
        <h3>모아 둔 쪽지</h3>
        <Hint from="쪽지 ①">빠르기는 처음 그대로, 휘는 힘은 75 너머. 그러면 공이 춤을 춘다.</Hint>
        <Hint from="쪽지 ②">
          잠긴 문을 틀린 열쇠로 세 번 두드리면, 누군가 몰래 끈적한 통을 건넨다. 두 번째에 경고를
          들어도 멈추지 말 것.
        </Hint>
        <Hint from="쪽지 ③">바다 건너 이도류. 그의 이름이 곧 열쇠다.</Hint>
        <Hint from="쪽지 ④">메이저리그 네 구단이 모두 손을 내밀 때, 모두 거절해 보라.</Hint>
        <Hint from="쪽지 ⑤">
          내 역할의 능력치가 모두 250에 닿으면, 한 공에 한해 300의 힘을 빌릴 수 있다.
        </Hint>
        <Hint from="찢어진 쪽지">…아직 아무도 찾지 못한 것이 하나 더 있을지도…</Hint>
      </section>
    </>
  );
}

export function GuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("rules");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="help-dialog guide-dialog">
        <DialogHeader>
          <DialogTitle>조작법 · 게임 설명</DialogTitle>
          <DialogDescription>
            이 창이 열려 있는 동안 경기는 잠깐 멈춥니다 · <kbd>H</kbd>로 언제든 열고 닫기
          </DialogDescription>
        </DialogHeader>
        <div className="hof-tabs guide-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tab}
              className={t.id === tab ? "on" : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="guide-body">
          {tab === "rules" && <Rules />}
          {tab === "logic" && <Logic />}
          {tab === "pitcher" && <Pitcher />}
          {tab === "batter" && <Batter />}
          {tab === "hidden" && <Hidden />}
        </div>
        <section className="guide-common">
          <Keys
            rows={[
              [["P", "Esc"], "일시정지"],
              [["C"], "카메라 바꾸기"],
              [["H"], "조작법 열기·닫기"],
            ]}
          />
        </section>
        <button className="primary-button" onClick={() => onOpenChange(false)}>
          플레이로 돌아가기 <Play size={16} />
        </button>
      </DialogContent>
    </Dialog>
  );
}

/** Shown once after the starting roulette (or the start): suggests reading the guide. */
export function GuideNotice({
  open,
  onRead,
  onLater,
}: {
  open: boolean;
  onRead: () => void;
  onLater: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onLater()}>
      <DialogContent className="guide-notice">
        <DialogHeader>
          <DialogTitle>📢 처음이라면 꼭 읽어 주세요!</DialogTitle>
          <DialogDescription>
            던지는 법, 치는 법, 게임 규칙을 &lsquo;조작법&rsquo;에 정리해 두었어요. 처음 하는 거라면
            1분만 읽어 보는 걸 추천해요. 로고 옆 &lsquo;조작법&rsquo; 버튼이나 <kbd>H</kbd>로 언제든
            다시 볼 수 있어요.
          </DialogDescription>
          <p className="guide-notice-hint">
            🔍 그리고… 조작법 곳곳에 <b>히든 요소의 힌트</b>가 숨어 있을지도…?
          </p>
        </DialogHeader>
        <div className="guide-notice-actions">
          <button className="primary-button" onClick={onRead}>
            조작법 보기 (히든 힌트 찾기)
          </button>
          <button className="subtle-button" onClick={onLater}>
            나중에
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
