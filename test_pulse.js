
require('dotenv').config();
const notifications = require('./src/core/notifications');
const logger = require('./src/core/logger');

async function testPulse() {
    try {
        console.log('📡 Enviando prueba de pulso a Telegram...');
        await notifications.send('💓 **PRUEBA DE PULSO MANUAL**\n\nEstado: ✅ OPERANDO\nSistema: AI Sentinel v2.7\nActivos: IA Infra Focused\nBalance: $200.00 USDT (Simulado)', 'success');
        console.log('✅ Pulso enviado con éxito. Revisa tu Telegram.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error enviando pulso:', error);
        process.exit(1);
    }
}

testPulse();
