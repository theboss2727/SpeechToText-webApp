FROM node:20-slim

# Install ffmpeg and ffprobe required for audio conversion & waveform analysis
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files and install
COPY package*.json ./
RUN npm install

# Copy application source and build client static assets
COPY . .
RUN npm run build

# Set production environment and default port
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Start Express server with tsx
CMD ["npm", "start"]
