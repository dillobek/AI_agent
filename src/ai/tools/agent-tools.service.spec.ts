import { AgentToolsService, ToolArgumentError, ToolModuleDisabledError, UnknownToolError } from './agent-tools.service';

function makeService(flags: Record<string, boolean>) {
  const config = { moduleFlags: flags } as any;
  const drive = { findLatestFileByName: jest.fn().mockResolvedValue(null) } as any;
  const finance = {
    calculateFinanceSummary: jest
      .fn()
      .mockResolvedValue({ period: { startDate: '2026-01-01', endDate: '2026-01-31' }, totalIncome: '0', totalExpense: '0', netProfitLoss: '0', transactionCount: 0 }),
  } as any;
  const patients = { renderPatientHistoryAsMarkdown: jest.fn().mockResolvedValue('# ok') } as any;
  return new AgentToolsService(config, drive, finance, patients);
}

describe('AgentToolsService', () => {
  it('throws UnknownToolError for a tool name that does not exist', async () => {
    const tools = makeService({ googleDrive: true, finance: true, patients: true });
    await expect(tools.execute('delete_everything', {})).rejects.toBeInstanceOf(UnknownToolError);
  });

  it('validates arguments with a real schema, not a blind cast', async () => {
    const tools = makeService({ googleDrive: true, finance: true, patients: true });
    await expect(tools.execute('find_latest_drive_file', {})).rejects.toBeInstanceOf(ToolArgumentError);
    await expect(tools.execute('find_latest_drive_file', { personName: 123 })).rejects.toBeInstanceOf(ToolArgumentError);
  });

  it('rejects unexpected extra arguments (schema is strict)', async () => {
    const tools = makeService({ googleDrive: true, finance: true, patients: true });
    await expect(
      tools.execute('find_latest_drive_file', { personName: 'Ada', unexpectedField: 'x' }),
    ).rejects.toBeInstanceOf(ToolArgumentError);
  });

  it('validates finance date arguments look like ISO dates', async () => {
    const tools = makeService({ googleDrive: true, finance: true, patients: true });
    await expect(
      tools.execute('calculate_finance_summary', { startDate: 'not-a-date', endDate: '2026-01-31' }),
    ).rejects.toBeInstanceOf(ToolArgumentError);
  });

  it('fails closed when the tool maps to a disabled module', async () => {
    const tools = makeService({ googleDrive: false, finance: true, patients: true });
    await expect(
      tools.execute('find_latest_drive_file', { personName: 'Ada Lovelace' }),
    ).rejects.toBeInstanceOf(ToolModuleDisabledError);
  });

  it('only advertises declarations for enabled modules', () => {
    const tools = makeService({ googleDrive: false, finance: true, patients: false });
    const names = tools.getAvailableDeclarations().map((d) => d.name);
    expect(names).toContain('calculate_finance_summary');
    expect(names).not.toContain('find_latest_drive_file');
    expect(names).not.toContain('get_patient_prescriptions');
  });

  it('executes a valid, enabled tool call successfully', async () => {
    const tools = makeService({ googleDrive: true, finance: true, patients: true });
    const result = await tools.execute('calculate_finance_summary', { startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(result).toContain('Finance summary');
  });
});
