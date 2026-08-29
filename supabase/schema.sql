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
  auth_provider text,
  email text,
  display_name text,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles
  add column if not exists auth_provider text;

alter table public.profiles
  add column if not exists email text;

create table if not exists public.language_references (
  id uuid primary key default gen_random_uuid(),
  year_label text not null,
  year_start integer,
  year_end integer,
  title text not null,
  language text,
  author text,
  description text,
  quote text,
  source_type text,
  location text,
  source_url text,
  image_url text,
  catalog_type text not null default 'language',
  status public.reference_status not null default 'pending',
  owner_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint language_references_year_order check (
    year_end is null or year_start is null or year_end >= year_start
  ),
  constraint language_references_source_url check (
    source_url is null or source_url ~* '^https?://'
  ),
  constraint language_references_image_url check (
    image_url is null
    or image_url ~* '^https://'
    or image_url ~* '^data:image/(avif|gif|jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$'
  ),
  constraint language_references_catalog_type check (
    catalog_type in ('language', 'ethnicity', 'both')
  ),
  constraint language_references_ethnicity_source_url check (
    catalog_type not in ('ethnicity', 'both')
    or source_url is not null
  )
);

alter table public.language_references
  add column if not exists language text;

alter table public.language_references
  add column if not exists image_url text;

alter table public.language_references
  add column if not exists catalog_type text not null default 'language';

do $$
begin
  alter table public.language_references
    drop constraint if exists language_references_catalog_type;
  alter table public.language_references
    add constraint language_references_catalog_type
    check (catalog_type in ('language', 'ethnicity', 'both'));
end
$$;

do $$
begin
  alter table public.language_references
    drop constraint if exists language_references_image_url;
  alter table public.language_references
    add constraint language_references_image_url check (
      image_url is null
      or image_url ~* '^https://'
      or image_url ~* '^data:image/(avif|gif|jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$'
    );
end
$$;

do $$
begin
  -- 1,5 MB binar pentru capturi data URL înseamnă aproximativ 2,1 milioane
  -- de caractere Base64. NOT VALID păstrează imaginile istorice intacte;
  -- limita se aplică tuturor inserărilor și modificărilor noi.
  alter table public.language_references
    drop constraint if exists language_references_image_size;
  alter table public.language_references
    add constraint language_references_image_size check (
      image_url is null
      or image_url ~* '^https://'
      or (
        image_url ~* '^data:image/(avif|gif|jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$'
        and octet_length(image_url) <= 2100000
      )
    ) not valid;
end
$$;

do $$
begin
  alter table public.language_references
    drop constraint if exists language_references_ethnicity_source_url;
  alter table public.language_references
    add constraint language_references_ethnicity_source_url check (
      catalog_type not in ('ethnicity', 'both')
      or source_url is not null
    );
end
$$;

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

create index if not exists language_references_catalog_type_idx
  on public.language_references (catalog_type, status, year_start);

create index if not exists profiles_email_idx
  on public.profiles (email);

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

create or replace function public.is_primary_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'sdudnic@gmail.com'
    or lower(coalesce((select email from public.profiles where id = auth.uid()), '')) = 'sdudnic@gmail.com';
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, github_login, auth_provider, email, display_name, role)
  values (
    new.id,
    case when coalesce(new.raw_app_meta_data ->> 'provider', '') = 'github'
      then coalesce(new.raw_user_meta_data ->> 'user_name', new.raw_user_meta_data ->> 'preferred_username')
      else null
    end,
    coalesce(new.raw_app_meta_data ->> 'provider', 'email'),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    case
      when lower(coalesce(new.email, '')) = 'sdudnic@gmail.com' then 'admin'::public.app_role
      when coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google' then 'editor'::public.app_role
      else 'viewer'::public.app_role
    end
  )
  on conflict (id) do update set
    github_login = coalesce(excluded.github_login, public.profiles.github_login),
    auth_provider = coalesce(excluded.auth_provider, public.profiles.auth_provider),
    email = coalesce(excluded.email, public.profiles.email),
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    role = case
      when lower(coalesce(excluded.email, public.profiles.email, '')) = 'sdudnic@gmail.com' then 'admin'::public.app_role
      else public.profiles.role
    end,
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
  if not public.is_primary_admin() then
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Proprietarul unei referințe nu poate fi schimbat';
    end if;
    if new.status is distinct from old.status then
      raise exception 'Doar sdudnic@gmail.com poate schimba statutul unei referințe';
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
    or public.is_primary_admin()
    or public.current_user_role() = 'admin'::public.app_role
  );

