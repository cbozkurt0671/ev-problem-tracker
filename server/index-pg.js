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

// Multer storage for media uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg','.jpeg','.png','.webp','.gif'].includes(ext) ? ext : '.bin';
    cb(null, Date.now() + '_' + Math.random().toString(36).slice(2) + safeExt);
  }
});
const uploadImages = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if(/image\/(png|jpe?g|webp|gif)/i.test(file.mimetype)) cb(null,true); 
    else cb(new Error('Geçersiz dosya türü (yalnızca görsel)'));
  }
});

// Database functions
async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

async function queryOne(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
}

// Initialize database tables
async function initDatabase() {
  try {
    await pool.query(`
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
      
      CREATE TABLE IF NOT EXISTS issue_photos (
        id SERIAL PRIMARY KEY,
        issue_id INTEGER NOT NULL REFERENCES issues(id),
        filename TEXT NOT NULL,
        original_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    `);
    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
  }
}

// Auth helpers
async function createSession(userId) {
  const id = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 1000*60*60*24*7);
  await query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1,$2,$3)', [id, userId, expires]);
  return { id, expires };
}

async function getSession(sessionId) {
  if(!sessionId) return null;
  const row = await queryOne('SELECT * FROM sessions WHERE id = $1', [sessionId]);
  if(!row) return null;
  if(row.expires_at && new Date(row.expires_at) < new Date()) {
    await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    return null;
  }
  return row;
}

async function currentUser(req) {
  const cookieHeader = req.headers.cookie;
  if(!cookieHeader) return null;
  const parsed = cookie.parse(cookieHeader);
  if(!parsed.sid) return null;
  const sess = await getSession(parsed.sid);
  if(!sess) return null;
  return await queryOne('SELECT id, username, owned_brand, owned_model FROM users WHERE id = $1', [sess.user_id]);
}

async function requireAuth(req, res) {
  const u = await currentUser(req);
  if(!u) { res.status(401).json({ error: 'Giriş gerekli' }); return null; }
  return u;
}

async function getOrCreateUser(username) {
  const found = await queryOne('SELECT id FROM users WHERE username = $1', [username]);
  if (found) return found.id;
  const result = await query('INSERT INTO users (username) VALUES ($1) RETURNING id', [username]);
  return result[0].id;
}

async function getOrCreateVehicle(brand, model) {
  const found = await queryOne('SELECT id FROM vehicles WHERE brand = $1 AND model = $2', [brand, model]);
  if (found) return found.id;
  const result = await query('INSERT INTO vehicles (brand, model) VALUES ($1, $2) RETURNING id', [brand, model]);
  return result[0].id;
}

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(process.cwd(), 'public')));

