-- Permite mai multe capturi pentru aceeași referință, fiecare cu descrierea ei.
-- Structura este o listă JSON de forma:
-- [{"url":"https://... sau data:image/...","description":"Pagina ..."}]

alter table public.language_references
  add column if not exists image_items jsonb not null default '[]'::jsonb;

-- Nu rescriem toate rândurile aici: triggerul save_reference_revision() ar
-- copia fiecare rând vechi, inclusiv imaginea Base64, în reference_revisions și
-- poate umple discul în timpul migrației. Codul păstrează compatibilitatea cu
-- image_url și tratează coloana nouă ca o galerie goală până la o optimizare
-- explicită, făcută în loturi controlate.

do $$
begin
  alter table public.language_references
    drop constraint if exists language_references_image_items;
  alter table public.language_references
    add constraint language_references_image_items check (
      jsonb_typeof(image_items) = 'array'
      and jsonb_array_length(image_items) <= 12
    ) not valid;
end
$$;
