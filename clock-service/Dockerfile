FROM node:20

WORKDIR /workspace

COPY auth-utils ./auth-utils
COPY clock-service ./clock-service

WORKDIR /workspace/auth-utils
RUN npm install

WORKDIR /workspace/clock-service
RUN npm install

EXPOSE 3006

CMD ["npm", "start"]
