-- Manim explainer videos embedded in notes (MP4 + JPEG poster). Public like
-- note-images: objects live under unguessable paths, and only the API
-- (service role) writes here, with no client policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-videos', 'note-videos', true, 52428800, array['video/mp4', 'image/jpeg'])
on conflict (id) do nothing;
