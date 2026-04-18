import express from 'express';
import axios from 'axios';
import { pool } from '../db/client.js';

const router = express.Router();

// Step 1: Redirect user to Knot OAuth
router.get('/', (req, res) => {
  const { phone } = req.query;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number required' });
  }

  // Store phone in session/state (for hackathon, we'll use query param)
  const state = Buffer.from(JSON.stringify({ phone })).toString('base64');

  const authUrl = `${process.env.KNOT_API_BASE_URL}/oauth/authorize?` +
    `client_id=${process.env.KNOT_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(process.env.KNOT_REDIRECT_URI)}&` +
    `response_type=code&` +
    `state=${state}`;

  res.redirect(authUrl);
});

// Step 2: Handle OAuth callback from Knot
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('Authorization failed - no code received');
  }

  try {
    // Decode state to get phone
    const { phone } = JSON.parse(Buffer.from(state, 'base64').toString());

    // Exchange code for access token
    const tokenResponse = await axios.post(
      `${process.env.KNOT_API_BASE_URL}/oauth/token`,
      {
        grant_type: 'authorization_code',
        code,
        client_id: process.env.KNOT_CLIENT_ID,
        client_secret: process.env.KNOT_CLIENT_SECRET,
        redirect_uri: process.env.KNOT_REDIRECT_URI
      }
    );

    const { access_token, refresh_token, user_id } = tokenResponse.data;

    // Store tokens in database
    await pool.query(
      `INSERT INTO users (phone, knot_user_id, knot_access_token, knot_refresh_token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (phone) DO UPDATE
       SET knot_user_id = $2, knot_access_token = $3, knot_refresh_token = $4, updated_at = NOW()`,
      [phone, user_id, access_token, refresh_token]
    );

    console.log(`✅ Knot connected for user: ${phone}`);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connected!</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 50px; }
          .success { color: #10b981; font-size: 48px; }
          p { font-size: 18px; color: #666; }
        </style>
      </head>
      <body>
        <div class="success">✓</div>
        <h1>Account Connected!</h1>
        <p>Your purchase data is now linked. You can close this window and start texting your money coach.</p>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ Knot OAuth error:', error.response?.data || error.message);
    res.status(500).send('Failed to connect account. Please try again.');
  }
});

export default router;