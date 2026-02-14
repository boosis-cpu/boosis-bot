// src/core/strategy-profile-manager.js
const db = require('./database');
const logger = require('./logger');

class StrategyProfileManager {
    constructor() {
        this.profiles = new Map(); // {symbol: {params}}
    }

    // PASO 1: Cargar perfiles al iniciar
    async loadProfiles() {
        try {
            const result = await db.pool.query(`
        SELECT 
          id, name, symbol, strategy_name,
          rsi_buy_bound, rsi_sell_bound,
          ema_short, ema_long, ema_trend,
          bb_period, bb_std_dev,
          stop_loss_percent,
          is_active
        FROM strategy_profiles
        WHERE is_active = true
      `);

            for (const row of result.rows) {
                this.profiles.set(row.symbol, {
                    id: row.id,
                    name: row.name,
                    strategy: row.strategy_name,
                    rsi: {
                        buy: parseFloat(row.rsi_buy_bound),
                        sell: parseFloat(row.rsi_sell_bound),
                    },
                    ema: {
                        short: parseInt(row.ema_short),
                        long: parseInt(row.ema_long),
                        trend: parseInt(row.ema_trend),
                    },
                    bb: {
                        period: parseInt(row.bb_period),
                        stdDev: parseFloat(row.bb_std_dev),
                    },
                    stopLoss: parseFloat(row.stop_loss_percent),
                });
            }

            logger.info(`[ProfileManager] ✅ ${this.profiles.size} perfiles cargados`);
            return true;
        } catch (error) {
            logger.error(`[ProfileManager] ❌ Error cargando perfiles: ${error.message}`);
            return false;
        }
    }

    // PASO 2: Obtener perfil de un símbolo
    getProfile(symbol) {
        const profile = this.profiles.get(symbol);

        if (!profile) {
            // Create lazy default if it doesn't exist to avoid hard crash
            // In production you might want to force explicit creation
            return this._getDefaultProfile(symbol);
        }

        return profile;
    }

    // PASO 3: Obtener perfil por defecto (fallback)
    _getDefaultProfile(symbol) {
        return {
            name: 'Default Trend',
            symbol: symbol || 'BTCUSDT',
            strategy: 'BoosisTrend',
            rsi: {
                buy: 20,
                sell: 70,
            },
            ema: {
                short: 9,
                long: 21,
                trend: 50,
            },
            bb: {
                period: 20,
                stdDev: 2.5,
            },
            stopLoss: 0.02,
        };
    }

    // PASO 4: Crear o actualizar perfil
    async upsertProfile(symbol, params) {
        try {
            // Validar parámetros
            this._validateParams(params);

            // Default values for robustness
            const rsiBuy = params.rsi?.buy ?? 20;
            const rsiSell = params.rsi?.sell ?? 70;
            const emaShort = params.ema?.short ?? 9;
            const emaLong = params.ema?.long ?? 21;
            const emaTrend = params.ema?.trend ?? 50;
            const bbPeriod = params.bb?.period ?? 20;
            const bbStdDev = params.bb?.stdDev ?? 2.5;
            const stopLoss = params.stopLoss ?? 0.02;
            const strategyName = params.strategy || 'BoosisTrend';
            const name = params.name || `${symbol} Profile`;

            const query = `
        INSERT INTO strategy_profiles 
        (name, symbol, strategy_name, rsi_buy_bound, rsi_sell_bound, 
         ema_short, ema_long, ema_trend, bb_period, bb_std_dev, 
         stop_loss_percent, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
        ON CONFLICT (symbol) DO UPDATE SET
          name = $1,
          strategy_name = $3,
          rsi_buy_bound = $4,
          rsi_sell_bound = $5,
          ema_short = $6,
          ema_long = $7,
          ema_trend = $8,
          bb_period = $9,
          bb_std_dev = $10,
          stop_loss_percent = $11,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id;
      `;

            const result = await db.pool.query(query, [
                name,
                symbol,
                strategyName,
                rsiBuy,
                rsiSell,
                emaShort,
                emaLong,
                emaTrend,
                bbPeriod,
                bbStdDev,
                stopLoss,
            ]);

            // Actualizar en memoria
            const newProfile = {
                id: result.rows[0].id,
                name,
                symbol,
                strategy: strategyName,
                rsi: { buy: rsiBuy, sell: rsiSell },
                ema: { short: emaShort, long: emaLong, trend: emaTrend },
                bb: { period: bbPeriod, stdDev: bbStdDev },
                stopLoss,
            };

            this.profiles.set(symbol, newProfile);

            logger.info(`[ProfileManager] ✅ Perfil guardado: ${symbol}`);
            return result.rows[0].id;
        } catch (error) {
            logger.error(`[ProfileManager] ❌ Error guardando perfil: ${error.message}`);
            throw error;
        }
    }

    // PASO 5: Validar parámetros
    _validateParams(params) {
        if (params.rsi?.buy < 0 || params.rsi?.buy > 100) {
            throw new Error('RSI buy debe estar entre 0-100');
        }

        if (params.rsi?.sell < 0 || params.rsi?.sell > 100) {
            throw new Error('RSI sell debe estar entre 0-100');
        }

        if (params.ema?.short <= 0 || params.ema?.long <= 0) {
            throw new Error('EMA periods deben ser positivos');
        }

        if (params.bb?.period <= 0 || params.bb?.stdDev <= 0) {
            throw new Error('BB period y stdDev deben ser positivos');
        }
    }

    // PASO 6: Obtener historial de cambios
    async getChangeHistory(symbol, limit = 10) {
        try {
            const result = await db.pool.query(`
        SELECT 
          id, action, field_changed, old_value, new_value, 
          changed_by, changed_at
        FROM strategy_changes
        WHERE symbol = $1
        ORDER BY changed_at DESC
        LIMIT $2
      `, [symbol, limit]);

            return result.rows;
        } catch (error) {
            logger.error(`[ProfileManager] Error obteniendo historial: ${error.message}`);
            return [];
        }
    }

    // PASO 7: Listar todos los perfiles
    listProfiles() {
        return Array.from(this.profiles.values());
    }
}

module.exports = new StrategyProfileManager();
