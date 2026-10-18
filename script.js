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

// ── Persistent login: keep user signed in across browser closes ──
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});


// Enable offline persistence so repeat visits load instantly from cache.
// Must be called before any other Firestore operations.
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if(err.code !== "failed-precondition" && err.code !== "unimplemented"){
    console.warn("Firestore persistence error:", err);
  }
});

let currentUser = null;

// ===========================
// Lazy-load heavy export libs on first use
// ===========================
let _exportLibsLoaded = false;
function _loadScript(src){
  return new Promise((resolve, reject) => {
    // If already loaded (same src), resolve immediately
    if(document.querySelector(`script[src="${src}"]`)){
      resolve(); return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload  = () => resolve();
    s.onerror = () => reject(new Error("Failed to load: " + src));
    document.head.appendChild(s);
  });
}
async function loadExportLibs(){
  if(_exportLibsLoaded) return;
  // jsPDF MUST load before autoTable (autoTable patches the jsPDF prototype)
  await _loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  await _loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js");
  await _loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
  _exportLibsLoaded = true;
}

// ===========================
// IntersectionObserver — render charts only when their canvas enters viewport
// ===========================
const _chartObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if(!entry.isIntersecting) return;
    const id = entry.target.id;
    if(id === "monthlyChart" || id === "yearlyChart" || id === "categoryChart") renderCharts();
    if(id === "comparisonChart") renderComparisonChart();
    if(id === "monthlyIncomeChart" || id === "yearlyIncomeChart" ||
       id === "incomeCategoryChart" || id === "incomeMonthlyByCategoryChart") renderIncomeCharts();
  });
}, { rootMargin: "200px" });

function observeChartCanvases(){
  ["monthlyChart","yearlyChart","categoryChart","comparisonChart",
   "monthlyIncomeChart","yearlyIncomeChart","incomeCategoryChart","incomeMonthlyByCategoryChart"
  ].forEach(id => {
    const el = document.getElementById(id);
    if(el) _chartObserver.observe(el);
  });
}

// ===========================
// UI Helpers: Loading Overlay & Toast Notifications
// ===========================

// ===========================
// Number Formatting
// ===========================
// Currency state — updated by the currency bar
// ===========================
const _CURRENCY_SYMBOLS = { BDT:"৳", USD:"$", EUR:"€", GBP:"£", INR:"₹", SAR:"﷼" };
let _activeCurrency  = "BDT";
let _conversionRate  = 1;      // 1 BDT → X activeCurrency  (BDT base)

const _nf = new Intl.NumberFormat("en-IN");
function fmt(amount){
  const converted = Number(amount) * _conversionRate;
  const sym = _CURRENCY_SYMBOLS[_activeCurrency] || _activeCurrency + " ";
  return sym + " " + _nf.format(+converted.toFixed(2));
}

// XSS-safe HTML escaping — regex lookup, no DOM allocation.
const _ESC = {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, c => _ESC[c]); }

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

// Locally cached income categories
let incomeCategories = [];
const DEFAULT_INCOME_CATEGORIES = ["Business","Tuition","Gift","Bonus","Job","Other"];

// Income category chart instances
let incomeCategoryChart, incomeMonthlyByCategoryChart;

// Current search text for the "All Expenses" list
let expenseSearchQuery = "";

// Current category filter ("all" or a category name) for the "All Expenses" list
let currentCategoryFilter = "all";

// Current sort mode for the "All Expenses" list
let currentExpenseSort = "date-asc";

// Search & sort for the "All Bonus/Income" list
let eidSearchQuery = "";
let currentEidSort = "date-asc";

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
async function doSignup() {
  const email = document.getElementById("signupEmail").value.trim();
  const pass  = document.getElementById("signupPassword").value;
  const btn   = document.getElementById("signupBtn");
  const btnText = btn.querySelector(".auth-btn-text");
  const btnIcon = btn.querySelector(".auth-btn-icon");
  authError.textContent = "";
  authError.style.color = "";
  if(!email || !pass){ authError.textContent = "Please enter your email and password."; return; }
  if(pass.length < 8){ authError.textContent = "Password must be at least 8 characters."; return; }
  btn.disabled = true;
  if(btnText) btnText.textContent = "Creating account...";
  if(btnIcon) btnIcon.textContent = "⏳";
  try {
    await auth.createUserWithEmailAndPassword(email, pass);
  } catch(err){
    authError.textContent = "Sign-up failed. Please check your details and try again.";
    btn.disabled = false;
    if(btnText) btnText.textContent = "Create Account";
    if(btnIcon) btnIcon.textContent = "✓";
  }
}

document.getElementById("signupBtn").addEventListener("click", doSignup);
document.getElementById("signupPassword").addEventListener("keydown", e => {
  if(e.key === "Enter"){ e.preventDefault(); doSignup(); }
});
document.getElementById("signupEmail").addEventListener("keydown", e => {
  if(e.key === "Enter"){ e.preventDefault(); document.getElementById("signupPassword").focus(); }
});

async function doLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const pass  = document.getElementById("loginPassword").value;
  const btn   = document.getElementById("loginBtn");
  const btnText = btn.querySelector(".auth-btn-text");
  const btnIcon = btn.querySelector(".auth-btn-icon");
  authError.textContent = "";
  authError.style.color = "";
  if(!email || !pass){ authError.textContent = "Please enter your email and password."; return; }
  // Loading state
  btn.disabled = true;
  if(btnText) btnText.textContent = "Signing in...";
  if(btnIcon) btnIcon.textContent = "⏳";
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    // onAuthStateChanged will fire and hide the auth screen
  } catch(err){
    authError.textContent = "Incorrect email or password. Please try again.";
    btn.disabled = false;
    if(btnText) btnText.textContent = "Login";
    if(btnIcon) btnIcon.textContent = "→";
  }
}

document.getElementById("loginBtn").addEventListener("click", doLogin);

