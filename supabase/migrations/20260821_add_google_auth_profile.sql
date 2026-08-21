-- Adaugă identificarea providerului și emailul pentru autentificarea Google.
-- Migrarea este sigură pentru profilele GitHub existente.

alter table public.profiles
  add column if not exists auth_provider text;

alter table public.profiles
  add column if not exists email text;

update public.profiles as profile
set
  auth_provider = coalesce(profile.auth_provider, users.raw_app_meta_data ->> 'provider', 'github'),
  email = coalesce(profile.email, users.email)
from auth.users as users
where profile.id = users.id;

create index if not exists profiles_email_idx
  on public.profiles (email);

-- Dacă un cont Google a fost creat înainte de activarea regulii automate,
-- oferă-i rolul de editor numai dacă este încă viewer.
update public.profiles
set role = 'editor'::public.app_role
where auth_provider = 'google'
  and role = 'viewer'::public.app_role;

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
    case when coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google'
      then 'editor'::public.app_role
      else 'viewer'::public.app_role
    end
  )
  on conflict (id) do update set
    github_login = coalesce(excluded.github_login, public.profiles.github_login),
    auth_provider = coalesce(excluded.auth_provider, public.profiles.auth_provider),
    email = coalesce(excluded.email, public.profiles.email),
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    updated_at = timezone('utc', now());
  return new;
end;
$$;
