import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '../src/db/schema.sql'), 'utf8');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
await client.query(sql);
console.log('Database schema created successfully.');
await client.end();
