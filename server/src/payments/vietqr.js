// Tạo ảnh QR chuyển khoản VietQR bằng dịch vụ public của img.vietqr.io — miễn phí,
// không cần đăng ký hay API key, hoạt động độc lập với việc bạn dùng SePay hay Pay2S
// để NHẬN thông báo thanh toán (webhook). Nói cách khác: ảnh QR và webhook xác nhận
// là hai việc tách rời nhau.
//
// Định dạng: https://img.vietqr.io/image/{BANK_BIN}-{SO_TAI_KHOAN}-{TEMPLATE}.png
//            ?amount=...&addInfo=...&accountName=...
//
// Tra mã BIN ngân hàng của bạn tại: https://www.vietqr.io/danh-sach-ngan-hang-hien-thi-logo/

export function buildVietQrImageUrl({ amountVnd, content }) {
  const bin = process.env.BANK_BIN;
  const account = process.env.BANK_ACCOUNT_NUMBER;
  const accountName = process.env.BANK_ACCOUNT_NAME;
  if (!bin || !account) {
    throw new Error('Chưa cấu hình BANK_BIN / BANK_ACCOUNT_NUMBER trong .env.');
  }
  const template = 'compact2';
  const params = new URLSearchParams({
    amount: String(amountVnd),
    addInfo: content,
    accountName: accountName || '',
  });
  return `https://img.vietqr.io/image/${bin}-${account}-${template}.png?${params.toString()}`;
}
