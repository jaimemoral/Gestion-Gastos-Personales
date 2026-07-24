-- =============================================================
-- 04_finalizar_presupuesto.sql — Cierra las reglas de integridad
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y Run
--
-- ⚠️ EJECUTAR EN ÚLTIMO LUGAR, después de 03_multiusuario.sql y de
-- 01_seed.sql (necesita que budget_items ya tenga user_id relleno en
-- todas las filas; si lo ejecutas antes, fallará y no cambiará nada).
--
-- Deja fijas dos reglas que hasta ahora quedaban abiertas:
--   1. Todo presupuesto tiene que pertenecer a una persona (NOT NULL).
--   2. Una persona no puede tener dos presupuestos para la misma
--      categoría (UNIQUE) — evita duplicados si se re-ejecuta el seed
--      con datos ya cargados de otra forma.
-- =============================================================

alter table public.budget_items
  alter column user_id set not null;

alter table public.budget_items
  drop constraint if exists budget_items_user_category_unique;
alter table public.budget_items
  add constraint budget_items_user_category_unique unique (user_id, category_id);

-- Comprobación: no debe haber error y esto debe devolver la restricción creada
select conname, contype
from pg_constraint
where conrelid = 'public.budget_items'::regclass
  and conname = 'budget_items_user_category_unique';
