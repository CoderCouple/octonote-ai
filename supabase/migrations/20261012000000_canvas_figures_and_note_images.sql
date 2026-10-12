-- Figure images (canvas figures embedded in notes) and images uploaded into notes.

-- Figures: one PNG per figure at a fixed path, overwritten on change. Only the
-- API (service role) writes here — no client policies — so any editor of the
-- canvas can update a figure regardless of who first created it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('canvas-figures', 'canvas-figures', true, 5242880, array['image/png'])
on conflict (id) do nothing;

-- Note images: uploaded straight from the editor to a random path (unguessable
-- URL), like canvas thumbnails. Same known v1 gap: any signed-in user can
-- upload; move behind API-issued signed upload URLs before public launch.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-images',
  'note-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

create policy "note images: authenticated upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'note-images');

create policy "note images: uploader can delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'note-images' and owner = auth.uid());
