import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllSettings } from './db.js';

import { authRouter } from './routes/auth.js';
import { walletRouter } from './routes/wallet.js';
import { webhookRouter } from './routes/webhooks.js';
import { upscaleRouter } from './routes/upscale.js';
import { adminRouter } from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '15mb' })); // ảnh base64 khá nặng
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/webhooks', webhookRouter);
app.use('/api/upscale', upscaleRouter);
app.use('/api/admin', adminRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/api/public/settings', (req, res) => {
  const settings = getAllSettings();
  res.json({
    vnd_per_credit: settings.vnd_per_credit,
    credits_per_upscale: settings.credits_per_upscale
  });
});

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://xuongnet.com/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>https://xuongnet.com/features</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>https://xuongnet.com/pricing</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>https://xuongnet.com/contact</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>
</urlset>`);
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /profile
Disallow: /admin
Disallow: /api/

Sitemap: https://xuongnet.com/sitemap.xml`);
});

// Phục vụ luôn frontend tĩnh — cùng origin với API nên cookie phiên đăng nhập
// hoạt động ngay, không cần cấu hình CORS.
const publicDir = path.join(__dirname, '..', '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`Xưởng Nét đang chạy tại http://localhost:${PORT}`);
});
