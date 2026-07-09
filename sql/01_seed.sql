-- =============================================================
-- 01_seed.sql — Datos iniciales: categorías y presupuesto mensual
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y Run
-- Es idempotente: se puede ejecutar varias veces sin duplicar datos.
-- =============================================================

-- 1) Categorías de gasto típicas de un hogar.
--    Añade, quita o renombra las que quieras antes de ejecutar.
insert into public.expense_categories (name)
select v.name
from (values
  ('Vivienda'),          -- alquiler / hipoteca / comunidad
  ('Supermercado'),
  ('Restaurantes y bares'),
  ('Transporte'),        -- gasolina, transporte público, parking
  ('Suministros'),       -- luz, agua, gas, internet, móvil
  ('Salud'),
  ('Ocio'),
  ('Ropa'),
  ('Suscripciones'),     -- Netflix, Spotify, gimnasio...
  ('Viajes'),
  ('Regalos'),
  ('Otros')
) as v(name)
where not exists (
  select 1 from public.expense_categories c where c.name = v.name
);

-- 2) Presupuesto mensual planificado por categoría.
--    AJUSTA LOS IMPORTES a tu realidad antes de ejecutar.
insert into public.budget_items (category_id, planned_amount)
select c.id, v.amount
from (values
  ('Vivienda',             800.00),
  ('Supermercado',         400.00),
  ('Restaurantes y bares', 150.00),
  ('Transporte',           120.00),
  ('Suministros',          150.00),
  ('Salud',                 50.00),
  ('Ocio',                 100.00),
  ('Ropa',                  60.00),
  ('Suscripciones',         40.00),
  ('Viajes',               100.00),
  ('Regalos',               40.00),
  ('Otros',                 50.00)
) as v(name, amount)
join public.expense_categories c on c.name = v.name
where not exists (
  select 1 from public.budget_items b where b.category_id = c.id
);

-- Comprobación: debería devolver 12 categorías con su presupuesto
select c.name, b.planned_amount
from public.expense_categories c
left join public.budget_items b on b.category_id = c.id
order by c.name;
