import { redactForLog, maskSecret } from './redaction.util';

describe('redactForLog', () => {
  it('masks known-sensitive keys regardless of value', () => {
    const result = redactForLog({ diagnosis: 'Type 2 diabetes', phone: '+15551234567' }) as Record<string, unknown>;
    expect(result.diagnosis).not.toContain('diabetes');
    expect(result.phone).not.toContain('5551234567');
    expect(String(result.diagnosis)).toMatch(/redacted/);
  });

  it('leaves non-sensitive keys intact', () => {
    const result = redactForLog({ category: 'Consultation', count: 3 }) as Record<string, unknown>;
    expect(result.category).toBe('Consultation');
    expect(result.count).toBe(3);
  });

  it('truncates very long strings', () => {
    const long = 'x'.repeat(1000);
    const result = redactForLog({ note: long }) as Record<string, unknown>;
    expect(String(result.note).length).toBeLessThan(600);
    expect(String(result.note)).toMatch(/truncated/);
  });

  it('redacts nested objects and arrays', () => {
    const result = redactForLog({ items: [{ password: 'hunter2hunter2' }] }) as Record<string, unknown>;
    const items = result.items as Record<string, unknown>[];
    expect(String(items[0].password)).not.toBe('hunter2hunter2');
  });

  it('never throws on cyclic-ish or odd input', () => {
    expect(() => redactForLog(null)).not.toThrow();
    expect(() => redactForLog(undefined)).not.toThrow();
    expect(() => redactForLog(42)).not.toThrow();
  });
});

describe('maskSecret', () => {
  it('masks a real secret without revealing it fully', () => {
    const masked = maskSecret('sk-abcdefghijklmnopqrstuvwxyz');
    expect(masked).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('reports unset secrets clearly', () => {
    expect(maskSecret(undefined)).toBe('(unset)');
    expect(maskSecret('')).toBe('(unset)');
  });
});
