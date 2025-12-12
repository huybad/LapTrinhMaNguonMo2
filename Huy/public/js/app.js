// public/js/app.js - Frontend Logic (Nâng cao) - Phần 1

// ============= CONFIG =============
const API_URL = '/api';
const TOKEN_KEY = 'expense_tracker_token';


// ============= STATE =============
let currentUser = null;
let allTransactions = [];
let currentPage = 1;
let totalPages = 1;
let filters = {
  type: 'all',
  category: 'all',
  startDate: '',
  endDate: '',
  search: '',
  sort: '-date'
};

// ============= UTILITY FUNCTIONS =============
function formatMoney(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function showLoading() {
  document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 25px;
    background: ${type === 'success' ? '#10b981' : '#ef4444'};
    color: white;
    border-radius: 10px;
    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: slideIn 0.3s ease;
    max-width: 300px;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ============= TOKEN MANAGEMENT =============
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ============= API CALLS =============
async function apiCall(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        logout();
        throw new Error('Phiên đăng nhập đã hết hạn');
      }
      throw new Error(data.message || 'Có lỗi xảy ra');
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// ============= AUTHENTICATION =============
function showLogin(e) {
  if (e) e.preventDefault();
  document.getElementById('loginForm').classList.add('active');
  document.getElementById('registerForm').classList.remove('active');
}

function showRegister(e) {
  if (e) e.preventDefault();
  document.getElementById('registerForm').classList.add('active');
  document.getElementById('loginForm').classList.remove('active');
}

// Login
document.getElementById('loginFormElement').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    showLoading();
    const data = await apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    setToken(data.token);
    currentUser = data.user;
    
    showNotification(data.message);
    showApp();
    
  } catch (error) {
    showNotification(error.message, 'error');
  } finally {
    hideLoading();
  }
});

// Register
document.getElementById('registerFormElement').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  const confirmPassword = document.getElementById('registerConfirmPassword').value;

  if (password !== confirmPassword) {
    showNotification('Mật khẩu không khớp', 'error');
    return;
  }

  try {
    showLoading();
    const data = await apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });

    setToken(data.token);
    currentUser = data.user;
    
    showNotification(data.message);
    showApp();
    
  } catch (error) {
    showNotification(error.message, 'error');
  } finally {
    hideLoading();
  }
});

// Logout
function logout() {
  removeToken();
  currentUser = null;
  document.getElementById('authContainer').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
  showNotification('Đã đăng xuất');
}

// Show App
function showApp() {
  document.getElementById('authContainer').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';
  document.getElementById('userName').textContent = currentUser.name;
  
  // Set default date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('date').value = today;
  
  // Load data
  loadTransactions();
  loadStatistics();
  loadCategoryFilter();
}

// Check Auth on load
async function checkAuth() {
  const token = getToken();
  if (!token) {
    document.getElementById('authContainer').style.display = 'flex';
    return;
  }

  try {
    showLoading();
    const data = await apiCall('/auth/me');
    currentUser = data.data;
    showApp();
  } catch (error) {
    removeToken();
    document.getElementById('authContainer').style.display = 'flex';
  } finally {
    hideLoading();
  }
}

// ============= INITIALIZE =============
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  
  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
});

// public/js/app.js - Phần 2: Transactions, Filters, Charts & Export

// ============= LOAD TRANSACTIONS =============
async function loadTransactions(page = 1) {
  try {
    showLoading();
    
    const params = new URLSearchParams({
      page,
      limit: 10,
      sort: filters.sort
    });

    if (filters.type !== 'all') params.append('type', filters.type);
    if (filters.category !== 'all') params.append('category', filters.category);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.search) params.append('search', filters.search);

    const data = await apiCall(`/transactions?${params}`);
    
    allTransactions = data.data;
    currentPage = data.page;
    totalPages = data.pages;
    
    displayTransactions(allTransactions);
    displayPagination();
    
  } catch (error) {
    showNotification(error.message, 'error');
  } finally {
    hideLoading();
  }
}

