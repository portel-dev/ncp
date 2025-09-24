FROM node:20-alpine

WORKDIR /app

# Install NCP from npm registry
RUN npm install -g @portel/ncp

# The NCP command is now available globally