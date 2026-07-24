// Gestión de Gastos Personales — lógica de la app
// Requiere config.js cargado antes (SUPABASE_URL, SUPABASE_ANON_KEY)
// Sin autenticación: la app carga directamente; el acceso a datos lo permite
// la política RLS para el rol anon (ver sql/02_acceso_abierto.sql).

const ACTIVE_USER_KEY = 'gastos_active_user_id';

const state = {
  categories: [],
  budgetChart: null,
  reportMonth: new Date(),      // mes visible en el dashboard
  rangeMode: 'month',           // 'month' | 'custom'
  customFrom: null,
  customTo: null,
  selectedCats: new Set(),      // ids de categoría filtradas; vacío = todas
  users: [],                    // perfiles (Rosa, Jaime...) desde app_users
  activeUserId: null,           // quién soy: se usa para registrar gastos
  dashboardUserFilter: 'mine',  // 'mine' (solo activeUserId) | 'all' (Rosa+Jaime)
  trendYear: new Date().getFullYear(), // año visible en Evolución mensual
  trendChart: null,
};

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Colores del gráfico (paleta de estado validada: contraste + daltonismo)
const CHART_COLORS = {
  good: '#0ca30c',      // gasto dentro de presupuesto
  warning: '#fab219',   // ≥80% del presupuesto consumido
  over: '#d03b3b',      // presupuesto excedido
  plan: '#52514e',      // línea de planificado
  grid: '#e7ebf2',
  trendLine: '#2563eb',
  trendFill: 'rgba(37, 99, 235, 0.08)',
};

const BUDGET_WARNING_THRESHOLD = 80; // % de presupuesto consumido a partir del cual se avisa

function isConfigured() {
  return (
    typeof SUPABASE_URL === 'string' &&
    typeof SUPABASE_ANON_KEY === 'string' &&
    /^https?:\/\//.test(SUPABASE_URL) &&
    SUPABASE_ANON_KEY.length > 0 &&
    SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY'
  );
}

function showConfigMissing() {
  document.getElementById('app').innerHTML = `
    <div class="card card-narrow">
      <h2>Falta configuración</h2>
      <p>Edita <code>config.js</code> con el <code>Project URL</code> y la <code>anon key</code> de tu proyecto Supabase (Settings → API) antes de usar la app.</p>
    </div>
  `;
}

if (!isConfigured()) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showConfigMissing);
  } else {
    showConfigMissing();
  }
  throw new Error('Supabase no está configurado: revisa config.js');
}

// "db" y no "supabase": el script del CDN ya declara la global `supabase`
// y redeclararla rompe todo el archivo con un SyntaxError silencioso.
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Utilidades ----------

function formatCurrency(value) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

function showMessage(el, text, type = 'info') {
  el.textContent = text;
  el.className = `message ${type}`;
  el.classList.remove('hidden');
}

// Fecha local en formato YYYY-MM-DD (sin pasar por UTC, que desplaza el día)
function toLocalISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayISO() {
  return toLocalISO(new Date());
}

// ---------- Perfiles (Rosa / Jaime) ----------
//
// Sin login: "quién soy" es solo un perfil elegido una vez y recordado en
// este dispositivo (localStorage). Un único control en la cabecera hace
// dos cosas a la vez:
//   - Tocar tu nombre (Rosa/Jaime) = "soy esta persona": fija tu identidad
//     (con la que se guardan los gastos nuevos) y filtra el dashboard a
//     solo tus datos.
//   - Tocar "Todos" = solo cambia la vista del dashboard a la suma de
//     ambos; NO cambia quién eres para registrar gastos.

async function loadUsers() {
  const { data, error } = await db
    .from('app_users')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error cargando usuarios', error);
    return;
  }

  state.users = data || [];
}

// Recupera el perfil guardado en este dispositivo, si sigue siendo válido
function resolveIdentity() {
  const stored = localStorage.getItem(ACTIVE_USER_KEY);
  if (stored && state.users.some((u) => u.id === stored)) {
    state.activeUserId = stored;
    return true;
  }
  return false;
}

