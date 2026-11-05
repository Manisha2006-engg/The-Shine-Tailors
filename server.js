require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 24) {
  console.error("Set JWT_SECRET in .env to a random string at least 24 characters long.");
  process.exit(1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));
app.use(express.static(path.join(__dirname, "public")));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const uploadDir = path.join(__dirname, "public", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  }
});
const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG and WEBP images are allowed."));
    }
    cb(null, true);
  }
});

function makeToken(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Please log in first." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Your login has expired. Please log in again." });
  }
}
function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Shop owner access only." });
  next();
}
function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, age: user.age, phone: user.phone, address: user.address, measurement_file: user.measurement_file };
}
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function addDays(dateString, days) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// Create the shop-owner account once. Change the credentials in .env before using the site.
const adminEmail = (process.env.ADMIN_EMAIL || "owner@theshinetailors.com").toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || "ChangeThisPassword123!";
const existingAdmin = db.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail);
if (!existingAdmin) {
  const hash = bcrypt.hashSync(adminPassword, 12);
  db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'admin')")
    .run(process.env.ADMIN_NAME || "The Shine Tailors Owner", adminEmail, hash);
  console.log(`Shop owner account created: ${adminEmail}`);
}

const seedGallery = db.prepare("SELECT COUNT(*) AS count FROM gallery").get().count;
if (!seedGallery) {
  const add = db.prepare("INSERT INTO gallery (title,category,description,image_url) VALUES (?,?,?,?)");
  [
    ["Aari Bridal Blouse", "blouses", "Hand-finished bridal blouse inspiration.", "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=900&q=80"],
    ["Designer Chudidar", "chudidar", "Elegant custom-fitted suit inspiration.", "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=900&q=80"],
    ["Floral Embroidery", "embroidery", "Detailed handcrafted embroidery inspiration.", "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=900&q=80"]
  ].forEach(x => add.run(...x));
}

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "The Shine Tailors" }));

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password, phone = "" } = req.body;
    if (!name?.trim() || !email?.trim() || !password || password.length < 8) {
      return res.status(400).json({ error: "Enter your name, email and a password with at least 8 characters." });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare("INSERT INTO users (name,email,password_hash,phone,role) VALUES (?,?,?,?,'customer')")
      .run(name.trim(), normalizedEmail, hash, String(phone).trim());
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(result.lastInsertRowid);
    db.prepare("INSERT OR IGNORE INTO measurements (user_id) VALUES (?)").run(user.id);
    res.status(201).json({ token: makeToken(user), user: safeUser(user) });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "That email is already registered." });
    res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  res.json({ token: makeToken(user), user: safeUser(user) });
});

app.get("/api/me", auth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "Account not found." });
  res.json({ user: safeUser(user) });
});

app.put("/api/me", auth, (req, res) => {
  const { name, age, phone, address } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Name is required." });
  db.prepare("UPDATE users SET name=?, age=?, phone=?, address=? WHERE id=?")
    .run(name.trim(), age === "" || age == null ? null : Number(age), String(phone || "").trim(), String(address || "").trim(), req.user.id);
  res.json({ user: safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id)) });
});

const measurementFields = ["bust","underbust","blouse_length","shoulder","front_neck","back_neck","sleeve_length","armhole","waist","hip","kameez_length","pant_length","notes"];
app.get("/api/me/measurements", auth, (req, res) => {
  const row = db.prepare("SELECT * FROM measurements WHERE user_id=?").get(req.user.id);
  res.json({ measurements: row || {} });
});
app.put("/api/me/measurements", auth, (req, res) => {
  const values = measurementFields.map(k => String(req.body[k] ?? "").slice(0, 1000));
  db.prepare(`INSERT INTO measurements (user_id,${measurementFields.join(",")},updated_by,updated_at)
    VALUES (?,${measurementFields.map(()=>"?").join(",")},? ,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET ${measurementFields.map(k=>`${k}=excluded.${k}`).join(",")}, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP`)
    .run(req.user.id, ...values, req.user.id);
  res.json({ ok: true, message: "Measurements saved." });
});
app.post("/api/me/measurement-file", auth, imageUpload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose an image first." });
  const url = `/uploads/${req.file.filename}`;
  db.prepare("UPDATE users SET measurement_file=? WHERE id=?").run(url, req.user.id);
  res.json({ ok: true, url, message: "Measurement sheet uploaded." });
});

app.get("/api/gallery", (_req, res) => {
  res.json({ items: db.prepare("SELECT * FROM gallery ORDER BY id DESC").all() });
});
app.post("/api/gallery", auth, adminOnly, imageUpload.single("image"), (req, res) => {
  const { title, category, description = "", imageUrl = "" } = req.body;
  if (!title?.trim() || !["blouses","chudidar","embroidery"].includes(category)) {
    return res.status(400).json({ error: "Enter a title and valid category." });
  }
  const image = req.file ? `/uploads/${req.file.filename}` : String(imageUrl).trim();
  const result = db.prepare("INSERT INTO gallery (title,category,description,image_url) VALUES (?,?,?,?)")
    .run(title.trim(), category, description.trim(), image);
  res.status(201).json({ item: db.prepare("SELECT * FROM gallery WHERE id=?").get(result.lastInsertRowid) });
});
app.delete("/api/gallery/:id", auth, adminOnly, (req, res) => {
  db.prepare("DELETE FROM gallery WHERE id=?").run(Number(req.params.id));
  res.json({ ok: true });
});

