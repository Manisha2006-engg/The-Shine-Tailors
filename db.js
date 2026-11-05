const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "shine-tailors.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
  age INTEGER,
  phone TEXT,
  address TEXT,
  measurement_file TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  bust TEXT, underbust TEXT, blouse_length TEXT, shoulder TEXT,
  front_neck TEXT, back_neck TEXT, sleeve_length TEXT, armhole TEXT,
  waist TEXT, hip TEXT, kameez_length TEXT, pant_length TEXT,
  notes TEXT, updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('blouses','chudidar','embroidery')),
  description TEXT,
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  garment_type TEXT NOT NULL,
  category TEXT NOT NULL,
  fabric_source TEXT,
  design_details TEXT,
  notes TEXT,
  is_bridal INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK(status IN ('Pending','Accepted','Rejected','In Progress','Completed')),
  delivery_date TEXT,
  reminder_3d_sent INTEGER NOT NULL DEFAULT 0,
  reminder_due_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = db;
