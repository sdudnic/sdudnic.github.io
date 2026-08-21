-- Permite atașarea unei imagini publice a documentului la o referință.
-- Imaginea este afișată numai în blade-ul de detalii, fără lightbox.

alter table public.language_references
  add column if not exists image_url text;

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