app.post("/api/orders", auth, (req, res) => {
  const { garmentType, category, fabricSource = "", designDetails = "", notes = "", isBridal = false } = req.body;
  if (!garmentType?.trim() || !category?.trim()) return res.status(400).json({ error: "Choose a garment and category." });
  const code = `ST-${Date.now().toString().slice(-8)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  const result = db.prepare(`INSERT INTO orders
    (order_code,user_id,garment_type,category,fabric_source,design_details,notes,is_bridal)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(code, req.user.id, garmentType.trim(), category.trim(), fabricSource.trim(), designDetails.trim(), notes.trim(), isBridal ? 1 : 0);
  res.status(201).json({ order: db.prepare("SELECT * FROM orders WHERE id=?").get(result.lastInsertRowid), message: "Order request sent. The shop owner will review it." });
});
app.get("/api/orders/mine", auth, (req, res) => {
  const orders = db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC").all(req.user.id);
  res.json({ orders });
});
app.get("/api/admin/orders", auth, adminOnly, (_req, res) => {
  const orders = db.prepare(`SELECT o.*,u.name AS customer_name,u.email AS customer_email,u.phone AS customer_phone
    FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC`).all();
  res.json({ orders });
});
app.patch("/api/admin/orders/:id", auth, adminOnly, (req, res) => {
  const { status, deliveryDate } = req.body;
  const allowed = ["Pending","Accepted","Rejected","In Progress","Completed"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid order status." });
  if (["Accepted","In Progress"].includes(status) && !deliveryDate) {
    return res.status(400).json({ error: "Set the shop's delivery date before accepting or starting work." });
  }
  db.prepare(`UPDATE orders SET status=?, delivery_date=?, reminder_3d_sent=0, reminder_due_sent=0 WHERE id=?`)
    .run(status, deliveryDate || null, Number(req.params.id));
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: "Order not found." });
  res.json({ order });
});
app.get("/api/admin/customers", auth, adminOnly, (_req, res) => {
  const customers = db.prepare(`SELECT u.id,u.name,u.email,u.age,u.phone,u.address,u.measurement_file,
    m.bust,m.underbust,m.blouse_length,m.shoulder,m.front_neck,m.back_neck,m.sleeve_length,m.armhole,m.waist,m.hip,m.kameez_length,m.pant_length,m.notes
    FROM users u LEFT JOIN measurements m ON m.user_id=u.id WHERE u.role='customer' ORDER BY u.name`).all();
  res.json({ customers });
});
app.put("/api/admin/customers/:id/measurements", auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const values = measurementFields.map(k => String(req.body[k] ?? "").slice(0,1000));
  db.prepare(`INSERT INTO measurements (user_id,${measurementFields.join(",")},updated_by,updated_at)
    VALUES (?,${measurementFields.map(()=>"?").join(",")},?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET ${measurementFields.map(k=>`${k}=excluded.${k}`).join(",")},updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
    .run(id, ...values, req.user.id);
  res.json({ ok: true });
});

// Daily shop-owner reminders: 3 days before delivery and again on delivery day.
let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}
async function sendReminder(order, kind) {
  const shopEmail = process.env.SHOP_EMAIL || process.env.ADMIN_EMAIL;
  const subject = kind === "due" ? `Delivery due today: ${order.order_code}` : `Delivery in 3 days: ${order.order_code}`;
  const body = `${kind === "due" ? "DELIVERY IS DUE TODAY" : "DELIVERY IS IN 3 DAYS"}\n\nOrder: ${order.order_code}\nCustomer: ${order.customer_name}\nPhone: ${order.customer_phone || "Not provided"}\nGarment: ${order.garment_type}\nType: ${order.is_bridal ? "Marriage / Bridal order" : "Regular order"}\nDelivery date: ${order.delivery_date}\nStatus: ${order.status}`;
  if (mailer && shopEmail) {
    await mailer.sendMail({ from: process.env.SMTP_USER, to: shopEmail, subject, text: body });
  } else {
    console.log("\n[SHOP DELIVERY REMINDER - EMAIL NOT CONFIGURED]\n" + body + "\n");
  }
}
async function runDeliveryReminders() {
  const today = todayLocal();
  const dueSoon = db.prepare(`SELECT o.*,u.name AS customer_name,u.phone AS customer_phone
    FROM orders o JOIN users u ON u.id=o.user_id
    WHERE o.status IN ('Accepted','In Progress') AND o.delivery_date=? AND o.reminder_3d_sent=0`).all(addDays(today, 3));
  for (const order of dueSoon) {
    try { await sendReminder(order, "soon"); db.prepare("UPDATE orders SET reminder_3d_sent=1 WHERE id=?").run(order.id); }
    catch (e) { console.error("3-day reminder failed:", e.message); }
  }
  const dueToday = db.prepare(`SELECT o.*,u.name AS customer_name,u.phone AS customer_phone
    FROM orders o JOIN users u ON u.id=o.user_id
    WHERE o.status IN ('Accepted','In Progress') AND o.delivery_date=? AND o.reminder_due_sent=0`).all(today);
  for (const order of dueToday) {
    try { await sendReminder(order, "due"); db.prepare("UPDATE orders SET reminder_due_sent=1 WHERE id=?").run(order.id); }
    catch (e) { console.error("Due-day reminder failed:", e.message); }
  }
}
cron.schedule("0 9 * * *", runDeliveryReminders);
app.post("/api/admin/reminders/test", auth, adminOnly, async (_req, res) => {
  await runDeliveryReminders();
  res.json({ ok: true, message: "Reminder check completed. Check the shop email or server terminal." });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Something went wrong." });
});
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`The Shine Tailors is running at http://localhost:${PORT}`);
  console.log(`Shop owner login email: ${adminEmail}`);
  console.log("Reminder scheduler checks daily at 9:00 AM server local time.");
});
