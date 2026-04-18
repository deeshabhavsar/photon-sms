import { pool } from '../src/db/client.js';

const testPurchases = [
  // Grocery - Whole Foods (last week)
  { merchant: 'Whole Foods', brand: 'Chobani', sku: 'CHO-GRK-0-32', product_name: 'Greek Yogurt Plain 0% 32oz', category: 'dairy', quantity: 2, price: 5.98, days_ago: 7 },
  { merchant: 'Whole Foods', brand: 'Organic Valley', sku: 'OV-EGGS-DZ', product_name: 'Organic Eggs Dozen', category: 'dairy', quantity: 1, price: 6.49, days_ago: 7 },
  { merchant: 'Whole Foods', brand: 'Kind', sku: 'KIND-DC-12', product_name: 'Dark Chocolate Nuts & Sea Salt 12-pack', category: 'snacks', quantity: 1, price: 14.99, days_ago: 7 },

  // Supplement - GNC (9 days ago)
  { merchant: 'GNC', brand: 'Optimum Nutrition', sku: 'ON-GS-5LB-VAN', product_name: 'Gold Standard Whey Protein 5lb Vanilla', category: 'supplements', quantity: 1, price: 89.99, days_ago: 9 },
  { merchant: 'GNC', brand: 'Nature Made', sku: 'NM-VD3-2000', product_name: 'Vitamin D3 2000 IU', category: 'supplements', quantity: 1, price: 18.99, days_ago: 9 },

  // Restaurant - Chipotle (recent spike)
  { merchant: 'Chipotle', brand: 'Chipotle', sku: 'CHIPOTLE-BOWL', product_name: 'Burrito Bowl', category: 'restaurant', quantity: 1, price: 12.85, days_ago: 2 },
  { merchant: 'Chipotle', brand: 'Chipotle', sku: 'CHIPOTLE-BOWL', product_name: 'Burrito Bowl', category: 'restaurant', quantity: 1, price: 12.85, days_ago: 5 },
  { merchant: 'Chipotle', brand: 'Chipotle', sku: 'CHIPOTLE-BOWL', product_name: 'Burrito Bowl', category: 'restaurant', quantity: 1, price: 13.25, days_ago: 8 },

  // Coffee - ANOMALY PATTERN (way more than usual)
  { merchant: 'Starbucks', brand: 'Starbucks', sku: 'SB-LATTE-G', product_name: 'Grande Latte', category: 'coffee', quantity: 1, price: 5.95, days_ago: 1 },
  { merchant: 'Starbucks', brand: 'Starbucks', sku: 'SB-LATTE-G', product_name: 'Grande Latte', category: 'coffee', quantity: 1, price: 5.95, days_ago: 2 },
  { merchant: 'Starbucks', brand: 'Starbucks', sku: 'SB-LATTE-G', product_name: 'Grande Latte', category: 'coffee', quantity: 1, price: 5.95, days_ago: 3 },
  { merchant: 'Starbucks', brand: 'Starbucks', sku: 'SB-LATTE-G', product_name: 'Grande Latte', category: 'coffee', quantity: 2, price: 11.90, days_ago: 4 },
  { merchant: 'Starbucks', brand: 'Starbucks', sku: 'SB-LATTE-G', product_name: 'Grande Latte', category: 'coffee', quantity: 1, price: 5.95, days_ago: 6 },
  { merchant: 'Starbucks', brand: 'Starbucks', sku: 'SB-LATTE-G', product_name: 'Grande Latte', category: 'coffee', quantity: 1, price: 5.95, days_ago: 8 },

  // Pharmacy - CVS
  { merchant: 'CVS', brand: 'Advil', sku: 'ADV-IB-200-50', product_name: 'Ibuprofen 200mg 50ct', category: 'pharmacy-otc', quantity: 1, price: 8.99, days_ago: 10 },
  { merchant: 'CVS', brand: 'Zyrtec', sku: 'ZYR-10MG-70', product_name: 'Allergy Relief 10mg 70ct', category: 'pharmacy-otc', quantity: 1, price: 24.99, days_ago: 10 },

  // Fitness - Amazon & Gym
  { merchant: 'Amazon', brand: 'Nike', sku: 'NIKE-RUN-M-10', product_name: 'Running Shoes Mens Size 10', category: 'fitness', quantity: 1, price: 89.99, days_ago: 14 },
  { merchant: 'Equinox', brand: 'Equinox', sku: 'EQ-MONTH-MEMBER', product_name: 'Monthly Membership', category: 'fitness', quantity: 1, price: 250.00, days_ago: 3 },

  // More groceries (establish pattern)
  { merchant: 'Trader Joes', brand: 'Trader Joes', sku: 'TJ-CHICKEN-ORG', product_name: 'Organic Chicken Breast', category: 'grocery-meat', quantity: 2, price: 14.98, days_ago: 5 },
  { merchant: 'Trader Joes', brand: 'Trader Joes', sku: 'TJ-BROCCOLI', product_name: 'Broccoli Florets', category: 'grocery-produce', quantity: 1, price: 3.99, days_ago: 5 },
];

async function seed() {
  try {
    // Get the test user
    const userResult = await pool.query('SELECT id FROM users WHERE phone = $1', ['+1234567890']);

    if (userResult.rows.length === 0) {
      console.error('❌ Test user not found. Run schema.sql first.');
      process.exit(1);
    }

    const userId = userResult.rows[0].id;

    console.log(`🌱 Seeding purchases for user ${userId}...`);

    for (const purchase of testPurchases) {
      const purchaseDate = new Date();
      purchaseDate.setDate(purchaseDate.getDate() - purchase.days_ago);

      await pool.query(
        `INSERT INTO purchases (user_id, merchant, brand, sku, product_name, category, quantity, price, purchased_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId,
          purchase.merchant,
          purchase.brand,
          purchase.sku,
          purchase.product_name,
          purchase.category,
          purchase.quantity,
          purchase.price,
          purchaseDate
        ]
      );
    }

    console.log(`✅ Seeded ${testPurchases.length} test purchases`);

    // Seed some enriched prices (cheaper alternatives)
    console.log('🌱 Seeding enriched prices...');

    const enrichedPrices = [
      { sku: 'ON-GS-5LB-VAN', retailer: 'Costco', price: 68.99, distance: 2.3 },
      { sku: 'ON-GS-5LB-VAN', retailer: 'Amazon', price: 84.99, distance: 0 },
      { sku: 'ON-GS-5LB-VAN', retailer: 'Vitamin Shoppe', price: 87.99, distance: 4.1 },
      { sku: 'CHO-GRK-0-32', retailer: 'Costco', price: 4.99, distance: 2.3 },
      { sku: 'CHO-GRK-0-32', retailer: 'Target', price: 5.49, distance: 1.8 },
    ];

    for (const price of enrichedPrices) {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await pool.query(
        `INSERT INTO enriched_prices (sku, retailer, price, in_stock, store_distance_miles, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (sku, retailer) DO UPDATE
         SET price = $3, fetched_at = NOW(), expires_at = $6`,
        [price.sku, price.retailer, price.price, true, price.distance, expiresAt]
      );
    }

    console.log(`✅ Seeded ${enrichedPrices.length} enriched prices`);
    console.log('✅ Database seeding complete!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
}

seed();