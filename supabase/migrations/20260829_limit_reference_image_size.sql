-- Limitează imaginile data URL la aproximativ 1,5 MB binar.
-- NOT VALID păstrează imaginile istorice mari; limita se aplică datelor noi.

do $$
begin
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
