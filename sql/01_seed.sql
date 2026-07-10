-- =============================================================
-- 01_seed.sql — Datos iniciales: categorías y presupuesto mensual
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y Run
-- Se puede ejecutar varias veces: el paso 0 limpia lo anterior antes de
-- volver a insertar, así la tabla queda solo con esta lista.
-- =============================================================

-- 0) Borrar categorías y presupuesto previos.
--    budget_items depende de expense_categories, por eso se borra primero.
--    expenses.category_id queda a NULL en los gastos ya guardados (no se borran).
delete from public.budget_items;
delete from public.expense_categories;

-- 1) Categorías de gasto.
--    Añade, quita o renombra las que quieras antes de ejecutar.
insert into public.expense_categories (name)
values
  ('Gasolina'),
  ('Compras / Viajes'),
  ('Gastos coche / moto'),
  ('Ropa'),
  ('Comer fuera'),
  ('Gastos diarios'),
  ('Boda'),
  ('Regalos'),
  ('Otros');

-- 2) Presupuesto mensual planificado por categoría.
--    AJUSTA LOS IMPORTES a tu realidad antes de ejecutar.
insert into public.budget_items (category_id, planned_amount)
select c.id, v.amount
from (values
  ('Gasolina',             100.00),
  ('Compras / Viajes',     150.00),
  ('Gastos coche / moto',  150.00),
  ('Ropa',                  50.00),
  ('Comer fuera',           75.00),
  ('Gastos diarios',        75.00),
  ('Boda',                1000.00),
  ('Regalos',               40.00),
  ('Otros',                 50.00)
) as v(name, amount)
join public.expense_categories c on c.name = v.name;

-- Comprobación: debería devolver 9 categorías con su presupuesto
select c.name, b.planned_amount
from public.expense_categories c
left join public.budget_items b on b.category_id = c.id
order by c.name;
