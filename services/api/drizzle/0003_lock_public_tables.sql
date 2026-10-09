-- Supabase exposes every table in `public` through its REST/GraphQL Data API
-- using the anon key, which ships inside the web and mobile apps. Octonote
-- never uses that API: services/api connects to Postgres directly as the
-- owner (which bypasses RLS) and owns all authorization. So lock the Data API
-- out of every app table: RLS on with no policies (deny all), and no table
-- privileges for the API roles. New tables must do the same — see
-- test/integration/security.test.ts.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  -- The Supabase API roles only exist on Supabase (not in plain Postgres / PGlite tests).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
