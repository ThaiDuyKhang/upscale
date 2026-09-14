import { Router } from 'express';
import { stmt, creditUser, getSetting } from '../db.js';
import { requireAuth } from '../auth.js';
import { buildVietQrImageUrl } from '../payments/vietqr.js';

export const walletRouter = Router();
walletRouter.use(requireAuth);

walletRouter.get('/', (req, res) => {
  const user = stmt.findUserById.get(req.user.sub);
  res.json({ credits: user.credits });
});

walletRouter.get('/transactions', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = 20;
  const rows = stmt.listTxForUser.all(req.user.sub, pageSize, (page - 1) * pageSize);
  res.json({ items: rows, page, pageSize });
});

walletRouter.post('/deposits', (req, res) => {
  const amountVnd = parseInt(req.body?.amountVnd, 10);
  const minDeposit = parseInt(getSetting('min_deposit_vnd') || '10000', 10);

  if (!amountVnd || amountVnd < minDeposit) {
    return res.status(400).json({ error: `Số tiền nạp tối thiểu là ${minDeposit.toLocaleString('vi-VN')}đ.` });
  }

  const code = `NAP${req.user.sub}`;
  const qrImageUrl = buildVietQrImageUrl({ amountVnd, content: code });

  res.json({
    code,
    amountVnd,
    qrImageUrl,
    bank: {
      accountNumber: process.env.BANK_ACCOUNT_NUMBER,
      accountName: process.env.BANK_ACCOUNT_NAME,
    },
    instructions: `Chuyển khoản đúng số tiền ${amountVnd.toLocaleString('vi-VN')}đ, nội dung ghi đúng mã: ${code}`,
  });
});

// ─── Canvas/GPU Upscale quota ──────────────────────────────────────────────

// Kiểm tra user còn lượt Canvas miễn phí hôm nay không
walletRouter.get('/canvas-quota', (req, res) => {
  const userId = req.user.sub;
  const user = stmt.findUserById.get(userId);
  const isAdmin = user.role === 'admin';
  const freePerDay = parseInt(getSetting('canvas_free_per_day') || '1', 10);
  const row = stmt.getCanvasUsageToday.get(userId);
  const usedToday = row ? row.count : 0;
  const remaining = isAdmin ? Infinity : Math.max(0, freePerDay - usedToday);
  const creditCost = parseInt(getSetting('credits_per_canvas_upscale') || '1', 10);

  res.json({
    freePerDay: isAdmin ? Infinity : freePerDay,
    usedToday,
    remainingFree: isAdmin ? Infinity : remaining,
    creditCost,
    userCredits: user.credits,
    canUseFree: isAdmin ? true : remaining > 0,
    canUsePaid: isAdmin ? true : user.credits >= creditCost,
  });
});

// Ghi nhận đã dùng 1 lượt Canvas (miễn phí hoặc trừ credit)
walletRouter.post('/canvas-done', (req, res) => {
  const userId = req.user.sub;
  const user = stmt.findUserById.get(userId);
  const isAdmin = user.role === 'admin';
  const mode = req.body?.mode; // 'free' hoặc 'paid'

  if (!['free', 'paid'].includes(mode)) {
    return res.status(400).json({ error: 'mode phải là "free" hoặc "paid".' });
  }

  const freePerDay = parseInt(getSetting('canvas_free_per_day') || '1', 10);
  const row = stmt.getCanvasUsageToday.get(userId);
  const usedToday = row ? row.count : 0;

  if (mode === 'free') {
    if (!isAdmin && usedToday >= freePerDay) {
      return res.status(400).json({ error: 'Bạn đã dùng hết lượt Canvas miễn phí hôm nay.' });
    }
    // Ghi nhận dùng lượt free (admin cũng ghi nhận để theo dõi)
    stmt.upsertCanvasUsageToday.run(userId);
    const updated = stmt.findUserById.get(userId);
    return res.json({
      mode: 'free',
      remainingFree: isAdmin ? Infinity : freePerDay - usedToday - 1,
      userCredits: updated.credits,
    });
  }

  // Paid mode — trừ credit (admin không bị trừ)
  const creditCost = parseInt(getSetting('credits_per_canvas_upscale') || '1', 10);
  if (!isAdmin && user.credits < creditCost) {
    return res.status(402).json({ error: `Không đủ credit. Cần ${creditCost} credit để dùng Canvas GPU trả phí.` });
  }

  if (!isAdmin) {
    creditUser({
      userId,
      delta: -creditCost,
      type: 'canvas_usage',
      status: 'completed',
      provider: null,
      note: 'Canvas/GPU upscale (trả phí)',
    });
  }

  // Cũng ghi vào daily count để theo dõi
  stmt.upsertCanvasUsageToday.run(userId);

  const updatedUser = stmt.findUserById.get(userId);
  return res.json({
    mode: 'paid',
    creditsCharged: isAdmin ? 0 : creditCost,
    userCredits: updatedUser.credits,
  });
});

