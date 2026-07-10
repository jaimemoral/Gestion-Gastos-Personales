// Gestión de Gastos Personales — lógica de la app
// Requiere config.js cargado antes (SUPABASE_URL, SUPABASE_ANON_KEY)
// Sin autenticación: la app carga directamente; el acceso a datos lo permite
// la política RLS para el rol anon (ver sql/02_acceso_abierto.sql).

const state = {
  categories: [],
  budgetChart: null,
  reportMonth: new Date(),      // mes visible en el dashboard
  rangeMode: 'month',           // 'month' | 'custom'
  customFrom: null,
  customTo: null,
  selectedCats: new Set(),      // ids de categoría filtradas; vacío = todas
};

// Colores del gráfico (validados para contraste y daltonismo)
const CHART_COLORS = {
  good: '#0ca30c',   // gasto dentro de presupuesto
  over: '#d03b3b',   // presupuesto excedido
  plan: '#52514e',   // línea de planificado
  grid: '#e7ebf2',
};

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

async function loadCategories() {
  const { data, error } = await db
    .from('expense_categories')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error cargando categorías', error);
    return;
  }

  state.categories = data || [];

  document.getElementById('expense-category').innerHTML = state.categories
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join('');

  renderCategoryChips();
}

// Chips de filtro por categoría (dashboard): tocar activa/desactiva
function renderCategoryChips() {
  const wrap = document.getElementById('category-chips');
  const allActive = state.selectedCats.size === 0;
  wrap.innerHTML = '';

  const addChip = (label, active, onClick) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `chip${active ? ' active' : ''}`;
    btn.textContent = label;
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
    });
  });
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
  });
}

async function loadRecentExpenses() {
  const { data, error } = await db
    .from('expenses')
    .select('id, date, amount, description, provider, payment_method, expense_categories(name)')
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
    tr.innerHTML = `<td colspan="${deletable ? 7 : 6}" class="muted">Sin datos</td>`;
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const categoryName = row.expense_categories?.name || '(sin categoría)';
    tr.innerHTML = `
      <td>${row.date}</td>
      <td>${categoryName}</td>
      <td>${formatCurrency(row.amount)}</td>
      <td>${row.payment_method}</td>
      <td>${row.provider || ''}</td>
      <td>${row.description || ''}</td>
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
    .select('id, date, amount, description, provider, payment_method, category_id, expense_categories(name)')
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
    .select('category_id, planned_amount, expense_categories(name)');

  if (budgetError) {
    console.error('Error cargando presupuesto', budgetError);
    return;
  }

  // El filtro de categorías se aplica a KPIs, gráfico y tablas
  const expenses = (allExpenses || []).filter((e) => matchesCategoryFilter(e.category_id));
  const budgetItems = (allBudgetItems || []).filter((b) => matchesCategoryFilter(b.category_id));

  renderExpensesTable(document.querySelector('#filtered-expenses-table tbody'), expenses, { deletable: false });
  renderKPIs(budgetItems, expenses);
  renderBudgetComparison(budgetItems, expenses);
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

  const rows = budgetItems.map((b) => ({
    name: b.expense_categories?.name || '(sin categoría)',
    planned: Number(b.planned_amount),
    spent: spentByCategory[b.category_id] || 0,
  }));

  rows.sort((a, b) => a.name.localeCompare(b.name));

  const tbody = document.querySelector('#budget-table tbody');
  tbody.innerHTML = '';
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Sin datos de presupuesto</td></tr>';
  } else {
    rows.forEach((r) => {
      const diff = r.planned - r.spent;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.name}</td>
        <td>${formatCurrency(r.planned)}</td>
        <td>${formatCurrency(r.spent)}</td>
        <td class="${diff < 0 ? 'negative' : 'positive'}">${formatCurrency(diff)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderBudgetChart(rows);
}

function renderBudgetChart(rows) {
  const ctx = document.getElementById('budget-chart');

  if (state.budgetChart) {
    state.budgetChart.destroy();
  }

  const barColors = rows.map((r) => (r.spent > r.planned ? CHART_COLORS.over : CHART_COLORS.good));

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

// ---------- Init ----------

document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupExpenseForm();
  setupReportFilters();
  updateRangeUI();
  await loadCategories();
  await loadRecentExpenses();
  await loadReports();
});
