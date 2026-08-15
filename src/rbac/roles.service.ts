import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  type Database,
  type Transaction,
  DATABASE,
} from '../database/database.module';
import { roles } from '../database/schema/roles';

@Injectable()
export class RolesService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  async findBySlugOrThrow(slug: string, tx?: Transaction) {
    const executor = tx ?? this.db;

    const [role] = await executor
      .select({
        id: roles.id,
        name: roles.name,
        slug: roles.slug,
      })
      .from(roles)
      .where(eq(roles.slug, slug))
      .limit(1);

    if (!role) {
      throw new InternalServerErrorException(`Role not configured: ${slug}`);
    }

    return role;
  }
}
