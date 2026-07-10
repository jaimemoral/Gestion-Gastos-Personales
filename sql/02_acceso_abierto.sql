-- =============================================================
-- 02_acceso_abierto.sql — Acceso directo SIN login
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y Run
--
-- MODELO DE ACCESO ACTUAL (fase 1, uso personal):
--   No hay autenticación. La app usa la anon key y estas políticas
--   permiten al rol `anon` leer y escribir las tres tablas.
--   ⚠️ Cualquiera que tenga la URL de la app (o la anon key) puede ver
--   y modificar los datos. Aceptado por ahora; cuando se quiera
--   restringir, se reactiva el login y se cambian estas políticas.
--
-- Es idempotente: se puede ejecutar varias veces.
-- =============================================================

-- 1) Asegurar que RLS está activo (las políticas de abajo dan el permiso)
alter table public.expense_categories enable row level security;
alter table public.budget_items       enable row level security;
alter table public.expenses           enable row level security;

-- 2) Limpiar políticas de la fase anterior (login por magic link), si existen
drop policy if exists "allowed_users_all" on public.expense_categories;
drop policy if exists "allowed_users_all" on public.budget_items;
drop policy if exists "allowed_users_all" on public.expenses;

-- 3) Acceso completo para el rol anon (la app sin login) y authenticated
drop policy if exists "open_access_all" on public.expense_categories;
create policy "open_access_all" on public.expense_categories
  for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "open_access_all" on public.budget_items;
create policy "open_access_all" on public.budget_items
  for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "open_access_all" on public.expenses;
create policy "open_access_all" on public.expenses
  for all to anon, authenticated
  using (true) with check (true);

-- 4) Sin login no hay usuario autenticado: created_by pasa a ser opcional.
--    (Con NOT NULL, todos los inserts desde la app fallan.)
alter table public.expenses alter column created_by drop not null;

-- 5) Comprobación: debe listar una política "open_access_all" por tabla
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