function selectIdentity(userId) {
  state.activeUserId = userId;
  state.dashboardUserFilter = 'mine';
  localStorage.setItem(ACTIVE_USER_KEY, userId);
  renderProfileSwitch();
  updateActiveUserLabel();
}

function showProfileGate() {
  document.getElementById('view-profile-gate').classList.remove('hidden');
  document.getElementById('view-app').classList.add('hidden');
  document.getElementById('profile-switch').classList.add('hidden');

  const wrap = document.getElementById('profile-gate-buttons');
  wrap.innerHTML = '';
  state.users.forEach((u) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = u.name;
    btn.addEventListener('click', async () => {
      selectIdentity(u.id);
      document.getElementById('view-profile-gate').classList.add('hidden');
      await startApp();
    });
    wrap.appendChild(btn);
  });
}

// Botones [Rosa] [Jaime] [Todos] en la cabecera
function renderProfileSwitch() {
  const wrap = document.getElementById('profile-switch');
  wrap.classList.remove('hidden');
  wrap.innerHTML = '';

  state.users.forEach((u) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = u.name;
    const isActive = state.dashboardUserFilter === 'mine' && state.activeUserId === u.id;
    btn.className = isActive ? 'active' : '';
    btn.addEventListener('click', () => {
      selectIdentity(u.id);
      loadReports();
    });
    wrap.appendChild(btn);
  });

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.textContent = 'Todos';
  allBtn.className = state.dashboardUserFilter === 'all' ? 'active' : '';
  allBtn.addEventListener('click', () => {
    state.dashboardUserFilter = 'all';
    renderProfileSwitch();
    loadReports();
  });
  wrap.appendChild(allBtn);
}

function updateActiveUserLabel() {
  const user = state.users.find((u) => u.id === state.activeUserId);
  const label = document.getElementById('active-user-label');
  if (label) label.textContent = user?.name || '—';
}

// Aplica el filtro de perfil del dashboard; 'all' deja pasar todo
function matchesUserFilter(userId) {
  return state.dashboardUserFilter === 'all' || userId === state.activeUserId;
}

async function startApp() {
  document.getElementById('view-app').classList.remove('hidden');
  renderProfileSwitch();
  updateActiveUserLabel();
  await loadCategories();
  await loadRecentExpenses();
  await loadReports();
}

// ---------- Tabs ----------

function setupTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`view-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ---------- Categorías ----------

// "Gastos diarios" es la categoría que más se usa: va primero para que sea
// la opción seleccionada por defecto en el desplegable de registro (antes
// caía "Boda" por delante, siendo alfabético y la que menos se usa).
const DEFAULT_FIRST_CATEGORY = 'Gastos diarios';

function sortCategoriesForDefault(categories) {
  return [...categories].sort((a, b) => {
    if (a.name === DEFAULT_FIRST_CATEGORY) return -1;
    if (b.name === DEFAULT_FIRST_CATEGORY) return 1;
    return a.name.localeCompare(b.name);
  });
}

async function loadCategories() {
  const { data, error } = await db
    .from('expense_categories')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error cargando categorías', error);
    return;
  }

  // state.categories se queda alfabético: lo usan los chips de Reportes.
  // El desplegable de registro usa su propio orden (Gastos diarios primero).
  state.categories = data || [];

  document.getElementById('expense-category').innerHTML = sortCategoriesForDefault(state.categories)
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join('');

  renderCategoryChips();
  renderCategoryList();
}

// Chips de filtro por categoría (dashboard): tocar activa/desactiva
function renderCategoryChips() {
  const wrap = document.getElementById('category-chips');
  const allActive = state.selectedCats.size === 0;
  wrap.innerHTML = '';

  const addChip = (label, active, onClick, categoryId) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `chip${active ? ' active' : ''}`;
    btn.textContent = label;
    if (categoryId) btn.dataset.categoryId = categoryId;
    btn.addEventListener('click', onClick);
    wrap.appendChild(btn);
  };

  addChip('Todas', allActive, () => {
    state.selectedCats.clear();
    renderCategoryChips();
    loadReports();
  });

  state.categories.forEach((c) => {
    addChip(c.name, state.selectedCats.has(c.id), () => {
      if (state.selectedCats.has(c.id)) {
        state.selectedCats.delete(c.id);
      } else {
        state.selectedCats.add(c.id);
      }
      // seleccionarlas todas equivale a no filtrar
      if (state.selectedCats.size === state.categories.length) {
        state.selectedCats.clear();
      }
      renderCategoryChips();
      loadReports();
    }, c.id);
  });
}

// Pinta cada chip de categoría según su % de presupuesto consumido (mismos
// datos que ya calcula renderBudgetComparison, sin volver a consultar la BD)
function updateCategoryChipStatus(rows) {
  const statusByCategory = {};
  rows.forEach((r) => {
    if (!r.categoryId || r.planned <= 0) return;
    const pct = (r.spent / r.planned) * 100;
    statusByCategory[r.categoryId] = pct > 100 ? 'over' : pct >= BUDGET_WARNING_THRESHOLD ? 'warning' : 'ok';
  });

  document.querySelectorAll('#category-chips .chip[data-category-id]').forEach((chip) => {
    chip.classList.remove('chip-warning', 'chip-over');
    const status = statusByCategory[chip.dataset.categoryId];
    if (status === 'warning') chip.classList.add('chip-warning');
    if (status === 'over') chip.classList.add('chip-over');
  });
}

// ---------- Gestión de categorías (pestaña Categorías) ----------

function setupCategoryForm() {
  const form = document.getElementById('category-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('new-category-name');
    const messageEl = document.getElementById('category-message');
    const name = input.value.trim();
    if (!name) return;

    const exists = state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      showMessage(messageEl, `Ya existe una categoría llamada "${name}".`, 'error');
      return;
    }

    const submitBtn = form.querySelector('button');
    submitBtn.disabled = true;
    const { error } = await db.from('expense_categories').insert({ name });
    submitBtn.disabled = false;

    if (error) {
      showMessage(messageEl, `Error al crear la categoría: ${error.message}`, 'error');
      return;
    }

    showMessage(
      messageEl,
      `Categoría "${name}" creada. Recuerda añadir su presupuesto por persona en Supabase si quieres que aparezca en el gráfico de Reportes.`,
      'success'
    );
    form.reset();
    await loadCategories();
    renderCategoryList();
  });
}

function renderCategoryList() {
  const list = document.getElementById('category-list');
  list.innerHTML = '';

  if (state.categories.length === 0) {
    list.innerHTML = '<li class="muted">Sin categorías todavía.</li>';
    return;
  }

  state.categories.forEach((c) => {
    const li = document.createElement('li');
    li.dataset.categoryId = c.id;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'category-name';
    nameSpan.textContent = c.name;

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'category-edit-btn';
    editBtn.textContent = '✎';
    editBtn.setAttribute('aria-label', `Renombrar ${c.name}`);
    editBtn.addEventListener('click', () => startCategoryRename(li, c));

    li.appendChild(nameSpan);
    li.appendChild(editBtn);
    list.appendChild(li);
  });
}

function startCategoryRename(li, category) {
  const messageEl = document.getElementById('category-message');
  li.innerHTML = '';

  const row = document.createElement('div');
  row.className = 'category-edit-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = category.name;

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Guardar';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-ghost';
  cancelBtn.textContent = 'Cancelar';

  saveBtn.addEventListener('click', async () => {
    const newName = input.value.trim();
    if (!newName) return;

    const duplicate = state.categories.some(
      (c) => c.id !== category.id && c.name.toLowerCase() === newName.toLowerCase()
    );
    if (duplicate) {
      showMessage(messageEl, `Ya existe una categoría llamada "${newName}".`, 'error');
      return;
    }

    saveBtn.disabled = true;
    const { error } = await db.from('expense_categories').update({ name: newName }).eq('id', category.id);
    saveBtn.disabled = false;

    if (error) {
      showMessage(messageEl, `Error al renombrar: ${error.message}`, 'error');
      return;
    }

    showMessage(messageEl, `Categoría renombrada a "${newName}".`, 'success');
    await loadCategories();
    renderCategoryList();
    await loadReports();
  });

  cancelBtn.addEventListener('click', () => renderCategoryList());

  row.appendChild(input);
  row.appendChild(saveBtn);
  row.appendChild(cancelBtn);
  li.appendChild(row);
  input.focus();
}

// ---------- Registro de gastos ----------

function setupExpenseForm() {
  const form = document.getElementById('expense-form');
  document.getElementById('expense-date').value = todayISO();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('expense-message');
    const submitBtn = form.querySelector('button');

    const payload = {
      date: document.getElementById('expense-date').value,
      amount: parseFloat(document.getElementById('expense-amount').value),
      category_id: document.getElementById('expense-category').value,
      payment_method: document.getElementById('expense-payment-method').value,
      provider: document.getElementById('expense-provider').value.trim() || null,
      description: document.getElementById('expense-description').value.trim() || null,
      user_id: state.activeUserId,
    };

    submitBtn.disabled = true;
    const { error } = await db.from('expenses').insert(payload);
    submitBtn.disabled = false;

    if (error) {
      showMessage(messageEl, `Error al guardar: ${error.message}`, 'error');
      return;
    }

    showMessage(messageEl, 'Gasto guardado correctamente.', 'success');
    form.reset();
    document.getElementById('expense-date').value = todayISO();
    document.getElementById('expense-extra').open = false;
    await loadRecentExpenses();
    await loadReports();
    await checkBudgetWarning(payload.category_id);
  });
}

// Rango del mes natural en curso (independiente del mes que se esté
// viendo en Reportes: el aviso siempre habla de "este mes").
function currentMonthRange() {
  const now = new Date();
  return {
    from: toLocalISO(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toLocalISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

// Tras guardar un gasto, avisa si esa categoría (para el perfil activo)
// llega al 80% de su presupuesto mensual, antes de que se exceda del todo.
async function checkBudgetWarning(categoryId) {
  const el = document.getElementById('budget-warning-message');
  el.classList.add('hidden');
  if (!categoryId) return;

  const { data: budgetRow, error: budgetError } = await db
    .from('budget_items')
    .select('planned_amount')
    .eq('user_id', state.activeUserId)
    .eq('category_id', categoryId)
    .maybeSingle();

  if (budgetError || !budgetRow || Number(budgetRow.planned_amount) <= 0) return;

  const { from, to } = currentMonthRange();
  const { data: monthExpenses, error: expensesError } = await db
    .from('expenses')
    .select('amount')
    .eq('user_id', state.activeUserId)
    .eq('category_id', categoryId)
    .gte('date', from)
    .lte('date', to);

  if (expensesError) return;

  const spent = (monthExpenses || []).reduce((sum, e) => sum + Number(e.amount), 0);
  const planned = Number(budgetRow.planned_amount);
  const pct = (spent / planned) * 100;
  const categoryName = state.categories.find((c) => c.id === categoryId)?.name || 'esta categoría';

  if (pct > 100) {
    showMessage(
      el,
      `Has superado el presupuesto mensual de "${categoryName}": ${formatCurrency(spent)} de ${formatCurrency(planned)} (${pct.toFixed(0)}%).`,
      'error'
    );
  } else if (pct >= BUDGET_WARNING_THRESHOLD) {
    showMessage(
      el,
      `Vas por el ${pct.toFixed(0)}% del presupuesto mensual de "${categoryName}" (${formatCurrency(spent)} de ${formatCurrency(planned)}).`,
      'warning'
    );
  }
}

async function loadRecentExpenses() {
  const { data, error } = await db
    .from('expenses')
    .select('id, date, amount, description, provider, payment_method, expense_categories(name), app_users(name)')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(15);

  if (error) {
    console.error('Error cargando gastos recientes', error);
    return;
  }

  renderExpensesTable(document.querySelector('#recent-expenses-table tbody'), data, { deletable: true });
}

function renderExpensesTable(tbody, rows, { deletable = false } = {}) {
  tbody.innerHTML = '';
  if (!rows || rows.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="${deletable ? 8 : 7}" class="muted">Sin datos</td>`;
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const categoryName = row.expense_categories?.name || '(sin categoría)';
    const userName = row.app_users?.name || 'Sin asignar';
    tr.innerHTML = `
      <td>${row.date}</td>
      <td>${categoryName}</td>
      <td>${formatCurrency(row.amount)}</td>
      <td>${row.payment_method}</td>
      <td>${row.provider || ''}</td>
      <td>${row.description || ''}</td>
      <td>${userName}</td>
      ${deletable ? `<td><button class="link-btn danger" data-delete-id="${row.id}">Borrar</button></td>` : ''}
    `;
    tbody.appendChild(tr);
  });

  if (deletable) {
    tbody.querySelectorAll('[data-delete-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Borrar este gasto?')) return;
        const { error } = await db.from('expenses').delete().eq('id', btn.dataset.deleteId);
        if (error) {
          alert(`Error al borrar: ${error.message}`);
          return;
        }
        await loadRecentExpenses();
        await loadReports();
      });
    });
  }
}

