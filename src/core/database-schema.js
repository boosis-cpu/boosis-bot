// src/core/database-schema.js
const DatabaseSchema = {
  async init(pool) {
    // 1. Tabla: candles
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candles (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        open_time BIGINT NOT NULL UNIQUE,
        open DECIMAL(20,8), high DECIMAL(20,8),
        low DECIMAL(20,8), close DECIMAL(20,8),
        volume DECIMAL(20,8),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Tabla: trades
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20), side VARCHAR(10),
        price DECIMAL(20,8), quantity DECIMAL(20,8),
        is_paper BOOLEAN DEFAULT true,
        timestamp BIGINT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Tabla: trading_settings (NUEVA)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trading_settings (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) UNIQUE,
        strategy_name VARCHAR(100),
        is_active BOOLEAN DEFAULT false,
        mode VARCHAR(20) DEFAULT 'PAPER',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Tabla: active_position (NUEVA)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS active_position (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) UNIQUE,
        side VARCHAR(10), quantity DECIMAL(20,8),
        entry_price DECIMAL(20,8), entry_time TIMESTAMP
      )
    `);

    // 5. Tabla: strategy_profiles (NUEVA - Pro)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS strategy_profiles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100), symbol VARCHAR(20) UNIQUE,
        strategy_name VARCHAR(100),
        rsi_buy_bound DECIMAL(5,2) DEFAULT 20,
        rsi_sell_bound DECIMAL(5,2) DEFAULT 70,
        ema_short INTEGER DEFAULT 9,
        ema_long INTEGER DEFAULT 21,
        ema_trend INTEGER DEFAULT 50,
        bb_period INTEGER DEFAULT 20,
        bb_std_dev DECIMAL(3,1) DEFAULT 2.5,
        stop_loss_percent DECIMAL(5,4) DEFAULT 0.02,
        is_active BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5.1 Tabla: strategy_changes (Auditoría)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS strategy_changes (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        action VARCHAR(50), 
        field_changed VARCHAR(100),
        old_value TEXT,
        new_value TEXT,
        changed_by VARCHAR(100) DEFAULT 'system',
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. Tabla: api_credentials (NUEVA - Encriptado)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_credentials (
        id SERIAL PRIMARY KEY,
        user_id INTEGER DEFAULT 1,
        exchange VARCHAR(50) DEFAULT 'binance',
        api_key_encrypted TEXT NOT NULL,
        api_secret_encrypted TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        last_used TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_user_exchange UNIQUE(user_id, exchange)
      );
      
      CREATE INDEX IF NOT EXISTS idx_api_credentials_user 
        ON api_credentials(user_id);
    `);

    console.log('[DB] ✅ Esquema creado');
  }
};

module.exports = DatabaseSchema;
