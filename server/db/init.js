import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'server', 'db', 'ev_problems.sqlite');

if (fs.existsSync(dbPath)) {
  console.log('Database already exists:', dbPath);
  process.exit(0);
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  UNIQUE(brand, model)
);

CREATE TABLE issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vehicle_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  solution TEXT,
  service_experience TEXT,
  status TEXT DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
);

CREATE TRIGGER issues_updated_at
AFTER UPDATE ON issues
FOR EACH ROW
BEGIN
  UPDATE issues SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
`);

console.log('Database initialized at', dbPath);
