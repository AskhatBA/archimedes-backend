FROM node:18

# Set working directory
WORKDIR /app

# Copy dependencies and install
COPY package*.json ./
RUN npm install

# Copy the rest of the code
COPY . .

# Generate Prisma client
RUN npm run db:generate

# Build TypeScript
RUN npm run build

# Drop root privileges: run the app as the unprivileged built-in "node" user
RUN chown -R node:node /app
USER node

# Default command
CMD ["npm", "run", "start"]
