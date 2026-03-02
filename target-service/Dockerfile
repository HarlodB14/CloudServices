# Use a Node 18 base image (required by dependencies)
FROM node:18-alpine

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on (matches .env PORT=3002)
EXPOSE 3002

# Command to run the application
CMD ["npm", "start"]