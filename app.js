// ================================
// QikHUB v0.2
// Inventory • Inspire • Create
// ================================


// ---------- DATA ----------

const STORAGE_KEYS = {
  inventory: "qikhub_inventory",
  ideas: "qikhub_ideas",
  projects: "qikhub_projects"
};

const PROJECT_STATUSES = {
  planning: "Planning",
  building: "Building",
  done: "Done"
};

function loadList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

let inventory = loadList(STORAGE_KEYS.inventory);
let ideas = loadList(STORAGE_KEYS.ideas);
let projects = loadList(STORAGE_KEYS.projects).map(normalizeProject);

let aiAvailable = false;
let pendingPhoto = null;        // resized data URL waiting to be identified
let lastIdentified = null;      // last AI identification result
let currentSuggestions = [];    // what the inspiration panel is showing
let shownTitles = [];           // recent suggestion titles, to avoid repeats
let projectFilter = "active";


function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function sameId(a, b) {
  return String(a) === String(b);
}

function $(selector) {
  return document.querySelector(selector);
}


// ---------- SAVE ----------

function saveData() {
  localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(inventory));
  localStorage.setItem(STORAGE_KEYS.ideas, JSON.stringify(ideas));
  localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(projects));
  updateStats();
}


// ---------- NAVIGATION ----------

function showPage(pageId) {
  const target = document.getElementById(pageId);
  if (!target) return;

  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle("active", page === target);
  });

  document.querySelectorAll(".nav-button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === pageId);
  });

  if (pageId === "projects") renderProjects();
  if (pageId === "inventory") renderInventory();

  window.scrollTo({ top: 0, behavior: "smooth" });
}


// ---------- DASHBOARD STATS ----------

function updateStats() {
  const itemCount = inventory.reduce(
    (total, item) => total + Number(item.quantity || 0), 0
  );

  $("#inventoryCount").textContent = itemCount;
  $("#ideaCount").textContent = ideas.length;
  $("#projectCount").textContent =
    projects.filter(p => p.status !== "done").length;
}


// ---------- TOAST ----------

let toastTimer;

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}


// ---------- MODALS ----------

function openModal(id) {
  document.getElementById(id).classList.add("open");
  const first = document.querySelector(`#${id} input, #${id} textarea`);
  if (first) setTimeout(() => first.focus(), 50);
}

function closeModals() {
  document.querySelectorAll(".modal.open").forEach(m => m.classList.remove("open"));
}

document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", event => {
    if (event.target === modal) closeModals();
  });
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeModals();
});


// ---------- INVENTORY FORM ----------

function openInventoryForm(prefill = {}) {
  const form = $("#inventoryForm");
  form.reset();

  $("#itemName").value = prefill.name || "";
  $("#itemCategory").value = prefill.category || "Microcontroller";
  $("#itemQuantity").value = prefill.quantity || 1;
  $("#itemLocation").value = prefill.location || "";
  $("#itemNotes").value = prefill.notes || "";

  openModal("inventoryModal");
}

$("#inventoryForm").addEventListener("submit", event => {
  event.preventDefault();

  const name = $("#itemName").value.trim();
  if (!name) return;

  inventory.unshift({
    id: uid(),
    name,
    category: $("#itemCategory").value,
    quantity: Math.max(1, Number($("#itemQuantity").value) || 1),
    location: $("#itemLocation").value.trim(),
    notes: $("#itemNotes").value.trim(),
    created: new Date().toISOString()
  });

  saveData();
  renderInventory();
  closeModals();
  toast(`Added ${name}`);
});


// ---------- DISPLAY INVENTORY ----------

$("#inventorySearch").addEventListener("input", renderInventory);

