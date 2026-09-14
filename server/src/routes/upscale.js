import { Router } from 'express';
import { stmt, creditUser, getSetting } from '../db.js';
import { requireAuth } from '../auth.js';

export const upscaleRouter = Router();
upscaleRouter.use(requireAuth);

const REPLICATE_BASE = 'https://api.replicate.com/v1';

function replicateHeaders() {
  return {
    'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function createPrediction(input) {
  const model = process.env.REPLICATE_MODEL;
  let url, body;
  if (model.includes(':')) {
    url = `${REPLICATE_BASE}/predictions`;
    body = { version: model, input };
  } else {
    url = `${REPLICATE_BASE}/models/${model}/predictions`;
    body = { input };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...replicateHeaders(), 'Prefer': 'wait' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Replicate trả lỗi ${res.status}`);
  return data;
}

async function pollPrediction(getUrl) {
  const maxAttempts = 40;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(getUrl, { headers: replicateHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || `Replicate trả lỗi ${res.status}`);
    if (data.status === 'succeeded') return data;
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(data.error || `Prediction ${data.status}`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('Hết thời gian chờ mô hình xử lý.');
}

function extractOutputUrl(prediction) {
  const out = prediction.output;
  if (!out) return null;
  if (typeof out === 'string') return out;
  if (Array.isArray(out) && out.length) return out[out.length - 1];
  return null;
}

upscaleRouter.post('/', async (req, res) => {
  const userId = req.user.sub;
  const user = stmt.findUserById.get(userId);
  const isAdmin = user.role === 'admin';
  const cost = parseInt(getSetting('credits_per_upscale') || '5', 10);

  if (!isAdmin && user.credits < cost) {
    return res.status(402).json({ error: `Không đủ credit. Cần ${cost} credit, bạn còn ${user.credits}.`, required: cost, balance: user.credits });
  }
  if (!process.env.REPLICATE_API_TOKEN || !process.env.REPLICATE_MODEL) {
    return res.status(500).json({ error: 'Server chưa được cấu hình REPLICATE_API_TOKEN / REPLICATE_MODEL.' });
  }

  const { image, scale, face_enhance } = req.body || {};
  if (!image || typeof image !== 'string' || !image.startsWith('data:image')) {
    return res.status(400).json({ error: 'Thiếu ảnh hợp lệ (cần data URL base64).' });
  }

  try {
    let prediction = await createPrediction({ image, scale: scale || 4, face_enhance: !!face_enhance });
    if (prediction.status !== 'succeeded') {
      prediction = await pollPrediction(prediction.urls.get);
    }
    const outputUrl = extractOutputUrl(prediction);
    if (!outputUrl) throw new Error('Mô hình không trả về ảnh kết quả.');

    // Chỉ trừ credit khi xử lý THÀNH CÔNG — nếu Replicate lỗi, người dùng không bị mất credit.
    // Admin không bị trừ credit.
    if (!isAdmin) {
      creditUser({ userId, delta: -cost, type: 'usage', status: 'completed', provider: 'replicate', note: 'Nâng cấp ảnh AI' });
    }
    stmt.insertUsage.run({
      user_id: userId, credits_charged: isAdmin ? 0 : cost, scale: scale || 4,
      face_enhance: face_enhance ? 1 : 0, status: 'succeeded', output_url: outputUrl, error: null,
    });

    const updatedUser = stmt.findUserById.get(userId);
    res.json({ outputUrl, creditsCharged: isAdmin ? 0 : cost, creditsRemaining: updatedUser.credits });
  } catch (err) {
    stmt.insertUsage.run({
      user_id: userId, credits_charged: 0, scale: scale || 4,
      face_enhance: face_enhance ? 1 : 0, status: 'failed', output_url: null, error: err.message,
    });
    res.status(502).json({ error: err.message || 'Lỗi không xác định khi gọi mô hình AI.' });
  }
});
