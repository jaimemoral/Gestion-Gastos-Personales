// Gestión de Gastos Personales — lógica de la app
// Requiere config.js cargado antes (SUPABASE_URL, SUPABASE_ANON_KEY)

const state = {
  categories: [],
  budgetChart: null,
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

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Utilidades ----------

function formatCurrency(value) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

function showMessage(el, text, type = 'info') {
  el.textContent = text;
  el.className = `message ${type}`;
  el.classList.remove('hidden');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Autenticación ----------

async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split('#')[0] },
  });
  return error;
}

function setupAuthUI() {
  const loginForm = document.getElementById('login-form');
  const loginMessage = document.getElementById('login-message');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const submitBtn = loginForm.querySelector('button');
    submitBtn.disabled = true;
    const error = await sendMagicLink(email);
    submitBtn.disabled = false;
    if (error) {
      showMessage(loginMessage, `Error: ${error.message}`, 'error');
    } else {
      showMessage(loginMessage, 'Revisa tu correo y haz clic en el enlace para acceder.', 'success');
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
  });
}

function showLoggedIn() {
  document.getElementById('view-login').classList.add('hidden');
  document.getElementById('view-app').classList.remove('hidden');
  document.getElementById('logout-btn').classList.remove('hidden');
}

function showLoggedOut() {
  document.getElementById('view-login').classList.remove('hidden');
  document.getElementById('view-app').classList.add('hidden');
  document.getElementById('logout-btn').classList.add('hidden');
}

async function initSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    showLoggedIn();
    await onLogin();
  } else {
    showLoggedOut();
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      showLoggedIn();
      await onLogin();
    } else {
      showLoggedOut();
    }
  });
}

async function onLogin() {
  await loadCategories();
  await loadRecentExpenses();
  setDefaultReportDates();
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

async function loadCategories() {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error cargando categorías', error);
    return;
  }

  state.categories = data || [];

  const expenseSelect = document.getElementById('expense-category');
  const reportSelect = document.getElementById('report-category');

  expenseSelect.innerHTML = state.categories
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join('');

  reportSelect.innerHTML =
    '<option value="">Todas</option>' +
    state.categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
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
    const { error } = await supabase.from('expenses').insert(payload);
    submitBtn.disabled = false;

    if (error) {
      showMessage(messageEl, `Error al guardar: ${error.message}`, 'error');
      return;
    }

    showMessage(messageEl, 'Gasto guardado correctamente.', 'success');
    form.reset();
    document.getElementById('expense-date').value = todayISO();
    await loadRecentExpenses();
    await loadReports();
  });
}

async function loadRecentExpenses() {
  const { data, error } = await supabase
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
        const { error } = await supabase.from('expenses').delete().eq('id', btn.dataset.deleteId);
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

function setDefaultReportDates() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  document.getElementById('report-date-from').value = firstOfMonth;
  document.getElementById('report-date-to').value = todayISO();
}

function setupReportFilters() {
  document.getElementById('report-filters').addEventListener('submit', async (e) => {
    e.preventDefault();
    await loadReports();
  });
}

async function loadReports() {
  const dateFrom = document.getElementById('report-date-from').value;
  const dateTo = document.getElementById('report-date-to').value;
  const categoryId = document.getElementById('report-category').value;

  let query = supabase
    .from('expenses')
    .select('id, date, amount, description, provider, payment_method, category_id, expense_categories(name)')
    .order('date', { ascending: false });

  if (dateFrom) query = query.gte('date', dateFrom);
  if (dateTo) query = query.lte('date', dateTo);
  if (categoryId) query = query.eq('category_id', categoryId);

  const { data: expenses, error: expensesError } = await query;

  if (expensesError) {
    console.error('Error cargando gastos filtrados', expensesError);
    return;
  }

  renderExpensesTable(document.querySelector('#filtered-expenses-table tbody'), expenses, { deletable: false });

  const { data: budgetItems, error: budgetError } = await supabase
    .from('budget_items')
    .select('category_id, planned_amount, expense_categories(name)');

  if (budgetError) {
    console.error('Error cargando presupuesto', budgetError);
    return;
  }

  renderBudgetComparison(budgetItems, expenses, categoryId);
}

function renderBudgetComparison(budgetItems, expenses, filterCategoryId) {
  const spentByCategory = {};
  expenses.forEach((e) => {
    const key = e.category_id || 'none';
    spentByCategory[key] = (spentByCategory[key] || 0) + Number(e.amount);
  });

  let rows = budgetItems
    .filter((b) => !filterCategoryId || b.category_id === filterCategoryId)
    .map((b) => ({
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

  state.budgetChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map((r) => r.name),
      datasets: [
        { label: 'Planificado', data: rows.map((r) => r.planned), backgroundColor: '#93c5fd' },
        { label: 'Gastado', data: rows.map((r) => r.spent), backgroundColor: '#f87171' },
      ],
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true } },
    },
  });
}

// ---------- Init ----------

document.addEventListener('DOMContentLoaded', () => {
  setupAuthUI();
  setupTabs();
  setupExpenseForm();
  setupReportFilters();
  initSession();
});
