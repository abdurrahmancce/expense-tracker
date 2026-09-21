// ===========================
// Firebase Setup
// ===========================
const firebaseConfig = {
  apiKey: "AIzaSyCwOhzNXM0ia2BF9XYiweQ9hlzhl5H7-l4",
  authDomain: "expense-tracker-10592.firebaseapp.com",
  projectId: "expense-tracker-10592",
  storageBucket: "expense-tracker-10592.firebasestorage.app",
  messagingSenderId: "863211273020",
  appId: "1:863211273020:web:d79b5141274175012d3c39"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;

// ===========================
// UI Helpers: Loading Overlay & Toast Notifications
// ===========================

// ===========================
// Number Formatting
// ===========================
function fmt(amount){
  return "৳ " + Number(amount).toLocaleString("en-IN");
}

function showLoading(text){
  const overlay = document.getElementById("loadingOverlay");
  document.getElementById("loadingText").textContent = text || "Loading...";
  overlay.classList.remove("hidden");
}

function hideLoading(){
  document.getElementById("loadingOverlay").classList.add("hidden");
}

function showToast(message, type){
  type = type || "success";
  let container = document.getElementById("toastContainer");
  if(!container){
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ===========================
// Data (loaded from Firestore after login)
// ===========================
let expenses = [];
let salamis = [];
let monthlyChart, yearlyChart;
let monthlyIncomeChart, yearlyIncomeChart;
let categoryChart;

// For editing
let editingExpenseIndex = -1;
let editingEidIndex = -1;

// For the "All Expenses" dropdown month filter ("all" or "YYYY-M")
let currentExpenseFilter = "all";

// For the "All Bonus/Income" dropdown month filter ("all" or "YYYY-M")
let currentEidFilter = "all";

// Locally cached trash contents
let trashedExpenses = [];
let trashedSalamis = [];

// Locally cached pinned quick-fill items
let pinnedItems = [];

// Locally cached categories
let categories = [];
const DEFAULT_CATEGORIES = ["Food","Transport","Tuition","Medical","Donation","Family Cost","Other"];

// Current search text for the "All Expenses" list
let expenseSearchQuery = "";

// Current category filter ("all" or a category name) for the "All Expenses" list
let currentCategoryFilter = "all";

// Current sort mode for the "All Expenses" list
let currentExpenseSort = "date-asc";

const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ===========================
// Auth Screen elements & tab switching
// ===========================
const authScreen = document.getElementById("authScreen");
const appScreen = document.getElementById("appScreen");
const authError = document.getElementById("authError");

const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

loginTab.addEventListener("click", () => switchAuthTab("login"));
signupTab.addEventListener("click", () => switchAuthTab("signup"));

function switchAuthTab(tab){
  authError.textContent = "";
  authError.style.color = "";
  if(tab === "login"){
    loginTab.classList.add("active");
    signupTab.classList.remove("active");
    loginForm.classList.remove("hidden");
    signupForm.classList.add("hidden");
  } else {
    signupTab.classList.add("active");
    loginTab.classList.remove("active");
    signupForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
  }
}

// ===========================
// Sign up / Login / Logout
// ===========================
document.getElementById("signupBtn").addEventListener("click", async () => {
  const email = document.getElementById("signupEmail").value.trim();
  const pass = document.getElementById("signupPassword").value;
  authError.textContent = "";
  authError.style.color = "";
  if(!email || !pass){ authError.textContent = "Please enter your email and password."; return; }
  try {
    await auth.createUserWithEmailAndPassword(email, pass);
  } catch(err){
    authError.textContent = err.message;
  }
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPassword").value;
  authError.textContent = "";
  authError.style.color = "";
  if(!email || !pass){ authError.textContent = "Please enter your email and password."; return; }
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch(err){
    authError.textContent = err.message;
  }
});

document.getElementById("forgotPasswordBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  authError.style.color = "";
  authError.textContent = "";
  if(!email){
    authError.textContent = "Please enter your email address in the field above to reset your password.";
    return;
  }
  try {
    await auth.sendPasswordResetEmail(email);
    authError.style.color = "#28a745";
    authError.textContent = "Password reset link sent to your email. Please check your inbox (and spam folder).";
  } catch(err){
    authError.textContent = err.message;
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  auth.signOut();
});

// ===========================
// Auth State Listener - drives the whole app
// ===========================
auth.onAuthStateChanged(async (user) => {
  if(user){
    currentUser = user;
    authScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");

    showLoading("Loading...");

    // Run user doc check + all secondary data in parallel
    await Promise.all([
      loadUserData(),
      loadTrash(),
      loadPinnedItems(),
      loadCategories()
    ]);

    // Show UI immediately — don't block on secondary data
    renderCategoryOptions();
    renderTrash();
    renderPinnedItems();
    renderCategoryManageList();
    applyDarkMode();
    checkForOldLocalData();
    hideLoading();

    // Live listeners start AFTER UI is visible — first snapshot
    // will re-render expenses/salamis when it arrives
    subscribeToExpenses();
    subscribeToSalamis();
  } else {
    currentUser = null;
    unsubscribeFromLiveData();
    expenses = [];
    salamis = [];
    appScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
  }
});

// ===========================
// Firestore Load / Save
// ===========================
// NEW ARCHITECTURE: each expense/bonus entry is its own Firestore
// document (in a subcollection), instead of one giant array field.
// This means adding/editing/deleting ONE entry only ever touches that
// ONE document - so if two devices save around the same time, they no
// longer silently overwrite each other's unrelated entries.
function userExpensesRef(){
  return db.collection("users").doc(currentUser.uid).collection("expenses");
}
function userSalamisRef(){
  return db.collection("users").doc(currentUser.uid).collection("salamis");
}
function userTrashExpensesRef(){
  return db.collection("users").doc(currentUser.uid).collection("trash_expenses");
}
function userTrashSalamisRef(){
  return db.collection("users").doc(currentUser.uid).collection("trash_salamis");
}
function userPinnedItemsRef(){
  return db.collection("users").doc(currentUser.uid).collection("pinned_items");
}
function userCategoriesRef(){
  return db.collection("users").doc(currentUser.uid).collection("categories");
}

async function loadUserData(){
  const userDocRef = db.collection("users").doc(currentUser.uid);
  const userDocSnap = await userDocRef.get();

  if(!userDocSnap.exists){
    // Brand new account
    isDark = false;
    await userDocRef.set({ darkMode: false, migratedToSubcollections: true });
  } else {
    const data = userDocSnap.data();
    isDark = data.darkMode || false;

    // One-time migration: older accounts stored everything as two big
    // array fields on this same document. Move that into subcollections
    // (one Firestore document per entry) exactly once.
    if(!data.migratedToSubcollections){
      const oldExpenses = data.expenses || [];
      const oldSalamis = data.salamis || [];
      await migrateArraysToSubcollections(oldExpenses, oldSalamis);
      await userDocRef.set({
        migratedToSubcollections: true,
        expenses: firebase.firestore.FieldValue.delete(),
        salamis: firebase.firestore.FieldValue.delete()
      }, { merge: true });
    }
  }
  // Note: expenses/salamis are no longer fetched here with a one-time get().
  // See subscribeToExpenses()/subscribeToSalamis() below - those set up
  // live listeners instead, so changes from any device show up automatically.
}

// ===========================
// Real-time sync: live listeners for expenses & bonus/income
// ===========================
// Unlike a one-time .get(), .onSnapshot() keeps listening and fires again
// every time the data changes in Firestore - including changes made from
// a completely different device/tab. That's what makes multi-device sync
// automatic instead of requiring a manual page refresh.
let unsubscribeExpenses = null;
let unsubscribeSalamis = null;

let _expDebounce = null;
let _salDebounce = null;

function subscribeToExpenses(){
  return new Promise((resolve) => {
    if(unsubscribeExpenses) unsubscribeExpenses();
    let firstLoad = true;
    unsubscribeExpenses = userExpensesRef().onSnapshot(snapshot => {
      expenses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if(firstLoad){ firstLoad = false; resolve(); }
      clearTimeout(_expDebounce);
      _expDebounce = setTimeout(() => {
        renderExpenseMonthNav();
        renderExpenses();
        renderMonthlyYearlyTables();
        renderCharts();
      }, 150);
    }, err => {
      console.error("Expenses sync error:", err);
      if(firstLoad){ firstLoad = false; resolve(); }
    });
  });
}

function subscribeToSalamis(){
  return new Promise((resolve) => {
    if(unsubscribeSalamis) unsubscribeSalamis();
    let firstLoad = true;
    unsubscribeSalamis = userSalamisRef().onSnapshot(snapshot => {
      salamis = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if(firstLoad){ firstLoad = false; resolve(); }
      clearTimeout(_salDebounce);
      _salDebounce = setTimeout(() => {
        renderEidMonthNav();
        renderEidFlatTable();
        renderEidTables();
        renderIncomeCharts();
      }, 150);
    }, err => {
      console.error("Salamis sync error:", err);
      if(firstLoad){ firstLoad = false; resolve(); }
    });
  });
}

function unsubscribeFromLiveData(){
  if(unsubscribeExpenses){ unsubscribeExpenses(); unsubscribeExpenses = null; }
  if(unsubscribeSalamis){ unsubscribeSalamis(); unsubscribeSalamis = null; }
}

// Writes an array of plain entries into a subcollection as individual
// documents. Chunked to stay safely under Firestore's 500-ops-per-batch limit.
async function writeEntriesToSubcollection(entries, collectionRef){
  for(let i=0; i<entries.length; i+=400){
    const chunk = entries.slice(i, i+400);
    const batch = db.batch();
    chunk.forEach(entry => {
      const ref = collectionRef.doc();
      batch.set(ref, entry);
    });
    await batch.commit();
  }
}

async function migrateArraysToSubcollections(oldExpenses, oldSalamis){
  if(oldExpenses.length) await writeEntriesToSubcollection(oldExpenses, userExpensesRef());
  if(oldSalamis.length) await writeEntriesToSubcollection(oldSalamis, userSalamisRef());
}

async function saveDarkMode(){
  if(!currentUser) return;
  await db.collection("users").doc(currentUser.uid).set({ darkMode: isDark }, { merge: true });
}

// ===========================
// Migrate old localStorage data (this device only, one-time)
// ===========================
function checkForOldLocalData(){
  const oldExpenses = JSON.parse(localStorage.getItem("expenses") || "null");
  const oldSalamis = JSON.parse(localStorage.getItem("salamis") || "null");
  const migrateBtn = document.getElementById("migrateBtn");

  if((oldExpenses && oldExpenses.length) || (oldSalamis && oldSalamis.length)){
    migrateBtn.classList.remove("hidden");
  } else {
    migrateBtn.classList.add("hidden");
  }
}

document.getElementById("migrateBtn").addEventListener("click", async () => {
  const oldExpenses = JSON.parse(localStorage.getItem("expenses") || "[]");
  const oldSalamis = JSON.parse(localStorage.getItem("salamis") || "[]");

  const confirmMsg = `Found ${oldExpenses.length} expense(s) and ${oldSalamis.length} bonus/income entry(s) saved on this device.\nWould you like to import them into your account?`;
  if(!confirm(confirmMsg)) return;

  showLoading("Importing old data...");

  await migrateArraysToSubcollections(oldExpenses, oldSalamis);

  localStorage.removeItem("expenses");
  localStorage.removeItem("salamis");
  document.getElementById("migrateBtn").classList.add("hidden");

  // onSnapshot listeners will automatically pick up the migrated data
  // and re-render — no manual render calls needed here

  hideLoading();
  showToast("Old data imported successfully!", "success");
});

// ===========================
// Dark Mode
// ===========================
const toggleBtn = document.getElementById("toggleDarkMode");
let isDark = false;

function applyDarkMode() {
  if (isDark) {
    document.body.classList.add("dark-mode");
    toggleBtn.textContent = "☀️ Light Mode";
  } else {
    document.body.classList.remove("dark-mode");
    toggleBtn.textContent = "🌙 Dark Mode";
  }
}

toggleBtn.addEventListener("click", async () => {
  isDark = !isDark;
  applyDarkMode();
  await saveDarkMode();
});

// ===========================
// Trash (soft-delete with 7-day auto-purge)
// ===========================
async function loadTrash(){
  const [expSnap, salSnap] = await Promise.all([
    userTrashExpensesRef().get(),
    userTrashSalamisRef().get()
  ]);
  trashedExpenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  trashedSalamis = salSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Auto-purge anything older than 7 days
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const expiredExp = trashedExpenses.filter(t => now - new Date(t.deletedAt).getTime() > sevenDaysMs);
  const expiredSal = trashedSalamis.filter(t => now - new Date(t.deletedAt).getTime() > sevenDaysMs);

  if(expiredExp.length || expiredSal.length){
    const batch = db.batch();
    expiredExp.forEach(t => batch.delete(userTrashExpensesRef().doc(t.id)));
    expiredSal.forEach(t => batch.delete(userTrashSalamisRef().doc(t.id)));
    await batch.commit();
    const expiredExpIds = new Set(expiredExp.map(t => t.id));
    const expiredSalIds = new Set(expiredSal.map(t => t.id));
    trashedExpenses = trashedExpenses.filter(t => !expiredExpIds.has(t.id));
    trashedSalamis = trashedSalamis.filter(t => !expiredSalIds.has(t.id));
  }
}

function renderTrash(){
  const expBody = document.querySelector("#trashExpenseTable tbody");
  const expRows = trashedExpenses
    .slice()
    .sort((a,b) => new Date(b.deletedAt) - new Date(a.deletedAt))
    .map(t => `<tr>
      <td>${t.item}</td><td>${fmt(t.amount)}</td><td>${t.date}</td>
      <td>${new Date(t.deletedAt).toLocaleDateString()}</td>
      <td><button onclick="restoreExpense('${t.id}')">Restore</button></td>
    </tr>`);
  expBody.innerHTML = expRows.length ? expRows.join("") : `<tr><td colspan="5">Trash is empty</td></tr>`;

  const salBody = document.querySelector("#trashSalamiTable tbody");
  const salRows = trashedSalamis
    .slice()
    .sort((a,b) => new Date(b.deletedAt) - new Date(a.deletedAt))
    .map(t => `<tr>
      <td>${t.giver}</td><td>${fmt(t.amount)}</td><td>${t.month} ${t.date}, ${t.year}</td>
      <td>${new Date(t.deletedAt).toLocaleDateString()}</td>
      <td><button onclick="restoreEid('${t.id}')">Restore</button></td>
    </tr>`);
  salBody.innerHTML = salRows.length ? salRows.join("") : `<tr><td colspan="5">Trash is empty</td></tr>`;
}

async function restoreExpense(trashId){
  const t = trashedExpenses.find(x => x.id === trashId);
  if(!t) return;
  const { id, deletedAt, ...entry } = t;

  await userExpensesRef().add(entry);
  await userTrashExpensesRef().doc(trashId).delete();
  trashedExpenses = trashedExpenses.filter(x => x.id !== trashId);
  renderTrash();
  showToast("Expense restored successfully!", "success");
}

async function restoreEid(trashId){
  const t = trashedSalamis.find(x => x.id === trashId);
  if(!t) return;
  const { id, deletedAt, ...entry } = t;

  await userSalamisRef().add(entry);
  await userTrashSalamisRef().doc(trashId).delete();
  trashedSalamis = trashedSalamis.filter(x => x.id !== trashId);
  renderTrash();
  showToast("Bonus/Income entry restored successfully!", "success");
}

// ===========================
// Pinned Items (quick-fill shortcuts for frequently typed item names)
// ===========================
async function loadPinnedItems(){
  const snap = await userPinnedItemsRef().get();
  pinnedItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function renderPinnedItems(){
  const list = document.getElementById("pinnedItemsList");
  if(!pinnedItems.length){
    list.innerHTML = `<span style="font-size:13px;color:#999;">No pins yet — type a name below and click "Pin"</span>`;
    return;
  }
  list.innerHTML = pinnedItems.map(p => `
    <button type="button" class="pinned-chip" onclick="usePin('${p.id}')">
      📌 ${p.text}
      <span class="remove-pin" onclick="event.stopPropagation(); removePin('${p.id}')">✕</span>
    </button>
  `).join("");
}

function usePin(id){
  const p = pinnedItems.find(x => x.id === id);
  if(!p) return;
  document.getElementById("item").value = p.text;
  document.getElementById("amount").focus();
}

async function removePin(id){
  await userPinnedItemsRef().doc(id).delete();
  pinnedItems = pinnedItems.filter(p => p.id !== id);
  renderPinnedItems();
  showToast("Pin removed", "success");
}

document.getElementById("addPinBtn").addEventListener("click", async () => {
  const input = document.getElementById("newPinInput");
  const text = input.value.trim();
  if(!text){ showToast("Please type something to pin!", "error"); return; }

  const ref = await userPinnedItemsRef().add({ text });
  pinnedItems.push({ id: ref.id, text });
  input.value = "";
  renderPinnedItems();
  showToast("Pinned!", "success");
});

// ===========================
// Categories
// ===========================
async function loadCategories(){
  const snap = await userCategoriesRef().get();
  categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if(categories.length === 0){
    const batch = db.batch();
    const newCats = DEFAULT_CATEGORIES.map(name => {
      const ref = userCategoriesRef().doc();
      batch.set(ref, { name });
      return { id: ref.id, name };
    });
    await batch.commit();
    categories = newCats; // no second read needed
  }
}

// Populates both the "add expense" category select and the "All Expenses"
// category filter select, preserving whichever option was selected before.
function renderCategoryOptions(){
  const addSelect = document.getElementById("expenseCategory");
  const filterSelect = document.getElementById("expenseCategoryFilter");

  const prevAddValue = addSelect.value;
  addSelect.innerHTML = `<option value="">Select Category</option>` +
    categories.map(c => `<option value="${c.name}">${c.name}</option>`).join("");
  if(categories.some(c => c.name === prevAddValue)) addSelect.value = prevAddValue;

  const prevFilterValue = filterSelect.value || "all";
  filterSelect.innerHTML = `<option value="all">All Categories</option>` +
    categories.map(c => `<option value="${c.name}">${c.name}</option>`).join("") +
    `<option value="__uncategorized__">Uncategorized</option>`;
  filterSelect.value = prevFilterValue;
}

function renderCategoryManageList(){
  const list = document.getElementById("categoryManageList");
  if(!categories.length){
    list.innerHTML = `<span style="font-size:13px;color:#999;">No categories yet</span>`;
    return;
  }
  list.innerHTML = categories.map(c => `
    <span class="category-chip">
      ${c.name}
      <span class="edit-cat" onclick="renameCategory('${c.id}','${c.name.replace(/'/g,"\\'")}')">✏️</span>
      <span class="remove-cat" onclick="deleteCategory('${c.id}','${c.name.replace(/'/g,"\\'")}')">✕</span>
    </span>
  `).join("");
}

document.getElementById("addCategoryBtn").addEventListener("click", async () => {
  const input = document.getElementById("newCategoryInput");
  const name = input.value.trim();
  if(!name){ showToast("Please enter a category name!", "error"); return; }
  if(categories.some(c => c.name.toLowerCase() === name.toLowerCase())){
    showToast("This category already exists!", "error");
    return;
  }

  const ref = await userCategoriesRef().add({ name });
  categories.push({ id: ref.id, name });
  input.value = "";
  renderCategoryOptions();
  renderCategoryManageList();
  showToast("Category added!", "success");
});

// Renaming cascades: every expense currently tagged with the old name
// gets updated to the new name too, so nothing silently becomes "Uncategorized".
async function renameCategory(id, oldName){
  const newName = prompt("Enter new category name:", oldName);
  if(!newName || !newName.trim() || newName.trim() === oldName) return;
  const trimmed = newName.trim();

  showLoading("Updating category...");

  await userCategoriesRef().doc(id).set({ name: trimmed });

  const affected = expenses.filter(e => e.category === oldName);
  for(let i=0; i<affected.length; i+=400){
    const chunk = affected.slice(i, i+400);
    const batch = db.batch();
    chunk.forEach(e => batch.update(userExpensesRef().doc(e.id), { category: trimmed }));
    await batch.commit();
  }
  expenses.forEach(e => { if(e.category === oldName) e.category = trimmed; });

  const cat = categories.find(c => c.id === id);
  if(cat) cat.name = trimmed;

  renderCategoryOptions();
  renderCategoryManageList();
  hideLoading();
  showToast("Category renamed successfully!", "success");
}

// Deleting a category doesn't touch the expenses themselves - they just
// fall back to "Uncategorized" instead of losing any data.
async function deleteCategory(id, name){
  if(!confirm(`Delete the category "${name}"?\n\nAll expenses under this category will become Uncategorized, but they will not be deleted.`)) return;

  showLoading("Deleting category...");

  const affected = expenses.filter(e => e.category === name);
  for(let i=0; i<affected.length; i+=400){
    const chunk = affected.slice(i, i+400);
    const batch = db.batch();
    chunk.forEach(e => batch.update(userExpensesRef().doc(e.id), { category: "" }));
    await batch.commit();
  }
  expenses.forEach(e => { if(e.category === name) e.category = ""; });

  await userCategoriesRef().doc(id).delete();
  categories = categories.filter(c => c.id !== id);

  renderCategoryOptions();
  renderCategoryManageList();
  hideLoading();
  showToast("Category deleted!", "success");
}

document.getElementById("expenseCategoryFilter").addEventListener("change", (e) => {
  currentCategoryFilter = e.target.value;
  renderExpenses();
});

document.getElementById("expenseSortBy").addEventListener("change", (e) => {
  currentExpenseSort = e.target.value;
  renderExpenses();
});

// ===========================
// Search (inside "All Expenses")
// ===========================
document.getElementById("expenseSearchInput").addEventListener("input", (e) => {
  expenseSearchQuery = e.target.value.trim().toLowerCase();
  renderExpenses();
});

// ===========================
// Dropdown Menus (All Expenses / Monthly & Yearly Summary)
// ===========================
function setupDropdown(btnId, contentId){
  const btn = document.getElementById(btnId);
  const content = document.getElementById(contentId);
  btn.addEventListener("click", () => {
    content.classList.toggle("open");
    btn.classList.toggle("active");
  });
}

setupDropdown("expenseDropdownBtn", "expenseDropdownContent");
setupDropdown("summaryDropdownBtn", "summaryDropdownContent");
setupDropdown("eidAllDropdownBtn", "eidAllDropdownContent");
setupDropdown("eidSummaryDropdownBtn", "eidSummaryDropdownContent");
setupDropdown("trashDropdownBtn", "trashDropdownContent");
setupDropdown("categoryDropdownBtn", "categoryDropdownContent");

// ===========================
// Expense Functions
// ===========================
async function addExpense(){
  const item=document.getElementById("item").value;
  const amount=parseFloat(document.getElementById("amount").value);
  const category=document.getElementById("expenseCategory").value;
  const date=document.getElementById("date").value;
  if(!item || !amount || !date){ showToast("Please fill in all fields!", "error"); return; }

  const note=document.getElementById("expenseNote").value.trim();

  const entry = {item,amount,category,date,note};
  const wasEditing = editingExpenseIndex !== -1;

  if(editingExpenseIndex === -1){
    await userExpensesRef().add(entry);
    // onSnapshot will automatically update the expenses array and re-render
  } else {
    const id = expenses[editingExpenseIndex].id;
    await userExpensesRef().doc(id).set(entry);
    editingExpenseIndex = -1;
    // onSnapshot will handle re-render
  }

  document.getElementById("item").value="";
  document.getElementById("amount").value="";
  document.getElementById("expenseCategory").value="";
  document.getElementById("date").value="";
  document.getElementById("expenseNote").value="";
  showToast(wasEditing ? "Expense updated!" : "Expense saved!", "success");
}

function editExpense(i){
  const e = expenses[i];
  document.getElementById("item").value = e.item;
  document.getElementById("amount").value = e.amount;
  document.getElementById("expenseCategory").value = e.category || "";
  document.getElementById("date").value = e.date;
  document.getElementById("expenseNote").value = e.note || "";
  editingExpenseIndex = i;
}

async function deleteExpense(i){
  const e = expenses[i];
  const confirmMsg = `Move this expense to trash?\n\n${e.item} — ${fmt(e.amount)} (${e.date})\n\nYou can restore it within 7 days.`;
  if(!confirm(confirmMsg)) return;

  const { id, ...entry } = e;
  await userTrashExpensesRef().add({ ...entry, deletedAt: new Date().toISOString() });
  await userExpensesRef().doc(id).delete();
  // onSnapshot will remove it from expenses[] and re-render automatically

  await loadTrash();
  renderTrash();
  showToast("Expense moved to Trash", "success");
}

// Builds the month-wise quick filter buttons inside the "All Expenses" dropdown
function renderExpenseMonthNav(){
  const nav = document.getElementById("expenseMonthNav");
  nav.innerHTML = "";

  const keysSet = new Set();
  expenses.forEach(e=>{
    const dt = new Date(e.date);
    keysSet.add(`${dt.getFullYear()}-${dt.getMonth()}`);
  });

  // Newest month first
  const keys = Array.from(keysSet).sort((a,b)=>{
    const [ay,am] = a.split("-").map(Number);
    const [by,bm] = b.split("-").map(Number);
    return (by*12+bm) - (ay*12+am);
  });

  // Reset filter if the currently selected month no longer has any expenses
  if(currentExpenseFilter !== "all" && !keys.includes(currentExpenseFilter)){
    currentExpenseFilter = "all";
  }

  const allBtn = document.createElement("button");
  allBtn.textContent = "All";
  allBtn.className = currentExpenseFilter === "all" ? "active" : "";
  allBtn.onclick = () => { currentExpenseFilter = "all"; renderExpenseMonthNav(); renderExpenses(); };
  nav.appendChild(allBtn);

  keys.forEach(key=>{
    const [y,m] = key.split("-").map(Number);
    const btn = document.createElement("button");
    btn.textContent = `${monthNames[m]} ${y}`;
    btn.className = currentExpenseFilter === key ? "active" : "";
    btn.onclick = () => { currentExpenseFilter = key; renderExpenseMonthNav(); renderExpenses(); };
    nav.appendChild(btn);
  });
}

// FIXED: builds all rows into an array first, then sets innerHTML ONCE.
// (Previously used repeated innerHTML += in a loop, which re-parses the
// whole table every iteration and becomes extremely slow / appears to
// "freeze" once there are hundreds of rows, e.g. when "All" is selected.)
function renderExpenses(){
  const tbody=document.querySelector("#expenseTable tbody");
  const totalEl = document.getElementById("expenseTotal");

  const indexed = expenses.map((e,i)=>({ ...e, _i:i }));

  const filtered = indexed.filter(e=>{
    if(currentExpenseFilter !== "all"){
      const dt = new Date(e.date);
      const key = `${dt.getFullYear()}-${dt.getMonth()}`;
      if(key !== currentExpenseFilter) return false;
    }
    if(expenseSearchQuery && !e.item.toLowerCase().includes(expenseSearchQuery)) return false;
    if(currentCategoryFilter === "__uncategorized__"){
      if(e.category) return false;
    } else if(currentCategoryFilter !== "all"){
      if(e.category !== currentCategoryFilter) return false;
    }
    return true;
  });

  switch(currentExpenseSort){
    case "date-desc":
      filtered.sort((a,b) => new Date(b.date) - new Date(a.date));
      break;
    case "amount-asc":
      filtered.sort((a,b) => a.amount - b.amount);
      break;
    case "amount-desc":
      filtered.sort((a,b) => b.amount - a.amount);
      break;
    case "date-asc":
    default:
      filtered.sort((a,b) => new Date(a.date) - new Date(b.date));
  }

  let total = 0;
  const rows = filtered.map(e=>{
    total += e.amount;
    return `<tr>
      <td>${e.item}</td><td>${e.category || "—"}</td><td>${fmt(e.amount)}</td><td>${e.date}</td>
      <td>${e.note || "—"}</td>
      <td>
        <button onclick="editExpense(${e._i})">Edit</button>
        <button onclick="deleteExpense(${e._i})">Delete</button>
      </td>
    </tr>`;
  });
  tbody.innerHTML = rows.join("");

  const label = currentExpenseFilter === "all"
    ? "All Time"
    : (() => {
        const [y,m] = currentExpenseFilter.split("-").map(Number);
        return `${monthNames[m]} ${y}`;
      })();
  totalEl.textContent = `${label} Total: ${fmt(total)}`;
}

// ===========================
// Monthly & Yearly Tables
// ===========================
// FIXED: same issue as renderExpenses - build full HTML strings first,
// then assign innerHTML once per container instead of repeatedly
// appending inside nested loops.
function renderMonthlyYearlyTables(){
  const monthlyTables=document.getElementById("monthlyTables");
  const yearlyTables=document.getElementById("yearlyTables");
  const months=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthlyData={}, yearlyData={};

  expenses.forEach(e=>{
    const dt=new Date(e.date);
    const y=dt.getFullYear();
    const m=dt.getMonth();
    if(!monthlyData[y]) monthlyData[y]={};
    if(!monthlyData[y][m]) monthlyData[y][m]=[];
    monthlyData[y][m].push(e);
    yearlyData[y]=(yearlyData[y]||0)+e.amount;
  });

  const years = Object.keys(monthlyData).sort((a,b)=>a-b);

  let monthlyHtml = "";
  years.forEach(y=>{
    monthlyHtml += `<h3>Year: ${y}</h3>`;
    for(let m=0; m<12; m++){
      const data = monthlyData[y][m] || [];
      if(data.length===0) continue;
      const total = data.reduce((sum,d)=>sum+d.amount,0);
      let t=`<h4>${months[m]} - Total: ${fmt(total)}</h4>
        <div class="table-wrapper">
        <table><tr><th>Item</th><th>Category</th><th>Amount</th><th>Date</th></tr>`;
      data.forEach(d=>{ t+=`<tr><td>${d.item}</td><td>${d.category || "—"}</td><td>${fmt(d.amount)}</td><td>${d.date}</td></tr>`; });
      t+="</table></div>";
      monthlyHtml += t;
    }
  });
  monthlyTables.innerHTML = monthlyHtml;

  let yearlyHtml = "";
  years.forEach(y=>{
    yearlyHtml += `<h3>Year: ${y} - Total: ${fmt(yearlyData[y])}</h3>`;
  });
  yearlyTables.innerHTML = yearlyHtml;
}

// ===========================
// Charts
// ===========================
function renderCharts(){
  const monthlyTotals={}, yearlyTotals={};
  expenses.forEach(e=>{
    const dt=new Date(e.date);
    const y=dt.getFullYear(), m=dt.getMonth();
    const key=`${y}-${m+1}`;
    monthlyTotals[key]=(monthlyTotals[key]||0)+e.amount;
    yearlyTotals[y]=(yearlyTotals[y]||0)+e.amount;
  });

  if(monthlyChart) monthlyChart.destroy();
  monthlyChart=new Chart(document.getElementById("monthlyChart"),{
    type:"bar",
    data:{labels:Object.keys(monthlyTotals), datasets:[{label:"Monthly Spending", data:Object.values(monthlyTotals), backgroundColor:"#36a2eb"}]},
    options:{scales:{y:{beginAtZero:true}}}
  });

  if(yearlyChart) yearlyChart.destroy();
  yearlyChart=new Chart(document.getElementById("yearlyChart"),{
    type:"pie",
    data:{labels:Object.keys(yearlyTotals), datasets:[{data:Object.values(yearlyTotals), backgroundColor:["#ff6384","#36a2eb","#ffce56","#4caf50","#9c27b0","#ff9f40","#4bc0c0","#9966ff","#c9cbcf","#ff6384","#36a2eb","#ffce56"]}]}
  });

  // Category-wise breakdown
  const categoryTotals = {};
  expenses.forEach(e=>{
    const cat = e.category || "Uncategorized";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + e.amount;
  });
  const catKeys = Object.keys(categoryTotals);
  if(categoryChart) categoryChart.destroy();
  categoryChart = new Chart(document.getElementById("categoryChart"), {
    type: "pie",
    data: {
      labels: catKeys,
      datasets: [{
        data: catKeys.map(k => categoryTotals[k]),
        backgroundColor: ["#17a2b8","#ff6384","#36a2eb","#ffce56","#4caf50","#9c27b0","#ff9f40","#6f42c1","#e83e8c","#795548","#c9cbcf"]
      }]
    }
  });
}

// ===========================
// Export All Data to PDF
// ===========================
document.getElementById("exportPdfBtn").addEventListener("click", exportAllDataToPDF);
document.getElementById("exportExcelBtn").addEventListener("click", exportAllDataToExcel);

function exportAllDataToPDF(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const generatedOn = new Date().toLocaleDateString();
  const mNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const totalExpenses = expenses.reduce((sum,e)=>sum+e.amount,0);
  const totalIncome   = salamis.reduce((sum,s)=>sum+s.amount,0);

  // ─── helpers ────────────────────────────────────────────────────────────────
  function addPageNumbers(){
    const pageCount = doc.internal.getNumberOfPages();
    for(let i=1;i<=pageCount;i++){
      doc.setPage(i);
      doc.setFontSize(8); doc.setFont(undefined,"normal"); doc.setTextColor(150);
      doc.text(`Page ${i} of ${pageCount}`, 105, 292, {align:"center"});
      doc.setTextColor(30,30,30);
    }
  }

  // ─── COVER PAGE ─────────────────────────────────────────────────────────────
  doc.setFillColor(37,99,235);
  doc.rect(0,0,210,44,"F");
  doc.setTextColor(255,255,255);
  doc.setFontSize(20); doc.setFont(undefined,"bold");
  doc.text("Expense Tracker — Full Report", 14, 18);
  doc.setFontSize(10); doc.setFont(undefined,"normal");
  doc.text(`Generated: ${generatedOn}`, 14, 28);
  doc.text(`Total entries: ${expenses.length} expenses, ${salamis.length} bonus/income`, 14, 36);
  doc.setTextColor(30,30,30);

  // Summary table
  doc.setFontSize(12); doc.setFont(undefined,"bold");
  doc.text("Financial Summary", 14, 54);
  doc.autoTable({
    startY: 58,
    head: [["", "Amount"]],
    body: [
      ["Total Expenses",          fmt(totalExpenses)],
      ["Total Bonus/Income",      fmt(totalIncome)],
      ["Net (Income − Expenses)", fmt(totalIncome - totalExpenses)],
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [37,99,235] },
    columnStyles: { 1: { halign:"right" } },
    margin: { left:14, right:14 }
  });

  // Category breakdown
  const catTotals = {};
  expenses.forEach(e=>{ const c=e.category||"Uncategorized"; catTotals[c]=(catTotals[c]||0)+e.amount; });
  const catRows = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([c,v])=>[c, fmt(v), `${totalExpenses?((v/totalExpenses)*100).toFixed(1):0}%`]);

  let y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12); doc.setFont(undefined,"bold");
  doc.text("Expenses by Category", 14, y);
  doc.autoTable({
    startY: y+4,
    head: [["Category","Total","% of Expenses"]],
    body: catRows,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [124,58,237] },
    columnStyles: { 1:{halign:"right"}, 2:{halign:"right"} },
    margin: { left:14, right:14 }
  });

  // ─── EXPENSES: Year → Month ──────────────────────────────────────────────────
  doc.addPage();
  doc.setFillColor(37,99,235);
  doc.rect(0,0,210,20,"F");
  doc.setTextColor(255,255,255); doc.setFontSize(14); doc.setFont(undefined,"bold");
  doc.text("Expenses — Monthly & Yearly Summary", 14, 13);
  doc.setTextColor(30,30,30);

  const expByYear = {};
  expenses.forEach(e=>{
    const dt=new Date(e.date); const yr=dt.getFullYear(), mo=dt.getMonth();
    if(!expByYear[yr]) expByYear[yr]={};
    if(!expByYear[yr][mo]) expByYear[yr][mo]=[];
    expByYear[yr][mo].push(e);
  });

  y = 26;
  Object.keys(expByYear).sort().forEach(year=>{
    if(y > 265){ doc.addPage(); y = 14; }
    doc.setFillColor(30,58,138);
    doc.rect(0,y-5,210,12,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(13); doc.setFont(undefined,"bold");
    doc.text(`Year: ${year}`, 14, y+3);
    doc.setTextColor(30,30,30); y += 12;

    let yearTotal=0;
    Object.keys(expByYear[year]).sort((a,b)=>a-b).forEach(mo=>{
      const data=expByYear[year][mo].sort((a,b)=>new Date(a.date)-new Date(b.date));
      const monthTotal=data.reduce((s,e)=>s+e.amount,0);
      yearTotal+=monthTotal;

      if(y>265){ doc.addPage(); y=14; }
      doc.setFontSize(10); doc.setFont(undefined,"bold"); doc.setTextColor(30,30,30);
      doc.setFillColor(238,242,255);
      doc.rect(14,y-4,182,8,"F");
      doc.setTextColor(37,99,235);
      doc.text(`${mNames[mo]} ${year}`, 16, y+1);
      doc.text(`Total: ${fmt(monthTotal)}`, 196, y+1, {align:"right"});
      doc.setTextColor(30,30,30); y+=8;

      doc.autoTable({
        startY: y,
        head: [["Item","Category","Amount","Date","Note"]],
        body: data.map(e=>[e.item, e.category||"—", fmt(e.amount), e.date, e.note||"—"]),
        styles: { fontSize: 7.5 },
        headStyles: { fillColor: [99,102,241] },
        margin: { left:14, right:14 },
        alternateRowStyles: { fillColor: [248,249,255] }
      });
      y = doc.lastAutoTable.finalY + 7;
    });

    if(y>265){ doc.addPage(); y=14; }
    doc.setFillColor(37,99,235);
    doc.rect(14,y-4,182,9,"F");
    doc.setTextColor(255,255,255); doc.setFont(undefined,"bold"); doc.setFontSize(10);
    doc.text(`Year ${year}  —  Total Expenses: ${fmt(yearTotal)}`, 16, y+2);
    doc.setTextColor(30,30,30); y+=14;
  });

  // ─── BONUS/INCOME: Year → Month ─────────────────────────────────────────────
  doc.addPage();
  doc.setFillColor(22,163,74);
  doc.rect(0,0,210,20,"F");
  doc.setTextColor(255,255,255); doc.setFontSize(14); doc.setFont(undefined,"bold");
  doc.text("Bonus / Income — Monthly & Yearly Summary", 14, 13);
  doc.setTextColor(30,30,30);

  const salByYear={};
  salamis.forEach(s=>{
    if(!salByYear[s.year]) salByYear[s.year]={};
    if(!salByYear[s.year][s.month]) salByYear[s.year][s.month]=[];
    salByYear[s.year][s.month].push(s);
  });

  y=26;
  Object.keys(salByYear).sort().forEach(year=>{
    if(y>265){ doc.addPage(); y=14; }
    doc.setFillColor(20,83,45);
    doc.rect(0,y-5,210,12,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(13); doc.setFont(undefined,"bold");
    doc.text(`Year: ${year}`, 14, y+3);
    doc.setTextColor(30,30,30); y+=12;

    let yearTotal=0;
    Object.keys(salByYear[year]).sort((a,b)=>mNames.indexOf(a)-mNames.indexOf(b)).forEach(month=>{
      const data=salByYear[year][month];
      const monthTotal=data.reduce((s,e)=>s+e.amount,0);
      yearTotal+=monthTotal;

      if(y>265){ doc.addPage(); y=14; }
      doc.setFillColor(240,253,244);
      doc.rect(14,y-4,182,8,"F");
      doc.setTextColor(22,163,74);
      doc.setFontSize(10); doc.setFont(undefined,"bold");
      doc.text(`${month} ${year}`, 16, y+1);
      doc.text(`Total: ${fmt(monthTotal)}`, 196, y+1, {align:"right"});
      doc.setTextColor(30,30,30); y+=8;

      doc.autoTable({
        startY: y,
        head: [["Date","Giver","Amount"]],
        body: data.map(s=>[s.date, s.giver, fmt(s.amount)]),
        styles: { fontSize: 7.5 },
        headStyles: { fillColor: [22,163,74] },
        margin: { left:14, right:14 },
        alternateRowStyles: { fillColor: [240,253,244] }
      });
      y = doc.lastAutoTable.finalY + 7;
    });

    if(y>265){ doc.addPage(); y=14; }
    doc.setFillColor(22,163,74);
    doc.rect(14,y-4,182,9,"F");
    doc.setTextColor(255,255,255); doc.setFont(undefined,"bold"); doc.setFontSize(10);
    doc.text(`Year ${year}  —  Total Income: ${fmt(yearTotal)}`, 16, y+2);
    doc.setTextColor(30,30,30); y+=14;
  });

  addPageNumbers();
  const fileDate=generatedOn.replace(/\//g,"-");
  doc.save(`expense_tracker_report_${fileDate}.pdf`);
}

function exportAllDataToExcel(){
 try {
  if(typeof XLSX === "undefined"){
    showToast("Excel library failed to load. Check your internet connection and try again.", "error");
    return;
  }
  const wb = XLSX.utils.book_new();
  const months = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];

  // ── Sheet 1: All Expenses (flat, sorted) ──────────────────────────
  const expFlat = expenses
    .slice()
    .sort((a,b) => new Date(a.date) - new Date(b.date))
    .map(e => ({ Date: e.date, Item: e.item, Category: e.category || "Uncategorized", Amount: e.amount, Note: e.note || "" }));
  const wsFlat = XLSX.utils.json_to_sheet(expFlat);
  wsFlat["!cols"] = [{wch:14},{wch:30},{wch:18},{wch:12},{wch:25}];
  XLSX.utils.book_append_sheet(wb, wsFlat, "All Expenses");

  // ── Sheet 2: Expenses — Monthly & Yearly Summary ──────────────────
  const expByYear = {};
  expenses.forEach(e => {
    const dt = new Date(e.date);
    const y = dt.getFullYear(), m = dt.getMonth();
    if(!expByYear[y]) expByYear[y] = {};
    if(!expByYear[y][m]) expByYear[y][m] = [];
    expByYear[y][m].push(e);
  });

  const summaryRows = [["Year","Month","Item","Category","Amount","Note"]];
  Object.keys(expByYear).sort().forEach(y => {
    let yearTotal = 0;
    for(let m = 0; m < 12; m++){
      const entries = expByYear[y][m];
      if(!entries || !entries.length) continue;
      const monthTotal = entries.reduce((s,e) => s + e.amount, 0);
      yearTotal += monthTotal;
      entries.forEach(e => summaryRows.push([y, months[m], e.item, e.category || "Uncategorized", e.amount, e.note || ""]));
      summaryRows.push(["", `${months[m]} Total`, "", "", monthTotal, ""]);
      summaryRows.push(["","","","","",""]);
    }
    summaryRows.push([`Year ${y} Total`, "", "", "", yearTotal, ""]);
    summaryRows.push(["","","","","",""]);
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [{wch:14},{wch:16},{wch:30},{wch:18},{wch:12},{wch:25}];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Expense Summary");

  // ── Sheet 3: Bonus/Income — Monthly & Yearly Summary ─────────────
  const salByYear = {};
  salamis.forEach(s => {
    if(!salByYear[s.year]) salByYear[s.year] = {};
    if(!salByYear[s.year][s.month]) salByYear[s.year][s.month] = [];
    salByYear[s.year][s.month].push(s);
  });

  const incomeRows = [["Year","Month","Date","Giver","Amount"]];
  Object.keys(salByYear).sort().forEach(y => {
    let yearTotal = 0;
    months.forEach(mn => {
      const entries = salByYear[y][mn];
      if(!entries || !entries.length) return;
      const monthTotal = entries.reduce((s,e) => s + e.amount, 0);
      yearTotal += monthTotal;
      entries.forEach(s => incomeRows.push([y, mn, s.date, s.giver, s.amount]));
      incomeRows.push(["", `${mn} Total`, "", "", monthTotal]);
      incomeRows.push(["","","","",""]);
    });
    incomeRows.push([`Year ${y} Total`, "", "", "", yearTotal]);
    incomeRows.push(["","","","",""]);
  });

  const wsIncome = XLSX.utils.aoa_to_sheet(incomeRows);
  wsIncome["!cols"] = [{wch:12},{wch:14},{wch:8},{wch:30},{wch:12}];
  XLSX.utils.book_append_sheet(wb, wsIncome, "Bonus_Income Summary");

  // ── Sheet 4: Category Breakdown ───────────────────────────────────
  const catTotals = {};
  expenses.forEach(e => {
    const cat = e.category || "Uncategorized";
    catTotals[cat] = (catTotals[cat] || 0) + e.amount;
  });
  const grandTotal = Object.values(catTotals).reduce((a,b) => a+b, 0);
  const catRows = [["Category","Total Amount","Percentage"]];
  Object.entries(catTotals).sort((a,b) => b[1]-a[1]).forEach(([cat,total]) => {
    catRows.push([cat, total, ((total/grandTotal)*100).toFixed(1)+"%"]);
  });
  catRows.push(["GRAND TOTAL", grandTotal, "100%"]);
  const wsCat = XLSX.utils.aoa_to_sheet(catRows);
  wsCat["!cols"] = [{wch:22},{wch:16},{wch:14}];
  XLSX.utils.book_append_sheet(wb, wsCat, "Category Breakdown");

  // ── Download ──────────────────────────────────────────────────────
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const fileDate = new Date().toLocaleDateString("en-GB").replace(/\//g,"-");
  a.download = `expense_tracker_${fileDate}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast("Excel downloaded successfully!", "success");
 } catch(err){
  console.error("Excel export error:", err);
  showToast("Excel export failed: " + err.message, "error");
 }
}

// ===========================
// Bonus/Income Section
// ===========================
const eidForm=document.getElementById("eidForm");
const eidTables=document.getElementById("eidTables");

eidForm.addEventListener("submit", async e=>{
  e.preventDefault();
  const year=document.getElementById("eidYear").value;
  const month=document.getElementById("eidMonth").value;
  const date=document.getElementById("eidDate").value;
  const giver=document.getElementById("eidGiver").value;
  const amount=parseFloat(document.getElementById("eidAmount").value);
  if(!year||!month||!date||!giver||!amount){ showToast("Please fill in all fields!", "error"); return; }

  const entry = {year,month,date,giver,amount};
  const wasEditing = editingEidIndex !== -1;

  if(editingEidIndex === -1){
    await userSalamisRef().add(entry);
    // onSnapshot will automatically update the salamis array and re-render
  } else {
    const id = salamis[editingEidIndex].id;
    await userSalamisRef().doc(id).set(entry);
    editingEidIndex = -1;
    // onSnapshot will handle re-render
  }

  eidForm.reset();
  showToast(wasEditing ? "Bonus/Income updated!" : "Bonus/Income saved!", "success");
});

function editEidEntry(i){
  const s = salamis[i];
  document.getElementById("eidYear").value = s.year;
  document.getElementById("eidMonth").value = s.month;
  document.getElementById("eidDate").value = s.date;
  document.getElementById("eidGiver").value = s.giver;
  document.getElementById("eidAmount").value = s.amount;
  editingEidIndex = i;
}

async function deleteEidEntry(i){
  const s = salamis[i];
  const confirmMsg = `Move this Bonus/Income entry to trash?\n\n${s.giver} — ${fmt(s.amount)} (${s.month} ${s.date}, ${s.year})\n\nYou can restore it within 7 days.`;
  if(!confirm(confirmMsg)) return;

  const { id, ...entry } = s;
  await userTrashSalamisRef().add({ ...entry, deletedAt: new Date().toISOString() });
  await userSalamisRef().doc(id).delete();
  // onSnapshot will remove it from salamis[] and re-render automatically

  await loadTrash();
  renderTrash();
  showToast("Bonus/Income entry moved to Trash", "success");
}

// Builds the month-wise quick filter buttons inside the "All Bonus/Income" dropdown
function renderEidMonthNav(){
  const nav = document.getElementById("eidMonthNav");
  nav.innerHTML = "";

  const keysSet = new Set();
  salamis.forEach(s=>{
    const m = monthNames.indexOf(s.month);
    if(m === -1) return;
    keysSet.add(`${s.year}-${m}`);
  });

  // Newest month first
  const keys = Array.from(keysSet).sort((a,b)=>{
    const [ay,am] = a.split("-").map(Number);
    const [by,bm] = b.split("-").map(Number);
    return (by*12+bm) - (ay*12+am);
  });

  if(currentEidFilter !== "all" && !keys.includes(currentEidFilter)){
    currentEidFilter = "all";
  }

  const allBtn = document.createElement("button");
  allBtn.textContent = "All";
  allBtn.className = currentEidFilter === "all" ? "active" : "";
  allBtn.onclick = () => { currentEidFilter = "all"; renderEidMonthNav(); renderEidFlatTable(); };
  nav.appendChild(allBtn);

  keys.forEach(key=>{
    const [y,m] = key.split("-").map(Number);
    const btn = document.createElement("button");
    btn.textContent = `${monthNames[m]} ${y}`;
    btn.className = currentEidFilter === key ? "active" : "";
    btn.onclick = () => { currentEidFilter = key; renderEidMonthNav(); renderEidFlatTable(); };
    nav.appendChild(btn);
  });
}

// Flat, serially (date) sorted list for the "All Bonus/Income" dropdown,
// filterable by month, with a running total - mirrors renderExpenses().
function renderEidFlatTable(){
  const tbody = document.querySelector("#eidFlatTable tbody");
  const totalEl = document.getElementById("eidTotal");

  const indexed = salamis.map((s,i)=>({ ...s, _i:i }));

  const filtered = indexed.filter(s=>{
    if(currentEidFilter === "all") return true;
    const m = monthNames.indexOf(s.month);
    return `${s.year}-${m}` === currentEidFilter;
  });

  filtered.sort((a,b)=>{
    const da = new Date(Number(a.year), monthNames.indexOf(a.month), Number(a.date) || 1);
    const db = new Date(Number(b.year), monthNames.indexOf(b.month), Number(b.date) || 1);
    return da - db;
  });

  let total = 0;
  const rows = filtered.map(s=>{
    total += s.amount;
    return `<tr>
      <td>${s.date}</td><td>${s.giver}</td><td>${fmt(s.amount)}</td>
      <td>
        <button onclick="editEidEntry(${s._i})">Edit</button>
        <button onclick="deleteEidEntry(${s._i})">Delete</button>
      </td>
    </tr>`;
  });
  tbody.innerHTML = rows.join("");

  const label = currentEidFilter === "all"
    ? "All Time"
    : (() => {
        const [y,m] = currentEidFilter.split("-").map(Number);
        return `${monthNames[m]} ${y}`;
      })();
  totalEl.textContent = `${label} Total Income: ${fmt(total)}`;
}

// ===========================
// Bonus/Income Charts (mirrors renderCharts() for expenses)
// ===========================
function renderIncomeCharts(){
  const monthlyTotals = {}, yearlyTotals = {};
  salamis.forEach(s=>{
    const m = monthNames.indexOf(s.month);
    if(m === -1) return;
    const key = `${s.year}-${m+1}`;
    monthlyTotals[key] = (monthlyTotals[key] || 0) + s.amount;
    yearlyTotals[s.year] = (yearlyTotals[s.year] || 0) + s.amount;
  });

  // Sort chronologically (keys look like "2025-9", "2026-10" etc.)
  const monthKeys = Object.keys(monthlyTotals).sort((a,b)=>{
    const [ay,am] = a.split("-").map(Number);
    const [by,bm] = b.split("-").map(Number);
    return (ay*12+am) - (by*12+bm);
  });
  const monthValues = monthKeys.map(k => monthlyTotals[k]);

  if(monthlyIncomeChart) monthlyIncomeChart.destroy();
  monthlyIncomeChart = new Chart(document.getElementById("monthlyIncomeChart"), {
    type: "bar",
    data: {
      labels: monthKeys,
      datasets: [{ label: "Monthly Bonus/Income", data: monthValues, backgroundColor: "#28a745" }]
    },
    options: { scales: { y: { beginAtZero: true } } }
  });

  const yearKeys = Object.keys(yearlyTotals).sort();
  if(yearlyIncomeChart) yearlyIncomeChart.destroy();
  yearlyIncomeChart = new Chart(document.getElementById("yearlyIncomeChart"), {
    type: "pie",
    data: {
      labels: yearKeys,
      datasets: [{
        data: yearKeys.map(y => yearlyTotals[y]),
        backgroundColor: ["#28a745","#20c997","#17a2b8","#6f42c1","#fd7e14","#ffc107","#dc3545","#6610f2","#e83e8c","#795548"]
      }]
    }
  });
}

// FIXED: same innerHTML += issue - build the full string first.
function renderEidTables(){
  const grouped={};
  salamis.forEach((s,i)=>{
    if(!grouped[s.year]) grouped[s.year]={};
    if(!grouped[s.year][s.month]) grouped[s.year][s.month]=[];
    grouped[s.year][s.month].push({...s,index:i});
  });

  let html = "";
  for(let y in grouped){
    const yearTotal = Object.values(grouped[y])
      .flat()
      .reduce((sum,s)=>sum+s.amount,0);
    html += `<h3>Year: ${y} - Total: ${fmt(yearTotal)}</h3>`;
    for(let m in grouped[y]){
      const monthTotal = grouped[y][m].reduce((sum,s)=>sum+s.amount,0);
      let t=`<h4>${m} - Total: ${fmt(monthTotal)}</h4><div class="table-wrapper"><table>
        <tr><th>Date</th><th>Giver</th><th>Amount</th><th>Action</th></tr>`;
      grouped[y][m].forEach(s=>{
        t+=`<tr>
          <td>${s.date}</td><td>${s.giver}</td><td>${fmt(s.amount)}</td>
          <td>
            <button onclick="editEidEntry(${s.index})">Edit</button>
            <button onclick="deleteEidEntry(${s.index})">Delete</button>
          </td>
        </tr>`;
      });
      t+="</table></div>";
      html += t;
    }
  }
  eidTables.innerHTML = html;
}
