const STORAGE_KEY = 'daily-todos-v1';
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const state = {
  tasks: [],
  filter: 'today',
  search: '',
};

const elements = {
  form: document.getElementById('task-form'),
  taskId: document.getElementById('task-id'),
  title: document.getElementById('task-title'),
  description: document.getElementById('task-description'),
  date: document.getElementById('task-date'),
  priority: document.getElementById('task-priority'),
  tags: document.getElementById('task-tags'),
  saveButton: document.getElementById('save-task'),
  resetButton: document.getElementById('reset-form'),
  exportButton: document.getElementById('export-button'),
  importInput: document.getElementById('import-input'),
  clearCompleted: document.getElementById('clear-completed'),
  search: document.getElementById('task-search'),
  filterButtons: Array.from(document.querySelectorAll('.filter-button')),
  taskList: document.getElementById('task-list'),
  emptyState: document.getElementById('empty-state'),
  summaryToday: document.getElementById('summary-today'),
  summaryPending: document.getElementById('summary-pending'),
  summaryCompleted: document.getElementById('summary-completed'),
  summaryOverdue: document.getElementById('summary-overdue'),
  template: document.getElementById('task-item-template'),
  confirmDialog: document.getElementById('confirm-dialog'),
  confirmMessage: document.getElementById('confirm-message'),
};

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
  weekday: 'short',
});

init();

function init() {
  state.tasks = loadTasks();
  bindEvents();
  render();
}

