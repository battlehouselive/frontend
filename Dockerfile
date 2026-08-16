FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application source code
COPY . .

EXPOSE 3000

# Run in dev mode as requested
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
