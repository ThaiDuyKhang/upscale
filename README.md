# 💎 Xưởng Nét — Nền Tảng SaaS Nâng Cấp & Phục Chế Ảnh AI

> **Xưởng Nét** là giải pháp SaaS hoàn chỉnh cho dịch vụ làm nét và phục chế ảnh bằng Trí Tuệ Nhân Tạo (AI Image Upscaling & Restoration). Phiên bản mới nhất đã nâng cấp kiến trúc Đa Mô Hình (Multi-Model) với Real-ESRGAN và GFPGAN, cùng các tuỳ chọn xử lý offline bằng WebGL Canvas. Tích hợp đầy đủ hệ thống ví credit, thanh toán chuyển khoản tự động (SePay/Pay2S) và Bảng điều khiển Admin.

---

## 📑 Mục lục

1. [Tổng quan dự án](#-tổng-quan-dự-án)
2. [Tính năng nổi bật](#-tính-năng-nổi-bật)
3. [Công nghệ sử dụng](#-công-nghệ-sử-dụng)
4. [Kiến trúc thư mục](#-kiến-trúc-thư-mục)
5. [Yêu cầu hệ thống](#-yêu-cầu-hệ-thống)
6. [Hướng dẫn cài đặt & Khởi chạy](#-hướng-dẫn-cài-đặt--khởi-chạy)
7. [Bảng biến môi trường (`.env`)](#-bảng-biến-môi-trường-env)
8. [Quy trình thanh toán & Webhook](#-quy-trình-thanh-toán--webhook)
9. [Cơ chế AI Upscale & Trừ Credit](#-cơ-chế-ai-upscale--trừ-credit)
10. [Hướng dẫn Bảng điều khiển Quản trị (Admin)](#-hướng-dẫn-bảng-điều-khiển-quản-trị-admin)
11. [Danh sách API Endpoints](#-danh-sách-api-endpoints)
12. [Kinh nghiệm triển khai Production](#-kinh-nghiệm-triển-khai-production)

---

## 🌟 Tổng quan dự án

Xưởng Nét được thiết kế theo tư duy tinh gọn (Lean Architecture) nhưng đáp ứng đầy đủ tiêu chuẩn thương mại hoá:
- **Phục vụ trọn gói (All-in-one):** Một tiến trình Node.js duy nhất vừa cung cấp REST API, vừa phục vụ trực tiếp Frontend Single-Page Application (SPA).
- **Không phụ thuộc build-tool cồng kềnh:** Frontend chạy trực tiếp trên trình duyệt với Tailwind CSS CDN, tải trang tức thì.
- **Cơ sở dữ liệu SQLite Native:** Sử dụng trực tiếp module `node:sqlite` tích hợp sẵn trong Node.js (từ v22.5+), giải quyết triệt để vấn đề cài đặt C++ native.
- **Thanh toán tự động 24/7:** Tự động sinh mã VietQR theo cú pháp tĩnh của từng người dùng (`NAP{userId}`) và xác thực Webhook tức thì.

---

## ✨ Tính năng nổi bật

### 1. 🖼️ Kiến trúc Đa Mô Hình AI (Multi-Model AI)
- **✨ Real-ESRGAN:** Mô hình phóng to đa dụng, tối ưu cho ảnh thực, anime, phong cảnh. Hỗ trợ phóng to 2x/4x/8x.
- **👤 GFPGAN:** Phục chế chuyên sâu khuôn mặt bị mờ, ảnh cũ hoặc sửa lỗi khuôn mặt do AI tạo ra. Hỗ trợ chọn version (`v1.4`, `v1.3`, `v1.2`, `RestoreFormer`).
- **⚡ Canvas GPU (Miễn phí/Trả phí):** Phóng to bằng giải thuật truyền thống kết hợp WebGL ngay trên trình duyệt (Offline). Giúp khách hàng trải nghiệm nhanh không cần gọi API máy chủ.

### 2. ⚡ Batch Processing & Auto ZIP Download
- Tải lên tối đa 5 ảnh cùng lúc.
- Hệ thống tự động xử lý hàng loạt, giữ kết nối ổn định không timeout.
- Tự động đóng gói toàn bộ ảnh đã xử lý thành tệp **.zip** và hiển thị thanh tải về gọn gàng phía dưới ngay khi hoàn tất.
- Trải nghiệm giao diện **Unified 1-Button UI**: Chỉ cần chọn radio model, nút "Chạy" duy nhất sẽ tự động thay đổi chức năng tương ứng.

### 3. 💳 Hệ thống Ví Credit & Thanh toán Tự Động
- **Mã nạp tĩnh tối ưu:** Mỗi người dùng sở hữu một mã nạp duy nhất dạng `NAP{userId}`.
- Không lưu trạng thái "chờ" (pending), chỉ ghi nhận khi webhook ngân hàng xác nhận tiền thực tế đã vào tài khoản.
- Tự động tạo mã VietQR chuẩn và Frontend tự động nhận diện thanh toán thành công để đóng modal.

### 4. 🎛️ Bảng điều khiển Admin
- **Thống kê:** Doanh thu VNĐ, tổng credit tiêu thụ, số lượt xử lý AI.
- **Cấu hình giá:** Cập nhật ngay lập tức tỷ giá VNĐ/Credit và chi phí từng loại AI mà không cần khởi động lại.
- **Người dùng & Giao dịch:** Quản lý số dư người dùng thủ công, theo dõi nhật ký sử dụng AI (Usage Logs).

---

## 🛠️ Công nghệ sử dụng

| Lớp (Layer) | Công nghệ / Thư viện | Vai trò |
|---|---|---|
| **Runtime** | [Node.js](https://nodejs.org/) (≥ v22.5.0) | Môi trường thực thi JavaScript |
| **Backend Framework** | [Express.js](https://expressjs.com/) v4 | Xây dựng API và Router |
| **Cơ sở dữ liệu** | `node:sqlite` | Quản lý CSDL tốc độ cao với WAL |
| **Mã hóa** | `jsonwebtoken`, `bcryptjs` | Bảo mật tài khoản, xác thực phiên |
| **AI Inference** | [Replicate API](https://replicate.com/) | Xử lý Real-ESRGAN & GFPGAN |
| **Thanh toán & QR** | VietQR, SePay, Pay2S | Tạo QR Code và nhận Webhook ngân hàng |
| **Frontend** | HTML5, JS, Tailwind, JSZip | Giao diện SPA, xử lý nén file zip client-side |

---

## 📂 Kiến trúc thư mục

```text
upscale/
├── README.md                      # Tài liệu dự án
├── public/                        # Frontend tĩnh
│   ├── index.html                 # Ứng dụng SPA (Unified Radio UI, ZIP logic)
│   └── og-image.jpg
└── server/                        # Mã nguồn Backend
    ├── .env.example               
    ├── .env                       
    ├── data.sqlite3               # File CSDL SQLite (tự sinh)
    ├── src/
    │   ├── server.js              # Khởi tạo Express
    │   ├── db.js                  # Lược đồ SQLite & Truy vấn
    │   ├── auth.js                # Middleware xác thực JWT
    │   ├── routes/
    │   │   ├── auth.js            # Đăng nhập, đăng ký
    │   │   ├── wallet.js          # Số dư, lịch sử nạp, nạp VietQR
    │   │   ├── webhooks.js        # Nhận Webhook SePay & Pay2S
    │   │   ├── upscale.js         # REST API kết nối Replicate (chung & gfpgan)
    │   │   └── admin.js           # API Quản trị
    │   └── payments/
    │       └── ...                # Module tạo QR và xử lý Webhook
    └── scripts/backup/            # Công cụ backup CSDL tự động
```

---

## 🚀 Hướng dẫn cài đặt & Khởi chạy

### 1. Yêu cầu
- Node.js bản **≥ 22.5.0** (bắt buộc cho module `node:sqlite`).
- Tài khoản Replicate lấy API Token.

### 2. Cài đặt
```bash
git clone https://github.com/ThaiDuyKhang/upscale.git
cd upscale/server
npm install
cp .env.example .env
```
Mở `.env` và cấu hình token Replicate, mã JWT_SECRET, email Admin, thông tin VietQR của bạn. (GFPGAN sử dụng model hash cố định nên không cần thêm biến env riêng cho nó).

### 3. Khởi chạy
```bash
npm start
# Hoặc chế độ dev
npm run dev
```
Truy cập ứng dụng: 👉 **`http://localhost:8787`**

---

## ⚙️ Bảng biến môi trường (`.env`)

| Tên biến | Mô tả |
|---|---|
| `JWT_SECRET` | Chuỗi bí mật ký xác thực JWT cookie. (Bắt buộc) |
| `ADMIN_EMAILS` | Danh sách email (cách nhau bằng dấu phẩy) tự động có quyền `admin`. |
| `REPLICATE_API_TOKEN` | API Token lấy từ `https://replicate.com/account/api-tokens`. Dùng cho mọi thao tác gọi Replicate. |
| `REPLICATE_MODEL` | Chỉ định tên model mặc định (dùng cho Real-ESRGAN). Ví dụ: `nightmareai/real-esrgan`. |
| `BANK_BIN`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME` | Thông tin tạo VietQR nạp tiền. |
| `SEPAY_WEBHOOK_APIKEY` | (Tuỳ chọn) Xác thực Webhook từ cổng SePay. |
| `VND_PER_CREDIT`, `CREDITS_PER_UPSCALE`, `MIN_DEPOSIT_VND` | Giá quy đổi tiền và dịch vụ ban đầu. |

---

## 💸 Quy trình thanh toán & Webhook

Dự án áp dụng luồng thanh toán chuyển khoản ngân hàng tự động hóa 100%:
1. User chọn nạp tiền, hệ thống sinh mã VietQR nội dung tĩnh `NAP{userId}`.
2. User quét mã chuyển khoản.
3. SePay/Pay2S nhận giao dịch, webhook POST báo về `api/webhooks/sepay`.
4. Server xác minh chữ ký bảo mật, cộng credit, user trên web tự động nhận phản hồi thành công nhờ polling 4 giây/lần ở client.

---

## 🧠 Cơ chế AI Upscale & Trừ Credit

1. **Phân luồng Model:** Tuỳ vào lựa chọn radio trên UI, Frontend sẽ gọi API `/api/upscale` (Real-ESRGAN) hoặc `/api/upscale/gfpgan` (GFPGAN) trên server.
2. **Batch Timeout Handling:** Để xử lý tối đa 5 ảnh, Frontend dùng `Promise.all` hoặc vòng lặp. Server đã sử dụng helper `pollPrediction` với thời gian timeout chờ Replicate lên đến 2 phút/ảnh, đảm bảo không bị ngắt kết nối quá sớm.
3. **An toàn Credit:**
   - Server kiểm tra số dư trước khi chạy.
   - Credit **chỉ bị trừ** khi Replicate xử lý thành công (nhận trạng thái `succeeded`).
   - Nếu gặp lỗi, hệ thống bảo lưu credit cho khách hàng.

---

## 📡 Danh sách API Endpoints Chính

| Endpoint | Mô tả |
|---|---|
| `POST /api/upscale` | Chạy Real-ESRGAN. Cần body `{image, scale, face_enhance}` |
| `POST /api/upscale/gfpgan` | Chạy GFPGAN. Cần body `{image, scale, version}` |
| `POST /api/wallet/deposits` | Lấy VietQR nạp tiền |
| `POST /api/webhooks/sepay` | Endpoint webhook để cổng thanh toán gọi |

---

## 📄 Bản quyền & Đóng góp

- Phát triển bởi: **Thái Duy Khang**
- Giấy phép: MIT License.
