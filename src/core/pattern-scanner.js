/**
 * 🎯 PATTERN SCANNER v3.1 — ZigZag Edition (Fixed Focus)
 *
 * Cambios vs v3.0:
 * - Deduplicación: Un mismo patrón se silencia por 12 velas (48h).
 * - Recency: El patrón debe haber terminado recientemente (últimas 30 velas).
 * - Separación: Mínimo 8 velas entre picos para filtrar ruido de corto plazo.
 */

const logger = require('../core/logger');

class PatternScanner {
    constructor() {
        logger.info('[PatternScanner] 🔧 Inicializando nuevo escaneador estructural...');
        this.ZIGZAG_THRESHOLD = 0.01; // 1% mínimo (muy sensible para visualización)
        this.SIMILARITY = 0.15;  // 15% tolerancia (muy flexible)
        this.NECKLINE_ZONE = 0.03; // 3% zona de gatillo
        this.RECENT_CANDLES = 4;    // Aceptar solo patrones de las últimas 4 velas (Ultra-fresco)
        this.MIN_SEPARATION = 3;     // 3 velas entre picos (mínimo estructural para admitir cruces rápidos)

        // Deduplicación: evitar el mismo patrón en bucle
        this._lastDetected = new Map();
        this.DEDUP_CANDLES = 4;        // Silencio muy breve para este timeframe

        this.historicalData = {
            HEAD_AND_SHOULDERS: { successRate: 0.62, avgReturn: 3.5, winRate: 65, minConfidence: 0.55 },
            DOUBLE_TOP_BOTTOM: { successRate: 0.60, avgReturn: 4.2, winRate: 62, minConfidence: 0.55 },
            TRIANGLES: { successRate: 0.58, avgReturn: 2.8, winRate: 58, minConfidence: 0.50 },
            WEDGES: { successRate: 0.55, avgReturn: 2.1, winRate: 56, minConfidence: 0.50 },
        };
    }

    // ─── ZIGZAG ──────────────────────────────────────────────
    _buildZigZag(candles, threshold = this.ZIGZAG_THRESHOLD) {
        if (candles.length < 10) return [];

        const points = [];
        let lastHigh = parseFloat(candles[0][2]);
        let lastLow = parseFloat(candles[0][3]);
        let lastIdx = 0;
        let trend = null; // 'up' | 'down'

        for (let i = 1; i < candles.length; i++) {
            const high = parseFloat(candles[i][2]);
            const low = parseFloat(candles[i][3]);

            if (trend === null) {
                if (high > lastHigh * (1 + threshold)) { trend = 'up'; lastHigh = high; lastIdx = i; }
                else if (low < lastLow * (1 - threshold)) { trend = 'down'; lastLow = low; lastIdx = i; }
                continue;
            }

            if (trend === 'up') {
                if (high > lastHigh) { lastHigh = high; lastIdx = i; }
                else if (low < lastHigh * (1 - threshold)) {
                    points.push({ idx: lastIdx, price: lastHigh, type: 'HIGH' });
                    trend = 'down'; lastLow = low; lastIdx = i;
                }
            } else {
                if (low < lastLow) { lastLow = low; lastIdx = i; }
                else if (high > lastLow * (1 + threshold)) {
                    points.push({ idx: lastIdx, price: lastLow, type: 'LOW' });
                    trend = 'up'; lastHigh = high; lastIdx = i;
                }
            }
        }

        if (trend === 'up') points.push({ idx: lastIdx, price: lastHigh, type: 'HIGH' });
        if (trend === 'down') points.push({ idx: lastIdx, price: lastLow, type: 'LOW' });

        return points;
    }

