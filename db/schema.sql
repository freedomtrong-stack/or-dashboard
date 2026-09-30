-- ============================================================================
-- CMU OR Status — database schema (PostgreSQL / Supabase)
--
-- Run this in the Supabase SQL Editor on a fresh project to recreate the
-- backend. Order matters: tables, then constraints, then triggers, then RLS.
--
-- NOTE: this file was reconstructed from the live database. The table and
-- column definitions match production; the trigger bodies are written from
-- the observed behaviour and should be diffed against the live functions
-- before being relied on for a migration.
-- ============================================================================

-- ── Main case table ─────────────────────────────────────────────────────────
create table if not exists public.or_cases (
  id          uuid primary key default gen_random_uuid(),
  hn          text,                      -- hospital number; null for Reserve cases
  dx          text,                      -- diagnosis (free text)
  operation   text,                      -- planned operation (free text)
  note        text,
  condition   text not null,             -- urgency tier, see constraint below
  status      text not null,             -- workflow state, see constraint below
  department  text,
  subtype     text,                      -- Surgery sub-unit only
  created_at  timestamptz not null default now(),   -- case received
  on_case_at  timestamptz,               -- set by trigger when status -> 'On case'
  done_at     timestamptz,               -- set by trigger when status -> 'Done'
  updated_at  timestamptz default now()
);

-- Urgency tiers. Waiting-time targets live in the frontend (KPI_CATEGORIES),
-- not in the database.
alter table public.or_cases drop constraint if exists or_cases_condition_check;
alter table public.or_cases add constraint or_cases_condition_check
  check (condition in ('Immediate', 'Critical', 'Urgency', 'Expedited', 'Non-critical'));

-- Workflow states. 'In-active' replaced the earlier Thai label 'เลื่อน NPO'.
alter table public.or_cases drop constraint if exists or_cases_status_check;
alter table public.or_cases add constraint or_cases_status_check
  check (status in ('Reserve', 'Waiting', 'Next', 'On case', 'In-active', 'Done', 'Cancelled'));

create index if not exists or_cases_status_idx     on public.or_cases (status);
create index if not exists or_cases_created_at_idx on public.or_cases (created_at);

-- ── Back-office timeliness fields ───────────────────────────────────────────
-- Filled retrospectively on /backfill, never by the ward form. They exist
-- because on_case_at was recorded inconsistently — some staff stamped it on
-- arrival in the room, others at incision — so it cannot carry a real KPI.
alter table public.or_cases
  add column if not exists accepted_at         timestamptz,  -- OR accepted the case
  add column if not exists arrival_at          timestamptz,  -- patient reached the OR
  add column if not exists incision_at         timestamptz,  -- knife to skin
  add column if not exists delay_reason        text,
  add column if not exists delay_detail        text,
  add column if not exists delay_process_owner text,
  add column if not exists shi_fast_track      boolean not null default false;

comment on column public.or_cases.on_case_at is
  'Legacy: staff entered this inconsistently (arrival vs incision). Prefer arrival_at / incision_at.';

-- ── Announcement banner (single row, id is always 1) ────────────────────────
create table if not exists public.dashboard_note (
  id         int primary key default 1,
  text       text not null,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

-- ── History of In-active periods ────────────────────────────────────────────
-- One row per stint. A row with ended_at null is an open period.
create table if not exists public.or_inactive_periods (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.or_cases(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  note       text
);

create index if not exists or_inactive_periods_case_idx
  on public.or_inactive_periods (case_id, started_at desc);

-- ── Timestamp triggers ──────────────────────────────────────────────────────
-- on_case_at / done_at are stamped the first time a case enters that status,
-- so re-opening a Done case does not overwrite the original timing.
create or replace function public.or_cases_stamp_times()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();

  if new.status = 'On case' and old.status is distinct from 'On case'
     and new.on_case_at is null then
    new.on_case_at := now();
  end if;

  if new.status = 'Done' and old.status is distinct from 'Done'
     and new.done_at is null then
    new.done_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists or_cases_stamp_times_trg on public.or_cases;
create trigger or_cases_stamp_times_trg
  before update on public.or_cases
  for each row execute function public.or_cases_stamp_times();

-- ── Realtime ────────────────────────────────────────────────────────────────
-- The dashboard subscribes to postgres_changes on these tables.
alter publication supabase_realtime add table public.or_cases;
alter publication supabase_realtime add table public.dashboard_note;

-- ── Row Level Security ──────────────────────────────────────────────────────
-- WARNING: these policies are fully open. Any holder of the publishable anon
-- key — which ships inside the public JavaScript bundle — can read and write
-- every row, including patient HN and diagnosis. This is acceptable only for
-- a closed demo with synthetic data. Before any real deployment, replace them
-- with authenticated policies (Supabase Auth) so that reads and writes require
-- a logged-in user. See the security section of README.md.

alter table public.or_cases           enable row level security;
alter table public.dashboard_note     enable row level security;
alter table public.or_inactive_periods enable row level security;

create policy "public read"  on public.or_cases           for select using (true);
create policy "public write" on public.or_cases           for all    using (true) with check (true);

create policy "public read"  on public.dashboard_note     for select using (true);
create policy "public write" on public.dashboard_note     for all    using (true) with check (true);

create policy "public read"  on public.or_inactive_periods for select using (true);
create policy "public write" on public.or_inactive_periods for all    using (true) with check (true);
