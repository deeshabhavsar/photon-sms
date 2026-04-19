import express from 'express';
import dotenv from 'dotenv';
import { pool } from './db/client.js';
import knotOAuthRouter from './routes/knot-oauth.js';
import transactionsRouter from './routes/transactions.js';
import { startSmsHandler } from './sms-handler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Routes
app.use('/auth/knot', knotOAuthRouter);
app.use('/webhooks/knot', knotOAuthRouter);
app.use('/transactions', transactionsRouter);

// Expose non-secret client config to frontend
app.get('/config', (req, res) => {
  res.json({ knotClientId: process.env.KNOT_CLIENT_ID });
});

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
  startSmsHandler().catch(err => console.error('SMS handler failed to start:', err));
});