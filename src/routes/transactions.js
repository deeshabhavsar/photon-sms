import express from 'express';
import axios from 'axios';
import { pool } from '../db/client.js';

const router = express.Router();

function knotAuthHeader() {
  const credentials = `${process.env.KNOT_CLIENT_ID}:${process.env.KNOT_SECRET}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

// List available merchants (use this to find merchant_ids)
router.get('/merchants', async (req, res) => {
  try {
    const response = await axios.post(
      `${process.env.KNOT_API_BASE_URL}/merchant/list`,
      { type: 'transaction_link' },
      { headers: { Authorization: knotAuthHeader() } }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Sync transactions for a user + merchant
router.post('/sync', async (req, res) => {
  const { phone, merchant_id, cursor } = req.body;

  if (!phone || !merchant_id) {
    return res.status(400).json({ error: 'phone and merchant_id are required' });
  }

  try {
    const response = await axios.post(
      `${process.env.KNOT_API_BASE_URL}/transactions/sync`,
      { merchant_id, external_user_id: phone, ...(cursor && { cursor }), limit: 100 },
      { headers: { Authorization: knotAuthHeader() } }
    );

    const { transactions, next_cursor } = response.data;

    // Store transactions in DB
    for (const tx of transactions) {
      await pool.query(
        `INSERT INTO purchases (user_id, merchant, sku, product_name, quantity, price, purchased_at)
         SELECT u.id, $2, $3, $4, $5, $6, $7
         FROM users u WHERE u.phone = $1
         ON CONFLICT DO NOTHING`,
        [
          phone,
          response.data.merchant?.name,
          tx.products?.[0]?.name,
          tx.products?.[0]?.name,
          tx.products?.[0]?.quantity ?? 1,
          tx.price?.total,
          tx.datetime
        ]
      );
    }

    res.json({ synced: transactions.length, next_cursor });
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

export default router;
