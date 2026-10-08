-- Storage for canvas PNG thumbnails (shown by the notes canvas-reference block).
-- App tables are managed by Drizzle in services/api; this file only covers
-- Supabase-managed storage.
--
-- Public bucket: object paths contain a random segment and the API only hands
-- a thumbnail URL to people who can view the canvas.
-- Known v1 gap: any signed-in user can upload into this bucket. Move uploads
-- behind API-issued signed upload URLs before public launch.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('canvas-thumbnails', 'canvas-thumbnails', true, 2097152, array['image/png'])
on conflict (id) do nothing;

create policy "thumbnails: authenticated upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'canvas-thumbnails');

create policy "thumbnails: uploader can delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'canvas-thumbnails' and owner = auth.uid());
