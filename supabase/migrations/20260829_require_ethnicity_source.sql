-- Referințele despre etnie trebuie să păstreze o sursă verificabilă.

alter table public.language_references
  drop constraint if exists language_references_ethnicity_source_url;

alter table public.language_references
  add constraint language_references_ethnicity_source_url check (
    catalog_type not in ('ethnicity', 'both')
    or source_url is not null
  );