// ============= DISPLAY TRANSACTIONS =============
function displayTransactions(transactions) {
  const list = document.getElementById('transactionList');
  const emptyState = document.getElementById('emptyState');

  if (transactions.length === 0) {
    list.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  list.style.display = 'block';
  emptyState.style.display = 'none';

  list.innerHTML = transactions.map(t => `
    <div class="transaction-item ${t.type}">
      <div class="transaction-type-badge ${t.type}">
        ${t.type === 'thu' ? '+' : '-'}
      </div>
      
      <div class="transaction-info">
        <div class="transaction-category">${t.category}</div>
        <div class="transaction-description">${t.description}</div>
        <div class="transaction-date">📅 ${formatDate(t.date)}</div>
      </div>
      
      <div class="transaction-amount ${t.type}">
        ${t.type === 'thu' ? '+' : '-'}${formatMoney(t.amount)}
      </div>
      
      <div class="transaction-actions">
        <button class="btn btn-edit" onclick="editTransaction('${t._id}')">
          ✏️ Sửa
        </button>
        <button class="btn btn-delete" onclick="deleteTransaction('${t._id}')">
          🗑️ Xóa
        </button>
      </div>
    </div>
  `).join('');
}

// ============= PAGINATION =============
function displayPagination() {
  const pagination = document.getElementById('pagination');
  
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  pagination.innerHTML = `
    <button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
      ← Trước
    </button>
    <span class="page-info">Trang ${currentPage} / ${totalPages}</span>
    <button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
      Sau →
    </button>
  `;
}

function changePage(page) {
  if (page < 1 || page > totalPages) return;
  loadTransactions(page);
}

// ============= LOAD STATISTICS =============
async function loadStatistics() {
  try {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const data = await apiCall(`/transactions/stats/summary?${params}`);
    const stats = data.data;

    document.getElementById('totalIncome').textContent = formatMoney(stats.income);
    document.getElementById('totalExpense').textContent = formatMoney(stats.expense);
    document.getElementById('balance').textContent = formatMoney(stats.balance);

    // Load charts
    await loadCharts();
    
  } catch (error) {
    console.error('Error loading statistics:', error);
  }
}

// ============= LOAD CATEGORY FILTER =============
function loadCategoryFilter() {
  const categories = [
    'Ăn uống', 'Di chuyển', 'Mua sắm', 'Giải trí', 
    'Học tập', 'Sức khỏe', 'Nhà cửa', 'Lương', 
    'Thưởng', 'Đầu tư', 'Kinh doanh', 'Khác'
  ];

  const select = document.getElementById('filterCategory');
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    select.appendChild(option);
  });
}

// ============= FILTERS =============
function applyFilters() {
  filters.type = document.getElementById('filterType').value;
  filters.category = document.getElementById('filterCategory').value;
  filters.startDate = document.getElementById('filterStartDate').value;
  filters.endDate = document.getElementById('filterEndDate').value;
  
  currentPage = 1;
  loadTransactions(1);
  loadStatistics();
}

function resetFilters() {
  filters = {
    type: 'all',
    category: 'all',
    startDate: '',
    endDate: '',
    search: '',
    sort: '-date'
  };
  
  document.getElementById('filterType').value = 'all';
  document.getElementById('filterCategory').value = 'all';
  document.getElementById('filterStartDate').value = '';
  document.getElementById('filterEndDate').value = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('sortBy').value = '-date';
  
  loadTransactions(1);
  loadStatistics();
}

function applySorting() {
  filters.sort = document.getElementById('sortBy').value;
  loadTransactions(currentPage);
}

// Search with debounce
let searchTimeout;
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    filters.search = e.target.value;
    loadTransactions(1);
  }, 500);
});

// ============= TRANSACTION FORM =============
let currentEditId = null;

document.getElementById('transactionForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = {
    type: document.getElementById('type').value,
    category: document.getElementById('category').value,
    amount: parseFloat(document.getElementById('amount').value),
    description: document.getElementById('description').value,
    date: document.getElementById('date').value
  };

  try {
    showLoading();

    if (currentEditId) {
      await apiCall(`/transactions/${currentEditId}`, {
        method: 'PUT',
        body: JSON.stringify(formData)
      });
      showNotification('Cập nhật giao dịch thành công');
    } else {
      await apiCall('/transactions', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      showNotification('Thêm giao dịch thành công');
    }

    resetForm();
    loadTransactions(currentPage);
    loadStatistics();
    
  } catch (error) {
    showNotification(error.message, 'error');
  } finally {
    hideLoading();
  }
});

