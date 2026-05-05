FROM node:20-alpine

WORKDIR /app

# No Chromium/Puppeteer needed — Baileys uses pure WebSocket
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/wa-session

EXPOSE 8080

CMD ["node", "--max-old-space-size=256", "index.js"]