// Routes
app.get('/api/vehicles', async (req, res) => {
  try {
    const rows = await query('SELECT id, brand, model FROM vehicles ORDER BY brand, model');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/issues', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if(!user) return;
    
    const { brand, model, title, description, issue_type, solution, service_experience, issue_location } = req.body;
    if (!brand || !model || !title || !description) {
      return res.status(400).json({ error: 'brand, model, title, description required' });
    }
    
    const vehicleId = await getOrCreateVehicle(brand.trim(), model.trim());
    const locStr = issue_location && typeof issue_location === 'string' ? issue_location.trim().slice(0, 8192) : null;
    
    const result = await query(`
      INSERT INTO issues (user_id, vehicle_id, title, issue_type, description, solution, service_experience, issue_location) 
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
    `, [user.id, vehicleId, title.trim(), issue_type?.trim() || null, description.trim(), solution?.trim() || null, service_experience?.trim() || null, locStr]);
    
    const newId = result[0].id;
    const issue = await queryOne(`
      SELECT i.*, u.username, v.brand, v.model,
             (SELECT COUNT(*) FROM issue_photos ip WHERE ip.issue_id = i.id) AS photo_count
      FROM issues i 
      JOIN users u ON u.id = i.user_id 
      JOIN vehicles v ON v.id = i.vehicle_id 
      WHERE i.id = $1
    `, [newId]);
    
    res.status(201).json(issue);
  } catch (error) {
    console.error('Error creating issue:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/issues', async (req, res) => {
  try {
    const { brand, model, q, page = '1', pageSize = '20' } = req.query;
    const p = Math.max(parseInt(page,10)||1,1);
    const ps = Math.min(Math.max(parseInt(pageSize,10)||20,1),100);
    
    let baseQuery = `
      FROM issues i 
      JOIN users u ON u.id = i.user_id 
      JOIN vehicles v ON v.id = i.vehicle_id
    `;
    
    const where = [];
    const params = [];
    let paramIndex = 1;
    
    if (brand) { where.push(`v.brand = $${paramIndex++}`); params.push(brand); }
    if (model) { where.push(`v.model = $${paramIndex++}`); params.push(model); }
    if (q) { 
      where.push(`(i.title ILIKE $${paramIndex} OR i.description ILIKE $${paramIndex+1})`); 
      params.push(`%${q}%`, `%${q}%`);
      paramIndex += 2;
    }
    
    const whereSql = where.length ? (' WHERE ' + where.join(' AND ')) : '';
    
    const totalResult = await query(`SELECT COUNT(*) as count ${baseQuery}${whereSql}`, params);
    const total = parseInt(totalResult[0].count);
    
    const offset = (p-1)*ps;
    params.push(ps, offset);
    
    const rows = await query(`
      SELECT i.*, u.username, v.brand, v.model,
             (SELECT COUNT(*) FROM issue_photos ip WHERE ip.issue_id = i.id) AS photo_count
      ${baseQuery}${whereSql} 
      ORDER BY i.created_at DESC 
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, params);
    
    res.json({ items: rows, total, page: p, pageSize: ps });
  } catch (error) {
    console.error('Error fetching issues:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/issues/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const row = await queryOne(`
      SELECT i.*, u.username, v.brand, v.model,
             (SELECT COUNT(*) FROM issue_photos ip WHERE ip.issue_id = i.id) AS photo_count
      FROM issues i 
      JOIN users u ON u.id = i.user_id 
      JOIN vehicles v ON v.id = i.vehicle_id
      WHERE i.id = $1
    `, [id]);
    
    if(!row) return res.status(404).json({ error: 'Issue not found' });
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.patch('/api/issues/:id', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if(!user) return;
    
    const { id } = req.params;
    const issue = await queryOne('SELECT * FROM issues WHERE id = $1', [id]);
    if (!issue) return res.status(404).json({ error: 'Not found' });
    if(issue.user_id !== user.id) return res.status(403).json({ error: 'Yetki yok' });
    
    const { solution, service_experience, status, title, description, issue_location } = req.body;
    
    await query(`
      UPDATE issues SET 
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        solution = $3, 
        service_experience = $4, 
        status = COALESCE($5, status),
        issue_location = $6,
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = $7
    `, [title?.trim(), description?.trim(), solution, service_experience, status, issue_location, id]);
    
    const updated = await queryOne(`
      SELECT i.*, u.username, v.brand, v.model,
             (SELECT COUNT(*) FROM issue_photos ip WHERE ip.issue_id = i.id) AS photo_count
      FROM issues i 
      JOIN users u ON u.id = i.user_id 
      JOIN vehicles v ON v.id = i.vehicle_id 
      WHERE i.id = $1
    `, [id]);
    
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if(!username || !password) return res.status(400).json({ error: 'username & password required' });
    
    const existing = await queryOne('SELECT id FROM users WHERE username = $1', [username]);
    if(existing) return res.status(409).json({ error: 'Kullanıcı mevcut' });
    
    const hash = bcrypt.hashSync(password, 10);
    const result = await query('INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id', [username, hash]);
    const user = { id: result[0].id, username, owned_brand: null, owned_model: null };
    
    const session = await createSession(user.id);
    res.setHeader('Set-Cookie', cookie.serialize('sid', session.id, { 
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60*60*24*7 
    }));
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if(!username || !password) return res.status(400).json({ error: 'username & password required' });
    
    const user = await queryOne('SELECT * FROM users WHERE username = $1', [username]);
    if(!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Geçersiz' });
    }
    
    const session = await createSession(user.id);
    res.setHeader('Set-Cookie', cookie.serialize('sid', session.id, { 
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60*60*24*7 
    }));
    res.json({ user: { id: user.id, username: user.username, owned_brand: user.owned_brand, owned_model: user.owned_model } });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const user = await currentUser(req);
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const cookieHeader = req.headers.cookie;
    if(cookieHeader){
      const parsed = cookie.parse(cookieHeader);
      if(parsed.sid){ await query('DELETE FROM sessions WHERE id = $1', [parsed.sid]); }
    }
    res.setHeader('Set-Cookie', cookie.serialize('sid', '', { path: '/', maxAge: 0 }));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Photos
app.post('/api/issues/:id/photos', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if(!user) return;
    
    const { id } = req.params;
    const issue = await queryOne('SELECT * FROM issues WHERE id = $1', [id]);
    if(!issue) return res.status(404).json({ error: 'Issue not found' });
    if(issue.user_id !== user.id) return res.status(403).json({ error: 'Yetki yok' });
    
    uploadImages.array('photos',5)(req,res, async (err) => {
      if(err) return res.status(400).json({ error: 'upload_failed', detail: err.message });
      
      try {
        const files = req.files || [];
        if(!files.length) return res.status(400).json({ error: 'no_files' });
        
        for(const f of files) {
          await query('INSERT INTO issue_photos (issue_id, filename, original_name) VALUES ($1,$2,$3)', 
                     [id, f.filename, f.originalname]);
        }
        
        const rows = await query('SELECT id, filename, original_name, created_at FROM issue_photos WHERE issue_id = $1 ORDER BY id ASC', [id]);
        const photos = rows.map(r => ({ 
          id: r.id, 
          url: '/uploads/'+r.filename, 
          original_name: r.original_name, 
          created_at: r.created_at 
        }));
        
        res.status(201).json(photos);
      } catch(ex) {
        res.status(500).json({ error: 'Database error' });
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/issues/:id/photos', async (req, res) => {
  try {
    const { id } = req.params;
    const issue = await queryOne('SELECT id FROM issues WHERE id = $1', [id]);
    if(!issue) return res.status(404).json({ error: 'Issue not found' });
    
    const rows = await query('SELECT id, filename, original_name, created_at FROM issue_photos WHERE issue_id = $1 ORDER BY id ASC', [id]);
    const photos = rows.map(r => ({ 
      id: r.id, 
      url: '/uploads/'+r.filename, 
      original_name: r.original_name, 
      created_at: r.created_at 
    }));
    
    res.json(photos);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Static routes
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// My vehicles endpoints
app.get('/api/my/vehicles', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if(!user) return;
    
    const rows = await query('SELECT * FROM user_vehicles WHERE user_id = $1 ORDER BY created_at ASC', [user.id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/my/vehicles', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if(!user) return;
    
    const { brand, model, km, model_year } = req.body;
    if(!brand || !model) return res.status(400).json({ error: 'brand & model gerekli' });
    
    const kmValue = km ? parseInt(km, 10) : null;
    const yearValue = model_year ? parseInt(model_year, 10) : null;
    
    await query('INSERT INTO user_vehicles (user_id, brand, model, km, model_year) VALUES ($1,$2,$3,$4,$5)', 
               [user.id, brand.trim(), model.trim(), kmValue, yearValue]);
    
    const list = await query('SELECT * FROM user_vehicles WHERE user_id = $1 ORDER BY created_at ASC', [user.id]);
    res.status(201).json(list);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.patch('/api/my/vehicles/:id', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if(!user) return;
    
    const { id } = req.params;
    const veh = await queryOne('SELECT * FROM user_vehicles WHERE id = $1 AND user_id = $2', [id, user.id]);
    if(!veh) return res.status(404).json({ error: 'Not found' });
    
    const { brand = veh.brand, model = veh.model, km, model_year } = req.body;
    const kmValue = km !== undefined ? (km ? parseInt(km, 10) : null) : veh.km;
    const yearValue = model_year !== undefined ? (model_year ? parseInt(model_year, 10) : null) : veh.model_year;
    
    await query('UPDATE user_vehicles SET brand = $1, model = $2, km = $3, model_year = $4 WHERE id = $5', 
               [brand.trim(), model.trim(), kmValue, yearValue, id]);
    
    const list = await query('SELECT * FROM user_vehicles WHERE user_id = $1 ORDER BY created_at ASC', [user.id]);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/my/vehicles/:id', async (req, res) => {
  try {
    const user = await requireAuth(req, res);
    if(!user) return;
    
    const { id } = req.params;
    const veh = await queryOne('SELECT * FROM user_vehicles WHERE id = $1 AND user_id = $2', [id, user.id]);
    if(!veh) return res.status(404).json({ error: 'Not found' });
    
    await query('DELETE FROM user_vehicles WHERE id = $1', [id]);
    const list = await query('SELECT * FROM user_vehicles WHERE user_id = $1 ORDER BY created_at ASC', [user.id]);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Predefined data
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

app.get('/api/brand-models', async (req, res) => {
  try {
    const existing = await query('SELECT brand, model FROM vehicles');
    const map = new Map();
    predefinedBrandModels.forEach(b => map.set(b.brand, new Set(b.models)));
    existing.forEach(r => {
      if (!map.has(r.brand)) map.set(r.brand, new Set());
      map.get(r.brand).add(r.model);
    });
    const merged = [...map.entries()].map(([brand, models]) => ({ brand, models: [...models].sort() })).sort((a,b)=> a.brand.localeCompare(b.brand));
    res.json(merged);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Start server
async function startServer() {
  try {
    await initDatabase();
    
    const basePort = parseInt(process.env.PORT || PORT, 10) || 3000;
    const server = app.listen(basePort, '0.0.0.0', () => {
      console.log('🚀 EV Problem Tracker with PostgreSQL');
      console.log('Server running on:');
      console.log('  - Local:   http://localhost:' + basePort);
      console.log('  - Network: http://[YOUR_IP]:' + basePort);
    });
    
    server.on('error', err => {
      if(err.code === 'EADDRINUSE') {
        console.error('Port', basePort, 'is in use');
        process.exit(1);
      } else {
        console.error(err);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
