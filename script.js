// script.js
"use strict";

/* -----------------------
   Element references
   ----------------------- */
const addProjectBtn = document.getElementById("addProjectBtn");
const projectNameInput = document.getElementById("projectName");
const projectDeadlineInput = document.getElementById("projectDeadline");
const projectsContainer = document.getElementById("projectsContainer");

// Views
const projectsView = document.getElementById("projectsView");
const tasksView = document.getElementById("tasksView");
const reportsView = document.getElementById("reportsView");
const pageTitle = document.getElementById("pageTitle");
const taskProjectName = document.getElementById("taskProjectName");

// Kanban inputs
const addTaskBtn = document.getElementById("addTaskBtn");
const taskNameInput = document.getElementById("taskNameInput");
const taskDescInput = document.getElementById("taskDescInput");

// Kanban columns
const kanbanColumns = {
  todo: document.querySelector(".kanban-column[data-status='todo'] .kanban-tasks"),
  inprogress: document.querySelector(".kanban-column[data-status='inprogress'] .kanban-tasks"),
  done: document.querySelector(".kanban-column[data-status='done'] .kanban-tasks")
};

// Task counters
const todoCountEl = document.getElementById("todoCount");
const inprogressCountEl = document.getElementById("inprogressCount");
const doneCountEl = document.getElementById("doneCount");

/* -----------------------
   State
   ----------------------- */
let currentProject = null;
let projects = {};           // structure: { projectName: { deadline: '...', tasks: [...] } }
let projectCards = {};       // DOM progress elements per project
let draggedId = null;
let currentUserUid = null;   // set by onUserSignedIn()

let reportChart = null;
let reportPie = null;

/* -----------------------
   Helpers (storage per user)
   ----------------------- */
function storageKeyForUser(uid) {
  if (!uid) return "projectsData";
  return `projectsData_${uid}`;
}

function saveProjects() {
  const key = storageKeyForUser(currentUserUid);
  localStorage.setItem(key, JSON.stringify(projects));
}

function loadProjectsFromStorage(uid) {
  const key = storageKeyForUser(uid);
  try {
    projects = JSON.parse(localStorage.getItem(key)) || {};
  } catch (err) {
    projects = {};
  }

  // (re)render project cards
  projectsContainer.innerHTML = "";
  projectCards = {};
  for (const [name, project] of Object.entries(projects)) {
    createProjectCard(name, project.deadline || "N/A");
  }
  loadReports();
  projectsView.style.display = "block";
  tasksView.style.display = "none";
  reportsView.style.display = "none";
  currentProject = null;
  updateTaskSummary();
}

/* -----------------------
   Utility
   ----------------------- */
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function findTaskById(projectName, id) {
  return projects[projectName]?.tasks?.find(t => t.id === id);
}

/* -----------------------
   Task summary updater
   ----------------------- */
function updateTaskSummary() {
  if (!currentProject || !projects[currentProject]) {
    todoCountEl.textContent = inprogressCountEl.textContent = doneCountEl.textContent = 0;
    return;
  }
  const arr = projects[currentProject].tasks || [];
  todoCountEl.textContent = arr.filter(t => t.status === "todo").length;
  inprogressCountEl.textContent = arr.filter(t => t.status === "inprogress").length;
  doneCountEl.textContent = arr.filter(t => t.status === "done").length;
}

/* -----------------------
   Projects: create / open / delete
   ----------------------- */
function createProjectCard(name, deadline) {
  const card = document.createElement("div");
  card.className = "project-card";
  card.innerHTML = `
    <h3>${escapeHtml(name)}</h3>
    <div class="meta">Deadline: ${escapeHtml(deadline)}</div>
    <div class="progress-track"><div class="progress-fill" style="width:0%"></div></div>
    <div class="card-actions">
      <button class="open-btn">Open</button>
      <button class="delete-btn">Delete</button>
    </div>
  `;

  const progressFill = card.querySelector(".progress-fill");

  // Open project -> show tasks
  card.querySelector(".open-btn").addEventListener("click", () => {
    currentProject = name;
    taskProjectName.textContent = name;
    pageTitle.textContent = "Tasks";
    projectsView.style.display = "none";
    tasksView.style.display = "block";
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    const tasksBtn = document.querySelector('.nav-btn[data-view="tasks"]');
    if (tasksBtn) tasksBtn.classList.add("active");
    loadTasks();
  });

  // Delete project (modern confirm)
  card.querySelector(".delete-btn").addEventListener("click", () => {
    // use custom modal or simple confirm fallback
    const ok = confirm(`Delete project "${name}"? This cannot be undone.`);
    if (!ok) return;
    delete projects[name];
    saveProjects();
    card.remove();
    loadReports();
    if (currentProject === name) {
      currentProject = null;
      projectsView.style.display = "block";
      tasksView.style.display = "none";
      updateTaskSummary();
    }
  });

  projectsContainer.appendChild(card);
  projectCards[name] = progressFill;
  updateProgress(name);
}

