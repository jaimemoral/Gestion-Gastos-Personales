# Gestión de Gastos Personales

App de gestión de gastos personales con backend en Supabase, pensada para desplegarse como sitio estático en GitHub Pages.

- **URL de producción**: https://jaimemoral.github.io/Gestion-Gastos-Personales/
- **Backend**: Supabase (auth con enlace mágico / OTP, base de datos con RLS)
- **Acceso**: restringido a `jmoral@kaizen.com` vía política RLS en Supabase

## Estructura

```
index.html   # marcado de las 3 vistas: login, registro de gasto, reportes
app.js       # lógica: autenticación, CRUD de gastos, reportes
style.css    # estilos
config.js    # credenciales de Supabase (URL + anon key)
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

3. En Supabase, ve a **Authentication → URL Configuration** y confirma que estas URLs de redirect están dadas de alta:
   - `http://localhost:5500/` (o el puerto que uses en local — ajústalo a tu servidor local)
   - `https://jaimemoral.github.io/Gestion-Gastos-Personales/`

## Desarrollo local

Como es un sitio estático, basta con servirlo con cualquier servidor HTTP simple (abrir `index.html` directamente con `file://` no funciona bien con el flujo de auth por redirect). Por ejemplo:

```bash
npx serve .
# o
python -m http.server 5500
```

Y visita la URL local correspondiente.

## Despliegue en GitHub Pages

1. Haz commit y push de estos archivos a la rama `main` del repo `jaimemoral/Gestion-Gastos-Personales`.
2. En **Settings → Pages** del repo, configura la fuente como la rama `main` (carpeta raíz `/`).
3. Espera a que se publique en https://jaimemoral.github.io/Gestion-Gastos-Personales/

## Esquema de base de datos (ya existente en Supabase)

- `expense_categories`: `id`, `name`, `created_at`
- `budget_items`: `id`, `category_id` (FK), `planned_amount`
- `expenses`: `id`, `date`, `amount`, `category_id` (FK, `NULL` si se borra la categoría), `description`, `provider`, `payment_method` (`Efectivo` / `Tarjeta` / `Transferencia` / `Bizum` / `Otro`), `created_by`, `created_at`

## Funcionalidad

- **Login**: acceso por enlace mágico enviado al email (sin contraseña).
- **Registrar gasto**: formulario con fecha, importe, categoría, proveedor, método de pago y descripción; lista de últimos gastos con opción de borrado.
- **Reportes**: filtros por rango de fechas y categoría; tabla y gráfico de barras comparando presupuesto planificado vs. gastado por categoría, y listado detallado de los gastos filtrados.
