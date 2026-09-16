import { Router } from 'express';
import { stmt, creditUser } from '../db.js';
import { hashPassword, verifyPassword, signSessionCookie, clearSessionCookie, requireAuth } from '../auth.js';
// Lazy-import Google Auth service — chỉ dùng khi GOOGLE_CLIENT_ID được cấu hình
let verifyGoogleToken;
if (process.env.GOOGLE_CLIENT_ID) {
  verifyGoogleToken = (await import('../services/googleAuth.js')).verifyGoogleToken;
}

export const authRouter = Router();

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Config (Google Client ID) ────────────────────────────────────────────────
authRouter.get('/config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
});

// ─── Đăng ký bằng email/mật khẩu ─────────────────────────────────────────────
authRouter.post('/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Email không hợp lệ.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Mật khẩu cần tối thiểu 6 ký tự.' });

  const normalizedEmail = email.trim().toLowerCase();
  if (stmt.findUserByEmail.get(normalizedEmail)) {
    return res.status(409).json({ error: 'Email này đã được đăng ký.' });
  }

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const role = adminEmails.includes(normalizedEmail) ? 'admin' : 'user';
  const passwordHash = await hashPassword(password);

  const info = stmt.createUser.run(normalizedEmail, passwordHash, null, null, role, 0);
  const userId = info.lastInsertRowid;

  const bonus = parseInt(process.env.SIGNUP_BONUS_CREDITS || '0', 10);
  if (bonus > 0) {
    creditUser({ userId, delta: bonus, type: 'admin_adjust', status: 'completed', provider: 'system', note: 'Tặng credit đăng ký mới' });
  }

  const user = stmt.findUserById.get(userId);
  signSessionCookie(res, user);
  res.json({ id: user.id, email: user.email, role: user.role, credits: user.credits, avatar_url: user.avatar_url });
});

// ─── Đăng nhập bằng email/mật khẩu ───────────────────────────────────────────
authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = (email || '').trim().toLowerCase();
  const user = stmt.findUserByEmail.get(normalizedEmail);
  if (!user) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
  if (user.is_banned) return res.status(403).json({ error: 'Tài khoản này đã bị khoá. Liên hệ hỗ trợ.' });
  if (!user.password_hash) return res.status(401).json({ error: 'Tài khoản này dùng đăng nhập bằng Google. Vui lòng chọn "Tiếp tục với Google".' });

  const ok = await verifyPassword(password || '', user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });

  signSessionCookie(res, user);
  res.json({ id: user.id, email: user.email, role: user.role, credits: user.credits, avatar_url: user.avatar_url });
});

// ─── Đăng nhập / Đăng ký bằng Google OAuth ────────────────────────────────────
authRouter.post('/google', async (req, res) => {
  if (!verifyGoogleToken) {
    return res.status(503).json({ error: 'Tính năng đăng nhập Google chưa được cấu hình trên server này.' });
  }
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'Thiếu Google credential.' });

  let googleUser;
  try {
    googleUser = await verifyGoogleToken(credential);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  const { sub: googleId, email, picture } = googleUser;
  const normalizedEmail = email.trim().toLowerCase();
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  // Trường hợp 1: Đã có tài khoản theo Google ID
  let user = stmt.findUserByGoogleId.get(googleId);

  if (!user) {
    // Trường hợp 2: Đã có tài khoản theo email — liên kết Google vào
    user = stmt.findUserByEmail.get(normalizedEmail);
    if (user) {
      stmt.updateGoogleId.run(googleId, picture, user.id);
      user = stmt.findUserById.get(user.id);
    }
  }

  if (!user) {
    // Trường hợp 3: Người dùng hoàn toàn mới — tạo tài khoản mới qua Google
    const role = adminEmails.includes(normalizedEmail) ? 'admin' : 'user';
    const info = stmt.createUser.run(normalizedEmail, null, googleId, picture, role, 0);
    const userId = info.lastInsertRowid;

    const bonus = parseInt(process.env.SIGNUP_BONUS_CREDITS || '0', 10);
    if (bonus > 0) {
      creditUser({ userId, delta: bonus, type: 'admin_adjust', status: 'completed', provider: 'google', note: 'Tặng credit đăng ký mới qua Google' });
    }
    user = stmt.findUserById.get(userId);
  }

  if (user.is_banned) return res.status(403).json({ error: 'Tài khoản này đã bị khoá. Liên hệ hỗ trợ.' });

  signSessionCookie(res, user);
  res.json({ id: user.id, email: user.email, role: user.role, credits: user.credits, avatar_url: user.avatar_url });
});

// ─── Đăng xuất ────────────────────────────────────────────────────────────────
authRouter.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ─── Lấy thông tin phiên hiện tại ─────────────────────────────────────────────
authRouter.get('/me', requireAuth, (req, res) => {
  const user = stmt.findUserById.get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  res.json({ id: user.id, email: user.email, role: user.role, credits: user.credits, avatar_url: user.avatar_url, created_at: user.created_at });
});

// ─── Đổi / Đặt mật khẩu ──────────────────────────────────────────────────────
authRouter.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Mật khẩu mới cần tối thiểu 6 ký tự.' });

  const user = stmt.findUserById.get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });

  // Nếu user dùng Google OAuth chưa có mật khẩu, cho đặt mật khẩu mới trực tiếp
  if (!user.password_hash) {
    const newHash = await hashPassword(newPassword);
    stmt.updatePassword.run(newHash, user.id);
    return res.json({ ok: true, message: 'Đã đặt mật khẩu thành công.' });
  }

  if (!currentPassword) return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại.' });
  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng.' });

  const newHash = await hashPassword(newPassword);
  stmt.updatePassword.run(newHash, user.id);
  res.json({ ok: true, message: 'Đã đổi mật khẩu thành công.' });
});

// ─── Đổi thưởng mã Promo Code ─────────────────────────────────────────────────
authRouter.post('/redeem', requireAuth, (req, res) => {
  const userId = req.user.sub;
  const code = (req.body?.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Vui lòng nhập mã khuyến mãi.' });

  const promo = stmt.findPromoByCode.get(code);
  if (!promo) return res.status(404).json({ error: 'Mã khuyến mãi không tồn tại hoặc đã hết hiệu lực.' });

  // Kiểm tra hết hạn
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Mã khuyến mãi đã hết hạn sử dụng.' });
  }
  // Kiểm tra giới hạn lượt dùng
  if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
    return res.status(400).json({ error: 'Mã khuyến mãi đã hết lượt sử dụng.' });
  }
  // Kiểm tra user đã dùng chưa
  if (stmt.findRedemption.get(promo.id, userId)) {
    return res.status(409).json({ error: 'Bạn đã sử dụng mã khuyến mãi này rồi.' });
  }

  // Ghi nhận và cộng credit
  stmt.insertRedemption.run(promo.id, userId);
  stmt.incrementPromoUses.run(promo.id);
  creditUser({ userId, delta: promo.credits, type: 'coupon', status: 'completed', provider: 'system', note: `Mã KM: ${code}` });

  const updatedUser = stmt.findUserById.get(userId);
  res.json({ ok: true, creditsAdded: promo.credits, creditsTotal: updatedUser.credits, message: `Đã nhận ${promo.credits} credit từ mã ${code}!` });
});
