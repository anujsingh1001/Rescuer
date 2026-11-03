
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';
import jwtModule from 'jsonwebtoken';
import multer from 'multer';

import { pool, checkDb } from './db.js';
import { authenticate, allow, signToken } from './auth.js';

async function initializeDatabase() {
  const schema = await readFile(
    new URL('../../database/init.sql', import.meta.url),
    'utf8'
  );

  await pool.query(schema);
  console.log('Database schema initialized successfully');
}

const app = express();
const httpServer = http.createServer(app);

const allowedOrigins = (
  process.env.CLIENT_URL || 'http://localhost:5173'
).split(',').map(s => s.trim());

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH']
  }
});

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));

// Image upload configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'image/jpeg') {
      return cb(new Error('Only JPEG images are allowed'));
    }
    cb(null, true);
  }
});

io.on('connection', socket => {
  socket.on('authenticate', ({ token }) => {
    try {
      const payload = jwtModule.verify(token, process.env.JWT_SECRET);
      socket.join(`user:${payload.id}`);

      if (payload.role === 'NGO') socket.join('ngos');
      if (payload.role === 'ADMIN') socket.join('admins');
    } catch {
      socket.emit('socket:error', {
        message: 'Socket authentication failed'
      });
    }
  });
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected'
    });
  }
});

// Register
app.post('/api/auth/register', async (req, res) => {
  const {
    name, email, phone, password, role,
    organizationName, city, state, address,
    latitude, longitude, description
  } = req.body;

  if (
    !name || !email || !phone || !password ||
    !['CITIZEN', 'NGO'].includes(role)
  ) {
    return res.status(400).json({
      message: 'Please provide all required fields and a valid account type'
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      message: 'Password must be at least 8 characters'
    });
  }

  if (role === 'NGO' && (!organizationName || !city || !state)) {
    return res.status(400).json({
      message: 'NGO name, city and state are required'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const hash = await bcrypt.hash(password, 12);

    const result = await client.query(
      `INSERT INTO users(name,email,phone,password_hash,role)
       VALUES($1,$2,$3,$4,$5)
       RETURNING id,name,email,phone,role`,
      [name, email.toLowerCase(), phone, hash, role]
    );

    const user = result.rows[0];
    let ngo = null;

    if (role === 'NGO') {
      const n = await client.query(
        `INSERT INTO ngos(
          user_id,organization_name,description,city,state,
          address,latitude,longitude
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id,organization_name,verified`,
        [
          user.id, organizationName, description || '',
          city, state, address || '',
          latitude || null, longitude || null
        ]
      );

      ngo = n.rows[0];
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: role === 'NGO'
        ? 'NGO registered. Your account is pending admin verification.'
        : 'Registration successful',
      user,
      ngo,
      token: signToken(user)
    });
  } catch (e) {
    console.error('Registration failed:', e);
    await client.query('ROLLBACK');

    res.status(e.code === '23505' ? 409 : 500).json({
      message: e.code === '23505'
        ? 'Email or phone already registered'
        : 'Registration failed'
    });
  } finally {
    client.release();
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password, role } = req.body;

  const result = await pool.query(
    'SELECT * FROM users WHERE email=$1',
    [(email || '').toLowerCase()]
  );

  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({
      message: 'Invalid email or password'
    });
  }

  if (role && user.role !== role) {
    return res.status(403).json({
      message: `This account is registered as ${user.role}`
    });
  }

  if (user.role === 'NGO') {
    const ngo = await pool.query(
      'SELECT verified FROM ngos WHERE user_id=$1',
      [user.id]
    );

    if (!ngo.rows[0]?.verified) {
      return res.status(403).json({
        message: 'Your NGO account is awaiting admin verification'
      });
    }
  }

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role
  };

  res.json({
    user: safeUser,
    token: signToken(safeUser)
  });
});

// Current user
app.get('/api/auth/me', authenticate, async (req, res) => {
  const r = await pool.query(
    'SELECT id,name,email,phone,role FROM users WHERE id=$1',
    [req.user.id]
  );

  if (!r.rows[0]) {
    return res.status(404).json({ message: 'User not found' });
  }

  res.json({ user: r.rows[0] });
});

