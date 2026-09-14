# Mở rộng Website: Trang công khai + Trang cá nhân + SEO toàn diện

## Tổng quan

Hiện tại, khi chưa đăng nhập, website chỉ hiển thị form Login/Register. Yêu cầu:
- Website hiển thị đầy đủ các trang công khai cho **tất cả** khách truy cập
- Chỉ khi đăng nhập → user mới dùng được chức năng nâng cấp ảnh & nạp tiền
- Admin đăng nhập → truy cập Admin Dashboard
- Thêm trang **Thông tin cá nhân** cho user đã đăng nhập
- **SEO toàn diện cấp RankMath** — tối ưu cho Google, Facebook, Twitter, Zalo, và mọi nền tảng

---

## SEO Strategy — Cấp RankMath

### 1. Meta Tags đầy đủ cho mỗi trang

Mỗi route sẽ tự động cập nhật `<head>` với đầy đủ meta:

| Meta Tag | Mục đích |
|---|---|
| `<title>` | Title tối ưu (60 ký tự), có brand name |
| `meta description` | Mô tả hấp dẫn (155 ký tự), chứa keyword |
| `meta keywords` | Từ khóa chính cho trang |
| `meta robots` | `index,follow` cho public, `noindex` cho dashboard/admin |
| `link canonical` | URL chính thức, tránh duplicate content |

### 2. Open Graph (Facebook, Zalo, Messenger)

```html
<meta property="og:type" content="website">
<meta property="og:title" content="Xưởng Nét — Nâng cấp ảnh bằng AI">
<meta property="og:description" content="...">
<meta property="og:image" content="https://domain.com/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="https://domain.com/">
<meta property="og:site_name" content="Xưởng Nét">
<meta property="og:locale" content="vi_VN">
```

