import { savePost, stmt } from './src/db.js';

let catId;
try {
  catId = stmt.insertCategory.run('huong-dan', 'Hướng dẫn').lastInsertRowid;
} catch (e) {
  // if exists
  catId = stmt.listCategories.all().find(c => c.slug === 'huong-dan').id;
}

let tagId;
try {
  tagId = stmt.insertTag.run('ai-upscale', 'AI Upscale').lastInsertRowid;
} catch (e) {
  tagId = stmt.listTags.all().find(t => t.slug === 'ai-upscale').id;
}

const content = `
<h2>Giới thiệu về Xưởng Nét</h2>
<p>Công cụ <strong>nâng cấp ảnh AI</strong> của Xưởng Nét sử dụng mô hình học sâu (Deep Learning) <em>Real-ESRGAN</em> tiên tiến nhất hiện nay, giúp bạn biến những bức ảnh mờ, nhòe, bể hạt trở nên sắc nét, rõ ràng chỉ với một cú click chuột.</p>

<p>Trong bài viết này, chúng tôi sẽ hướng dẫn bạn chi tiết từng bước cách sử dụng công cụ để đạt được chất lượng hình ảnh tốt nhất.</p>

<h2>Bước 1: Đăng nhập và nhận Credit</h2>
<p>Để sử dụng các tính năng cao cấp của Xưởng Nét, bạn cần có tài khoản. Mỗi lượt nâng cấp ảnh thành công sẽ trừ một lượng credit tương ứng. Đừng lo, Xưởng Nét tặng bạn credit miễn phí để trải nghiệm ngay khi đăng ký!</p>
<ul>
<li>Truy cập trang <a href="/dang-nhap">Đăng nhập / Đăng ký</a>.</li>
<li>Sau khi đăng nhập, bạn có thể kiểm tra số dư tại trang <strong>Ví Credit</strong>.</li>
<li>Nếu cần dùng nhiều hơn, bạn có thể Nạp tiền qua tài khoản ngân hàng cực kỳ tiện lợi với mã QR Code tự động.</li>
</ul>

<h2>Bước 2: Sử dụng công cụ Nâng Cấp Ảnh AI</h2>
<p>Từ menu chính, chọn <strong>Tính năng</strong> hoặc nhấn vào <a href="/cong-cu-ai">Công cụ AI</a> để mở giao diện nâng cấp ảnh.</p>

<h3>1. Tải ảnh lên</h3>
<p>Click vào khu vực tải ảnh hoặc kéo thả bức ảnh bạn cần làm nét vào khung màn hình. Hệ thống hỗ trợ các định dạng phổ biến như JPG, PNG, WEBP với dung lượng lên đến 10MB.</p>

<p><img src="/images/blog-thumbnail.jpg" alt="Giao diện tải ảnh bằng công cụ Xưởng Nét"></p>

<h3>2. Tùy chỉnh các thông số AI</h3>
<p>Dưới phần ảnh đã tải lên, bạn có thể tuỳ chỉnh cách AI tái tạo lại hình ảnh của mình:</p>
<ul>
<li><strong>Mô hình (Model):</strong> Chọn <code>Real-ESRGAN (Mặc định)</code> cho ảnh chụp thông thường, hoặc các tuỳ chọn anime nếu ảnh của bạn là hình vẽ, hoạt hình.</li>
<li><strong>Khôi phục khuôn mặt (Face Enhance):</strong> Đây là tính năng <em>đột phá</em> của hệ thống. Khi nâng cấp ảnh chân dung, ảnh thẻ hoặc ảnh chụp tập thể, AI sẽ tự động nhận diện và tái tạo lại đôi mắt, khuôn miệng, chân mày... trông vô cùng tự nhiên, khắc phục hoàn toàn hiện tượng mặt bị mờ nhòe. <strong>Nên tick chọn nếu trong ảnh có người!</strong></li>
<li><strong>Tỉ lệ phóng to (Scale):</strong> Mặc định là 2x. Nghĩa là một bức ảnh 500x500px sẽ được phóng to thành 1000x1000px mà vẫn giữ được độ sắc nét. Bạn có thể kéo lên 4x nếu cần xuất ảnh thật lớn để in ấn.</li>
</ul>

<h2>Bước 3: Chờ AI phân tích và tải về</h2>
<p>Sau khi thiết lập, bạn nhấn <strong>"Nâng cấp ảnh ngay"</strong>. AI trên máy chủ đám mây GPU hiệu năng cao của chúng tôi sẽ xử lý thần tốc, thông thường chỉ mất từ 5 - 15 giây.</p>
<p>Bạn sẽ xem được kết quả <strong>Trước / Sau</strong> (Before/After) ngay trên màn hình. Kéo thanh trượt qua lại để so sánh mức độ kỳ diệu mà trí tuệ nhân tạo mang lại.</p>
<p>Cuối cùng, nhấn nút <strong>Tải ảnh về</strong> để lưu hình ảnh chất lượng siêu nét xuống máy tính hoặc điện thoại của bạn.</p>

<hr>
<p><em>Mẹo chuyên gia:</em> Đối với những bức ảnh lưu từ Facebook/Zalo bị nén giảm chất lượng (noise/artifacts), tính năng AI Upscale của Xưởng Nét không chỉ làm nét mà còn có khả năng khử nhiễu (denoise) rất tốt. Hãy tự mình trải nghiệm ngay!</p>
`;

const schema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "Cách nâng cấp ảnh bằng AI sắc nét",
  "description": "Hướng dẫn chi tiết từ A-Z cách sử dụng Xưởng Nét để làm nét ảnh mờ bằng AI.",
  "image": "https://xuongnet.com/images/blog-thumbnail.jpg",
  "step": [
    {
      "@type": "HowToStep",
      "name": "Đăng nhập và nạp Credit",
      "text": "Tạo tài khoản hoặc đăng nhập vào hệ thống Xưởng Nét để nhận credit dùng thử miễn phí."
    },
    {
      "@type": "HowToStep",
      "name": "Tải ảnh lên và tuỳ chỉnh",
      "text": "Tải ảnh mờ lên, chọn mô hình AI Real-ESRGAN, nhớ bật Face Enhance nếu ảnh có mặt người."
    },
    {
      "@type": "HowToStep",
      "name": "Nâng cấp và lưu",
      "text": "Bấm Nâng Cấp và chờ vài giây, sau đó tải ảnh sắc nét về máy."
    }
  ]
};

const postId = savePost({
  title: 'Hướng dẫn nâng cấp ảnh bằng AI chi tiết từ A-Z với Xưởng Nét',
  slug: 'huong-dan-nang-cap-anh-bang-ai-chi-tiet',
  content,
  seo_title: 'Hướng Dẫn Nâng Cấp Ảnh Bằng AI Chi Tiết, Rõ Nét Toàn Diện',
  seo_description: 'Bài viết hướng dẫn chi tiết cách sử dụng công cụ AI để làm nét hình ảnh mờ, phục hồi chi tiết khuôn mặt thành công 100% với Xưởng Nét.',
  focus_keyword: 'nâng cấp ảnh ai',
  schema_json: JSON.stringify(schema, null, 2),
  thumbnail_url: '/images/blog-thumbnail.jpg',
  is_published: 1
}, [catId], [tagId]);

console.log('Thành công! ID bài viết:', postId);
