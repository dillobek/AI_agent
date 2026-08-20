/*
 * One-time, interactive MTProto login for the owner's PERSONAL Telegram
 * account. It never writes an OTP/password to disk. It prints an encrypted
 * session envelope which the owner pastes into PERSONAL_TELEGRAM_SESSION.
 */
const { createCipheriv, createHash, randomBytes } = require('crypto');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    console.log('\nPersonal Telegram one-time setup. Do not run this in a shared terminal or screen recording.\n');
    const apiId = Number(await rl.question('Telegram API ID (my.telegram.org): '));
    const apiHash = await rl.question('Telegram API hash: ');
    const phone = await rl.question('Phone number (+998...): ');
    const encryptionKey = await rl.question('Session encryption key (use: openssl rand -base64 48): ');
    if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash || !phone || !encryptionKey) {
      throw new Error('API ID, API hash, phone and encryption key are all required.');
    }

    const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 });
    await client.start({
      phoneNumber: async () => phone,
      phoneCode: async () => rl.question('One-time Telegram code: '),
      password: async () => rl.question('Telegram 2FA password (leave blank if not enabled): '),
      onError: (error) => console.error(`Telegram login error: ${error.message}`),
    });
    const encrypted = encrypt(client.session.save(), encryptionKey);
    await client.disconnect();

    console.log('\nLogin successful. Add these values to the VPS .env, then erase this terminal scrollback:');
    console.log(`TELEGRAM_API_ID=${apiId}`);
    console.log(`TELEGRAM_API_HASH=${apiHash}`);
    console.log(`PERSONAL_TELEGRAM_PHONE=${phone}`);
    console.log(`PERSONAL_TELEGRAM_SESSION_ENCRYPTION_KEY=${encryptionKey}`);
    console.log(`PERSONAL_TELEGRAM_SESSION=${encrypted}`);
    console.log('PERSONAL_TELEGRAM_ENABLED=true\n');
  } finally {
    rl.close();
  }
}

function encrypt(plainText, secret) {
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
}

main().catch((error) => {
  console.error(`Setup failed: ${error.message}`);
  process.exitCode = 1;
});