drop policy if exists language_references_insert_editor on public.language_references;
drop policy if exists language_references_insert_authenticated on public.language_references;
create policy language_references_insert_authenticated
  on public.language_references for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and (
      status = 'pending'::public.reference_status
      or public.is_primary_admin()
    )
  );

drop policy if exists language_references_update_owner_or_admin on public.language_references;
drop policy if exists language_references_update_contributor_or_admin on public.language_references;
create policy language_references_update_contributor_or_admin
  on public.language_references for update
  to authenticated
  using (
    public.is_primary_admin()
    or public.current_user_role() = 'admin'::public.app_role
    or (owner_id = auth.uid() and status = 'pending'::public.reference_status)
  )
  with check (
    public.is_primary_admin()
    or public.current_user_role() = 'admin'::public.app_role
    or (owner_id = auth.uid() and status = 'pending'::public.reference_status)
  );

drop policy if exists language_references_delete_admin on public.language_references;
drop policy if exists language_references_delete_primary_admin on public.language_references;
create policy language_references_delete_primary_admin
  on public.language_references for delete
  to authenticated
  using (public.is_primary_admin());

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
update public.profiles set role = 'admin' where lower(coalesce(email, '')) = 'sdudnic@gmail.com';

-- Orice cont autentificat poate propune o referință, dar intrarea rămâne pending.
-- Numai sdudnic@gmail.com poate schimba statutul, confirma sau infirma moderarea ori șterge.

do $$
begin
  create type public.moderation_request_type as enum ('edit', 'delete');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.moderation_request_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end
$$;

create or replace function public.is_primary_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'sdudnic@gmail.com'
    or lower(coalesce((select email from public.profiles where id = auth.uid()), '')) = 'sdudnic@gmail.com';
$$;

create table if not exists public.reference_moderation_requests (
  id uuid primary key default gen_random_uuid(),
  reference_id uuid references public.language_references(id) on delete set null,
  requested_by uuid not null references auth.users(id) on delete cascade,
  request_type public.moderation_request_type not null,
  proposed_changes jsonb not null default '{}'::jsonb,
  target_snapshot jsonb,
  reason text,
  status public.moderation_request_status not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint reference_moderation_requests_payload_object check (jsonb_typeof(proposed_changes) = 'object')
);

create index if not exists reference_moderation_requests_status_idx
  on public.reference_moderation_requests (status, request_type, created_at);

create index if not exists reference_moderation_requests_reference_idx
  on public.reference_moderation_requests (reference_id, status);

grant select, insert on public.reference_moderation_requests to authenticated;
grant execute on function public.is_primary_admin() to anon, authenticated;

alter table public.reference_moderation_requests enable row level security;

drop policy if exists reference_moderation_requests_select_visible on public.reference_moderation_requests;
create policy reference_moderation_requests_select_visible
  on public.reference_moderation_requests for select
  to authenticated
  using (
    requested_by = auth.uid()
    or public.current_user_role() = 'admin'::public.app_role
    or public.is_primary_admin()
  );

drop policy if exists reference_moderation_requests_insert_self on public.reference_moderation_requests;
create policy reference_moderation_requests_insert_self
  on public.reference_moderation_requests for insert
  to authenticated
  with check (
    requested_by = auth.uid()
    and status = 'pending'::public.moderation_request_status
  );

