-- =============================================================
-- 01_seed.sql — Datos iniciales: categorías y presupuesto mensual
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y Run
--
-- ⚠️ REQUIERE haber ejecutado antes sql/03_multiusuario.sql (crea la
-- tabla app_users y la columna budget_items.user_id que se usan aquí).
--
-- Seguro de re-ejecutar. IMPORTANTE: este script ya NO borra las
-- categorías. Borrarlas rompía el enlace de los gastos históricos
-- (category_id pasaba a NULL). Ahora las categorías solo se AÑADEN si
-- faltan, conservando sus identificadores y los gastos asociados.
-- =============================================================

-- 1) Categorías de gasto: se insertan solo las que aún no existan (por
--    nombre). Renombrar o borrar categorías se hace a mano, con cuidado.
insert into public.expense_categories (name)
select v.name
from (values
  ('Gasolina'),
  ('Compras / Viajes'),
  ('Gastos coche / moto'),
  ('Ropa'),
  ('Comer fuera'),
  ('Gastos diarios'),
  ('Boda'),
  ('Regalos'),
  ('Otros')
) as v(name)
where not exists (
  select 1 from public.expense_categories c where c.name = v.name
);

-- 2) Presupuesto mensual planificado, POR PERSONA y categoría.
--    Se re-siembra por completo: borrar budget_items es seguro (ninguna
--    otra tabla depende de él). AJUSTA LOS IMPORTES a la realidad de cada
--    persona antes de ejecutar. Los nombres deben coincidir con app_users.
delete from public.budget_items;

insert into public.budget_items (category_id, user_id, planned_amount)
select c.id, u.id, v.amount
from (values
  ('Jaime', 'Gasolina',             100.00),
  ('Jaime', 'Compras / Viajes',     150.00),
  ('Jaime', 'Gastos coche / moto',  150.00),
  ('Jaime', 'Ropa',                  50.00),
  ('Jaime', 'Comer fuera',           75.00),
  ('Jaime', 'Gastos diarios',        75.00),
  ('Jaime', 'Boda',                1000.00),
  ('Jaime', 'Regalos',               40.00),
  ('Jaime', 'Otros',                 50.00),
  ('Rosa',  'Gasolina',             100.00),
  ('Rosa',  'Compras / Viajes',     150.00),
  ('Rosa',  'Gastos coche / moto',  150.00),
  ('Rosa',  'Ropa',                  50.00),
  ('Rosa',  'Comer fuera',           75.00),
  ('Rosa',  'Gastos diarios',        75.00),
  ('Rosa',  'Boda',                1000.00),
  ('Rosa',  'Regalos',               40.00),
  ('Rosa',  'Otros',                 50.00)
) as v(user_name, category_name, amount)
join public.expense_categories c on c.name = v.category_name
join public.app_users u on u.name = v.user_name;

-- Comprobación: 9 categorías x 2 personas = 18 filas
select u.name as usuario, c.name as categoria, b.planned_amount
from public.budget_items b
join public.expense_categories c on c.id = b.category_id
join public.app_users u on u.id = b.user_id
order by c.name, u.name;