    // ─── DETECTOR PRINCIPAL ──────────────────────────────────
    detect(lastCandle, candles, isSimulation = false) {
        if (!candles || candles.length < 20) return null;

        const close = parseFloat(lastCandle[4]);
        const candleIdx = candles.length - 1;
        const zz = this._buildZigZag(candles);

        if (zz.length < 3) return null;

        this._simulating = isSimulation;
        const results = [
            this._detectDoubleTopBottom(zz, close, candles, candleIdx),
            this._detectHeadAndShoulders(zz, close, candles, candleIdx),
            this._detectTriangle(zz, close, candles, candleIdx),
            this._detectWedge(zz, close, candles, candleIdx),
        ].filter(p => p && p.detected);
        this._simulating = false;

        if (results.length === 0) return null;

        const best = results.sort((a, b) => b.confidence - a.confidence)[0];

        if (!isSimulation) {
            this._lastDetected.set(best.type + '_' + (best.subType || ''), candleIdx);
            logger.info(`[Scanner] ✅ Detectado ${best.type} en index ${candleIdx} | Config: Thr=${this.ZIGZAG_THRESHOLD}`);
        }

        return best;
    }

    // ─── DEDUP CHECK ─────────────────────────────────────────
    _isDuplicate(type, subType, candleIdx) {
        if (this._simulating) return false;
        const key = type + '_' + (subType || '');
        const last = this._lastDetected.get(key);
        if (last === undefined) return false;
        return (candleIdx - last) < this.DEDUP_CANDLES;
    }

    // ─── DOBLE TECHO / DOBLE PISO ────────────────────────────
    _detectDoubleTopBottom(zz, currentPrice, candles, candleIdx) {
        const highs = zz.filter(p => p.type === 'HIGH');
        const lows = zz.filter(p => p.type === 'LOW');
        const totalCandles = candles.length;

        // DOBLE TECHO
        if (!this._isDuplicate('DOUBLE_TOP_BOTTOM', 'DOUBLE_TOP', candleIdx)) {
            for (let i = 0; i < highs.length - 1; i++) {
                const h1 = highs[i], h2 = highs[i + 1];

                // RECENT: El punto culminante (h2) debe ser reciente
                if (totalCandles - h2.idx > this.RECENT_CANDLES) continue;

                // SEPARATION: Distancia mínima para que sea una estructura real
                if (h2.idx - h1.idx < this.MIN_SEPARATION) continue;

                const sim = Math.abs(h1.price - h2.price) / h1.price;
                if (sim > this.SIMILARITY) continue;

                const between = lows.filter(p => p.idx > h1.idx && p.idx < h2.idx);
                if (between.length === 0) continue;
                const neckline = Math.min(...between.map(p => p.price));

                const nearNeckline = Math.abs(currentPrice - neckline) / neckline < this.NECKLINE_ZONE * 2;
                const belowNeckline = currentPrice < neckline * 1.002;
                if (!nearNeckline && !belowNeckline) continue;

                const target = neckline - (h2.price - neckline);
                const confidence = Math.min(0.88, 0.60 + (1 - sim) * 2 + (belowNeckline ? 0.1 : 0));

                return {
                    detected: true, type: 'DOUBLE_TOP_BOTTOM', subType: 'DOUBLE_TOP',
                    direction: 'BEARISH', confidence,
                    target, entryPrice: currentPrice,
                    stopLoss: h2.price * 1.015,
                    neckline,
                    drawingPoints: [
                        { time: candles[h1.idx][0] / 1000, price: h1.price, label: 'T1' },
                        { time: candles[between[0].idx][0] / 1000, price: neckline, label: 'N' },
                        { time: candles[h2.idx][0] / 1000, price: h2.price, label: 'T2' }
                    ],
                    description: `Doble Techo: $${h1.price.toFixed(0)} / $${h2.price.toFixed(0)} | Neck: $${neckline.toFixed(0)}`
                };
            }
        }

        // DOBLE PISO
        if (!this._isDuplicate('DOUBLE_TOP_BOTTOM', 'DOUBLE_BOTTOM', candleIdx)) {
            for (let i = 0; i < lows.length - 1; i++) {
                const l1 = lows[i], l2 = lows[i + 1];

                if (totalCandles - l2.idx > this.RECENT_CANDLES) continue;
                if (l2.idx - l1.idx < this.MIN_SEPARATION) continue;

                const sim = Math.abs(l1.price - l2.price) / l1.price;
                if (sim > this.SIMILARITY) continue;

                const between = highs.filter(p => p.idx > l1.idx && p.idx < l2.idx);
                if (between.length === 0) continue;
                const neckline = Math.max(...between.map(p => p.price));

                const nearNeckline = Math.abs(currentPrice - neckline) / neckline < this.NECKLINE_ZONE * 2;
                const aboveNeckline = currentPrice > neckline * 0.998;
                if (!nearNeckline && !aboveNeckline) continue;

                const target = neckline + (neckline - l2.price);
                const confidence = Math.min(0.88, 0.60 + (1 - sim) * 2 + (aboveNeckline ? 0.1 : 0));

                return {
                    detected: true, type: 'DOUBLE_TOP_BOTTOM', subType: 'DOUBLE_BOTTOM',
                    direction: 'BULLISH', confidence,
                    target, entryPrice: currentPrice,
                    stopLoss: l2.price * 0.985,
                    neckline,
                    drawingPoints: [
                        { time: candles[l1.idx][0] / 1000, price: l1.price, label: 'B1' },
                        { time: candles[between[0].idx][0] / 1000, price: neckline, label: 'N' },
                        { time: candles[l2.idx][0] / 1000, price: l2.price, label: 'B2' }
                    ],
                    description: `Doble Piso: $${l1.price.toFixed(0)} / $${l2.price.toFixed(0)} | Neck: $${neckline.toFixed(0)}`
                };
            }
        }

        return { detected: false };
    }

