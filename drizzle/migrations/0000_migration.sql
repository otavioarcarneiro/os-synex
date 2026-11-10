
create type public.app_role as enum ('owner','partner','admin','client');
create type public.department as enum ('juridico','execucao');
create type public.account_status as enum ('active','suspended','deleted');

create or replace function public.is_owner_email(_email text) returns boolean
language sql immutable set search_path = public as $$
  select lower(coalesce(_email,'')) in ('otavio.arcarneiro@gmail.com','synex.presence@gmail.com')
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null,
  phone text,
  avatar_url text,
  department public.department,
  status public.account_status not null default 'active',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_staff(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('owner','partner','admin'))
$$;
create or replace function public.user_department(_user_id uuid) returns public.department
language sql stable security definer set search_path = public as $$
  select department from public.profiles where id = _user_id
$$;

create policy "own profile read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff(auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(),'owner'));
create policy "roles read" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.has_role(auth.uid(),'owner') then
    new.status := old.status; new.department := old.department;
    new.email := old.email; new.deleted_at := old.deleted_at;
  end if;
  if public.is_owner_email(old.email) then
    new.status := 'active'; new.deleted_at := null; new.email := old.email;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_protect_profile before update on public.profiles
  for each row execute function public.protect_profile_fields();

create or replace function public.protect_owner_roles() returns trigger
language plpgsql security definer set search_path = public as $$
declare e text;
begin
  select email into e from auth.users where id = coalesce(old.user_id, new.user_id);
  if public.is_owner_email(e) and (tg_op = 'DELETE' or tg_op = 'UPDATE') then
    raise exception 'Papel de proprietário é imutável';
  end if;
  if tg_op = 'INSERT' and new.role = 'owner' and not public.is_owner_email(e) then
    raise exception 'Somente e-mails proprietários podem ter o papel owner';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger trg_protect_owner_roles before insert or update or delete on public.user_roles
  for each row execute function public.protect_owner_roles();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  if public.is_owner_email(new.email) then
    insert into public.user_roles (user_id, role) values (new.id, 'owner') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  target_id uuid,
  action text not null,
  reason text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "owner reads audit" on public.audit_logs for select to authenticated
  using (public.has_role(auth.uid(),'owner'));
create or replace function public.block_mutation() returns trigger language plpgsql as $$
begin raise exception 'Registro imutável'; end $$;
create trigger trg_audit_immutable before update or delete on public.audit_logs
  for each row execute function public.block_mutation();

create table public.login_security (
  email text primary key,
  failed_count int not null default 0,
  locked_until timestamptz,
  admin_locked boolean not null default false,
  updated_at timestamptz not null default now()
);
grant select on public.login_security to authenticated;
grant all on public.login_security to service_role;
alter table public.login_security enable row level security;
create policy "owner reads lock" on public.login_security for select to authenticated
  using (public.has_role(auth.uid(),'owner'));

create table public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  phone text,
  ip text, geo text, device text, os text, browser text, user_agent text,
  attempts int not null default 0,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
grant select on public.security_alerts to authenticated;
grant all on public.security_alerts to service_role;
alter table public.security_alerts enable row level security;
create policy "owner alerts" on public.security_alerts for select to authenticated
  using (public.has_role(auth.uid(),'owner'));

create table public.active_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_key text not null unique,
  device text, os text, browser text, ip text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
grant select, delete on public.active_sessions to authenticated;
grant all on public.active_sessions to service_role;
alter table public.active_sessions enable row level security;
create policy "sessions read" on public.active_sessions for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'owner'));
create policy "sessions revoke" on public.active_sessions for delete to authenticated
  using (public.has_role(auth.uid(),'owner'));

create table public.system_settings (
  id int primary key default 1 check (id = 1),
  maintenance_mode boolean not null default false,
  billing_enabled boolean not null default false,
  uptime_enabled boolean not null default true,
  master_pin_hash text,
  updated_at timestamptz not null default now()
);
insert into public.system_settings (id) values (1);
grant select (id, maintenance_mode, billing_enabled, uptime_enabled, updated_at) on public.system_settings to authenticated;
grant update (maintenance_mode, billing_enabled, uptime_enabled, updated_at) on public.system_settings to authenticated;
grant all on public.system_settings to service_role;
alter table public.system_settings enable row level security;
create policy "staff read settings" on public.system_settings for select to authenticated using (public.is_staff(auth.uid()));
create policy "owner update settings" on public.system_settings for update to authenticated using (public.has_role(auth.uid(),'owner'));

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id),
  name text not null,
  kind text not null default 'site' check (kind in ('site','instagram')),
  url text,
  instagram_handle text,
  publish_status text not null default 'em_desenvolvimento',
  setup_price numeric(10,2) not null default 0,
  contract_start date not null default current_date,
  billing_enabled boolean not null default false,
  ga4_property_id text,
  uptime_status text not null default 'unknown' check (uptime_status in ('online','warning','down','unknown')),
  uptime_checked_at timestamptz,
  uptime_latency_ms int,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;
