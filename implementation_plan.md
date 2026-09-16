# Kế Hoạch Nâng Cấp Toàn Diện Dự Án Xưởng Nét (AI Upscaler SaaS)

Tài liệu phân tích luồng hoạt động (flow), giải đáp chi tiết các thắc mắc về AI, và đề xuất lộ trình triển khai kỹ thuật cho nền tảng **Xưởng Nét**.

---

## 📌 Phân Tích & Giải Đáp Thắc Mắc Cốt Lõi Của Bạn

### 1. Google OAuth (Đăng nhập / Đăng ký bằng tài khoản Google)
- **Cơ chế**: Người dùng bấm nút "Tiếp tục với Google" (Google Sign-In). Trình duyệt gọi Google Identity Services (GIS), trả về Google Credential (ID Token). Backend nhận token, xác thực chữ ký với Google, trích xuất `email`, `sub` (Google ID), `name`, `picture`.
- **Luồng xử lý tài khoản**:
  - Nếu email đã tồn tại: Hệ thống tự động liên kết `google_id` vào tài khoản hiện có và cấp session JWT ngay lập tức.
  - Nếu email chưa tồn tại: Tự động tạo user mới (không cần mật khẩu), cấp tặng credit tân thủ (`SIGNUP_BONUS_CREDITS`), tự động phong Admin nếu email thuộc `ADMIN_EMAILS`.
  - Người dùng có thể linh hoạt đăng nhập bằng mật khẩu hoặc Google bất kỳ lúc nào mà không bị trùng lặp dữ liệu.

### 2. "Google Banana / ChatGPT" có làm được Upscale & Dùng lượt miễn phí theo tài khoản Google của User được không?
> [!IMPORTANT]
> **Về khả năng làm nét của Google & ChatGPT:**
> - **ChatGPT (OpenAI / DALL-E 3):** Không có tính năng Super-Resolution/Upscale. ChatGPT chỉ sinh ảnh mới từ văn bản (text-to-image). Nếu nạp ảnh cũ vào để ChatGPT vẽ lại, nó sẽ "bịa" ra khuôn mặt và chi tiết mới hoàn toàn (hallucination), làm mất tính chân thực của ảnh gốc.
> - **Google Gemini:** Là mô hình ngôn ngữ đa phương thức (Multimodal LLM), hiểu ảnh và tạo mô tả, không phải mô hình phục chế pixel chuyên biệt như Real-ESRGAN hay CodeFormer.
> - *(Lưu ý: Nếu bạn nghe nhắc đến "Google Colab" chạy AI miễn phí: Colab là máy ảo Python cho cá nhân học tập, không cung cấp API cho website thương mại kết nối tự động).*

> [!WARNING]
> **Về việc "Dùng lượt miễn phí của Google hoặc ChatGPT theo tài khoản Google của người dùng":**
> - **HOÀN TOÀN KHÔNG THỂ VỀ MẶT KỸ THUẬT VÀ PHÁP LÝ:** Khi người dùng đăng nhập bằng Google trên web của bạn, họ chỉ cấp quyền đọc thông tin cơ bản (họ tên, email). Google **không bao giờ** cho phép bên thứ 3 mượn "lượt dùng miễn phí" hay tài nguyên GPU của tài khoản Google đó.
> - Các mô hình AI như Real-ESRGAN bắt buộc phải chạy trên máy chủ GPU đám mây (như Replicate, RunPod, fal.ai) và **chủ trang web (bạn) trả tiền theo API** (~$0.001 - $0.005/ảnh).
> - **Giải pháp tối ưu:** 
>   1. Cho user dùng lượt miễn phí bằng thuật toán **Canvas GPU** (chạy trực tiếp trên trình duyệt của khách, bạn không tốn 1 đồng chi phí nào - tính năng này đã có sẵn trong project).
>   2. Cấu hình `SIGNUP_BONUS_CREDITS=5` để tặng 1 lượt AI cao cấp miễn phí khi đăng ký bằng Google. Chi phí cho 1 lượt này trên Replicate chỉ khoảng ~30 - 50 VNĐ, xem như chi phí thu hút khách hàng.

---

### 3. Tinh Chỉnh Làm Nét & Sửa Lỗi Chi Tiết / Chữ Viết Cho Real-ESRGAN (Slider + Checkbox)
Mô hình GAN (Real-ESRGAN) khi gặp chữ viết, bảng hiệu hoặc họa tiết nhỏ thường cố "tự suy đoán", dẫn đến chữ bị méo mó, biến dạng thành các ký tự lạ hoặc mặt bị bệt như tượng sáp.

**Giải pháp kỹ thuật kết hợp 3 lớp:**
1. **Thanh trượt Độ hoàn thiện & Làm nét chi tiết (Detail Sharpening Slider: 0% -> 100%):**
   - Điều chỉnh thuật toán Unsharp Masking & High-Pass Frequency sau khi AI upscale.
   - Mức 0-30% (Nhẹ, tự nhiên, mịn màng) -> 50-70% (Tiêu chuẩn, rõ nét) -> 80-100% (Sắc bén cực đại cho kiến trúc/phong cảnh).
