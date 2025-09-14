import express from 'express';
import path from 'path';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import fs from 'fs';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import cookie from 'cookie';
import multer from 'multer';

const app = express();
let PORT = process.env.PORT || 3001;
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

// PostgreSQL bağlantısı
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/ev_problems',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Multer storage for media (images/audio/video)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
  const safeExt = ['.jpg','.jpeg','.png','.webp','.gif','.mp3','.wav','.ogg','.m4a','.mp4','.webm','.mov'].includes(ext) ? ext : '.bin';
    cb(null, Date.now()+ '_' + Math.random().toString(36).slice(2) + safeExt);
  }
});
// Image-only uploader (legacy photos endpoint)
const uploadImages = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if(/image\/(png|jpe?g|webp|gif)/i.test(file.mimetype)) cb(null,true); else cb(new Error('Geçersiz dosya türü (yalnızca görsel)'));
  }
});
// Generic media uploader (image/audio/video)
const uploadAny = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if(/^(image\/(png|jpe?g|webp|gif)|audio\/(mpeg|mp3|wav|ogg|m4a)|video\/(mp4|webm|ogg|quicktime))$/i.test(file.mimetype)) cb(null,true); else cb(new Error('Desteklenmeyen medya türü'));
  }
});

let db = pool; // PostgreSQL pool instance

// Statik / önerilen marka-model listesi (popüler EV araçları)
const predefinedBrandModels = [
  { brand: 'Tesla', models: ['Model S', 'Model 3', 'Model X', 'Model Y'] },
  { brand: 'Renault', models: ['ZOE', 'Megane E-Tech'] },
  { brand: 'Hyundai', models: ['IONIQ 5', 'IONIQ 6', 'Kona Electric'] },
  { brand: 'Kia', models: ['EV6', 'Niro EV'] },
  { brand: 'BMW', models: ['i3', 'i4', 'iX', 'iX3'] },
  { brand: 'Mercedes', models: ['EQA', 'EQB', 'EQC', 'EQS'] },
  { brand: 'Volkswagen', models: ['ID.3', 'ID.4', 'ID.5'] },
  { brand: 'Audi', models: ['e-tron', 'Q4 e-tron'] },
  { brand: 'Nissan', models: ['Leaf', 'Ariya'] },
  { brand: 'BYD', models: ['Atto 3', 'Han', 'Seal'] }
];

// Arıza türleri listesi
const issueTypes = [
  'Batarya menzil düşüşü',
  'Şarj olmuyor / yavaş şarj',
  'Şarj portu arızası',
  'Hızlı şarj uyumsuzluğu',
  'Yazılım güncelleme hatası',
  'Multimedya / ekran donması',
  'Isı pompası problemi',
  'Rejeneratif frenleme sorunu',
  'Motor / inverter arızası',
  'Sensör kalibrasyon / ADAS',
  'Gürültü / titreşim',
  'Klima performans düşüşü',
  'Direksiyon / sürüş destek hatası'
];

