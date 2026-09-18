import { Router } from 'express';
import { stmt, savePost, db } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

export const postsPublicRouter = Router();
export const postsAdminRouter = Router();
postsAdminRouter.use(requireAuth, requireAdmin);

// ==========================================
// PUBLIC ROUTES
// ==========================================
postsPublicRouter.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = 12;
  const posts = stmt.listPublishedPosts.all(pageSize, (page - 1) * pageSize);
  const total = stmt.countPublishedPosts.get().n;
  res.json({ items: posts, page, pageSize, total });
});

postsPublicRouter.get('/:slug', (req, res) => {
  const post = stmt.findPostBySlug.get(req.params.slug);
  if (!post || post.is_published !== 1) {
    return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  }
  const categories = stmt.getPostCategories.all(post.id);
  const tags = stmt.getPostTags.all(post.id);
  res.json({ ...post, categories, tags });
});

// ==========================================
// ADMIN ROUTES - CATEGORIES & TAGS
// ==========================================
postsAdminRouter.get('/categories', (req, res) => {
  res.json(stmt.listCategories.all());
});
postsAdminRouter.post('/categories', (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Thiếu name hoặc slug' });
  try {
    const info = stmt.insertCategory.run(slug, name);
    res.json({ id: info.lastInsertRowid, slug, name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
postsAdminRouter.delete('/categories/:id', (req, res) => {
  stmt.deleteCategory.run(req.params.id);
  res.json({ success: true });
});

postsAdminRouter.get('/tags', (req, res) => {
  res.json(stmt.listTags.all());
});
postsAdminRouter.post('/tags', (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Thiếu name hoặc slug' });
  try {
    const info = stmt.insertTag.run(slug, name);
    res.json({ id: info.lastInsertRowid, slug, name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
postsAdminRouter.delete('/tags/:id', (req, res) => {
  stmt.deleteTag.run(req.params.id);
  res.json({ success: true });
});

// ==========================================
// ADMIN ROUTES - POSTS
// ==========================================
postsAdminRouter.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = 20;
  const posts = stmt.listPosts.all(pageSize, (page - 1) * pageSize);
  const total = stmt.countPosts.get().n;
  res.json({ items: posts, page, pageSize, total });
});

postsAdminRouter.get('/:id', (req, res) => {
  const post = stmt.findPostById.get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Không tìm thấy bài viết' });
  post.categories = stmt.getPostCategories.all(post.id).map(c => c.id);
  post.tags = stmt.getPostTags.all(post.id).map(t => t.id);
  res.json(post);
});

postsAdminRouter.post('/', (req, res) => {
  try {
    const { categories, tags, ...postData } = req.body;
    if (!postData.slug || !postData.title) return res.status(400).json({ error: 'Thiếu tiêu đề hoặc slug' });
    
    // Set defaults if empty
    postData.content = postData.content || '';
    postData.seo_title = postData.seo_title || '';
    postData.seo_description = postData.seo_description || '';
    postData.focus_keyword = postData.focus_keyword || '';
    postData.schema_json = postData.schema_json || '';
    postData.thumbnail_url = postData.thumbnail_url || '';
    postData.is_published = postData.is_published ? 1 : 0;
    
    const id = savePost(postData, categories || [], tags || []);
    res.json({ success: true, id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

postsAdminRouter.put('/:id', (req, res) => {
  try {
    const { categories, tags, ...postData } = req.body;
    postData.id = req.params.id;
    if (!postData.slug || !postData.title) return res.status(400).json({ error: 'Thiếu tiêu đề hoặc slug' });
    
    postData.is_published = postData.is_published ? 1 : 0;
    savePost(postData, categories || [], tags || []);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

postsAdminRouter.delete('/:id', (req, res) => {
  stmt.deletePost.run(req.params.id);
  res.json({ success: true });
});
