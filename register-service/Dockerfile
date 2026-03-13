FROM node:18-alpine

WORKDIR /workspace

COPY auth-utils ./auth-utils
COPY register-service ./register-service

WORKDIR /workspace/auth-utils
RUN npm install

WORKDIR /workspace/register-service
RUN npm install

EXPOSE 3003

CMD ["node", "index.js"]
