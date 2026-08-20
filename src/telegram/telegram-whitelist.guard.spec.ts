import { TelegrafExecutionContext } from 'nestjs-telegraf';
import { TelegramWhitelistGuard } from './telegram-whitelist.guard';

jest.mock('nestjs-telegraf', () => ({
  TelegrafExecutionContext: { create: jest.fn() },
}));

function makeConfig(whitelistIds: string) {
  return { get: (key: string) => (key === 'TELEGRAM_WHITELIST_IDS' ? whitelistIds : undefined) } as any;
}

function mockTelegramContext(fromId: number | undefined) {
  const reply = jest.fn().mockResolvedValue(undefined);
  (TelegrafExecutionContext.create as jest.Mock).mockReturnValue({
    getContext: () => ({ from: fromId ? { id: fromId } : undefined, reply }),
  });
  return { reply };
}

describe('TelegramWhitelistGuard', () => {
  it('allows a whitelisted user', () => {
    mockTelegramContext(123456789);
    const guard = new TelegramWhitelistGuard(makeConfig('123456789,987654321'));
    expect(guard.canActivate({} as any)).toBe(true);
  });

  it('blocks a non-whitelisted user and notifies them', () => {
    const { reply } = mockTelegramContext(999999999);
    const guard = new TelegramWhitelistGuard(makeConfig('123456789'));
    expect(guard.canActivate({} as any)).toBe(false);
    expect(reply).toHaveBeenCalled();
  });

  it('blocks when there is no from.id at all', () => {
    mockTelegramContext(undefined);
    const guard = new TelegramWhitelistGuard(makeConfig('123456789'));
    expect(guard.canActivate({} as any)).toBe(false);
  });

  it('blocks everyone when the whitelist is empty', () => {
    mockTelegramContext(123456789);
    const guard = new TelegramWhitelistGuard(makeConfig(''));
    expect(guard.canActivate({} as any)).toBe(false);
  });

  it('one whitelisted user cannot pass as another (different ids are distinct)', () => {
    mockTelegramContext(111);
    const guard = new TelegramWhitelistGuard(makeConfig('222'));
    expect(guard.canActivate({} as any)).toBe(false);
  });
});