### 3. Twitter Cards

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="...">
<meta name="twitter:description" content="...">
<meta name="twitter:image" content="...">
```

### 4. Structured Data (JSON-LD Schema.org)

Tự động inject vào `<head>` theo từng trang:

- **Trang chủ**: `Organization` + `WebSite` + `SearchAction`
- **Trang Tính năng**: `SoftwareApplication` + `Product`
- **Trang Bảng giá**: `Product` + `Offer` (có giá VND)
- **Trang Liên hệ**: `LocalBusiness` + `ContactPoint`
- **Breadcrumb**: `BreadcrumbList` cho mọi trang

### 5. Technical SEO Files (Backend)

| File | Chức năng |
|---|---|
| `/sitemap.xml` | Sitemap động, liệt kê tất cả trang public |
| `/robots.txt` | Cho phép crawl public, chặn /dashboard, /admin, /profile |
| `/manifest.json` | PWA manifest (name, icons, theme) |

### 6. Performance SEO

- **Preconnect** Google Fonts, CDN
- **Lazy loading** cho images (`loading="lazy"`)
- **Minified inline CSS** cho critical path
- **`<link rel="preload">` cho font chính**
- **Semantic HTML5**: `<header>`, `<main>`, `<nav>`, `<section>`, `<article>`, `<footer>`, `<aside>`
- **Heading hierarchy**: Đúng 1 `<h1>` per page, `<h2>` → `<h3>` logic

### 7. Accessibility & UX SEO Signals

- Tất cả `<img>` có `alt` text mô tả
- Tất cả link có `aria-label` khi cần
- Focus states rõ ràng cho keyboard navigation
- `<html lang="vi">` (đã có)
- Skip-to-content link cho screen readers

---

## Proposed Changes

### Frontend — [MODIFY] [index.html](file:///c:/ServBay/www/upscale/public/index.html)

Viết lại toàn bộ SPA, giữ nguyên logic dashboard/admin/upscale hiện tại.

#### 1. `<head>` — SEO Foundation

- Tất cả meta tags mặc định (cho trang chủ)
- JSON-LD Organization + WebSite schema
- Open Graph + Twitter Card tags
- Canonical URL
- Favicon references
- Preconnect + preload hints
- JS function `updateSEO(pageConfig)` tự cập nhật meta theo route

#### 2. Navigation Bar

- **Logo** "Xưởng Nét" — link về `/`
- **Menu links**: Trang chủ · Tính năng · Bảng giá · Liên hệ
- **Nếu chưa đăng nhập**: Nút "Đăng nhập" + "Đăng ký miễn phí"
- **Nếu đã đăng nhập**: Credit badge, dropdown menu (Nâng cấp ảnh, Thông tin cá nhân, Admin*, Đăng xuất)
- **Mobile**: Hamburger menu responsive
- Schema: Navigation breadcrumb

#### 3. Trang chủ `/` — Landing Page

- **Hero section**: H1 keyword-rich, mô tả, CTA, hero image
- **Demo slider**: Before/After comparison (ảnh tĩnh demo)
- **Feature cards**: 4 tính năng nổi bật với icons
- **Social proof section**: Số liệu (users, lượt nâng cấp)
- **Bảng giá tóm tắt**: Lấy từ public API
- **FAQ section**: Accordion — giúp Google Featured Snippet (`FAQPage` schema)
- **CTA cuối trang**
- Schema: `WebSite`, `Organization`, `FAQPage`

#### 4. Trang Tính năng `/features`

- Chi tiết Real-ESRGAN, face enhance
- Use cases với icons
- So sánh trước/sau chi tiết
- Thông số kỹ thuật
- CTA đăng ký
- Schema: `SoftwareApplication`, `BreadcrumbList`

#### 5. Trang Bảng giá `/pricing`

- Bảng giá credit rõ ràng (VND/credit, credit/upscale)
- Các gói nạp gợi ý
- FAQ về thanh toán
- CTA đăng ký / nạp tiền
- Schema: `Product` + `Offer`, `BreadcrumbList`

#### 6. Trang Liên hệ `/contact`

- Form liên hệ (UI, submit qua email)
- Thông tin liên hệ: email, SĐT, mạng xã hội
- Schema: `LocalBusiness`, `ContactPoint`, `BreadcrumbList`

#### 7. Dashboard `/dashboard` (đã đăng nhập)

- Giữ nguyên logic hiện tại (upload, upscale, deposit, tx history)
- Meta: `noindex, nofollow`

#### 8. Trang cá nhân `/profile` (đã đăng nhập)

- Email, vai trò, ngày đăng ký
- Số dư credit + nút nạp thêm
- Lịch sử giao dịch
- Thống kê sử dụng
- Form đổi mật khẩu
- Meta: `noindex, nofollow`

#### 9. Admin `/admin` (admin)

- Giữ nguyên logic hiện tại
- Meta: `noindex, nofollow`

#### 10. Footer

- Links trang: Trang chủ, Tính năng, Bảng giá, Liên hệ
- Copyright
- Social icons (placeholder)

#### 11. Route Table

```
Route       | Truy cập      | SEO          | Schema
----------- | ------------- | ------------ | -------------------------
/           | Tất cả        | index,follow | WebSite, Organization, FAQPage
/features   | Tất cả        | index,follow | SoftwareApplication, Breadcrumb
/pricing    | Tất cả        | index,follow | Product+Offer, Breadcrumb
/contact    | Tất cả        | index,follow | LocalBusiness, Breadcrumb
/login      | Chưa login    | noindex      | —
/register   | Chưa login    | noindex      | —
/dashboard  | Đã login      | noindex      | —
/profile    | Đã login      | noindex      | —
/admin      | Admin         | noindex      | —
```

---

### Backend

#### [MODIFY] [server.js](file:///c:/ServBay/www/upscale/server/src/server.js)

- Thêm `GET /api/public/settings` — trả VND/credit, credit/upscale cho trang Bảng giá (không cần auth)
- Thêm serve `GET /sitemap.xml` — sinh động, liệt kê trang public
- Thêm serve `GET /robots.txt` — cho phép crawl public, chặn private routes

#### [MODIFY] [auth.js (routes)](file:///c:/ServBay/www/upscale/server/src/routes/auth.js)

- Thêm `POST /api/auth/change-password` (yêu cầu đăng nhập, nhập mật khẩu cũ + mới)

---

### New Static Files

#### [NEW] `/public/og-image.jpg`

- Generate ảnh Open Graph 1200×630 cho share lên Facebook/Zalo

#### [NEW] `/public/favicon.svg`

- Favicon SVG dạng logo diamond

---

## User Review Required

> [!IMPORTANT]
> **Domain name**: Để cấu hình canonical URL, sitemap, og:url chính xác, bạn dùng domain gì cho production? Hiện tôi sẽ dùng relative URLs và placeholder `https://xuongnet.com` — bạn đổi sau được.

> [!IMPORTANT]
> **Thông tin liên hệ**: Trang Liên hệ cần email, SĐT, địa chỉ, link Zalo/Facebook. Tôi sẽ dùng placeholder — bạn cung cấp ngay hoặc sửa sau?

> [!IMPORTANT]
> **Ảnh demo Before/After**: Tôi sẽ generate ảnh demo minh họa cho landing page và OG image. OK?

## Verification Plan

### Manual Verification
- Truy cập `http://localhost:8787` khi chưa đăng nhập → thấy landing page đầy đủ
- Navigate tất cả trang công khai mà không cần đăng nhập
- View source → kiểm tra meta tags, JSON-LD, OG tags đúng theo route
- Kiểm tra `/sitemap.xml` và `/robots.txt`
- Test share URL lên Facebook Debugger / Twitter Card Validator
- Đăng nhập → /dashboard, /profile hoạt động
- Admin → /admin hoạt động
- Responsive trên mobile
- Lighthouse SEO score ≥ 90