2. **Tuỳ chọn Sửa lỗi chữ viết & nét vẽ AI (Checkbox + Slider mức độ khôi phục):**
   - **Checkbox:** *"Bảo toàn chữ viết & nét vẽ (Chống méo chữ/dị tật AI)"*.
   - **Slider (Nhẹ -> Mạnh):** Khi kích hoạt, hệ thống kích hoạt bộ lọc **Edge Preservation Blend**:
     - Phân tách các vùng có độ tương phản cao (chữ viết, viền nét, hoa văn vector).
     - Hòa trộn (Alpha Blend) có chọn lọc với bản phóng to Bicubic nguyên gốc ở các vùng cạnh viền, đè lên các vết dị tật do GAN sinh ra.
     - Đồng thời trên Replicate, cho phép chuyển sang model chuyên xử lý nét vẽ/văn bản (`RealESRGAN_x4plus_anime_6B` hoặc model không khử nhiễu thô bạo).
3. **Bộ Preset Thông Minh (1 Click):**
   - 👤 **Chân dung & Người:** Bật Face Enhance, nét tự nhiên 50%.
   - 📄 **Tài liệu, Hóa đơn & Chữ viết:** Bật chống méo chữ 80%, tăng tương phản.
   - 🌄 **Phong cảnh & Sản phẩm:** Nét chi tiết 75%, không Face Enhance.

---

## 🚀 Đề Xuất Hoàn Thiện Project Cho Người Dùng (User Experience)

1. **Thanh So Sánh Trước / Sau (Interactive Before/After Slider):**
   - Sau khi xử lý xong, người dùng có thể kéo một thanh trượt chia đôi màn hình qua lại để trực tiếp thấy ảnh nét gấp nhiều lần so với ảnh cũ. Đây là tính năng kích thích nạp tiền mạnh nhất trong các app làm nét ảnh.
2. **Tải Toàn Bộ Thành File .ZIP (Batch Download):**
   - Khi xử lý 3-5 ảnh cùng lúc, bổ sung nút "Tải trọn bộ (.zip)" thay vì phải bấm từng ảnh riêng lẻ.
3. **Bộ Công Cụ Cắt & Xoay Nhanh (Crop / Rotate):**
   - Khách có thể xoay đúng chiều hoặc cắt bớt viền thừa trước khi bấm AI để không phí diện tích xử lý.
4. **Lịch Sử Xử Lý (Gallery / History):**
   - Lưu trữ tạm các ảnh đã làm trong 24 giờ để người dùng có thể tải lại nếu lỡ tắt trình duyệt hoặc mất mạng.

---

## 🛡️ Đề Xuất Tính Năng Tối Quan Trọng Cho Admin (Mở Rộng Không Bị Lỗi)

1. **Quản trị nạp tiền & Xử lý sự cố giao dịch (Payment Dispute Resolution):**
   - **Duyệt nạp tiền thủ công (Manual Approval):** Khi khách chuyển khoản sai cú pháp (ví dụ ghi `NAP 5` thay vì `NAP5`) hoặc ngân hàng chậm gửi webhook, admin có nút bấm *"Khớp tiền thủ công"* để cộng credit ngay mà không cần sửa database.
   - **Lịch sử Webhook Raw:** Xem trực tiếp log JSON ngân hàng gửi về để đối soát khi có khiếu nại.
   - **Hệ thống Mã Khuyến Mãi / Giftcode:** Tạo mã quà tặng (ví dụ `CHAOMUNG2026` tặng 10 credit) để chạy quảng cáo TikTok/Facebook.
2. **Bảo mật & Chống gian lận (Security & Anti-Abuse):**
   - **Khóa tài khoản (Ban/Suspend User):** Chặn người dùng gian lận hoặc spam.
   - **Rate Limiting (`express-rate-limit`):** Chống tấn công brute-force mật khẩu và chống bot tạo hàng loạt tài khoản để bào credit tân thủ.
3. **Kiến Trúc AI Đa Nhà Cung Cấp (Multi-Provider Fallback):**
   - Không gắn cứng vào duy nhất 1 tài khoản Replicate. Chuẩn bị module sẵn sàng chuyển sang fal.ai, Hugging Face hoặc Server GPU riêng nếu Replicate bảo trì hoặc tăng giá.
4. **Hàng đợi tác vụ (Job Queue) & Tự dọn rác (Storage Cleanup):**
   - Khi có 50 khách cùng upscale một lúc, hàng đợi xử lý tuần tự theo khả năng GPU, không làm nghẽn RAM server.
   - Tự động xóa file cache/ảnh tạm sau 24h để không bao giờ bị đầy ổ cứng SSD.
5. **Thông báo qua Telegram Bot:**
   - Báo ngay về điện thoại khi có người nạp tiền thành công, hoặc khi số dư tài khoản Replicate của bạn sắp hết.

---

## 📋 Đề Xuất Kế Hoạch Thay Đổi Code (Proposed Changes)

