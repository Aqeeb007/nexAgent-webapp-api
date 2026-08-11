import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

export const DATABASE = 'DATABASE';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,

      useFactory: () => {
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
        });

        return drizzle({
          client: pool,
        });
      },
    },
  ],

  exports: [DATABASE],
})
export class DatabaseModule {}