// ---------- Reportes ----------

// Rango de fechas activo: mes visible o rango personalizado
function currentRange() {
  if (state.rangeMode === 'custom') {
    return { from: state.customFrom, to: state.customTo };
  }
  const y = state.reportMonth.getFullYear();
  const m = state.reportMonth.getMonth();
  return {
    from: toLocalISO(new Date(y, m, 1)),
    to: toLocalISO(new Date(y, m + 1, 0)),
  };
}

function updateRangeUI() {
  const label = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })
    .format(state.reportMonth);
  document.getElementById('month-label').textContent =
    label.charAt(0).toUpperCase() + label.slice(1);

  const custom = state.rangeMode === 'custom';
  document.getElementById('clear-range').classList.toggle('hidden', !custom);
  document.querySelector('.month-nav').classList.toggle('inactive', custom);
}

function shiftMonth(delta) {
  const y = state.reportMonth.getFullYear();
  const m = state.reportMonth.getMonth();
  state.reportMonth = new Date(y, m + delta, 1);
  state.rangeMode = 'month';
  updateRangeUI();
  loadReports();
}

function setupReportFilters() {
  document.getElementById('month-prev').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('month-next').addEventListener('click', () => shiftMonth(1));

  document.getElementById('apply-range').addEventListener('click', () => {
    const from = document.getElementById('report-date-from').value;
    const to = document.getElementById('report-date-to').value;
    if (!from || !to) return;
    state.rangeMode = 'custom';
    state.customFrom = from;
    state.customTo = to;
    updateRangeUI();
    loadReports();
  });

  document.getElementById('clear-range').addEventListener('click', () => {
    state.rangeMode = 'month';
    document.getElementById('custom-range').open = false;
    updateRangeUI();
    loadReports();
  });

  // prellenar el rango personalizado con el mes actual
  const { from, to } = currentRange();
  document.getElementById('report-date-from').value = from;
  document.getElementById('report-date-to').value = to;
}

