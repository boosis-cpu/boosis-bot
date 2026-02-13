FROM node:20-slim

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install --production

# Copiar el resto del código
COPY . .

# Exponer el puerto del servidor
EXPOSE 3000

# Comando por defecto usando node directamente
CMD ["node", "src/live/LiveTrader.js"]
