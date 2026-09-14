import { Router } from 'express';
import { stmt, creditUser } from '../db.js';
import { hashPassword, verifyPassword, signSessionCookie, clearSessionCookie, requireAuth } from '../auth.js';

export const authRouter = Router();

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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

  const info = stmt.createUser.run(normalizedEmail, passwordHash, role, 0);
  const userId = info.lastInsertRowid;

  const bonus = parseInt(process.env.SIGNUP_BONUS_CREDITS || '0', 10);
  if (bonus > 0) {
    creditUser({ userId, delta: bonus, type: 'admin_adjust', status: 'completed', provider: 'system', note: 'Tặng credit đăng ký mới' });
  }

  const user = stmt.findUserById.get(userId);
  signSessionCookie(res, user);
  res.json({ id: user.id, email: user.email, role: user.role, credits: user.credits });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = (email || '').trim().toLowerCase();
  const user = stmt.findUserByEmail.get(normalizedEmail);
  if (!user) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });

  const ok = await verifyPassword(password || '', user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });

  signSessionCookie(res, user);
  res.json({ id: user.id, email: user.email, role: user.role, credits: user.credits });
});

authRouter.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = stmt.findUserById.get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  res.json({ id: user.id, email: user.email, role: user.role, credits: user.credits, created_at: user.created_at });
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Vui lòng nhập mật khẩu cũ và mới.' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Mật khẩu mới cần tối thiểu 6 ký tự.' });

  const user = stmt.findUserById.get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng.' });

  const newHash = await hashPassword(newPassword);
  stmt.updatePassword.run(newHash, user.id);
  res.json({ ok: true, message: 'Đã đổi mật khẩu thành công.' });
});
