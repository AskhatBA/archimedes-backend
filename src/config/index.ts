import dotenv from 'dotenv';

const DEFAULT_PORT = 5050;
const DEFAULT_NODE_ENV = 'development';

dotenv.config();

export const config = {
  port: process.env.PORT || DEFAULT_PORT,
  nodeEnv: process.env.NODE_ENV || DEFAULT_NODE_ENV,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  token: {
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  },
};
