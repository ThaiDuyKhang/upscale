# Xưởng Nét — bản SaaS đầy đủ (đăng ký, ví credit, nạp tiền, AI upscale, admin)

## Kiến trúc

```
server/            Backend Node/Express + SQLite (module node:sqlite có sẵn trong Node.js — không cần cài/biên dịch gì thêm)
  src/
    server.js       khởi động app, phục vụ luôn frontend tĩnh
    db.js            toàn bộ schema + truy vấn
    auth.js          hash mật khẩu, JWT cookie, middleware
    routes/
      auth.js         đăng ký / đăng nhập / đăng xuất / thông tin tài khoản
      wallet.js        số dư, tạo yêu cầu nạp tiền + mã QR, lịch sử giao dịch
      webhooks.js       nhận xác nhận thanh toán từ SePay / Pay2S
      upscale.js        gọi Real-ESRGAN qua Replicate, trừ credit
      admin.js          quản lý user, điều chỉnh credit, thống kê, cấu hình giá
    payments/
      vietqr.js         tạo ảnh QR chuyển khoản (dùng img.vietqr.io, miễn phí)
      sepay.js          xác thực + đọc payload webhook SePay (đã đối chiếu tài liệu)
      pay2s.js          khung tích hợp Pay2S — CẦN bạn tự xác nhận lại field IPN

public/
  index.html        toàn bộ frontend (SPA 1 trang: đăng nhập, dashboard user, dashboard admin)
```

Không cần bước build nào — `public/index.html` dùng Tailwind qua CDN, chạy được ngay khi server phục vụ nó.

## Cài đặt & chạy

```bash
cd server
npm install
cp .env.example .env
# mở .env, điền đầy đủ các giá trị (xem chi tiết bên dưới)
npm start
```

Mở `http://localhost:8787` — server tự phục vụ luôn cả frontend, không cần chạy 2 tiến trình riêng.

**Yêu cầu Node.js ≥ 22.5.0** (dùng module `node:sqlite` có sẵn trong Node, không cần cài driver SQLite riêng nên tránh được lỗi build native hay gặp trên Windows với `better-sqlite3`). Khi chạy, bạn có thể thấy một dòng `ExperimentalWarning: SQLite is an experimental feature` — vô hại, bỏ qua được. Nếu máy bạn báo lỗi không tìm thấy module `node:sqlite`, thử chạy `node --experimental-sqlite src/server.js` thay cho `npm start`.

## Các biến `.env` cần điền

| Biến | Ý nghĩa |
|---|---|
| `JWT_SECRET` | Chuỗi bí mật ký JWT — đổi thành chuỗi ngẫu nhiên dài, không dùng giá trị mẫu |
| `ADMIN_EMAILS` | Danh sách email (cách nhau bằng dấu phẩy) sẽ tự thành admin khi đăng ký |
| `REPLICATE_API_TOKEN` | Lấy tại replicate.com/account/api-tokens |
| `REPLICATE_MODEL` | `nightmareai/real-esrgan` (Official model, không cần version) |
| `BANK_BIN`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME` | Tài khoản nhận tiền — dùng để sinh mã QR |
| `SEPAY_WEBHOOK_APIKEY` | Đặt trùng giá trị với cấu hình Webhook trên SePay Dashboard |
| `VND_PER_CREDIT`, `CREDITS_PER_UPSCALE`, `MIN_DEPOSIT_VND` | Giá mặc định — admin đổi được ngay trong Dashboard sau khi chạy, không cần sửa `.env` lại |

## Luồng đăng ký admin đầu tiên

Không có tài khoản admin mặc định được tạo sẵn (tránh để lộ mật khẩu mẫu trong code).
Cách làm: điền email của bạn vào `ADMIN_EMAILS` trong `.env` **trước khi** đăng ký tài khoản đó lần đầu trên giao diện — tài khoản sẽ tự động có quyền admin ngay khi tạo.

## Thiết lập SePay (khuyến nghị dùng trước)

1. Đăng ký tại my.sepay.vn, liên kết tài khoản ngân hàng nhận tiền.
2. Vào **Công ty → Cấu hình chung → Cấu trúc mã thanh toán**: đặt tiền tố khớp với `NAP` (mã do server tự sinh dạng `NAP` + 8 ký tự, ví dụ `NAP7K2X9QAB`) để SePay tự nhận diện đúng field `code` trong webhook.
3. Vào **Tích hợp → Webhooks → Thêm Webhook**:
   - URL: `https://ten-mien-cua-ban.com/api/webhooks/sepay` (bắt buộc HTTPS khi chạy thật; lúc dev local dùng ngrok để có URL public tạm thời)
   - Loại sự kiện: giao dịch tiền vào
   - Bảo mật: chọn **API Key**, dán đúng giá trị bạn đã đặt ở `SEPAY_WEBHOOK_APIKEY`
