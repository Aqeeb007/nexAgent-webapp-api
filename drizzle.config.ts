import { config } from 'dotenv';

config({
  path: `.env`,
});

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',

  schema: './src/database/schema/*.ts',

  out: './drizzle',

  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
