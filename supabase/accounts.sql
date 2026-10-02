-- Astra Bird account API. Public data is limited to nicknames and scores.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (nickname ~ '^[A-Za-z0-9_]{3,20}$'),
  best_score integer not null default 0 check (best_score between 0 and 10000),
  updated_at timestamptz not null default now()
);
create unique index players_nickname_unique on public.players (lower(nickname));
create index players_best_score_idx on public.players (best_score desc, updated_at);
alter table public.players enable row level security;
create policy public_scoreboard on public.players for select to anon, authenticated using (true);
create policy own_player_insert on public.players for insert to authenticated with check ((select auth.uid()) = user_id);
create policy own_player_update on public.players for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.players from anon, authenticated;
grant select on public.players to anon, authenticated;
grant insert (user_id, nickname), update (nickname) on public.players to authenticated;

create table public.weekly_scores (
  user_id uuid not null references public.players(user_id) on delete cascade,
  week_start date not null,
  score integer not null check (score between 0 and 10000),
  updated_at timestamptz not null default now(),
  primary key (week_start, user_id)
);
create index weekly_scores_user_idx on public.weekly_scores (user_id);
create index weekly_scores_ranking_idx on public.weekly_scores (week_start, score desc, updated_at);
alter table public.weekly_scores enable row level security;
create policy public_weekly_scoreboard on public.weekly_scores for select to anon, authenticated using (true);
revoke all on public.weekly_scores from anon, authenticated;
grant select on public.weekly_scores to anon, authenticated;

create table private.game_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.players(user_id) on delete cascade,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  score integer,
  duration_ms integer
);
create index game_runs_user_started_idx on private.game_runs (user_id, started_at desc);
alter table private.game_runs enable row level security;
create policy no_direct_run_access on private.game_runs for all to anon, authenticated using (false) with check (false);
revoke all on private.game_runs from public, anon, authenticated;

-- These routines intentionally own writes to score columns and the private run
-- ledger. All callers are checked against auth.uid(); tables have no client
-- write grants for these fields. Only invoker wrappers are exposed by REST.
create function private.start_run() returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); run_id uuid; last_start timestamptz;
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Sign in to save scores.' using errcode = '42501';
  end if;
  perform 1 from public.players where user_id = uid for update;
  if not found then raise exception 'Choose a nickname first.'; end if;
  select max(started_at) into last_start from private.game_runs where user_id = uid;
  if last_start > clock_timestamp() - interval '1 second' then raise exception 'Please wait a second before starting again.'; end if;
  delete from private.game_runs where user_id = uid and (finished_at is null or started_at < now() - interval '8 days');
  insert into private.game_runs(user_id) values (uid) returning id into run_id;
  return run_id;
end $$;

create function private.finish_run(p_run_id uuid, p_score integer, p_duration_ms integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); run private.game_runs%rowtype; seconds double precision; distance double precision; pipes integer; result integer; week date;
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then raise exception 'Sign in to save scores.' using errcode = '42501'; end if;
  if p_score is null or p_duration_ms is null or p_score not between 0 and 10000 or p_duration_ms not between 0 and 7200000 then raise exception 'Invalid run.'; end if;
  -- Same lock order as start_run avoids races and deadlocks between tabs.
  perform 1 from public.players where user_id = uid for update;
  select * into run from private.game_runs where id = p_run_id and user_id = uid for update;
  if not found then raise exception 'This run is no longer available.'; end if;
  if run.finished_at is not null then
    if run.score <> p_score or run.duration_ms <> p_duration_ms then raise exception 'Run already submitted.'; end if;
    select best_score into result from public.players where user_id = uid;
    return result;
  end if;
  if clock_timestamp() - run.started_at > interval '24 hours' then raise exception 'This run has expired.'; end if;
  seconds := p_duration_ms / 1000.0;
  if seconds > extract(epoch from (clock_timestamp() - run.started_at)) + 3 then raise exception 'Run time does not match.'; end if;
  distance := case when seconds <= 70 then 155 * seconds + 0.75 * seconds * seconds else 14525 + 260 * (seconds - 70) end;
  pipes := greatest(0, floor((distance - 437) / 228)::integer + 1);
  if p_score > pipes + ceil(pipes / 3.0)::integer + 1 then raise exception 'Score does not match the flight length.'; end if;
  update private.game_runs set finished_at = clock_timestamp(), score = p_score, duration_ms = p_duration_ms where id = p_run_id;
  update public.players set best_score = greatest(best_score, p_score), updated_at = case when p_score > best_score then now() else updated_at end where user_id = uid returning best_score into result;
  week := date_trunc('week', now() at time zone 'UTC')::date;
  insert into public.weekly_scores(user_id, week_start, score) values (uid, week, p_score)
    on conflict (week_start, user_id) do update set score = greatest(weekly_scores.score, excluded.score), updated_at = case when excluded.score > weekly_scores.score then now() else weekly_scores.updated_at end;
  return result;
end $$;

revoke all on function private.start_run() from public, anon, authenticated;
revoke all on function private.finish_run(uuid, integer, integer) from public, anon, authenticated;
grant execute on function private.start_run(), private.finish_run(uuid, integer, integer) to authenticated;

create function public.start_game_run() returns uuid
language sql security invoker set search_path = '' as $$ select private.start_run() $$;
create function public.finish_game_run(p_run_id uuid, p_score integer, p_duration_ms integer) returns integer
language sql security invoker set search_path = '' as $$ select private.finish_run(p_run_id, p_score, p_duration_ms) $$;
create function public.game_leaderboard(p_period text default 'week')
returns table (nickname text, score integer)
language sql stable security invoker set search_path = '' as $$
  select p.nickname, case when p_period = 'all' then p.best_score else w.score end as score
  from public.players p
  left join public.weekly_scores w on w.user_id = p.user_id and w.week_start = date_trunc('week', now() at time zone 'UTC')::date
  where p_period in ('week', 'all') and (p_period = 'all' or w.user_id is not null)
  order by score desc, case when p_period = 'all' then p.updated_at else w.updated_at end, p.nickname
  limit 20
$$;
revoke all on function public.start_game_run(), public.finish_game_run(uuid, integer, integer), public.game_leaderboard(text) from public, anon, authenticated;
grant execute on function public.start_game_run(), public.finish_game_run(uuid, integer, integer) to authenticated;
grant execute on function public.game_leaderboard(text) to anon, authenticated;
