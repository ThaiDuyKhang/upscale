import { Router } from 'express';
import { stmt, creditUser, getSetting } from '../db.js';
import { verifySePayAuth } from '../payments/sepay.js';
import { verifyPay2sSignature } from '../payments/pay2s.js';

export const webhookRouter = Router();

// ---------------- SePay ----------------
// SePay yêu cầu endpoint trả về HTTP 200 trong vòng 30 giây, nếu không sẽ retry
// tối đa 7 lần trong ~33 phút. Vì vậy route này xử lý nhanh, không gọi thêm API
// chậm nào khác.
webhookRouter.post('/sepay', (req, res) => {
  if (!verifySePayAuth(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const payload = req.body;

  // Chỉ quan tâm giao dịch tiền VÀO
  if (payload.transferType !== 'in') {
    return res.json({ success: true, ignored: true });
  }

  // Nội dung chuyển khoản có chứa NAP + User ID
  const match = payload.content.match(/NAP(\d+)/i);
  if (!match) {
    console.warn('[sepay-webhook] Không tìm thấy mã NAP trong:', payload.content);
    return res.json({ success: true, matched: false });
  }
  
  const userId = parseInt(match[1], 10);
  const user = stmt.findUserById.get(userId);
  if (!user) {
    return res.json({ success: true, matched: false, reason: 'Người dùng không tồn tại.' });
  }

  // Tính số credit
  const vndPerCredit = parseInt(getSetting('vnd_per_credit') || '1000', 10);
  const credits = Math.floor(payload.transferAmount / vndPerCredit);

  // Cộng trực tiếp
  creditUser({
    userId,
    delta: credits,
    type: 'deposit',
    status: 'completed',
    amountVnd: payload.transferAmount,
    code: String(payload.id),
    provider: 'sepay',
    rawWebhook: JSON.stringify(payload)
  });

  console.log(`[sepay-webhook] Đã cộng ${credits} credit cho user ${userId}`);
  res.json({ success: true, matched: true });
});

// ---------------- Pay2S ----------------
// XEM GHI CHÚ trong src/payments/pay2s.js trước khi bật route này lên production —
// tên field trong body dưới đây là suy đoán hợp lý, chưa được xác nhận 100% với
// tài liệu mới nhất của Pay2S.
webhookRouter.post('/pay2s', (req, res) => {
  if (!verifyPay2sSignature(req.body)) {
    return res.status(401).json({ success: false, error: 'Chữ ký không hợp lệ.' });
  }
  const payload = req.body;
  const content = payload.content || payload.description || '';
  const amount = parseInt(payload.amount || payload.transferAmount || 0, 10);
  
  const match = content.match(/NAP(\d+)/i);
  if (!match) return res.json({ success: true, matched: false });

  const userId = parseInt(match[1], 10);
  const user = stmt.findUserById.get(userId);
  if (!user) return res.json({ success: true, matched: false, reason: 'Không tìm thấy user' });

  const vndPerCredit = parseInt(getSetting('vnd_per_credit') || '1000', 10);
  const credits = Math.floor(amount / vndPerCredit);

  creditUser({
    userId,
    delta: credits,
    type: 'deposit',
    status: 'completed',
    amountVnd: amount,
    code: String(payload.id || Date.now()),
    provider: 'pay2s',
    rawWebhook: JSON.stringify(payload)
  });

  res.json({ success: true, matched: true });
});