function renderInventory() {
  const list = $("#inventoryList");
  const search = $("#inventorySearch").value.toLowerCase().trim();

  const filtered = inventory.filter(item => {
    const searchable =
      `${item.name} ${item.category} ${item.location} ${item.notes}`.toLowerCase();
    return searchable.includes(search);
  });

  if (!filtered.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div>📦</div>
        <h2>${search ? "Nothing found" : "No components yet"}</h2>
        <p>${search
          ? "Try searching for something else."
          : "Start cataloging the electronics you've collected."}</p>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map(item => {
    const id = escapeHTML(item.id);
    const usedIn = projects.filter(p =>
      p.status !== "done" && p.parts.some(part => sameId(part.itemId, item.id))
    );

    return `
      <article class="inventory-card">
        <span class="category">${escapeHTML(item.category)}</span>
        <h3>${escapeHTML(item.name)}</h3>

        <div class="qty-row">
          <button type="button" class="qty-button" data-action="qty" data-id="${id}" data-delta="-1" aria-label="Decrease">−</button>
          <span class="meta">Qty ${Number(item.quantity) || 0}</span>
          <button type="button" class="qty-button" data-action="qty" data-id="${id}" data-delta="1" aria-label="Increase">+</button>
        </div>

        ${item.location ? `<p class="meta">📍 ${escapeHTML(item.location)}</p>` : ""}
        ${item.notes ? `<p class="notes">${escapeHTML(item.notes)}</p>` : ""}
        ${usedIn.length
          ? `<p class="meta used-in">⚒ In ${usedIn.map(p => escapeHTML(p.title)).join(", ")}</p>`
          : ""}

        <button type="button" class="delete-button" data-action="delete-item" data-id="${id}">Remove</button>
      </article>`;
  }).join("");
}

function changeQuantity(id, delta) {
  const item = inventory.find(i => sameId(i.id, id));
  if (!item) return;

  const next = (Number(item.quantity) || 0) + delta;

  if (next < 1) {
    deleteInventoryItem(id);
    return;
  }

  item.quantity = next;
  saveData();
  renderInventory();
}

function deleteInventoryItem(id) {
  const item = inventory.find(i => sameId(i.id, id));
  if (!item) return;

  if (!confirm(`Remove "${item.name}" from your inventory?`)) return;

  inventory = inventory.filter(i => !sameId(i.id, id));
  saveData();
  renderInventory();
}


// ---------- IDEA QUEUE ----------

$("#ideaForm").addEventListener("submit", event => {
  event.preventDefault();

  const input = $("#ideaInput");
  const text = input.value.trim();
  if (!text) return;

  addIdea(text);
  input.value = "";
});

function addIdea(text) {
  ideas.unshift({ id: uid(), text, created: new Date().toISOString() });
  saveData();
  renderIdeas();
}

function renderIdeas() {
  const list = $("#ideaList");

  if (!ideas.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div>💡</div>
        <h2>Your queue is empty</h2>
        <p>Throw every ridiculous idea in here. We can figure out whether it's possible later.</p>
      </div>`;
    return;
  }

  list.innerHTML = ideas.map(idea => `
    <div class="idea-item">
      <span>${escapeHTML(idea.text)}</span>
      <div class="idea-actions">
        <button type="button" class="ghost small" data-action="build-idea" data-id="${escapeHTML(idea.id)}">⚒ Build it</button>
        <button type="button" class="delete-button" data-action="delete-idea" data-id="${escapeHTML(idea.id)}" aria-label="Delete idea">×</button>
      </div>
    </div>`).join("");
}

function deleteIdea(id) {
  ideas = ideas.filter(idea => !sameId(idea.id, id));
  saveData();
  renderIdeas();
}

function buildIdea(id) {
  const idea = ideas.find(i => sameId(i.id, id));
  if (!idea) return;

  createProject({ title: idea.text });
  ideas = ideas.filter(i => !sameId(i.id, id));
  saveData();
  renderIdeas();
  showPage("projects");
  toast("Idea moved to Projects");
}


// ---------- PROJECTS ----------

function normalizeProject(p = {}) {
  return {
    id: p.id ?? uid(),
    title: p.title || "Untitled project",
    notes: p.notes || "",
    status: PROJECT_STATUSES[p.status] ? p.status : "planning",
    parts: Array.isArray(p.parts) ? p.parts : [],          // [{ itemId, qty }]
    shopping: Array.isArray(p.shopping) ? p.shopping : [], // [string]
    tasks: Array.isArray(p.tasks) ? p.tasks : [],          // [{ text, done }]
    created: p.created || new Date().toISOString()
  };
}

function createProject(data) {
  const project = normalizeProject({ ...data, id: uid() });
  projects.unshift(project);
  saveData();
  renderProjects();
  return project;
}

function findProject(id) {
  return projects.find(p => sameId(p.id, id));
}

function updateProject(id, change) {
  const project = findProject(id);
  if (!project) return;
  change(project);
  saveData();
  renderProjects();
}

$("#projectForm").addEventListener("submit", event => {
  event.preventDefault();

  const title = $("#projectTitle").value.trim();
  if (!title) return;

  createProject({ title, notes: $("#projectNotes").value.trim() });
  event.target.reset();
  closeModals();
  toast("Project created");
});

function renderProjects() {
  const list = $("#projectList");

  document.querySelectorAll("#projectFilters .filter").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filter === projectFilter);
  });

  const order = { building: 0, planning: 1, done: 2 };

  const visible = projects
    .filter(p =>
      projectFilter === "all" ||
      (projectFilter === "done" ? p.status === "done" : p.status !== "done")
    )
    .sort((a, b) => order[a.status] - order[b.status]);

  if (!visible.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div>🛠️</div>
        <h2>${projectFilter === "done" ? "Nothing finished yet" : "No active projects"}</h2>
        <p>Start one from an idea, from an Inspire Me suggestion, or with + New Project.</p>
      </div>`;
    return;
  }

  list.innerHTML = visible.map(renderProjectCard).join("");
}

function renderProjectCard(project) {
  const id = escapeHTML(project.id);
  const doneTasks = project.tasks.filter(t => t.done).length;
  const progress = project.tasks.length
    ? Math.round((doneTasks / project.tasks.length) * 100)
    : 0;

  const usedIds = project.parts.map(p => String(p.itemId));
  const availableItems = inventory.filter(i => !usedIds.includes(String(i.id)));

  const parts = project.parts.map((part, index) => {
    const item = inventory.find(i => sameId(i.id, part.itemId));
    const name = item ? item.name : "(removed from inventory)";
    const short = item && Number(item.quantity) < part.qty;

    return `
      <li class="chip ${item ? "" : "missing"} ${short ? "short" : ""}">
        ${escapeHTML(name)}${part.qty > 1 ? ` ×${part.qty}` : ""}
        ${short ? `<small>(own ${item.quantity})</small>` : ""}
        <button type="button" data-action="remove-part" data-id="${id}" data-index="${index}" aria-label="Remove part">×</button>
      </li>`;
  }).join("");

  const shopping = project.shopping.map((thing, index) => `
    <li class="chip need">
      ${escapeHTML(thing)}
      <button type="button" data-action="got-it" data-id="${id}" data-index="${index}" title="Got it — add to inventory" aria-label="Got it">✓</button>
      <button type="button" data-action="remove-shopping" data-id="${id}" data-index="${index}" aria-label="Remove">×</button>
    </li>`).join("");

  const tasks = project.tasks.map((task, index) => `
    <li class="task ${task.done ? "done" : ""}">
      <label>
        <input type="checkbox" data-change="toggle-task" data-id="${id}" data-index="${index}" ${task.done ? "checked" : ""}>
        <span>${escapeHTML(task.text)}</span>
      </label>
      <button type="button" class="delete-button" data-action="remove-task" data-id="${id}" data-index="${index}" aria-label="Remove task">×</button>
    </li>`).join("");

  const statusOptions = Object.entries(PROJECT_STATUSES).map(([value, label]) =>
    `<option value="${value}" ${project.status === value ? "selected" : ""}>${label}</option>`
  ).join("");

  return `
    <article class="project-card status-${project.status}">

      <div class="project-head">
        <h3>${escapeHTML(project.title)}</h3>
        <select class="status-select" data-change="project-status" data-id="${id}" aria-label="Status">
          ${statusOptions}
        </select>
      </div>

      ${project.notes ? `<p class="project-notes">${escapeHTML(project.notes)}</p>` : ""}

      ${project.tasks.length ? `
        <div class="progress" aria-label="${progress}% of tasks done">
          <div style="width:${progress}%"></div>
        </div>
        <p class="meta">${doneTasks} of ${project.tasks.length} tasks done</p>` : ""}

      <div class="project-section">
        <h4>Parts from inventory</h4>
        ${parts ? `<ul class="chip-list">${parts}</ul>` : `<p class="meta">No parts linked yet.</p>`}
        ${availableItems.length ? `
          <div class="inline-form">
            <select id="partSelect-${id}" aria-label="Choose a part">
              ${availableItems.map(i =>
                `<option value="${escapeHTML(i.id)}">${escapeHTML(i.name)}</option>`).join("")}
            </select>
            <button type="button" class="ghost small" data-action="add-part" data-id="${id}">Add</button>
          </div>` : ""}
      </div>

      <div class="project-section">
        <h4>Need to get</h4>
        ${shopping ? `<ul class="chip-list">${shopping}</ul>` : ""}
        <div class="inline-form">
          <input id="shopInput-${id}" type="text" placeholder="e.g. 10k resistor" data-enter="add-shopping" data-id="${id}">
          <button type="button" class="ghost small" data-action="add-shopping" data-id="${id}">Add</button>
        </div>
      </div>

      <div class="project-section">
        <h4>Tasks</h4>
        ${tasks ? `<ul class="task-list">${tasks}</ul>` : ""}
        <div class="inline-form">
          <input id="taskInput-${id}" type="text" placeholder="Next step…" data-enter="add-task" data-id="${id}">
          <button type="button" class="ghost small" data-action="add-task" data-id="${id}">Add</button>
        </div>
      </div>

      <div class="project-foot">
        <button type="button" class="delete-button" data-action="delete-project" data-id="${id}">Delete project</button>
      </div>

    </article>`;
}

function readInline(prefix, id) {
  const input = document.getElementById(`${prefix}-${id}`);
  const value = input ? input.value.trim() : "";
  return value;
}

function addPart(id) {
  const itemId = readInline("partSelect", id);
  if (!itemId) return;
  updateProject(id, p => {
    const existing = p.parts.find(part => sameId(part.itemId, itemId));
    if (existing) existing.qty += 1;
    else p.parts.push({ itemId, qty: 1 });
  });
  renderInventory();
}

function addShopping(id) {
  const text = readInline("shopInput", id);
  if (!text) return;
  updateProject(id, p => p.shopping.push(text));
}

function addTask(id) {
  const text = readInline("taskInput", id);
  if (!text) return;
  updateProject(id, p => p.tasks.push({ text, done: false }));
  const input = document.getElementById(`taskInput-${id}`);
  if (input) input.focus();
}

// "Got it" on a shopping item: add it to inventory and link it to the project.
function gotShoppingItem(id, index) {
  const project = findProject(id);
  if (!project) return;
  const name = project.shopping[index];
  if (!name) return;

  let item = inventory.find(i => i.name.toLowerCase() === name.toLowerCase());

  if (item) {
    item.quantity = (Number(item.quantity) || 0) + 1;
  } else {
    item = {
      id: uid(),
      name,
      category: "Other",
      quantity: 1,
      location: "",
      notes: `Bought for ${project.title}`,
      created: new Date().toISOString()
    };
    inventory.unshift(item);
  }

  updateProject(id, p => {
    p.shopping.splice(index, 1);
    if (!p.parts.some(part => sameId(part.itemId, item.id))) {
      p.parts.push({ itemId: item.id, qty: 1 });
    }
  });
  renderInventory();
  toast(`${name} added to inventory`);
}

function deleteProject(id) {
  const project = findProject(id);
  if (!project) return;
  if (!confirm(`Delete "${project.title}"? Your inventory isn't affected.`)) return;
  projects = projects.filter(p => !sameId(p.id, id));
  saveData();
  renderProjects();
}


// ---------- AI CONNECTION ----------

async function checkAI() {
  if (location.protocol === "file:") {
    aiAvailable = false;
  } else {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.status === 401) return goToLogin();
      const data = await res.json();
      aiAvailable = Boolean(data.ai);
    } catch {
      aiAvailable = false;
    }
  }
  updateAIStatus();
}