// Enter key on password field triggers login
document.getElementById("loginPassword").addEventListener("keydown", e => {
  if(e.key === "Enter"){ e.preventDefault(); doLogin(); }
});
// Enter key on email field moves focus to password
document.getElementById("loginEmail").addEventListener("keydown", e => {
  if(e.key === "Enter"){ e.preventDefault(); document.getElementById("loginPassword").focus(); }
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
  } catch(err){
    // Always show success to avoid email enumeration
  }
  // Always show the same success message regardless of whether the email exists
  authError.style.color = "#28a745";
  authError.textContent = "If that email is registered, a password reset link has been sent. Check your inbox (and spam folder).";
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  // Clear per-user caches on logout
  if(currentUser){
    const uid = currentUser.uid;
    localStorage.removeItem("darkMode_cache");
    localStorage.removeItem("cat_cache_"   + uid);
    localStorage.removeItem("incat_cache_" + uid);
    localStorage.removeItem("theme_cache_" + uid);
    applyTheme("blue"); // reset to default on logout
  }
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
    document.body.classList.remove("auth-screen-active");

    // Show app shell instantly — dark mode + theme from localStorage while Firestore loads
    const cachedDark = localStorage.getItem("darkMode_cache");
    if(cachedDark === "true") document.body.classList.add("dark-mode");
    loadThemeFromCache(user.uid); // instant theme restore

    showLoading("Loading...");

    // Categories are served instantly from localStorage cache (if it exists),
    // then Firestore fetch runs in background inside each loader.
    await Promise.all([
      loadCategories(),
      loadIncomeCategories()
    ]);

    // Render form selects immediately — user sees a ready form right away
    renderCategoryOptions();
    renderIncomeCategoryOptions();
    applyDarkMode();
    hideLoading();

    // loadUserData runs in background — only needed for migration check & dark mode sync
    loadUserData().then(() => {
      localStorage.setItem("darkMode_cache", String(isDark));
      applyDarkMode(); // re-apply in case Firestore dark mode differs from cache
    }).catch(err => console.warn("loadUserData background error:", err));

    // Load theme from Firestore in background (cache already applied above)
    loadThemeFromFirestore();

    // Live listeners — first snapshot fires quickly from Firestore offline cache
    subscribeToExpenses();
    subscribeToSalamis();

    // Lazy chart rendering via IntersectionObserver
    observeChartCanvases();

    // Secondary data — deferred to idle so it never delays first paint
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 200));
    idle(async () => {
      await loadPinnedItems();
      renderPinnedItems();
    });
    idle(async () => {
      await loadTrash(/* deferPurge= */ true);
      renderTrash();
      purgeExpiredTrash();
    });
    idle(() => {
      renderCategoryManageList();
      renderIncomeCategoryManageList();
      checkForOldLocalData();
    });
  } else {
    currentUser = null;
    unsubscribeFromLiveData();
    expenses = [];
    salamis = [];
    appScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
    document.body.classList.add("auth-screen-active");
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
function userIncomeCategoriesRef(){
  return db.collection("users").doc(currentUser.uid).collection("income_categories");
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
let _expChartDebounce = null;
let _salDebounce = null;
let _salChartDebounce = null;

function subscribeToExpenses(){
  return new Promise((resolve) => {
    if(unsubscribeExpenses) unsubscribeExpenses();
    // Show skeleton immediately while waiting for Firestore
    showExpenseSkeleton();
    let firstLoad = true;
    unsubscribeExpenses = userExpensesRef().onSnapshot(snapshot => {
      expenses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if(firstLoad){ firstLoad = false; resolve(); }
      // Tables & summary: fast (200 ms)
      clearTimeout(_expDebounce);
      _expDebounce = setTimeout(() => {
        renderExpenseMonthNav();
        renderExpenses();
        renderMonthlyYearlyTables();
        renderSummaryCard();
        renderTop5();
        renderDowHeatmap();
      }, 200);
      // Charts: deferred (600 ms) so rapid edits don't thrash canvas
      clearTimeout(_expChartDebounce);
      _expChartDebounce = setTimeout(() => {
        renderCharts();
        renderComparisonChart();
      }, 600);
    }, err => {
      console.error("Expenses sync error:", err);
      if(firstLoad){ firstLoad = false; resolve(); }
    });
  });
}

function subscribeToSalamis(){
  return new Promise((resolve) => {
    if(unsubscribeSalamis) unsubscribeSalamis();
    // Show skeleton immediately
    showIncomeSkeleton();
    let firstLoad = true;
    unsubscribeSalamis = userSalamisRef().onSnapshot(snapshot => {
      salamis = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if(firstLoad){ firstLoad = false; resolve(); }
      // Tables & summary: fast (200 ms)
      clearTimeout(_salDebounce);
      _salDebounce = setTimeout(() => {
        renderEidMonthNav();
        renderEidFlatTable();
        renderEidTables();
        renderSummaryCard();
      }, 200);
      // Charts: deferred (600 ms)
      clearTimeout(_salChartDebounce);
      _salChartDebounce = setTimeout(() => {
        renderIncomeCharts();
        renderComparisonChart();
      }, 600);
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
    try {
      await batch.commit();
    } catch(err){
      console.error("Batch write failed:", err);
      showToast("Some data failed to save. Please try again.", "error");
      throw err;
    }
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
  // Spin animation
  toggleBtn.classList.remove("toggling");
  void toggleBtn.offsetWidth; // reflow to restart
  toggleBtn.classList.add("toggling");
  toggleBtn.addEventListener("animationend", () => toggleBtn.classList.remove("toggling"), { once: true });
  applyDarkMode();
  localStorage.setItem("darkMode_cache", String(isDark));
  await saveDarkMode();
});

// ===========================
// Trash (soft-delete with 30-day auto-purge)
// ===========================
async function loadTrash(deferPurge){
  const [expSnap, salSnap] = await Promise.all([
    userTrashExpensesRef().get(),
    userTrashSalamisRef().get()
  ]);
  trashedExpenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  trashedSalamis = salSnap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Called at idle time — deletes trash entries older than 30 days
async function purgeExpiredTrash(){
  if(!currentUser) return;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const expiredExp = trashedExpenses.filter(t => now - new Date(t.deletedAt).getTime() > thirtyDaysMs);
  const expiredSal = trashedSalamis.filter(t => now - new Date(t.deletedAt).getTime() > thirtyDaysMs);

  if(expiredExp.length || expiredSal.length){
    const batch = db.batch();
    expiredExp.forEach(t => batch.delete(userTrashExpensesRef().doc(t.id)));
    expiredSal.forEach(t => batch.delete(userTrashSalamisRef().doc(t.id)));
    try {
      await batch.commit();
      const expiredExpIds = new Set(expiredExp.map(t => t.id));
      const expiredSalIds = new Set(expiredSal.map(t => t.id));
      trashedExpenses = trashedExpenses.filter(t => !expiredExpIds.has(t.id));
      trashedSalamis = trashedSalamis.filter(t => !expiredSalIds.has(t.id));
    } catch(err){ console.error("Trash purge failed:", err); }
  }
}

function renderTrash(){
  const expBody = document.querySelector("#trashExpenseTable tbody");
  const expRows = trashedExpenses
    .slice()
    .sort((a,b) => new Date(b.deletedAt) - new Date(a.deletedAt))
    .map(t => `<tr>
      <td>${esc(t.item)}</td><td>${fmt(t.amount)}</td><td>${esc(t.date)}</td>
      <td>${new Date(t.deletedAt).toLocaleDateString()}</td>
      <td><button data-trash-exp-id="${esc(t.id)}">Restore</button></td>
    </tr>`);
  expBody.innerHTML = expRows.length ? expRows.join("") : `<tr><td colspan="5">Trash is empty</td></tr>`;

  const salBody = document.querySelector("#trashSalamiTable tbody");
  const salRows = trashedSalamis
    .slice()
    .sort((a,b) => new Date(b.deletedAt) - new Date(a.deletedAt))
    .map(t => `<tr>
      <td>${esc(t.giver)}</td><td>${fmt(t.amount)}</td><td>${esc(t.month)} ${esc(t.date)}, ${esc(t.year)}</td>
      <td>${new Date(t.deletedAt).toLocaleDateString()}</td>
      <td><button data-trash-sal-id="${esc(t.id)}">Restore</button></td>
    </tr>`);
  salBody.innerHTML = salRows.length ? salRows.join("") : `<tr><td colspan="5">Trash is empty</td></tr>`;
}

// Delegated click handler for all Restore buttons in the trash tables
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if(!btn) return;
  const expId = btn.dataset.trashExpId;
  const salId = btn.dataset.trashSalId;
  if(expId) restoreExpense(expId);
  if(salId) restoreEid(salId);
});

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
    <button type="button" class="pinned-chip" data-pin-id="${esc(p.id)}">
      📌 ${esc(p.text)}
      <span class="remove-pin" data-remove-pin-id="${esc(p.id)}">✕</span>
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

// Delegated click handler for pinned item chips & their remove buttons
document.getElementById("pinnedItemsList").addEventListener("click", (e) => {
  const removeSpan = e.target.closest("[data-remove-pin-id]");
  if(removeSpan){
    e.stopPropagation();
    removePin(removeSpan.dataset.removePinId);
    return;
  }
  const chip = e.target.closest("[data-pin-id]");
  if(chip) usePin(chip.dataset.pinId);
});

// ===========================
// Categories
// ===========================
// ── Category cache helpers ────────────────────────────────────────────────────
function _saveCatCache()    { try { localStorage.setItem("cat_cache_"   + currentUser.uid, JSON.stringify(categories));       } catch(e){} }
function _saveIncatCache()  { try { localStorage.setItem("incat_cache_" + currentUser.uid, JSON.stringify(incomeCategories)); } catch(e){} }

async function loadCategories(){
  // 1. Serve from localStorage immediately (zero network wait on repeat visits)
  const cacheKey = "cat_cache_" + currentUser.uid;
  try {
    const cached = localStorage.getItem(cacheKey);
    if(cached){ categories = JSON.parse(cached); }
  } catch(e){}

  // 2. Fetch from Firestore in background and refresh cache
  const snap = await userCategoriesRef().get();
  const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if(fetched.length === 0 && categories.length === 0){
    // New account — seed defaults
    const batch = db.batch();
    const newCats = DEFAULT_CATEGORIES.map(name => {
      const ref = userCategoriesRef().doc();
      batch.set(ref, { name });
      return { id: ref.id, name };
    });
    try {
      await batch.commit();
      categories = newCats;
    } catch(err){ console.error("Category seed failed:", err); }
  } else if(fetched.length > 0){
    categories = fetched;
  }

  // 3. Update cache with fresh data
  try { localStorage.setItem(cacheKey, JSON.stringify(categories)); } catch(e){}
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
      ${esc(c.name)}
      <span class="edit-cat" data-rename-cat-id="${esc(c.id)}" data-rename-cat-name="${esc(c.name)}">✏️</span>
      <span class="remove-cat" data-delete-cat-id="${esc(c.id)}" data-delete-cat-name="${esc(c.name)}">✕</span>
    </span>
  `).join("");
}

// Delegated click handler for expense category chips
document.getElementById("categoryManageList").addEventListener("click", (e) => {
  const renameEl = e.target.closest("[data-rename-cat-id]");
  if(renameEl){ renameCategory(renameEl.dataset.renameCatId, renameEl.dataset.renameCatName); return; }
  const deleteEl = e.target.closest("[data-delete-cat-id]");
  if(deleteEl){ deleteCategory(deleteEl.dataset.deleteCatId, deleteEl.dataset.deleteCatName); }
});

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
  _saveCatCache();
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
    try { await batch.commit(); } catch(err){ console.error("Category rename batch failed:", err); showToast("Update partially failed. Please try again.", "error"); }
  }
  expenses.forEach(e => { if(e.category === oldName) e.category = trimmed; });

  const cat = categories.find(c => c.id === id);
  if(cat) cat.name = trimmed;
  _saveCatCache();

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
    try { await batch.commit(); } catch(err){ console.error("Category delete batch failed:", err); showToast("Update partially failed. Please try again.", "error"); }
  }
  expenses.forEach(e => { if(e.category === name) e.category = ""; });

  await userCategoriesRef().doc(id).delete();
  categories = categories.filter(c => c.id !== id);
  _saveCatCache();

  renderCategoryOptions();
  renderCategoryManageList();
  hideLoading();
  showToast("Category deleted!", "success");
}

// ===========================
// Income Categories
// ===========================
async function loadIncomeCategories(){
  // 1. Serve from localStorage immediately (zero network wait on repeat visits)
  const cacheKey = "incat_cache_" + currentUser.uid;
  try {
    const cached = localStorage.getItem(cacheKey);
    if(cached){ incomeCategories = JSON.parse(cached); }
  } catch(e){}

  // 2. Fetch from Firestore in background and refresh cache
  const snap = await userIncomeCategoriesRef().get();
  const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if(fetched.length === 0 && incomeCategories.length === 0){
    // New account — seed defaults
    const batch = db.batch();
    const newCats = DEFAULT_INCOME_CATEGORIES.map(name => {
      const ref = userIncomeCategoriesRef().doc();
      batch.set(ref, { name });
      return { id: ref.id, name };
    });
    try {
      await batch.commit();
      incomeCategories = newCats;
    } catch(err){ console.error("Income category seed failed:", err); }
  } else if(fetched.length > 0){
    incomeCategories = fetched;
  }

  // 4. Migration: remove legacy categories, add missing ones
  const LEGACY_REMOVE = ["Ibrahim Bhaiya", "Family"];
  const REQUIRED_CATS = ["Business", "Tuition", "Gift", "Bonus", "Job", "Other"];
  const toRemove = incomeCategories.filter(c => LEGACY_REMOVE.includes(c.name));
  const existingNames = incomeCategories.map(c => c.name);
  const toAdd = REQUIRED_CATS.filter(name => !existingNames.includes(name));

  if(toRemove.length > 0 || toAdd.length > 0){
    try {
      const migBatch = db.batch();
      toRemove.forEach(c => migBatch.delete(userIncomeCategoriesRef().doc(c.id)));
      const addedCats = toAdd.map(name => {
        const ref = userIncomeCategoriesRef().doc();
        migBatch.set(ref, { name });
        return { id: ref.id, name };
      });
      await migBatch.commit();
      const removeIds = new Set(toRemove.map(c => c.id));
      incomeCategories = incomeCategories.filter(c => !removeIds.has(c.id)).concat(addedCats);
    } catch(err){ console.error("Income category migration failed:", err); }
  }

  // 3. Update cache with fresh data
  try { localStorage.setItem(cacheKey, JSON.stringify(incomeCategories)); } catch(e){}
}

function renderIncomeCategoryOptions(){
  const addSelect = document.getElementById("incomeCategory");
  if(!addSelect) return;
  const prevValue = addSelect.value;
  addSelect.innerHTML = `<option value="">Select Category</option>` +
    incomeCategories.map(c => `<option value="${c.name}">${c.name}</option>`).join("");
  if(incomeCategories.some(c => c.name === prevValue)) addSelect.value = prevValue;
}

function renderIncomeCategoryManageList(){
  const list = document.getElementById("incomeCategoryManageList");
  if(!list) return;
  if(!incomeCategories.length){
    list.innerHTML = `<span style="font-size:13px;color:#999;">No income categories yet</span>`;
    return;
  }
  list.innerHTML = incomeCategories.map(c => `
    <span class="category-chip">
      ${esc(c.name)}
      <span class="edit-cat" data-rename-inc-id="${esc(c.id)}" data-rename-inc-name="${esc(c.name)}">✏️</span>
      <span class="remove-cat" data-delete-inc-id="${esc(c.id)}" data-delete-inc-name="${esc(c.name)}">✕</span>
    </span>
  `).join("");
}

// Delegated click handler for income category chips
(function(){
  const incList = document.getElementById("incomeCategoryManageList");
  if(incList){
    incList.addEventListener("click", (e) => {
      const renameEl = e.target.closest("[data-rename-inc-id]");
      if(renameEl){ renameIncomeCategory(renameEl.dataset.renameIncId, renameEl.dataset.renameIncName); return; }
      const deleteEl = e.target.closest("[data-delete-inc-id]");
      if(deleteEl){ deleteIncomeCategory(deleteEl.dataset.deleteIncId, deleteEl.dataset.deleteIncName); }
    });
  }
})();

// addIncomeCategoryBtn listener — wired after DOM loads (script is at bottom of body)
(function(){
  const addIncomeCatBtn = document.getElementById("addIncomeCategoryBtn");
  if(addIncomeCatBtn){
    addIncomeCatBtn.addEventListener("click", async () => {
      const input = document.getElementById("newIncomeCategoryInput");
      const name = input.value.trim();
      if(!name){ showToast("Please enter a category name!", "error"); return; }
      if(incomeCategories.some(c => c.name.toLowerCase() === name.toLowerCase())){
        showToast("This income category already exists!", "error");
        return;
      }
      const ref = await userIncomeCategoriesRef().add({ name });
      incomeCategories.push({ id: ref.id, name });
      _saveIncatCache();
      input.value = "";
      renderIncomeCategoryOptions();
      renderIncomeCategoryManageList();
      showToast("Income category added!", "success");
    });
  }
})();

async function renameIncomeCategory(id, oldName){
  const newName = prompt("Enter new income category name:", oldName);
  if(!newName || !newName.trim() || newName.trim() === oldName) return;
  const trimmed = newName.trim();

  showLoading("Updating income category...");

  await userIncomeCategoriesRef().doc(id).set({ name: trimmed });

  const affected = salamis.filter(s => s.incomeCategory === oldName);
  for(let i=0; i<affected.length; i+=400){
    const chunk = affected.slice(i, i+400);
    const batch = db.batch();
    chunk.forEach(s => batch.update(userSalamisRef().doc(s.id), { incomeCategory: trimmed }));
    try { await batch.commit(); } catch(err){ console.error("Income cat rename batch failed:", err); showToast("Update partially failed. Please try again.", "error"); }
  }
  salamis.forEach(s => { if(s.incomeCategory === oldName) s.incomeCategory = trimmed; });

  const cat = incomeCategories.find(c => c.id === id);
  if(cat) cat.name = trimmed;
  _saveIncatCache();

  renderIncomeCategoryOptions();
  renderIncomeCategoryManageList();
  hideLoading();
  showToast("Income category renamed successfully!", "success");
}

async function deleteIncomeCategory(id, name){
  if(!confirm(`Delete the income category "${name}"?\n\nAll entries under this category will become Uncategorized, but they will not be deleted.`)) return;

  showLoading("Deleting income category...");

  const affected = salamis.filter(s => s.incomeCategory === name);
  for(let i=0; i<affected.length; i+=400){
    const chunk = affected.slice(i, i+400);
    const batch = db.batch();
    chunk.forEach(s => batch.update(userSalamisRef().doc(s.id), { incomeCategory: "" }));
    try { await batch.commit(); } catch(err){ console.error("Income cat delete batch failed:", err); showToast("Update partially failed. Please try again.", "error"); }
  }
  salamis.forEach(s => { if(s.incomeCategory === name) s.incomeCategory = ""; });

  await userIncomeCategoriesRef().doc(id).delete();
  incomeCategories = incomeCategories.filter(c => c.id !== id);
  _saveIncatCache();

  renderIncomeCategoryOptions();
  renderIncomeCategoryManageList();
  hideLoading();
  showToast("Income category deleted!", "success");
}

document.getElementById("expenseCategoryFilter").addEventListener("change", (e) => {
  currentCategoryFilter = e.target.value;
  renderExpenses();
});

document.getElementById("expenseSortBy").addEventListener("change", (e) => {
  currentExpenseSort = e.target.value;
  renderExpenses();
});

// Delegated click handlers for expense table, eid flat table & eid summary tables
// Card list replaces old table — delegate clicks from #expenseCardList
document.getElementById("expenseCardList").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if(!btn) return;
  if(btn.dataset.editExp !== undefined) editExpense(Number(btn.dataset.editExp));
  if(btn.dataset.delExp !== undefined) deleteExpense(Number(btn.dataset.delExp));
});

document.getElementById("eidFlatTable").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if(!btn) return;
  if(btn.dataset.editEid !== undefined) editEidEntry(Number(btn.dataset.editEid));
  if(btn.dataset.delEid !== undefined) deleteEidEntry(Number(btn.dataset.delEid));
});

document.getElementById("eidTables").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if(!btn) return;
  if(btn.dataset.editEid !== undefined) editEidEntry(Number(btn.dataset.editEid));
  if(btn.dataset.delEid !== undefined) deleteEidEntry(Number(btn.dataset.delEid));
});

// ===========================
// Search (inside "All Expenses")
// ===========================
document.getElementById("expenseSearchInput").addEventListener("input", (e) => {
  expenseSearchQuery = e.target.value.trim().toLowerCase();
  renderExpenses();
});

// ===========================
// Search & Sort for Bonus/Income
// ===========================
document.getElementById("eidSearchInput").addEventListener("input", (e) => {
  eidSearchQuery = e.target.value.trim().toLowerCase();
  renderEidFlatTable();
});

document.getElementById("eidSortBy").addEventListener("change", (e) => {
  currentEidSort = e.target.value;
  renderEidFlatTable();
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
setupDropdown("incomeCategoryDropdownBtn", "incomeCategoryDropdownContent");

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
  const confirmMsg = `Move this expense to trash?\n\n${e.item} — ${fmt(e.amount)} (${e.date})\n\nYou can restore it within 30 days.`;
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

// ===========================
// FEATURE: Skeleton card loader
// ===========================
function _skeletonCards(count = 4){
  return `<div class="skeleton-cards">${
    Array.from({length: count}, () =>
      `<div class="skeleton-card">
        <div class="skel-circle"></div>
        <div class="skel-lines">
          <div class="skel-line tall"></div>
          <div class="skel-line short"></div>
        </div>
        <div class="skel-btn-group">
          <div class="skel-btn"></div>
          <div class="skel-btn"></div>
        </div>
      </div>`
    ).join("")
  }</div>`;
}

function showExpenseSkeleton(){
  const el = document.getElementById("expenseCardList");
  if(el) el.innerHTML = _skeletonCards(4);
}
function showIncomeSkeleton(){
  const tbody = document.querySelector("#eidFlatTable tbody");
  if(tbody) tbody.innerHTML = `<tr><td colspan="5" style="padding:0;border:none">
    ${_skeletonCards(3)}</td></tr>`;
}

// FIXED: builds all rows into an array first, then sets innerHTML ONCE.
// (Previously used repeated innerHTML += in a loop, which re-parses the
// whole table every iteration and becomes extremely slow / appears to
// "freeze" once there are hundreds of rows, e.g. when "All" is selected.)
// Category emoji map for expense cards
const _CAT_EMOJI = {
  food:"🍔", transport:"🚗", shopping:"🛍️", health:"💊", education:"📚",
  entertainment:"🎬", bills:"⚡", rent:"🏠", travel:"✈️", clothing:"👕",
  gym:"💪", internet:"🌐", mobile:"📱", salary:"💼", gift:"🎁"
};
function _catEmoji(cat){
  if(!cat) return "💸";
  const k = cat.toLowerCase();
  for(const [key, em] of Object.entries(_CAT_EMOJI)){
    if(k.includes(key)) return em;
  }
  return "💸";
}

function renderExpenses(){
  const cardList = document.getElementById("expenseCardList");
  const totalEl  = document.getElementById("expenseTotal");

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
  const cards = filtered.map((e, idx)=>{
    total += e.amount;
    const emoji = _catEmoji(e.category);
    const catBadge = e.category
      ? `<span class="exp-card-cat">${esc(e.category)}</span>`
      : "";
    const noteBadge = e.note
      ? `<span class="exp-card-note">📝 ${esc(e.note)}</span>`
      : "";
    return `<div class="expense-card" data-del-exp="${e._i}" style="animation-delay:${Math.min(idx*0.04,0.4)}s">
      <div class="exp-card-icon">${emoji}</div>
      <div class="exp-card-body">
        <div class="exp-card-top">
          <span class="exp-card-name">${esc(e.item)}</span>
          <span class="exp-card-amount">${fmt(e.amount)}</span>
        </div>
        <div class="exp-card-meta">
          <span class="exp-card-date">📅 ${esc(e.date)}</span>
          ${catBadge}
          ${noteBadge}
        </div>
      </div>
      <div class="exp-card-actions">
        <button class="btn-edit" data-edit-exp="${e._i}">✏️ Edit</button>
        <button class="btn-del"  data-del-exp="${e._i}">🗑️ Del</button>
      </div>
    </div>`;
  });

  if(cardList) cardList.innerHTML = cards.join("");

  const label = currentExpenseFilter === "all"
    ? "All Time"
    : (() => {
        const [y,m] = currentExpenseFilter.split("-").map(Number);
        return `${monthNames[m]} ${y}`;
      })();
  totalEl.textContent = `${label} Total: ${fmt(total)} (${filtered.length} entries)`;
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
      let t=`<h4>${monthNames[m]} - Total: ${fmt(total)}</h4>
        <div class="table-wrapper">
        <table><tr><th>Item</th><th>Category</th><th>Amount</th><th>Date</th></tr>`;
      data.forEach(d=>{ t+=`<tr><td>${esc(d.item)}</td><td>${esc(d.category) || "—"}</td><td>${fmt(d.amount)}</td><td>${esc(d.date)}</td></tr>`; });
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
// Summary Card (this month's overview)
// ===========================
function renderSummaryCard(){
  const card = document.getElementById("summaryCard");
  if(!card) return;

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth(); // 0-indexed

  // This month's expenses
  const monthExpense = expenses
    .filter(e => {
      const d = new Date(e.date);
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    })
    .reduce((sum, e) => sum + e.amount, 0);

  // This month's income
  const monthIncome = salamis
    .filter(s => {
      const mi = monthNames.indexOf(s.month);
      return Number(s.year) === thisYear && mi === thisMonth;
    })
    .reduce((sum, s) => sum + s.amount, 0);

  const net = monthIncome - monthExpense;
  const netColor = net >= 0 ? "var(--success)" : "var(--danger)";
  const netSign  = net >= 0 ? "+" : "";
  const monthLabel = `${monthNames[thisMonth]} ${thisYear}`;

  // Savings rate
  const savingsPct = monthIncome > 0 ? Math.max(0, Math.min(100, ((net / monthIncome) * 100))) : 0;
  const ringR = 28, ringC = 35, ringCirc = 2 * Math.PI * ringR;
  const ringOffset = ringCirc * (1 - savingsPct / 100);
  const ringColor = savingsPct >= 20 ? "var(--success)" : savingsPct >= 5 ? "#f59e0b" : "var(--danger)";

  // Month-over-month comparison
  const prevDate  = new Date(thisYear, thisMonth - 1, 1);
  const prevY = prevDate.getFullYear(), prevM = prevDate.getMonth();
  const prevExpense = expenses
    .filter(e => { const d = new Date(e.date); return d.getFullYear()===prevY && d.getMonth()===prevM; })
    .reduce((s,e) => s + e.amount, 0);
  let momHtml = "";
  if(prevExpense > 0){
    const diff = monthExpense - prevExpense;
    const diffPct = ((diff / prevExpense) * 100).toFixed(1);
    const momClass = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
    const momIcon  = diff > 0 ? "▲" : diff < 0 ? "▼" : "→";
    momHtml = `<span class="mom-badge ${momClass}">${momIcon} ${Math.abs(diffPct)}% vs last month</span>`;
  }

  card.innerHTML = `
    <div class="summary-card-inner">
      <h3 class="summary-title">📊 ${monthLabel} Overview</h3>
      <div class="summary-stats">
        <div class="summary-top-row">
          <div class="summary-stat expense">
            <span class="summary-icon">💸</span>
            <div>
              <div class="summary-label">Total Expense</div>
              <div class="summary-amount">${fmt(monthExpense)}</div>
              ${momHtml}
            </div>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-stat income">
            <span class="summary-icon">💰</span>
            <div>
              <div class="summary-label">Total Income</div>
              <div class="summary-amount">${fmt(monthIncome)}</div>
            </div>
          </div>
        </div>
        <div class="summary-stat net net-balance-stat">
          <span class="summary-icon">${net >= 0 ? "✅" : "⚠️"}</span>
          <div>
            <div class="summary-label">Net Balance</div>
            <div class="summary-amount" style="color:${netColor}">${netSign}${fmt(net)}</div>
          </div>
        </div>
        <div class="savings-section">
          <div class="savings-ring-wrap">
            <svg width="70" height="70" viewBox="0 0 70 70">
              <circle class="savings-ring-bg" cx="${ringC}" cy="${ringC}" r="${ringR}"/>
              <circle class="savings-ring-fg" cx="${ringC}" cy="${ringC}" r="${ringR}"
                stroke="${ringColor}"
                stroke-dasharray="${ringCirc}"
                stroke-dashoffset="${ringOffset}"/>
            </svg>
            <div class="savings-ring-pct">${savingsPct.toFixed(0)}%</div>
          </div>
          <div class="savings-details">
            <h4>💰 Savings Rate</h4>
            <div class="savings-amount ${net >= 0 ? 'positive' : 'negative'}">${netSign}${fmt(net)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">
              ${monthIncome > 0 ? `Saved ${savingsPct.toFixed(1)}% of income` : "No income recorded"}
            </div>
          </div>
        </div>
      </div>
      <button class="summary-share-btn" onclick="shareMonthlySummary()">📤 Share / Download Monthly Summary</button>
    </div>
  `;
}

// ===========================
// Income vs Expense Comparison Chart
// ===========================
let comparisonChart;

function renderComparisonChart(){
  const canvas = document.getElementById("comparisonChart");
  if(!canvas) return;

  // Build monthly totals for expenses
  const expTotals = {};
  expenses.forEach(e => {
    const d = new Date(e.date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    expTotals[key] = (expTotals[key] || 0) + e.amount;
  });

  // Build monthly totals for income
  const incTotals = {};
  salamis.forEach(s => {
    const mi = monthNames.indexOf(s.month);
    if(mi === -1) return;
    const key = `${s.year}-${String(mi+1).padStart(2,"0")}`;
    incTotals[key] = (incTotals[key] || 0) + s.amount;
  });

  // Union of all month keys, sorted
  const allKeys = Array.from(new Set([...Object.keys(expTotals), ...Object.keys(incTotals)])).sort();
  const labels = allKeys.map(k => {
    const [y, m] = k.split("-").map(Number);
    return `${monthNames[m-1].slice(0,3)} ${y}`;
  });

  const isMobile = window.innerWidth < 600;
  if(comparisonChart) comparisonChart.destroy();
  comparisonChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "💸 Expense",
          data: allKeys.map(k => expTotals[k] || 0),
          backgroundColor: "rgba(220,38,38,0.75)",
          borderColor: "#dc2626",
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.85,
          categoryPercentage: 0.75
        },
        {
          label: "💰 Income",
          data: allKeys.map(k => incTotals[k] || 0),
          backgroundColor: "rgba(22,163,74,0.75)",
          borderColor: "#16a34a",
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.85,
          categoryPercentage: 0.75
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: "📈 Income vs Expense (Month by Month)",
          font: { size: isMobile ? 12 : 15, weight: "bold" },
          padding: { bottom: isMobile ? 6 : 12 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ৳ ${_nf.format(Number(ctx.parsed.y))}`
          }
        },
        legend: {
          position: "top",
          labels: {
            boxWidth: isMobile ? 12 : 16,
            font: { size: isMobile ? 11 : 13 },
            padding: isMobile ? 8 : 16
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: isMobile ? 10 : 12 },
            callback: v => isMobile ? "৳" + _nf.format(Number(v)) : "৳ " + _nf.format(Number(v))
          },
          title: { display: !isMobile, text: "Amount (৳)" }
        },
        x: {
          title: { display: !isMobile, text: "Month" },
          ticks: {
            font: { size: isMobile ? 10 : 12 },
            maxRotation: isMobile ? 60 : 45,
            minRotation: isMobile ? 45 : 0
          }
        }
      }
    }
  });
}