    // ─── CABEZA Y HOMBROS ────────────────────────────────────
    _detectHeadAndShoulders(zz, currentPrice, candles, candleIdx) {
        if (this._isDuplicate('HEAD_AND_SHOULDERS', 'BEARISH', candleIdx) &&
            this._isDuplicate('HEAD_AND_SHOULDERS', 'INVERSE', candleIdx)) return { detected: false };

        const highs = zz.filter(p => p.type === 'HIGH');
        const lows = zz.filter(p => p.type === 'LOW');
        const totalCandles = candles.length;

        if (highs.length < 3) return { detected: false };

        // BEARISH H&S
        if (!this._isDuplicate('HEAD_AND_SHOULDERS', 'BEARISH', candleIdx)) {
            for (let i = 0; i < highs.length - 2; i++) {
                const ls = highs[i], head = highs[i + 1], rs = highs[i + 2];

                if (totalCandles - rs.idx > this.RECENT_CANDLES) continue;
                if (rs.idx - ls.idx < this.MIN_SEPARATION * 1.5) continue;

                if (head.price <= ls.price || head.price <= rs.price) continue;
                const sim = Math.abs(ls.price - rs.price) / ls.price;
                if (sim > this.SIMILARITY) continue;

                const v1 = lows.filter(p => p.idx > ls.idx && p.idx < head.idx);
                const v2 = lows.filter(p => p.idx > head.idx && p.idx < rs.idx);
                if (v1.length === 0 || v2.length === 0) continue;

                const neckline = (Math.min(...v1.map(p => p.price)) + Math.min(...v2.map(p => p.price))) / 2;
                const nearNeck = Math.abs(currentPrice - neckline) / neckline < this.NECKLINE_ZONE * 3;
                const belowNeck = currentPrice < neckline * 1.01;
                if (!nearNeck && !belowNeck) continue;

                const confidence = Math.min(0.88, 0.60 + (1 - sim) * 1.5 + (belowNeck ? 0.1 : 0));
                return {
                    detected: true, type: 'HEAD_AND_SHOULDERS', subType: 'BEARISH',
                    direction: 'BEARISH', confidence,
                    target: neckline - (head.price - neckline), entryPrice: currentPrice,
                    stopLoss: rs.price * 1.02, neckline,
                    drawingPoints: [
                        { time: candles[ls.idx][0] / 1000, price: ls.price, label: 'LS' },
                        { time: candles[v1[0].idx][0] / 1000, price: v1[0].price, label: 'N1' },
                        { time: candles[head.idx][0] / 1000, price: head.price, label: 'H' },
                        { time: candles[v2[0].idx][0] / 1000, price: v2[0].price, label: 'N2' },
                        { time: candles[rs.idx][0] / 1000, price: rs.price, label: 'RS' }
                    ],
                    description: `H&S: LS$${ls.price.toFixed(0)} Head$${head.price.toFixed(0)} RS$${rs.price.toFixed(0)}`
                };
            }
        }

        // BULLISH INVERSE H&S
        if (!this._isDuplicate('HEAD_AND_SHOULDERS', 'INVERSE', candleIdx)) {
            const lows2 = zz.filter(p => p.type === 'LOW');
            if (lows2.length >= 3) {
                for (let i = 0; i < lows2.length - 2; i++) {
                    const ls = lows2[i], head = lows2[i + 1], rs = lows2[i + 2];

                    if (totalCandles - rs.idx > this.RECENT_CANDLES) continue;
                    if (rs.idx - ls.idx < this.MIN_SEPARATION * 1.5) continue;

                    if (head.price >= ls.price || head.price >= rs.price) continue;
                    const sim = Math.abs(ls.price - rs.price) / ls.price;
                    if (sim > this.SIMILARITY) continue;

                    const v1 = highs.filter(p => p.idx > ls.idx && p.idx < head.idx);
                    const v2 = highs.filter(p => p.idx > head.idx && p.idx < rs.idx);
                    if (v1.length === 0 || v2.length === 0) continue;

                    const neckline = (Math.max(...v1.map(p => p.price)) + Math.max(...v2.map(p => p.price))) / 2;
                    const nearNeck = Math.abs(currentPrice - neckline) / neckline < this.NECKLINE_ZONE * 3;
                    const aboveNeck = currentPrice > neckline * 0.99;
                    if (!nearNeck && !aboveNeck) continue;

                    const confidence = Math.min(0.88, 0.60 + (1 - sim) * 1.5 + (aboveNeck ? 0.1 : 0));
                    return {
                        detected: true, type: 'HEAD_AND_SHOULDERS', subType: 'INVERSE',
                        direction: 'BULLISH', confidence,
                        target: neckline + (neckline - head.price), entryPrice: currentPrice,
                        stopLoss: rs.price * 0.98, neckline,
                        drawingPoints: [
                            { time: candles[ls.idx][0] / 1000, price: ls.price, label: 'LS' },
                            { time: candles[v1[0].idx][0] / 1000, price: v1[0].price, label: 'N1' },
                            { time: candles[head.idx][0] / 1000, price: head.price, label: 'H' },
                            { time: candles[v2[0].idx][0] / 1000, price: v2[0].price, label: 'N2' },
                            { time: candles[rs.idx][0] / 1000, price: rs.price, label: 'RS' }
                        ],
                        description: `H&S Inverso: LS$${ls.price.toFixed(0)} Head$${head.price.toFixed(0)} RS$${rs.price.toFixed(0)}`
                    };
                }
            }
        }

        return { detected: false };
    }

