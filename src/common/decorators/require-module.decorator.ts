import { SetMetadata } from '@nestjs/common';

export const REQUIRE_MODULE_KEY = 'requireModule';

/**
 * Marks a controller/route as depending on an optional module flag
 * (see `AppConfigService.moduleFlags`). Combine with `ModuleEnabledGuard`:
 *
 *   @RequireModule('finance')
 *   @UseGuards(ModuleEnabledGuard)
 *   @Controller('finance')
 *   export class FinanceController {}
 */
export const RequireModule = (moduleKey: string) => SetMetadata(REQUIRE_MODULE_KEY, moduleKey);
