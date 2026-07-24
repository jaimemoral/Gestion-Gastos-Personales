-- =============================================================
-- 05_recuperar_categorias.sql — Recupera la categoría de gastos históricos
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y Run
--
-- CONTEXTO: al re-sembrar categorías, los 21 gastos previos perdieron su
-- category_id (quedó NULL). De las capturas hechas durante el desarrollo
-- se recuperan 9 asignaciones, cruzando por fecha + importe (ambos únicos
-- para estas 9 filas, así que no hay ambigüedad).
--
-- Solo toca gastos que ESTÉN sin categoría (category_id is null): si ya
-- has recategorizado algo a mano, no lo pisa. Seguro de re-ejecutar.
-- =============================================================

update public.expenses e
set category_id = c.id
from (values
  ('2026-07-19'::date, 7.60,   'Gastos diarios'),
  ('2026-07-19'::date, 5.60,   'Gastos diarios'),
  ('2026-07-18'::date, 2.93,   'Gastos diarios'),
  ('2026-07-17'::date, 36.80,  'Comer fuera'),
  ('2026-07-15'::date, 5.60,   'Gastos diarios'),
  ('2026-07-12'::date, 23.30,  'Comer fuera'),
  ('2026-07-11'::date, 214.00, 'Gastos coche / moto'),
  ('2026-07-10'::date, 12.41,  'Gastos diarios'),
  ('2026-07-10'::date, 5.00,   'Gastos diarios')
) as v(d, amount, category_name)
join public.expense_categories c on c.name = v.category_name
where e.date = v.d
  and e.amount = v.amount
  and e.category_id is null;

-- Comprobación: cuántos gastos siguen sin categoría (deberían quedar 12)
select count(*) as sin_categoria
from public.expenses
where category_id is null;
