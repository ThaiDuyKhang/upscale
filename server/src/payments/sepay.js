// Tích hợp SePay — dựa theo tài liệu chính thức tại developer.sepay.vn
// (mục "SePay Webhooks"). Payload SePay POST tới endpoint của bạn có dạng:
//
// {
//   "id": 92704,                          // ID giao dịch trên SePay
//   "gateway": "Vietcombank",             // tên ngân hàng
//   "transactionDate": "2024-07-25 14:02:37",
//   "accountNumber": "0123499999",
//   "code": null,                         // mã thanh toán SePay tự nhận diện (theo cấu hình "Cấu trúc mã thanh toán")
//   "content": "chuyen tien mua iphone",  // toàn bộ nội dung chuyển khoản khách hàng nhập/quét
//   "transferType": "in",                 // "in" = tiền vào, "out" = tiền ra
//   "transferAmount": 2277000,
//   "accumulated": 19077000,
//   "subAccount": null,
//   "referenceCode": "MBVCB.3278907687",
//   "description": ""
// }
//
// Xác thực: SePay hỗ trợ 4 kiểu (không xác thực / API Key / HMAC-SHA256 / OAuth2).
// File này dùng kiểu "API Key" — đơn giản, đủ an toàn nếu endpoint chạy qua HTTPS.
// Cấu hình cùng giá trị SEPAY_WEBHOOK_APIKEY ở cả .env và trong SePay Dashboard
// (Tích hợp > Webhooks > Bảo mật > API Key).

export function verifySePayAuth(req) {
  const expected = process.env.SEPAY_WEBHOOK_APIKEY;
  if (!expected) return false;
  const header = req.headers['authorization'] || '';
  // SePay gửi header dạng: Authorization: Apikey <API_KEY>
  const match = header.match(/^Apikey\s+(.+)$/i);
  const provided = match ? match[1].trim() : null;
  return provided === expected;
}

// Tìm mã thanh toán (payment code) mà hệ thống của bạn đã sinh ra, nằm trong
// nội dung chuyển khoản. Ưu tiên field "code" nếu SePay đã tự nhận diện được
// (cần bật đúng "Cấu trúc mã thanh toán" trong SePay Dashboard khớp với
// tiền tố bạn dùng khi sinh code — xem generateDepositCode() ở routes/wallet.js).
// Nếu "code" là null, dò thủ công trong "content".
export function extractPaymentCode(payload, candidateCodes) {
  if (payload.code && candidateCodes.includes(payload.code)) return payload.code;
  const content = (payload.content || '') + ' ' + (payload.description || '');
  for (const c of candidateCodes) {
    if (content.includes(c)) return c;
  }
  return null;
}
