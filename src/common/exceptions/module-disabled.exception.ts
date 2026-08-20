import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown when a caller (HTTP request, Telegram command, or a Gemini tool
 * call) tries to use an optional module/integration that is disabled or
 * missing required credentials. Maps to 503 Service Unavailable — the
 * feature isn't broken, it's just not configured on this deployment.
 */
export class ModuleDisabledException extends HttpException {
  constructor(moduleName: string) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: `The "${moduleName}" module is disabled on this server. An administrator can enable it via environment configuration.`,
        module: moduleName,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
