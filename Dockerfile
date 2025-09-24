FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm install

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Remove dev dependencies after build (optional, saves space)
RUN npm prune --production