// PostgreSQL Database Functions
async function initDatabase() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        owned_brand TEXT,
        owned_model TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS vehicles (
        id SERIAL PRIMARY KEY,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        km INTEGER,
        model_year INTEGER,
        UNIQUE(brand, model)
      );
      
      CREATE TABLE IF NOT EXISTS issues (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
        title TEXT NOT NULL,
        issue_type TEXT,
        description TEXT NOT NULL,
        solution TEXT,
        service_experience TEXT,
        issue_location TEXT,
        status TEXT DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS user_vehicles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        km INTEGER,
        model_year INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        issue_id INTEGER NOT NULL REFERENCES issues(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS issue_photos (
        id SERIAL PRIMARY KEY,
        issue_id INTEGER NOT NULL REFERENCES issues(id),
        filename TEXT NOT NULL,
        original_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS issue_attachments (
        id SERIAL PRIMARY KEY,
        issue_id INTEGER NOT NULL REFERENCES issues(id),
        filename TEXT NOT NULL,
        original_name TEXT,
        mime TEXT,
        kind TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS issue_updates (
        id SERIAL PRIMARY KEY,
        issue_id INTEGER NOT NULL REFERENCES issues(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS issue_update_attachments (
        id SERIAL PRIMARY KEY,
        update_id INTEGER NOT NULL REFERENCES issue_updates(id),
        filename TEXT NOT NULL,
        original_name TEXT,
        mime TEXT,
        kind TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS issue_followers (
        user_id INTEGER NOT NULL REFERENCES users(id),
        issue_id INTEGER NOT NULL REFERENCES issues(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, issue_id)
      );
      
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        issue_id INTEGER NOT NULL REFERENCES issues(id),
        type TEXT NOT NULL,
        payload TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP
      );
    `);
    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

async function query(text, params = []) {
  const result = await db.query(text, params);
  return result.rows;
}

async function queryOne(text, params = []) {
  const result = await db.query(text, params);
  return result.rows[0] || null;
}

// --- Notifications helper ---
async function notifyFollowers(issueId, actorUserId, type, payload){
  try{
    const followers = await query('SELECT user_id FROM issue_followers WHERE issue_id = $1 AND user_id != $2', [issueId, actorUserId]);
    if(!followers.length) return;
    const p = typeof payload === 'string' ? payload : JSON.stringify(payload||{});
    for(const follower of followers) {
      try { 
        await query('INSERT INTO notifications (user_id, issue_id, type, payload) VALUES ($1,$2,$3,$4)', [follower.user_id, issueId, String(type), p]); 
      } catch(_e){}
    }
  }catch(e){ console.warn('notifyFollowers failed', e.message); }
}

app.use(helmet({
  contentSecurityPolicy: false // Allow inline styles and external resources
}));
app.use(cors({
  origin: true, // Allow all origins for local development
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(process.cwd(), 'public')));

// Disable caching for API responses to avoid 304 with empty bodies breaking fetch logic
app.use((req,res,next)=>{
  if(req.path.startsWith('/api/')){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Pragma','no-cache');
    res.setHeader('Expires','0');
  }
  next();
});

// ---- Auth Helpers ----
async function createSession(userId){
  const id = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 1000*60*60*24*7); // 7 gün
  await query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1,$2,$3)', [id, userId, expires.toISOString()]);
  return { id, expires };
}
async function getSession(sessionId){
  if(!sessionId) return null;
  const row = await queryOne('SELECT * FROM sessions WHERE id = $1', [sessionId]);
  if(!row) return null;
  if(row.expires_at && new Date(row.expires_at) < new Date()) { 
    await query('DELETE FROM sessions WHERE id = $1', [sessionId]); 
    return null; 
  }
  return row;
}
async function currentUser(req){
  const cookieHeader = req.headers.cookie;
  if(!cookieHeader) return null;
  const parsed = cookie.parse(cookieHeader);
  if(!parsed.sid) return null;
  const sess = await getSession(parsed.sid);
  if(!sess) return null;
  return await queryOne('SELECT id, username, owned_brand, owned_model FROM users WHERE id = $1', [sess.user_id]);
}
async function requireAuth(req, res){
  const u = await currentUser(req);
  if(!u) { res.status(401).json({ error: 'Giriş gerekli' }); return null; }
  return u;
}

async function getOrCreateUser(username) {
  const found = await queryOne('SELECT id FROM users WHERE username = $1', [username]);
  if (found) return found.id;
  await query('INSERT INTO users (username) VALUES ($1)', [username]);
  const created = await queryOne('SELECT id FROM users WHERE username = $1', [username]);
  return created.id;
}
async function getOrCreateVehicle(brand, model) {
  const found = await queryOne('SELECT id FROM vehicles WHERE brand = $1 AND model = $2', [brand, model]);
  if (found) return found.id;
  await query('INSERT INTO vehicles (brand, model) VALUES ($1, $2)', [brand, model]);
  const created = await queryOne('SELECT id FROM vehicles WHERE brand = $1 AND model = $2', [brand, model]);
  return created.id;
}

app.get('/api/vehicles', (req, res) => {
  const rows = all('SELECT id, brand, model FROM vehicles ORDER BY brand, model');
  res.json(rows);
});

app.post('/api/issues', (req, res) => {
  const user = requireAuth(req, res); if(!user) return;
  const { brand, model, title, description, issue_type, solution, service_experience, issue_location } = req.body;
  if (!brand || !model || !title || !description) {
    return res.status(400).json({ error: 'brand, model, title, description required' });
  }
  try {
    console.log('[issues][POST] incoming', { user:user.username, brand, model, titleLen: title?.length, descLen: description?.length, issue_type });
    const userId = user.id;
    const vehicleId = getOrCreateVehicle(brand.trim(), model.trim());
    let newId = null;
    try {
      // sanitize and cap location payload length
      let locStr = null;
      if (typeof issue_location === 'string' && issue_location.trim()) {
        const trimmed = issue_location.trim();
        // limit to 8KB to avoid abuse
        locStr = trimmed.slice(0, 8192);
      }
      run('INSERT INTO issues (user_id, vehicle_id, title, issue_type, description, solution, service_experience, issue_location) VALUES (?,?,?,?,?,?,?,?)', [userId, vehicleId, title.trim(), issue_type?.trim() || null, description.trim(), solution?.trim() || null, service_experience?.trim() || null, locStr]);
      // Attempt primary retrieval via last_insert_rowid
      const lastRaw = get('SELECT last_insert_rowid() AS id');
      if(lastRaw && lastRaw.id && lastRaw.id !== 0){ newId = lastRaw.id; }
      if(!newId){
        // Fallback: match on unique tuple for most recent by this user/vehicle/title
        const probe = get('SELECT id FROM issues WHERE user_id = ? AND vehicle_id = ? AND title = ? ORDER BY id DESC LIMIT 1', [userId, vehicleId, title.trim()]);
        if(probe) newId = probe.id;
      }
      if(!newId){
        const maxRow = get('SELECT id FROM issues ORDER BY id DESC LIMIT 1');
        if(maxRow) newId = maxRow.id;
      }
    } catch (insErr) {
      console.error('[issues][POST] insert error', insErr);
      return res.status(500).json({ error: 'insert_failed', detail: String(insErr.message||insErr) });
    }
    if(!newId){
      console.error('[issues][POST] could not resolve new issue id after insert');
      return res.status(500).json({ error:'post_insert_id_unresolved' });
    }
    let issue=null;
    try {
  issue = get(`SELECT issues.*, users.username, vehicles.brand, vehicles.model, vehicles.model_year, vehicles.km,
        (SELECT COUNT(*) FROM comments c WHERE c.issue_id = issues.id) AS comment_count,
  (SELECT COUNT(*) FROM issue_updates iu WHERE iu.issue_id = issues.id) AS update_count,
        (SELECT COUNT(*) FROM issue_photos ip WHERE ip.issue_id = issues.id) AS photo_count,
        ((SELECT COUNT(*) FROM issue_photos ip2 WHERE ip2.issue_id = issues.id) + (SELECT COUNT(*) FROM issue_attachments ia2 WHERE ia2.issue_id = issues.id)) AS media_count
        FROM issues 
        LEFT JOIN users ON users.id = issues.user_id 
        LEFT JOIN vehicles ON vehicles.id = issues.vehicle_id 
        WHERE issues.id = ?`, [newId]);
    } catch (selErr) {
      console.error('[issues][POST] select-after-insert error', selErr);
      return res.status(500).json({ error: 'select_failed', detail: String(selErr.message||selErr) });
    }
    if(!issue){
      console.warn('[issues][POST] join select empty, fallback composing new issue id=', newId);
      const bare = get('SELECT * FROM issues WHERE id = ?', [newId]);
      if(bare){
        const urow = get('SELECT username FROM users WHERE id = ?', [bare.user_id]);
        const vrow = get('SELECT brand, model FROM vehicles WHERE id = ?', [bare.vehicle_id]);
  issue = { ...bare, username: urow?.username || '(user?)', brand: vrow?.brand || '(brand?)', model: vrow?.model || '(model?)', comment_count:0, photo_count:0, media_count:0 };
      }
    }
    if(!issue){
      console.error('[issues][POST] insert verification failed final. id=', newId);
      return res.status(500).json({ error:'insert_verification_failed', id: newId });
    }
    console.log('[issues][POST] created issue id', issue.id);
    res.status(201).json(issue);
  } catch(e){
    console.error('[issues][POST] unexpected error', e);
    res.status(500).json({ error:'unexpected', detail: String(e.message||e) });
  }
});

app.get('/api/issues', (req, res) => {
  const { brand, model, q, issue_type, user, page = '1', pageSize = '20' } = req.query;
  const p = Math.max(parseInt(page,10)||1,1);
  const ps = Math.min(Math.max(parseInt(pageSize,10)||20,1),100);
  let base = 'FROM issues JOIN users ON users.id = issues.user_id JOIN vehicles ON vehicles.id = issues.vehicle_id';
  const where = [];
  const params = [];
  if (brand) { where.push('vehicles.brand = ?'); params.push(brand); }
  if (model) { where.push('vehicles.model = ?'); params.push(model); }
  if (issue_type) { where.push('issues.issue_type = ?'); params.push(issue_type); }
  if (user) { where.push('users.username = ?'); params.push(user); }
  if (q) { where.push('(issues.title LIKE ? OR issues.description LIKE ? OR issues.solution LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  let whereSql = where.length ? (' WHERE ' + where.join(' AND ')) : '';
  const totalRow = get(`SELECT COUNT(*) as cnt ${base}${whereSql}`, params);
  const total = totalRow ? totalRow.cnt : 0;
  const offset = (p-1)*ps;
  const rows = all(`SELECT issues.*, users.username, vehicles.brand, vehicles.model, vehicles.model_year, vehicles.km,
    (SELECT COUNT(*) FROM comments c WHERE c.issue_id = issues.id) AS comment_count,
  (SELECT COUNT(*) FROM issue_updates iu WHERE iu.issue_id = issues.id) AS update_count,
    (SELECT COUNT(*) FROM issue_photos ip WHERE ip.issue_id = issues.id) AS photo_count,
    ((SELECT COUNT(*) FROM issue_photos ip2 WHERE ip2.issue_id = issues.id) + (SELECT COUNT(*) FROM issue_attachments ia2 WHERE ia2.issue_id = issues.id)) AS media_count
    ${base}${whereSql} ORDER BY issues.created_at DESC LIMIT ? OFFSET ?`, [...params, ps, offset]);
  res.json({ items: rows, total, page: p, pageSize: ps });
});

// Tekil issue detay (debug ve ön doğrulama için)
app.get('/api/issues/:id', (req, res) => {
  const { id } = req.params;
  const row = get(`SELECT issues.*, users.username, vehicles.brand, vehicles.model, vehicles.model_year, vehicles.km,
    (SELECT COUNT(*) FROM comments c WHERE c.issue_id = issues.id) AS comment_count,
  (SELECT COUNT(*) FROM issue_updates iu WHERE iu.issue_id = issues.id) AS update_count,
    (SELECT COUNT(*) FROM issue_photos ip WHERE ip.issue_id = issues.id) AS photo_count,
    ((SELECT COUNT(*) FROM issue_photos ip2 WHERE ip2.issue_id = issues.id) + (SELECT COUNT(*) FROM issue_attachments ia2 WHERE ia2.issue_id = issues.id)) AS media_count
    FROM issues JOIN users ON users.id = issues.user_id JOIN vehicles ON vehicles.id = issues.vehicle_id
    WHERE issues.id = ? LIMIT 1`, [id]);
  if(!row) return res.status(404).json({ error: 'Issue not found' });
  res.json(row);
});

// Debug: list all issue IDs (for troubleshooting 404 discrepancies)
app.get('/api/debug/issues/ids', (_req, res) => {
  const rows = all('SELECT id FROM issues ORDER BY id ASC');
  res.json(rows.map(r=>r.id));
});

// Debug: full issues minimal fields
app.get('/api/debug/issues/all', (_req, res) => {
  const rows = all(`SELECT issues.id, users.username, vehicles.brand, vehicles.model, issues.title, issues.created_at FROM issues
    JOIN users ON users.id = issues.user_id JOIN vehicles ON vehicles.id = issues.vehicle_id ORDER BY issues.id ASC`);
  res.json(rows);
});

app.patch('/api/issues/:id', (req, res) => {
  const user = requireAuth(req, res); if(!user) return;
  const { id } = req.params;
  const issue = get('SELECT * FROM issues WHERE id = ?', [id]);
  if (!issue) return res.status(404).json({ error: 'Not found' });
  if(issue.user_id !== user.id) return res.status(403).json({ error: 'Yetki yok' });
  const { solution = issue.solution, service_experience = issue.service_experience, status = issue.status, issue_type = issue.issue_type, title, description, issue_location } = req.body;
  let newTitle = issue.title;
  if(typeof title === 'string' && title.trim()) newTitle = title.trim().slice(0,200);
  let newDescription = issue.description;
  if(typeof description === 'string'){
    if(description.trim()) newDescription = description.trim().slice(0,8000); // keep length cap
    else if(description.trim()==='') return res.status(400).json({ error:'description_empty' });
  }
  let locStr = issue.issue_location;
  if(issue_location !== undefined){
    if(typeof issue_location === 'string' && issue_location.trim()) locStr = issue_location.trim().slice(0,8192);
    else if(issue_location === null || issue_location === '') locStr = null;
  }
  const prev = { status: issue.status };
  run('UPDATE issues SET title = ?, description = ?, solution = ?, service_experience = ?, status = ?, issue_type = ?, issue_location = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newTitle, newDescription, solution, service_experience, status, issue_type, locStr, id]);
  const updated = get(`SELECT issues.*, users.username, vehicles.brand, vehicles.model, vehicles.model_year, vehicles.km,
    (SELECT COUNT(*) FROM comments c WHERE c.issue_id = issues.id) AS comment_count,
  (SELECT COUNT(*) FROM issue_updates iu WHERE iu.issue_id = issues.id) AS update_count,
    (SELECT COUNT(*) FROM issue_photos ip WHERE ip.issue_id = issues.id) AS photo_count,
    ((SELECT COUNT(*) FROM issue_photos ip2 WHERE ip2.issue_id = issues.id) + (SELECT COUNT(*) FROM issue_attachments ia2 WHERE ia2.issue_id = issues.id)) AS media_count
    FROM issues JOIN users ON users.id = issues.user_id JOIN vehicles ON vehicles.id = issues.vehicle_id WHERE issues.id = ?`, [id]);
  try { if(prev.status !== updated.status){ notifyFollowers(parseInt(id,10), user.id, 'status', { from: prev.status, to: updated.status, issue_id: parseInt(id,10), by: user.username, issue_title: updated.title }); } } catch(_e){}
  res.json(updated);
});

app.delete('/api/issues/:id', (req, res) => {
  const user = requireAuth(req, res); if(!user) return;
  const { id } = req.params;
  const existing = get('SELECT id FROM issues WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const owner = get('SELECT user_id FROM issues WHERE id = ?', [id]);
  if(owner.user_id !== user.id) return res.status(403).json({ error: 'Yetki yok' });
  // Delete photos (files + rows)
  const photos = all('SELECT filename FROM issue_photos WHERE issue_id = ?', [id]);
  photos.forEach(p=>{ try{ fs.unlinkSync(path.join(uploadDir, p.filename)); }catch{} });
  // Delete attachments (files + rows)
  const atts = all('SELECT filename FROM issue_attachments WHERE issue_id = ?', [id]);
  atts.forEach(a=>{ try{ fs.unlinkSync(path.join(uploadDir, a.filename)); }catch{} });
  run('DELETE FROM issue_photos WHERE issue_id = ?', [id]);
  run('DELETE FROM issue_attachments WHERE issue_id = ?', [id]);
  run('DELETE FROM comments WHERE issue_id = ?', [id]);
  run('DELETE FROM issues WHERE id = ?', [id]);
  res.json({ success: true });
});

// Bulk delete all current user's issues (and related media/comments)
app.delete('/api/my/issues', (req,res)=>{
  const user = requireAuth(req,res); if(!user) return;
  const rows = all('SELECT id FROM issues WHERE user_id = ?', [user.id]);
  let deleted = 0;
  rows.forEach(r=>{
    const issueId = r.id;
    try {
      const photos = all('SELECT filename FROM issue_photos WHERE issue_id = ?', [issueId]);
      photos.forEach(p=>{ try{ fs.unlinkSync(path.join(uploadDir, p.filename)); }catch{} });
      const atts = all('SELECT filename FROM issue_attachments WHERE issue_id = ?', [issueId]);
      atts.forEach(a=>{ try{ fs.unlinkSync(path.join(uploadDir, a.filename)); }catch{} });
      run('DELETE FROM issue_photos WHERE issue_id = ?', [issueId]);
      run('DELETE FROM issue_attachments WHERE issue_id = ?', [issueId]);
      run('DELETE FROM comments WHERE issue_id = ?', [issueId]);
      run('DELETE FROM issues WHERE id = ?', [issueId]);
      deleted++;
    } catch(err){ console.warn('[bulk-delete][issue]', issueId, 'failed', err.message); }
  });
  res.json({ deleted });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Ek: Marka-Model listesi endpoint (predefined + DB'dekiler)
app.get('/api/brand-models', (_req, res) => {
  // DB'den mevcutları grupla
  const existing = all('SELECT brand, model FROM vehicles');
  const map = new Map();
  predefinedBrandModels.forEach(b => map.set(b.brand, new Set(b.models)));
  existing.forEach(r => {
    if (!map.has(r.brand)) map.set(r.brand, new Set());
    map.get(r.brand).add(r.model);
  });
  const merged = [...map.entries()].map(([brand, models]) => ({ brand, models: [...models].sort() })).sort((a,b)=> a.brand.localeCompare(b.brand));
  res.json(merged);
});

// Arıza türleri endpoint
app.get('/api/issue-types', (_req, res) => {
  res.json(issueTypes);
});

// Health endpoint
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Similar issues suggestion (no auth required)
app.post('/api/issues/similar', (req, res) => {
  try {
    const { brand, model, title = '', description = '', issue_type = '' } = req.body || {};
    if (!brand || !model || (!title && !description && !issue_type)) {
      return res.json({ items: [] });
    }
    // Build tokens from title + description + issue_type
    const base = `${String(title||'')} ${String(issue_type||'')} ${String(description||'')}`.toLowerCase();
    const tokens = [...new Set(base.split(/[^a-z0-9çğıöşü]+/i).filter(t => t && t.length >= 3).slice(0, 12))];
    if (tokens.length === 0) return res.json({ items: [] });
    // Fetch candidates within same brand/model where any token appears in title/description/solution (LIKE)
    const likeParams = [];
    const likeClauses = tokens.map(_ => {
      likeParams.push('%'+_+'%','%'+_+'%','%'+_+'%');
      return '(LOWER(issues.title) LIKE ? OR LOWER(issues.description) LIKE ? OR LOWER(IFNULL(issues.solution, "")) LIKE ?)';
    });
    const whereSql = likeClauses.length ? (' AND (' + likeClauses.join(' OR ') + ')') : '';
    const rows = all(
      `SELECT issues.*, users.username, vehicles.brand, vehicles.model, vehicles.model_year, vehicles.km,
        (SELECT COUNT(*) FROM comments c WHERE c.issue_id = issues.id) AS comment_count,
        (SELECT COUNT(*) FROM issue_updates iu WHERE iu.issue_id = issues.id) AS update_count,
        ((SELECT COUNT(*) FROM issue_photos ip2 WHERE ip2.issue_id = issues.id) + (SELECT COUNT(*) FROM issue_attachments ia2 WHERE ia2.issue_id = issues.id)) AS media_count
       FROM issues
       JOIN users ON users.id = issues.user_id
       JOIN vehicles ON vehicles.id = issues.vehicle_id
       WHERE vehicles.brand = ? AND vehicles.model = ? ${whereSql}
       ORDER BY issues.created_at DESC
       LIMIT 80`, [brand, model, ...likeParams]
    );
    // Score candidates in JS: simple token frequency over title (2x) + description (1x)
    const scored = rows.map(r => {
      const t = (r.title||'').toLowerCase();
      const d = (r.description||'').toLowerCase();
      let score = 0;
      tokens.forEach(tok => { if (t.includes(tok)) score += 2; if (d.includes(tok)) score += 1; });
      return { r, score };
    }).filter(x => x.score > 0);
    scored.sort((a,b)=> b.score - a.score || (new Date(b.r.created_at) - new Date(a.r.created_at)) );
    const top = scored.slice(0, 6).map(x => ({
      id: x.r.id,
      username: x.r.username,
      brand: x.r.brand,
      model: x.r.model,
      title: x.r.title,
      status: x.r.status,
      created_at: x.r.created_at,
      update_count: x.r.update_count,
      comment_count: x.r.comment_count,
      media_count: x.r.media_count,
      issue_type: x.r.issue_type,
      snippet: (x.r.description || '').slice(0, 180)
    }));
    res.json({ items: top, tokens });
  } catch (err) {
    res.status(200).json({ items: [] });
  }
});

// Debug: list tables
app.get('/api/debug/tables', (_req,res)=>{
  const rows = all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  res.json(rows.map(r=>r.name));
});

// ---- Auth Routes ----
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if(!username || !password) return res.status(400).json({ error: 'username & password required' });
  const existing = get('SELECT id FROM users WHERE username = ?', [username]);
  if(existing) return res.status(409).json({ error: 'Kullanıcı mevcut' });
  const hash = bcrypt.hashSync(password, 10);
  run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
  const user = get('SELECT id, username, owned_brand, owned_model FROM users WHERE username = ?', [username]);
  const session = createSession(user.id);
  res.setHeader('Set-Cookie', cookie.serialize('sid', session.id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60*60*24*7 }));
  res.json({ user });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if(!username || !password) return res.status(400).json({ error: 'username & password required' });
  const user = get('SELECT * FROM users WHERE username = ?', [username]);
  if(!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Geçersiz' });
  const session = createSession(user.id);
  res.setHeader('Set-Cookie', cookie.serialize('sid', session.id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60*60*24*7 }));
  res.json({ user: { id: user.id, username: user.username, owned_brand: user.owned_brand, owned_model: user.owned_model } });
});

app.post('/api/auth/logout', (req, res) => {
  const cookieHeader = req.headers.cookie;
  if(cookieHeader){
    const parsed = cookie.parse(cookieHeader);
    if(parsed.sid){ run('DELETE FROM sessions WHERE id = ?', [parsed.sid]); }
  }
  res.setHeader('Set-Cookie', cookie.serialize('sid', '', { path: '/', maxAge: 0 }));
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = currentUser(req);
  res.json({ user });
});

// Profile endpoints
app.get('/api/profile', (req, res) => {
  const user = requireAuth(req, res); if(!user) return;
  res.json({ user });
});
app.patch('/api/profile', (req, res) => {
  const user = requireAuth(req, res); if(!user) return;
  const { owned_brand, owned_model } = req.body;
  if(!owned_brand || !owned_model) return res.status(400).json({ error: 'owned_brand & owned_model gerekli' });
  run('UPDATE users SET owned_brand = ?, owned_model = ? WHERE id = ?', [owned_brand.trim(), owned_model.trim(), user.id]);
  const updated = get('SELECT id, username, owned_brand, owned_model FROM users WHERE id = ?', [user.id]);
  res.json({ user: updated });
});

// --- User vehicles CRUD (auth required) ---
app.get('/api/my/vehicles', (req, res) => {
  const user = requireAuth(req, res); if(!user) return;
  const rows = all('SELECT * FROM user_vehicles WHERE user_id = ? ORDER BY created_at ASC', [user.id]);
  res.json(rows);
});
app.post('/api/my/vehicles', (req, res) => {
  const user = requireAuth(req, res); if(!user) return;
  const { brand, model, km, model_year } = req.body;
  if(!brand || !model) return res.status(400).json({ error: 'brand & model gerekli' });
  const kmValue = km ? parseInt(km, 10) : null;
  const yearValue = model_year ? parseInt(model_year, 10) : null;
  run('INSERT INTO user_vehicles (user_id, brand, model, km, model_year) VALUES (?,?,?,?,?)', [user.id, brand.trim(), model.trim(), kmValue, yearValue]);
  const list = all('SELECT * FROM user_vehicles WHERE user_id = ? ORDER BY created_at ASC', [user.id]);
  res.status(201).json(list);
});
app.patch('/api/my/vehicles/:id', (req, res) => {
  const user = requireAuth(req, res); if(!user) return;
  const { id } = req.params;
  const veh = get('SELECT * FROM user_vehicles WHERE id = ? AND user_id = ?', [id, user.id]);
  if(!veh) return res.status(404).json({ error: 'Not found' });
  const { brand = veh.brand, model = veh.model, km, model_year } = req.body;
  const kmValue = km !== undefined ? (km ? parseInt(km, 10) : null) : veh.km;
  const yearValue = model_year !== undefined ? (model_year ? parseInt(model_year, 10) : null) : veh.model_year;
  run('UPDATE user_vehicles SET brand = ?, model = ?, km = ?, model_year = ? WHERE id = ?', [brand.trim(), model.trim(), kmValue, yearValue, id]);
  const list = all('SELECT * FROM user_vehicles WHERE user_id = ? ORDER BY created_at ASC', [user.id]);
  res.json(list);
});
app.delete('/api/my/vehicles/:id', (req, res) => {
  const user = requireAuth(req, res); if(!user) return;
  const { id } = req.params;
  const veh = get('SELECT * FROM user_vehicles WHERE id = ? AND user_id = ?', [id, user.id]);
  if(!veh) return res.status(404).json({ error: 'Not found' });
  run('DELETE FROM user_vehicles WHERE id = ?', [id]);
  const list = all('SELECT * FROM user_vehicles WHERE user_id = ? ORDER BY created_at ASC', [user.id]);
  res.json(list);
});

// Public user profile issues
app.get('/api/users/:username/issues', (req, res) => {
  const { username } = req.params;
  const exists = get('SELECT id FROM users WHERE username = ?', [username]);
  if(!exists) return res.status(404).json({ error: 'User not found' });
  const rows = all(`SELECT issues.*, users.username, vehicles.brand, vehicles.model, vehicles.model_year, vehicles.km,
    (SELECT COUNT(*) FROM comments c WHERE c.issue_id = issues.id) AS comment_count,
    (SELECT COUNT(*) FROM issue_updates iu WHERE iu.issue_id = issues.id) AS update_count,
    (SELECT COUNT(*) FROM issue_photos ip WHERE ip.issue_id = issues.id) AS photo_count,
    ((SELECT COUNT(*) FROM issue_photos ip2 WHERE ip2.issue_id = issues.id) + (SELECT COUNT(*) FROM issue_attachments ia2 WHERE ia2.issue_id = issues.id)) AS media_count
    FROM issues
    JOIN users ON users.id = issues.user_id
    JOIN vehicles ON vehicles.id = issues.vehicle_id
    WHERE users.username = ? ORDER BY issues.created_at DESC LIMIT 200`, [username]);
  res.json(rows);
});

// --- Issue Updates (Developments) ---
app.get('/api/issues/:id/updates', (req,res)=>{
  const { id } = req.params; const exists = get('SELECT id FROM issues WHERE id = ?', [id]);
  if(!exists) return res.status(404).json({ error:'Issue not found' });
  const rows = all(`SELECT iu.id, iu.title, iu.content, iu.created_at, users.username
    FROM issue_updates iu JOIN users ON users.id = iu.user_id
    WHERE iu.issue_id = ? ORDER BY iu.created_at ASC`, [id]);
  const enriched = rows.map(r=>{
    const atts = all('SELECT id, filename, original_name, mime, kind, created_at FROM issue_update_attachments WHERE update_id = ? ORDER BY id ASC', [r.id])
      .map(a=>({ id:a.id, url:'/uploads/'+a.filename, original_name:a.original_name, mime:a.mime, kind:a.kind, created_at:a.created_at }));
    return { ...r, attachments: atts };
  });
  res.json(enriched);
});
app.post('/api/issues/:id/updates', (req,res)=>{
  const user = requireAuth(req,res); if(!user) return;
  const { id } = req.params; const issue = get('SELECT * FROM issues WHERE id = ?', [id]);
  if(!issue) return res.status(404).json({ error:'Issue not found' });
  if(issue.user_id !== user.id) return res.status(403).json({ error:'Yetki yok' });
  // Use uploadAny for optional attachments (same limits)
  uploadAny.array('attachments',5)(req,res, err=>{
    if(err) return res.status(400).json({ error:'upload_failed', detail:err.message });
    try {
  // Accept common alternative field names for robustness
  let { content, title } = req.body;
  if(!content) content = req.body?.description || req.body?.text || req.body?.body;
  if(typeof content !== 'string') content = '';
  if(!content.trim()) return res.status(400).json({ error:'content_required', message:'Gelişme metni boş olamaz', receivedKeys:Object.keys(req.body||{}) });
  const text = content.trim().slice(0,4000);
  const t = title && title.trim() ? title.trim().slice(0,160) : null;
  run('INSERT INTO issue_updates (issue_id, user_id, title, content) VALUES (?,?,?,?)', [id, user.id, t, text]);
      const newUpdate = get('SELECT id FROM issue_updates WHERE issue_id = ? ORDER BY id DESC LIMIT 1',[id]);
      if(req.files?.length){
        req.files.forEach(f=>{
          const mime=f.mimetype; let kind='other';
          if(mime.startsWith('image/')) kind='image'; else if(mime.startsWith('audio/')) kind='audio'; else if(mime.startsWith('video/')) kind='video';
          try { run('INSERT INTO issue_update_attachments (update_id, filename, original_name, mime, kind) VALUES (?,?,?,?,?)', [newUpdate.id, f.filename, f.originalname, mime, kind]); } catch(ex){}
        });
      }
  const inserted = get(`SELECT iu.id, iu.title, iu.content, iu.created_at, users.username FROM issue_updates iu JOIN users ON users.id = iu.user_id WHERE iu.id = ?`, [newUpdate.id]);
      const atts = all('SELECT id, filename, original_name, mime, kind, created_at FROM issue_update_attachments WHERE update_id = ? ORDER BY id ASC',[newUpdate.id])
        .map(a=>({ id:a.id, url:'/uploads/'+a.filename, original_name:a.original_name, mime:a.mime, kind:a.kind, created_at:a.created_at }));
      const updateCountRow = get('SELECT COUNT(*) AS cnt FROM issue_updates WHERE issue_id = ?', [id]);
      // Get issue title for notification
      const issueInfo = get('SELECT title FROM issues WHERE id = ?', [id]);
      try { notifyFollowers(parseInt(id,10), user.id, 'update', { issue_id: parseInt(id,10), by: user.username, title: inserted?.title||null, content: inserted?.content||null, issue_title: issueInfo?.title||null }); } catch(_e){}
      res.status(201).json({ inserted:{...inserted, attachments: atts}, update_count:updateCountRow?.cnt||0 });
    } catch(ex){ res.status(500).json({ error:'unexpected', detail:String(ex.message||ex) }); }
  });
});

// Edit an existing issue update (content/title only for now)
app.patch('/api/updates/:updateId', (req,res)=>{
  const user = requireAuth(req,res); if(!user) return;
  const { updateId } = req.params;
  const row = get(`SELECT iu.*, issues.user_id AS issue_owner FROM issue_updates iu JOIN issues ON issues.id = iu.issue_id WHERE iu.id = ?`, [updateId]);
  if(!row) return res.status(404).json({ error:'Not found' });
  if(row.issue_owner !== user.id) return res.status(403).json({ error:'Yetki yok' });
  let { content, title } = req.body;
  if(content!==undefined){
    if(typeof content !== 'string' || !content.trim()) return res.status(400).json({ error:'content_required' });
    content = content.trim().slice(0,4000);
  } else {
    content = row.content; // no change
  }
  if(title!==undefined){
    if(title && typeof title === 'string' && title.trim()) title = title.trim().slice(0,160); else title = null; // allow clearing
  } else {
    title = row.title || null;
  }
  run('UPDATE issue_updates SET title = ?, content = ? WHERE id = ?', [title, content, updateId]);
  const updated = get(`SELECT iu.id, iu.title, iu.content, iu.created_at, users.username FROM issue_updates iu JOIN users ON users.id = iu.user_id WHERE iu.id = ?`, [updateId]);
  const atts = all('SELECT id, filename, original_name, mime, kind, created_at FROM issue_update_attachments WHERE update_id = ? ORDER BY id ASC', [updateId])
    .map(a=>({ id:a.id, url:'/uploads/'+a.filename, original_name:a.original_name, mime:a.mime, kind:a.kind, created_at:a.created_at }));
  try { notifyFollowers(parseInt(row.issue_id,10), user.id, 'update_edit', { issue_id: parseInt(row.issue_id,10), by: user.username, update_id: parseInt(updateId,10) }); } catch(_e){}
  res.json({ ...updated, attachments: atts });
});

// Delete an issue update
app.delete('/api/updates/:updateId', (req,res)=>{
  const user = requireAuth(req,res); if(!user) return;
  const { updateId } = req.params;
  const row = get(`SELECT iu.*, issues.user_id AS issue_owner FROM issue_updates iu JOIN issues ON issues.id = iu.issue_id WHERE iu.id = ?`, [updateId]);
  if(!row) return res.status(404).json({ error:'Not found' });
  if(row.issue_owner !== user.id) return res.status(403).json({ error:'Yetki yok' });
  const atts = all('SELECT filename FROM issue_update_attachments WHERE update_id = ?', [updateId]);
  atts.forEach(a=>{ try { fs.unlinkSync(path.join(uploadDir, a.filename)); } catch(_){} });
  run('DELETE FROM issue_update_attachments WHERE update_id = ?', [updateId]);
  run('DELETE FROM issue_updates WHERE id = ?', [updateId]);
  const cntRow = get('SELECT COUNT(*) AS cnt FROM issue_updates WHERE issue_id = ?', [row.issue_id]);
  try { notifyFollowers(parseInt(row.issue_id,10), user.id, 'update_delete', { issue_id: parseInt(row.issue_id,10), by: user.username, update_id: parseInt(updateId,10) }); } catch(_e){}
  res.json({ deleted:true, update_count: cntRow?.cnt||0 });
});

// --- Comments Endpoints ---
app.get('/api/issues/:id/comments', (req, res) => {
  const { id } = req.params;
  const issue = get('SELECT id FROM issues WHERE id = ?', [id]);
  if(!issue) { console.log('[comments][GET] issueId', id, 'NOT FOUND'); return res.status(404).json({ error: 'Issue not found' }); }
  console.log('[comments][GET] issueId', id, 'ok');
  const rows = all(`SELECT comments.id, comments.content, comments.created_at, users.username
    FROM comments JOIN users ON users.id = comments.user_id
    WHERE comments.issue_id = ? ORDER BY comments.created_at ASC LIMIT 500`, [id]);
  res.json(rows);
});
app.post('/api/issues/:id/comments', (req, res) => {
  const user = requireAuth(req, res); if(!user) return;
  const { id } = req.params;
  const issue = get('SELECT id FROM issues WHERE id = ?', [id]);
  if(!issue) { console.log('[comments][POST] issueId', id, 'NOT FOUND'); return res.status(404).json({ error: 'Issue not found' }); }
  const { content } = req.body;
  if(!content || !content.trim()) return res.status(400).json({ error: 'content required' });
  const text = content.trim().slice(0, 2000);
  run('INSERT INTO comments (issue_id, user_id, content) VALUES (?,?,?)', [id, user.id, text]);
  const inserted = get(`SELECT comments.id, comments.content, comments.created_at, users.username
    FROM comments JOIN users ON users.id = comments.user_id
    WHERE comments.issue_id = ? ORDER BY comments.id DESC LIMIT 1`, [id]);
  console.log('[comments][POST] issueId', id, 'inserted comment', inserted?.id);
  // Get issue title for notification
  const issueInfo = get('SELECT title FROM issues WHERE id = ?', [id]);
  try { notifyFollowers(parseInt(id,10), user.id, 'comment', { issue_id: parseInt(id,10), by: user.username, content: text, issue_title: issueInfo?.title||null }); } catch(_e){}
  res.status(201).json(inserted);
});
app.patch('/api/comments/:commentId', (req, res) => {
  const user = requireAuth(req, res); if(!user) return;
  const { commentId } = req.params;
  const row = get('SELECT * FROM comments WHERE id = ?', [commentId]);
  if(!row) return res.status(404).json({ error: 'Not found' });
  if(row.user_id !== user.id) return res.status(403).json({ error: 'Yetki yok' });
  const { content } = req.body;
  if(!content || !content.trim()) return res.status(400).json({ error: 'content required' });
  const text = content.trim().slice(0,2000);
  run('UPDATE comments SET content = ? WHERE id = ?', [text, commentId]);
  const updated = get(`SELECT comments.id, comments.content, comments.created_at, users.username FROM comments JOIN users ON users.id = comments.user_id WHERE comments.id = ?`, [commentId]);
  res.json(updated);
});
app.delete('/api/comments/:commentId', (req, res) => {
  const user = requireAuth(req, res); if(!user) return;
  const { commentId } = req.params;
  const row = get('SELECT * FROM comments WHERE id = ?', [commentId]);
  if(!row) return res.status(404).json({ error: 'Not found' });
  if(row.user_id !== user.id) return res.status(403).json({ error: 'Yetki yok' });
  run('DELETE FROM comments WHERE id = ?', [commentId]);
  res.json({ success: true });
});

// --- Issue Photos Endpoints ---
app.post('/api/issues/:id/photos', (req, res, next) => {
  const user = requireAuth(req, res); if(!user) return;
  const { id } = req.params;
  const issue = get('SELECT * FROM issues WHERE id = ?', [id]);
  if(!issue) return res.status(404).json({ error: 'Issue not found' });
  if(issue.user_id !== user.id) return res.status(403).json({ error: 'Yetki yok' });
  console.log('[photos][POST] start issue', id);
  uploadImages.array('photos',5)(req,res, err=>{
    if(err){
      console.error('[photos][POST] multer error', err);
      return res.status(400).json({ error: 'upload_failed', detail: err.message });
    }
    try {
      const files = req.files || [];
      if(!files.length){ return res.status(400).json({ error: 'no_files' }); }
      files.forEach(f=>{
        try { run('INSERT INTO issue_photos (issue_id, filename, original_name) VALUES (?,?,?)', [id, f.filename, f.originalname]); }
        catch(dbErr){ console.error('[photos][POST] db insert error', dbErr); }
      });
      const rows = all('SELECT id, filename, original_name, created_at FROM issue_photos WHERE issue_id = ? ORDER BY id ASC', [id]).map(r=> ({ id: r.id, url: '/uploads/'+r.filename, original_name: r.original_name, created_at: r.created_at }));
      console.log('[photos][POST] done issue', id, 'count', rows.length);
      res.status(201).json(rows);
    } catch(ex){
      console.error('[photos][POST] unexpected', ex);
      res.status(500).json({ error: 'unexpected', detail: String(ex.message||ex) });
    }
  });
});
app.get('/api/issues/:id/photos', (req, res) => {
  const { id } = req.params;
  const issue = get('SELECT id FROM issues WHERE id = ?', [id]);
  if(!issue) return res.status(404).json({ error: 'Issue not found' });
  const rows = all('SELECT id, filename, original_name, created_at FROM issue_photos WHERE issue_id = ? ORDER BY id ASC', [id])
    .map(r=> ({ id: r.id, url: '/uploads/'+r.filename, original_name: r.original_name, created_at: r.created_at }));
  res.json(rows);
});

// Generic media attachments (image/audio/video)
app.post('/api/issues/:id/attachments', (req,res)=>{
  const user = requireAuth(req, res); if(!user) return;
  const { id } = req.params; const issue = get('SELECT * FROM issues WHERE id = ?', [id]);
  if(!issue) return res.status(404).json({ error:'Issue not found' });
  if(issue.user_id !== user.id) return res.status(403).json({ error:'Yetki yok' });
  console.log('[attachments][POST] start issue', id);
  uploadAny.array('attachments',5)(req,res, err=>{
    if(err){ console.error('[attachments][POST] multer error', err); return res.status(400).json({ error:'upload_failed', detail: err.message }); }
    try {
      const files = req.files||[]; if(!files.length) return res.status(400).json({ error:'no_files' });
      files.forEach(f=>{
        const mime = f.mimetype; let kind='other';
        if(mime.startsWith('image/')) kind='image'; else if(mime.startsWith('audio/')) kind='audio'; else if(mime.startsWith('video/')) kind='video';
        try { run('INSERT INTO issue_attachments (issue_id, filename, original_name, mime, kind) VALUES (?,?,?,?,?)', [id, f.filename, f.originalname, mime, kind]); }
        catch(dbErr){ console.error('[attachments][POST] db insert error', dbErr); }
      });
      const rows = all('SELECT id, filename, original_name, mime, kind, created_at FROM issue_attachments WHERE issue_id = ? ORDER BY id ASC', [id])
        .map(r=> ({ id:r.id, url:'/uploads/'+r.filename, original_name:r.original_name, mime:r.mime, kind:r.kind, created_at:r.created_at }));
      console.log('[attachments][POST] done issue', id, 'count', rows.length);
      // Get issue title for notification
      const issueInfo = get('SELECT title FROM issues WHERE id = ?', [id]);
      try { notifyFollowers(parseInt(id,10), user.id, 'media', { issue_id: parseInt(id,10), count: (req.files||[]).length, by: user.username, issue_title: issueInfo?.title||null }); } catch(_e){}
      res.status(201).json(rows);
    } catch(ex){ console.error('[attachments][POST] unexpected', ex); res.status(500).json({ error:'unexpected', detail:String(ex.message||ex) }); }
  });
});
app.get('/api/issues/:id/attachments', (req,res)=>{
  const { id } = req.params; const issue = get('SELECT id FROM issues WHERE id = ?', [id]);
  if(!issue) return res.status(404).json({ error:'Issue not found' });
  const rows = all('SELECT id, filename, original_name, mime, kind, created_at FROM issue_attachments WHERE issue_id = ? ORDER BY id ASC', [id])
    .map(r=> ({ id:r.id, url:'/uploads/'+r.filename, original_name:r.original_name, mime:r.mime, kind:r.kind, created_at:r.created_at }));
  res.json(rows);
});

// --- Follow & Notifications Endpoints ---
app.get('/api/issues/:id/follow', (req,res)=>{
  const user = currentUser(req);
  const { id } = req.params;
  const cntRow = get('SELECT COUNT(*) AS cnt FROM issue_followers WHERE issue_id = ?', [id]);
  let followed = false;
  if(user){ const r = get('SELECT 1 AS x FROM issue_followers WHERE user_id = ? AND issue_id = ?', [user.id, id]); followed = !!r; }
  res.json({ count: cntRow?.cnt||0, followed });
});
app.post('/api/issues/:id/follow', (req,res)=>{
  const user = requireAuth(req,res); if(!user) return;
  const { id } = req.params; try { run('INSERT OR IGNORE INTO issue_followers (user_id, issue_id) VALUES (?,?)', [user.id, id]); } catch(_){}
  const cnt = get('SELECT COUNT(*) AS cnt FROM issue_followers WHERE issue_id = ?', [id])?.cnt||0;
  res.json({ followed:true, count: cnt });
});
app.delete('/api/issues/:id/follow', (req,res)=>{
  const user = requireAuth(req,res); if(!user) return;
  const { id } = req.params; try { run('DELETE FROM issue_followers WHERE user_id = ? AND issue_id = ?', [user.id, id]); } catch(_){}
  const cnt = get('SELECT COUNT(*) AS cnt FROM issue_followers WHERE issue_id = ?', [id])?.cnt||0;
  res.json({ followed:false, count: cnt });
});
app.get('/api/my/follows', (req,res)=>{
  const user = requireAuth(req,res); if(!user) return;
  const rows = all('SELECT issue_id FROM issue_followers WHERE user_id = ? ORDER BY created_at DESC LIMIT 1000', [user.id]);
  res.json(rows.map(r=> r.issue_id));
});
app.get('/api/me/notifications', (req,res)=>{
  const user = requireAuth(req,res); if(!user) return;
  const { unread } = req.query;
  let rows;
  if(String(unread)==='1') rows = all('SELECT * FROM notifications WHERE user_id = ? AND read_at IS NULL ORDER BY id DESC LIMIT 50', [user.id]);
  else rows = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100', [user.id]);
  res.json(rows);
});
app.post('/api/me/notifications/read', (req,res)=>{
  const user = requireAuth(req,res); if(!user) return;
  const { id } = req.body||{};
  if(id){ run('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?', [user.id, id]); }
  else { run('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL', [user.id]); }
  const unread = get('SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND read_at IS NULL', [user.id])?.cnt||0;
  res.json({ unread });
});

// Initialize sql.js then start server
initSqlJs({ locateFile: file => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file) })
  .then((SQLModule) => {
    SQL = SQLModule; loadDatabase();
    const basePort = parseInt(process.env.PORT || PORT,10) || 3000;
    const maxTries = 6; // 3000..3005
    function tryListen(p, attempt){
      const server = app.listen(p, '0.0.0.0', () => {
        console.log('Server running on:');
        console.log('  - Local:   http://localhost:' + p);
        console.log('  - Network: http://[YOUR_IP]:' + p);
      });
      server.on('error', err => {
        if(err.code === 'EADDRINUSE' && attempt < maxTries-1){
          const next = basePort + attempt + 1;
          console.log('Port', p, 'dolu, sıradaki port deneniyor ->', next);
          tryListen(next, attempt+1);
        } else if(err.code === 'EADDRINUSE') {
          console.error('Uygun port bulunamadı (', basePort, '..', basePort+maxTries-1, ')');
          process.exit(1);
        } else { console.error(err); process.exit(1); }
      });
    }
    tryListen(basePort, 0);
  })
  .catch(err => { console.error('Failed to init sql.js', err); process.exit(1); });
