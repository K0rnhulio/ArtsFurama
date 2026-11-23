const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'furama_art.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT UNIQUE NOT NULL,
    guest_name TEXT DEFAULT '',
    room_or_villa TEXT DEFAULT '',
    frame_style TEXT DEFAULT 'Studio Recommendation',
    paper_size TEXT DEFAULT 'A3 Art Paper',
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'uploaded',
    original_filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    image_width INTEGER,
    image_height INTEGER,
    artwork_filename TEXT,
    artwork_original_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT NOT NULL,
    author_role TEXT NOT NULL,
    author_name TEXT DEFAULT '',
    status_changed_to TEXT,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (order_code) REFERENCES orders(order_code)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_updates_code ON order_updates(order_code);
`);

const VALID_STATUSES = ['uploaded', 'in_design', 'in_production', 'delivered'];

function generateOrderCode() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `FUR-${yy}${mm}-`;

  const row = db
    .prepare('SELECT order_code FROM orders WHERE order_code LIKE ? ORDER BY id DESC LIMIT 1')
    .get(`${prefix}%`);

  let nextNum = 1;
  if (row && row.order_code) {
    const tail = parseInt(row.order_code.slice(prefix.length), 10);
    if (!Number.isNaN(tail)) {
      nextNum = tail + 1;
    }
  }
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

function createOrder(data) {
  const now = new Date().toISOString();
  const orderCode = generateOrderCode();

  db.prepare(`
    INSERT INTO orders (
      order_code, guest_name, room_or_villa, frame_style, paper_size, notes,
      status, original_filename, stored_filename, mime_type, file_size,
      image_width, image_height, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'uploaded', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderCode,
    data.guestName || '',
    data.roomOrVilla || '',
    data.frameStyle || 'Studio Recommendation',
    data.paperSize || 'A3 Art Paper',
    data.notes || '',
    data.originalFilename,
    data.storedFilename,
    data.mimeType,
    data.fileSize,
    data.imageWidth ?? null,
    data.imageHeight ?? null,
    now,
    now
  );

  const initialNote = data.notes?.trim()
    ? `Photo uploaded by Furama Resort. Note: ${data.notes.trim()}`
    : 'High-resolution guest photo uploaded by Furama Resort.';

  db.prepare(`
    INSERT INTO order_updates (order_code, author_role, author_name, status_changed_to, note, created_at)
    VALUES (?, 'resort', ?, 'uploaded', ?, ?)
  `).run(orderCode, data.guestName || 'Furama Concierge', initialNote, now);

  return getOrderByCode(orderCode);
}

function listOrders({ status, q } = {}) {
  const clauses = [];
  const params = [];

  if (status && status !== 'all' && VALID_STATUSES.includes(status)) {
    clauses.push('status = ?');
    params.push(status);
  }

  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    clauses.push('(order_code LIKE ? OR guest_name LIKE ? OR room_or_villa LIKE ? OR notes LIKE ?)');
    params.push(like, like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM orders ${where} ORDER BY id DESC`).all(...params);
}

function getOrderByCode(orderCode) {
  const order = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(orderCode);
  if (!order) return null;
  const updates = db
    .prepare('SELECT * FROM order_updates WHERE order_code = ? ORDER BY id ASC')
    .all(orderCode);
  return { ...order, updates };
}

function updateOrderStatus(orderCode, { status, note, authorRole = 'studio', authorName = 'Art Studio' }) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const existing = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(orderCode);
  if (!existing) return null;

  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE order_code = ?').run(status, now, orderCode);

  const labels = {
    uploaded: 'Uploaded',
    in_design: 'In Design',
    in_production: 'In Production',
    delivered: 'Delivered',
  };
  const message = note && note.trim() ? note.trim() : `Status updated to ${labels[status]}.`;

  db.prepare(`
    INSERT INTO order_updates (order_code, author_role, author_name, status_changed_to, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(orderCode, authorRole, authorName, status, message, now);

  return getOrderByCode(orderCode);
}

function addOrderNote(orderCode, { note, authorRole = 'resort', authorName = '' }) {
  const existing = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(orderCode);
  if (!existing) return null;

  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET updated_at = ? WHERE order_code = ?').run(now, orderCode);
  db.prepare(`
    INSERT INTO order_updates (order_code, author_role, author_name, status_changed_to, note, created_at)
    VALUES (?, ?, ?, NULL, ?, ?)
  `).run(orderCode, authorRole, authorName || (authorRole === 'studio' ? 'Art Studio' : 'Furama Resort'), note.trim(), now);

  return getOrderByCode(orderCode);
}

function attachArtwork(orderCode, { artworkFilename, artworkOriginalName, note }) {
  const existing = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(orderCode);
  if (!existing) return null;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE orders
    SET artwork_filename = ?, artwork_original_name = ?, updated_at = ?
    WHERE order_code = ?
  `).run(artworkFilename, artworkOriginalName, now, orderCode);

  db.prepare(`
    INSERT INTO order_updates (order_code, author_role, author_name, status_changed_to, note, created_at)
    VALUES (?, 'studio', 'Art Designer', NULL, ?, ?)
  `).run(
    orderCode,
    note && note.trim() ? note.trim() : `Uploaded artwork preview (${artworkOriginalName}).`,
    now
  );

  return getOrderByCode(orderCode);
}

module.exports = {
  VALID_STATUSES,
  createOrder,
  listOrders,
  getOrderByCode,
  updateOrderStatus,
  addOrderNote,
  attachArtwork,
};
