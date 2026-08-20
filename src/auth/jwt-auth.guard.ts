import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Secures the Admin Web Panel (Module 1). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
