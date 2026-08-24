import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import { assertSelectOnly } from '../executors/sql-guard';

export type DatabaseEngine = 'postgres' | 'mysql';

@ValidatorConstraint({ name: 'selectOnlyQuery', async: false })
class SelectOnlyQueryConstraint implements ValidatorConstraintInterface {
  private lastError = 'Query must be read-only';

  validate(query: unknown): boolean {
    if (typeof query !== 'string') {
      return false;
    }

    try {
      assertSelectOnly(query);
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : this.lastError;
      return false;
    }
  }

  defaultMessage(): string {
    return this.lastError;
  }
}

abstract class BaseDatabaseToolConfigDto {
  @IsString()
  @IsNotEmpty()
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  @IsNotEmpty()
  database!: string;

  @IsString()
  @IsNotEmpty()
  user!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsBoolean()
  ssl?: boolean;

  // A SELECT-only template using named placeholders (e.g. ":customerId"),
  // never the engine's native placeholder syntax — DatabaseToolExecutor
  // tokenizes these and binds them as real query parameters, never string
  // concatenation. Args can only fill placeholder values, never identifiers
  // (table/column names).
  @IsString()
  @IsNotEmpty()
  @Validate(SelectOnlyQueryConstraint)
  query!: string;
}

export class PostgresDatabaseToolConfigDto extends BaseDatabaseToolConfigDto {
  @IsIn(['postgres'])
  engine!: 'postgres';
}

export class MysqlDatabaseToolConfigDto extends BaseDatabaseToolConfigDto {
  @IsIn(['mysql'])
  engine!: 'mysql';
}
