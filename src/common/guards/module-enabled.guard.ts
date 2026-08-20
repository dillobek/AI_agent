import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppConfigService } from '../../config/app-config.service';
import { REQUIRE_MODULE_KEY } from '../decorators/require-module.decorator';
import { ModuleDisabledException } from '../exceptions/module-disabled.exception';

/**
 * Rejects requests to a controller/route decorated with `@RequireModule(x)`
 * when that optional module is disabled — with a clear 503, instead of the
 * request falling through to a service that may not be fully configured
 * (missing API keys, no client initialized, etc).
 */
@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const moduleKey = this.reflector.getAllAndOverride<string>(REQUIRE_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!moduleKey) return true; // not gated

    const flags = this.config.moduleFlags as Record<string, boolean>;
    if (!flags[moduleKey]) {
      throw new ModuleDisabledException(moduleKey);
    }
    return true;
  }
}
