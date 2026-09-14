// Cách thay thế KHÔNG cần cài rclone — upload thẳng bằng Google Drive API
// qua thư viện googleapis. Dùng khi bạn không muốn/không thể cài rclone
// trên máy chủ (ví dụ một số PaaS hạn chế cài thêm binary).
//
// CẦN LÀM TRƯỚC KHI DÙNG:
//   1. Vào console.cloud.google.com, tạo project mới (hoặc dùng project có sẵn).
//   2. Bật "Google Drive API" cho project đó.
//   3. Tạo Service Account (IAM & Admin > Service Accounts), tạo key dạng JSON,
//      tải file JSON key về, đặt đường dẫn tới file đó vào biến
//      GOOGLE_SERVICE_ACCOUNT_KEY_PATH trong .env của thư mục backup này.
//   4. QUAN TRỌNG: Service Account không có dung lượng Drive riêng (mặc định 0GB).
//      Vào Google Drive của TÀI KHOẢN THẬT của bạn, tạo một thư mục backup,
//      bấm Share, chia sẻ thư mục đó cho đúng email Service Account
//      (dạng "...@...iam.gserviceaccount.com", xem trong file JSON key,
//      trường "client_email"), cấp quyền "Editor". File Service Account
//      upload vào thư mục này sẽ tính vào dung lượng Drive của BẠN, không
//      phải của Service Account.
//   5. Copy ID của thư mục đó (đoạn cuối URL khi mở thư mục trên Drive)
//      vào biến GOOGLE_DRIVE_FOLDER_ID trong .env.
//
// Cài đặt: cd scripts/backup && npm install
// Dùng độc lập: node backup-gdrive-node.js <đường-dẫn-file-snapshot>
// Dùng chung với backup.sh: sửa backup.sh để gọi file này thay vì rclone
// nếu bạn chọn hướng này.

import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';

export async function uploadToGoogleDrive(filePath) {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!keyFile || !folderId) {
    throw new Error('Thiếu GOOGLE_SERVICE_ACCOUNT_KEY_PATH hoặc GOOGLE_DRIVE_FOLDER_ID trong .env.');
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const drive = google.drive({ version: 'v3', auth });

  const fileName = path.basename(filePath);
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: 'application/octet-stream', body: fs.createReadStream(filePath) },
    fields: 'id, name',
  });
  console.log(`Đã upload lên Google Drive: ${res.data.name} (id: ${res.data.id})`);
  return res.data;
}

// Cho phép chạy trực tiếp: node backup-gdrive-node.js <file>
if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Cách dùng: node backup-gdrive-node.js <đường-dẫn-file-snapshot>');
    process.exit(1);
  }
  uploadToGoogleDrive(filePath).catch(err => { console.error(err); process.exit(1); });
}