// Upload animal rescue image to Supabase Storage
app.post(
  '/api/uploads/image',
  authenticate,
  allow('CITIZEN'),
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: 'Please select a photo'
        });
      }

      const supabaseUrl = process.env.SUPABASE_URL;
      const secretKey = process.env.SUPABASE_SECRET_KEY;

      if (!supabaseUrl || !secretKey) {
        return res.status(500).json({
          message: 'Image storage is not configured'
        });
      }

      const fileName = `${randomUUID()}.jpg`;

      const uploadUrl =
        `${supabaseUrl}/storage/v1/object/rescue-images/${fileName}`;

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          apikey: secretKey,
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': req.file.mimetype,
          'x-upsert': 'false'
        },
        body: req.file.buffer
      });

      if (!response.ok) {
        const details = await response.text();
        console.error('Supabase upload failed:', details);

        return res.status(502).json({
          message: 'Image upload failed'
        });
      }

      const imageUrl =
        `${supabaseUrl}/storage/v1/object/public/rescue-images/${fileName}`;

      return res.status(201).json({ imageUrl });
    } catch (error) {
      console.error('Image upload error:', error);

      return res.status(500).json({
        message: 'Could not upload image'
      });
    }
  }
);

// Submit rescue report
app.post('/api/reports', authenticate, allow('CITIZEN'), async (req, res) => {
  const {
    animalType, emergencyType, description, imageUrl,
    city, state, address, latitude, longitude
  } = req.body;

  if (
    !animalType || !emergencyType || !description ||
    !city || !state || !address
  ) {
    return res.status(400).json({
      message: 'Please complete all required fields'
    });
  }

  const r = await pool.query(
    `INSERT INTO rescue_reports(
      citizen_id,animal_type,emergency_type,description,image_url,
      city,state,address,latitude,longitude
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *`,
    [
      req.user.id, animalType, emergencyType, description,
      imageUrl || null, city, state, address,
      latitude ?? null, longitude ?? null
    ]
  );

  const report = r.rows[0];

  const ngos = await pool.query(
    `SELECT n.id,n.user_id,n.organization_name
     FROM ngos n
     JOIN users u ON u.id=n.user_id
     WHERE n.verified=TRUE AND n.available=TRUE
     AND LOWER(n.city)=LOWER($1)
     AND LOWER(n.state)=LOWER($2)`,
    [city, state]
  );

  for (const ngo of ngos.rows) {
    io.to(`user:${ngo.user_id}`).emit('rescue:new', {
      report,
      organizationName: ngo.organization_name
    });
  }

  io.to('admins').emit('rescue:new', { report });

  res.status(201).json({
    report,
    notifiedOrganizations: ngos.rows.length,
    message: 'Rescue request submitted'
  });
});

// Citizen reports
app.get('/api/reports/mine', authenticate, allow('CITIZEN'), async (req, res) => {
  const r = await pool.query(
    'SELECT * FROM rescue_reports WHERE citizen_id=$1 ORDER BY created_at DESC',
    [req.user.id]
  );

  res.json({ reports: r.rows });
});

// NGO profile
app.get('/api/ngo/profile', authenticate, allow('NGO'), async (req, res) => {
  const r = await pool.query(
    'SELECT n.* FROM ngos n WHERE n.user_id=$1',
    [req.user.id]
  );

  res.json({ ngo: r.rows[0] || null });
});

// NGO reports
app.get('/api/ngo/reports', authenticate, allow('NGO'), async (req, res) => {
  const n = await pool.query(
    'SELECT * FROM ngos WHERE user_id=$1 AND verified=TRUE',
    [req.user.id]
  );

  if (!n.rows[0]) {
    return res.status(403).json({ message: 'NGO not verified' });
  }

  const ngo = n.rows[0];

  const r = await pool.query(
    `SELECT rr.*, u.name AS citizen_name, u.phone AS citizen_phone
     FROM rescue_reports rr
     JOIN users u ON u.id=rr.citizen_id
     WHERE LOWER(rr.city)=LOWER($1)
     AND LOWER(rr.state)=LOWER($2)
     AND (rr.assigned_ngo_id IS NULL OR rr.assigned_ngo_id=$3)
     ORDER BY rr.created_at DESC`,
    [ngo.city, ngo.state, ngo.id]
  );

  res.json({ reports: r.rows });
});

