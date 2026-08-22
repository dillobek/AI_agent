import { AgentToolsService, ToolArgumentError, ToolModuleDisabledError, UnknownToolError } from './agent-tools.service';

function makeService(
  flags: Record<string, boolean>,
  overrides: { drive?: any; obsidian?: any; youtube?: any; plan?: any } = {},
) {
  const config = { moduleFlags: flags } as any;
  const drive = overrides.drive ?? { findLatestFileByName: jest.fn().mockResolvedValue(null), searchFilesByName: jest.fn().mockResolvedValue([]) };
  const finance = {
    calculateFinanceSummary: jest
      .fn()
      .mockResolvedValue({ period: { startDate: '2026-01-01', endDate: '2026-01-31' }, totalIncome: '0', totalExpense: '0', netProfitLoss: '0', transactionCount: 0 }),
  } as any;
  const patients = { renderPatientHistoryAsMarkdown: jest.fn().mockResolvedValue('# ok') } as any;
  const obsidian = overrides.obsidian ?? { listMarkdownFiles: jest.fn().mockResolvedValue([]) };
  const youtube = overrides.youtube ?? { searchVideo: jest.fn().mockResolvedValue(null) };
  const plan = overrides.plan ?? {
    renderTodayPlan: jest.fn().mockResolvedValue('Plan items: none added yet today.'),
    addPlanItem: jest.fn().mockResolvedValue({ id: 'p1', title: 'x' }),
  };
  return new AgentToolsService(config, drive, finance, patients, obsidian, youtube, plan);
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

  it('get_today_report reuses calculateFinanceSummary and reports today\'s numbers', async () => {
    const tools = makeService({ finance: true });
    const result = await tools.execute('get_today_report', {});
    expect(result).toContain("Today's report");
  });

  describe('search_files (multi-source degrade)', () => {
    it('is available when only one of googleDrive/obsidian is enabled', () => {
      const tools = makeService({ googleDrive: true, obsidian: false });
      expect(tools.getAvailableDeclarations().map((d) => d.name)).toContain('search_files');
    });

    it('fails closed when neither googleDrive nor obsidian is enabled', async () => {
      const tools = makeService({ googleDrive: false, obsidian: false });
      await expect(tools.execute('search_files', { query: 'x' })).rejects.toBeInstanceOf(ToolModuleDisabledError);
    });

    it('degrades to just the enabled source instead of failing the whole call', async () => {
      const drive = { searchFilesByName: jest.fn().mockResolvedValue([{ id: '1', name: 'Report.pdf', webViewLink: 'https://x' }]) };
      const tools = makeService({ googleDrive: true, obsidian: false }, { drive });
      const result = await tools.execute('search_files', { query: 'Report' });
      expect(result).toContain('Report.pdf');
      expect(result).not.toContain('Obsidian');
    });

    it('returns partial results when one enabled source errors', async () => {
      const drive = { searchFilesByName: jest.fn().mockRejectedValue(new Error('boom')) };
      const obsidian = { listMarkdownFiles: jest.fn().mockResolvedValue(['notes/Report.md']) };
      const tools = makeService({ googleDrive: true, obsidian: true }, { drive, obsidian });
      const result = await tools.execute('search_files', { query: 'Report' });
      expect(result).toContain('search failed');
      expect(result).toContain('notes/Report.md');
    });
  });

  describe('search_youtube', () => {
    it('fails closed when youtube is disabled', async () => {
      const tools = makeService({ youtube: false });
      await expect(tools.execute('search_youtube', { query: 'x' })).rejects.toBeInstanceOf(ToolModuleDisabledError);
    });

    it('returns a watch link for a found video', async () => {
      const youtube = { searchVideo: jest.fn().mockResolvedValue({ videoId: 'abc123', title: 'Ep 245', channelTitle: 'Chuqur' }) };
      const tools = makeService({ youtube: true }, { youtube });
      const result = await tools.execute('search_youtube', { query: 'Chuqur 245' });
      expect(result).toContain('https://www.youtube.com/watch?v=abc123');
    });
  });

  describe('get_today_plan / add_plan_item', () => {
    it('get_today_plan has no requiredModule and works with every other module disabled', async () => {
      const tools = makeService({});
      const result = await tools.execute('get_today_plan', {});
      expect(result).toContain('Plan items');
    });

    it('add_plan_item delegates to PlanService.addPlanItem', async () => {
      const plan = { addPlanItem: jest.fn().mockResolvedValue({ id: 'p1', title: 'Doktorga borish' }), renderTodayPlan: jest.fn() };
      const tools = makeService({}, { plan });
      const result = await tools.execute('add_plan_item', { title: 'Doktorga borish' });
      expect(plan.addPlanItem).toHaveBeenCalledWith('Doktorga borish', undefined);
      expect(result).toContain('Doktorga borish');
    });
  });
});
