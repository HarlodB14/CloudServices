FROM node:20

WORKDIR /workspace

COPY auth-utils ./auth-utils
COPY message-broker ./message-broker
COPY mail-service ./mail-service

WORKDIR /workspace/auth-utils
RUN npm install

WORKDIR /workspace/message-broker
RUN npm install

WORKDIR /workspace/mail-service
RUN npm install

EXPOSE 3005

CMD ["npm", "start"]