### 1. Backend & Cơ Sở Dữ Liệu

#### [MODIFY] [server/src/db.js](file:///c:/ServBay/www/upscale/server/src/db.js)
- Nâng cấp bảng `users`:
  - Thêm `google_id TEXT UNIQUE`.
  - Thêm `avatar_url TEXT`.
  - Cho phép `password_hash` nhận giá trị `NULL` (dành cho người dùng chỉ đăng nhập bằng Google).
- Tạo bảng `promo_codes` (Mã giảm giá/quà tặng credit).
- Bổ sung các cột thông số xử lý nâng cao trong `usage_logs` (`detail_level`, `text_repair_level`, `model_used`).

#### [NEW] [server/src/services/googleAuth.js](file:///c:/ServBay/www/upscale/server/src/services/googleAuth.js)
- Module xác thực Google ID Token an toàn thông qua Google TokenInfo API (nhẹ, nhanh, không cần cài thư viện cồng kềnh).

#### [MODIFY] [server/src/routes/auth.js](file:///c:/ServBay/www/upscale/server/src/routes/auth.js)
- Thêm endpoint `POST /api/auth/google`:
  - Nhận Google Credential Token.
  - Tự động tra soát người dùng theo Google ID hoặc Email.
  - Tự động cấp Credit khuyến mãi đăng ký mới nếu cấu hình.
  - Tạo session JWT và trả cookie HttpOnly.

#### [MODIFY] [server/src/routes/upscale.js](file:///c:/ServBay/www/upscale/server/src/routes/upscale.js)
- Tiếp nhận các tham số mới:
  - `sharpness_level` (0 -> 100).
  - `repair_text` (boolean).
  - `repair_level` (0 -> 100).
- Áp dụng bộ lọc cấu trúc ảnh hoặc điều hướng model phù hợp trước khi trả kết quả cho người dùng.

#### [MODIFY] [server/src/routes/admin.js](file:///c:/ServBay/www/upscale/server/src/routes/admin.js)
- Bổ sung API duyệt nạp tiền thủ công (`POST /api/admin/deposits/manual-approve`).
- Bổ sung API khóa/mở khóa tài khoản (`POST /api/admin/users/:id/toggle-ban`).
- Bổ sung API quản lý Giftcode/Mã giảm giá (`GET/POST /api/admin/coupons`).

---

### 2. Frontend Giao Diện Người Dùng & Admin

#### [MODIFY] [public/index.html](file:///c:/ServBay/www/upscale/public/index.html)
- **Khu vực Đăng nhập / Đăng ký:**
  - Nhúng thư viện Google Identity Services (`https://accounts.google.com/gsi/client`).
  - Hiển thị nút "Tiếp tục với Google" chuẩn thiết kế Google, nằm trên/dưới form đăng nhập truyền thống.
  - Tự động chuyển hướng mượt mà sau khi xác thực thành công.
- **Khu vực Công cụ Nâng cấp (Tool View):**
  - Thêm slider: **Mức độ hoàn thiện & làm nét** (Nhẹ 25% | Vừa 50% | Nét sâu 75% | Cực đại 100%).
  - Thêm checkbox: **Sửa lỗi chi tiết & chữ viết AI (Chống méo chữ)** đi kèm slider mức độ tạo từ nhẹ đến mạnh.
  - Thêm 3 Preset nhanh: *Chân dung*, *Tài liệu/Văn bản*, *Phong cảnh/Đồ vật*.
  - Tích hợp khung so sánh ảnh Trước/Sau (Before/After Slider) ngay khi có kết quả.
- **Khu vực Admin Dashboard:**
  - Thêm tab quản lý Mã khuyến mãi (Giftcodes).
  - Nút "Duyệt nhanh" đối với các giao dịch ngân hàng treo hoặc khách ghi sai nội dung.
  - Nút Khóa/Mở khóa thành viên.

---

## 🧪 Kế Hoạch Kiểm Thử (Verification Plan)

### Kiểm thử chức năng
1. **Google OAuth:**
   - Đăng nhập bằng tài khoản Google mới -> Kiểm tra user được tạo trong SQLite, nhận đúng credit thưởng tân thủ, session cookie được cấp.
   - Đăng nhập bằng tài khoản Google trùng email với một tài khoản email/mật khẩu đã có -> Đảm bảo liên kết mượt mà, không sinh tài khoản rác.
2. **Slider Làm nét & Sửa chữ:**
   - Thử nghiệm trên ảnh chụp hóa đơn/chữ viết có độ phân giải thấp.
   - Bật checkbox Sửa lỗi chữ viết + kéo slider -> So sánh ảnh đầu ra để kiểm tra xem chữ viết có bị biến dạng hay được bảo toàn sắc nét.
3. **Admin Controls:**
   - Thử nghiệm duyệt nạp tiền thủ công cho một user -> Kiểm tra số dư credit tăng ngay lập tức và ghi lịch sử giao dịch.
   - Thử nghiệm tính năng tạo Giftcode và dùng thử mã.
