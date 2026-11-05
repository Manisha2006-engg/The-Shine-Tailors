const API = "/api";
let token = localStorage.getItem("shineToken") || "";
let currentUser = null;
let authMode = "login";
const fields = [
  ["bust","Bust"],["underbust","Underbust"],["blouse_length","Blouse length"],["shoulder","Shoulder"],
  ["front_neck","Front neck"],["back_neck","Back neck"],["sleeve_length","Sleeve length"],["armhole","Armhole"],
  ["waist","Waist"],["hip","Hip"],["kameez_length","Chudidar top length"],["pant_length","Pant length"],["notes","Fitting notes"]
];

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(API + path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3000);
}
function formObject(form) { return Object.fromEntries(new FormData(form).entries()); }
function setAuthUI() {
  document.getElementById("loginOpen").classList.toggle("hidden", !!currentUser);
  document.getElementById("logoutBtn").classList.toggle("hidden", !currentUser);
  document.getElementById("guestMessage").classList.toggle("hidden", !!currentUser);
  document.getElementById("customerPanel").classList.toggle("hidden", !currentUser);
  document.getElementById("owner").classList.toggle("hidden", currentUser?.role !== "admin");
  document.getElementById("loginOpen2").classList.toggle("hidden", !!currentUser);
}
function renderMeasureInputs(data = {}) {
  document.getElementById("measureForm").innerHTML = fields.map(([key,label]) =>
    `<label>${label}<input name="${key}" ${key==="notes" ? 'placeholder="Any fitting preference"' : 'type="number" step="0.1"'} value="${escapeHtml(data[key] || "")}"></label>`
  ).join("");
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
async function loadGallery(filter = "all") {
  const { items } = await api("/gallery");
  const list = filter === "all" ? items : items.filter(x => x.category === filter);
  document.getElementById("galleryGrid").innerHTML = list.map(x => `
    <article class="design-card"><img src="${escapeHtml(x.image_url || "https://placehold.co/600x400?text=The+Shine+Tailors")}" alt="${escapeHtml(x.title)}">
    <div><span class="eyebrow">${escapeHtml(x.category)}</span><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.description || "")}</p></div></article>`).join("") || "<p>No designs in this category yet.</p>";
}
async function loadCustomer() {
  if (!currentUser) return;
  const { user } = await api("/me");
  currentUser = user; setAuthUI();
  const profile = document.getElementById("profileForm");
  ["name","age","phone","address"].forEach(k => profile.elements[k].value = user[k] ?? "");
  const { measurements } = await api("/me/measurements");
  renderMeasureInputs(measurements);
  document.getElementById("measureFileLink").innerHTML = user.measurement_file
    ? `Uploaded sheet: <a target="_blank" rel="noopener" href="${user.measurement_file}">View file</a>` : "";
  await loadMyOrders();
  if (currentUser.role === "admin") await loadAdmin();
}
async function loadMyOrders() {
  const { orders } = await api("/orders/mine");
  document.getElementById("myOrders").innerHTML = orders.length ? orders.map(o => `
    <div class="order-card"><div><b>${escapeHtml(o.order_code)}</b> · ${escapeHtml(o.garment_type)} ${o.is_bridal ? "· Marriage" : ""}<br><small>${escapeHtml(o.created_at)}</small><br><small>Delivery: ${escapeHtml(o.delivery_date || "To be assigned by shop")}</small></div><span class="status">${escapeHtml(o.status)}</span></div>`).join("") : '<p class="muted">No orders yet.</p>';
}
async function loadAdmin() {
  const [{orders},{customers}] = await Promise.all([api("/admin/orders"),api("/admin/customers")]);
  document.getElementById("adminOrders").innerHTML = orders.length ? orders.map(o => `
    <div class="admin-order"><b>${escapeHtml(o.order_code)}</b> · ${escapeHtml(o.customer_name)} (${o.is_bridal ? "Marriage" : "Regular"})<br>
    <span>${escapeHtml(o.garment_type)} — ${escapeHtml(o.status)}</span><br>
    <label>Shop delivery date <input type="date" id="date-${o.id}" value="${escapeHtml(o.delivery_date || "")}"></label>
    <select id="status-${o.id}">${["Pending","Accepted","Rejected","In Progress","Completed"].map(s=>`<option ${o.status===s?"selected":""}>${s}</option>`).join("")}</select>
    <button class="btn btn-primary" onclick="updateOrder(${o.id})">Save order</button></div>`).join("") : '<p class="muted">No order requests yet.</p>';
  document.getElementById("adminCustomers").innerHTML = customers.map(c => `
    <div class="customer-record"><b>${escapeHtml(c.name)}</b> · ${escapeHtml(c.phone || c.email)}<br>
    <small>${escapeHtml(c.address || "No address")} | Bust: ${escapeHtml(c.bust || "—")} | Waist: ${escapeHtml(c.waist || "—")} | Hip: ${escapeHtml(c.hip || "—")}</small></div>`).join("") || '<p class="muted">No customers registered yet.</p>';
}
window.updateOrder = async id => {
  try {
    const status = document.getElementById(`status-${id}`).value;
    const deliveryDate = document.getElementById(`date-${id}`).value;
    await api(`/admin/orders/${id}`, { method:"PATCH", body:JSON.stringify({status,deliveryDate}) });
    toast("Order updated."); await loadAdmin(); await loadMyOrders();
  } catch(e) { toast(e.message); }
};
function openAuth() {
  document.getElementById("authError").textContent = "";
  document.getElementById("authDialog").showModal();
}
function showAuthMode() {
  document.getElementById("authTitle").textContent = authMode === "login" ? "Login" : "Create account";
  document.getElementById("authSubmit").textContent = authMode === "login" ? "Login" : "Register";
  document.getElementById("registerNameWrap").classList.toggle("hidden", authMode === "login");
  document.getElementById("authSwitch").innerHTML = authMode === "login"
    ? 'New customer? <a href="#" id="switchAuth">Create an account</a>'
    : 'Already registered? <a href="#" id="switchAuth">Login</a>';
  document.getElementById("switchAuth").onclick = e => { e.preventDefault(); authMode = authMode === "login" ? "register" : "login"; showAuthMode(); };
}
document.getElementById("loginOpen").onclick = openAuth;
document.getElementById("loginOpen2").onclick = openAuth;
document.getElementById("closeAuth").onclick = () => document.getElementById("authDialog").close();
document.getElementById("switchAuth").onclick = e => { e.preventDefault(); authMode = "register"; showAuthMode(); };
document.getElementById("authForm").onsubmit = async e => {
  e.preventDefault();
  const data = formObject(e.currentTarget);
  try {
    const result = await api(authMode === "login" ? "/auth/login" : "/auth/register", { method:"POST", body:JSON.stringify(data) });
    token = result.token; currentUser = result.user; localStorage.setItem("shineToken", token);
    document.getElementById("authDialog").close(); e.currentTarget.reset();
    toast(`Welcome, ${currentUser.name}!`); await loadCustomer();
  } catch(err) { document.getElementById("authError").textContent = err.message; }
};
document.getElementById("logoutBtn").onclick = () => {
  token = ""; currentUser = null; localStorage.removeItem("shineToken"); setAuthUI();
  document.getElementById("myOrders").innerHTML = '<p class="muted">Log in to see your orders.</p>';
  toast("You have logged out.");
};
document.getElementById("profileForm").onsubmit = async e => {
  e.preventDefault();
  try { await api("/me", {method:"PUT",body:JSON.stringify(formObject(e.currentTarget))}); toast("Profile saved."); await loadCustomer(); }
  catch(err) { toast(err.message); }
};
document.getElementById("measureForm").onsubmit = async e => {
  e.preventDefault();
  try { await api("/me/measurements", {method:"PUT",body:JSON.stringify(formObject(e.currentTarget))}); toast("Measurements saved."); }
  catch(err) { toast(err.message); }
};
document.getElementById("measureUploadForm").onsubmit = async e => {
  e.preventDefault();
  try {
    const result = await api("/me/measurement-file", {method:"POST",body:new FormData(e.currentTarget)});
    toast(result.message); await loadCustomer(); e.currentTarget.reset();
  } catch(err) { toast(err.message); }
};
async function submitOrder(form, bridal) {
  if (!currentUser) { toast("Please log in before placing an order."); openAuth(); return; }
  const data = formObject(form);
  data.isBridal = bridal;
  if (bridal) {
    data.category = "Marriage / Bridal";
    if (data.eventDate) data.notes = `Event date: ${data.eventDate}. ${data.notes || ""}`.trim();
  }
  try {
    const result = await api("/orders", {method:"POST",body:JSON.stringify(data)});
    toast(result.message); form.reset(); await loadMyOrders();
  } catch(err) { toast(err.message); }
}
document.getElementById("orderForm").onsubmit = e => { e.preventDefault(); submitOrder(e.currentTarget,false); };
document.getElementById("bridalForm").onsubmit = e => { e.preventDefault(); submitOrder(e.currentTarget,true); };
document.getElementById("galleryForm").onsubmit = async e => {
  e.preventDefault();
  try {
    const result = await api("/gallery", {method:"POST",body:new FormData(e.currentTarget)});
    toast("Design published."); e.currentTarget.reset(); await loadGallery();
  } catch(err) { toast(err.message); }
};
document.querySelectorAll(".filter").forEach(btn => btn.onclick = () => {
  document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active"); loadGallery(btn.dataset.filter).catch(e=>toast(e.message));
});
(async function init() {
  renderMeasureInputs();
  try { await loadGallery(); } catch(e) { toast(e.message); }
  if (token) {
    try { const r = await api("/me"); currentUser = r.user; await loadCustomer(); }
    catch { token = ""; localStorage.removeItem("shineToken"); }
  }
  setAuthUI();
})();
