FROM node:lts-alpine

WORKDIR /app
COPY . .

RUN npm install -g pnpm
RUN pnpm install

RUN npm run build
RUN npm run test

ENTRYPOINT ["node", "."]