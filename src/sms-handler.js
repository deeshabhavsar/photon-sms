import { Spectrum } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import axios from 'axios';
import { pool } from './db/client.js';

async function getUserAndPurchases(phone) {
  const userRes = await pool.query(`SELECT id, name FROM users WHERE phone = $1`, [phone]);
  if (!userRes.rows.length) return null;

  const userId = userRes.rows[0].id;
  const name = userRes.rows[0].name;

  const purchasesRes = await pool.query(
    `SELECT merchant, product_name, quantity, price, category, purchased_at
     FROM purchases WHERE user_id = $1
     ORDER BY purchased_at DESC LIMIT 20`,
    [userId]
  );

  return { userId, name, purchases: purchasesRes.rows };
}

function formatPurchasesForPrompt(purchases) {
  if (!purchases.length) return 'No transaction history available yet.';
  return purchases
    .map(p => `- ${p.merchant}: ${p.product_name} x${p.quantity} = $${p.price} on ${new Date(p.purchased_at).toLocaleDateString()}`)
    .join('\n');
}

const SYSTEM_PROMPT = `You are Money Coach, a friendly, concise financial assistant. Your job is to help the user understand spending, stay organized, and spot ways to spend less—without being judgmental.

Behavior:

Expense awareness: When the user mentions amounts, merchants, or categories, restate them clearly (date, merchant, category, amount) if known. If information is missing, ask one short follow-up at a time.

Tracking habits: Suggest simple habits: weekly review, category budgets, separating fixed vs variable costs. Offer a tiny next step (one action they can do in 5 minutes).

Cheaper options / savings: Give practical alternatives: generic brands, meal prep vs takeout, public transit vs ride-share. Compare options with clear tradeoffs (time vs money, convenience vs cost). If you lack real prices, use ranges and label them illustrative.

Accuracy & limits: Do not invent transactions, balances, or APRs. If you don't have data, say so. This is educational guidance, not tax, legal, or personalized investment advice.

Style: Short paragraphs or brief bullet lists for comparisons. Warm, direct, no shame. Prefer one clear recommendation plus one optional alternative. Replies should be 2-4 sentences—concise enough for SMS but complete enough to be useful.

Safety: If the user seems in financial distress (can't pay rent, eviction, crisis debt), encourage nonprofit credit counseling and local support resources.

You only use numbers and merchants that come from the user's purchase data provided to you. Never guess missing financial figures.`;

async function generateResponse(userQuestion, purchases, userName) {
  const greeting = userName ? `The user's name is ${userName}.` : '';
  const response = await axios.post(
    'https://api.k2think.ai/v1/chat/completions',
    {
      model: 'MBZUAI-IFM/K2-Think-v2',
      stream: false,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT + (greeting ? `\n\n${greeting}` : '')
        },
        {
          role: 'user',
          content: `Recent purchases:\n${formatPurchasesForPrompt(purchases)}\n\n${userQuestion}`
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.K2_API_KEY}`,
        'Content-Type': 'application/json',
      }
    }
  );
  const raw = response.data.choices[0].message.content;
  const afterThink = raw.includes('</think>') ? raw.split('</think>').pop() : raw;
  return afterThink
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^[-•]\s+/gm, '')
    .replace(/→/g, '-')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

async function saveMessage(userId, direction, body) {
  await pool.query(
    `INSERT INTO messages (user_id, direction, body) VALUES ($1, $2, $3)`,
    [userId, direction, body]
  );
}

export async function startSmsHandler() {
  if (!process.env.PHOTON_PROJECT_ID || !process.env.PHOTON_PROJECT_SECRET) {
    console.warn('⚠️  PHOTON_PROJECT_ID or PHOTON_PROJECT_SECRET not set — SMS handler disabled');
    return;
  }
  if (!process.env.K2_API_KEY) {
    console.warn('⚠️  K2_API_KEY not set — SMS handler disabled');
    return;
  }

  const app = await Spectrum({
    projectId: process.env.PHOTON_PROJECT_ID,
    projectSecret: process.env.PHOTON_PROJECT_SECRET,
    providers: [imessage.config()],
  });

  console.log('📱 SMS handler listening for messages...');

  for await (const [space, message] of app.messages) {
    if (message.content.type !== 'text') continue;

    const senderId = message.sender.id;
    const text = message.content.text.trim();

    console.log(`📨 SMS from ${senderId}: ${text}`);

    try {
      const userData = await getUserAndPurchases(senderId);

      if (!userData) {
        await space.send("Hi! I don't have your account linked yet. Visit our app to connect your accounts first.");
        continue;
      }

      await saveMessage(userData.userId, 'inbound', text);

      const reply = await generateResponse(text, userData.purchases, userData.name);

      await space.send(reply);
      await saveMessage(userData.userId, 'outbound', reply);

      console.log(`📤 Replied to ${senderId}: ${reply}`);
    } catch (err) {
      console.error('SMS handler error:', err);
      await space.send("Sorry, I'm having trouble right now. Try again in a moment.");
    }
  }
}