// Update rescue status
app.patch(
  '/api/ngo/reports/:id/status',
  authenticate,
  allow('NGO'),
  async (req, res) => {
    const { status } = req.body;

    const valid = [
      'ACCEPTED',
      'RESCUE_IN_PROGRESS',
      'TREATMENT_IN_PROGRESS',
      'COMPLETED',
      'REJECTED'
    ];

    if (!valid.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const n = await pool.query(
      'SELECT * FROM ngos WHERE user_id=$1 AND verified=TRUE',
      [req.user.id]
    );

    if (!n.rows[0]) {
      return res.status(403).json({ message: 'NGO not verified' });
    }

    const ngo = n.rows[0];
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const r = await client.query(
        'SELECT * FROM rescue_reports WHERE id=$1 FOR UPDATE',
        [req.params.id]
      );

      if (!r.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Report not found' });
      }

      const report = r.rows[0];

      if (report.assigned_ngo_id && report.assigned_ngo_id !== ngo.id) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'Already assigned to another NGO'
        });
      }

      if (status === 'ACCEPTED' && report.status !== 'PENDING') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'This request is no longer pending'
        });
      }

      const updated = await client.query(
        `UPDATE rescue_reports
         SET status=$1, assigned_ngo_id=$2, updated_at=NOW()
         WHERE id=$3 RETURNING *`,
        [status, status === 'REJECTED' ? null : ngo.id, req.params.id]
      );

      await client.query('COMMIT');

      io.to(`user:${report.citizen_id}`).emit('rescue:updated', {
        report: updated.rows[0]
      });

      res.json({ report: updated.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      res.status(500).json({
        message: 'Could not update request'
      });
    } finally {
      client.release();
    }
  }
);

// Pending NGO registrations
app.get('/api/admin/ngos/pending', authenticate, allow('ADMIN'), async (_req, res) => {
  const r = await pool.query(
    `SELECT n.*,u.name,u.email,u.phone
     FROM ngos n
     JOIN users u ON u.id=n.user_id
     WHERE n.verified=FALSE
     ORDER BY n.created_at`
  );

  res.json({ ngos: r.rows });
});

// Approve NGO
app.patch('/api/admin/ngos/:id/approve', authenticate, allow('ADMIN'), async (req, res) => {
  const r = await pool.query(
    'UPDATE ngos SET verified=TRUE WHERE id=$1 RETURNING *',
    [req.params.id]
  );

  if (!r.rows[0]) {
    return res.status(404).json({ message: 'NGO not found' });
  }

  io.to(`user:${r.rows[0].user_id}`).emit('ngo:approved', {
    message: 'Your NGO has been verified'
  });

  res.json({
    ngo: r.rows[0],
    message: 'NGO approved'
  });
});

// Bootstrap admin
app.post('/api/admin/bootstrap', async (req, res) => {
  if (
    !process.env.BOOTSTRAP_SECRET ||
    req.headers['x-bootstrap-secret'] !== process.env.BOOTSTRAP_SECRET
  ) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const count = await pool.query(
    "SELECT COUNT(*)::int AS count FROM users WHERE role='ADMIN'"
  );

  if (count.rows[0].count > 0) {
    return res.status(409).json({
      message: 'An admin already exists'
    });
  }

  const r = await pool.query(
    "UPDATE users SET role='ADMIN' WHERE email=$1 RETURNING id,email,role",
    [(req.body.email || '').toLowerCase()]
  );

  if (!r.rows[0]) {
    return res.status(404).json({
      message: 'Register this email first'
    });
  }

  res.json({
    user: r.rows[0],
    message: 'Admin role assigned. Rotate bootstrap secret now.'
  });
});

// Handle upload and other errors
app.use((err, _req, res, _next) => {
  console.error(err);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      message: err.code === 'LIMIT_FILE_SIZE'
        ? 'Image must be 5 MB or smaller'
        : 'Invalid image upload'
    });
  }

  if (err.message === 'Only JPEG images are allowed') {
    return res.status(400).json({ message: err.message });
  }

  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

initializeDatabase()
  .then(() => checkDb())
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`API listening on ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