    // ─── TRIÁNGULO ───────────────────────────────────────────
    _detectTriangle(zz, currentPrice, candles, candleIdx) {
        const highs = zz.filter(p => p.type === 'HIGH').slice(-4);
        const lows = zz.filter(p => p.type === 'LOW').slice(-4);

        if (highs.length < 2 || lows.length < 2) return { detected: false };

        const lastH = highs[highs.length - 1];
        const lastL = lows[lows.length - 1];
        if (candles.length - lastH.idx > this.RECENT_CANDLES) return { detected: false };

        const highSlope = (lastH.price - highs[0].price) / (lastH.idx - highs[0].idx || 1);
        const lowSlope = (lastL.price - lows[0].price) / (lastL.idx - lows[0].idx || 1);

        const converging = (highSlope < 0 && lowSlope > 0) ||
            (highSlope < 0 && lowSlope >= 0) ||
            (highSlope <= 0 && lowSlope > 0);
        if (!converging) return { detected: false };

        let direction = 'BULLISH', subType = 'SYMMETRIC';
        if (highSlope < -0.001 && Math.abs(lowSlope) < 0.001) { subType = 'DESCENDING'; direction = 'BEARISH'; }
        if (lowSlope > 0.001 && Math.abs(highSlope) < 0.001) { subType = 'ASCENDING'; direction = 'BULLISH'; }

        if (this._isDuplicate('TRIANGLES', subType, candleIdx)) return { detected: false };

        const inZone = currentPrice >= lastL.price * 0.99 && currentPrice <= lastH.price * 1.01;
        if (!inZone) return { detected: false };

        const height = lastH.price - lastL.price;
        return {
            detected: true, type: 'TRIANGLES', subType, direction, confidence: 0.62,
            target: direction === 'BULLISH' ? lastH.price + height : lastL.price - height,
            entryPrice: currentPrice,
            stopLoss: direction === 'BULLISH' ? lastL.price * 0.985 : lastH.price * 1.015,
            drawingPoints: [
                { time: candles[highs[0].idx][0] / 1000, price: highs[0].price, label: 'H1' },
                { time: candles[lows[0].idx][0] / 1000, price: lows[0].price, label: 'L1' },
                { time: candles[highs[highs.length - 1].idx][0] / 1000, price: highs[highs.length - 1].price, label: 'H2' },
                { time: candles[lows[lows.length - 1].idx][0] / 1000, price: lows[lows.length - 1].price, label: 'L2' }
            ],
            description: `Triángulo ${subType}`
        };
    }

