// Tạo một bản chụp (snapshot) nhất quán của database, AN TOÀN kể cả khi
// server đang chạy và ghi dữ liệu — dùng lệnh SQL chuẩn `VACUUM INTO`, tính
// năng có sẵn trong SQLite (không phụ thuộc API riêng của driver nào), nên
// hoạt động giống nhau dù bạn dùng node:sqlite hay better-sqlite3.
//
// Dùng độc lập: node snapshot.js
// In ra đường dẫn file snapshot vừa tạo (để backup.sh dùng tiếp).

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'data.sqlite3'); // server/data.sqlite3
const backupDir = path.join(__dirname, 'local');
fs.mkdirSync(backupDir, { recursive: true });

if (!fs.existsSync(dbPath)) {
  console.error(`Không tìm thấy database tại ${dbPath} — server đã chạy lần nào chưa?`);
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const destPath = path.join(backupDir, `xuong-net-${timestamp}.sqlite3`);

const db = new DatabaseSync(dbPath, { readOnly: true });
// Escape dấu nháy đơn trong đường dẫn (nếu có) để không phá chuỗi SQL
const escapedDest = destPath.replace(/'/g, "''");
db.exec(`VACUUM INTO '${escapedDest}'`);
db.close();

console.log(destPath);