function updateAIStatus() {
  const badge = $("#aiBadge");
  badge.textContent = aiAvailable ? "AI on" : "Offline";
  badge.classList.toggle("on", aiAvailable);
  badge.title = aiAvailable
    ? "Connected to QikHUB AI"
    : "AI features need the QikHUB server running (see README)";

  const status = $("#aiStatus");
  if (status && !lastIdentified) {
    status.innerHTML = aiAvailable
      ? `<span>✨</span> AI is ready. Add a photo, then tap Identify.`
      : `<span>🔌</span> AI identification needs the QikHUB server.
         Run <code>npm start</code> and open the address it prints
         (see README). You can still add items by hand.`;
  }

  refreshIdentifyButton();
}

function refreshIdentifyButton() {
  $("#identifyButton").disabled = !(aiAvailable && pendingPhoto);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    goToLogin();
    throw new Error("Please sign in again.");
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Your data stays on this device; signing in again picks up where you left off.
function goToLogin() {
  location.href = "/login";
}

function signOut() {
  if (location.protocol === "file:") return;
  if (confirm("Sign out of QikHUB? Your inventory stays saved on this device.")) {
    location.href = "/logout";
  }
}


// ---------- PHOTO + IDENTIFY ----------

$("#componentPhoto").addEventListener("change", previewPhoto);

async function previewPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Please choose an image.");
    return;
  }

  try {
    pendingPhoto = await resizeImage(file, 1280, 0.85);
  } catch {
    alert("Couldn't read that image. Try a JPEG or PNG.");
    return;
  }

  lastIdentified = null;
  $("#photoPreview").innerHTML =
    `<img src="${pendingPhoto}" alt="Electronic component photograph">`;
  $("#identifyResult").innerHTML = `<div id="aiStatus" class="ai-placeholder"></div>`;
  updateAIStatus();

  // Allow picking the same file again later
  event.target.value = "";
}

