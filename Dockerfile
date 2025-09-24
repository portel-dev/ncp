FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Install globally to make 'ncp' command available
RUN npm install -g .

# Expose the built dist directory
WORKDIR /app