import { Spectrum } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import axios from 'axios';
import { pool } from './db/client.js';
import { createCheckoutSession } from './services/stripe.js';

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

const SYSTEM_PROMPT = `You are a Money Coach named Lanny, a friendly, concise financial assistant. Your job is to help the user understand spending, stay organized, and spot ways to spend less—without being judgmental.

Behavior:

Expense awareness: When the user mentions amounts, merchants, or categories, restate them clearly (date, merchant, category, amount) if known. If information is missing, ask one short follow-up at a time.

Budgets and habits: You manage spending budgets directly — no other app needed. When the user wants to limit a category (food delivery, dining, shopping, etc.), tell them to reply with a command like: "budget $30 food delivery weekly". You will set it up instantly. If active budgets are provided, report current spending vs the cap and flag if they are close or over. Never tell the user to open another app — you handle it here.

Cheaper options / savings: Give practical alternatives: generic brands, meal prep vs takeout, public transit vs ride-share. Compare options with clear tradeoffs (time vs money, convenience vs cost). If you lack real prices, use ranges and label them illustrative.

Accuracy & limits: Do not invent transactions, balances, or APRs. If you don't have data, say so. This is educational guidance, not tax, legal, or personalized investment advice.

Style: Short paragraphs or brief bullet lists for comparisons. Warm, direct, no shame. Prefer one clear recommendation plus one optional alternative. Replies should be 2-4 sentences—concise enough for SMS but complete enough to be useful.

Safety: If the user seems in financial distress (can't pay rent, eviction, crisis debt), encourage nonprofit credit counseling and local support resources.

You only use numbers and merchants that come from the user's purchase data provided to you. Never guess missing financial figures.`;

const BET_TRIGGER_KEYWORDS = /\b(too much|cut back|spend less|stop ordering|save money|help me stop|i keep|every week|every day|need to reduce|out of control|broke|cant stop|can't stop|limit)\b/i;

const BUDGET_CATEGORIES = {
  'food delivery': ['doordash', 'uber eats', 'ubereats', 'grubhub', 'postmates', 'instacart'],
  dining: ['restaurant', 'cafe', 'coffee', 'starbucks', 'chipotle', 'mcdonald', 'burger'],
  shopping: ['amazon', 'target', 'walmart', 'ebay', 'etsy'],
  groceries: ['whole foods', 'trader joe', 'kroger', 'safeway', 'publix'],
  entertainment: ['netflix', 'spotify', 'hulu', 'disney', 'xbox', 'playstation'],
  transport: ['uber', 'lyft', 'metro', 'transit', 'parking'],
};

function normalizeBudgetCategory(raw) {
  const lower = raw.toLowerCase().trim();
  for (const [category] of Object.entries(BUDGET_CATEGORIES)) {
    if (lower.includes(category) || category.includes(lower)) return category;
  }
  return lower;
}

function parseBudgetCommand(text) {
  const match = text.match(/budget\s+\$?(\d+(?:\.\d{2})?)\s+(.+?)\s*(weekly|monthly)?$/i);
  if (!match) return null;
  return {
    amount: parseFloat(match[1]),
    category: normalizeBudgetCategory(match[2]),
    period: (match[3] || 'weekly').toLowerCase(),
  };
}

async function getActiveBudgets(userId) {
  const { rows } = await pool.query(
    `SELECT category, amount, period, starts_at, ends_at FROM budgets
     WHERE user_id = $1 AND status = 'active' AND ends_at > NOW()
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function getBudgetSpending(userId, category, startsAt) {
  const keywords = BUDGET_CATEGORIES[category] || [category];
  const pattern = keywords.map(k => `LOWER(merchant) LIKE '%${k}%' OR LOWER(product_name) LIKE '%${k}%'`).join(' OR ');
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(price::numeric), 0) AS total
     FROM purchases WHERE user_id = $1 AND purchased_at >= $2 AND (${pattern})`,
    [userId, startsAt]
  );
  return parseFloat(rows[0].total);
}

async function createBudget(userId, category, amount, period) {
  const days = period === 'monthly' ? 30 : 7;
  const endsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO budgets (user_id, category, amount, period, ends_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, category, amount, period, endsAt]
  );
  return endsAt;
}

function formatBudgetContext(budgets, spendingMap) {
  if (!budgets.length) return '';
  const lines = budgets.map(b => {
    const spent = spendingMap[b.category] || 0;
    const pct = Math.round((spent / b.amount) * 100);
    const flag = pct >= 100 ? ' OVER BUDGET' : pct >= 80 ? ' (almost at limit)' : '';
    return `- ${b.category}: $${spent.toFixed(2)} of $${b.amount} ${b.period} budget${flag}`;
  });
  return `\nActive budgets:\n${lines.join('\n')}`;
}

async function hasActiveChallenge(userId, merchant) {
  const { rows } = await pool.query(
    `SELECT id FROM challenges WHERE user_id = $1 AND status = 'active'
     AND LOWER(merchant_to_avoid) LIKE $2`,
    [userId, `%${merchant.toLowerCase()}%`]
  );
  return rows.length > 0;
}