// ===========================
// Charts
// ===========================
// Shared tooltip formatter — shows ৳ amount
const taka = (val) => "৳ " + _nf.format(Number(val));

// Shared pie/doughnut tooltip callback
const pieTooltip = {
  callbacks: {
    label: (ctx) => {
      const total = ctx.dataset.data.reduce((a,b)=>a+b,0);
      const pct = total ? ((ctx.parsed/total)*100).toFixed(1) : 0;
      return ` ${ctx.label}: ${taka(ctx.parsed)} (${pct}%)`;
    }
  }
};

// Shared bar tooltip callback
const barTooltip = {
  callbacks: {
    label: (ctx) => ` ${ctx.dataset.label}: ${taka(ctx.parsed.y)}`
  }
};

function isVisible(el){ return el && el.offsetParent !== null; }

function renderCharts(){
  // Skip if no chart canvases are visible (section may be scrolled off-screen
  // or the page is still loading) — saves needless canvas work on first load.
  const monthCanvas = document.getElementById("monthlyChart");
  if(!isVisible(monthCanvas)) return;

  const monthlyTotals={}, yearlyTotals={};
  expenses.forEach(e=>{
    const dt=new Date(e.date);
    const y=dt.getFullYear(), m=dt.getMonth();
    const key=`${y}-${String(m+1).padStart(2,"0")}`;
    monthlyTotals[key]=(monthlyTotals[key]||0)+e.amount;
    yearlyTotals[y]=(yearlyTotals[y]||0)+e.amount;
  });

  // Sort month keys chronologically
  const sortedMonthKeys = Object.keys(monthlyTotals).sort();
  // Pretty labels: "Jan 2026"
  const monthLabels = sortedMonthKeys.map(k=>{
    const [y,m] = k.split("-").map(Number);
    return `${monthNames[m-1].slice(0,3)} ${y}`;
  });

  if(monthlyChart) monthlyChart.destroy();
  const isMobBar = window.innerWidth < 600;
  monthlyChart = new Chart(document.getElementById("monthlyChart"), {
    type: "bar",
    data: {
      labels: monthLabels,
      datasets: [{
        label: "Monthly Expense",
        data: sortedMonthKeys.map(k=>monthlyTotals[k]),
        backgroundColor: "rgba(54,162,235,0.8)",
        borderColor: "#36a2eb",
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.85,
        categoryPercentage: 0.8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: "📅 Monthly Expenses", font: { size: isMobBar ? 12 : 14, weight: "bold" }, padding: { bottom: 8 } },
        tooltip: barTooltip,
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: isMobBar ? 10 : 12 },
            callback: v => isMobBar ? "৳" + _nf.format(Number(v)) : "৳ " + _nf.format(Number(v))
          },
          title: { display: !isMobBar, text: "Amount (৳)" }
        },
        x: {
          title: { display: !isMobBar, text: "Month" },
          ticks: { font: { size: isMobBar ? 10 : 12 }, maxRotation: isMobBar ? 55 : 45, minRotation: isMobBar ? 40 : 0 }
        }
      }
    }
  });

  const yearKeys = Object.keys(yearlyTotals).sort();
  if(yearlyChart) yearlyChart.destroy();
  yearlyChart = new Chart(document.getElementById("yearlyChart"), {
    type: "pie",
    data: {
      labels: yearKeys.map(y=>`Year ${y}`),
      datasets: [{
        data: yearKeys.map(k=>yearlyTotals[k]),
        backgroundColor: ["#ff6384","#36a2eb","#ffce56","#4caf50","#9c27b0","#ff9f40","#4bc0c0"]
      }]
    },
    options: {
      plugins: {
        title: { display: true, text: "📆 Yearly Expenses", font: { size: 14, weight: "bold" }, padding: { bottom: 10 } },
        tooltip: pieTooltip
      }
    }
  });

  // Category-wise breakdown
  const categoryTotals = {};
  expenses.forEach(e=>{
    const cat = e.category || "Uncategorized";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + e.amount;
  });
  const catKeys = Object.keys(categoryTotals).sort((a,b)=>categoryTotals[b]-categoryTotals[a]);
  if(categoryChart) categoryChart.destroy();
  const isMobilePie = window.innerWidth < 600;
  categoryChart = new Chart(document.getElementById("categoryChart"), {
    type: "pie",
    data: {
      labels: catKeys,
      datasets: [{
        data: catKeys.map(k=>categoryTotals[k]),
        backgroundColor: ["#17a2b8","#ff6384","#36a2eb","#ffce56","#4caf50","#9c27b0","#ff9f40","#6f42c1","#e83e8c","#795548","#fd7e14","#c9cbcf"]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: "🏷️ Expenses by Category", font: { size: isMobilePie ? 13 : 14, weight: "bold" }, padding: { bottom: 8 } },
        legend: {
          position: "bottom",
          labels: {
            boxWidth: isMobilePie ? 12 : 14,
            font: { size: isMobilePie ? 11 : 12 },
            padding: isMobilePie ? 8 : 12
          }
        },
        tooltip: pieTooltip
      }
    }
  });
}

// ===========================
// Export All Data to PDF
// ===========================
// ===========================
// JSON Backup & Restore
// ===========================

