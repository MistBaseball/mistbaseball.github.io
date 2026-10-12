-- Diamond Road · 라이벌 리그 (멀티 대결 승패) · Supabase SQL Editor에 통째로 붙여넣고 Run.
-- 여러 번 실행해도 안전합니다(기록은 지워지지 않음). setup.sql을 먼저 실행해 둔 프로젝트에서.
--
-- 한 판의 결과는 두 선수가 모두 같은 점수로 보고해야만 승·패·무로 올라갑니다
-- (혼자서 이겼다고 올릴 수 없음). 보고는 report_versus 함수로만, 자기 비밀값을 알 때만.

create table if not exists public.versus_board (
  player_id uuid primary key,
  secret_hash text not null,
  nickname text not null check (char_length(nickname) between 1 and 12),
  tag text not null check (tag ~ '^[0-9]{4}$'),
  player_name text not null check (char_length(player_name) between 1 and 16),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.versus_reports (
  match_id text not null check (match_id ~ '^[0-9a-f]{8,64}$'),
  player_id uuid not null,
  opponent_id uuid not null,
  my_score integer not null check (my_score between 0 and 99),
  opp_score integer not null check (opp_score between 0 and 99),
  counted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

alter table public.versus_board enable row level security;
alter table public.versus_reports enable row level security;
drop policy if exists "rival league is public" on public.versus_board;
create policy "rival league is public" on public.versus_board
  for select to anon, authenticated using (true);
revoke all on public.versus_board from anon, authenticated;
revoke all on public.versus_reports from anon, authenticated;
grant select (player_id, nickname, tag, player_name, wins, losses, draws, updated_at)
  on public.versus_board to anon, authenticated;

create or replace function public.report_versus(rec jsonb, secret text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := (rec->>'player_id')::uuid;
  opp uuid := (rec->>'opponent_id')::uuid;
  mid text := rec->>'match_id';
  ms int := (rec->>'my_score')::int;
  os int := (rec->>'opp_score')::int;
  h text;
  other public.versus_reports%rowtype;
begin
  if secret is null or char_length(secret) < 16 then
    raise exception 'bad secret';
  end if;
  if me = opp then
    raise exception 'same player';
  end if;
  h := encode(sha256(convert_to(secret, 'UTF8')), 'hex');
  -- 처음 보고할 때 자리가 생기고, 그다음부터는 같은 비밀값으로만 이름을 바꿀 수 있다.
  insert into public.versus_board as cur (player_id, secret_hash, nickname, tag, player_name)
  values (me, h, rec->>'nickname', rec->>'tag', left(coalesce(rec->>'player_name', '선수'), 16))
  on conflict (player_id) do update set
    nickname = excluded.nickname,
    tag = excluded.tag,
    player_name = excluded.player_name,
    updated_at = now()
  where cur.secret_hash = excluded.secret_hash;
  if not exists (select 1 from public.versus_board where player_id = me and secret_hash = h) then
    raise exception 'bad secret';
  end if;

  insert into public.versus_reports (match_id, player_id, opponent_id, my_score, opp_score)
  values (mid, me, opp, ms, os)
  on conflict do nothing;

  select * into other from public.versus_reports
    where match_id = mid and player_id = opp
    for update;
  if not found then
    return 'waiting';
  end if;
  if other.counted then
    return 'counted';
  end if;
  if other.opponent_id <> me or other.my_score <> os or other.opp_score <> ms then
    return 'mismatch';
  end if;

  update public.versus_reports set counted = true where match_id = mid;
  update public.versus_board set
    wins = wins + (ms > os)::int,
    losses = losses + (ms < os)::int,
    draws = draws + (ms = os)::int,
    updated_at = now()
  where player_id = me;
  update public.versus_board set
    wins = wins + (os > ms)::int,
    losses = losses + (os < ms)::int,
    draws = draws + (os = ms)::int,
    updated_at = now()
  where player_id = opp;
  return 'counted';
end;
$$;

revoke all on function public.report_versus(jsonb, text) from public;
grant execute on function public.report_versus(jsonb, text) to anon, authenticated;
