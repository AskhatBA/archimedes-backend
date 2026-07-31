FROM node:18

# Set working directory
WORKDIR /app

# Copy dependencies and install
COPY package*.json ./
RUN npm install

# Copy only the files the build and runtime actually need.
# Never `COPY . .` — a recursive copy of the build context can pull in .env,
# .git, local logs and other secrets even when .dockerignore looks correct.
COPY tsconfig.json ./
COPY src ./src

# Generate Prisma client
RUN npm run db:generate

# Build TypeScript
RUN npm run build

# Drop root privileges: run the app as the unprivileged built-in "node" user
RUN chown -R node:node /app
USER node

# Default command
CMD ["npm", "run", "start"]