// Shrinks big phone photos so uploads are fast and cheap.
function resizeImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };

    img.src = url;
  });
}

async function identifyPhoto() {
  if (!pendingPhoto || !aiAvailable) return;

  const button = $("#identifyButton");
  const result = $("#identifyResult");

  button.disabled = true;
  button.textContent = "Identifying…";
  result.innerHTML = `<div class="ai-placeholder loading"><span class="spinner"></span> Looking closely at your component…</div>`;

  try {
    lastIdentified = await api("/api/identify", { image: pendingPhoto });
    renderIdentifyResult();
  } catch (err) {
    result.innerHTML = `<div class="ai-placeholder error">⚠️ ${escapeHTML(err.message)}</div>`;
  } finally {
    button.textContent = "✨ Identify with AI";
    refreshIdentifyButton();
  }
}

function renderIdentifyResult() {
  const r = lastIdentified;
  if (!r) return;

  const existing = inventory.find(i => i.name.toLowerCase() === String(r.name).toLowerCase());

  $("#identifyResult").innerHTML = `
    <article class="result-card">
      <div class="result-head">
        <span class="category">${escapeHTML(r.category)}</span>
        <span class="pill confidence-${escapeHTML(r.confidence)}">${escapeHTML(r.confidence)} confidence</span>
      </div>

      <h3>${escapeHTML(r.name)}</h3>
      <p>${escapeHTML(r.description)}</p>

      ${r.specs ? `<p class="meta"><strong>Specs:</strong> ${escapeHTML(r.specs)}</p>` : ""}
      ${r.tips ? `<p class="meta"><strong>Tip:</strong> ${escapeHTML(r.tips)}</p>` : ""}
      ${r.projectIdeas && r.projectIdeas.length
        ? `<p class="meta"><strong>Good for:</strong> ${r.projectIdeas.map(escapeHTML).join(" · ")}</p>` : ""}

      <div class="result-actions">
        ${existing
          ? `<button type="button" class="primary" data-action="bump-identified" data-id="${escapeHTML(existing.id)}">+1 to your ${escapeHTML(existing.name)} (have ${existing.quantity})</button>
             <button type="button" class="ghost" data-action="add-identified">Add as new item</button>`
          : `<button type="button" class="primary" data-action="add-identified">Add to Inventory</button>`}
      </div>
    </article>`;
}

