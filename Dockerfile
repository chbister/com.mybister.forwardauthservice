FROM node:22-alpine

WORKDIR /app

COPY package.json .
COPY server.js .

ENV PORT=8000

EXPOSE 8000

CMD ["npm", "start"]
