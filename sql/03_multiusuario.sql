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
--
-- ⚠️ ANTES DE EJECUTAR: sustituye 'PERSONA_1' y 'PERSONA_2' (líneas ~30)
-- por los nombres reales de los dos usuarios.
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

-- 2) Los dos usuarios fijos. EDITA los nombres antes de ejecutar.
insert into public.app_users (name)
select v.name
from (values ('PERSONA_1'), ('PERSONA_2')) as v(name)
where not exists (
  select 1 from public.app_users u where u.name = v.name
);

-- 3) expenses: renombra created_by -> user_id y lo enlaza a app_users.
--    Los gastos ya registrados (sin usuario asignado) quedan a NULL:
--    se siguen sumando en la vista "Todos", pero no aparecen en el
--    filtro individual de ninguna persona hasta que se les asigne uno.
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

alter table public.expenses
  drop constraint if exists expenses_user_id_fkey;
alter table public.expenses
  add constraint expenses_user_id_fkey foreign key (user_id)
  references public.app_users(id) on delete set null;

create index if not exists expenses_user_id_idx on public.expenses(user_id);

-- 4) budget_items: añade user_id. A partir de ahora cada fila es
--    "el presupuesto de ESTA persona en ESTA categoría".
alter table public.budget_items
  add column if not exists user_id uuid references public.app_users(id) on delete cascade;

create index if not exists budget_items_user_id_idx on public.budget_items(user_id);

-- Nota: la unicidad (una fila por persona+categoría) y el NOT NULL de
-- user_id se aplican en el paso 5, DESPUÉS de re-sembrar los datos con
-- sql/01_seed.sql (los presupuestos antiguos no tienen user_id y
-- romperían estas restricciones si se aplicaran ahora).

-- 5) Comprobación: deberías ver la tabla app_users con tus 2 usuarios
select * from public.app_users order by created_at;
