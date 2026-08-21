-- Separă catalogul denumirii limbii de catalogul general despre moldoveni.
-- Valoarea `both` permite păstrarea unei singure referințe atunci când aceeași
-- sursă documentează atât glotonimul, cât și etnonimul.

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

create index if not exists language_references_catalog_type_idx
  on public.language_references (catalog_type, status, year_start);
