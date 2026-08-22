export default () => ({
  port: parseInt(process.env.PORT!, 10) || 3000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  database: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT!, 10) || 5432,
    url: process.env.DATABASE_URL,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
});