function bindEvents() {
  elements.form.addEventListener('submit', handleSubmit);
  elements.resetButton.addEventListener('click', () => {
    clearForm();
    elements.title.focus();
  });

  elements.filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      render();
    });
  });

  elements.search.addEventListener('input', (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderTasks();
  });

  elements.clearCompleted.addEventListener('click', async () => {
    const hasCompleted = state.tasks.some((task) => task.status === 'completed');
    if (!hasCompleted) {
      return;
    }
    const confirmed = await confirmAction(
      `确认删除 ${countCompleted()} 个已完成的任务吗？此操作不可撤销。`
    );
    if (confirmed) {
      state.tasks = state.tasks.filter((task) => task.status !== 'completed');
      persist();
      render();
    }
  });

  elements.exportButton.addEventListener('click', () => {
    const exportPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: state.tasks,
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `daily-todos-${formatDateInput(new Date())}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  });

  elements.importInput.addEventListener('change', async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.tasks)) {
        throw new Error('文件格式不正确');
      }
      const confirmed = await confirmAction('导入数据会覆盖当前列表，是否继续？');
      if (!confirmed) {
        return;
      }
      state.tasks = data.tasks.map(normalizeTask);
      persist();
      render();
    } catch (error) {
      alert(`导入失败：${error.message || error}`);
    } finally {
      elements.importInput.value = '';
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.task-actions')) {
      closeAllMenus();
    }
  });
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const samples = createSampleTasks();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
      return samples;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('数据格式异常');
    }
    return parsed.map(normalizeTask);
  } catch (error) {
    console.warn('读取任务失败，将使用示例任务。', error);
    const samples = createSampleTasks();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
    return samples;
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
}

function createSampleTasks() {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const afterTwoDays = addDays(today, 2);
  return [
    {
      id: generateId(),
      title: '梳理今日重点工作',
      description: '查看日历，整理会议、产出物和沟通事项，规划今日时间块。',
      dueDate: formatDateInput(today),
      priority: 'high',
      tags: ['工作', '规划'],
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      title: '午后健身或散步',
      description: '安排 30 分钟有氧运动，舒缓长时间久坐带来的疲劳。',
      dueDate: formatDateInput(tomorrow),
      priority: 'medium',
      tags: ['健康'],
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      title: '阅读行业资讯',
      description: '挑选 2~3 篇深度文章，记录灵感与行动要点。',
      dueDate: formatDateInput(afterTwoDays),
      priority: 'low',
      tags: ['学习'],
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  ];
}

function normalizeTask(task) {
  const sanitized = {
    id: typeof task.id === 'string' ? task.id : generateId(),
    title: String(task.title || '未命名任务').slice(0, 120),
    description: String(task.description || ''),
    dueDate: isValidDateString(task.dueDate)
      ? task.dueDate
      : formatDateInput(new Date()),
    priority: ['low', 'medium', 'high'].includes(task.priority)
      ? task.priority
      : 'medium',
    tags: Array.isArray(task.tags)
      ? task.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [],
    status: task.status === 'completed' ? 'completed' : 'pending',
    createdAt: task.createdAt && !Number.isNaN(Date.parse(task.createdAt))
      ? task.createdAt
      : new Date().toISOString(),
    completedAt:
      task.completedAt && !Number.isNaN(Date.parse(task.completedAt))
        ? task.completedAt
        : null,
  };

  if (sanitized.status === 'pending') {
    sanitized.completedAt = null;
  }
  return sanitized;
}

function render() {
  renderSummary();
  renderTasks();
  updateFilterButtons();
}

function renderSummary() {
  const today = startOfDay(new Date());
  const todayCount = state.tasks.filter(
    (task) => task.status !== 'completed' && isSameDay(parseDate(task.dueDate), today)
  ).length;
  const pendingCount = state.tasks.filter((task) => task.status !== 'completed').length;
  const completedCount = state.tasks.filter((task) => task.status === 'completed').length;
  const overdueCount = state.tasks.filter(
    (task) => task.status !== 'completed' && isOverdue(task)
  ).length;

  elements.summaryToday.textContent = todayCount;
  elements.summaryPending.textContent = pendingCount;
  elements.summaryCompleted.textContent = completedCount;
  elements.summaryOverdue.textContent = overdueCount;
}

function renderTasks() {
  elements.taskList.innerHTML = '';
  const filtered = filterTasks();
  const sorted = sortTasks(filtered);

  if (sorted.length === 0) {
    elements.emptyState.hidden = false;
    if (state.tasks.length === 0) {
      elements.emptyState.textContent = '目前列表为空，先创建一个任务吧！';
    } else if (state.search) {
      elements.emptyState.textContent = '没有找到匹配的任务，试试调整搜索关键词或筛选条件。';
    } else {
      elements.emptyState.textContent = '目前没有符合条件的任务，试着添加一个吧！';
    }
    return;
  }

  elements.emptyState.hidden = true;
  elements.emptyState.textContent = '';
  sorted.forEach((task) => {
    const node = createTaskElement(task);
    elements.taskList.appendChild(node);
  });
}

function filterTasks() {
  const searchKeyword = state.search;
  const today = startOfDay(new Date());
  return state.tasks.filter((task) => {
    const dueDate = parseDate(task.dueDate);
    const matchesSearch = searchKeyword
      ? [task.title, task.description, task.tags.join(' ')].some((value) =>
          value.toLowerCase().includes(searchKeyword)
        )
      : true;

    if (!matchesSearch) {
      return false;
    }

    switch (state.filter) {
      case 'today':
        return task.status !== 'completed' && isSameDay(dueDate, today);
      case 'upcoming':
        return task.status !== 'completed' && !isOverdue(task) && !isSameDay(dueDate, today);
      case 'overdue':
        return task.status !== 'completed' && isOverdue(task);
      case 'completed':
        return task.status === 'completed';
      default:
        return true;
    }
  });
}

function sortTasks(tasks) {
  return tasks.slice().sort((a, b) => {
    if (state.filter === 'completed') {
      const aCompleted = a.completedAt ? Date.parse(a.completedAt) : 0;
      const bCompleted = b.completedAt ? Date.parse(b.completedAt) : 0;
      return bCompleted - aCompleted;
    }
    if (a.status !== b.status) {
      return a.status === 'completed' ? 1 : -1;
    }
    const dateA = parseDate(a.dueDate).getTime();
    const dateB = parseDate(b.dueDate).getTime();
    if (dateA !== dateB) {
      return dateA - dateB;
    }
    return a.title.localeCompare(b.title, 'zh-CN');
  });
}

function createTaskElement(task) {
  const fragment = elements.template.content.cloneNode(true);
  const item = fragment.querySelector('.task-item');
  const checkbox = fragment.querySelector('.task-toggle');
  const title = fragment.querySelector('.task-title');
  const description = fragment.querySelector('.task-description');
  const priority = fragment.querySelector('.task-priority');
  const meta = fragment.querySelector('.task-meta');
  const menuButton = fragment.querySelector('.task-menu');
  const menu = fragment.querySelector('.task-menu-list');
  const postponeButton = fragment.querySelector('.menu-item.postpone');
  const editButton = fragment.querySelector('.menu-item.edit');
  const deleteButton = fragment.querySelector('.menu-item.delete');

  item.dataset.id = task.id;

  const overdue = isOverdue(task);
  if (task.status === 'completed') {
    item.classList.add('completed');
  }
  if (overdue) {
    item.classList.add('overdue');
  }

  checkbox.checked = task.status === 'completed';
  checkbox.addEventListener('change', (event) => {
    toggleTaskCompletion(task.id, event.target.checked);
  });

  title.textContent = task.title;
  if (task.description) {
    description.textContent = task.description;
  } else {
    description.remove();
  }

  priority.textContent =
    task.priority === 'high'
      ? '高优'
      : task.priority === 'medium'
      ? '中优'
      : '低优';
  priority.classList.add(task.priority);

  const dueInfo = document.createElement('span');
  dueInfo.textContent = `📅 ${describeDue(task)}`;
  meta.appendChild(dueInfo);

  if (task.tags.length > 0) {
    task.tags.forEach((tag) => {
      const badge = document.createElement('span');
      badge.textContent = `🏷️ ${tag}`;
      meta.appendChild(badge);
    });
  }

  const createdInfo = document.createElement('span');
  createdInfo.textContent = `🕒 创建：${formatDateTime(task.createdAt)}`;
  meta.appendChild(createdInfo);

  if (task.status === 'completed' && task.completedAt) {
    const completedInfo = document.createElement('span');
    completedInfo.textContent = `✅ 完成：${formatDateTime(task.completedAt)}`;
    meta.appendChild(completedInfo);
  }

  menuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.contains('open');
    closeAllMenus();
    if (!isOpen) {
      menu.classList.add('open');
    }
  });

  postponeButton.addEventListener('click', () => {
    closeAllMenus();
    postponeTask(task.id);
  });

  editButton.addEventListener('click', () => {
    closeAllMenus();
    populateForm(task.id);
  });

  deleteButton.addEventListener('click', async () => {
    closeAllMenus();
    const confirmed = await confirmAction(`确定要删除“${task.title}”吗？`);
    if (confirmed) {
      removeTask(task.id);
    }
  });

  return fragment;
}

function toggleTaskCompletion(taskId, completed) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }
  task.status = completed ? 'completed' : 'pending';
  task.completedAt = completed ? new Date().toISOString() : null;
  persist();
  render();
}

function postponeTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }
  const current = parseDate(task.dueDate);
  task.dueDate = formatDateInput(addDays(current, 1));
  if (task.status === 'completed') {
    task.status = 'pending';
    task.completedAt = null;
  }
  persist();
  render();
}

function populateForm(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }
  elements.taskId.value = task.id;
  elements.title.value = task.title;
  elements.description.value = task.description;
  elements.date.value = task.dueDate;
  elements.priority.value = task.priority;
  elements.tags.value = task.tags.join(', ');
  elements.saveButton.textContent = '更新任务';
  elements.title.focus();
}

function removeTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId);
  persist();
  render();
  if (elements.taskId.value === taskId) {
    clearForm();
  }
}

function handleSubmit(event) {
  event.preventDefault();
  const title = elements.title.value.trim();
  const dueDate = elements.date.value;

  if (!title) {
    elements.title.focus();
    return;
  }
  if (!isValidDateString(dueDate)) {
    elements.date.focus();
    return;
  }

  const description = elements.description.value.trim();
  const priority = elements.priority.value;
  const tags = elements.tags.value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  const payload = {
    id: elements.taskId.value || generateId(),
    title,
    description,
    dueDate,
    priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
    tags,
  };

  const existingIndex = state.tasks.findIndex((task) => task.id === payload.id);

  if (existingIndex >= 0) {
    const existing = state.tasks[existingIndex];
    state.tasks[existingIndex] = {
      ...existing,
      ...payload,
      status: existing.status,
      createdAt: existing.createdAt,
      completedAt: existing.status === 'completed' ? existing.completedAt : null,
    };
  } else {
    state.tasks.push({
      ...payload,
      status: 'pending',
      createdAt: new Date().toISOString(),
      completedAt: null,
    });
  }

  persist();
  render();
  clearForm();
}

function clearForm() {
  elements.form.reset();
  elements.taskId.value = '';
  elements.priority.value = 'medium';
  elements.saveButton.textContent = '保存任务';
}

function updateFilterButtons() {
  elements.filterButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === state.filter);
  });
}

function closeAllMenus() {
  document
    .querySelectorAll('.task-menu-list.open')
    .forEach((menu) => menu.classList.remove('open'));
}

function confirmAction(message) {
  return new Promise((resolve) => {
    elements.confirmMessage.textContent = message;
    elements.confirmDialog.returnValue = 'cancel';
    elements.confirmDialog.showModal();
    const handleClose = () => {
      resolve(elements.confirmDialog.returnValue === 'confirm');
      elements.confirmDialog.removeEventListener('close', handleClose);
    };
    elements.confirmDialog.addEventListener('close', handleClose, { once: true });
  });
}

function describeDue(task) {
  const dueDate = parseDate(task.dueDate);
  const today = startOfDay(new Date());
  const diff = Math.round((dueDate - today) / MS_PER_DAY);
  if (diff === 0) {
    return '今天到期';
  }
  if (diff < 0) {
    return `逾期 ${Math.abs(diff)} 天`;
  }
  if (diff === 1) {
    return '明天到期';
  }
  return `${dateFormatter.format(dueDate)} · 剩余 ${diff} 天`;
}

function isOverdue(task) {
  const dueDate = parseDate(task.dueDate);
  const today = startOfDay(new Date());
  return dueDate < today;
}

function parseDate(value) {
  const [year, month, day] = String(value).split('-').map((part) => Number(part));
  if (!year || !month || !day) {
    return startOfDay(new Date());
  }
  return new Date(year, month - 1, day);
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDateTime(value) {
  if (!value) {
    return '';
  }
  try {
    const date = new Date(value);
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return value;
  }
}

function generateId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function countCompleted() {
  return state.tasks.filter((task) => task.status === 'completed').length;
}
