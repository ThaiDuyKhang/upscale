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
  password_hash TEXT,
  google_id TEXT UNIQUE,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  credits INTEGER NOT NULL DEFAULT 0,
  is_banned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  credits_delta INTEGER NOT NULL,
  amount_vnd INTEGER,
  code TEXT,
  provider TEXT,
  note TEXT,
  raw_webhook TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  credits_charged INTEGER NOT NULL,
  scale INTEGER,
  face_enhance INTEGER,
  detail_level INTEGER DEFAULT 50,
  repair_text INTEGER DEFAULT 0,
  repair_level INTEGER DEFAULT 0,
  model_used TEXT,
  status TEXT NOT NULL,
  output_url TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS canvas_upscale_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  used_date TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, used_date)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  credits INTEGER NOT NULL,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id INTEGER NOT NULL REFERENCES promo_codes(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(code_id, user_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  seo_title TEXT,
  seo_description TEXT,
  focus_keyword TEXT,
  schema_json TEXT,
  thumbnail_url TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_categories (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY(post_id, category_id)
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(post_id, tag_id)
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  mimetype TEXT,
  size INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_code ON wallet_transactions(code) WHERE code IS NOT NULL;
`);

// Migration an toàn: thêm cột mới vào bảng cũ nếu cần (idempotent khi restart)
function addColumnIfMissing(table, column, definition) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); }
  catch { /* column already exists */ }
}
addColumnIfMissing('users', 'google_id', 'TEXT');
addColumnIfMissing('users', 'avatar_url', 'TEXT');
addColumnIfMissing('users', 'is_banned', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('usage_logs', 'detail_level', 'INTEGER DEFAULT 50');
addColumnIfMissing('usage_logs', 'repair_text', 'INTEGER DEFAULT 0');
addColumnIfMissing('usage_logs', 'repair_level', 'INTEGER DEFAULT 0');
addColumnIfMissing('usage_logs', 'model_used', 'TEXT');

// ---------- settings ----------
const defaultSettings = {
  vnd_per_credit: process.env.VND_PER_CREDIT || '1000',
  credits_per_upscale: process.env.CREDITS_PER_UPSCALE || '5',
  min_deposit_vnd: process.env.MIN_DEPOSIT_VND || '10000',
  canvas_free_per_day: '1',
  credits_per_canvas_upscale: '1',
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
    `INSERT INTO users (email, password_hash, google_id, avatar_url, role, credits) VALUES (?, ?, ?, ?, ?, ?)`
  ),
  findUserByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),
  findUserById: db.prepare(`SELECT * FROM users WHERE id = ?`),
  findUserByGoogleId: db.prepare(`SELECT * FROM users WHERE google_id = ?`),
  listUsers: db.prepare(`SELECT id, email, role, credits, google_id, avatar_url, is_banned, created_at FROM users ORDER BY id DESC LIMIT ? OFFSET ?`),
  countUsers: db.prepare(`SELECT COUNT(*) AS n FROM users`),
  updateUserCredits: db.prepare(`UPDATE users SET credits = credits + ? WHERE id = ?`),
  updatePassword: db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`),
  updateGoogleId: db.prepare(`UPDATE users SET google_id = ?, avatar_url = ? WHERE id = ?`),
  banUser: db.prepare(`UPDATE users SET is_banned = ? WHERE id = ?`),

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
    `SELECT wt.*, u.email FROM wallet_transactions wt JOIN users u ON u.id = wt.user_id WHERE wt.type = 'deposit' AND wt.status = 'pending' ORDER BY wt.id DESC`
  ),

  insertUsage: db.prepare(
    `INSERT INTO usage_logs (user_id, credits_charged, scale, face_enhance, detail_level, repair_text, repair_level, model_used, status, output_url, error)
     VALUES (@user_id, @credits_charged, @scale, @face_enhance, @detail_level, @repair_text, @repair_level, @model_used, @status, @output_url, @error)`
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
    `SELECT COALESCE(SUM(-credits_delta),0) AS total FROM wallet_transactions WHERE type IN ('usage','canvas_usage') AND status='completed'`
  ),
  statsUpscalesToday: db.prepare(
    `SELECT COUNT(*) AS n FROM usage_logs WHERE status='succeeded' AND date(created_at) = date('now')`
  ),

  // Canvas free daily quota
  getCanvasUsageToday: db.prepare(
    `SELECT count FROM canvas_upscale_daily WHERE user_id = ? AND used_date = date('now')`
  ),
  upsertCanvasUsageToday: db.prepare(
    `INSERT INTO canvas_upscale_daily (user_id, used_date, count)
     VALUES (?, date('now'), 1)
     ON CONFLICT(user_id, used_date) DO UPDATE SET count = count + 1`
  ),

  // Promo codes
  findPromoByCode: db.prepare(`SELECT * FROM promo_codes WHERE code = ? AND is_active = 1`),
  findRedemption: db.prepare(`SELECT * FROM promo_redemptions WHERE code_id = ? AND user_id = ?`),
  insertRedemption: db.prepare(`INSERT INTO promo_redemptions (code_id, user_id) VALUES (?, ?)`),
  incrementPromoUses: db.prepare(`UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?`),
  listPromoCodes: db.prepare(`SELECT * FROM promo_codes ORDER BY id DESC LIMIT ? OFFSET ?`),
  countPromoCodes: db.prepare(`SELECT COUNT(*) AS n FROM promo_codes`),
  insertPromoCode: db.prepare(
    `INSERT INTO promo_codes (code, credits, max_uses, expires_at, is_active, note) VALUES (?, ?, ?, ?, 1, ?)`
  ),
  togglePromoCode: db.prepare(`UPDATE promo_codes SET is_active = ? WHERE id = ?`),
  
  // Blog / Posts
  insertCategory: db.prepare(`INSERT INTO categories (slug, name) VALUES (?, ?)`),
  updateCategory: db.prepare(`UPDATE categories SET slug = ?, name = ? WHERE id = ?`),
  deleteCategory: db.prepare(`DELETE FROM categories WHERE id = ?`),
  listCategories: db.prepare(`SELECT * FROM categories ORDER BY name ASC`),
  
  insertTag: db.prepare(`INSERT INTO tags (slug, name) VALUES (?, ?)`),
  updateTag: db.prepare(`UPDATE tags SET slug = ?, name = ? WHERE id = ?`),
  deleteTag: db.prepare(`DELETE FROM tags WHERE id = ?`),
  listTags: db.prepare(`SELECT * FROM tags ORDER BY name ASC`),
  
  insertPost: db.prepare(`
    INSERT INTO posts (slug, title, content, seo_title, seo_description, focus_keyword, schema_json, thumbnail_url, is_published)
    VALUES (@slug, @title, @content, @seo_title, @seo_description, @focus_keyword, @schema_json, @thumbnail_url, @is_published)
  `),
  updatePost: db.prepare(`
    UPDATE posts SET 
      slug = @slug, title = @title, content = @content, 
      seo_title = @seo_title, seo_description = @seo_description, 
      focus_keyword = @focus_keyword, schema_json = @schema_json, 
      thumbnail_url = @thumbnail_url, is_published = @is_published,
      updated_at = datetime('now')
    WHERE id = @id
  `),
  deletePost: db.prepare(`DELETE FROM posts WHERE id = ?`),
  findPostById: db.prepare(`SELECT * FROM posts WHERE id = ?`),
  findPostBySlug: db.prepare(`SELECT * FROM posts WHERE slug = ?`),
  listPosts: db.prepare(`
    SELECT id, slug, title, thumbnail_url, is_published, created_at, updated_at, seo_title, seo_description, focus_keyword
    FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?
  `),
  listPublishedPosts: db.prepare(`
    SELECT id, slug, title, thumbnail_url, created_at, seo_description 
    FROM posts WHERE is_published = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?
  `),
  countPosts: db.prepare(`SELECT COUNT(*) AS n FROM posts`),
  countPublishedPosts: db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE is_published = 1`),
  
  // Post relations
  insertPostCategory: db.prepare(`INSERT OR IGNORE INTO post_categories (post_id, category_id) VALUES (?, ?)`),
  deletePostCategories: db.prepare(`DELETE FROM post_categories WHERE post_id = ?`),
  getPostCategories: db.prepare(`
    SELECT c.* FROM categories c 
    JOIN post_categories pc ON c.id = pc.category_id 
    WHERE pc.post_id = ?
  `),
  
  insertPostTag: db.prepare(`INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)`),
  deletePostTags: db.prepare(`DELETE FROM post_tags WHERE post_id = ?`),
  getPostTags: db.prepare(`
    SELECT t.* FROM tags t 
    JOIN post_tags pt ON t.id = pt.tag_id 
    WHERE pt.post_id = ?
  `),
  
  // Media
  insertMedia: db.prepare(`INSERT INTO media (filename, url, mimetype, size) VALUES (?, ?, ?, ?)`),
  listMedia: db.prepare(`SELECT * FROM media ORDER BY created_at DESC LIMIT ? OFFSET ?`),
  countMedia: db.prepare(`SELECT COUNT(*) AS n FROM media`),
  findMediaById: db.prepare(`SELECT * FROM media WHERE id = ?`),
  deleteMedia: db.prepare(`DELETE FROM media WHERE id = ?`),
};

// Hàm tiện ích thao tác với bài viết (có transaction)
export function savePost(post, categoryIds = [], tagIds = []) {
  return runInTransaction(() => {
    let postId = post.id;
    if (postId) {
      stmt.updatePost.run(post);
      stmt.deletePostCategories.run(postId);
      stmt.deletePostTags.run(postId);
    } else {
      const info = stmt.insertPost.run(post);
      postId = info.lastInsertRowid;
    }
    
    for (const cid of categoryIds) {
      stmt.insertPostCategory.run(postId, cid);
    }
    for (const tid of tagIds) {
      stmt.insertPostTag.run(postId, tid);
    }
    return postId;
  });
}


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
