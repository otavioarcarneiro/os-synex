create table if not exists public.staff_two_factor (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  completed_logins integer not null default 0,
  code_hash text,
  code_expires_at timestamptz,
  cycle_started_at timestamptz,
  codes_sent integer not null default 0,
  last_code_sent_at timestamptz,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  release_requested_at timestamptz,
  sac_ticket_id uuid references public.support_tickets(id) on delete set null,
  manual_release_until timestamptz,
  updated_at timestamptz not null default now()
);
grant all on public.staff_two_factor to service_role;
alter table public.staff_two_factor enable row level security;
revoke all on public.staff_two_factor from anon, authenticated;