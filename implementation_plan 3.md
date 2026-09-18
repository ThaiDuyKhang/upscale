# Kế hoạch triển khai: Hệ thống Bài viết chuẩn SEO (Blog / Hướng dẫn)

Theo kỹ năng SEO (SKILL SEO v3.1.0.md), đối với sản phẩm công nghệ (SaaS/App) như Xưởng Nét, thay vì đặt tên chung chung là "Blog" hay "Tin tức", chúng ta nên sử dụng các tên gọi mang tính phân loại rõ ràng theo Intent (Hub Page) để tăng độ trust và đáp ứng đúng tìm kiếm của người dùng. Một số gợi ý tên hợp lý:
- **"Kiến Thức"** hoặc **"Cẩm Nang"** (Nếu thiên về giáo dục, giải thích khái niệm AI, ảnh).
- **"Hướng Dẫn"** (Nếu tập trung vào các bài tutorial cách dùng công cụ, thủ thuật chỉnh ảnh).
- Gợi ý tốt nhất cho Xưởng Nét: URL là `/kien-thuc` hoặc `/huong-dan`, tên trên menu là **"Kiến thức AI"** hoặc **"Hướng dẫn"**.

Dưới đây là kế hoạch chi tiết để tích hợp hệ thống CMS thu nhỏ viết bài chuẩn SEO vào Xưởng Nét.

## User Review Required

> [!IMPORTANT]
> **1. Lựa chọn tên URL và Menu:** Bạn muốn chọn tên URL là `/kien-thuc`, `/huong-dan` hay một tên khác?
> **2. Lựa chọn Editor:** Trong giao diện Admin, bạn muốn dùng **Markdown Editor** (viết mã markdown đơn giản, sạch sẽ) hay **WYSIWYG Editor** (như Word, dùng thư viện Quill/TinyMCE qua CDN)? 

## Proposed Changes

### Cơ sở dữ liệu (Backend - SQLite)

Thêm các bảng mới vào `src/db.js` để quản lý bài viết và taxonomy:
- Bảng `categories`: `id`, `slug`, `name`
- Bảng `tags`: `id`, `slug`, `name`
- Bảng `posts`: 
  - Thông tin bài: `id`, `slug` (UNIQUE), `title`, `content`, `is_published`, `created_at`, `updated_at`.
  - Thông tin SEO (Giống RankMath): `seo_title`, `seo_description`, `focus_keyword`, `schema_json`.
- Bảng trung gian `post_categories` và `post_tags` để liên kết (nhiều-nhiều).

#### [MODIFY] src/db.js
- Viết script tạo các bảng trên (`CREATE TABLE IF NOT EXISTS...`).
- Cung cấp các lệnh `stmt` để CRUD (Thêm, Sửa, Xóa, Đọc) cho bài viết, danh mục và tag.

### API Routes (Backend)

Tạo thêm các API để phục vụ quản trị và hiển thị:
#### [NEW] src/routes/posts.js
- `GET /api/public/posts`: Lấy danh sách bài viết (có phân trang, lọc theo danh mục/tag).
- `GET /api/public/posts/:slug`: Lấy chi tiết một bài viết để hiển thị.
- `GET /api/admin/posts` & `POST /api/admin/posts`: Lấy danh sách và tạo bài viết mới.
- `PUT /api/admin/posts/:id` & `DELETE /api/admin/posts/:id`: Cập nhật / Xóa bài viết.
- Tương tự với Categories và Tags.

#### [MODIFY] src/server.js
- Import và mount route `/api/public/posts` và `/api/admin/posts`.

### Giao diện Admin (Frontend)

Cập nhật Dashboard Admin để có mục quản trị bài viết.
#### [MODIFY] public/index.html (Admin Section)
- Thêm tab **"Bài viết SEO"** vào menu Admin.
- Tích hợp một thư viện Text Editor qua CDN (Ví dụ: Quill.js).
- Tạo UI chia 2 cột giống WordPress:
  - Cột chính: Tiêu đề, Nội dung bài viết.
  - Cột cấu hình (Sidebar): Trạng thái (Đăng/Nháp), Chọn Category, Thêm Tags, Nhập Ảnh Thumbnail.
- Thêm hộp thoại **"RankMath SEO Box"**: Nhập Focus Keyword, SEO Title, SEO Description, và Custom Schema JSON. Tính toán độ dài Title/Description (progress bar) như RankMath.

### Giao diện Public (Frontend)

Tạo các route public trên ứng dụng SPA để người dùng và Bot Google đọc được.
#### [MODIFY] public/index.html (Public Routes)
- Định nghĩa route `/kien-thuc` (trang danh sách bài viết) hiển thị dạng lưới các bài viết mới nhất.
- Định nghĩa route `/kien-thuc/:slug` (trang chi tiết bài viết): 
  - Render nội dung bài viết.
  - Gọi hàm `updateSEO()` để tiêm các meta tags chuẩn xác (Title, Meta Description, và Schema.org) được lấy từ Database (từ các trường RankMath tương ứng).

## Verification Plan

### Manual Verification
1. Đăng nhập Admin, vào tab Bài viết SEO, tạo Category mới, Tag mới.
2. Viết một bài viết mới, điền các trường SEO Title, Meta Desc, Focus Keyword.
3. Nhấn "Đăng bài".
4. Truy cập trang Public (`/kien-thuc`), kiểm tra bài viết có hiển thị không.
5. Truy cập bài viết chi tiết, F12 kiểm tra mã nguồn (DOM) xem các thẻ `<meta name="description">` và `<title>` có phản ánh đúng dữ liệu từ RankMath box hay không. Lấy thử đoạn schema render ra đưa vào Rich Results Test.
