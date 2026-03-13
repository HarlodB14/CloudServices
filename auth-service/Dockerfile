FROM node:18-alpine

WORKDIR /workspace

COPY auth-utils ./auth-utils
COPY auth-service ./auth-service

WORKDIR /workspace/auth-utils
RUN npm install

WORKDIR /workspace/auth-service
RUN npm install

EXPOSE 3001

CMD ["node", "index.js"]