4. Test bằng tính năng "Thanh toán thử" (sandbox) của SePay trước khi dùng tài khoản thật.

## Thiết lập Pay2S (tuỳ chọn, cần bạn tự xác nhận thêm)

File `server/src/payments/pay2s.js` chỉ là khung sườn — tài liệu công khai tôi tra được chỉ mô tả khái niệm (Partner Code / Access Key / Secret Key, IPN kèm `trans_id` và mã đơn hàng), không có JSON schema đầy đủ đã xác nhận. **Trước khi bật Pay2S cho giao dịch thật:**

1. Đăng nhập docs.pay2s.vn, xem đúng phần "Tích hợp kỹ thuật / IPN" để lấy tên field chính xác và cách tính chữ ký.
2. Sửa `verifyPay2sSignature()` và `extractPay2sTransaction()` trong `pay2s.js` cho khớp.
3. Test bằng một giao dịch nhỏ, `console.log()` toàn bộ `req.body` của webhook thật để đối chiếu trước khi tin tưởng hoàn toàn.

## Cách tính phí đã cài sẵn

- 1 credit = `VND_PER_CREDIT` đồng (mặc định 1.000đ) — admin đổi được trong Dashboard.
- Mỗi lượt "Nâng cấp bằng AI" tốn `CREDITS_PER_UPSCALE` credit (mặc định 5, tương đương 5.000đ) — admin đổi được trong Dashboard.
- Credit **chỉ bị trừ khi Replicate xử lý thành công** — nếu lỗi, người dùng không mất credit.
- Với chi phí Replicate thực tế của `nightmareai/real-esrgan` (~0,002 USD/ảnh, khoảng 50đ), mức 5.000đ/lượt là biên lợi nhuận khá lớn — bạn tự cân đối lại theo thị trường của mình.

## Những gì CHƯA có trong bản này — cần cân nhắc thêm trước khi ra sản phẩm thật

- Xác thực email khi đăng ký, quên mật khẩu / đặt lại mật khẩu.
- Giới hạn tốc độ gọi API (rate limiting) — nên thêm để tránh bị spam tốn credit Replicate hoặc bị dò mật khẩu.
- SQLite phù hợp cho giai đoạn khởi đầu; nếu lượng truy cập/giao dịch đồng thời lớn, nên chuyển sang PostgreSQL (lớp `db.js` được viết tách riêng để việc này đỡ tốn công hơn).
- HTTPS — bắt buộc cho production, đặc biệt vì cookie phiên đăng nhập và webhook thanh toán đều cần kênh an toàn. Đồng thời bật lại dòng `secure: true` bị comment trong `src/auth.js` khi đã có HTTPS.
- Đối soát thủ công cho các giao dịch chuyển khoản "không khớp mã" (ví dụ khách ghi sai nội dung) — hiện tại các giao dịch này chỉ được log ra console, nên có thêm màn hình admin riêng để xử lý tay.

## Backup dữ liệu — xem `server/scripts/backup/README.md`

SQLite là lựa chọn hợp lý cho giai đoạn đầu, nhưng vì hệ thống này giữ **tiền thật** của khách hàng (credit đã nạp), backup tự động là việc bắt buộc phải làm **trước khi** nhận giao dịch thật đầu tiên, không phải việc để "sau này rảnh rồi làm". Thư mục `server/scripts/backup/` có sẵn script snapshot + đẩy lên Google Drive (qua rclone) + script khôi phục, kèm hướng dẫn cài đặt chi tiết.
