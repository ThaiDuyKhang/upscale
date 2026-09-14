#!/usr/bin/env bash
# Backup định kỳ: chụp snapshot SQLite -> đẩy lên Google Drive (hoặc S3, hoặc
# bất kỳ remote nào rclone hỗ trợ) -> dọn bản cũ cả ở local lẫn trên remote.
#
# Chạy thử tay:  bash backup.sh
# Chạy định kỳ:  thêm vào crontab, xem hướng dẫn trong README.md cùng thư mục.

set -euo pipefail
cd "$(dirname "$0")"

# Nạp biến cấu hình riêng cho backup nếu có file .env ở đây
if [ -f .env ]; then
  set -a; source .env; set +a
fi

REMOTE="${BACKUP_RCLONE_REMOTE:-gdrive}"
REMOTE_PATH="${BACKUP_RCLONE_PATH:-xuong-net-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

echo "== $(date) — bắt đầu backup =="

# 1) Snapshot nhất quán từ SQLite
SNAPSHOT_PATH=$(node snapshot.js)
echo "Đã tạo snapshot: $SNAPSHOT_PATH"

# 2) Đẩy lên remote qua rclone (cần: rclone config  -> tạo remote tên "gdrive")
if ! command -v rclone >/dev/null 2>&1; then
  echo "LỖI: chưa cài rclone. Xem README.md trong thư mục này để cài đặt." >&2
  exit 1
fi
rclone copy "$SNAPSHOT_PATH" "${REMOTE}:${REMOTE_PATH}" --progress
echo "Đã đẩy lên ${REMOTE}:${REMOTE_PATH}"

# 3) Dọn bản cũ hơn RETENTION_DAYS ngày — cả local và trên remote
find ./local -name "xuong-net-*.sqlite3" -mtime "+${RETENTION_DAYS}" -delete
rclone delete "${REMOTE}:${REMOTE_PATH}" --min-age "${RETENTION_DAYS}d" || true

echo "== $(date) — backup hoàn tất =="
