
import axios from 'axios';

const api = axios.create({
    baseURL: '/api'
});

api.interceptors.response.use(
    response => response,
    error => {
        if (error.response && error.response.status === 401) {
            localStorage.removeItem('boosis_token');
            window.location.href = '/'; // Simple redirect to login
        }
        return Promise.reject(error);
    }
);

export const setAuthToken = (token) => {
    if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        delete api.defaults.headers.common['Authorization'];
    }
};

export const login = (password) => api.post('/login', { password });
export const getStatus = () => api.get('/status');
export const getCandles = (limit = 100) => api.get(`/candles?limit=${limit}`);
export const getTrades = (limit = 20) => api.get(`/trades?limit=${limit}`);
export const getHealth = () => api.get('/health');
export const getMetrics = () => api.get('/metrics');
export const setTradingMode = (live) => api.post('/settings/trading-mode', { live });
export const emergencyStop = () => api.post('/emergency-stop');

export default api;