function detectTopMerchant(purchases) {
  const totals = {};
  for (const p of purchases) {
    totals[p.merchant] = (totals[p.merchant] || 0) + parseFloat(p.price);
  }
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  return top ? { merchant: top[0], total: top[1] } : null;
}

async function generateResponse(userQuestion, purchases, userName, userId) {
  const greeting = userName ? `The user's name is ${userName}.` : '';

  const shouldProposeBet = BET_TRIGGER_KEYWORDS.test(userQuestion);
  const top = detectTopMerchant(purchases);
  const alreadyHasBet = shouldProposeBet && top
    ? await hasActiveChallenge(userId, top.merchant)
    : false;

  const betInstruction = shouldProposeBet && top && !alreadyHasBet
    ? `\n\nAt the end of your reply, propose a fun commitment bet with a bit of humor. Example tone: "Wanna put your money where your mouth is? Bet $10 you can go 7 days without ${top.merchant} — if you lose, it goes to charity. Just text 'bet $10 no ${top.merchant} 7 days' to lock it in." Keep it light and optional, not pushy.`
    : '';

  const budgets = await getActiveBudgets(userId);
  let budgetContext = '';
  if (budgets.length) {
    const spendingMap = {};
    for (const b of budgets) {
      spendingMap[b.category] = await getBudgetSpending(userId, b.category, b.starts_at);
    }
    budgetContext = formatBudgetContext(budgets, spendingMap);
  }

  const response = await axios.post(
    'https://api.k2think.ai/v1/chat/completions',
    {
      model: 'MBZUAI-IFM/K2-Think-v2',
      stream: false,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT + (greeting ? `\n\n${greeting}` : '') + betInstruction
        },
        {
          role: 'user',
          content: `Recent purchases:\n${formatPurchasesForPrompt(purchases)}${budgetContext}\n\n${userQuestion}`
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

function parseBet(text) {
  const amountMatch = text.match(/\$(\d+(?:\.\d{2})?)/);
  const daysMatch = text.match(/(\d+)\s*days?/i);
  const merchantMatch = text.match(/\b(doordash|uber\s*eats|amazon|starbucks)\b/i);
  if (!amountMatch || !daysMatch || !merchantMatch) return null;
  return {
    betAmount: parseFloat(amountMatch[1]),
    days: parseInt(daysMatch[1]),
    merchant: merchantMatch[1].toLowerCase().replace(/\s+/, ''),
  };
}

async function handleBudget(space, text, userData) {
  const parsed = parseBudgetCommand(text);
  if (!parsed) {
    await space.send('To set a budget, text: "budget $30 food delivery weekly" — include amount, category, and period (weekly or monthly).');
    return;
  }

  const { amount, category, period } = parsed;
  const endsAt = await createBudget(userData.userId, category, amount, period);

  await space.send(
    `Budget set! $${amount} ${period} cap for ${category}. ` +
    `You're starting fresh — $${amount.toFixed(2)} to spend. ` +
    `I'll track it and let you know when you're getting close. Active until ${endsAt.toLocaleDateString()}.`
  );
}

async function handleBet(space, senderId, text, userData) {
  const bet = parseBet(text);
  if (!bet) {
    await space.send('To start a bet, text: "bet $10 no DoorDash 7 days" — include amount, merchant, and days.');
    return;
  }

  const endsAt = new Date(Date.now() + bet.days * 24 * 60 * 60 * 1000);
  const description = `No ${bet.merchant} for ${bet.days} days`;

  const { rows } = await pool.query(
    `INSERT INTO challenges (user_id, description, merchant_to_avoid, bet_amount, charity_slug, ends_at)
     VALUES ($1, $2, $3, $4, 'feeding-america', $5) RETURNING id`,
    [userData.userId, description, bet.merchant, bet.betAmount, endsAt]
  );
  const challengeId = rows[0].id;

  const { url } = await createCheckoutSession({ betAmount: bet.betAmount, description, challengeId });

  await space.send(`Challenge set! No ${bet.merchant} for ${bet.days} days. Pay $${bet.betAmount} to lock it in — if you fail, it goes to Feeding America. Pay here: ${url}`);
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

      const isBudget = /\bbudget\b/i.test(text) && /\$\d+/.test(text);
      if (isBudget) {
        await handleBudget(space, text, userData);
        continue;
      }

      const isBet = /\bbet\b/i.test(text);
      if (isBet) {
        await handleBet(space, senderId, text, userData);
        continue;
      }

      const reply = await generateResponse(text, userData.purchases, userData.name, userData.userId);

      await space.send(reply);
      await saveMessage(userData.userId, 'outbound', reply);

      console.log(`📤 Replied to ${senderId}: ${reply}`);
    } catch (err) {
      console.error('SMS handler error:', err);
      await space.send("Sorry, I'm having trouble right now. Try again in a moment.");
    }
  }
}
