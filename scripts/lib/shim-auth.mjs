// Lo que Supabase trae de fabrica y un Postgres pelado no: los roles anon /
// authenticated / service_role, el esquema auth, auth.uid() y una tabla auth.users.
//
// Lo usan los dos lugares que levantan el Postgres embebido: `scripts/local.mjs` (modo
// local) y el test de punta a punta del agente (`tests/e2e/`). Tiene que ser el mismo en
// los dos: si no, el test probaria un esquema que nadie corre.
//
// Idempotente: correrlo de nuevo no toca nada. auth.users es un remedo minimo con las
// tres columnas que leen las migraciones del CRM; en una instancia real la crea GoTrue
// con muchas mas.
export const SHIM_AUTH = `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role noinherit bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as
  $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create or replace function auth.role() returns text language sql stable as
  $f$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $f$;
create or replace function auth.email() returns text language sql stable as
  $f$ select nullif(current_setting('request.jwt.claim.email', true), '') $f$;
`;
