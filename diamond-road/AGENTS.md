# Diamond Road 작업 규칙

## 목표와 대화

- 한국어로 응답한다. 사용자는 Unity 초보이며 비용·대화량을 아끼고 싶어 한다.
- 기존 3D 야구 프로젝트를 이어 개발한다. 새 프로젝트로 갈아엎지 않는다.
- 작은 수정·읽기·테스트는 진행한다. 큰 기능 추가/삭제, 아키텍처 전환은 먼저 범위를 설명하고 확인한다.
- 최신 사용자 요청이 우선이다. 과거 기획의 “매 단계마다 됐어를 기다리기”는 현재 기본 작업 방식이 아니다.
- 사용자는 작업에 맞는 모델/추론 수준 추천을 원한다. 확인 가능한 선택지만 추천하며 실제 설정을 바꿨다고 주장하지 않는다.
- 완료 보고는 변경점, 실제 검사 결과, 남은 제약을 짧게 쓴다. 실행하지 않은 Unity/브라우저 테스트를 통과했다고 말하지 않는다.

## 현재 기준

- 웹: v03의 독립 실행 복사본. React + TypeScript + Three.js + Vite. 프론트엔드만 있으며 API 키가 필요 없다.
- 원본 웹 커밋: `3edb3a97f2beb23e01c61fc8701264fd9d028db1`.
- Unity: `unity/PitchingMouseMVP/`에 투구 패키지 소스만 있다. 전체 Unity 프로젝트나 Editor 실행 확인은 없다.
- Unity의 실제 설치 상태를 추정하지 않는다. 먼저 실제 `Packages/manifest.json`, `ProjectSettings/ProjectVersion.txt`, 씬·Console 상태를 확인한다.
- `docs/history/`는 과거 기획과 대안 코드다. 활성 구현으로 복사하거나 현재 상태로 인용하지 않는다.

## 명령 (작업 폴더: web)

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
```

Node.js 24 기준. `npm test`는 95개 게임 규칙 검사다. 잠금 파일을 유지한다.
규칙 변경은 관련 회귀 테스트를 추가/수정하고 검증한다. 문구 수정에 대규모 테스트를 추가하지 않는다.

## 코드 위치

| 작업 | 먼저 읽을 파일 |
|---|---|
| 투구·타격·주루·아웃·이닝·성장 | `web/lib/game/engine.ts` |
| Three.js 경기장·선수·카메라 | `web/lib/game/field.ts` |
| Mixamo 선수 모델·동작 연결 | `web/lib/game/avatars.ts`, `field.ts`의 `driveAvatars`, `tools/model-pipeline/` |
| WebGL 없는 환경의 렌더링 | `web/lib/game/software-field.ts` |
| 조작·조준판·메뉴·훈련 UI | `web/components/game/DiamondGame.tsx` |
| 화면 스타일 | `web/app/globals.css` |
| 히트박스(데드볼·슬라이딩·태그) | `web/lib/game/hitbox.ts`, 표시는 `hitbox-view.ts` |
| 주자·수비 AI 강화학습(훈련장) | `docs/AI_TRAINING.md`, `web/lib/ai/`, `scripts/train-ai.mjs` |
| 규칙 회귀 검사 | `web/scripts/check-game.mjs` |
| Unity 설치·참조 연결 | `docs/UNITY_KIT.md`, 패키지의 `README_KO.md` |

## 반드시 보존할 규칙

- 홈 → 1루 → 2루 → 3루 → 홈. 주자 위치·애니메이션·판정은 같은 `RunnerTrack`을 읽는다.
- 웹 포수 시점에서 1루는 world −X, 모델 전방은 local −Z. `BASES`, `runnerPose`, `playerYaw`를 함께 본다.
- 늦은 1루 송구로 이미 2루에 도착한 타자를 아웃 처리하지 않는다. 유효한 포스/태그 대상과 도착 시간을 확인한다.
- 뜬공은 지면 접촉 전 포구한 순간 타자 아웃. 1루 송구를 추가 아웃 조건으로 삼지 않는다.
- 세 번째 아웃의 종류·시간을 반영해 득점을 처리한다. 포스 아웃/세 번째 플라이 포구로 부당한 득점을 만들지 않는다.
- 클릭 목표는 투구 중 고정한다. `pitchMovement()`를 표시와 궤적이 공유한다.
- 움직임 영역은 기본 포물선 대비 휨이다. 최종 도착 확률이나 제구 오차로 표시하지 않는다.
- `Field`의 canvas 호스트 안에 React 소유 라벨을 넣지 않는다. fallback 재렌더 시 canvas가 사라졌던 원인이다.
- `localStorage` 키 `diamond-road-career-v1`, Career version 1을 보존한다. 저장 구조 변경에는 마이그레이션이 필요하다.
- Unity 공의 Transform은 `PitchBallMotor` 하나만 움직인다. Rigidbody나 다른 이동 컴포넌트를 겹치지 않는다.
- 웹과 Unity MVP는 원점·투구 방향이 다르다. 좌표를 그대로 복사하지 않는다.

## 읽는 순서와 기록

1. `docs/PROJECT_STATE.md`로 범위를 확인한다.
2. 필요한 경우 `docs/ARCHITECTURE.md`, `KNOWN_LIMITS.md`, `TESTING.md`를 읽는다.
3. 새 기능 범위를 검토할 때만 `ROADMAP.md`와 `docs/history/`를 읽는다.
4. 작업 후 상태와 검사 결과를 갱신하고 짧은 세션 메모를 남긴다.

유료 패키지·외부 서비스·배포·메시지 발송을 임의로 추가하지 않는다. 기존 데이터/씬을 삭제하거나 Unity 버전을 자동 업그레이드하지 않는다.
