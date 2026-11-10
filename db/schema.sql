-- ============================================================
-- LiveMaster 数据库 Schema v0.2（Neon Postgres）
-- 自建认证：users 表替代 Supabase Auth；数据隔离由服务端 SQL 按 user_id 过滤
-- 执行方式：psql $DATABASE_URL -f db/schema.sql 或在 Neon Console SQL Editor 中执行
-- ============================================================

-- 用户（自建认证）
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_users_email_lower on public.users (lower(email));

-- 用户扩展资料
create table if not exists public.profiles (
  user_id uuid primary key references public.users on delete cascade,
  nickname text,
  created_at timestamptz not null default now()
);

-- 直播场次
create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users on delete cascade,
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

-- 直播事件流（弹幕/提问/礼物/进出/系统消息，复盘回放数据源）
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions on delete cascade,
  bot_id uuid references public.bots on delete set null,
  type text not null check (type in ('chat','question','gift','mood_change','follow','enter','leave','system','host')),
  content text not null,
  meta jsonb not null default '{}',
  offset_ms int not null default 0,   -- 相对开播的毫秒偏移（回放时间轴）
  created_at timestamptz not null default now()
);
create index if not exists idx_events_session on public.events (session_id, offset_ms);

-- AI 用量记账
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users on delete cascade,
  session_id uuid references public.live_sessions on delete cascade,
  kind text not null,                 -- bots_gen/tick/report
  model text not null,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  created_at timestamptz not null default now()
);
