# 1. Build the frontend React app
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# 2. Run the Express server
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN npm install --omit=dev --prefix server
COPY server/ ./server/
COPY --from=client-builder /app/client/dist ./client/dist

EXPOSE 5000
ENV PORT=5000
CMD ["node", "server/server.js"]
