-- Figure pictures are served through /f/<id>.png, which checks who may see them.
-- Run only after notes have moved off the old Storage links (API migration 0030).
update storage.buckets set public = false where id = 'canvas-figures';
