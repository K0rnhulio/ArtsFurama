const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const ORIGINALS_DIR = path.join(__dirname, 'uploads', 'originals');
const ARTWORKS_DIR = path.join(__dirname, 'uploads', 'artworks');
fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
fs.mkdirSync(ARTWORKS_DIR, { recursive: true });

function makeStorage(destDir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(destDir, { recursive: true });
      cb(null, destDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      const id = crypto.randomUUID();
      cb(null, `${Date.now()}-${id}${ext}`);
    },
  });
}

function imageFileFilter(_req, file, cb) {
  const allowedExt = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif',
    '.tif', '.tiff', '.bmp', '.dng', '.raw', '.avif',
  ]);
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (file.mimetype.startsWith('image/') || allowedExt.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Please upload an image file (JPG, PNG, HEIC, WEBP, TIFF, or RAW).'));
  }
}

const uploadOriginal = multer({
  storage: makeStorage(ORIGINALS_DIR),
  fileFilter: imageFileFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
});

const uploadArtwork = multer({
  storage: makeStorage(ARTWORKS_DIR),
  fileFilter: imageFileFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
});

app.use(express.json());
app.use('/uploads/originals', express.static(ORIGINALS_DIR));
app.use('/uploads/artworks', express.static(ARTWORKS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

function formatOrder(order) {
  if (!order) return null;
  return {
    ...order,
    originalUrl: `/uploads/originals/${encodeURIComponent(order.stored_filename)}`,
    downloadUrl: `/api/orders/${encodeURIComponent(order.order_code)}/download`,
    artworkUrl: order.artwork_filename
      ? `/uploads/artworks/${encodeURIComponent(order.artwork_filename)}`
      : null,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'Furama Custom Art Portal' });
});

app.get('/api/orders', (req, res) => {
  const { status, q } = req.query;
  const orders = db.listOrders({ status, q }).map(formatOrder);
  res.json({ orders });
});

app.get('/api/orders/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const order = db.getOrderByCode(code);
  if (!order) {
    return res.status(404).json({ error: `Order ${code} not found.` });
  }
  res.json({ order: formatOrder(order) });
});

app.post('/api/orders', uploadOriginal.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'A high-resolution photo is required.' });
  }

  const width = req.body.imageWidth ? parseInt(req.body.imageWidth, 10) : null;
  const height = req.body.imageHeight ? parseInt(req.body.imageHeight, 10) : null;

  const order = db.createOrder({
    guestName: (req.body.guestName || '').trim(),
    roomOrVilla: (req.body.roomOrVilla || '').trim(),
    frameStyle: (req.body.frameStyle || 'Studio Recommendation').trim(),
    paperSize: (req.body.paperSize || 'A3 Art Paper').trim(),
    notes: (req.body.notes || '').trim(),
    originalFilename: req.file.originalname,
    storedFilename: req.file.filename,
    mimeType: req.file.mimetype || 'application/octet-stream',
    fileSize: req.file.size,
    imageWidth: Number.isFinite(width) ? width : null,
    imageHeight: Number.isFinite(height) ? height : null,
  });

  res.status(201).json({ order: formatOrder(order) });
});

app.patch('/api/orders/:code/status', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const { status, note, authorRole, authorName } = req.body || {};

  if (!db.VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${db.VALID_STATUSES.join(', ')}`,
    });
  }

  const updated = db.updateOrderStatus(code, {
    status,
    note,
    authorRole: authorRole === 'resort' ? 'resort' : 'studio',
    authorName: authorName || 'Art Studio',
  });

  if (!updated) {
    return res.status(404).json({ error: `Order ${code} not found.` });
  }

  res.json({ order: formatOrder(updated) });
});

app.post('/api/orders/:code/notes', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const { note, authorRole, authorName } = req.body || {};

  if (!note || !String(note).trim()) {
    return res.status(400).json({ error: 'Note text is required.' });
  }

  const updated = db.addOrderNote(code, {
    note: String(note),
    authorRole: authorRole === 'studio' ? 'studio' : 'resort',
    authorName: authorName ? String(authorName).trim() : '',
  });

  if (!updated) {
    return res.status(404).json({ error: `Order ${code} not found.` });
  }

  res.json({ order: formatOrder(updated) });
});

app.post('/api/orders/:code/artwork', uploadArtwork.single('artwork'), (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!req.file) {
    return res.status(400).json({ error: 'An artwork image file is required.' });
  }

  const updated = db.attachArtwork(code, {
    artworkFilename: req.file.filename,
    artworkOriginalName: req.file.originalname,
    note: req.body.note || '',
  });

  if (!updated) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: `Order ${code} not found.` });
  }

  res.json({ order: formatOrder(updated) });
});

app.get('/api/orders/:code/download', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const order = db.getOrderByCode(code);
  if (!order) {
    return res.status(404).json({ error: `Order ${code} not found.` });
  }

  const filePath = path.join(ORIGINALS_DIR, order.stored_filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Original file not found on disk.' });
  }

  res.download(filePath, `${order.order_code}-${order.original_filename}`);
});

app.get('/order/:code', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File exceeds the 100 MB upload limit.' });
  }
  res.status(400).json({ error: err.message || 'Request failed.' });
});

app.listen(PORT, () => {
  console.log(`Furama Custom Art Portal running at http://localhost:${PORT}`);
});
