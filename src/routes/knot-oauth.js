import express from 'express';
import axios from 'axios';
import { pool } from '../db/client.js';

const router = express.Router();

function knotAuthHeader() {
  const credentials = `${process.env.KNOT_CLIENT_ID}:${process.env.KNOT_SECRET}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

function toE164(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

// Create a Knot session for a user (call this before initializing the SDK)
router.post('/session', async (req, res) => {
  const { merchant_id } = req.body;
  const phone = toE164(req.body.phone ?? '');

  if (!phone) {
    return res.status(400).json({ error: 'phone is required' });
  }

  try {
    const response = await axios.post(
      `${process.env.KNOT_API_BASE_URL}/session/create`,
      {
        type: 'transaction_link',
        external_user_id: phone,
        phone_number: phone,
        ...(merchant_id && { merchant_id })
      },
      { headers: { Authorization: knotAuthHeader() } }
    );

    // Upsert user into DB
    await pool.query(
      `INSERT INTO users (phone) VALUES ($1)
       ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()`,
      [phone]
    );

    res.json({ session: response.data.session });
  } catch (error) {
    console.error('Knot session error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create Knot session' });
  }
});

// Webhook handler — Knot notifies us when accounts are linked or transactions are ready
router.post('/webhook', async (req, res) => {
  console.log('Knot webhook full body:', JSON.stringify(req.body, null, 2));
  const { event, external_user_id, merchant } = req.body;
  const merchant_id = merchant?.id;

  if (event === 'NEW_TRANSACTIONS_AVAILABLE' && external_user_id && merchant_id) {
    try {
      const response = await axios.post(
        `${process.env.KNOT_API_BASE_URL}/transactions/sync`,
        { merchant_id, external_user_id, limit: 100 },
        { headers: { Authorization: knotAuthHeader() } }
      );
      console.log(`Synced ${response.data.transactions?.length} transactions for ${external_user_id}`);
    } catch (err) {
      console.error('Auto-sync failed:', err.response?.data || err.message);
    }
  }

  res.sendStatus(200);
});

export default router;