async function editTransaction(id) {
  try {
    const data = await apiCall(`/transactions/${id}`);
    const transaction = data.data;

    currentEditId = id;
    document.getElementById('type').value = transaction.type;
    document.getElementById('category').value = transaction.category;
    document.getElementById('amount').value = transaction.amount;
    document.getElementById('description').value = transaction.description;
    document.getElementById('date').value = transaction.date.split('T')[0];

    document.getElementById('formTitle').textContent = 'Chỉnh Sửa Giao Dịch';
    document.getElementById('submitBtn').textContent = '💾 Cập Nhật';
    document.getElementById('cancelBtn').style.display = 'inline-flex';

    document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

async function deleteTransaction(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa giao dịch này?')) return;

  try {
    showLoading();
    await apiCall(`/transactions/${id}`, { method: 'DELETE' });
    showNotification('Xóa giao dịch thành công');
    loadTransactions(currentPage);
    loadStatistics();
  } catch (error) {
    showNotification(error.message, 'error');
  } finally {
    hideLoading();
  }
}

function resetForm() {
  document.getElementById('transactionForm').reset();
  currentEditId = null;
  document.getElementById('formTitle').textContent = 'Thêm Giao Dịch Mới';
  document.getElementById('submitBtn').textContent = '➕ Thêm Giao Dịch';
  document.getElementById('cancelBtn').style.display = 'none';
  
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('date').value = today;
}

// ============= CHARTS =============
let monthlyChart = null;
let categoryChart = null;

async function loadCharts() {
  try {
    // Monthly Chart
    const year = new Date().getFullYear();
    const monthlyData = await apiCall(`/transactions/stats/monthly?year=${year}`);
    renderMonthlyChart(monthlyData.data);

    // Category Chart
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    const categoryData = await apiCall(`/transactions/stats/category?${params}`);
    renderCategoryChart(categoryData.data);
    
  } catch (error) {
    console.error('Error loading charts:', error);
  }
}

function renderMonthlyChart(data) {
  const ctx = document.getElementById('monthlyChart');
  if (!ctx) return;

  // Process data
  const months = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
  const income = new Array(12).fill(0);
  const expense = new Array(12).fill(0);

  data.forEach(item => {
    const monthIndex = item._id.month - 1;
    if (item._id.type === 'thu') {
      income[monthIndex] = item.total;
    } else {
      expense[monthIndex] = item.total;
    }
  });

  if (monthlyChart) monthlyChart.destroy();

  monthlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Thu nhập',
          data: income,
          backgroundColor: 'rgba(16, 185, 129, 0.7)',
          borderColor: 'rgb(16, 185, 129)',
          borderWidth: 2
        },
        {
          label: 'Chi tiêu',
          data: expense,
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          borderColor: 'rgb(239, 68, 68)',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return new Intl.NumberFormat('vi-VN').format(value) + 'đ';
            }
          }
        }
      }
    }
  });
}

function renderCategoryChart(data) {
  const ctx = document.getElementById('categoryChart');
  if (!ctx) return;

  // Process expense data only
  const expenseData = data.filter(item => item._id.type === 'chi');
  const labels = expenseData.map(item => item._id.category);
  const amounts = expenseData.map(item => item.total);

  const colors = [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#6366f1'
  ];

  if (categoryChart) categoryChart.destroy();

  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: amounts,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'right',
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              return label + ': ' + formatMoney(value);
            }
          }
        }
      }
    }
  });
}

// ============= EXPORT FUNCTIONS =============
async function exportPDF() {
  try {
    showLoading();
    const params = new URLSearchParams();
    if (filters.type !== 'all') params.append('type', filters.type);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await fetch(`${API_URL}/export/pdf?${params}`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });

    if (!response.ok) throw new Error('Không thể xuất PDF');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();

    showNotification('Xuất PDF thành công');

  } catch (error) {
    showNotification(error.message, 'error');
  } finally {
    hideLoading();
  }
}

async function exportExcel() {
  try {
    showLoading();
    const params = new URLSearchParams();
    if (filters.type !== 'all') params.append('type', filters.type);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await fetch(`${API_URL}/export/excel?${params}`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });

    if (!response.ok) throw new Error('Không thể xuất Excel');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();

    showNotification('Xuất Excel thành công');

  } catch (error) {
    showNotification(error.message, 'error');
  } finally {
    hideLoading();
  }
}

