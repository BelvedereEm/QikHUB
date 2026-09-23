// ================================
// QikHUB v0.1
// Inventory • Inspire • Create
// ================================


// ---------- DATA ----------

let inventory =
  JSON.parse(localStorage.getItem("qikhub_inventory")) || [];

let ideas =
  JSON.parse(localStorage.getItem("qikhub_ideas")) || [];

let projects =
  JSON.parse(localStorage.getItem("qikhub_projects")) || [];


// ---------- SAVE ----------

function saveData() {
  localStorage.setItem(
    "qikhub_inventory",
    JSON.stringify(inventory)
  );

  localStorage.setItem(
    "qikhub_ideas",
    JSON.stringify(ideas)
  );

  localStorage.setItem(
    "qikhub_projects",
    JSON.stringify(projects)
  );

  updateStats();
}


// ---------- NAVIGATION ----------

function showPage(pageId, button) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });

  const target = document.getElementById(pageId);

  if (target) {
    target.classList.add("active");
  }

  document.querySelectorAll(".nav-button").forEach(btn => {
    btn.classList.remove("active");
  });

  if (button) {
    button.classList.add("active");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


// ---------- DASHBOARD STATS ----------

function updateStats() {
  const inventoryCount =
    inventory.reduce((total, item) => {
      return total + Number(item.quantity || 0);
    }, 0);

  document.getElementById("inventoryCount").textContent =
    inventoryCount;

  document.getElementById("ideaCount").textContent =
    ideas.length;

  document.getElementById("projectCount").textContent =
    projects.length;
}


// ---------- INVENTORY MODAL ----------

function openInventoryForm() {
  document
    .getElementById("inventoryModal")
    .classList.add("open");
}


function closeInventoryForm() {
  document
    .getElementById("inventoryModal")
    .classList.remove("open");
}


// Close modal if background is tapped

document
  .getElementById("inventoryModal")
  .addEventListener("click", event => {

    if (event.target.id === "inventoryModal") {
      closeInventoryForm();
    }

  });


// ---------- ADD INVENTORY ITEM ----------

document
  .getElementById("inventoryForm")
  .addEventListener("submit", event => {

    event.preventDefault();

    const name =
      document.getElementById("itemName").value.trim();

    if (!name) return;

    const item = {
      id: Date.now(),

      name: name,

      category:
        document.getElementById("itemCategory").value,

      quantity:
        Number(
          document.getElementById("itemQuantity").value
        ) || 1,

      location:
        document.getElementById("itemLocation").value.trim(),

      notes:
        document.getElementById("itemNotes").value.trim(),

      created:
        new Date().toISOString()
    };


    inventory.unshift(item);

    saveData();
    renderInventory();

    event.target.reset();

    document.getElementById("itemQuantity").value = 1;

    closeInventoryForm();
  });


// ---------- DISPLAY INVENTORY ----------

function renderInventory() {
  const list =
    document.getElementById("inventoryList");

  const searchInput =
    document.getElementById("inventorySearch");

  const search =
    searchInput
      ? searchInput.value.toLowerCase().trim()
      : "";


  const filtered =
    inventory.filter(item => {

      const searchable = `
        ${item.name || ""}
        ${item.category || ""}
        ${item.location || ""}
        ${item.notes || ""}
      `.toLowerCase();

      return searchable.includes(search);
    });


  if (!filtered.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div>📦</div>

        <h2>
          ${search ? "Nothing found" : "No components yet"}
        </h2>

        <p>
          ${
            search
              ? "Try searching for something else."
              : "Start cataloging the electronics you've collected."
          }
        </p>
      </div>
    `;

    return;
  }


  list.innerHTML =
    filtered.map(item => {

      return `
        <article class="inventory-card">

          <span class="category">
            ${escapeHTML(item.category)}
          </span>

          <h3>
            ${escapeHTML(item.name)}
          </h3>

          <p class="meta">
            Quantity: ${item.quantity}
          </p>

          ${
            item.location
              ? `
                <p class="meta">
                  📍 ${escapeHTML(item.location)}
                </p>
              `
              : ""
          }

          ${
            item.notes
              ? `
                <p>
                  ${escapeHTML(item.notes)}
                </p>
              `
              : ""
          }

          <button
            class="delete-button"
            onclick="deleteInventoryItem(${item.id})"
          >
            Remove
          </button>

        </article>
      `;

    }).join("");
}


// ---------- DELETE INVENTORY ----------

function deleteInventoryItem(id) {
  const item =
    inventory.find(item => item.id === id);

  if (!item) return;

  const confirmed =
    confirm(`Remove "${item.name}" from your inventory?`);

  if (!confirmed) return;

  inventory =
    inventory.filter(item => item.id !== id);

  saveData();
  renderInventory();
}


// ---------- IDEA QUEUE ----------

document
  .getElementById("ideaForm")
  .addEventListener("submit", event => {

    event.preventDefault();

    const input =
      document.getElementById("ideaInput");

    const text =
      input.value.trim();

    if (!text) return;


    ideas.unshift({
      id: Date.now(),

      text: text,

      created:
        new Date().toISOString()
    });


    input.value = "";

    saveData();
    renderIdeas();
  });


// ---------- DISPLAY IDEAS ----------

function renderIdeas() {
  const list =
    document.getElementById("ideaList");


  if (!ideas.length) {
    list.innerHTML = `
      <div class="empty-state">

        <div>💡</div>

        <h2>Your queue is empty</h2>

        <p>
          Throw every ridiculous idea in here.
          We can figure out whether it's possible later.
        </p>

      </div>
    `;

    return;
  }


  list.innerHTML =
    ideas.map(idea => {

      return `
        <div class="idea-item">

          <span>
            ${escapeHTML(idea.text)}
          </span>

          <button
            class="delete-button"
            onclick="deleteIdea(${idea.id})"
            aria-label="Delete idea"
          >
            ×
          </button>

        </div>
      `;

    }).join("");
}


// ---------- DELETE IDEA ----------

function deleteIdea(id) {
  ideas =
    ideas.filter(idea => idea.id !== id);

  saveData();
  renderIdeas();
}


// ---------- PHOTO PREVIEW ----------

function previewPhoto(event) {
  const file =
    event.target.files[0];

  if (!file) return;


  if (!file.type.startsWith("image/")) {
    alert("Please choose an image.");
    return;
  }


  const reader =
    new FileReader();


  reader.onload = () => {

    document.getElementById(
      "photoPreview"
    ).innerHTML = `
      <img
        src="${reader.result}"
        alt="Electronic component photograph"
      >
    `;

  };


  reader.readAsDataURL(file);
}


// ---------- INSPIRATION ----------

function inspireMe() {
  const card =
    document.getElementById("inspirationCard");


  if (!inventory.length) {
    card.innerHTML = `
      <div class="inspiration-icon">
        📦
      </div>

      <div>
        <h3>Feed QikHUB first.</h3>

        <p>
          Add some electronics to your inventory.
          Once I know what you've got, this is where
          QikHUB will start finding things you could make.
        </p>
      </div>
    `;

    return;
  }


  const randomItem =
    inventory[
      Math.floor(Math.random() * inventory.length)
    ];


  const suggestions = [
    {
      title: "Experiment with it",
      text:
        `You've got ${randomItem.name}. ` +
        `What small prototype could we make to learn exactly what it can do?`
    },

    {
      title: "Combine some parts",
      text:
        `Start with ${randomItem.name}. ` +
        `QikHUB's future AI engine will search your other components and find interesting combinations.`
    },

    {
      title: "Make it useful",
      text:
        `You've already got ${randomItem.name}. ` +
        `Let's eventually turn it into something useful instead of letting it live in a parts bin forever.`
    }
  ];


  const suggestion =
    suggestions[
      Math.floor(Math.random() * suggestions.length)
    ];


  card.innerHTML = `
    <div class="inspiration-icon">
      ✨
    </div>

    <div>
      <h3>
        ${escapeHTML(suggestion.title)}
      </h3>

      <p>
        ${escapeHTML(suggestion.text)}
      </p>
    </div>
  `;
}


// ---------- SECURITY ----------
// Prevent user-entered text from becoming HTML.

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ---------- INITIALIZE QIKHUB ----------

function initializeQikHUB() {
  updateStats();
  renderInventory();
  renderIdeas();

  console.log("QikHUB v0.1 ready ⚡");
}


initializeQikHUB();