// ── BACKUP: Export all data to a timestamped JSON file ──────────────────────
document.getElementById("exportJsonBtn").addEventListener("click", () => {
  if(!currentUser){ showToast("Please log in first.", "error"); return; }

  // ── Permission dialog: show data summary before downloading ──────────────
  const permMsg = [
    `📦 Backup Summary`,
    ``,
    `You are about to download a full backup of your data:`,
    ``,
    `  • ${expenses.length} expense record(s)`,
    `  • ${salamis.length} income / bonus entry(s)`,
    ``,
    `The backup will be saved as a .json file on your device.`,
    `You can use it later to restore your data if needed.`,
    ``,
    `Account: ${currentUser.email}`,
    ``,
    `Proceed with download?`
  ].join("\n");

  if(!confirm(permMsg)) return;

  const now = new Date();
  const stamp = now.toISOString().slice(0,19).replace(/[:T]/g, "-");

  const backup = {
    _meta: {
      exportedAt:    now.toISOString(),
      exportedBy:    currentUser.email,
      uid:           currentUser.uid,
      appVersion:    "expense-tracker-v7",
      totalExpenses: expenses.length,
      totalIncome:   salamis.length,
    },
    expenses: expenses.map(e => ({
      item:     e.item,
      amount:   e.amount,
      category: e.category || "",
      date:     e.date,
      note:     e.note || ""
    })),
    income: salamis.map(s => ({
      giver:          s.giver,
      amount:         s.amount,
      incomeCategory: s.incomeCategory || "",
      date:           s.date,
      month:          s.month,
      year:           s.year
    }))
  };

  const json    = JSON.stringify(backup, null, 2);
  const blob    = new Blob([json], { type: "application/json" });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement("a");
  a.href        = url;
  a.download    = `expense-tracker-backup-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  showToast(`✅ Backup downloaded! (${expenses.length} expenses, ${salamis.length} income entries)`, "success");
});

// ── RESTORE: Smart import with duplicate detection ───────────────────────────
document.getElementById("restoreFileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = ""; // reset so same file can be re-selected
  if(!file) return;
  if(!currentUser){ showToast("Please log in first.", "error"); return; }

  // ── Step 1: Read & validate JSON ─────────────────────────────────────────
  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch(err){
    showToast("❌ Invalid JSON file. Please select a valid backup.", "error");
    return;
  }

  const expArr = Array.isArray(parsed.expenses) ? parsed.expenses : [];
  const incArr = Array.isArray(parsed.income)   ? parsed.income   : [];

  if(!expArr.length && !incArr.length){
    showToast("⚠️ No data found in this backup file.", "error");
    return;
  }

  // ── Step 2: Build fingerprint Sets from EXISTING data ────────────────────
  // Expense fingerprint: "item_lowercase|amount|date"
  const existingExpFP = new Set(
    expenses.map(ex =>
      `${String(ex.item||"").toLowerCase().trim()}|${Number(ex.amount)||0}|${String(ex.date||"").trim()}`
    )
  );
  // Income fingerprint: "giver_lowercase|amount|month|year"
  const existingIncFP = new Set(
    salamis.map(s =>
      `${String(s.giver||"").toLowerCase().trim()}|${Number(s.amount)||0}|${String(s.month||"").trim()}|${String(s.year||"").trim()}`
    )
  );

  // ── Step 3: Filter backup — keep only NEW entries ─────────────────────────
  const newExpenses = expArr.filter(entry => {
    const fp = `${String(entry.item||"").toLowerCase().trim()}|${Math.abs(Number(entry.amount)||0)}|${String(entry.date||"").trim()}`;
    return !existingExpFP.has(fp);
  });
  const newIncome = incArr.filter(entry => {
    const fp = `${String(entry.giver||"").toLowerCase().trim()}|${Math.abs(Number(entry.amount)||0)}|${String(entry.month||"").trim()}|${String(entry.year||"").trim()}`;
    return !existingIncFP.has(fp);
  });

  const expSkipped = expArr.length - newExpenses.length;
  const incSkipped = incArr.length - newIncome.length;

  // ── Step 4: Permission dialog — show full breakdown ───────────────────────
  const permLines = [
    `📂 Restore Preview`,
    ``,
    `Backup file: ${file.name}`,
  ];
  if(parsed._meta?.exportedAt){
    const d = new Date(parsed._meta.exportedAt);
    permLines.push(`Exported: ${d.toLocaleString()}`);
  }
  permLines.push(
    ``,
    `── Expenses ─────────────────────`,
    `  In backup :  ${expArr.length}`,
    `  Already exist (will skip): ${expSkipped}`,
    `  New (will be added): ${newExpenses.length}`,
    ``,
    `── Income / Bonus ────────────────`,
    `  In backup :  ${incArr.length}`,
    `  Already exist (will skip): ${incSkipped}`,
    `  New (will be added): ${newIncome.length}`,
    ``
  );

  if(!newExpenses.length && !newIncome.length){
    permLines.push(`✅ All entries already exist — nothing new to import.`);
    alert(permLines.join("\n"));
    return;
  }

  permLines.push(
    `Existing data will NOT be deleted.`,
    `Duplicates will be skipped automatically.`,
    ``,
    `Proceed with restore?`
  );

  if(!confirm(permLines.join("\n"))) return;

  // ── Step 5: Write new entries to Firestore in batches of 400 ─────────────
  showLoading("Restoring backup…");
  let expOk = 0, incOk = 0;

  try {
    // Restore new expenses
    for(let i = 0; i < newExpenses.length; i += 400){
      const chunk = newExpenses.slice(i, i + 400);
      const batch = db.batch();
      chunk.forEach(entry => {
        const ref = userExpensesRef().doc();
        batch.set(ref, {
          item:     String(entry.item     || "").slice(0, 200),
          amount:   Math.abs(Number(entry.amount) || 0),
          category: String(entry.category || "").slice(0, 60),
          date:     String(entry.date     || "").slice(0, 20),
          note:     String(entry.note     || "").slice(0, 500),
        });
      });
      await batch.commit();
      expOk += chunk.length;
    }

    // Restore new income
    for(let i = 0; i < newIncome.length; i += 400){
      const chunk = newIncome.slice(i, i + 400);
      const batch = db.batch();
      chunk.forEach(entry => {
        const ref = userSalamisRef().doc();
        batch.set(ref, {
          giver:          String(entry.giver          || "").slice(0, 150),
          amount:         Math.abs(Number(entry.amount) || 0),
          incomeCategory: String(entry.incomeCategory || "").slice(0, 60),
          date:           String(entry.date           || "").slice(0, 10),
          month:          String(entry.month          || "").slice(0, 20),
          year:           String(entry.year           || "").slice(0, 4),
        });
      });
      await batch.commit();
      incOk += chunk.length;
    }

    hideLoading();

    // ── Result toast ─────────────────────────────────────────────────────
    const parts = [];
    if(expOk)    parts.push(`${expOk} expense(s) added`);
    if(incOk)    parts.push(`${incOk} income entry(s) added`);
    if(expSkipped || incSkipped)
      parts.push(`${expSkipped + incSkipped} duplicate(s) skipped`);

    showToast(`✅ Restore complete! ${parts.join(" · ")}`, "success");
    // onSnapshot listeners automatically pick up the new data

  } catch(err){
    hideLoading();
    console.error("Restore failed:", err);
    showToast("❌ Restore failed. Please try again.", "error");
  }
});

document.getElementById("exportPdfBtn").addEventListener("click", async () => {
  if(!currentUser){ showToast("Please log in first.", "error"); return; }
  showLoading("Loading PDF library…");
  try {
    await loadExportLibs();
  } catch(e){
    hideLoading();
    showToast("❌ Failed to load PDF library. Check your internet connection.", "error");
    return;
  }
  showLoading("Generating PDF…");
  // Small delay so the loading message renders before heavy PDF work blocks the thread
  setTimeout(() => {
    hideLoading();
    exportAllDataToPDF();
  }, 50);
});
document.getElementById("exportExcelBtn").addEventListener("click", async () => {
  showLoading("Preparing Excel…");
  try { await loadExportLibs(); } catch(e){ hideLoading(); showToast("Failed to load Excel library. Check your connection.", "error"); return; }
  hideLoading();
  exportAllDataToExcel();
});

function exportAllDataToPDF(){
  if(!window.jspdf || !window.jspdf.jsPDF){
    showToast("❌ PDF library not loaded. Check your internet connection and try again.", "error");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  if(typeof doc.autoTable !== "function"){
    showToast("❌ PDF table plugin not loaded properly. Please refresh the page and try again.", "error");
    return;
  }
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
        head: [["Date","Giver","Category","Amount"]],
        body: data.map(s=>[s.date, s.giver, s.incomeCategory||"—", fmt(s.amount)]),
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

  try {
    addPageNumbers();
    const fileDate=generatedOn.replace(/\//g,"-");
    doc.save(`expense_tracker_report_${fileDate}.pdf`);
    showToast(`✅ PDF downloaded! (${expenses.length} expenses, ${salamis.length} income entries)`, "success");
  } catch(err){
    console.error("PDF save error:", err);
    showToast("❌ PDF generation failed: " + err.message, "error");
  }
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

  const incomeRows = [["Year","Month","Date","Giver","Category","Amount"]];
  Object.keys(salByYear).sort().forEach(y => {
    let yearTotal = 0;
    months.forEach(mn => {
      const entries = salByYear[y][mn];
      if(!entries || !entries.length) return;
      const monthTotal = entries.reduce((s,e) => s + e.amount, 0);
      yearTotal += monthTotal;
      entries.forEach(s => incomeRows.push([y, mn, s.date, s.giver, s.incomeCategory||"—", s.amount]));
      incomeRows.push(["", `${mn} Total`, "", "", "", monthTotal]);
      incomeRows.push(["","","","","",""]);
    });
    incomeRows.push([`Year ${y} Total`, "", "", "", "", yearTotal]);
    incomeRows.push(["","","","","",""]);
  });

  const wsIncome = XLSX.utils.aoa_to_sheet(incomeRows);
  wsIncome["!cols"] = [{wch:12},{wch:14},{wch:8},{wch:30},{wch:18},{wch:12}];
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
  const incomeCategory=document.getElementById("incomeCategory") ? document.getElementById("incomeCategory").value : "";
  if(!year||!month||!date||!giver||!amount){ showToast("Please fill in all fields!", "error"); return; }

  const entry = {year,month,date,giver,amount,incomeCategory};
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
  const incomeCatEl = document.getElementById("incomeCategory");
  if(incomeCatEl) incomeCatEl.value = s.incomeCategory || "";
  editingEidIndex = i;
}

async function deleteEidEntry(i){
  const s = salamis[i];
  const confirmMsg = `Move this Bonus/Income entry to trash?\n\n${s.giver} — ${fmt(s.amount)} (${s.month} ${s.date}, ${s.year})\n\nYou can restore it within 30 days.`;
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

  // Month filter
  let filtered = indexed.filter(s=>{
    if(currentEidFilter === "all") return true;
    const m = monthNames.indexOf(s.month);
    return `${s.year}-${m}` === currentEidFilter;
  });

  // Search filter (by giver name or category)
  if(eidSearchQuery){
    const q = eidSearchQuery.toLowerCase();
    filtered = filtered.filter(s =>
      (s.giver || "").toLowerCase().includes(q) ||
      (s.incomeCategory || "").toLowerCase().includes(q)
    );
  }

  // Sort
  filtered.sort((a,b)=>{
    const da = new Date(Number(a.year), monthNames.indexOf(a.month), Number(a.date) || 1);
    const db2 = new Date(Number(b.year), monthNames.indexOf(b.month), Number(b.date) || 1);
    if(currentEidSort === "date-asc")    return da - db2;
    if(currentEidSort === "date-desc")   return db2 - da;
    if(currentEidSort === "amount-asc")  return a.amount - b.amount;
    if(currentEidSort === "amount-desc") return b.amount - a.amount;
    return da - db2;
  });

  let total = 0;
  const rows = filtered.map(s=>{
    total += s.amount;
    return `<tr>
      <td>${esc(s.date)} ${monthNames[monthNames.indexOf(s.month)]?.slice(0,3) || ""} ${esc(s.year)}</td>
      <td>${esc(s.giver)}</td>
      <td>${esc(s.incomeCategory) || "—"}</td>
      <td>${fmt(s.amount)}</td>
      <td>
        <button data-edit-eid="${s._i}">Edit</button>
        <button data-del-eid="${s._i}">Delete</button>
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
const INCOME_CHART_COLORS = [
  "#28a745","#17a2b8","#6f42c1","#fd7e14","#e83e8c","#ffc107",
  "#dc3545","#20c997","#6610f2","#795548","#0d6efd","#adb5bd"
];

function renderIncomeCharts(){
  const incCanvas = document.getElementById("monthlyIncomeChart");
  if(!isVisible(incCanvas)) return;

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

  // Pretty month labels: "Jan 2026"
  const incomeMonthLabels = monthKeys.map(k => {
    const [y, m] = k.split("-").map(Number);
    return `${monthNames[m-1].slice(0,3)} ${y}`;
  });

  if(monthlyIncomeChart) monthlyIncomeChart.destroy();
  const isMobIncBar = window.innerWidth < 600;
  monthlyIncomeChart = new Chart(document.getElementById("monthlyIncomeChart"), {
    type: "bar",
    data: {
      labels: incomeMonthLabels,
      datasets: [{
        label: "Monthly Bonus/Income",
        data: monthValues,
        backgroundColor: "rgba(40,167,69,0.85)",
        borderColor: "#28a745",
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.85,
        categoryPercentage: 0.8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: "📅 Monthly Bonus/Income", font: { size: isMobIncBar ? 12 : 14, weight: "bold" }, padding: { bottom: 8 } },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ৳ ${_nf.format(Number(ctx.parsed.y))}` } },
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: isMobIncBar ? 10 : 12 },
            callback: v => isMobIncBar ? "৳" + _nf.format(Number(v)) : "৳ " + _nf.format(Number(v))
          },
          title: { display: !isMobIncBar, text: "Amount (৳)" }
        },
        x: {
          title: { display: !isMobIncBar, text: "Month" },
          ticks: { font: { size: isMobIncBar ? 10 : 12 }, maxRotation: isMobIncBar ? 55 : 45, minRotation: isMobIncBar ? 40 : 0 }
        }
      }
    }
  });

  const yearKeys = Object.keys(yearlyTotals).sort();
  if(yearlyIncomeChart) yearlyIncomeChart.destroy();
  yearlyIncomeChart = new Chart(document.getElementById("yearlyIncomeChart"), {
    type: "pie",
    data: {
      labels: yearKeys.map(y => `Year ${y}`),
      datasets: [{
        data: yearKeys.map(y => yearlyTotals[y]),
        backgroundColor: INCOME_CHART_COLORS
      }]
    },
    options: {
      plugins: {
        title: { display: true, text: "📆 Yearly Bonus/Income", font: { size: 14, weight: "bold" }, padding: { bottom: 10 } },
        tooltip: { callbacks: { label: (ctx) => {
          const total = ctx.dataset.data.reduce((a,b)=>a+b,0);
          const pct = total ? ((ctx.parsed/total)*100).toFixed(1) : 0;
          return ` ${ctx.label}: ৳ ${_nf.format(Number(ctx.parsed))} (${pct}%)`;
        }}}
      }
    }
  });

  // ── Category Pie Chart ─────────────────────────────────────────────────
  // Shows total income broken down by category (all time)
  const catTotals = {};
  salamis.forEach(s=>{
    const cat = s.incomeCategory || "Uncategorized";
    catTotals[cat] = (catTotals[cat] || 0) + s.amount;
  });
  const catKeys = Object.keys(catTotals).sort((a,b)=>catTotals[b]-catTotals[a]);
  if(incomeCategoryChart) incomeCategoryChart.destroy();
  const incomeCatCanvas = document.getElementById("incomeCategoryChart");
  if(incomeCatCanvas){
    const isMobileIncPie = window.innerWidth < 600;
    incomeCategoryChart = new Chart(incomeCatCanvas, {
      type: "pie",
      data: {
        labels: catKeys,
        datasets: [{
          data: catKeys.map(k => catTotals[k]),
          backgroundColor: INCOME_CHART_COLORS
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: isMobileIncPie ? 12 : 14,
              font: { size: isMobileIncPie ? 11 : 12 },
              padding: isMobileIncPie ? 8 : 12
            }
          },
          title: { display: true, text: "🏷️ Income by Category (All Time)", font: { size: isMobileIncPie ? 13 : 14, weight: "bold" }, padding: { bottom: 8 } },
          tooltip: { callbacks: { label: (ctx) => {
            const total = ctx.dataset.data.reduce((a,b)=>a+b,0);
            const pct = total ? ((ctx.parsed/total)*100).toFixed(1) : 0;
            return ` ${ctx.label}: ৳ ${_nf.format(Number(ctx.parsed))} (${pct}%)`;
          }}}
        }
      }
    });
  }

  // ── Monthly by Category Grouped Bar Chart ─────────────────────────────
  // For each year: x-axis = month names, one dataset per category (stacked bar)
  // Year selector: use the year with the most entries, or all years combined
  const yearFilter = (function(){
    const sel = document.getElementById("incomeCategoryYearFilter");
    return sel ? sel.value : "all";
  })();

  // Collect all categories and all month labels for the selected year
  const filteredSalamis = yearFilter === "all"
    ? salamis
    : salamis.filter(s => String(s.year) === String(yearFilter));

  // Single-pass aggregation: Map keyed "year-paddedMonth-category" → total
  const aggMap = new Map();
  const usedMonthKeys = new Set();
  const allCatsSet = new Set();
  filteredSalamis.forEach(s => {
    const m = monthNames.indexOf(s.month);
    if(m === -1) return;
    const mk = `${s.year}-${String(m).padStart(2,"0")}`;
    const cat = s.incomeCategory || "Uncategorized";
    usedMonthKeys.add(mk);
    allCatsSet.add(cat);
    const mapKey = `${mk}|${cat}`;
    aggMap.set(mapKey, (aggMap.get(mapKey) || 0) + s.amount);
  });
  const sortedMonthKeys = Array.from(usedMonthKeys).sort();
  const monthLabels = sortedMonthKeys.map(k => {
    const [yr, mo] = k.split("-");
    return `${monthNames[Number(mo)].slice(0,3)} ${yr}`;
  });

  // Collect all categories present
  const allCats = Array.from(allCatsSet);

  // Build datasets using pre-aggregated Map — O(months × categories)
  const datasets = allCats.map((cat, idx) => {
    const data = sortedMonthKeys.map(mk => aggMap.get(`${mk}|${cat}`) || 0);
    return {
      label: cat,
      data,
      backgroundColor: INCOME_CHART_COLORS[idx % INCOME_CHART_COLORS.length]
    };
  });

  if(incomeMonthlyByCategoryChart) incomeMonthlyByCategoryChart.destroy();
  const monthCatCanvas = document.getElementById("incomeMonthlyByCategoryChart");
  if(monthCatCanvas){
    const isMobile = window.innerWidth < 600;
    incomeMonthlyByCategoryChart = new Chart(monthCatCanvas, {
      type: "bar",
      data: { labels: monthLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: isMobile ? 12 : 16,
              font: { size: isMobile ? 11 : 13 },
              padding: isMobile ? 8 : 16
            }
          },
          title: {
            display: true,
            font: { size: isMobile ? 12 : 14, weight: "bold" },
            padding: { bottom: 8 },
            text: yearFilter === "all"
              ? "📊 Monthly Income by Category (All Years)"
              : `📊 Monthly Income by Category — ${yearFilter}`
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ৳ ${_nf.format(Number(ctx.parsed.y))}`
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            title: { display: !isMobile, text: "Month" },
            ticks: {
              font: { size: isMobile ? 10 : 12 },
              maxRotation: isMobile ? 60 : 45,
              minRotation: isMobile ? 45 : 0
            }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: {
              font: { size: isMobile ? 10 : 12 },
              callback: v => isMobile ? "৳" + _nf.format(Number(v)) : "৳ " + _nf.format(Number(v))
            },
            title: { display: !isMobile, text: "Amount (৳)" }
          }
        }
      }
    });
  }

  // Populate year filter options
  const sel = document.getElementById("incomeCategoryYearFilter");
  if(sel){
    const allYears = Array.from(new Set(salamis.map(s => s.year))).sort();
    const currentVal = sel.value || "all";
    sel.innerHTML = `<option value="all">All Years</option>` +
      allYears.map(y => `<option value="${y}">${y}</option>`).join("");
    sel.value = allYears.includes(currentVal) ? currentVal : "all";
  }
}