    // ─── CUÑA ────────────────────────────────────────────────
    _detectWedge(zz, currentPrice, candles, candleIdx) {
        const highs = zz.filter(p => p.type === 'HIGH').slice(-4);
        const lows = zz.filter(p => p.type === 'LOW').slice(-4);

        if (highs.length < 2 || lows.length < 2) return { detected: false };

        const lastH = highs[highs.length - 1];
        const lastL = lows[lows.length - 1];
        if (candles.length - lastH.idx > this.RECENT_CANDLES) return { detected: false };

        const highSlope = (lastH.price - highs[0].price) / (highs.length);
        const lowSlope = (lastL.price - lows[0].price) / (lows.length);

        const bothUp = highSlope > 0 && lowSlope > 0 && lowSlope > highSlope;
        const bothDown = highSlope < 0 && lowSlope < 0 && highSlope < lowSlope;
        if (!bothUp && !bothDown) return { detected: false };

        const subType = bothUp ? 'RISING_WEDGE' : 'FALLING_WEDGE';
        const direction = bothUp ? 'BEARISH' : 'BULLISH';

        if (this._isDuplicate('WEDGES', subType, candleIdx)) return { detected: false };

        const inZone = currentPrice >= lastL.price * 0.985 && currentPrice <= lastH.price * 1.015;
        if (!inZone) return { detected: false };

        const height = Math.abs(highs[0].price - lows[0].price);
        return {
            detected: true, type: 'WEDGES', subType,
            direction, confidence: 0.60,
            target: direction === 'BULLISH' ? lastH.price + height * 0.618 : lastL.price - height * 0.618,
            entryPrice: currentPrice,
            stopLoss: direction === 'BULLISH' ? lastL.price * 0.985 : lastH.price * 1.015,
            drawingPoints: [
                { time: candles[highs[0].idx][0] / 1000, price: highs[0].price, label: 'H1' },
                { time: candles[lows[0].idx][0] / 1000, price: lows[0].price, label: 'L1' },
                { time: candles[highs[highs.length - 1].idx][0] / 1000, price: highs[highs.length - 1].price, label: 'H2' },
                { time: candles[lows[lows.length - 1].idx][0] / 1000, price: lows[lows.length - 1].price, label: 'L2' }
            ],
            description: `Cuña ${subType === 'RISING_WEDGE' ? 'Rising' : 'Falling'}`
        };
    }

    getReport() {
        return { historicalPatterns: this.historicalData };
    }
}

module.exports = PatternScanner;
