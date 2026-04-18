// Placeholder for now - we'll add query functions here later
import { pool } from './client.js';

export async function getUserByPhone(phone) {
  const result = await pool.query(
    'SELECT * FROM users WHERE phone = $1',
    [phone]
  );
  return result.rows[0];
}

export async function createUser(phone, name) {
  const result = await pool.query(
    'INSERT INTO users (phone, name) VALUES ($1, $2) RETURNING *',
    [phone, name]
  );
  return result.rows[0];
}

export async function storeMessage(userId, direction, body) {
  await pool.query(
    'INSERT INTO messages (user_id, direction, body) VALUES ($1, $2, $3)',
    [userId, direction, body]
  );
}