// Aplica el filtro de chips; con el set vacío pasa todo
function matchesCategoryFilter(categoryId) {
  return state.selectedCats.size === 0 || state.selectedCats.has(categoryId);
}

async function loadReports() {
  const { from, to } = currentRange();

  let query = db
    .from('expenses')
    .select('id, date, amount, description, provider, payment_method, category_id, user_id, expense_categories(name), app_users(name)')
    .order('date', { ascending: false });

  if (from) query = query.gte('date', from);
  if (to) query = query.lte('date', to);

  const { data: allExpenses, error: expensesError } = await query;

  if (expensesError) {
    console.error('Error cargando gastos filtrados', expensesError);
    return;
  }

  const { data: allBudgetItems, error: budgetError } = await db
    .from('budget_items')
    .select('category_id, user_id, planned_amount, expense_categories(name)');

  if (budgetError) {
    console.error('Error cargando presupuesto', budgetError);
    return;
  }

  // El filtro de categorías y el de perfil (Rosa/Jaime/Todos) se aplican
  // juntos a KPIs, gráfico y tablas.
  const expenses = (allExpenses || []).filter(
    (e) => matchesCategoryFilter(e.category_id) && matchesUserFilter(e.user_id)
  );
  const budgetItems = (allBudgetItems || []).filter(
    (b) => matchesCategoryFilter(b.category_id) && matchesUserFilter(b.user_id)
  );

  renderExpensesTable(document.querySelector('#filtered-expenses-table tbody'), expenses, { deletable: false });
  renderKPIs(budgetItems, expenses);
  renderBudgetComparison(budgetItems, expenses);
  await loadMonthlyTrend();
}

