import { PrismaClient, Role, TransactionType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

/**
 * Demo/fixture data only — safe to run against a local development
 * database. Never run this against a production database: it creates a
 * throwaway admin account with a randomly generated password (printed
 * once, to the console, and nowhere else) purely so a fresh local
 * checkout has *something* to log in with.
 *
 * No real person's name, phone number, or credential is stored here —
 * "Demo Patient" below is a placeholder, not a real record.
 */
async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the demo seed against NODE_ENV=production.');
  }

  const seedTelegramId = process.env.SEED_ADMIN_TELEGRAM_ID || '100000001';
  const generatedPassword = randomBytes(9).toString('base64url'); // shown once below, never stored in plaintext
  const passwordHash = await bcrypt.hash(generatedPassword, 12);

  const admin = await prisma.user.upsert({
    where: { telegramId: BigInt(seedTelegramId) },
    update: {},
    create: {
      telegramId: BigInt(seedTelegramId),
      name: 'Demo Admin',
      role: Role.ADMIN,
      passwordHash,
    },
  });

  const fullName = 'Demo Patient';
  const patient = await prisma.patient.create({
    data: {
      fullName,
      normalizedName: fullName.trim().toLowerCase().replace(/\s+/g, ' '),
      phone: '+10000000000',
      prescriptions: {
        create: [
          {
            diagnosis: 'Seasonal allergic rhinitis (demo record)',
            medications: { items: ['Example medication A', 'Example medication B'] },
            visitDate: new Date(),
          },
        ],
      },
    },
  });

  await prisma.transaction.createMany({
    data: [
      { amount: 500000, type: TransactionType.INCOME, category: 'Consultation', description: 'Demo visit fee' },
      { amount: 120000, type: TransactionType.EXPENSE, category: 'Supplies', description: 'Demo supplies purchase' },
    ],
  });

  console.log('Seeded demo data:', { admin: admin.id, patient: patient.id });
  console.log(`Demo admin login — telegramId: ${seedTelegramId}  password: ${generatedPassword}`);
  console.log('(This password is shown only here; it is not stored anywhere in plaintext.)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
