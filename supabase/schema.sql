-- Schema pentru catalogul referințelor istorice ale glotonimului
-- „moldovenească”. Se poate rula în Supabase SQL Editor.

create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('viewer', 'editor', 'admin');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.reference_status as enum ('pending', 'published', 'rejected', 'archived');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  github_login text unique,
  display_name text,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.language_references (
  id uuid primary key default gen_random_uuid(),
  year_label text not null,
  year_start integer,
  year_end integer,
  title text not null,
  author text,
  description text,
  quote text,
  source_type text,
  location text,
  source_url text,
  status public.reference_status not null default 'pending',
  owner_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint language_references_year_order check (
    year_end is null or year_start is null or year_end >= year_start
  ),
  constraint language_references_source_url check (
    source_url is null or source_url ~* '^https?://'
  )
);

create table if not exists public.reference_revisions (
  id uuid primary key default gen_random_uuid(),
  reference_id uuid not null references public.language_references(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  snapshot jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists language_references_year_start_idx
  on public.language_references (year_start);

create index if not exists language_references_owner_idx
  on public.language_references (owner_id);

create index if not exists language_references_status_idx
  on public.language_references (status);

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'viewer'::public.app_role
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, github_login, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'user_name', new.raw_user_meta_data ->> 'preferred_username'),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email)
  )
  on conflict (id) do update set
    github_login = excluded.github_login,
    display_name = excluded.display_name,
    updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.protect_reference_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_user_role() <> 'admin'::public.app_role then
    if new.owner_id <> old.owner_id then
      raise exception 'Proprietarul unei referințe nu poate fi schimbat';
    end if;
    if new.status <> old.status then
      raise exception 'Doar administratorul poate schimba statutul unei referințe';
    end if;
  end if;
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists protect_reference_fields on public.language_references;
create trigger protect_reference_fields
  before update on public.language_references
  for each row execute procedure public.protect_reference_fields();

create or replace function public.save_reference_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.reference_revisions (reference_id, changed_by, snapshot)
  values (old.id, auth.uid(), to_jsonb(old));
  return new;
end;
$$;

drop trigger if exists save_reference_revision on public.language_references;
create trigger save_reference_revision
  after update on public.language_references
  for each row execute procedure public.save_reference_revision();

alter table public.profiles enable row level security;
alter table public.language_references enable row level security;
alter table public.reference_revisions enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.language_references to anon, authenticated;
grant select, insert, update, delete on public.language_references to authenticated;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant select on public.reference_revisions to authenticated;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.current_user_role() = 'admin'::public.app_role);

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
  on public.profiles for update
  to authenticated
  using (public.current_user_role() = 'admin'::public.app_role)
  with check (public.current_user_role() = 'admin'::public.app_role);

drop policy if exists language_references_select_public_or_owner on public.language_references;
create policy language_references_select_public_or_owner
  on public.language_references for select
  to anon, authenticated
  using (
    status = 'published'::public.reference_status
    or owner_id = auth.uid()
    or public.current_user_role() = 'admin'::public.app_role
  );

drop policy if exists language_references_insert_editor on public.language_references;
create policy language_references_insert_editor
  on public.language_references for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and public.current_user_role() in ('editor'::public.app_role, 'admin'::public.app_role)
    and (
      status = 'pending'::public.reference_status
      or public.current_user_role() = 'admin'::public.app_role
    )
  );

drop policy if exists language_references_update_owner_or_admin on public.language_references;
create policy language_references_update_owner_or_admin
  on public.language_references for update
  to authenticated
  using (
    public.current_user_role() = 'admin'::public.app_role
    or (
      public.current_user_role() = 'editor'::public.app_role
      and owner_id = auth.uid()
    )
  )
  with check (
    public.current_user_role() = 'admin'::public.app_role
    or (
      public.current_user_role() = 'editor'::public.app_role
      and owner_id = auth.uid()
    )
  );

drop policy if exists language_references_delete_admin on public.language_references;
create policy language_references_delete_admin
  on public.language_references for delete
  to authenticated
  using (public.current_user_role() = 'admin'::public.app_role);

drop policy if exists reference_revisions_select_owner_or_admin on public.reference_revisions;
create policy reference_revisions_select_owner_or_admin
  on public.reference_revisions for select
  to authenticated
  using (
    public.current_user_role() = 'admin'::public.app_role
    or changed_by = auth.uid()
    or exists (
      select 1
      from public.language_references reference
      where reference.id = reference_revisions.reference_id
        and reference.owner_id = auth.uid()
    )
  );

-- După ce te autentifici prima dată cu GitHub, promovează contul proprietar:
-- update public.profiles set role = 'admin' where github_login = 'sdudnic';
