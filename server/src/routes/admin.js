import { Router } from 'express';
import { stmt, creditUser, getAllSettings, setSetting } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/users', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = 30;
  const users = stmt.listUsers.all(pageSize, (page - 1) * pageSize);
  const total = stmt.countUsers.get().n;
  res.json({ items: users, page, pageSize, total });
});

adminRouter.get('/users/:id', (req, res) => {
  const user = stmt.findUserById.get(parseInt(req.params.id, 10));
  if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  const { password_hash, ...safe } = user;
  res.json(safe);
});

adminRouter.get('/users/:id/transactions', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const user = stmt.findUserById.get(userId);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = 50;
  const rows = stmt.listTxForUser.all(userId, pageSize, (page - 1) * pageSize);
  res.json({ items: rows, page, pageSize });
});

adminRouter.get('/users/:id/usage', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const user = stmt.findUserById.get(userId);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = 50;
  const rows = stmt.listUsageForUser.all(userId, pageSize, (page - 1) * pageSize);
  res.json({ items: rows, page, pageSize });
});

adminRouter.post('/users/:id/adjust', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const delta = parseInt(req.body?.delta, 10);
  const note = (req.body?.note || '').slice(0, 300);
  if (!Number.isFinite(delta) || delta === 0) {
    return res.status(400).json({ error: 'Số credit điều chỉnh không hợp lệ.' });
  }
  const user = stmt.findUserById.get(userId);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });

  creditUser({
    userId, delta, type: 'admin_adjust', status: 'completed',
    provider: 'admin', note: note || (delta > 0 ? 'Admin cộng credit thủ công' : 'Admin trừ credit thủ công'),
  });
  const updated = stmt.findUserById.get(userId);
  res.json({ id: updated.id, email: updated.email, credits: updated.credits });
});

adminRouter.get('/transactions', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = 30;
  const rows = stmt.listAllTx.all(pageSize, (page - 1) * pageSize);
  res.json({ items: rows, page, pageSize });
});

adminRouter.get('/usage', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = 30;
  const rows = stmt.listAllUsage.all(pageSize, (page - 1) * pageSize);
  res.json({ items: rows, page, pageSize });
});

adminRouter.get('/stats', (req, res) => {
  res.json({
    totalUsers: stmt.countUsers.get().n,
    totalRevenueVnd: stmt.statsRevenue.get().total,
    totalCreditsIssued: stmt.statsCreditsIssued.get().total,
    totalCreditsSpent: stmt.statsCreditsSpent.get().total,
    upscalesToday: stmt.statsUpscalesToday.get().n,
  });
});

adminRouter.get('/settings', (req, res) => {
  res.json(getAllSettings());
});

adminRouter.post('/settings', (req, res) => {
  const allowedKeys = ['vnd_per_credit', 'credits_per_upscale', 'min_deposit_vnd', 'canvas_free_per_day', 'credits_per_canvas_upscale'];
  const updates = req.body || {};
  for (const key of allowedKeys) {
    if (updates[key] !== undefined) {
      const n = parseInt(updates[key], 10);
      if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({ error: `Giá trị cho ${key} không hợp lệ.` });
      }
      setSetting(key, n);
    }
  }
  res.json(getAllSettings());
});