// Year filter for monthly-by-category chart
(function(){
  const sel = document.getElementById("incomeCategoryYearFilter");
  if(sel) sel.addEventListener("change", renderIncomeCharts);
})();

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
        <tr><th>Date</th><th>Giver</th><th>Category</th><th>Amount</th><th>Action</th></tr>`;
      grouped[y][m].forEach(s=>{
        t+=`<tr>
          <td>${esc(s.date)}</td><td>${esc(s.giver)}</td><td>${esc(s.incomeCategory) || "—"}</td><td>${fmt(s.amount)}</td>
          <td>
            <button data-edit-eid="${s.index}">Edit</button>
            <button data-del-eid="${s.index}">Delete</button>
          </td>
        </tr>`;
      });
      t+="</table></div>";
      html += t;
    }
  }
  eidTables.innerHTML = html;
}

// ===========================
// FEATURE 12: OFFLINE / ONLINE STATUS INDICATOR
// ===========================
(function(){
  const banner = document.getElementById("networkStatus");
  if(!banner) return;

  let _onlineTimer = null;

  function showOffline(){
    clearTimeout(_onlineTimer);
    banner.textContent = "📶 You're offline — changes will sync when reconnected";
    banner.className = "offline";
  }

  function showBackOnline(){
    banner.textContent = "✅ Back online — syncing...";
    banner.className = "back-online";
    _onlineTimer = setTimeout(() => {
      banner.className = "";
      banner.style.display = "none";
    }, 3000);
  }

  if(!navigator.onLine) showOffline();

  window.addEventListener("offline", showOffline);
  window.addEventListener("online", showBackOnline);
})();

// ===========================
// FEATURE 3: BOTTOM NAV + FAB
// ===========================
(function(){
  // FAB: scroll to add expense form and focus item input
  const fab = document.getElementById("fabAdd");
  if(fab){
    fab.addEventListener("click", () => {
      const section = document.getElementById("addExpenseSection");
      if(section){
        section.scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => {
          const itemInput = document.getElementById("item");
          if(itemInput) itemInput.focus();
        }, 400);
      }
    });
  }

  // Bottom Nav: scroll to section
  const navItems = document.querySelectorAll(".bnav-item[data-bnav]");
  if(!navItems.length) return;

  const sectionMap = {
    expenses: "addExpenseSection",
    income:   "incomeSectionAnchor",
    charts:   "chartsSectionAnchor",
    summary:  "summaryDropdownSection"
  };

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      // Update active state
      navItems.forEach(n => n.classList.remove("active"));
      item.classList.add("active");

      // Scroll to section
      const targetId = sectionMap[item.dataset.bnav];
      const el = targetId ? document.getElementById(targetId) : null;
      if(el){
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  // Update active nav item based on scroll position
  let _scrollTimer = null;
  window.addEventListener("scroll", () => {
    clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(() => {
      const sections = [
        { key: "expenses", el: document.getElementById("addExpenseSection") },
        { key: "income",   el: document.getElementById("incomeSectionAnchor") },
        { key: "charts",   el: document.getElementById("chartsSectionAnchor") },
        { key: "summary",  el: document.getElementById("summaryDropdownSection") }
      ];
      let current = "expenses";
      sections.forEach(({ key, el }) => {
        if(el && el.getBoundingClientRect().top <= 120) current = key;
      });
      navItems.forEach(n => {
        n.classList.toggle("active", n.dataset.bnav === current);
      });
    }, 80);
  }, { passive: true });
})();

// ===========================
// FEATURE 14: SHARE MONTHLY SUMMARY (Canvas → PNG → Web Share)
// ===========================
function shareMonthlySummary_OLD_REPLACED(){
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();
  const monthLabel = `${monthNames[thisMonth]} ${thisYear}`;

  const monthExpense = expenses
    .filter(e => { const d=new Date(e.date); return d.getFullYear()===thisYear && d.getMonth()===thisMonth; })
    .reduce((sum,e) => sum+e.amount, 0);

  const monthIncome = salamis
    .filter(s => { const mi=monthNames.indexOf(s.month); return Number(s.year)===thisYear && mi===thisMonth; })
    .reduce((sum,s) => sum+s.amount, 0);

  const net = monthIncome - monthExpense;

  // Draw on a canvas
  const dpr   = window.devicePixelRatio || 1;
  const W = 480, H = 260;
  const canvas = document.createElement("canvas");
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  // Detect dark mode
  const dark = document.body.classList.contains("dark-mode");
  const bgColor      = dark ? "#1a1d27" : "#ffffff";
  const textColor    = dark ? "#e8eaf0" : "#1a1d23";
  const subColor     = dark ? "#8b92a8" : "#6b7280";
  const borderColor  = dark ? "#2e3347" : "#e0e3e8";
  const accentColor  = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#2563eb";

  // Background
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 16);
  ctx.fill();

  // Top accent stripe
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, 6, [16,16,0,0]);
  ctx.fill();

  // Title
  ctx.fillStyle = textColor;
  ctx.font = "bold 20px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`📊 ${monthLabel} Overview`, W/2, 45);

  ctx.fillStyle = subColor;
  ctx.font = "13px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("💰 Expense Tracker", W/2, 65);

  // Divider
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(24, 78);
  ctx.lineTo(W-24, 78);
  ctx.stroke();

  // Three stat columns
  const cols = [
    { label:"Total Expense", value: fmt(monthExpense), color:"#dc2626", icon:"💸" },
    { label:"Total Income",  value: fmt(monthIncome),  color:"#16a34a", icon:"💰" },
    { label:"Net Balance",   value: (net>=0?"+":"")+fmt(net), color: net>=0?"#16a34a":"#dc2626", icon: net>=0?"✅":"⚠️" }
  ];

  cols.forEach((col, i) => {
    const x = 80 + i * 160;
    const cy = 140;

    // Icon
    ctx.font = "28px serif";
    ctx.textAlign = "center";
    ctx.fillStyle = textColor;
    ctx.fillText(col.icon, x, cy - 10);

    // Label
    ctx.fillStyle = subColor;
    ctx.font = "bold 10px 'Segoe UI', system-ui, sans-serif";
    ctx.letterSpacing = "0.5px";
    ctx.fillText(col.label.toUpperCase(), x, cy + 14);

    // Amount
    ctx.fillStyle = col.color;
    ctx.font = "bold 16px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(col.value, x, cy + 34);
  });

  // Vertical dividers between cols
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  [1,2].forEach(i => {
    const dx = 80 + i*160 - 80;
    ctx.beginPath();
    ctx.moveTo(dx + 40, 90);
    ctx.lineTo(dx + 40, 190);
    ctx.stroke();
  });

  // Footer
  ctx.fillStyle = subColor;
  ctx.font = "11px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Generated on ${new Date().toLocaleDateString("en-IN", {day:"2-digit",month:"short",year:"numeric"})}`, W/2, H-16);

  // Border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(0.75, 0.75, W-1.5, H-1.5, 16);
  ctx.stroke();

  // Show share modal with preview
  canvas.toBlob(async (blob) => {
    if(!blob){ showToast("Could not generate image", "error"); return; }
    const file = new File([blob], `summary-${monthLabel.replace(" ","-")}.png`, { type:"image/png" });
    const previewUrl = URL.createObjectURL(blob);

    // Build modal
    const overlay = document.createElement("div");
    overlay.className = "share-modal-overlay";
    overlay.innerHTML = `
      <div class="share-modal">
        <p class="share-modal-title">📊 ${monthLabel} Summary Card</p>
        <div class="share-modal-preview"><img src="${previewUrl}" alt="Summary Preview"></div>
        <div class="share-modal-actions">
          ${navigator.share && navigator.canShare && navigator.canShare({ files:[file] })
            ? `<button class="share-modal-btn-share" id="_smShare">📤 Share</button>` : ""}
          <button class="share-modal-btn-dl" id="_smDownload">⬇️ Download</button>
          <button class="share-modal-btn-cancel" id="_smCancel">✕ Close</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => { URL.revokeObjectURL(previewUrl); overlay.remove(); };
    overlay.querySelector("#_smCancel").onclick = close;
    overlay.addEventListener("click", e => { if(e.target === overlay) close(); });

    const dlBtn = overlay.querySelector("#_smDownload");
    if(dlBtn) dlBtn.onclick = () => { _downloadSummaryPng(blob, monthLabel); close(); };

    const shareBtn = overlay.querySelector("#_smShare");
    if(shareBtn) shareBtn.onclick = async () => {
      try {
        await navigator.share({
          title: `${monthLabel} Summary`,
          text: `My ${monthLabel} Summary:\n💸 Expense: ${fmt(monthExpense)}\n💰 Income: ${fmt(monthIncome)}\n📊 Net: ${(net>=0?"+":"")+fmt(net)}`,
          files: [file]
        });
        close();
      } catch(err){
        if(err.name !== "AbortError"){ _downloadSummaryPng(blob, monthLabel); close(); }
      }
    };
  }, "image/png");
}

function _downloadSummaryPng(blob, label){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `summary-${label.replace(" ","-")}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  showToast("Summary image downloaded!", "success");
}

// (Share button is injected inside the original renderSummaryCard below via patch)

// ===========================
// FEATURE 15: CUSTOM COLOR THEME
// ===========================
let _currentTheme = "blue";

function applyTheme(theme){
  _currentTheme = theme || "blue";
  document.documentElement.dataset.theme = _currentTheme;
  // Update swatch active state
  document.querySelectorAll(".theme-swatch").forEach(sw => {
    sw.classList.toggle("active", sw.dataset.theme === _currentTheme);
  });
}

async function saveTheme(theme){
  if(!currentUser) return;
  try {
    await db.collection("users").doc(currentUser.uid).set({ theme }, { merge: true });
  } catch(err){ console.warn("Theme save failed:", err); }
}

// Wire up theme swatches
(function(){
  document.querySelectorAll(".theme-swatch").forEach(sw => {
    sw.addEventListener("click", async () => {
      const theme = sw.dataset.theme;
      applyTheme(theme);
      localStorage.setItem("theme_cache_" + (currentUser ? currentUser.uid : ""), theme);
      await saveTheme(theme);
    });
  });
})();

// Load theme from localStorage cache (instant, before Firestore)
function loadThemeFromCache(uid){
  try {
    const cached = localStorage.getItem("theme_cache_" + uid);
    if(cached) applyTheme(cached);
  } catch(e){}
}

// Load theme from Firestore (called in background after login)
async function loadThemeFromFirestore(){
  if(!currentUser) return;
  try {
    const doc = await db.collection("users").doc(currentUser.uid).get();
    if(doc.exists && doc.data().theme){
      applyTheme(doc.data().theme);
      localStorage.setItem("theme_cache_" + currentUser.uid, doc.data().theme);
    }
  } catch(err){ console.warn("Theme load failed:", err); }
}

// ===========================
// FEATURE 27: PWA INSTALL PROMPT
// ===========================
(function(){
  let _deferredPrompt = null;
  const banner    = document.getElementById("pwaInstallBanner");
  const installBtn= document.getElementById("pwaInstallBtn");
  const dismissBtn= document.getElementById("pwaInstallDismiss");

  if(!banner || !installBtn || !dismissBtn) return;

  // Don't show if dismissed within 3 days
  const DISMISS_KEY = "pwa_install_dismissed";
  function isDismissed(){
    try {
      const ts = localStorage.getItem(DISMISS_KEY);
      if(!ts) return false;
      return Date.now() - Number(ts) < 3 * 24 * 60 * 60 * 1000; // 3 days
    } catch(e){ return false; }
  }

  function showBanner(){
    if(isDismissed()) return;
    banner.style.display = "block";
    document.body.classList.add("pwa-install-active");
  }

  function hideBanner(){
    banner.style.display = "none";
    document.body.classList.remove("pwa-install-active");
  }

  // Capture the browser's beforeinstallprompt event
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    _deferredPrompt = e;
    // Show banner after a short delay so it doesn't interrupt load
    setTimeout(showBanner, 2500);
  });

  // After install
  window.addEventListener("appinstalled", () => {
    hideBanner();
    showToast("✅ App installed! Check your Home Screen.", "success");
    _deferredPrompt = null;
  });

  installBtn.addEventListener("click", async () => {
    if(!_deferredPrompt){ showToast("Install already triggered or not supported.", "error"); return; }
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    if(outcome === "accepted"){
      showToast("✅ Installing...", "success");
    }
    _deferredPrompt = null;
    hideBanner();
  });

  dismissBtn.addEventListener("click", () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch(e){}
    hideBanner();
  });
})();

