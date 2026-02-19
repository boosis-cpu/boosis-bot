
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'tonyplascencia',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'boosis_metrics',
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
});

const createTableQuery = `
CREATE TABLE IF NOT EXISTS sniper_orders (
    id              VARCHAR(30) PRIMARY KEY,
    symbol          VARCHAR(20) NOT NULL,
    action          VARCHAR(10) NOT NULL,
    entry_price     DECIMAL(18,8) NOT NULL,
    stop_loss       DECIMAL(18,8) NOT NULL,
    target          DECIMAL(18,8) NOT NULL,
    risk_usd        DECIMAL(10,2) NOT NULL,
    position_size   DECIMAL(18,8),
    position_usdt   DECIMAL(10,2),
    rr_ratio        DECIMAL(5,2),
    notes           TEXT,
    mode            VARCHAR(10) DEFAULT 'PAPER',
    status          VARCHAR(15) DEFAULT 'PENDING',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    filled_at       TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    exit_price      DECIMAL(18,8),
    pnl             DECIMAL(10,2),
    pnl_percent     DECIMAL(8,4)
);
`;

async function main() {
    try {
        console.log('Connecting to database...');
        await pool.query(createTableQuery);
        console.log('✅ Tabs "sniper_orders" created successfully.');
    } catch (err) {
        console.error('❌ Error creating table:', err);
    } finally {
        await pool.end();
    }
}

main();
