FROM node:24-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/data /app/uploads/originals /app/uploads/artworks

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