// ===========================
// FEATURE 23: CHART PNG DOWNLOAD
// ===========================
(function(){
  document.addEventListener("click", e => {
    const btn = e.target.closest(".chart-download-btn");
    if(!btn) return;
    const canvasId = btn.dataset.chart;
    if(!canvasId) return;
    const canvas = document.getElementById(canvasId);
    if(!canvas){ showToast("Chart not found!", "error"); return; }

    // Try to get the chart's label from the nearest h2 or the button text area
    let label = canvasId.replace(/Chart$/, "").replace(/([A-Z])/g, " $1").trim() || "chart";

    // Add white/dark background before export (chart canvas is transparent)
    const offscreen = document.createElement("canvas");
    offscreen.width  = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext("2d");
    const dark = document.body.classList.contains("dark-mode");
    ctx.fillStyle = dark ? "#1a1d27" : "#ffffff";
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    ctx.drawImage(canvas, 0, 0);

    offscreen.toBlob(blob => {
      if(!blob){ showToast("Could not export chart", "error"); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${label.trim().replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0,10)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast("Chart downloaded! ✅", "success");
    }, "image/png");
  });
})();

// FEATURE 28: Swipe-to-delete removed — Edit/Delete buttons handle deletion.

// ===========================
// FEATURE 29: HAPTIC FEEDBACK
// ===========================
function haptic(pattern){
  try {
    if(navigator.vibrate) navigator.vibrate(pattern || [30]);
  } catch(e){}
}

// Attach haptic to key interactive elements
document.addEventListener("click", e => {
  const el = e.target.closest("button, .bnav-item, .month-btn, .exp-card-actions button");
  if(!el) return;
  // Short tap for most, stronger for delete
  if(el.classList.contains("btn-del") || el.dataset.delExp){
    haptic([15,30,50]);
  } else {
    haptic([20]);
  }
  // Visual pulse on mobile
  el.classList.remove("haptic-pulse");
  void el.offsetWidth;
  el.classList.add("haptic-pulse");
  el.addEventListener("animationend", () => el.classList.remove("haptic-pulse"), { once: true });
}, { passive: true });

// ===========================
// FEATURE 30: KEYBOARD SHORTCUTS
// ===========================
(function(){
  const panel = document.getElementById("kbShortcutPanel");
  let panelVisible = false;

  function showPanel(){
    panelVisible = true;
    if(panel) panel.classList.add("visible");
    // Auto-hide after 4 seconds
    clearTimeout(window._kbPanelTimer);
    window._kbPanelTimer = setTimeout(hidePanel, 4000);
  }
  function hidePanel(){
    panelVisible = false;
    if(panel) panel.classList.remove("visible");
  }

  document.addEventListener("keydown", e => {
    // Ignore when typing in an input
    const tag = document.activeElement?.tagName;
    if(tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if(e.altKey){
      switch(e.key.toLowerCase()){
        case "n":
          e.preventDefault();
          haptic([30]);
          document.getElementById("itemInput")?.focus();
          document.getElementById("itemInput")?.scrollIntoView({ behavior:"smooth", block:"center" });
          showToast("⌨️ New expense — fill in the form!", "info");
          break;
        case "d":
          e.preventDefault();
          haptic([30]);
          document.getElementById("toggleDarkMode")?.click();
          break;
        case "f":
          e.preventDefault();
          haptic([30]);
          // Find whichever search box is visible
          const searchEl = document.getElementById("eidSearchInput") || document.querySelector("input[type='search']");
          searchEl?.focus();
          searchEl?.scrollIntoView({ behavior:"smooth", block:"center" });
          showToast("⌨️ Search focused!", "info");
          break;
        case "p":
          e.preventDefault();
          haptic([30]);
          document.getElementById("exportPDFBtn")?.click();
          showToast("⌨️ Exporting PDF…", "info");
          break;
        case "?":
          e.preventDefault();
          haptic([20,20,20]);
          panelVisible ? hidePanel() : showPanel();
          break;
      }
    }
    if(e.key === "Escape" && panelVisible){
      hidePanel();
    }
  });
})();

// ===========================
// FEATURE 31: MULTI-CURRENCY
// ===========================
(function(){
  const sel       = document.getElementById("currencySelect");
  const rateEl    = document.getElementById("currencyRate");
  if(!sel) return;

  // BDT → target rates (fallback table — updated from API when possible)
  const FALLBACK = { BDT:1, USD:0.0091, EUR:0.0084, GBP:0.0072, INR:0.76, SAR:0.034 };

  async function fetchRate(to){
    if(to === "BDT") return 1;
    try {
      // Free, no-auth API
      const res = await fetch(`https://open.er-api.com/v6/latest/BDT`);
      if(!res.ok) throw new Error("network");
      const data = await res.json();
      const rate = data.rates?.[to];
      if(rate) return rate;
    } catch(e){}
    return FALLBACK[to] ?? 1;
  }

  async function changeCurrency(to){
    _activeCurrency = to;
    if(to === "BDT"){
      _conversionRate = 1;
      rateEl.textContent = "";
    } else {
      rateEl.textContent = "Loading…";
      rateEl.classList.add("loading");
      const rate = await fetchRate(to);
      _conversionRate = rate;
      rateEl.textContent = `1 BDT = ${rate.toFixed(4)} ${to}`;
      rateEl.classList.remove("loading");
    }
    // Re-render everything that uses fmt()
    renderExpenses();
    renderMonthlyYearlyTables?.();
    renderEidFlatTable?.();
    renderIncomeMonthlyYearlyTables?.();
    // Update stats
    updateStats?.();
  }

  sel.addEventListener("change", () => {
    haptic([25]);
    changeCurrency(sel.value);
  });

  // Persist last-used currency
  const saved = localStorage.getItem("activeCurrency_cache");
  if(saved && FALLBACK[saved]){
    sel.value = saved;
    changeCurrency(saved);
  }

  // Save on change
  sel.addEventListener("change", () => {
    try { localStorage.setItem("activeCurrency_cache", sel.value); } catch(e){}
  });
})();
// ===========================
// FEATURE 32: TOP 5 EXPENSIVE ITEMS
// ===========================
function renderTop5(){
  const el = document.getElementById("top5List");
  if(!el) return;

  // Aggregate by item name (current month filter if set, else all time)
  const now = new Date();
  const source = currentExpenseFilter === "all"
    ? expenses
    : expenses.filter(e => {
        const [y,m] = currentExpenseFilter.split("-").map(Number);
        const d = new Date(e.date);
        return d.getFullYear()===y && (d.getMonth()+1)===m;
      });

  const totals = {};
  source.forEach(e => {
    totals[e.item] = (totals[e.item]||0) + e.amount;
  });
  const sorted = Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if(!sorted.length){ el.innerHTML = `<li style="color:var(--text-muted);font-size:13px;">No data yet</li>`; return; }
  const max = sorted[0][1];
  el.innerHTML = sorted.map(([name, amt], i) => `
    <li class="top5-item">
      <span class="top5-rank">${i+1}</span>
      <span class="top5-name">${esc(name)}</span>
      <div class="top5-bar-wrap"><div class="top5-bar" style="width:${(amt/max*100).toFixed(1)}%"></div></div>
      <span class="top5-amt">${fmt(amt)}</span>
    </li>
  `).join("");
}

// ===========================
// FEATURE 33: DAY-OF-WEEK HEATMAP
// ===========================
function renderDowHeatmap(){
  const el = document.getElementById("dowHeatmap");
  if(!el) return;

  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const totals = [0,0,0,0,0,0,0];

  expenses.forEach(e => {
    const dow = new Date(e.date).getDay();
    totals[dow] += e.amount;
  });
  const max = Math.max(...totals, 1);

  el.innerHTML = days.map((day, i) => {
    const h = Math.round((totals[i] / max) * 44);
    const pct = totals[i] > 0 ? Math.round(totals[i]/max*100) : 0;
    const barColor = pct > 70 ? "var(--danger)" : pct > 40 ? "#f59e0b" : "var(--primary)";
    return `
      <div class="heatmap-day">
        <div class="hd-label">${day}</div>
        <div class="hd-bar-wrap">
          <div class="hd-bar" style="height:${h}px;background:${barColor};"></div>
        </div>
        <div class="hd-amt">${totals[i]>0 ? fmt(totals[i]) : "—"}</div>
      </div>
    `;
  }).join("");
}

// ===========================
// FEATURE 34: DRAG TO REORDER CATEGORIES
// ===========================
(function(){
  let _dragSrc = null;

  function initCategoryDrag(){
    const list = document.getElementById("categoryManageList");
    if(!list) return;

    list.querySelectorAll(".category-item").forEach(item => {
      if(item.dataset.dragInit) return;
      item.dataset.dragInit = "1";
      item.setAttribute("draggable", "true");

      // Add drag handle if not present
      if(!item.querySelector(".drag-handle")){
        const handle = document.createElement("span");
        handle.className = "drag-handle";
        handle.textContent = "⠿";
        item.prepend(handle);
      }

      item.addEventListener("dragstart", e => {
        _dragSrc = item;
        e.dataTransfer.effectAllowed = "move";
        setTimeout(() => item.style.opacity = "0.4", 0);
      });
      item.addEventListener("dragend", () => {
        item.style.opacity = "";
        list.querySelectorAll(".category-item").forEach(i => i.classList.remove("drag-over"));
        _saveNewCategoryOrder(list);
      });
      item.addEventListener("dragover", e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if(item !== _dragSrc) item.classList.add("drag-over");
      });
      item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
      item.addEventListener("drop", e => {
        e.preventDefault();
        if(!_dragSrc || _dragSrc === item) return;
        const items = [...list.children];
        const srcIdx = items.indexOf(_dragSrc);
        const tgtIdx = items.indexOf(item);
        if(srcIdx < tgtIdx) item.after(_dragSrc);
        else item.before(_dragSrc);
        item.classList.remove("drag-over");
      });
    });
  }

  function _saveNewCategoryOrder(list){
    const order = [...list.querySelectorAll(".category-item")].map(i => i.dataset.cat || i.textContent.trim().replace("⠿","").trim());
    try { localStorage.setItem("categoryOrder_cache", JSON.stringify(order)); } catch(e){}
    showToast("✅ Category order saved!", "success");
  }

  // Re-init whenever category list changes (MutationObserver)
  const catList = document.getElementById("categoryManageList");
  if(catList){
    new MutationObserver(initCategoryDrag).observe(catList, { childList: true, subtree: true });
    initCategoryDrag();
  }
})();

// ===========================
// FEATURE 35: BEAUTIFUL SHARE CARD + WHATSAPP/TELEGRAM
// ===========================
async function shareMonthlySummary(){
  // ── Polyfill roundRect ──
  if(!CanvasRenderingContext2D.prototype.roundRect){
    CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
      r = Array.isArray(r) ? r[0] : r;
      r = Math.min(r, w/2, h/2);
      this.moveTo(x+r,y); this.lineTo(x+w-r,y);
      this.quadraticCurveTo(x+w,y,x+w,y+r); this.lineTo(x+w,y+h-r);
      this.quadraticCurveTo(x+w,y+h,x+w-r,y+h); this.lineTo(x+r,y+h);
      this.quadraticCurveTo(x,y+h,x,y+h-r); this.lineTo(x,y+r);
      this.quadraticCurveTo(x,y,x+r,y); this.closePath();
    };
  }

  // ── Canvas: 800×480 @ 2× DPR for crisp PNG ──
  const W = 800, H = 480, DPR = 2;
  const off = document.createElement("canvas");
  off.width = W * DPR; off.height = H * DPR;
  const ctx = off.getContext("2d");
  ctx.scale(DPR, DPR);

  // ── Helpers ──
  const P = 28; // base padding
  function rr(x,y,w,h,r){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); }
  function fill(color){ ctx.fillStyle=color; ctx.fill(); }
  function txt(t,x,y,font,color,alpha,align){
    ctx.save();
    ctx.globalAlpha = alpha??1;
    ctx.fillStyle   = color;
    ctx.font        = font;
    ctx.textAlign   = align??"left";
    ctx.fillText(t, x, y);
    ctx.restore();
  }

  // ── Data ──
  const now = new Date();
  const monthLabel   = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  const curY = now.getFullYear(), curM = now.getMonth();
  const monthExpenses = expenses.filter(e=>{
    const d=new Date(e.date); return d.getFullYear()===curY && d.getMonth()===curM;
  });
  const monthExpense = monthExpenses.reduce((s,e)=>s+e.amount, 0);
  const monthIncome  = salamis.filter(s=>{
    return Number(s.year)===curY && monthNames.indexOf(s.month)===curM;
  }).reduce((s,i)=>s+i.amount, 0);
  const net        = monthIncome - monthExpense;
  const savePct    = monthIncome > 0 ? Math.max(0, Math.min(100, net/monthIncome*100)) : 0;
  const savePctStr = monthIncome > 0 ? savePct.toFixed(1)+"%" : "—";
  const dateStr    = now.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});

  // ════════════════════════════════
  // BACKGROUND
  // ════════════════════════════════
  const bg = ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,   "#0a0a1a");
  bg.addColorStop(0.45,"#0f0c2e");
  bg.addColorStop(1,   "#111827");
  rr(0,0,W,H,24); fill(bg);

  // Subtle noise texture overlay
  ctx.save(); ctx.globalAlpha=0.025;
  for(let i=0;i<1200;i++){
    const nx=Math.random()*W, ny=Math.random()*H;
    ctx.fillStyle=`hsl(${Math.random()*360},60%,80%)`;
    ctx.fillRect(nx,ny,1,1);
  }
  ctx.restore();

  // Glow orbs
  function orb(x,y,r,c){
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,c); g.addColorStop(1,"transparent");
    ctx.save(); ctx.globalAlpha=0.15; ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
  orb(W*0.85, H*0.15, 200, "#6366f1");
  orb(W*0.10, H*0.85, 160, "#0ea5e9");
  orb(W*0.50, H*0.50, 240, "#7c3aed");

  // ════════════════════════════════
  // HEADER  (y: 0–76)
  // ════════════════════════════════
  const hg = ctx.createLinearGradient(0,0,W,0);
  hg.addColorStop(0,"rgba(99,102,241,0.40)");
  hg.addColorStop(1,"rgba(139,92,246,0.18)");
  rr(0,0,W,76,0); fill(hg);
  ctx.fillStyle="rgba(255,255,255,0.08)"; ctx.fillRect(0,76,W,1);

  // Logo box
  const lg=ctx.createLinearGradient(P,14,P+46,60);
  lg.addColorStop(0,"#fbbf24"); lg.addColorStop(1,"#f59e0b");
  rr(P,14,46,46,10); fill(lg);
  txt("💰", P+2, 53, "30px system-ui", "#fff");

  txt("Expense Tracker",  P+56, 34, "bold 24px system-ui,sans-serif", "#fff");
  txt(`${monthLabel}  ·  Monthly Report`, P+57, 58, "13px system-ui,sans-serif", "#a5b4fc", 0.85);

  // Date badge
  rr(W-P-112,20,108,36,8);
  ctx.fillStyle="rgba(255,255,255,0.07)"; ctx.fill();
  txt(dateStr, W-P-58, 43, "bold 12px system-ui,sans-serif", "#c7d2fe", 0.9, "center");

  // ════════════════════════════════
  // STAT BOXES  (y: 90–202)
  // ════════════════════════════════
  const stats=[
    {lbl:"Total Expense", val:fmt(monthExpense),              icon:"💸", c1:"#ef4444",c2:"#dc2626"},
    {lbl:"Total Income",  val:fmt(monthIncome),               icon:"💰", c1:"#22c55e",c2:"#16a34a"},
    {lbl:"Net Balance",   val:(net>=0?"+":"")+fmt(net),        icon:net>=0?"✅":"⚠️", c1:net>=0?"#10b981":"#f97316",c2:net>=0?"#059669":"#ea580c"},
    {lbl:"Savings Rate",  val:savePctStr,                     icon:"🎯", c1:"#818cf8",c2:"#6366f1"},
  ];
  const BY=90, BH=108, gap=12;
  const BW=(W - P*2 - gap*3)/4;
  stats.forEach((s,i)=>{
    const bx=P+i*(BW+gap), by=BY;
    // card bg
    const cbg=ctx.createLinearGradient(bx,by,bx,by+BH);
    cbg.addColorStop(0,"rgba(255,255,255,0.10)");
    cbg.addColorStop(1,"rgba(255,255,255,0.03)");
    rr(bx,by,BW,BH,14); fill(cbg);
    // border glow top strip
    const sg=ctx.createLinearGradient(bx,by,bx+BW,by);
    sg.addColorStop(0,s.c1); sg.addColorStop(1,s.c2);
    rr(bx,by,BW,4,2); fill(sg);
    // icon
    ctx.font="24px system-ui"; ctx.textAlign="center";
    ctx.fillText(s.icon, bx+BW/2, by+38);
    // value — big bold
    txt(s.val, bx+BW/2, by+70, "bold 18px system-ui,sans-serif", "#fff", 1, "center");
    // label — small muted
    txt(s.lbl, bx+BW/2, by+90, "11px system-ui,sans-serif", "#94a3b8", 0.9, "center");
  });

  // ════════════════════════════════
  // SAVINGS PROGRESS BAR  (y: 212–244)
  // ════════════════════════════════
  const spY=212, spH=24;
  // track
  rr(P,spY,W-P*2,spH,spH/2); fill("rgba(255,255,255,0.07)");
  // fill
  if(savePct>0){
    const sw=Math.round((W-P*2)*savePct/100);
    const sg=ctx.createLinearGradient(P,0,P+sw,0);
    sg.addColorStop(0, savePct>=40?"#22c55e":savePct>=15?"#6366f1":"#f97316");
    sg.addColorStop(1, savePct>=40?"#4ade80":savePct>=15?"#a5b4fc":"#fbbf24");
    rr(P,spY,sw,spH,spH/2); fill(sg);
  }
  // label inside bar
  txt(`💾  Savings: ${savePctStr}`, P+14, spY+17, "bold 12px system-ui,sans-serif", "#fff", 0.92);

  // ════════════════════════════════
  // TOP CATEGORIES PANEL  (y: 254–440)
  // ════════════════════════════════
  const catTotals={};
  monthExpenses.forEach(e=>{
    const c=e.category||"Other"; catTotals[c]=(catTotals[c]||0)+e.amount;
  });
  const top3=Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const maxCat=top3[0]?.[1]||1;

  // Panel background
  const panelY=254, panelH = top3.length ? top3.length*58+52 : 80;
  rr(P,panelY,W-P*2,panelH,16);
  const pbg=ctx.createLinearGradient(P,panelY,P,panelY+panelH);
  pbg.addColorStop(0,"rgba(255,255,255,0.07)");
  pbg.addColorStop(1,"rgba(255,255,255,0.02)");
  fill(pbg);
  // top accent border
  rr(P,panelY,W-P*2,3,1);
  const pab=ctx.createLinearGradient(P,0,W-P,0);
  pab.addColorStop(0,"#6366f1"); pab.addColorStop(0.5,"#8b5cf6"); pab.addColorStop(1,"#0ea5e9");
  fill(pab);

  txt("🏆  TOP SPENDING CATEGORIES", P+16, panelY+28, "bold 13px system-ui,sans-serif", "#a5b4fc");

  const rankC=[["#fbbf24","#92400e"],["#cbd5e1","#475569"],["#c47835","#78350f"]];
  const barC =[["#6366f1","#8b5cf6"],["#0ea5e9","#38bdf8"],["#10b981","#34d399"]];

  top3.forEach(([cat,amt],i)=>{
    const ry = panelY + 44 + i*58;
    const pct = (amt/maxCat*100).toFixed(0);

    // Rank medal circle
    rr(P+14, ry+2, 28, 28, 14);
    const mc=ctx.createLinearGradient(P+14,ry+2,P+42,ry+30);
    mc.addColorStop(0,rankC[i][0]); mc.addColorStop(1,rankC[i][1]);
    fill(mc);
    txt(`${i+1}`, P+28, ry+21, "bold 13px system-ui,sans-serif", "#fff", 1, "center");

    // Category name
    const catName = cat.length>30 ? cat.slice(0,30)+"…" : cat;
    txt(catName, P+50, ry+12, "bold 14px system-ui,sans-serif", "#f1f5f9");

    // Amount + percentage
    txt(fmt(amt), P+50, ry+30, "13px system-ui,sans-serif", "#94a3b8", 0.85);
    txt(`${pct}%`, W-P-14, ry+12, "bold 13px system-ui,sans-serif", "#e2e8f0", 0.9, "right");

    // Bar track
    const trackX=P+50, trackW=W-P*2-74, trackH=6, trackY=ry+36;
    rr(trackX,trackY,trackW,trackH,3); fill("rgba(255,255,255,0.09)");
    // Bar fill
    const fw=Math.max(6, Math.round(amt/maxCat*trackW));
    const bg2=ctx.createLinearGradient(trackX,0,trackX+fw,0);
    bg2.addColorStop(0,barC[i][0]); bg2.addColorStop(1,barC[i][1]);
    rr(trackX,trackY,fw,trackH,3); fill(bg2);
  });

  if(top3.length===0){
    txt("No expenses recorded this month.", P+16, panelY+56, "14px system-ui,sans-serif", "#94a3b8", 0.7);
  }

  // ════════════════════════════════
  // FOOTER  (last 30px)
  // ════════════════════════════════
  const fY = H - 18;
  // divider
  ctx.save(); ctx.globalAlpha=0.12;
  ctx.fillStyle="#fff"; ctx.fillRect(P, fY-14, W-P*2, 1); ctx.restore();

  txt("abdurrahmancce.github.io/Expense-Tracker", W/2, fY, "11px system-ui,sans-serif", "#818cf8", 0.65, "center");
  // ET badge
  rr(W-P-52, fY-22, 50, 22, 6); fill("rgba(99,102,241,0.22)");
  txt("ET", W-P-27, fY-6, "bold 11px system-ui,sans-serif", "#a5b4fc", 0.85, "center");

  // Convert to blob
  off.toBlob(async blob => {
    if(!blob){ showToast("Image generation failed", "error"); return; }
    const url = URL.createObjectURL(blob);

    // Build modal
    const overlay = document.createElement("div");
    overlay.className = "share-modal-overlay";
    overlay.innerHTML = `
      <div class="share-modal">
        <img src="${url}" class="share-card-preview" alt="Monthly Summary Card" style="width:100%;max-width:520px;display:block;margin:0 auto;">
        <div class="share-modal-actions">
          <button class="share-btn-wa" id="_waBtn">📲 WhatsApp</button>
          <button class="share-btn-tg" id="_tgBtn">✈️ Telegram</button>
          <button class="share-btn-dl" id="_dlBtn">⬇️ Download</button>
          ${navigator.share ? '<button class="share-btn-dl" id="_nativeShareBtn" style="background:#22c55e;">📤 Share</button>' : ""}
          <button class="share-btn-cls" id="_shareClose">✕ Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const file = new File([blob], `summary-${monthLabel.replace(" ","-")}.png`, { type:"image/png" });

    overlay.querySelector("#_dlBtn").onclick = () => {
      const a=document.createElement("a"); a.href=url;
      a.download=`expense-summary-${monthLabel.replace(" ","-")}.png`;
      a.click();
      showToast("Downloaded! ✅","success");
    };

    overlay.querySelector("#_waBtn").onclick = () => {
      // WhatsApp share via web.whatsapp.com (opens chat)
      const text = encodeURIComponent(`📊 ${monthLabel} Summary\n💸 Expense: ${fmt(monthExpense)}\n💰 Income: ${fmt(monthIncome)}\n✅ Net: ${(net>=0?"+":"")+fmt(net)}\n📈 Savings: ${savePct}%`);
      window.open(`https://wa.me/?text=${text}`, "_blank");
      showToast("WhatsApp opened — share the downloaded image!", "info");
    };

    overlay.querySelector("#_tgBtn").onclick = () => {
      const text = encodeURIComponent(`📊 ${monthLabel} Summary\n💸 Expense: ${fmt(monthExpense)}\n💰 Income: ${fmt(monthIncome)}\n✅ Net: ${(net>=0?"+":"")+fmt(net)}\n📈 Savings: ${savePct}%`);
      window.open(`https://t.me/share/url?url=${encodeURIComponent("https://abdurrahmancce.github.io/Expense-Tracker/")}&text=${text}`, "_blank");
      showToast("Telegram opened!", "info");
    };

    const nativeBtn = overlay.querySelector("#_nativeShareBtn");
    if(nativeBtn) nativeBtn.onclick = async () => {
      try {
        if(navigator.canShare?.({ files:[file] })){
          await navigator.share({ files:[file], title:"Monthly Summary", text:`${monthLabel} Expense Summary` });
        } else {
          await navigator.share({ title:"Monthly Summary", text:`${monthLabel} Expense Summary`, url:"https://abdurrahmancce.github.io/Expense-Tracker/" });
        }
      } catch(e){ if(e.name !== "AbortError") showToast("Share failed","error"); }
    };

    const close = () => { URL.revokeObjectURL(url); overlay.remove(); };
    overlay.querySelector("#_shareClose").onclick = close;
    overlay.addEventListener("click", e => { if(e.target===overlay) close(); });
  }, "image/png");
}