function addIdentified() {
  const r = lastIdentified;
  if (!r) return;

  const notes = [r.specs, r.description].filter(Boolean).join(" — ");

  openInventoryForm({
    name: r.name,
    category: r.category,
    quantity: r.count || 1,
    notes
  });
}

function bumpIdentified(id) {
  const item = inventory.find(i => sameId(i.id, id));
  if (!item) return;
  item.quantity = (Number(item.quantity) || 0) + (lastIdentified?.count || 1);
  saveData();
  renderInventory();
  renderIdentifyResult();
  toast(`${item.name}: now ${item.quantity}`);
}


// ---------- INSPIRATION ----------

async function inspireMe() {
  const card = $("#inspirationCard");

  if (!inventory.length) {
    card.innerHTML = `
      <div class="inspiration">
        <div class="inspiration-icon">📦</div>
        <div>
          <h3>Feed QikHUB first.</h3>
          <p>Add some electronics to your inventory. Once I know what you've got,
             this is where QikHUB will start finding things you could make.</p>
        </div>
      </div>`;
    return;
  }

  card.closest(".panel").scrollIntoView({ behavior: "smooth", block: "start" });

  let note = "";

  if (aiAvailable) {
    card.innerHTML = `
      <div class="inspiration">
        <div class="inspiration-icon"><span class="spinner large"></span></div>
        <div><h3>Digging through your parts bin…</h3><p>Asking QikHUB AI what you could build.</p></div>
      </div>`;

    try {
      const data = await api("/api/inspire", {
        inventory: inventory.map(i => ({
          name: i.name,
          category: i.category,
          quantity: i.quantity,
          notes: (i.notes || "").slice(0, 160)
        })),
        ideas: ideas.slice(0, 10).map(i => i.text),
        avoid: shownTitles.slice(-9)
      });

      currentSuggestions = data.ideas.map(s => ({ ...s, source: "ai" }));
      rememberShown();
      renderSuggestions();
      return;
    } catch (err) {
      console.warn("AI inspire failed, using offline library:", err);
      note = "AI didn't answer, so these come from the offline library.";
    }
  }

  currentSuggestions = localSuggestions();
  rememberShown();
  renderSuggestions(note);
}

