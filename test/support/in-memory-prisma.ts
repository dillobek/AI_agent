import { randomUUID } from 'crypto';

/**
 * A minimal in-memory stand-in for PrismaService, covering exactly the
 * query patterns the app's services actually issue. NOT a general Prisma
 * mock — it exists so e2e tests can exercise real HTTP routes/guards/
 * services end-to-end without a live PostgreSQL instance, per the "tests
 * must not depend on live external services" requirement.
 */
export function createInMemoryPrisma() {
  const db: Record<string, any[]> = {
    user: [],
    loginAttempt: [],
    revokedToken: [],
    patient: [],
    prescription: [],
    transaction: [],
    webhookEvent: [],
    executionLog: [],
    auditLog: [],
    conversationSession: [],
    knowledgeDocument: [],
  };

  return {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),

    user: {
      count: jest.fn(async () => db.user.length),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: randomUUID(), isActive: true, createdAt: new Date(), updatedAt: new Date(), ...data };
        db.user.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return db.user.find((u) => u.id === where.id) ?? null;
        if (where.telegramId !== undefined) return db.user.find((u) => String(u.telegramId) === String(where.telegramId)) ?? null;
        return null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = db.user.find((u) => u.id === where.id);
        Object.assign(row, data);
        return row;
      }),
    },

    loginAttempt: {
      count: jest.fn(async ({ where }: any) => {
        return db.loginAttempt.filter(
          (a) => a.identifier === where.identifier && a.succeeded === where.succeeded && a.createdAt >= where.createdAt.gte,
        ).length;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: randomUUID(), createdAt: new Date(), ...data };
        db.loginAttempt.push(row);
        return row;
      }),
    },

    revokedToken: {
      findUnique: jest.fn(async ({ where }: any) => db.revokedToken.find((t) => t.jti === where.jti) ?? null),
      upsert: jest.fn(async ({ where, create }: any) => {
        let row = db.revokedToken.find((t) => t.jti === where.jti);
        if (!row) {
          row = { revokedAt: new Date(), ...create };
          db.revokedToken.push(row);
        }
        return row;
      }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },

    patient: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: randomUUID(), status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date(), ...data };
        db.patient.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        const needle = where?.normalizedName?.contains?.toLowerCase() ?? '';
        return db.patient
          .filter((p) => p.normalizedName.includes(needle))
          .map((p) => ({ ...p, prescriptions: db.prescription.filter((rx) => rx.patientId === p.id) }));
      }),
      findUnique: jest.fn(async ({ where }: any) => db.patient.find((p) => p.id === where.id) ?? null),
    },

    prescription: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: randomUUID(), createdAt: new Date(), ...data };
        db.prescription.push(row);
        return row;
      }),
    },

    transaction: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: randomUUID(), createdAt: new Date(), date: data.date ?? new Date(), ...data };
        db.transaction.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        const gte = where?.date?.gte;
        const lte = where?.date?.lte;
        return db.transaction.filter((t) => (!gte || t.date >= gte) && (!lte || t.date <= lte));
      }),
      count: jest.fn(async () => db.transaction.length),
    },

    webhookEvent: {
      create: jest.fn(async ({ data }: any) => {
        if (db.webhookEvent.some((w) => w.signature === data.signature)) {
          throw new Error('Unique constraint failed on the fields: (`signature`)');
        }
        const row = { id: randomUUID(), ...data };
        db.webhookEvent.push(row);
        return row;
      }),
    },

    executionLog: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: randomUUID(), createdAt: new Date(), success: true, ...data };
        db.executionLog.push(row);
        return row;
      }),
      findMany: jest.fn(async () => [...db.executionLog].reverse()),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },

    auditLog: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: randomUUID(), createdAt: new Date(), ...data };
        db.auditLog.push(row);
        return row;
      }),
      findMany: jest.fn(async () => [...db.auditLog].reverse()),
    },

    conversationSession: {
      findUnique: jest.fn(async ({ where }: any) => db.conversationSession.find((s) => s.channelKey === where.channelKey) ?? null),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        let row = db.conversationSession.find((s) => s.channelKey === where.channelKey);
        if (row) Object.assign(row, update);
        else {
          row = { id: randomUUID(), createdAt: new Date(), ...create };
          db.conversationSession.push(row);
        }
        return row;
      }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },

    knowledgeDocument: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async ({ create }: any) => ({ id: randomUUID(), ...create })),
      update: jest.fn(async ({ data }: any) => data),
      delete: jest.fn(async () => undefined),
    },

    __db: db,
  };
}
