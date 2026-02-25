const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to SQLite database (this will create 'chat.db' in your backend folder)
const db = new sqlite3.Database(path.join(__dirname, 'chat.db'), (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// Initialize tables based on assignment schema
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    role TEXT CHECK(role IN ('user', 'assistant')),
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES sessions(id)
  )`);
});

module.exports = db;