create or replace function public.review_reference_request(
  p_request_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.reference_moderation_requests%rowtype;
  reference_snapshot jsonb;
  updated_reference jsonb;
  proposed jsonb;
  action text := lower(trim(coalesce(p_action, '')));
begin
  if not public.is_primary_admin() then
    raise exception 'Numai sdudnic@gmail.com poate confirma sau infirma cererile de moderare';
  end if;
  if action not in ('approve', 'reject') then
    raise exception 'Acțiunea de moderare trebuie să fie approve sau reject';
  end if;

  select * into request_row
  from public.reference_moderation_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Cererea de moderare nu există'; end if;
  if request_row.status <> 'pending'::public.moderation_request_status then raise exception 'Cererea de moderare a fost deja soluționată'; end if;

  if request_row.request_type = 'delete'::public.moderation_request_type then
    select to_jsonb(reference_row) into reference_snapshot
    from public.language_references as reference_row
    where reference_row.id = request_row.reference_id;
    if action = 'approve' then
      if request_row.reference_id is null or reference_snapshot is null then raise exception 'Referința pentru ștergere nu mai există'; end if;
      update public.reference_moderation_requests
      set status = 'approved'::public.moderation_request_status, reviewed_by = auth.uid(), review_note = nullif(trim(p_note), ''), target_snapshot = coalesce(reference_snapshot, target_snapshot), updated_at = timezone('utc', now())
      where id = p_request_id;
      delete from public.language_references where id = request_row.reference_id;
    else
      update public.reference_moderation_requests
      set status = 'rejected'::public.moderation_request_status, reviewed_by = auth.uid(), review_note = nullif(trim(p_note), ''), updated_at = timezone('utc', now())
      where id = p_request_id;
    end if;
  elsif request_row.request_type = 'edit'::public.moderation_request_type then
    if action = 'approve' then
      if request_row.reference_id is null then raise exception 'Referința pentru editare nu mai există'; end if;
      proposed := request_row.proposed_changes;
      select to_jsonb(reference_row) into reference_snapshot from public.language_references as reference_row where reference_row.id = request_row.reference_id;
      if reference_snapshot is null then raise exception 'Referința pentru editare nu mai există'; end if;
      update public.language_references
      set year_label = case when proposed ? 'year_label' then nullif(proposed ->> 'year_label', '') else year_label end,
          year_start = case when proposed ? 'year_start' then nullif(proposed ->> 'year_start', '')::integer else year_start end,
          year_end = case when proposed ? 'year_end' then nullif(proposed ->> 'year_end', '')::integer else year_end end,
          title = case when proposed ? 'title' then nullif(proposed ->> 'title', '') else title end,
          author = case when proposed ? 'author' then nullif(proposed ->> 'author', '') else author end,
          language = case when proposed ? 'language' then nullif(proposed ->> 'language', '') else language end,
          description = case when proposed ? 'description' then nullif(proposed ->> 'description', '') else description end,
          quote = case when proposed ? 'quote' then nullif(proposed ->> 'quote', '') else quote end,
          source_type = case when proposed ? 'source_type' then nullif(proposed ->> 'source_type', '') else source_type end,
          location = case when proposed ? 'location' then nullif(proposed ->> 'location', '') else location end,
          source_url = case when proposed ? 'source_url' then nullif(proposed ->> 'source_url', '') else source_url end,
          image_url = case when proposed ? 'image_url' then nullif(proposed ->> 'image_url', '') else image_url end,
          catalog_type = case when proposed ? 'catalog_type' then nullif(proposed ->> 'catalog_type', '') else catalog_type end,
          updated_at = timezone('utc', now())
      where id = request_row.reference_id
      returning to_jsonb(language_references) into updated_reference;
      update public.reference_moderation_requests
      set status = 'approved'::public.moderation_request_status, reviewed_by = auth.uid(), review_note = nullif(trim(p_note), ''), target_snapshot = coalesce(reference_snapshot, target_snapshot), updated_at = timezone('utc', now())
      where id = p_request_id;
    else
      update public.reference_moderation_requests
      set status = 'rejected'::public.moderation_request_status, reviewed_by = auth.uid(), review_note = nullif(trim(p_note), ''), updated_at = timezone('utc', now())
      where id = p_request_id;
    end if;
  end if;

  select to_jsonb(result_row) into reference_snapshot from public.reference_moderation_requests as result_row where result_row.id = p_request_id;
  return reference_snapshot || jsonb_build_object('reference', updated_reference);
end;
$$;

grant execute on function public.review_reference_request(uuid, text, text) to authenticated;
