import { Router } from 'express';
import { nanoid } from 'nanoid';
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

  // Tạo mã nạp tiền tĩnh theo user ID (VD: NAP5)
  // Webhook sẽ bắt mã này và tự động cộng tiền
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


