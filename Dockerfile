FROM node:20-slim

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install --production

# Copiar el resto del código
COPY . .

# Comando por defecto (puedes cambiarlo en el docker-compose)
CMD ["npm", "start"]
