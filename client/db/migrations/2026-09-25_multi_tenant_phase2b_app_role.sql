-- =====================================================================
-- MULTI-TENANT — FASE 2b: role do app sem BYPASSRLS
--
-- Superuser e roles com BYPASSRLS ignoram o RLS. O app precisa conectar com
-- um role comum. Este role passa a ser DONO das tabelas (FORCE ROW LEVEL
-- SECURITY, ligado na fase 2, submete o dono às policies) — necessário porque
-- os ensure*() do app ainda rodam ALTER TABLE ... IF NOT EXISTS, que exige
-- ser dono.
--
-- ANTES DE RODAR: troque a senha abaixo. Rode como superuser.
-- Depois: DB_USER=app_user e DB_PASSWORD=<a senha> no .env.local e reinicie.
-- Jobs de plataforma (backup, /dev administrativo) continuam usando o
-- superuser original, que ignora o RLS.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'TROQUE-ESTA-SENHA' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

DO $$
DECLARE r record;
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', current_database());
  GRANT USAGE, CREATE ON SCHEMA public TO app_user;

  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO app_user', r.tablename);
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO app_user', r.sequencename);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'public' AND t.typtype = 'e' LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO app_user', r.typname);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prokind = 'f' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO app_user', r.fn);
  END LOOP;
END $$;
