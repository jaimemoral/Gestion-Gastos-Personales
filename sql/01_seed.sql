-- =============================================================
-- 01_seed.sql — Datos iniciales: categorías y presupuesto mensual
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y Run
-- Se puede ejecutar varias veces: el paso 0 limpia lo anterior antes de
-- volver a insertar, así la tabla queda solo con esta lista.
--
-- ⚠️ REQUIERE haber ejecutado antes sql/03_multiusuario.sql (crea la
-- tabla app_users y la columna budget_items.user_id que se usan aquí).
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

-- 2) Presupuesto mensual planificado, POR PERSONA y categoría.
--    AJUSTA LOS IMPORTES a la realidad de cada persona antes de ejecutar
--    (los valores de abajo duplican el presupuesto anterior en ambas
--    personas como punto de partida; cámbialos como necesites).
--    Los nombres deben coincidir exactamente con los de app_users.
insert into public.budget_items (category_id, user_id, planned_amount)
select c.id, u.id, v.amount
from (values
  ('PERSONA_1', 'Gasolina',             100.00),
  ('PERSONA_1', 'Compras / Viajes',     150.00),
  ('PERSONA_1', 'Gastos coche / moto',  150.00),
  ('PERSONA_1', 'Ropa',                  50.00),
  ('PERSONA_1', 'Comer fuera',           75.00),
  ('PERSONA_1', 'Gastos diarios',        75.00),
  ('PERSONA_1', 'Boda',                1000.00),
  ('PERSONA_1', 'Regalos',               40.00),
  ('PERSONA_1', 'Otros',                 50.00),
  ('PERSONA_2', 'Gasolina',             100.00),
  ('PERSONA_2', 'Compras / Viajes',     150.00),
  ('PERSONA_2', 'Gastos coche / moto',  150.00),
  ('PERSONA_2', 'Ropa',                  50.00),
  ('PERSONA_2', 'Comer fuera',           75.00),
  ('PERSONA_2', 'Gastos diarios',        75.00),
  ('PERSONA_2', 'Boda',                1000.00),
  ('PERSONA_2', 'Regalos',               40.00),
  ('PERSONA_2', 'Otros',                 50.00)
) as v(user_name, category_name, amount)
join public.expense_categories c on c.name = v.category_name
join public.app_users u on u.name = v.user_name;

-- Comprobación: 9 categorías x 2 personas = 18 filas
select u.name as usuario, c.name as categoria, b.planned_amount
from public.budget_items b
join public.expense_categories c on c.id = b.category_id
join public.app_users u on u.id = b.user_id
order by c.name, u.name;
