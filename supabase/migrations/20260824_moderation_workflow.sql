-- Flux de premoderare pentru MCP și catalogul web.
-- Numai contul cu adresa sdudnic@gmail.com poate valida, infirma sau șterge.

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

alter table public.language_references
  drop constraint if exists language_references_catalog_type;

alter table public.language_references
  add constraint language_references_catalog_type
  check (catalog_type in ('language', 'ethnicity', 'both'));

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

update public.profiles
set role = 'admin', updated_at = timezone('utc', now())
where lower(coalesce(email, '')) = 'sdudnic@gmail.com';

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

drop policy if exists language_references_insert_editor on public.language_references;
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
create policy language_references_delete_primary_admin
  on public.language_references for delete
  to authenticated
  using (public.is_primary_admin());

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

  if not found then
    raise exception 'Cererea de moderare nu există';
  end if;
  if request_row.status <> 'pending'::public.moderation_request_status then
    raise exception 'Cererea de moderare a fost deja soluționată';
  end if;

  if request_row.request_type = 'delete'::public.moderation_request_type then
    select to_jsonb(reference_row) into reference_snapshot
    from public.language_references as reference_row
    where reference_row.id = request_row.reference_id;

    if action = 'approve' then
      if request_row.reference_id is null or reference_snapshot is null then
        raise exception 'Referința pentru ștergere nu mai există';
      end if;
      update public.reference_moderation_requests
      set status = 'approved'::public.moderation_request_status,
          reviewed_by = auth.uid(),
          review_note = nullif(trim(p_note), ''),
          target_snapshot = coalesce(reference_snapshot, target_snapshot),
          updated_at = timezone('utc', now())
      where id = p_request_id;
      delete from public.language_references where id = request_row.reference_id;
    else
      update public.reference_moderation_requests
      set status = 'rejected'::public.moderation_request_status,
          reviewed_by = auth.uid(),
          review_note = nullif(trim(p_note), ''),
          updated_at = timezone('utc', now())
      where id = p_request_id;
    end if;
  elsif request_row.request_type = 'edit'::public.moderation_request_type then
    if action = 'approve' then
      if request_row.reference_id is null then
        raise exception 'Referința pentru editare nu mai există';
      end if;
      proposed := request_row.proposed_changes;
      select to_jsonb(reference_row) into reference_snapshot
      from public.language_references as reference_row
      where reference_row.id = request_row.reference_id;
      if reference_snapshot is null then
        raise exception 'Referința pentru editare nu mai există';
      end if;

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
      set status = 'approved'::public.moderation_request_status,
          reviewed_by = auth.uid(),
          review_note = nullif(trim(p_note), ''),
          target_snapshot = coalesce(reference_snapshot, target_snapshot),
          updated_at = timezone('utc', now())
      where id = p_request_id;
    else
      update public.reference_moderation_requests
      set status = 'rejected'::public.moderation_request_status,
          reviewed_by = auth.uid(),
          review_note = nullif(trim(p_note), ''),
          updated_at = timezone('utc', now())
      where id = p_request_id;
    end if;
  end if;

  select to_jsonb(result_row) into reference_snapshot
  from public.reference_moderation_requests as result_row
  where result_row.id = p_request_id;

  return reference_snapshot || jsonb_build_object('reference', updated_reference);
end;
$$;

grant execute on function public.review_reference_request(uuid, text, text) to authenticated;
