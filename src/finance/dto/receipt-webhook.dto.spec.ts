import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReceiptWebhookDto } from './receipt-webhook.dto';

async function validateDto(payload: Record<string, unknown>) {
  const dto = plainToInstance(ReceiptWebhookDto, payload);
  return validate(dto);
}

describe('ReceiptWebhookDto', () => {
  it('accepts a valid payload', async () => {
    const errors = await validateDto({ amount: 100.5, type: 'INCOME', category: 'Consultation' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a negative amount', async () => {
    const errors = await validateDto({ amount: -50, type: 'INCOME', category: 'X' });
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rejects a zero amount', async () => {
    const errors = await validateDto({ amount: 0, type: 'INCOME', category: 'X' });
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rejects NaN', async () => {
    const errors = await validateDto({ amount: NaN, type: 'INCOME', category: 'X' });
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rejects Infinity', async () => {
    const errors = await validateDto({ amount: Infinity, type: 'INCOME', category: 'X' });
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rejects an invalid type', async () => {
    const errors = await validateDto({ amount: 10, type: 'DEPOSIT', category: 'X' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('rejects an invalid date string', async () => {
    const errors = await validateDto({ amount: 10, type: 'INCOME', category: 'X', date: 'not-a-date' });
    expect(errors.some((e) => e.property === 'date')).toBe(true);
  });

  it('accepts a valid ISO date', async () => {
    const errors = await validateDto({ amount: 10, type: 'INCOME', category: 'X', date: '2026-01-15T10:00:00.000Z' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing category', async () => {
    const errors = await validateDto({ amount: 10, type: 'INCOME' });
    expect(errors.some((e) => e.property === 'category')).toBe(true);
  });
});
