#!/usr/bin/env bash
# Khôi phục database từ bản backup trên remote (Google Drive/S3...).
# LUÔN kiểm tra kỹ trước khi ghi đè data.sqlite3 đang chạy thật.

set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a; source .env; set +a
fi

REMOTE="${BACKUP_RCLONE_REMOTE:-gdrive}"
REMOTE_PATH="${BACKUP_RCLONE_PATH:-xuong-net-backups}"

echo "Các bản backup hiện có trên ${REMOTE}:${REMOTE_PATH} (mới nhất ở cuối):"
rclone lsf "${REMOTE}:${REMOTE_PATH}" | sort

echo
read -rp "Nhập ĐÚNG tên file muốn khôi phục (copy từ danh sách trên): " FILE

mkdir -p ./restored
rclone copy "${REMOTE}:${REMOTE_PATH}/${FILE}" ./restored/
echo "Đã tải về ./restored/${FILE}"

echo
echo "CÁC BƯỚC TIẾP THEO (làm thủ công, không tự động để tránh ghi đè nhầm):"
echo "  1. Dừng server đang chạy (ví dụ: pm2 stop xuong-net, hoặc Ctrl+C)"
echo "  2. Sao lưu file hiện tại phòng trường hợp cần: cp ../../data.sqlite3 ../../data.sqlite3.bak"
echo "  3. Ghi đè: cp ./restored/${FILE} ../../data.sqlite3"
echo "  4. Khởi động lại server"
