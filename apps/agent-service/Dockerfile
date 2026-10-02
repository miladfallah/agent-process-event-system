FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN ./node_modules/.bin/tsc -p apps/agent-service/tsconfig.app.json

FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --legacy-peer-deps --omit=dev

COPY --from=builder /usr/src/app/dist ./dist

CMD ["node", "dist/apps/agent-service/main.js"]
