import { IsEmail, IsIn, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';
import { ROLES } from '../../rbac/constants/roles';

// Deliberately excludes ROLES.OWNER — ownership can't be granted through this
// endpoint, closing off a cheap privilege-escalation path.
const INVITABLE_ROLES = [ROLES.ADMIN, ROLES.MEMBER] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];

export class AddMemberDto {
  @Trim()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsIn(INVITABLE_ROLES)
  role!: InvitableRole;
}
