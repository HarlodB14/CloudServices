FROM node:18-alpine

WORKDIR /workspace

COPY score-service ./score-service

WORKDIR /workspace/score-service
RUN npm install

EXPOSE 3004

CMD ["npm", "start"]