/* Add new project */
addProjectBtn.addEventListener("click", () => {
  const name = projectNameInput.value.trim();
  const deadline = projectDeadlineInput.value || "N/A";
  if (!name) { alert("Please fill project name"); return; }
  if (projects[name]) { alert("A project with that name already exists"); return; }

  projects[name] = { deadline, tasks: [] };
  saveProjects();
  createProjectCard(name, deadline);
  projectNameInput.value = projectDeadlineInput.value = "";
  loadReports();
});

/* -----------------------
   Tasks: add / render / delete / drag-drop
   ----------------------- */
addTaskBtn.addEventListener("click", () => {
  if (!currentProject) { alert("Open a project first to add tasks."); return; }
  const tname = taskNameInput.value.trim();
  const tdesc = taskDescInput.value.trim();
  if (!tname) { alert("Task name required"); return; }

  const task = { id: Date.now().toString(), name: tname, desc: tdesc, status: "todo" };
  projects[currentProject].tasks.push(task);
  renderTask(task);
  saveProjects();
  updateProgress(currentProject);
  loadReports();
  updateTaskSummary();

  taskNameInput.value = taskDescInput.value = "";
});

function renderTask(task) {
  if (!task || !currentProject) return;

  const div = document.createElement("div");
  div.className = "kanban-task";
  div.draggable = true;
  div.dataset.id = task.id;
  div.innerHTML = `<strong>${escapeHtml(task.name)}</strong><p>${escapeHtml(task.desc)}</p><span class="delete-task">✖</span>`;

  // delete task
  div.querySelector(".delete-task").addEventListener("click", () => {
    projects[currentProject].tasks = projects[currentProject].tasks.filter(t => t.id !== task.id);
    div.remove();
    saveProjects();
    updateProgress(currentProject);
    loadReports();
    updateTaskSummary();
  });

  // drag handlers
  div.addEventListener("dragstart", (e) => {
    draggedId = String(task.id);
    div.classList.add("dragging");
  });

  div.addEventListener("dragend", () => {
    div.classList.remove("dragging");
    draggedId = null;
    syncTasksFromDOM();
    saveProjects();
    updateProgress(currentProject);
    loadReports();
    updateTaskSummary();
  });

  const targetContainer = kanbanColumns[task.status] || kanbanColumns.todo;
  targetContainer.appendChild(div);
}

/* Load tasks of currentProject into DOM */
function loadTasks() {
  if (!currentProject) return;
  Object.values(kanbanColumns).forEach(col => col.innerHTML = "");
  (projects[currentProject].tasks || []).forEach(task => renderTask(task));
  updateProgress(currentProject);
  updateTaskSummary();
}

/* Update progress bar for a project */
function updateProgress(projectName) {
  const tasksArr = projects[projectName]?.tasks || [];
  const progressEl = projectCards[projectName];
  if (!progressEl) return;
  if (!tasksArr.length) { progressEl.style.width = "0%"; return; }
  const doneTasks = tasksArr.filter(t => t.status === "done").length;
  const percent = Math.round((doneTasks / tasksArr.length) * 100);
  progressEl.style.width = percent + "%";
}

/* -----------------------
   Drag & drop behaviour
   ----------------------- */
Object.keys(kanbanColumns).forEach(status => {
  const container = kanbanColumns[status];

  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    const draggingEl = document.querySelector(".kanban-task.dragging");
    if (!draggingEl) return;
    const afterElement = getDragAfterElement(container, e.clientY);
    if (!afterElement) container.appendChild(draggingEl);
    else container.insertBefore(draggingEl, afterElement);
  });

  container.addEventListener("drop", (e) => {
    e.preventDefault();
    const id = draggedId;
    if (!id || !currentProject) return;
    const task = findTaskById(currentProject, id);
    if (!task) return;
    task.status = status;
    syncTasksFromDOM();
    saveProjects();
    updateProgress(currentProject);
    loadReports();
    updateTaskSummary();
  });
});

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.kanban-task:not(.dragging)')];
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };

  for (const child of draggableElements) {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      closest = { offset, element: child };
    }
  }
  return closest.element;
}

