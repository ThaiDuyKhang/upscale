// Lớp dữ liệu duy nhất của toàn bộ app — dùng SQLite qua module `node:sqlite`
// có SẴN TRONG NODE.JS (từ bản 22.5+), KHÔNG cần cài package native nào,
// KHÔNG cần biên dịch C++ — tránh hẳn lỗi build better-sqlite3 hay gặp trên
// Windows khi thiếu đúng bộ Visual Studio Build Tools tương thích.
// (Node sẽ in một dòng cảnh báo "ExperimentalWarning: SQLite is an
// experimental feature" ra console — vô hại, bỏ qua được.)
//
// Nếu sau này lượng truy cập lớn, nên thay bằng Postgres/MySQL, nhưng interface
// (các hàm export bên dưới) có thể giữ nguyên để phần còn lại của code không phải sửa nhiều.

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data.sqlite3');

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

// node:sqlite chưa có sẵn helper db.transaction() như better-sqlite3, nên tự
// viết một wrapper nhỏ: BEGIN -> chạy fn() -> COMMIT, hoặc ROLLBACK nếu lỗi.
function runInTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',      -- 'user' | 'admin'
  credits INTEGER NOT NULL DEFAULT 0,     -- số dư hiện tại, được cập nhật cùng lúc với mỗi giao dịch trong wallet_transactions
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,                     -- 'deposit' | 'admin_adjust' | 'usage'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'failed'
  credits_delta INTEGER NOT NULL,         -- dương = cộng, âm = trừ
  amount_vnd INTEGER,                     -- chỉ có với type='deposit'
  code TEXT,                              -- mã nội dung chuyển khoản, dùng để đối soát webhook
  provider TEXT,                          -- 'sepay' | 'pay2s' | 'admin' | null
  note TEXT,
  raw_webhook TEXT,                       -- lưu nguyên payload webhook để tra soát sau này
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  credits_charged INTEGER NOT NULL,
  scale INTEGER,
  face_enhance INTEGER,
  status TEXT NOT NULL,                   -- 'succeeded' | 'failed'
  output_url TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_code ON wallet_transactions(code) WHERE code IS NOT NULL;
`);

// ---------- settings (giá cả, quy đổi — admin chỉnh được qua dashboard) ----------
const defaultSettings = {
  vnd_per_credit: process.env.VND_PER_CREDIT || '1000',
  credits_per_upscale: process.env.CREDITS_PER_UPSCALE || '5',
  min_deposit_vnd: process.env.MIN_DEPOSIT_VND || '10000',
};
const insertSettingIfMissing = db.prepare(
  `INSERT INTO settings (key, value) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = ?)`
);
for (const [k, v] of Object.entries(defaultSettings)) insertSettingIfMissing.run(k, v, k);

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}
export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}
export function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ---------- users ----------
export const stmt = {
  createUser: db.prepare(
    `INSERT INTO users (email, password_hash, role, credits) VALUES (?, ?, ?, ?)`
  ),
  findUserByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),
  findUserById: db.prepare(`SELECT * FROM users WHERE id = ?`),
  listUsers: db.prepare(`SELECT id, email, role, credits, created_at FROM users ORDER BY id DESC LIMIT ? OFFSET ?`),
  countUsers: db.prepare(`SELECT COUNT(*) AS n FROM users`),
  updateUserCredits: db.prepare(`UPDATE users SET credits = credits + ? WHERE id = ?`),
  updatePassword: db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`),

  insertTx: db.prepare(
    `INSERT INTO wallet_transactions (user_id, type, status, credits_delta, amount_vnd, code, provider, note, raw_webhook, completed_at)
     VALUES (@user_id, @type, @status, @credits_delta, @amount_vnd, @code, @provider, @note, @raw_webhook, @completed_at)`
  ),
  findTxByCode: db.prepare(`SELECT * FROM wallet_transactions WHERE code = ?`),
  findPendingDepositsForUser: db.prepare(
    `SELECT * FROM wallet_transactions WHERE user_id = ? AND type = 'deposit' AND status = 'pending' ORDER BY id DESC`
  ),
  findTxById: db.prepare(`SELECT * FROM wallet_transactions WHERE id = ?`),
  completeTx: db.prepare(
    `UPDATE wallet_transactions SET status = 'completed', raw_webhook = ?, completed_at = datetime('now') WHERE id = ?`
  ),
  listTxForUser: db.prepare(
    `SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`
  ),
  listAllTx: db.prepare(
    `SELECT wt.*, u.email FROM wallet_transactions wt JOIN users u ON u.id = wt.user_id ORDER BY wt.id DESC LIMIT ? OFFSET ?`
  ),
  findAllPendingDeposits: db.prepare(
    `SELECT * FROM wallet_transactions WHERE type = 'deposit' AND status = 'pending'`
  ),

  insertUsage: db.prepare(
    `INSERT INTO usage_logs (user_id, credits_charged, scale, face_enhance, status, output_url, error)
     VALUES (@user_id, @credits_charged, @scale, @face_enhance, @status, @output_url, @error)`
  ),
  listUsageForUser: db.prepare(
    `SELECT * FROM usage_logs WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`
  ),
  listAllUsage: db.prepare(
    `SELECT ul.*, u.email FROM usage_logs ul JOIN users u ON u.id = ul.user_id ORDER BY ul.id DESC LIMIT ? OFFSET ?`
  ),

  statsRevenue: db.prepare(
    `SELECT COALESCE(SUM(amount_vnd),0) AS total FROM wallet_transactions WHERE type='deposit' AND status='completed'`
  ),
  statsCreditsIssued: db.prepare(
    `SELECT COALESCE(SUM(credits_delta),0) AS total FROM wallet_transactions WHERE status='completed' AND credits_delta > 0`
  ),
  statsCreditsSpent: db.prepare(
    `SELECT COALESCE(SUM(-credits_delta),0) AS total FROM wallet_transactions WHERE type='usage' AND status='completed'`
  ),
  statsUpscalesToday: db.prepare(
    `SELECT COUNT(*) AS n FROM usage_logs WHERE status='succeeded' AND date(created_at) = date('now')`
  ),
};

// Cộng/trừ credit và ghi sổ trong CÙNG một transaction SQLite để không bao giờ lệch số dư.
export function creditUser({ userId, delta, type, status = 'completed', amountVnd = null, code = null, provider = null, note = null, rawWebhook = null }) {
  return runInTransaction(() => {
    const info = stmt.insertTx.run({
      user_id: userId, type, status, credits_delta: delta,
      amount_vnd: amountVnd, code, provider, note,
      raw_webhook: rawWebhook,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    });
    if (status === 'completed') {
      stmt.updateUserCredits.run(delta, userId);
    }
    return info.lastInsertRowid;
  });
}

// Xác nhận một deposit đang pending -> completed, đồng thời cộng credit.
export function completeDeposit(txRow, rawWebhookPayload) {
  runInTransaction(() => {
    stmt.completeTx.run(JSON.stringify(rawWebhookPayload), txRow.id);
    stmt.updateUserCredits.run(txRow.credits_delta, txRow.user_id);
  });
}
