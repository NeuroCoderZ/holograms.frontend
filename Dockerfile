FROM node:16-alpine

WORKDIR /app

COPY package*.json ./backend/
WORKDIR /app/backend
RUN npm install

COPY . .
WORKDIR /app

EXPOSE 3000

CMD ["node", "backend/backend.js"]
