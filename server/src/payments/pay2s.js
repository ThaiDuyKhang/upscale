// Tích hợp Pay2S — CẢNH BÁO QUAN TRỌNG:
//
// Khác với SePay (đã lấy được payload webhook chính xác từ tài liệu công khai),
// tài liệu Pay2S mà tôi tiếp cận được (docs.pay2s.vn) chỉ mô tả Ở MỨC KHÁI NIỆM:
// bạn có Partner Code / Access Key / Secret Key, gọi API tạo "link thanh toán",
// và Pay2S gửi IPN (webhook) về ipnUrl kèm trans_id + mã đơn hàng do bạn tự đặt.
// Tôi KHÔNG có tên field chính xác trong JSON body của IPN đó (ví dụ tên field
// chứa số tiền, trạng thái, chữ ký... có thể khác với đoán bên dưới).
//
// => TRƯỚC KHI DÙNG THẬT: đăng nhập docs.pay2s.vn (mục "Tích hợp kỹ thuật" /
//    "IPN") lấy đúng tên field và cách tính chữ ký, rồi sửa 2 hàm bên dưới.
//    Code này chỉ là khung sườn để bạn cắm vào, KHÔNG nên bật lên production
//    nếu chưa đối chiếu lại.
//
// Vì lý do đó, khuyến nghị: dùng SePay làm cổng chính (đã kiểm chứng), để Pay2S
// làm phương án dự phòng sau khi bạn tự xác nhận lại tài liệu mới nhất.

import crypto from 'node:crypto';

export function verifyPay2sSignature(body) {
  const secretKey = process.env.PAY2S_SECRET_KEY;
  if (!secretKey) return false;
  const providedSignature = body.signature || body.sign || null;
  if (!providedSignature) return false;

  // Giả định phổ biến ở các cổng kiểu này: ký HMAC-SHA256 trên chuỗi các trường
  // đã sort theo tên key, nối bằng "&". CẦN xác nhận lại với tài liệu Pay2S
  // xem chính xác họ ký trên những field nào, theo thứ tự nào.
  const { signature, sign, ...rest } = body;
  const canonical = Object.keys(rest).sort()
    .map(k => `${k}=${rest[k]}`)
    .join('&');
  const expected = crypto.createHmac('sha256', secretKey).update(canonical).digest('hex');
  return expected === providedSignature;
}

export function extractPay2sTransaction(body) {
  // Tên field dưới đây là suy đoán hợp lý dựa trên mô tả khái niệm của Pay2S —
  // hãy đối chiếu lại với payload IPN thật (in ra console.log(body) khi test)
  // rồi chỉnh lại cho khớp.
  return {
    orderCode: body.orderCode || body.order_code || body.orderId || null,
    transId: body.trans_id || body.transId || null,
    amount: Number(body.amount || body.transferAmount || 0),
    status: body.status || body.transferType || null,
  };
}
