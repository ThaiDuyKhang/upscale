import { Router } from 'express';
import { stmt, creditUser, getAllSettings, setSetting, completeDeposit } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

// ─── Users ────────────────────────────────────────────────────────────────────
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

// Khoá / Mở khoá tài khoản người dùng
adminRouter.post('/users/:id/toggle-ban', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const user = stmt.findUserById.get(userId);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Không thể khoá tài khoản Admin.' });

  const newBanState = user.is_banned ? 0 : 1;
  stmt.banUser.run(newBanState, userId);
  const updated = stmt.findUserById.get(userId);
  res.json({ id: updated.id, email: updated.email, is_banned: updated.is_banned });
});

// ─── Transactions ─────────────────────────────────────────────────────────────
adminRouter.get('/transactions', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = 30;
  const rows = stmt.listAllTx.all(pageSize, (page - 1) * pageSize);
  res.json({ items: rows, page, pageSize });
});

// Danh sách giao dịch nạp tiền đang chờ (pending)
adminRouter.get('/deposits/pending', (req, res) => {
  const rows = stmt.findAllPendingDeposits.all();
  res.json({ items: rows });
});

// Duyệt nạp tiền thủ công (khi user chuyển khoản sai nội dung hoặc bank chậm webhook)
adminRouter.post('/deposits/:id/approve', (req, res) => {
  const txId = parseInt(req.params.id, 10);
  const tx = stmt.findTxById.get(txId);
  if (!tx) return res.status(404).json({ error: 'Không tìm thấy giao dịch.' });
  if (tx.type !== 'deposit') return res.status(400).json({ error: 'Chỉ duyệt được giao dịch loại deposit.' });
  if (tx.status === 'completed') return res.status(400).json({ error: 'Giao dịch này đã hoàn thành rồi.' });

  const note = req.body?.note || 'Admin duyệt thủ công';
  completeDeposit(tx, { manual_approve: true, admin_note: note, approved_at: new Date().toISOString() });
  res.json({ ok: true, message: 'Đã duyệt nạp tiền thành công.' });
});

// ─── Usage Logs ───────────────────────────────────────────────────────────────
adminRouter.get('/usage', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = 30;
  const rows = stmt.listAllUsage.all(pageSize, (page - 1) * pageSize);
  res.json({ items: rows, page, pageSize });
});

// ─── Stats ────────────────────────────────────────────────────────────────────
adminRouter.get('/stats', (req, res) => {
  res.json({
    totalUsers: stmt.countUsers.get().n,
    totalRevenueVnd: stmt.statsRevenue.get().total,
    totalCreditsIssued: stmt.statsCreditsIssued.get().total,
    totalCreditsSpent: stmt.statsCreditsSpent.get().total,
    upscalesToday: stmt.statsUpscalesToday.get().n,
  });
});

// ─── Settings ─────────────────────────────────────────────────────────────────
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

// ─── Promo Codes (Giftcodes) ──────────────────────────────────────────────────
adminRouter.get('/coupons', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = 30;
  const items = stmt.listPromoCodes.all(pageSize, (page - 1) * pageSize);
  const total = stmt.countPromoCodes.get().n;
  res.json({ items, total, page, pageSize });
});

adminRouter.post('/coupons', (req, res) => {
  const { code, credits, max_uses, expires_at, note } = req.body || {};
  const codeStr = (code || '').trim().toUpperCase();
  if (!codeStr || codeStr.length < 3) return res.status(400).json({ error: 'Mã phải có ít nhất 3 ký tự.' });
  const creditsNum = parseInt(credits, 10);
  if (!creditsNum || creditsNum <= 0) return res.status(400).json({ error: 'Số credit phải lớn hơn 0.' });

  try {
    const info = stmt.insertPromoCode.run(
      codeStr,
      creditsNum,
      max_uses ? parseInt(max_uses, 10) : null,
      expires_at || null,
      note || ''
    );
    res.json({ ok: true, id: info.lastInsertRowid, code: codeStr });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Mã này đã tồn tại.' });
    throw err;
  }
});

adminRouter.post('/coupons/:id/toggle', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const current = stmt.listPromoCodes.all(1, 0).find(c => c.id === id);
  // fetch actual coupon
  const row = require('../db.js').db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy mã.' });
  stmt.togglePromoCode.run(row.is_active ? 0 : 1, id);
  res.json({ ok: true, is_active: row.is_active ? 0 : 1 });
});
