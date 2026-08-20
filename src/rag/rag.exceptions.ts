import { HttpException, HttpStatus } from '@nestjs/common';

/** Thrown when VECTOR_STORE_PROVIDER=pgvector is selected — not yet implemented, and we never pretend otherwise. */
export class VectorStoreNotSupportedException extends HttpException {
  constructor(provider: string) {
    super(
      `Vector store provider "${provider}" is not implemented in this codebase yet. ` +
        'Set VECTOR_STORE_PROVIDER=chroma, or implement the pgvector adapter in src/rag/adapters before enabling it.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