function renderKPIs(budgetItems, expenses) {
  const spent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const planned = budgetItems.reduce((sum, b) => sum + Number(b.planned_amount), 0);
  const pct = planned > 0 ? (spent / planned) * 100 : null;
  const savings = planned - spent;

  document.getElementById('kpi-total').textContent = formatCurrency(spent);

  const pctEl = document.getElementById('kpi-percent');
  pctEl.textContent = pct === null ? '—' : `${pct.toLocaleString('es-ES', { maximumFractionDigits: 0 })}%`;
  pctEl.className = `kpi-value ${pct !== null && pct > 100 ? 'negative' : 'positive'}`;

  document.getElementById('kpi-planned-sub').textContent =
    planned > 0 ? `de ${formatCurrency(planned)} planificados` : 'sin presupuesto definido';

  const savEl = document.getElementById('kpi-savings');
  savEl.textContent = formatCurrency(savings);
  savEl.className = `kpi-value ${savings < 0 ? 'negative' : 'positive'}`;
}

function renderBudgetComparison(budgetItems, expenses) {
  const spentByCategory = {};
  expenses.forEach((e) => {
    const key = e.category_id || 'none';
    spentByCategory[key] = (spentByCategory[key] || 0) + Number(e.amount);
  });

  // Con "Todos" hay 2 filas de presupuesto por categoría (Rosa + Jaime):
  // se agrupan y suman en una sola fila por categoría, no se listan aparte.
  const plannedByCategory = {};
  budgetItems.forEach((b) => {
    const key = b.category_id || 'none';
    if (!plannedByCategory[key]) {
      plannedByCategory[key] = { name: b.expense_categories?.name || '(sin categoría)', planned: 0 };
    }
    plannedByCategory[key].planned += Number(b.planned_amount);
  });

  const rows = Object.entries(plannedByCategory).map(([categoryId, v]) => ({
    categoryId,
    name: v.name,
    planned: v.planned,
    spent: spentByCategory[categoryId] || 0,
  }));

  rows.sort((a, b) => a.name.localeCompare(b.name));

  const tbody = document.querySelector('#budget-table tbody');
  tbody.innerHTML = '';
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Sin datos de presupuesto</td></tr>';
  } else {
    rows.forEach((r) => {
      const diff = r.planned - r.spent;
      const pct = r.planned > 0 ? (r.spent / r.planned) * 100 : 0;
      const spentClass = pct > 100 ? 'negative' : pct >= BUDGET_WARNING_THRESHOLD ? 'warning-text' : 'positive';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.name}</td>
        <td>${formatCurrency(r.planned)}</td>
        <td class="${spentClass}">${formatCurrency(r.spent)}</td>
        <td class="${diff < 0 ? 'negative' : 'positive'}">${formatCurrency(diff)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderBudgetChart(rows);
  updateCategoryChipStatus(rows);
}

function renderBudgetChart(rows) {
  const ctx = document.getElementById('budget-chart');

  if (state.budgetChart) {
    state.budgetChart.destroy();
  }

  const barColors = rows.map((r) => {
    if (r.planned <= 0) return CHART_COLORS.good;
    const pct = (r.spent / r.planned) * 100;
    if (pct > 100) return CHART_COLORS.over;
    if (pct >= BUDGET_WARNING_THRESHOLD) return CHART_COLORS.warning;
    return CHART_COLORS.good;
  });

  state.budgetChart = new Chart(ctx, {
    data: {
      labels: rows.map((r) => r.name),
      datasets: [
        {
          type: 'line',
          label: 'Planificado',
          order: 0, // dibujada encima de las columnas
          data: rows.map((r) => r.planned),
          borderColor: CHART_COLORS.plan,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: CHART_COLORS.plan,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          fill: false,
        },
        {
          type: 'bar',
          label: 'Gastado',
          order: 1,
          data: rows.map((r) => r.spent),
          backgroundColor: barColors,
          maxBarThickness: 24,
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'start',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // la altura la fija .chart-wrap
      plugins: {
        legend: { display: false }, // leyenda propia en HTML sobre el gráfico
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: ${formatCurrency(c.parsed.y)}`,
            afterBody: (items) => {
              const r = rows[items[0].dataIndex];
              return `Diferencia: ${formatCurrency(r.planned - r.spent)}`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: CHART_COLORS.grid },
          ticks: {
            callback: (v) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(v)} €`,
          },
        },
        x: {
          grid: { display: false },
          ticks: { autoSkip: false, maxRotation: 60 },
        },
      },
    },
  });
}

// ---------- Evolución mensual (gráfico de línea, año completo) ----------

function updateTrendYearLabel() {
  document.getElementById('trend-year-label').textContent = String(state.trendYear);
}

function setupTrendNav() {
  document.getElementById('trend-year-prev').addEventListener('click', () => {
    state.trendYear -= 1;
    updateTrendYearLabel();
    loadMonthlyTrend();
  });
  document.getElementById('trend-year-next').addEventListener('click', () => {
    state.trendYear += 1;
    updateTrendYearLabel();
    loadMonthlyTrend();
  });
  updateTrendYearLabel();
}

// Respeta los mismos filtros de categoría/perfil que el resto del dashboard,
// pero ignora el mes/rango seleccionado arriba: siempre mira el año entero.
async function loadMonthlyTrend() {
  const from = `${state.trendYear}-01-01`;
  const to = `${state.trendYear}-12-31`;

  const { data, error } = await db
    .from('expenses')
    .select('date, amount, category_id, user_id')
    .gte('date', from)
    .lte('date', to);

  if (error) {
    console.error('Error cargando evolución mensual', error);
    return;
  }

  const totalsByMonth = Array(12).fill(0);
  (data || [])
    .filter((e) => matchesCategoryFilter(e.category_id) && matchesUserFilter(e.user_id))
    .forEach((e) => {
      const monthIndex = Number(e.date.slice(5, 7)) - 1; // string directo: sin líos de zona horaria
      totalsByMonth[monthIndex] += Number(e.amount);
    });

  renderTrendChart(totalsByMonth);
}

function renderTrendChart(totalsByMonth) {
  const ctx = document.getElementById('trend-chart');

  if (state.trendChart) {
    state.trendChart.destroy();
  }

  state.trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: MONTH_LABELS,
      datasets: [
        {
          label: 'Gasto total',
          data: totalsByMonth,
          borderColor: CHART_COLORS.trendLine,
          backgroundColor: CHART_COLORS.trendFill,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: CHART_COLORS.trendLine,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          fill: true,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }, // una sola serie: el título de la tarjeta ya dice qué es
        tooltip: {
          callbacks: {
            label: (c) => formatCurrency(c.parsed.y),
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: CHART_COLORS.grid },
          ticks: {
            callback: (v) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(v)} €`,
          },
        },
        x: {
          grid: { display: false },
        },
      },
    },
  });
}

// ---------- Init ----------

document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupExpenseForm();
  setupReportFilters();
  setupTrendNav();
  setupCategoryForm();
  updateRangeUI();

  await loadUsers();
  if (resolveIdentity()) {
    await startApp();
  } else {
    showProfileGate();
  }
});
