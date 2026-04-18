-- Drop existing tables if they exist
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS anomalies CASCADE;
DROP TABLE IF EXISTS enriched_prices CASCADE;
DROP TABLE IF EXISTS purchases CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255),
  knot_user_id VARCHAR(255),
  knot_access_token TEXT,
  knot_refresh_token TEXT,
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  radius_miles INT DEFAULT 10,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Purchases table (SKU-level data from Knot)
CREATE TABLE purchases (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  merchant VARCHAR(255),
  brand VARCHAR(255),
  sku VARCHAR(255),
  product_name TEXT,
  quantity INT,
  price DECIMAL(10, 2),
  category VARCHAR(100),
  purchased_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enriched prices (cheaper alternatives)
CREATE TABLE enriched_prices (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(255) NOT NULL,
  retailer VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  in_stock BOOLEAN DEFAULT true,
  store_distance_miles DECIMAL(5, 2),
  fetched_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  UNIQUE(sku, retailer)
);

-- Messages (conversation history for SMS)
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Anomalies (spending alerts)
CREATE TABLE anomalies (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  current_spend DECIMAL(10, 2) NOT NULL,
  avg_spend DECIMAL(10, 2) NOT NULL,
  std_dev DECIMAL(10, 2),
  severity VARCHAR(20) CHECK (severity IN ('mild', 'moderate', 'severe')),
  notified BOOLEAN DEFAULT FALSE,
  detected_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX idx_purchases_user_date ON purchases(user_id, purchased_at DESC);
CREATE INDEX idx_purchases_category ON purchases(user_id, category);
CREATE INDEX idx_purchases_sku ON purchases(user_id, sku);
CREATE INDEX idx_enriched_prices_sku ON enriched_prices(sku, expires_at);
CREATE INDEX idx_messages_user_recent ON messages(user_id, created_at DESC);
CREATE INDEX idx_anomalies_unnotified ON anomalies(user_id, notified) WHERE notified = false;

-- Insert a test user
INSERT INTO users (phone, name, location_lat, location_lng)
VALUES ('+1234567890', 'Test User', 40.7128, -74.0060);