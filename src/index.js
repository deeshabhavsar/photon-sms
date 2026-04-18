import express from 'express';
import dotenv from 'dotenv';
import { pool } from './db/client.js';
import knotOAuthRouter from './routes/knot-oauth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Routes
app.use('/auth/knot', knotOAuthRouter);

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Money Coach SMS API',
    endpoints: {
      health: '/',
      knotAuth: '/auth/knot',
      knotCallback: '/auth/knot/callback'
    }
  });
});

// Test database connection
app.get('/health/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', db_time: result.rows[0].now });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Database: ${process.env.DATABASE_URL?.split('@')[1]?.split('/')[1] || 'Not configured'}`);
});