import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restricts a route to one or more roles. Combine with `RolesGuard` (after `JwtAuthGuard`). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
