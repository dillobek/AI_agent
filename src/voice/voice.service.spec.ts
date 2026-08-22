import { ModuleDisabledException } from '../common/exceptions/module-disabled.exception';
import { VoiceService } from './voice.service';

function makeService(overrides: { voiceEnabled?: boolean; configOverrides?: Record<string, unknown> } = {}) {
  const { voiceEnabled = true, configOverrides = {} } = overrides;
  const defaults: Record<string, unknown> = {
    OPENAI_API_KEY: 'fake-key',
    OPENAI_REALTIME_MODEL: 'gpt-realtime',
    OPENAI_REALTIME_VOICE: 'marin',
    OPENAI_TRANSCRIPTION_MODEL: 'whisper-1',
    VOICE_LANGUAGE: 'uz',
  };
  const config = {
    moduleFlags: { voice: voiceEnabled },
    get: (key: string) => (key in configOverrides ? configOverrides[key] : defaults[key]),
  } as any;
  const tools = { getAvailableDeclarations: jest.fn().mockReturnValue([]) } as any;
  const toolExecution = { executeToolSafely: jest.fn() } as any;
  return { service: new VoiceService(config, tools, toolExecution), tools, toolExecution };
}

/** Minimal ToolDeclaration, in the uppercase-OBJECT shape the registry actually stores. */
const REPORT_TOOL = {
  name: 'get_today_report',
  description: "Today's numbers.",
  parameters: { type: 'OBJECT' as const, properties: {}, required: [] },
};

describe('VoiceService', () => {
  describe('describeSession', () => {
    it('fails closed when VOICE_ENABLED is false, before touching the network', () => {
      const { service } = makeService({ voiceEnabled: false });
      expect(() => service.describeSession()).toThrow(ModuleDisabledException);
    });

    it('reports the tools the session will actually be given, in OpenAI function shape', () => {
      const { service, tools } = makeService();
      tools.getAvailableDeclarations.mockReturnValue([REPORT_TOOL]);

      const session = service.describeSession();

      expect(session.model).toBe('gpt-realtime');
      expect(session.tools).toEqual([
        {
          type: 'function',
          name: 'get_today_report',
          description: "Today's numbers.",
          // Lowercase 'object' — the registry's Gemini-flavored 'OBJECT'
          // would be rejected by OpenAI.
          parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
        },
      ]);
    });
  });

  describe('createRealtimeCall', () => {
    it('fails closed when VOICE_ENABLED is false, before touching the network', async () => {
      const { service } = makeService({ voiceEnabled: false });
      await expect(service.createRealtimeCall('v=0')).rejects.toBeInstanceOf(ModuleDisabledException);
    });

    it('rejects with a configuration error, not a network call, when no API key is set', async () => {
      const { service } = makeService({ configOverrides: { OPENAI_API_KEY: '' } });
      await expect(service.createRealtimeCall('v=0')).rejects.toThrow(/OPENAI_API_KEY/);
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
