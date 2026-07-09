# Gestión de Gastos Personales

App de gestión de gastos personales con backend en Supabase, pensada para desplegarse como sitio estático en GitHub Pages.

- **URL de producción**: https://jaimemoral.github.io/Gestion-Gastos-Personales/
- **Backend**: Supabase (base de datos con RLS)
- **Acceso**: directo, sin login (fase 1, uso personal). La URL en favoritos es la "llave": cualquiera con el link puede usar la app. Cuando se quiera restringir, se reintroducirá autenticación y se cambiarán las políticas RLS (ver [`sql/02_acceso_abierto.sql`](sql/02_acceso_abierto.sql)).

## Estructura

```
index.html               # marcado de las 3 vistas: login, registro de gasto, reportes
app.js                   # lógica: autenticación, CRUD de gastos, reportes
style.css                # estilos
config.js                # credenciales de Supabase (URL + anon key)
sql/01_seed.sql          # datos iniciales: categorías y presupuesto mensual
sql/02_acceso_abierto.sql # políticas RLS: acceso abierto al rol anon (sin login)
```

No hay build step: es HTML/CSS/JS servido tal cual, con Supabase JS y Chart.js cargados por CDN.

## Configuración

1. En el dashboard de Supabase, ve a **Settings → API** y copia:
   - `Project URL`
   - `anon public key`
2. Edita [`config.js`](config.js) y sustituye los valores:

   ```js
   const SUPABASE_URL = 'https://xxxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'ey...';
   ```

   La `anon key` es pública por diseño; la seguridad real la aporta RLS en la base de datos, no el secreto de esta clave.

No hace falta configurar nada en Authentication: la app no usa login en esta fase.

## Desarrollo local

Como es un sitio estático, basta con servirlo con cualquier servidor HTTP simple (abrir `index.html` directamente con `file://` no funciona bien con el flujo de auth por redirect). Por ejemplo:

```bash
npx serve .
# o
python -m http.server 5500
```

Y visita la URL local correspondiente.

## Despliegue en GitHub Pages

> ⚠️ En el plan gratuito de GitHub, Pages solo funciona con repos **públicos**. La anon key de `config.js` es pública por diseño (la seguridad la aporta RLS), así que hacer el repo público es seguro.

1. Haz el repo público: **Settings → General → Danger Zone → Change visibility → Public**.
2. Haz commit y push de estos archivos a la rama `main` del repo `jaimemoral/Gestion-Gastos-Personales`.
3. En **Settings → Pages** del repo, configura la fuente como la rama `main` (carpeta raíz `/`).
4. Espera 1-2 minutos a que se publique en https://jaimemoral.github.io/Gestion-Gastos-Personales/

## Puesta en marcha (checklist)

1. **Base de datos** — En Supabase → SQL Editor, ejecuta en orden:
   - [`sql/02_acceso_abierto.sql`](sql/02_acceso_abierto.sql): abre el acceso a la app sin login.
   - [`sql/01_seed.sql`](sql/01_seed.sql): crea las categorías y el presupuesto (ajusta importes antes).
2. **Deploy** — Sigue la sección "Despliegue en GitHub Pages".
3. **Prueba** — Abre la URL de producción, registra un gasto de prueba y comprueba que aparece en Reportes. Guarda la URL en favoritos: ese es el acceso.

## Esquema de base de datos (ya existente en Supabase)

- `expense_categories`: `id`, `name`, `created_at`
- `budget_items`: `id`, `category_id` (FK), `planned_amount`
- `expenses`: `id`, `date`, `amount`, `category_id` (FK, `NULL` si se borra la categoría), `description`, `provider`, `payment_method` (`Efectivo` / `Tarjeta` / `Transferencia` / `Bizum` / `Otro`), `created_by`, `created_at`

## Funcionalidad

- **Registrar gasto**: formulario con fecha, importe, categoría, proveedor, método de pago y descripción; lista de últimos gastos con opción de borrado.
- **Reportes**: filtros por rango de fechas y categoría; tabla y gráfico de barras comparando presupuesto planificado vs. gastado por categoría, y listado detallado de los gastos filtrados.
