import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

export const DATABASE = 'DATABASE';

export type Database = ReturnType<typeof drizzle>;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE,

      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const pool = new Pool({
          connectionString: configService.get<string>('database.url'),
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