function rememberShown() {
  shownTitles.push(...currentSuggestions.map(s => s.title));
  shownTitles = shownTitles.slice(-30);
}

function itemMatches(item, need) {
  if (need.cat && need.cat.includes(item.category)) return true;

  const text = `${item.name} ${item.notes || ""}`.toLowerCase();

  return (need.any || []).some(keyword => {
    const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}`).test(text);
  });
}

function localSuggestions() {
  const scored = RECIPES.map(recipe => {
    const uses = [];
    const missing = [];

    recipe.needs.forEach(need => {
      const match = inventory.find(item => itemMatches(item, need));
      if (match) {
        if (!uses.includes(match.name)) uses.push(match.name);
      } else {
        missing.push(need.label);
      }
    });

    const score = (recipe.needs.length - missing.length) / recipe.needs.length;

    return {
      title: recipe.title,
      summary: recipe.summary,
      difficulty: recipe.difficulty,
      firstStep: recipe.firstStep,
      uses,
      missing,
      score,
      source: "local"
    };
  }).filter(s => s.score > 0);

  // Prefer the best matches, skip what was just shown, add a little randomness
  let pool = scored.filter(s => !shownTitles.slice(-6).includes(s.title));
  if (pool.length < 3) pool = scored;

  pool.sort((a, b) => (b.score - a.score) || (Math.random() - 0.5));

  const picks = pool.slice(0, 3);

  if (picks.length) return picks;

  // Nothing in the library matched: fall back to a nudge about a random item
  const item = inventory[Math.floor(Math.random() * inventory.length)];
  return [{
    title: `Get to know your ${item.name}`,
    summary: `Nothing in the offline library matches your parts yet. Look up the datasheet for ${item.name}, wire it to something simple and see what it does.`,
    difficulty: "Easy",
    firstStep: `Search for "${item.name} pinout" and note the voltage it needs.`,
    uses: [item.name],
    missing: [],
    source: "local"
  }];
}

function renderSuggestions(note = "") {
  const card = $("#inspirationCard");

  card.innerHTML = `
    ${note ? `<p class="meta suggestion-note">${escapeHTML(note)}</p>` : ""}
    <div class="suggestions">
      ${currentSuggestions.map((s, index) => `
        <article class="suggestion">
          <div class="suggestion-top">
            <h3>${escapeHTML(s.title)}</h3>
            ${s.difficulty ? `<span class="pill">${escapeHTML(s.difficulty)}</span>` : ""}
          </div>

          <p>${escapeHTML(s.summary)}</p>

          ${s.uses && s.uses.length
            ? `<p class="meta"><strong>You have:</strong> ${s.uses.map(escapeHTML).join(", ")}</p>` : ""}
          ${s.missing && s.missing.length
            ? `<p class="meta need"><strong>You'd need:</strong> ${s.missing.map(escapeHTML).join(", ")}</p>` : ""}
          ${s.firstStep
            ? `<p class="meta"><strong>First step:</strong> ${escapeHTML(s.firstStep)}</p>` : ""}

          <div class="suggestion-actions">
            <button type="button" class="primary small" data-action="start-suggestion" data-index="${index}">⚒ Start project</button>
            <button type="button" class="ghost small" data-action="save-suggestion" data-index="${index}">💡 Save idea</button>
          </div>
        </article>`).join("")}
    </div>
    <p class="meta source-line">${currentSuggestions[0]?.source === "ai" ? "✨ Suggested by QikHUB AI" : "📚 From the offline build library"}</p>`;
}

function startSuggestion(index) {
  const s = currentSuggestions[index];
  if (!s) return;

  // Link inventory items the suggestion uses (matched by name)
  const parts = (s.uses || [])
    .map(name => inventory.find(i => i.name.toLowerCase() === String(name).toLowerCase()))
    .filter(Boolean)
    .map(item => ({ itemId: item.id, qty: 1 }));

  createProject({
    title: s.title,
    notes: s.summary,
    status: "planning",
    parts,
    shopping: s.missing || [],
    tasks: s.firstStep ? [{ text: s.firstStep, done: false }] : []
  });

  showPage("projects");
  toast("Project started");
}

function saveSuggestion(index) {
  const s = currentSuggestions[index];
  if (!s) return;
  addIdea(s.title);
  toast("Saved to your idea queue");
}


// ---------- EVENT WIRING ----------
// Buttons use data-action="..." instead of inline onclick handlers.

const actions = {
  "nav": el => showPage(el.dataset.page),
  "inspire": () => inspireMe(),
  "capture-idea": () => { showPage("ideas"); setTimeout(() => $("#ideaInput").focus(), 300); },

  "open-inventory": () => openInventoryForm(),
  "close-modal": () => closeModals(),
  "qty": el => changeQuantity(el.dataset.id, Number(el.dataset.delta)),
  "delete-item": el => deleteInventoryItem(el.dataset.id),

  "build-idea": el => buildIdea(el.dataset.id),
  "delete-idea": el => deleteIdea(el.dataset.id),

  "identify": () => identifyPhoto(),
  "add-identified": () => addIdentified(),
  "bump-identified": el => bumpIdentified(el.dataset.id),

  "start-suggestion": el => startSuggestion(Number(el.dataset.index)),
  "save-suggestion": el => saveSuggestion(Number(el.dataset.index)),

  "open-project": () => openModal("projectModal"),
  "project-filter": el => { projectFilter = el.dataset.filter; renderProjects(); },
  "delete-project": el => deleteProject(el.dataset.id),
  "add-part": el => addPart(el.dataset.id),
  "remove-part": el => {
    updateProject(el.dataset.id, p => p.parts.splice(Number(el.dataset.index), 1));
    renderInventory();
  },
  "add-shopping": el => addShopping(el.dataset.id),
  "remove-shopping": el => updateProject(el.dataset.id, p => p.shopping.splice(Number(el.dataset.index), 1)),
  "got-it": el => gotShoppingItem(el.dataset.id, Number(el.dataset.index)),
  "add-task": el => addTask(el.dataset.id),
  "remove-task": el => updateProject(el.dataset.id, p => p.tasks.splice(Number(el.dataset.index), 1))
};

document.addEventListener("click", event => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const handler = actions[el.dataset.action];
  if (handler) handler(el, event);
});

document.addEventListener("change", event => {
  const el = event.target.closest("[data-change]");
  if (!el) return;

  const id = el.dataset.id;

  if (el.dataset.change === "project-status") {
    updateProject(id, p => { p.status = el.value; });
    if (el.value === "done") toast("Nice build! 🎉");
  }

  if (el.dataset.change === "toggle-task") {
    updateProject(id, p => {
      const task = p.tasks[Number(el.dataset.index)];
      if (task) task.done = el.checked;
    });
  }
});

document.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  const el = event.target.closest("[data-enter]");
  if (!el) return;
  event.preventDefault();
  const handler = actions[el.dataset.enter];
  if (handler) handler(el, event);
});


// ---------- SECURITY ----------
// Prevent user-entered (and AI-generated) text from becoming HTML.

function escapeHTML(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ---------- INITIALIZE QIKHUB ----------

$(".profile-button").addEventListener("click", signOut);
$(".profile-button").title = "Sign out";

function initializeQikHUB() {
  updateStats();
  renderInventory();
  renderIdeas();
  renderProjects();
  checkAI();

  console.log("QikHUB v0.2 ready ⚡");
}

initializeQikHUB();
