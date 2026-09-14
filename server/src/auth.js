import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('Thiếu JWT_SECRET trong .env — server không thể khởi động an toàn nếu thiếu biến này.');
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}
export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signSessionCookie(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    // secure: true, // bật lên khi chạy production qua HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}
export function clearSessionCookie(res) {
  res.clearCookie('token');
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET); // { sub, role, email }
    next();
  } catch {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Chỉ admin mới có quyền truy cập.' });
  next();
}