// ===========================
// FEATURE 36: BILL SPLITTER
// ===========================
(function(){
  const titleEl  = document.getElementById("splitTitle");
  const totalEl  = document.getElementById("splitTotal");
  const nameEl   = document.getElementById("splitPersonName");
  const addBtn   = document.getElementById("splitAddPersonBtn");
  const calcBtn  = document.getElementById("splitCalcBtn");
  const peopleEl = document.getElementById("splitPeopleList");
  const resultEl = document.getElementById("splitResult");
  const dropBtn  = document.getElementById("splitDropdownBtn");
  const dropContent = document.getElementById("splitDropdownContent");

  if(!addBtn) return;

  // Dropdown toggle — uses "open" class to match CSS
  if(dropBtn && dropContent){
    dropBtn.addEventListener("click", () => {
      const open = dropContent.classList.contains("open");
      dropContent.classList.toggle("open", !open);
      const caret = dropBtn.querySelector(".caret");
      if(caret) caret.textContent = open ? "▾" : "▴";
    });
  }

  let _people = [];

  function renderPeople(){
    peopleEl.innerHTML = _people.map((p,i) => `
      <div class="split-person-chip">
        👤 ${esc(p)}
        <button data-remove="${i}" title="Remove">✕</button>
      </div>
    `).join("");
    peopleEl.querySelectorAll("[data-remove]").forEach(btn => {
      btn.addEventListener("click", () => {
        _people.splice(Number(btn.dataset.remove), 1);
        renderPeople();
      });
    });
  }

  addBtn.addEventListener("click", () => {
    const name = nameEl.value.trim();
    if(!name){ showToast("Enter a person's name", "error"); return; }
    if(_people.includes(name)){ showToast("Already added!", "error"); return; }
    _people.push(name);
    nameEl.value = "";
    renderPeople();
    haptic([20]);
  });

  nameEl.addEventListener("keydown", e => { if(e.key==="Enter"){ e.preventDefault(); addBtn.click(); } });

  calcBtn.addEventListener("click", () => {
    const title = titleEl.value.trim() || "Bill";
    const total = parseFloat(totalEl.value);
    if(!total || total <= 0){ showToast("Enter a valid total amount", "error"); return; }
    if(_people.length < 2){ showToast("Add at least 2 people to split", "error"); return; }
    if(typeof haptic === "function") haptic([30]);

    const share = total / _people.length;
    const peopleCopy = [..._people];

    // Result summary HTML
    resultEl.innerHTML = `
      <div class="split-result-card">
        <h4>🤝 ${esc(title)} — ${fmt(total)} ÷ ${_people.length} people</h4>
        ${peopleCopy.map(p => `
          <div class="split-row">
            <span class="split-name">👤 ${esc(p)}</span>
            <span class="split-share">${fmt(share)}</span>
          </div>
        `).join("")}
        <div style="margin-top:14px;">
          <button id="_splitCardBtn" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:10px;padding:10px 24px;cursor:pointer;font-size:14px;font-weight:700;">🖼️ Share Card</button>
        </div>
      </div>
    `;

    // Share Card (PNG)
    resultEl.querySelector("#_splitCardBtn").addEventListener("click", () => {
      _generateSplitCard(title, total, peopleCopy, share);
    });

    showToast(`Split: each pays ${fmt(share)} 💰`, "success");
  });
})();

