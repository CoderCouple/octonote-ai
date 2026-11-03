-- Screenshots sent with bug reports and feature requests. Private: they can show
-- someone's notes. Only the API (service role) writes here, with no client
-- policies; staff see them through links that expire.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-screenshots', 'feedback-screenshots', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
