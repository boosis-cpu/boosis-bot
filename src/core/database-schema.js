// src/core/database-schema.js
const logger = require('./logger');

const DatabaseSchema = {
  async init(pool) {
    // 1. Tabla: candles
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candles (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        timeframe VARCHAR(10) NOT NULL DEFAULT '1m',
        open_time BIGINT NOT NULL,
        open NUMERIC, high NUMERIC,
        low NUMERIC, close NUMERIC,
        volume NUMERIC,
        close_time BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol, open_time, timeframe)
      )
    `);

    // 2. Tabla: trades
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20), side VARCHAR(10),
        price NUMERIC, amount NUMERIC,
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
        side VARCHAR(10), amount NUMERIC,
        entry_price NUMERIC, is_paper BOOLEAN DEFAULT true,
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
        rsi_buy_bound NUMERIC DEFAULT 25,
        rsi_sell_bound NUMERIC DEFAULT 75,
        ema_short INTEGER DEFAULT 12,
        ema_long INTEGER DEFAULT 26,
        ema_trend INTEGER DEFAULT 50,
        bb_period INTEGER DEFAULT 20,
        bb_std_dev NUMERIC DEFAULT 2.0,
        stop_loss_percent NUMERIC DEFAULT 0.02,
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

    // 9. Tabla: sessions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        expiry BIGINT NOT NULL
      )
    `);

    // 10. Tabla: strategy_library (Biblioteca de Estrategias Guardadas)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS strategy_library (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        strategy_name VARCHAR(100) NOT NULL,
        params JSONB NOT NULL,
        metrics JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name)
      )
    `);

    // 11. Tabla: sniper_orders (NUEVA - Sniper Terminal)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sniper_orders (
        id VARCHAR(50) PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        action VARCHAR(10) NOT NULL,
        entry_price NUMERIC NOT NULL,
        stop_loss NUMERIC NOT NULL,
        target NUMERIC NOT NULL,
        risk_usd NUMERIC NOT NULL,
        position_size NUMERIC,
        position_usdt NUMERIC,
        rr_ratio NUMERIC,
        notes TEXT,
        mode VARCHAR(10) DEFAULT 'PAPER',
        status VARCHAR(20) DEFAULT 'PENDING',
        exit_price NUMERIC,
        pnl NUMERIC,
        pnl_percent NUMERIC,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        filled_at TIMESTAMP,
        closed_at TIMESTAMP
      )
    `);

    logger.info('[DB] Esquema actualizado con Sniper Orders');
  }
};

module.exports = DatabaseSchema;
