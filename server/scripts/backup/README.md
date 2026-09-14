# Backup tự động — hướng dẫn cài đặt

Có 2 cách đẩy backup lên Google Drive. **Cách 1 (rclone) đơn giản hơn, khuyên dùng.**
Cách 2 chỉ dùng khi bạn không cài được binary ngoài trên môi trường chạy server.

## Cách 1: rclone (khuyên dùng)

### Cài rclone

```bash
curl https://rclone.org/install.sh | sudo bash
```

(Hoặc xem hướng dẫn cài theo hệ điều hành tại rclone.org/downloads nếu không muốn dùng script trên.)

### Kết nối rclone với Google Drive

```bash
rclone config
```

Làm theo trình hướng dẫn:
- `n` (New remote) → đặt tên là **`gdrive`** (khớp với `BACKUP_RCLONE_REMOTE` mặc định trong `.env.example`)
- Storage: chọn số tương ứng với **Google Drive**
- Các bước còn lại: để mặc định (Enter), tới bước xác thực nó sẽ mở trình duyệt để bạn đăng nhập Google và cấp quyền — nếu server không có giao diện (chạy trên VPS qua SSH), chọn chế độ xác thực từ xa (rclone sẽ cho lệnh chạy trên máy có trình duyệt rồi dán mã về).

Kiểm tra kết nối:

```bash
rclone lsd gdrive:
```

Nếu liệt kê được danh sách thư mục trong Drive của bạn là đã kết nối thành công.

### Cấu hình & chạy thử

```bash
cd server/scripts/backup
cp .env.example .env
# .env mặc định đã dùng đúng remote tên "gdrive" — sửa lại nếu bạn đặt tên khác
bash backup.sh
```

Nếu chạy thành công, bạn sẽ thấy một thư mục `xuong-net-backups` xuất hiện trong Google Drive với file `xuong-net-<thời-gian>.sqlite3` bên trong.

### Đặt lịch tự động (cron)

```bash
crontab -e
```

Thêm dòng (backup mỗi 30 phút — chỉnh lại tuỳ nhu cầu, ví dụ hệ thống ít giao dịch có thể để mỗi vài giờ):

```
*/30 * * * * cd /duong-dan-toi/xuong-net-saas/server/scripts/backup && bash backup.sh >> backup.log 2>&1
```

## Cách 2: Node.js + Google Drive API (không cần rclone)

Dùng khi môi trường chạy server không cho phép cài thêm binary ngoài (một số PaaS giới hạn).

1. Vào [console.cloud.google.com](https://console.cloud.google.com), tạo project, bật **Google Drive API**.
2. Tạo **Service Account** (IAM & Admin → Service Accounts), tạo key dạng JSON, tải về, đặt tên ví dụ `service-account.json` trong thư mục `scripts/backup/`.
3. **Bước dễ bỏ sót nhất:** Service Account mặc định có **0 dung lượng Drive riêng**. Vào Google Drive tài khoản thật của bạn → tạo một thư mục → Share thư mục đó cho đúng email trong trường `client_email` của file JSON key (dạng `...@...iam.gserviceaccount.com`) → cấp quyền **Editor**. Không làm bước này thì upload sẽ báo lỗi dung lượng dù Drive bạn còn trống rất nhiều.
4. Copy ID thư mục đó (đoạn cuối cùng trong URL khi mở thư mục trên Drive) vào `GOOGLE_DRIVE_FOLDER_ID` trong `.env`.
5. Cài đặt & chạy thử:

```bash
cd server/scripts/backup
npm install
cp .env.example .env    # điền GOOGLE_SERVICE_ACCOUNT_KEY_PATH, GOOGLE_DRIVE_FOLDER_ID
node snapshot.js > /tmp/snapshot_path.txt
node backup-gdrive-node.js "$(cat /tmp/snapshot_path.txt)"
```

Muốn dùng cách này thay vì rclone trong lịch cron, sửa `backup.sh`: thay đoạn gọi `rclone copy ...` bằng `node backup-gdrive-node.js "$SNAPSHOT_PATH"`.

## Khôi phục khi cần

```bash
cd server/scripts/backup
bash restore.sh
```

Script sẽ liệt kê các bản backup trên Drive, cho bạn chọn, tải về `./restored/`, rồi hướng dẫn từng bước thay thế `data.sqlite3` (chủ động không tự động ghi đè để tránh thao tác nhầm ảnh hưởng dữ liệu đang chạy thật).

**Quan trọng: hãy thử restore ít nhất một lần trên môi trường test** — một bản backup chưa từng được restore thử là một bản backup bạn chưa thực sự biết có dùng được hay không.

## Cần kiểm tra định kỳ

- Xem `backup.log` (nếu dùng cron như hướng dẫn trên) để chắc chắn job chạy thành công, không âm thầm lỗi trong im lặng.
- Cân nhắc thêm cảnh báo (Telegram/Slack/email) khi `backup.sh` thất bại — hiện tại script chỉ ghi log, chưa tự động báo cho bạn.
