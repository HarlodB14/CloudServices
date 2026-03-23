FROM node:18-alpine

WORKDIR /workspace

COPY auth-utils ./auth-utils
COPY message-broker ./message-broker
COPY target-service ./target-service

WORKDIR /workspace/auth-utils
RUN npm install

WORKDIR /workspace/message-broker
RUN npm install

WORKDIR /workspace/target-service
RUN npm install

EXPOSE 3002

CMD ["npm", "start"]