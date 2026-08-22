import 'reflect-metadata';
import { createHmac } from 'crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import * as request from 'supertest';
import { createInMemoryPrisma } from './support/in-memory-prisma';

// Set required env BEFORE requiring anything that reads it at import time
// (AppModule reads *_ENABLED flags at module-graph construction time —
// see src/config/module-flags.util.ts).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'e2e-test-jwt-secret-not-a-real-secret-32chars';
process.env.JWT_EXPIRES_IN = '1h';
process.env.FINANCE_MODULE_ENABLED = 'true';
process.env.FINANCE_WEBHOOK_SECRET = 'e2e-test-finance-webhook-secret-value';
process.env.FINANCE_WEBHOOK_REPLAY_WINDOW_SECONDS = '300';
process.env.PATIENTS_MODULE_ENABLED = 'true';
process.env.DASHBOARD_ENABLED = 'true';
process.env.TELEGRAM_ENABLED = 'false';
process.env.GOOGLE_DRIVE_ENABLED = 'false';
process.env.OBSIDIAN_ENABLED = 'false';
process.env.RAG_ENABLED = 'false';
process.env.N8N_ENABLED = 'false';
process.env.VOICE_ENABLED = 'false';
process.env.YOUTUBE_ENABLED = 'false';
process.env.CALENDAR_ENABLED = 'false';
process.env.GEMINI_API_KEY = ''; // not needed: no test here calls the AI agent

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AppModule } = require('../src/app.module');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaService } = require('../src/config/prisma.service');

describe('AI Personal Assistant Ecosystem (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createInMemoryPrisma>;

  beforeAll(async () => {
    prisma = createInMemoryPrisma();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();

    // Mirror main.ts's raw-body capture so the Finance webhook's HMAC check works in tests too.
    app.use(
      express.json({
        verify: (req: any, _res, buf) => {
          req.rawBody = buf;
        },
      }),
    );
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('GET /health', () => {
    it('reports ok with disabled modules clearly labeled', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.modules.telegram).toBe('disabled');
      expect(res.body.modules.finance).toBe('enabled');
    });
  });

  describe('Disabled optional module', () => {
    // ObsidianController declares @UseGuards(ModuleEnabledGuard, JwtAuthGuard, RolesGuard) —
    // guards run in that array order, so ModuleEnabledGuard fires before auth is even checked.
    // A disabled module should therefore fail closed with 503 regardless of authentication.
    it('returns 503 for a disabled module even without authentication', async () => {
      const res = await request(app.getHttpServer()).post('/obsidian/sync').expect(503);
      expect(res.status).toBe(503);
    });

    // VoiceController declares the exact same guard order — confirms the
    // new voice endpoints fail closed the same way when VOICE_ENABLED=false,
    // before the Gemini Live token-mint call is ever attempted.
    it('returns 503 for the voice live-token endpoint when VOICE_ENABLED is false, even without authentication', async () => {
      const res = await request(app.getHttpServer()).post('/voice/live-token').expect(503);
      expect(res.status).toBe(503);
    });
  });

  describe('Auth: bootstrap admin + login + protected route', () => {
    let accessToken: string;

    it('bootstraps the first admin account', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register-admin')
        .send({ telegramId: '100000001', name: 'E2E Admin', password: 'a-strong-test-password-123' })
        .expect(201);
      expect(res.body.role).toBe('ADMIN');
    });

    it('refuses a second bootstrap once an admin exists', async () => {
      await request(app.getHttpServer())
        .post('/auth/register-admin')
        .send({ telegramId: '100000002', name: 'Second', password: 'another-strong-password-123' })
        .expect(403);
    });

    it('rejects login with the wrong password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ telegramId: '100000001', password: 'wrong-password' })
        .expect(401);
    });

    it('logs in with the correct password', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ telegramId: '100000001', password: 'a-strong-test-password-123' })
        .expect(201);
      expect(res.body.accessToken).toBeDefined();
      accessToken = res.body.accessToken;
    });

    it('rejects a protected route without a token', async () => {
      await request(app.getHttpServer()).get('/patients/search').query({ name: 'Ada' }).expect(401);
    });

    it('allows a protected route with a valid token', async () => {
      await request(app.getHttpServer())
        .get('/patients/search')
        .query({ name: 'Ada' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('rejects an empty patient search even when authorized', async () => {
      await request(app.getHttpServer())
        .get('/patients/search')
        .query({ name: '' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('still returns 503 for a disabled module even with a valid admin token', async () => {
      // Confirms the module gate isn't accidentally bypassed for authenticated/authorized callers.
      await request(app.getHttpServer())
        .post('/obsidian/sync')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(503);
    });
  });

  describe('Finance webhook', () => {
    const secret = process.env.FINANCE_WEBHOOK_SECRET as string;
    const payload = { amount: 42.5, type: 'INCOME', category: 'e2e-test' };
    const rawBody = JSON.stringify(payload);

    function sign(timestamp: number) {
      return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    }

    it('rejects a request with no signature at all', async () => {
      await request(app.getHttpServer()).post('/finance/webhook/receipt').send(payload).expect(403);
    });

    it('rejects a request with an invalid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      await request(app.getHttpServer())
        .post('/finance/webhook/receipt')
        .set('x-finance-signature', 'bogus')
        .set('x-finance-timestamp', String(timestamp))
        .send(payload)
        .expect(403);
    });

    it('accepts a correctly signed, fresh request', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      await request(app.getHttpServer())
        .post('/finance/webhook/receipt')
        .set('x-finance-signature', sign(timestamp))
        .set('x-finance-timestamp', String(timestamp))
        .send(payload)
        .expect(201);
    });

    it('rejects a replay of the exact same signed request', async () => {
      // Use a distinct, still-fresh timestamp so this signature does not
      // collide with the preceding success-case request in the same second.
      const timestamp = Math.floor(Date.now() / 1000) - 1;
      const signature = sign(timestamp);
      await request(app.getHttpServer())
        .post('/finance/webhook/receipt')
        .set('x-finance-signature', signature)
        .set('x-finance-timestamp', String(timestamp))
        .send(payload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/finance/webhook/receipt')
        .set('x-finance-signature', signature)
        .set('x-finance-timestamp', String(timestamp))
        .send(payload)
        .expect(403);
    });
  });
});
