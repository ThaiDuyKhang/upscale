import { Router } from 'express';
import { stmt, creditUser, getSetting } from '../db.js';
import { requireAuth } from '../auth.js';

export const upscaleRouter = Router();
upscaleRouter.use(requireAuth);

const REPLICATE_BASE = 'https://api.replicate.com/v1';

// ─── GFPGAN config ───────────────────────────────────────────────────────────
// tencentarc/gfpgan API — 3 input params:
//   img     (string uri)                            — required  (NOTE: "img" not "image")
//   scale   (number)                                — default 2 (khuyên 1–4)
//   version ("v1.2"|"v1.3"|"v1.4"|"RestoreFormer") — default "v1.4"
// Pinned version ID (2024-03-14):
//   0fbacf7afc6c144e5be9767cff80f25aff23e52b0708f17e20f9879b2f21516c
// ─────────────────────────────────────────────────────────────────────────────
const GFPGAN_VERSION = '0fbacf7afc6c144e5be9767cff80f25aff23e52b0708f17e20f9879b2f21516c';
const GFPGAN_VALID_VERSIONS = ['v1.2', 'v1.3', 'v1.4', 'RestoreFormer'];

function replicateHeaders() {
  return {
    'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function callReplicate(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...replicateHeaders(), 'Prefer': 'wait' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Replicate error ${res.status}`);
  return data;
}

async function pollPrediction(getUrl) {
  const maxAttempts = 40; // 40 × 3s = 2 phút
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(getUrl, { headers: replicateHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || `Replicate error ${res.status}`);
    if (data.status === 'succeeded') return data;
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(data.error || `Prediction ${data.status}`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('Hết thời gian chờ mô hình xử lý (2 phút).');
}

async function runPrediction(input, modelOrVersion, isVersion = false) {
  let url, body;
  if (isVersion || modelOrVersion.includes(':')) {
    const version = modelOrVersion.includes(':') ? modelOrVersion.split(':')[1] : modelOrVersion;
    url = `${REPLICATE_BASE}/predictions`;
    body = { version, input };
  } else {
    url = `${REPLICATE_BASE}/models/${modelOrVersion}/predictions`;
    body = { input };
  }

  let prediction = await callReplicate(url, body);
  if (prediction.status !== 'succeeded') {
    if (!prediction.urls?.get) throw new Error('Không nhận được URL để poll kết quả.');
    prediction = await pollPrediction(prediction.urls.get);
  }
  return prediction;
}

function extractOutputUrl(prediction) {
  const out = prediction.output;
  if (!out) return null;
  if (typeof out === 'string') return out;
  if (Array.isArray(out) && out.length) return out[out.length - 1];
  return null;
}

// ─── Real-ESRGAN route ────────────────────────────────────────────────────────
upscaleRouter.post('/', async (req, res) => {
  const userId = req.user.sub;
  const user = stmt.findUserById.get(userId);
  if (!user) return res.status(404).json({ error: 'User không tồn tại.' });
  if (user.is_banned) return res.status(403).json({ error: 'Tài khoản bị khoá.' });

  const isAdmin = user.role === 'admin';
  const cost = parseInt(getSetting('credits_per_upscale') || '5', 10);

  if (!isAdmin && user.credits < cost) {
    return res.status(402).json({
      error: `Không đủ credit. Cần ${cost} credit, bạn còn ${user.credits}.`,
      required: cost,
      balance: user.credits,
    });
  }

  if (!process.env.REPLICATE_API_TOKEN) {
    return res.status(500).json({ error: 'Server chưa cấu hình REPLICATE_API_TOKEN.' });
  }
  if (!process.env.REPLICATE_MODEL) {
    return res.status(500).json({ error: 'Server chưa cấu hình REPLICATE_MODEL.' });
  }

  const { image, scale, face_enhance } = req.body || {};

  // Validate input
  if (!image || typeof image !== 'string' || !image.startsWith('data:image')) {
    return res.status(400).json({ error: 'Thiếu ảnh hợp lệ (cần data URL base64).' });
  }

  // Clamp scale theo API spec: 0–10, default 4
  const scaleNum = Math.min(10, Math.max(0.5, parseFloat(scale) || 4));

  const replicateInput = {
    image,
    scale: scaleNum,
    face_enhance: !!face_enhance,
  };

  const modelUsed = process.env.REPLICATE_MODEL || 'nightmareai/real-esrgan';

  try {
    const prediction = await runPrediction(replicateInput, modelUsed);

    const outputUrl = extractOutputUrl(prediction);
    if (!outputUrl) throw new Error('Mô hình không trả về ảnh kết quả.');

    // Trừ credit khi xử lý THÀNH CÔNG
    if (!isAdmin) {
      creditUser({
        userId,
        delta: -cost,
        type: 'usage',
        status: 'completed',
        provider: 'replicate',
        note: `AI Upscale ${scaleNum}x${face_enhance ? ' + FaceEnhance' : ''}`,
      });
    }

    stmt.insertUsage.run({
      user_id: userId,
      credits_charged: isAdmin ? 0 : cost,
      scale: scaleNum,
      face_enhance: face_enhance ? 1 : 0,
      detail_level: 0,
      repair_text: 0,
      repair_level: 0,
      model_used: modelUsed,
      status: 'succeeded',
      output_url: outputUrl,
      error: null,
    });

    const updatedUser = stmt.findUserById.get(userId);
    res.json({
      outputUrl,
      creditsCharged: isAdmin ? 0 : cost,
      creditsRemaining: updatedUser.credits,
      modelUsed,
      scale: scaleNum,
      face_enhance: !!face_enhance,
      predict_time: prediction.metrics?.predict_time,
    });

  } catch (err) {
    // Log thất bại nhưng KHÔNG trừ credit
    try {
      stmt.insertUsage.run({
        user_id: userId,
        credits_charged: 0,
        scale: scaleNum,
        face_enhance: face_enhance ? 1 : 0,
        detail_level: 0,
        repair_text: 0,
        repair_level: 0,
        model_used: modelUsed,
        status: 'failed',
        output_url: null,
        error: err.message,
      });
    } catch (_) {}
    res.status(502).json({ error: err.message || 'Lỗi không xác định khi gọi mô hình AI.' });
  }
});

// ─── GFPGAN route ─────────────────────────────────────────────────────────────
upscaleRouter.post('/gfpgan', async (req, res) => {
  const userId = req.user.sub;
  const user = stmt.findUserById.get(userId);
  if (!user) return res.status(404).json({ error: 'User không tồn tại.' });
  if (user.is_banned) return res.status(403).json({ error: 'Tài khoản bị khoá.' });

  const isAdmin = user.role === 'admin';
  const cost = parseInt(getSetting('credits_per_upscale') || '5', 10);

  if (!isAdmin && user.credits < cost) {
    return res.status(402).json({
      error: `Không đủ credit. Cần ${cost} credit, bạn còn ${user.credits}.`,
      required: cost,
      balance: user.credits,
    });
  }

  if (!process.env.REPLICATE_API_TOKEN) {
    return res.status(500).json({ error: 'Server chưa cấu hình REPLICATE_API_TOKEN.' });
  }

  const { image, scale, version } = req.body || {};

  if (!image || typeof image !== 'string' || !image.startsWith('data:image')) {
    return res.status(400).json({ error: 'Thiếu ảnh hợp lệ (cần data URL base64).' });
  }

  // GFPGAN scale: 1–4 (vượt quá 4 chất lượng giảm mạnh)
  const scaleNum = Math.min(4, Math.max(1, parseFloat(scale) || 2));

  // Validate phiên bản GFPGAN
  const gfpVersion = GFPGAN_VALID_VERSIONS.includes(version) ? version : 'v1.4';

  const modelId = `tencentarc/gfpgan:${GFPGAN_VERSION}`;

  const replicateInput = {
    img: image,           // GFPGAN dùng "img", không phải "image"
    scale: scaleNum,
    version: gfpVersion,
  };

  try {
    const prediction = await runPrediction(replicateInput, GFPGAN_VERSION, true);

    const outputUrl = extractOutputUrl(prediction);
    if (!outputUrl) throw new Error('Mô hình không trả về ảnh kết quả.');

    if (!isAdmin) {
      creditUser({
        userId,
        delta: -cost,
        type: 'usage',
        status: 'completed',
        provider: 'replicate',
        note: `GFPGAN ${gfpVersion} ${scaleNum}x`,
      });
    }

    stmt.insertUsage.run({
      user_id: userId,
      credits_charged: isAdmin ? 0 : cost,
      scale: scaleNum,
      face_enhance: 1, // GFPGAN luôn là face restoration
      detail_level: 0,
      repair_text: 0,
      repair_level: 0,
      model_used: modelId,
      status: 'succeeded',
      output_url: outputUrl,
      error: null,
    });

    const updatedUser = stmt.findUserById.get(userId);
    res.json({
      outputUrl,
      creditsCharged: isAdmin ? 0 : cost,
      creditsRemaining: updatedUser.credits,
      modelUsed: modelId,
      scale: scaleNum,
      version: gfpVersion,
      predict_time: prediction.metrics?.predict_time,
    });

  } catch (err) {
    try {
      stmt.insertUsage.run({
        user_id: userId,
        credits_charged: 0,
        scale: scaleNum,
        face_enhance: 1,
        detail_level: 0,
        repair_text: 0,
        repair_level: 0,
        model_used: modelId,
        status: 'failed',
        output_url: null,
        error: err.message,
      });
    } catch (_) {}
    res.status(502).json({ error: err.message || 'Lỗi không xác định khi gọi mô hình AI.' });
  }
});