create policy "projects read" on public.projects for select to authenticated
  using (client_id = auth.uid() or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'partner')
    or (public.has_role(auth.uid(),'admin') and public.user_department(auth.uid()) = 'execucao'));
create policy "projects write" on public.projects for all to authenticated
  using (public.has_role(auth.uid(),'owner') or (public.has_role(auth.uid(),'admin') and public.user_department(auth.uid())='execucao'))
  with check (public.has_role(auth.uid(),'owner') or (public.has_role(auth.uid(),'admin') and public.user_department(auth.uid())='execucao'));

create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  kind text not null default 'relatorio' check (kind in ('proposta','contrato','relatorio')),
  url text not null,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.project_documents to authenticated;
grant all on public.project_documents to service_role;
alter table public.project_documents enable row level security;
create policy "docs read" on public.project_documents for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and (p.client_id = auth.uid() or public.is_staff(auth.uid()))));
create policy "docs write" on public.project_documents for insert to authenticated with check (public.is_staff(auth.uid()) and not public.has_role(auth.uid(),'partner'));
create policy "docs delete" on public.project_documents for delete to authenticated using (public.has_role(auth.uid(),'owner'));

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  amount numeric(10,2) not null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.invoices to authenticated;
grant all on public.invoices to service_role;
alter table public.invoices enable row level security;
create policy "invoices read" on public.invoices for select to authenticated
  using (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'partner')
    or exists (select 1 from public.projects p where p.id = project_id and p.client_id = auth.uid()));
create policy "invoices write" on public.invoices for all to authenticated
  using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));

create table public.chat_channels (
  slug text primary key,
  name text not null,
  frozen boolean not null default false,
  announcement_only boolean not null default false
);
insert into public.chat_channels (slug, name) values ('geral','Geral'),('juridico','Jurídico'),('execucao','Execução'),('parceiros','Parceiros');
grant select, update on public.chat_channels to authenticated;
grant all on public.chat_channels to service_role;
alter table public.chat_channels enable row level security;

create or replace function public.can_access_channel(_uid uuid, _channel text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.has_role(_uid,'owner') then true
    when _channel like 'dm:%' then _channel like '%' || _uid::text || '%' and public.is_staff(_uid)
    when _channel = 'geral' then public.is_staff(_uid)
    when _channel = 'parceiros' then public.has_role(_uid,'partner')
    when _channel = 'juridico' then public.has_role(_uid,'admin') and public.user_department(_uid)='juridico'
    when _channel = 'execucao' then public.has_role(_uid,'admin') and public.user_department(_uid)='execucao'
    else false end
$$;
create policy "channels read" on public.chat_channels for select to authenticated using (public.can_access_channel(auth.uid(), slug));
create policy "channels owner" on public.chat_channels for update to authenticated using (public.has_role(auth.uid(),'owner'));

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  sender_id uuid not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
grant select, insert on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "messages read" on public.messages for select to authenticated using (public.can_access_channel(auth.uid(), channel));
create policy "messages send" on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and public.can_access_channel(auth.uid(), channel)
  and (public.has_role(auth.uid(),'owner') or not exists (
    select 1 from public.chat_channels c where c.slug = channel and (c.frozen or c.announcement_only))));
alter publication supabase_realtime add table public.messages;

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'ideia' check (kind in ('prospect','ideia')),
  title text not null,
  content text not null default '',
  contact text,
  author_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.notes to authenticated;
grant all on public.notes to service_role;
alter table public.notes enable row level security;
create policy "notes staff" on public.notes for all to authenticated
  using (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'partner'))
  with check (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'partner'));

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  status text not null default 'ai' check (status in ('ai','human','closed')),
  created_at timestamptz not null default now()
);
create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  role text not null check (role in ('user','assistant','agent')),
  body text not null,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.support_tickets to authenticated;
grant select, insert on public.support_messages to authenticated;
grant all on public.support_tickets to service_role;
grant all on public.support_messages to service_role;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
create policy "tickets read" on public.support_tickets for select to authenticated using (client_id = auth.uid() or public.has_role(auth.uid(),'owner'));
create policy "tickets insert" on public.support_tickets for insert to authenticated with check (client_id = auth.uid());
create policy "tickets update" on public.support_tickets for update to authenticated using (client_id = auth.uid() or public.has_role(auth.uid(),'owner'));
create policy "smsg read" on public.support_messages for select to authenticated using (exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.client_id = auth.uid() or public.has_role(auth.uid(),'owner'))));
create policy "smsg insert" on public.support_messages for insert to authenticated with check (exists (select 1 from public.support_tickets t where t.id = ticket_id and ((t.client_id = auth.uid() and role = 'user') or (public.has_role(auth.uid(),'owner') and role = 'agent'))));
alter publication supabase_realtime add table public.support_messages;
