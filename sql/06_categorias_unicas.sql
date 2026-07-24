-- =============================================================
-- 06_categorias_unicas.sql — Protege contra categorías duplicadas
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y Run
--
-- OPCIONAL: la app ya comprueba duplicados (sin distinguir mayúsculas)
-- antes de crear o renombrar una categoría desde la pestaña "Categorías".
-- Esto es una segunda capa de seguridad a nivel de base de datos, por si
-- dos inserciones llegaran a la vez desde dos dispositivos.
--
-- Es idempotente: se puede ejecutar varias veces.
-- =============================================================

alter table public.expense_categories
  drop constraint if exists expense_categories_name_key;
alter table public.expense_categories
  add constraint expense_categories_name_key unique (name);

-- Comprobación: debe devolver la restricción recién creada
select conname, contype
from pg_constraint
where conrelid = 'public.expense_categories'::regclass
  and conname = 'expense_categories_name_key';
