import { ModuleDisabledException } from '../common/exceptions/module-disabled.exception';
import { VoiceService } from './voice.service';

function makeService(overrides: { voiceEnabled?: boolean; configOverrides?: Record<string, unknown> } = {}) {
  const { voiceEnabled = true, configOverrides = {} } = overrides;
  const defaults: Record<string, unknown> = {
    GEMINI_API_KEY: 'fake-key',
    GEMINI_LIVE_MODEL: 'gemini-3.1-flash-live-preview',
    VOICE_LIVE_TOKEN_TTL_SECONDS: 1800,
  };
  const config = {
    moduleFlags: { voice: voiceEnabled },
    get: (key: string) => (key in configOverrides ? configOverrides[key] : defaults[key]),
  } as any;
  const tools = { getAvailableDeclarations: jest.fn().mockReturnValue([]) } as any;
  const toolExecution = { executeToolSafely: jest.fn() } as any;
  return { service: new VoiceService(config, tools, toolExecution), tools, toolExecution };
}

describe('VoiceService', () => {
  describe('mintLiveToken', () => {
    it('fails closed when VOICE_ENABLED is false, before touching the network', async () => {
      const { service } = makeService({ voiceEnabled: false });
      await expect(service.mintLiveToken()).rejects.toBeInstanceOf(ModuleDisabledException);
    });
  });

  describe('executeToolWithDedup', () => {
    it('executes a tool via ToolExecutionService, tagged with source "voice"', async () => {
      const { service, toolExecution } = makeService();
      toolExecution.executeToolSafely.mockResolvedValue('42');

      const result = await service.executeToolWithDedup('get_today_report', {}, 'dashboard:u1', 'call-1');

      expect(result).toBe('42');
      expect(toolExecution.executeToolSafely).toHaveBeenCalledWith('get_today_report', {}, 'dashboard:u1', 'voice');
    });

    it('dedupes a repeated call id instead of re-running a side-effecting tool twice', async () => {
      const { service, toolExecution } = makeService();
      toolExecution.executeToolSafely.mockResolvedValue('added');

      const first = await service.executeToolWithDedup('add_plan_item', { title: 'x' }, 'dashboard:u1', 'call-dup');
      const second = await service.executeToolWithDedup('add_plan_item', { title: 'x' }, 'dashboard:u1', 'call-dup');

      expect(first).toBe('added');
      expect(second).toBe('added');
      expect(toolExecution.executeToolSafely).toHaveBeenCalledTimes(1);
    });

    it('does not dedupe distinct call ids', async () => {
      const { service, toolExecution } = makeService();
      toolExecution.executeToolSafely.mockResolvedValue('ok');

      await service.executeToolWithDedup('add_plan_item', { title: 'a' }, 'dashboard:u1', 'call-a');
      await service.executeToolWithDedup('add_plan_item', { title: 'b' }, 'dashboard:u1', 'call-b');

      expect(toolExecution.executeToolSafely).toHaveBeenCalledTimes(2);
    });
  });
});