function _generateSplitCard(title, total, people, share){
  // roundRect polyfill
  if(!CanvasRenderingContext2D.prototype.roundRect){
    CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
      r = Math.min(r, w/2, h/2);
      this.moveTo(x+r,y); this.lineTo(x+w-r,y);
      this.quadraticCurveTo(x+w,y,x+w,y+r); this.lineTo(x+w,y+h-r);
      this.quadraticCurveTo(x+w,y+h,x+w-r,y+h); this.lineTo(x+r,y+h);
      this.quadraticCurveTo(x,y+h,x,y+h-r); this.lineTo(x,y+r);
      this.quadraticCurveTo(x,y,x+r,y); this.closePath();
    };
  }

  const DPR = 2;
  const W = 480;
  const ROW_H = 52;
  const HEADER_H = 130;
  const FOOTER_H = 54;
  const H = HEADER_H + people.length * ROW_H + FOOTER_H;

  const off = document.createElement("canvas");
  off.width = W * DPR; off.height = H * DPR;
  const ctx = off.getContext("2d");
  ctx.scale(DPR, DPR);

  function rr(x,y,w,h,r){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); }
  function fill(c){ ctx.fillStyle=c; ctx.fill(); }
  function txt(t,x,y,font,color,alpha,align){
    ctx.save(); ctx.globalAlpha=alpha??1; ctx.fillStyle=color;
    ctx.font=font; ctx.textAlign=align??"left"; ctx.fillText(t,x,y); ctx.restore();
  }

  // ── Background ──
  const bg = ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,"#0f0c29"); bg.addColorStop(1,"#24243e");
  rr(0,0,W,H,20); fill(bg);

  // Orb decoration
  const orb = ctx.createRadialGradient(W*0.8,30,0,W*0.8,30,160);
  orb.addColorStop(0,"rgba(99,102,241,0.22)"); orb.addColorStop(1,"transparent");
  ctx.save(); ctx.fillStyle=orb; ctx.beginPath(); ctx.arc(W*0.8,30,160,0,Math.PI*2); ctx.fill(); ctx.restore();

  // ── Header ──
  const hg = ctx.createLinearGradient(0,0,W,0);
  hg.addColorStop(0,"rgba(99,102,241,0.45)"); hg.addColorStop(1,"rgba(139,92,246,0.2)");
  rr(0,0,W,HEADER_H,0); fill(hg);
  ctx.fillStyle="rgba(255,255,255,0.07)"; ctx.fillRect(0,HEADER_H,W,1);

  // Logo box
  const lg = ctx.createLinearGradient(20,16,64,60);
  lg.addColorStop(0,"#fbbf24"); lg.addColorStop(1,"#f59e0b");
  rr(20,18,44,44,10); fill(lg);
  ctx.font="28px system-ui"; ctx.textAlign="center"; ctx.fillText("🤝",42,50);

  txt(title, 76, 38, "bold 20px system-ui,sans-serif", "#fff");
  txt("Bill Split", 76, 60, "13px system-ui,sans-serif", "#a5b4fc", 0.85);

  // Total + per-person pill row
  const pillData = [
    { label:"Total", val:fmt(total), c1:"#6366f1", c2:"#8b5cf6" },
    { label:"Each Pays", val:fmt(share), c1:"#10b981", c2:"#34d399" },
    { label:"People", val:`${people.length}`, c1:"#f59e0b", c2:"#fbbf24" },
  ];
  const pillW = (W - 40 - 12) / 3;
  pillData.forEach((p,i)=>{
    const px = 20 + i*(pillW+6), py = 76;
    const pg = ctx.createLinearGradient(px,py,px+pillW,py);
    pg.addColorStop(0,p.c1); pg.addColorStop(1,p.c2);
    rr(px,py,pillW,38,10); fill(pg);
    txt(p.val, px+pillW/2, py+16, "bold 13px system-ui,sans-serif", "#fff", 1, "center");
    txt(p.label, px+pillW/2, py+30, "10px system-ui,sans-serif", "#fff", 0.75, "center");
  });

  // ── People rows ──
  people.forEach((name,i)=>{
    const ry = HEADER_H + i * ROW_H;
    const even = i%2===0;
    ctx.fillStyle = even ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)";
    ctx.fillRect(0, ry, W, ROW_H);

    // Avatar circle
    const colors = ["#6366f1","#0ea5e9","#22c55e","#f59e0b","#ec4899","#8b5cf6"];
    const ac = ctx.createRadialGradient(36,ry+26,0,36,ry+26,16);
    ac.addColorStop(0, colors[i%colors.length]);
    ac.addColorStop(1, colors[(i+1)%colors.length]);
    ctx.beginPath(); ctx.arc(36,ry+26,16,0,Math.PI*2); ctx.fillStyle=ac; ctx.fill();
    txt(name[0]?.toUpperCase()||"?", 36, ry+31, "bold 14px system-ui,sans-serif", "#fff", 1, "center");

    // Name
    const dispName = name.length>22 ? name.slice(0,22)+"…" : name;
    txt(dispName, 62, ry+30, "14px system-ui,sans-serif", "#e2e8f0");

    // Amount badge
    const amtW = ctx.measureText(fmt(share)).width + 28;
    const abg = ctx.createLinearGradient(W-20-amtW, ry+12, W-20, ry+12);
    abg.addColorStop(0,"rgba(16,185,129,0.2)"); abg.addColorStop(1,"rgba(52,211,153,0.15)");
    rr(W-20-amtW, ry+12, amtW, 28, 8); fill(abg);
    txt(fmt(share), W-20-amtW/2, ry+31, "bold 13px system-ui,sans-serif", "#34d399", 1, "center");

    // Divider
    if(i < people.length-1){
      ctx.save(); ctx.globalAlpha=0.08; ctx.fillStyle="#fff"; ctx.fillRect(56,ry+ROW_H-1,W-76,1); ctx.restore();
    }
  });

  // ── Footer ──
  const footY = HEADER_H + people.length * ROW_H;
  const fg = ctx.createLinearGradient(0,footY,W,footY);
  fg.addColorStop(0,"rgba(99,102,241,0.18)"); fg.addColorStop(1,"rgba(139,92,246,0.08)");
  ctx.fillStyle=fg; ctx.fillRect(0,footY,W,FOOTER_H);
  ctx.fillStyle="rgba(255,255,255,0.07)"; ctx.fillRect(0,footY,W,1);

  const dateStr = new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
  txt("💰 Expense Tracker", 20, footY+22, "bold 12px system-ui,sans-serif", "#a5b4fc", 0.85);
  txt(dateStr, 20, footY+40, "11px system-ui,sans-serif", "#94a3b8", 0.7);
  txt("abdurrahmancce.github.io", W-20, footY+31, "11px system-ui,sans-serif", "#6366f1", 0.6, "right");

  // ── Generate blob → modal ──
  off.toBlob(blob => {
    if(!blob){ showToast("Card generation failed","error"); return; }
    const url = URL.createObjectURL(blob);
    const fileName = `split-${title.replace(/\s+/g,"-")}.png`;

    const overlay = document.createElement("div");
    overlay.className = "share-modal-overlay";
    overlay.innerHTML = `
      <div class="share-modal">
        <p style="font-weight:700;font-size:15px;margin:0 0 12px;text-align:center;">🖼️ Split Card</p>
        <img src="${url}" style="width:100%;max-width:400px;display:block;margin:0 auto;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.35);" alt="Split Card">
        <div class="share-modal-actions" style="margin-top:14px;">
          <button id="_scDl" class="share-btn-dl">⬇️ Download</button>
          <button id="_scWA" class="share-btn-wa">📲 WhatsApp</button>
          ${navigator.share ? '<button id="_scNative" class="share-btn-dl" style="background:#22c55e;">📤 Share</button>' : ""}
          <button id="_scClose" class="share-btn-cls">✕ Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#_scDl").onclick = () => {
      const a = document.createElement("a"); a.href=url; a.download=fileName; a.click();
      showToast("Downloaded! ✅","success");
    };
    overlay.querySelector("#_scWA").onclick = () => {
      const text = `🤝 *${title} Split*\nTotal: ${fmt(total)}\nEach: ${fmt(share)}\n` + people.map(p=>`👤 ${p}: ${fmt(share)}`).join("\n");
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    };
    const nBtn = overlay.querySelector("#_scNative");
    if(nBtn) nBtn.onclick = async () => {
      const file = new File([blob], fileName, {type:"image/png"});
      try {
        if(navigator.canShare?.({files:[file]})){
          await navigator.share({files:[file], title:"Bill Split", text:`${title} — each pays ${fmt(share)}`});
        } else {
          await navigator.share({title:"Bill Split", text:`${title} — each pays ${fmt(share)}`});
        }
      } catch(e){ if(e.name!=="AbortError") showToast("Share failed","error"); }
    };
    const close = () => { URL.revokeObjectURL(url); overlay.remove(); };
    overlay.querySelector("#_scClose").onclick = close;
    overlay.addEventListener("click", e=>{ if(e.target===overlay) close(); });
  }, "image/png");
}

// ===========================
// FEATURE 37: AUTH SCREEN LIVE ANIMATIONS
// ===========================
(function(){
  // ---- Particle canvas ----
  const canvas = document.getElementById("authParticleCanvas");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  let W, H, particles = [];

  function resize(){
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  class Particle {
    constructor(){
      this.reset(true);
    }
    reset(init){
      this.x = Math.random() * W;
      this.y = init ? Math.random() * H : H + 10;
      this.size = Math.random() * 2 + 0.5;
      this.speedY = -(Math.random() * 0.4 + 0.1);
      this.speedX = (Math.random() - 0.5) * 0.2;
      this.opacity = Math.random() * 0.5 + 0.1;
      const colors = ["#6366f1","#a78bfa","#38bdf8","#818cf8","#e0e7ff"];
      this.color = colors[Math.floor(Math.random()*colors.length)];
    }
    update(){
      this.y += this.speedY;
      this.x += this.speedX;
      if(this.y < -10) this.reset(false);
    }
    draw(){
      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  for(let i=0; i<90; i++) particles.push(new Particle());

  function animParticles(){
    if(!document.getElementById("authScreen") || document.getElementById("authScreen").classList.contains("hidden")){
      return; // stop when auth screen hidden
    }
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animParticles);
  }
  animParticles();

  // ---- Typewriter subtitle ----
  const subtitleEl = document.getElementById("authTypewriter");
  if(subtitleEl){
    const phrases = [
      "Track your finances, anytime.",
      "Stay on top of every taka.",
      "Smart budgeting made simple.",
      "Your money, your control."
    ];
    let pi=0, ci=0, deleting=false, pauseTimer=0;
    function typeWriter(){
      const phrase = phrases[pi];
      if(deleting){
        subtitleEl.textContent = phrase.substring(0, ci--);
        if(ci < 0){ deleting=false; pi=(pi+1)%phrases.length; ci=0; pauseTimer=12; }
      } else {
        subtitleEl.textContent = phrase.substring(0, ci++);
        if(ci > phrase.length){ deleting=true; pauseTimer=40; }
      }
      if(pauseTimer-- > 0){ setTimeout(typeWriter, 80); return; }
      setTimeout(typeWriter, deleting ? 45 : 75);
    }
    setTimeout(typeWriter, 800);
  }

  // ---- Tab slider ----
  const loginTab  = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const tabsEl    = loginTab?.closest(".auth-tabs");

  if(loginTab && signupTab && tabsEl){
    signupTab.addEventListener("click",  () => tabsEl.classList.add("signup-active"));
    loginTab.addEventListener("click",   () => tabsEl.classList.remove("signup-active"));
  }
})();