function syncTasksFromDOM() {
  if (!currentProject || !projects[currentProject]) return;
  const newArr = [];
  ['todo','inprogress','done'].forEach(status => {
    const container = kanbanColumns[status];
    const nodes = [...container.querySelectorAll('.kanban-task')];
    nodes.forEach(node => {
      const id = node.dataset.id;
      const obj = findTaskById(currentProject, id);
      if (obj) {
        obj.status = status;
        newArr.push(obj);
      }
    });
  });
  projects[currentProject].tasks = newArr;
}

/* -----------------------
   Reports (charts + report cards)
   ----------------------- */
const reportsContainer = document.getElementById("reportsContainer");
const reportChartCanvas = document.getElementById("reportChart");
const reportPieCanvas = document.getElementById("reportPie");

function loadReports() {
  reportsContainer.innerHTML = "";
  const select = document.getElementById("reportProjectSelect");
  select.innerHTML = "<option value='all'>All Projects</option>";

  let labels = [];
  let donePercentages = [];
  let totalTodo = 0, totalInProgress = 0, totalDone = 0;

  Object.keys(projects).forEach(projectName => {
    const tasksArr = projects[projectName].tasks || [];
    select.innerHTML += `<option value="${projectName}">${projectName}</option>`;

    const total = tasksArr.length;
    const todoCount = tasksArr.filter(t => t.status === "todo").length;
    const inprogressCount = tasksArr.filter(t => t.status === "inprogress").length;
    const doneCount = tasksArr.filter(t => t.status === "done").length;
    const percent = total ? Math.round((doneCount / total) * 100) : 0;

    const card = document.createElement("div");
    card.className = "report-card";
    card.innerHTML = `
      <h3>${escapeHtml(projectName)}</h3>
      <p>📋 ${total} Tasks</p>
      <p>🟦 To Do: ${todoCount} | 🟧 In Progress: ${inprogressCount} | 🟩 Done: ${doneCount}</p>
      <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
      <small>Completion: ${percent}%</small>
    `;
    reportsContainer.appendChild(card);

    labels.push(projectName);
    donePercentages.push(percent);

    totalTodo += todoCount;
    totalInProgress += inprogressCount;
    totalDone += doneCount;
  });

  if (reportChart) reportChart.destroy();
  reportChart = new Chart(reportChartCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Completion % by Project", data: donePercentages, borderRadius: 8, backgroundColor: "rgba(37,99,235,0.7)" }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
  });

  if (reportPie) reportPie.destroy();
  reportPie = new Chart(reportPieCanvas, {
    type: "doughnut",
    data: { labels: ["To Do","In Progress","Done"], datasets: [{ data: [totalTodo, totalInProgress, totalDone], backgroundColor: ["#3b82f6","#f59e0b","#10b981"] }] },
    options: { plugins: { legend: { position: "bottom" } } }
  });
}

document.getElementById("refreshReports")?.addEventListener("click", loadReports);

/* -----------------------
   Navigation buttons
   ----------------------- */
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;

    projectsView.style.display = "none";
    tasksView.style.display = "none";
    reportsView.style.display = "none";

    if (view === "projects") {
      projectsView.style.display = "block";
      pageTitle.textContent = "Projects";
    } else if (view === "tasks") {
      if (!currentProject) { alert("Please open a project first (click Open on a project card)."); document.querySelector('.nav-btn[data-view="projects"]').classList.add("active"); projectsView.style.display = "block"; pageTitle.textContent = "Projects"; return; }
      tasksView.style.display = "block";
      pageTitle.textContent = "Tasks";
      loadTasks();
    } else if (view === "reports") {
      reportsView.style.display = "block";
      pageTitle.textContent = "Reports";
      loadReports();
    }
  });
});

/* -----------------------
   Hooks called by index.html after auth is ready
   ----------------------- */
window.onUserSignedIn = function(user) {
  if (!user) return;
  currentUserUid = user.uid;
  loadProjectsFromStorage(currentUserUid);
};

window.onUserSignedOut = function() {
  currentUserUid = null;
  projects = {};
  projectsContainer.innerHTML = "";
  // index.html's auth module handles redirect to login
};

/* -----------------------
   Initialization (UI only)
   ----------------------- */
document.addEventListener("DOMContentLoaded", () => {
  // wait for onUserSignedIn to populate data
  projectsView.style.display = "block";
});
