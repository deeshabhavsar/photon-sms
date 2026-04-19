import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows } = await client.query(`SELECT id FROM users WHERE phone = '+13475817598'`);
if (!rows.length) {
  console.error('User +13475817598 not found in DB');
  await client.end();
  process.exit(1);
}
const userId = rows[0].id;

const transactions = [
  { merchant: 'DoorDash', product_name: 'Chipotle Burrito Bowl', quantity: 1, price: 14.50, category: 'Food Delivery', purchased_at: '2026-04-15 12:30:00' },
  { merchant: 'DoorDash', product_name: 'McDonalds Big Mac Meal', quantity: 1, price: 11.99, category: 'Food Delivery', purchased_at: '2026-04-14 19:45:00' },
  { merchant: 'DoorDash', product_name: 'Starbucks Latte', quantity: 2, price: 12.00, category: 'Coffee', purchased_at: '2026-04-13 08:15:00' },
  { merchant: 'DoorDash', product_name: 'Chipotle Burrito Bowl', quantity: 1, price: 14.75, category: 'Food Delivery', purchased_at: '2026-04-10 13:00:00' },
  { merchant: 'DoorDash', product_name: 'Shake Shack Burger', quantity: 1, price: 16.00, category: 'Food Delivery', purchased_at: '2026-04-08 20:00:00' },
  { merchant: 'Uber Eats', product_name: 'Sushi Platter', quantity: 1, price: 42.00, category: 'Food Delivery', purchased_at: '2026-04-17 18:30:00' },
  { merchant: 'Uber Eats', product_name: 'Pizza Margherita', quantity: 1, price: 22.50, category: 'Food Delivery', purchased_at: '2026-04-16 21:00:00' },
  { merchant: 'Uber Eats', product_name: 'Thai Green Curry', quantity: 2, price: 28.00, category: 'Food Delivery', purchased_at: '2026-04-12 19:15:00' },
  { merchant: 'Uber Eats', product_name: 'Burrito Bowl', quantity: 1, price: 15.25, category: 'Food Delivery', purchased_at: '2026-04-09 12:45:00' },
  { merchant: 'Uber Eats', product_name: 'Sushi Platter', quantity: 1, price: 38.00, category: 'Food Delivery', purchased_at: '2026-04-05 18:00:00' },
];

for (const tx of transactions) {
  await client.query(
    `INSERT INTO purchases (user_id, merchant, product_name, quantity, price, category, purchased_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
    [userId, tx.merchant, tx.product_name, tx.quantity, tx.price, tx.category, tx.purchased_at]
  );
}

console.log(`Seeded ${transactions.length} transactions for user ${userId} (+13475817598)`);
await client.end();
