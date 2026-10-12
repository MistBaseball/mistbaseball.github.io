# 명예의 전당 서버 만들기 (Supabase, 무료 · 약 5분)

1. https://supabase.com 접속 → **Start your project** → **Continue with GitHub**(깃허브 계정으로 가입).
2. **New project**
   - Project name: `diamond-road`
   - Database Password: **Generate a password** 눌러 자동 생성(따로 기억 안 해도 됨)
   - Region: **Northeast Asia (Seoul)**
   - **Create new project** → 1~2분 기다리기
3. 왼쪽 메뉴 **SQL Editor** → **New query** → 이 폴더의 `setup.sql` 내용을 전부 붙여넣기 → **Run**.
   "Success. No rows returned"가 나오면 끝. (두 번 실행해도 괜찮아요.)
4. 두 값을 복사해서 알려 주세요.
   - **Project URL**: 프로젝트 첫 화면(또는 Project Settings → Data API)의 `https://○○○○.supabase.co`
   - **Publishable key**: Project Settings → **API Keys**의 `sb_publishable_…`
     (예전 화면이면 `anon` `public` 키, `eyJ…`로 시작)

⚠️ **secret key**(`sb_secret_…`)나 **service_role** 키는 절대 알려 주지 마세요. 그건 비밀번호예요.
Publishable/anon 키는 공개용이라 게임 코드에 들어가도 안전해요(랭킹 읽기와 자기 기록 올리기만 가능).

참고: 무료 프로젝트는 일주일 넘게 아무도 쓰지 않으면 일시정지될 수 있어요. 그러면 Supabase 대시보드에서 **Restore**를 누르면 다시 켜져요.

## 게임에 연결 (개발자용)
`web/lib/hof-config.ts`의 `HOF_URL`, `HOF_KEY` 기본값에 두 값을 넣고 빌드·배포.
로컬 테스트는 `VITE_HOF_URL`, `VITE_HOF_KEY` 환경변수로 덮어쓸 수 있다.

## 관리자 초기화 (선택)
1. `reset.sql`을 열어 insert 줄의 `'여기에-관리자-비밀번호'` 부분을 원하는 비밀번호로 바꾼다(작은따옴표는 남김).
2. Supabase SQL Editor에 붙여넣고 Run. 비밀번호는 서버에 해시로만 저장되고 게임 코드에는 없다.
3. 게임 설정 → 개발자 모드(1324) → 맨 아래 "명예의 전당 초기화"에 관리자 비밀번호 → 모두 지우기.
   지운 뒤에도 각자 다음 경기를 끝내면 그 커리어 기록이 다시 올라온다(새 커리어로 시작하면 처음부터).

## 멀티 대결 (라이벌 리그)
1. Supabase SQL Editor에 `versus.sql`을 붙여넣고 Run(여러 번 실행해도 안전).
2. 대시보드 **Realtime → Settings**에서 공개 접근(Allow public access / private only 끄기)이 켜져 있는지 확인. 멀티 방은 공개 Broadcast 채널(`dr-room-코드`)을 씁니다.
3. 무료 플랜은 동시 접속·초당 메시지 수에 한도가 있어요. 대결 한 판은 초당 최대 약 20개 메시지를 보냅니다.
