-- =============================================================
-- 03_multiusuario.sql — Añade la dimensión de usuario al sistema
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y Run
--
-- MODELO ACORDADO:
--   - Los gastos siguen en una única tabla compartida: todos se suman
--     juntos, cada uno etiquetado con quién lo registró.
--   - El presupuesto (budget_items) pasa a ser por PERSONA y categoría:
--     cada usuario tiene su propio límite en "Ropa", "Gasolina", etc.
--   - Identificación por selector de perfil simple (sin contraseñas):
--     el usuario elige su nombre en la app y el dispositivo lo recuerda.
--   - Los gastos ya registrados hasta ahora se asignan todos a Jaime.
--
-- Es idempotente: se puede ejecutar varias veces sin duplicar nada.
-- =============================================================

-- 1) Tabla de usuarios de la app (no son usuarios de Supabase Auth,
--    es solo la lista de perfiles entre los que se elige en la app).
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.app_users enable row level security;

drop policy if exists "open_access_all" on public.app_users;
create policy "open_access_all" on public.app_users
  for all to anon, authenticated
  using (true) with check (true);

-- 2) Los dos usuarios fijos.
insert into public.app_users (name)
select v.name
from (values ('Rosa'), ('Jaime')) as v(name)
where not exists (
  select 1 from public.app_users u where u.name = v.name
);

-- 3) expenses: renombra created_by -> user_id y lo enlaza a app_users.
--    La columna original es "text" (no "uuid"), así que hay que convertir
--    el tipo antes de poder enlazarla por FK. Es seguro: todas las filas
--    actuales la tienen a NULL (comprobado), no hay valores que perder.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'expenses' and column_name = 'created_by'
  ) then
    alter table public.expenses rename column created_by to user_id;
  end if;
end $$;

alter table public.expenses alter column user_id drop default;
alter table public.expenses alter column user_id type uuid using user_id::uuid;

alter table public.expenses
  drop constraint if exists expenses_user_id_fkey;
alter table public.expenses
  add constraint expenses_user_id_fkey foreign key (user_id)
  references public.app_users(id) on delete set null;

create index if not exists expenses_user_id_idx on public.expenses(user_id);

-- 3b) Los gastos registrados antes de esta migración no tienen usuario:
--     se asignan todos a Jaime, tal y como se pidió. Idempotente: una vez
--     asignados, no quedan NULL y esta línea deja de tener efecto.
update public.expenses
set user_id = (select id from public.app_users where name = 'Jaime')
where user_id is null;

-- 4) budget_items: añade user_id. A partir de ahora cada fila es
--    "el presupuesto de ESTA persona en ESTA categoría".
alter table public.budget_items
  add column if not exists user_id uuid references public.app_users(id) on delete cascade;

create index if not exists budget_items_user_id_idx on public.budget_items(user_id);

-- Del modelo anterior (un presupuesto por categoría, sin persona) queda
-- una restricción UNIQUE solo sobre category_id: bloquearía tener una fila
-- de Rosa y otra de Jaime para la misma categoría. Se sustituye por la
-- unicidad (user_id, category_id) en sql/04_finalizar_presupuesto.sql.
alter table public.budget_items
  drop constraint if exists budget_items_category_id_key;

-- Nota: la unicidad (una fila por persona+categoría) y el NOT NULL de
-- user_id se aplican en sql/04_finalizar_presupuesto.sql, DESPUÉS de
-- re-sembrar los datos con sql/01_seed.sql (los presupuestos antiguos no
-- tienen user_id y romperían esas restricciones si se aplicaran ahora).

-- 5) Comprobación: deberías ver Rosa y Jaime
select * from public.app_users order by created_at;

-- 6) Comprobación: no debería quedar ningún gasto con user_id NULL
select count(*) as gastos_sin_asignar from public.expenses where user_id is null;
