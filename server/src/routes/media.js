import { Router } from 'express';
import { stmt } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import multer from 'multer';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const mediaRouter = Router();
mediaRouter.use(requireAuth, requireAdmin);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '../../../public/images');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    cb(null, `${basename}-${nanoid(6)}${ext}`);
  }
});

const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Chỉ cho phép upload hình ảnh'));
  }
});

mediaRouter.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = 30;
  const items = stmt.listMedia.all(pageSize, (page - 1) * pageSize);
  const total = stmt.countMedia.get().n;
  res.json({ items, page, pageSize, total });
});

mediaRouter.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Không có file' });
  try {
    const url = '/images/' + req.file.filename;
    const info = stmt.insertMedia.run(req.file.originalname, url, req.file.mimetype, req.file.size);
    res.json({ success: true, id: info.lastInsertRowid, url });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Xử lý lỗi multer
mediaRouter.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  } else if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

mediaRouter.delete('/:id', (req, res) => {
  try {
    const media = stmt.findMediaById.get(req.params.id);
    if (media) {
      const filePath = path.join(__dirname, '../../../public', media.url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      stmt.deleteMedia.run(req.params.id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
