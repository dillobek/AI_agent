import { ToolExecutionService } from './tool-execution.service';
import { ToolArgumentError, ToolModuleDisabledError, UnknownToolError } from './agent-tools.service';

function makeConfig(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    AGENT_TOOL_TIMEOUT_MS: 1000,
    AGENT_MAX_TOOL_OUTPUT_CHARS: 6000,
  };
  return { get: (key: string) => (key in overrides ? overrides[key] : defaults[key]) } as any;
}

function makeExecutionLog() {
  return { record: jest.fn().mockResolvedValue(null) } as any;
}

describe('ToolExecutionService', () => {
  it('executes a tool, logs success under the text-agent actor label, and returns its raw output', async () => {
    const tools = { execute: jest.fn().mockResolvedValue('42') } as any;
    const executionLog = makeExecutionLog();
    const svc = new ToolExecutionService(tools, executionLog, makeConfig());

    const result = await svc.executeToolSafely('get_today_report', {}, 'dashboard:u1', 'text');

    expect(result).toBe('42');
    expect(tools.execute).toHaveBeenCalledWith('get_today_report', {});
    expect(executionLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'ai-agent:dashboard:u1', toolName: 'get_today_report', output: { output: '42' } }),
    );
  });

  it('tags voice-sourced calls with a distinct actor label so the two can be told apart in the log', async () => {
    const tools = { execute: jest.fn().mockResolvedValue('ok') } as any;
    const executionLog = makeExecutionLog();
    const svc = new ToolExecutionService(tools, executionLog, makeConfig());

    await svc.executeToolSafely('add_plan_item', { title: 'x' }, 'dashboard:u1', 'voice');

    expect(executionLog.record).toHaveBeenCalledWith(expect.objectContaining({ actor: 'voice-agent:dashboard:u1' }));
  });

  it('truncates output longer than the configured max and marks it as truncated', async () => {
    const tools = { execute: jest.fn().mockResolvedValue('x'.repeat(20)) } as any;
    const executionLog = makeExecutionLog();
    const svc = new ToolExecutionService(tools, executionLog, makeConfig({ AGENT_MAX_TOOL_OUTPUT_CHARS: 5 }));

    const result = await svc.executeToolSafely('some_tool', {}, 'k', 'text');

    expect(result).toBe('xxxxx… (truncated)');
  });

  it('converts an UnknownToolError into a safe message and logs the failure', async () => {
    const tools = { execute: jest.fn().mockRejectedValue(new UnknownToolError('nope')) } as any;
    const executionLog = makeExecutionLog();
    const svc = new ToolExecutionService(tools, executionLog, makeConfig());

    const result = await svc.executeToolSafely('nope', {}, 'k', 'text');

    expect(result).toMatch(/does not exist/);
    expect(executionLog.record).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('converts a ToolModuleDisabledError into its own descriptive message', async () => {
    const tools = { execute: jest.fn().mockRejectedValue(new ToolModuleDisabledError('youtube')) } as any;
    const svc = new ToolExecutionService(tools, makeExecutionLog(), makeConfig());

    const result = await svc.executeToolSafely('search_youtube', {}, 'k', 'text');

    expect(result).toMatch(/currently disabled/);
  });

  it('converts a ToolArgumentError into a safe "invalid arguments" message', async () => {
    const tools = { execute: jest.fn().mockRejectedValue(new ToolArgumentError('bad args')) } as any;
    const svc = new ToolExecutionService(tools, makeExecutionLog(), makeConfig());

    const result = await svc.executeToolSafely('some_tool', {}, 'k', 'text');

    expect(result).toMatch(/invalid arguments/);
  });

  it('converts any other error into a generic safe message without leaking internal details', async () => {
    const tools = { execute: jest.fn().mockRejectedValue(new Error('ECONNREFUSED at 10.0.0.5:5432')) } as any;
    const svc = new ToolExecutionService(tools, makeExecutionLog(), makeConfig());

    const result = await svc.executeToolSafely('some_tool', {}, 'k', 'text');

    expect(result).not.toContain('ECONNREFUSED');
    expect(result).toMatch(/failed to complete/);
  });

  it('times out a hanging tool call and reports it as a logged failure', async () => {
    const tools = { execute: jest.fn().mockImplementation(() => new Promise(() => {})) } as any; // never resolves
    const executionLog = makeExecutionLog();
    const svc = new ToolExecutionService(tools, executionLog, makeConfig());

    const result = await svc.executeToolSafely('slow_tool', {}, 'k', 'text', 20);

    expect(result).toMatch(/failed to complete/);
    expect(executionLog.record).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
