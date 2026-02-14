// src/core/database-schema.js
const DatabaseSchema = {
  async init(pool) {
    // 1. Tabla: candles
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candles (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        open_time BIGINT NOT NULL,
        open DECIMAL(20,8), high DECIMAL(20,8),
        low DECIMAL(20,8), close DECIMAL(20,8),
        volume DECIMAL(20,8),
        close_time BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol, open_time)
      )
    `);

    // 2. Tabla: trades
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20), side VARCHAR(10),
        price DECIMAL(20,8), amount DECIMAL(20,8),
        type VARCHAR(20) DEFAULT 'PAPER',
        reason TEXT,
        timestamp BIGINT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Tabla: trading_settings (Estructura Key-Value para estados globales)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trading_settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Tabla: active_position
    await pool.query(`
      CREATE TABLE IF NOT EXISTS active_position (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) UNIQUE,
        side VARCHAR(10), amount DECIMAL(20,8),
        entry_price DECIMAL(20,8), is_paper BOOLEAN DEFAULT true,
        timestamp BIGINT
      )
    `);

    // 5. Tabla: strategy_profiles (Parámetros por símbolo)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS strategy_profiles (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) UNIQUE,
        name VARCHAR(100) DEFAULT 'Default',
        strategy_name VARCHAR(100) DEFAULT 'BoosisTrend',
        rsi_buy_bound DECIMAL(5,2) DEFAULT 25,
        rsi_sell_bound DECIMAL(5,2) DEFAULT 75,
        ema_short INTEGER DEFAULT 12,
        ema_long INTEGER DEFAULT 26,
        ema_trend INTEGER DEFAULT 50,
        bb_period INTEGER DEFAULT 20,
        bb_std_dev DECIMAL(3,1) DEFAULT 2.0,
        stop_loss_percent DECIMAL(5,4) DEFAULT 0.02,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. Tabla: active_trading_pairs (NUEVA - Phase 8 Multi-Asset)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS active_trading_pairs (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) UNIQUE,
        strategy_name VARCHAR(100) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 7. Tabla: strategy_changes (Auditoría)
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

    // 8. Tabla: api_credentials (Encriptado)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_credentials (
        id SERIAL PRIMARY KEY,
        exchange VARCHAR(50) DEFAULT 'binance',
        api_key_encrypted TEXT NOT NULL,
        api_secret_encrypted TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(exchange)
      )
    `);

    console.log('[DB] ✅ Esquema actualizado para Phase 8');
  }
};

module.exports = DatabaseSchema;
