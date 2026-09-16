// Xác thực Google ID Token qua Google TokenInfo endpoint.
// Nhẹ, không cần cài thư viện (google-auth-library) — phù hợp dự án Lean Architecture.

/**
 * Xác thực Google Credential (ID Token) và trả về thông tin người dùng.
 * @param {string} credential - Google ID Token từ Google Sign-In button
 * @returns {{ sub: string, email: string, name: string, picture: string }}
 */
export async function verifyGoogleToken(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('Server chưa cấu hình GOOGLE_CLIENT_ID trong .env.');
  }

  // Gọi Google TokenInfo API — Google tự xác thực chữ ký và thời hạn token
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error_description || 'Google token không hợp lệ hoặc đã hết hạn.');
  }

  // Kiểm tra token được cấp đúng cho ứng dụng này
  if (data.aud !== clientId) {
    throw new Error('Token Google không khớp với Client ID của ứng dụng này.');
  }
  if (!data.email_verified || data.email_verified === 'false') {
    throw new Error('Email Google chưa được xác minh.');
  }

  return {
    sub: data.sub,
    email: data.email,
    name: data.name || '',
    picture: data.picture || '',
  };
}
