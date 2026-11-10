-- ============================================================
-- LiveMaster 数据库 Schema v0.1
-- 在 Supabase SQL Editor 中执行本文件即可。
-- 注意：认证需在 Supabase 后台 Authentication -> Providers 关闭
-- 「Confirm email」（用户决策：暂不启用邮箱验证）。
-- ============================================================

-- 用户扩展资料
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text,
  created_at timestamptz not null default now()
);

-- 直播场次
create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  topic text not null,
  scene text not null default 'train' check (scene in ('train','feynman')),
  status text not null default 'live' check (status in ('live','ended','interrupted')),
  difficulty jsonb not null default '{"temper":"normal","silence":"medium","durationMin":20}',
  heat numeric not null default 10,
  heat_level int not null default 0,
  level_hold_sec int not null default 0,
  silence_sec int not null default 0,
  audience_extra int not null default 0,   -- 超出 AI 互动上限的"人数-only"观众
  peak_online int not null default 0,
  peak_heat numeric not null default 0,
  last_tick_at timestamptz,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_sec int,
  stats jsonb not null default '{}',
  ai_report jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_sessions_user on public.live_sessions (user_id, started_at desc);

-- 虚拟观众 Bot
create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions on delete cascade,
  name text not null,
  persona text not null,            -- supporter/curious/heckler/passive/scholar/whale/grump
  persona_label text not null default '',
  gender text default '',
  age_range text default '',
  occupation text default '',
  knowledge_level text default '',  -- novice/beginner/enthusiast/expert
  gradient text not null default 'g1',
  patience int not null default 3,  -- 1~5
  gift_willingness int not null default 2, -- 0~5
  sample_lines jsonb not null default '[]',
  mood int not null default 0,      -- -100~100
  status text not null default 'online' check (status in ('online','left')),
  left_reason text,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);
create index if not exists idx_bots_session on public.bots (session_id);

-- 直播事件流（回放=按 offset_ms 重放本表）
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions on delete cascade,
  bot_id uuid references public.bots on delete set null,
  type text not null,               -- chat/question/gift/enter/leave/system/mood_change/follow/host/heat
  content text not null,
  meta jsonb not null default '{}',
  offset_ms int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_events_session on public.events (session_id, offset_ms);

-- AI 用量记账（成本监控）
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,
  session_id uuid references public.live_sessions on delete cascade,
  kind text not null default '',    -- bots_gen/tick/send/report
  model text not null default '',
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RLS：客户端直连（anon key）按用户隔离；服务端路由使用 service_role
-- 并在代码中显式按 user_id 过滤（双保险）。
-- ============================================================
alter table public.profiles enable row level security;
alter table public.live_sessions enable row level security;
alter table public.bots enable row level security;
alter table public.events enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "profiles own" on public.profiles;
create policy "profiles own" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "sessions own" on public.live_sessions;
create policy "sessions own" on public.live_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "bots via session" on public.bots;
create policy "bots via session" on public.bots
  for all using (
    exists (select 1 from public.live_sessions s where s.id = session_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.live_sessions s where s.id = session_id and s.user_id = auth.uid())
  );

drop policy if exists "events via session" on public.events;
create policy "events via session" on public.events
  for all using (
    exists (select 1 from public.live_sessions s where s.id = session_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.live_sessions s where s.id = session_id and s.user_id = auth.uid())
  );

drop policy if exists "ai_usage own" on public.ai_usage;
create policy "ai_usage own" on public.ai_usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 新用户自动建 profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
