import { AgentService } from './agent.service';
import { UnknownToolError } from './tools/agent-tools.service';

function makeConfig(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    AGENT_MAX_PROMPT_CHARS: 8000,
    AGENT_MAX_TOOL_CALLS: 3,
    AGENT_TOOL_TIMEOUT_MS: 1000,
    AGENT_MAX_TOOL_OUTPUT_CHARS: 6000,
    API_CALL_DELAY_MIN_MS: 0,
    API_CALL_DELAY_MAX_MS: 0,
    SESSION_TTL_MINUTES: 60,
  };
  return { get: (key: string) => (key in overrides ? overrides[key] : defaults[key]) } as any;
}

function makeMemory() {
  let stored: any[] = [];
  return {
    load: jest.fn().mockImplementation(async () => stored),
    save: jest.fn().mockImplementation(async (_key: string, history: any[]) => {
      stored = history;
    }),
    clear: jest.fn().mockImplementation(async () => {
      stored = [];
    }),
  } as any;
}

function makeExecutionLog() {
  return { record: jest.fn().mockResolvedValue(null) } as any;
}

describe('AgentService', () => {
  it('returns a final answer directly when the model does not call any tool', async () => {
    const provider = { generate: jest.fn().mockResolvedValue({ text: 'Hello there.' }) } as any;
    const tools = { getAvailableDeclarations: () => [], execute: jest.fn() } as any;
    const agent = new AgentService(provider, tools, makeMemory(), makeConfig(), makeExecutionLog());

    const result = await agent.processUserCommand('hi', 'telegram:1');
    expect(result).toBe('Hello there.');
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it('executes a tool call, feeds the result back, and returns the final synthesized answer', async () => {
    const provider = {
      generate: jest
        .fn()
        .mockResolvedValueOnce({ toolCalls: [{ id: 'c1', name: 'some_tool', args: { x: 1 } }] })
        .mockResolvedValueOnce({ text: 'Here is your answer based on the tool result.' }),
    } as any;
    const tools = {
      getAvailableDeclarations: () => [{ name: 'some_tool', description: '', parameters: { type: 'OBJECT', properties: {} } }],
      execute: jest.fn().mockResolvedValue('tool output value'),
    } as any;
    const agent = new AgentService(provider, tools, makeMemory(), makeConfig(), makeExecutionLog());

    const result = await agent.processUserCommand('do the thing', 'telegram:1');
    expect(result).toBe('Here is your answer based on the tool result.');
    expect(tools.execute).toHaveBeenCalledWith('some_tool', { x: 1 });
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it('supports multiple tool calls within a single round', async () => {
    const provider = {
      generate: jest
        .fn()
        .mockResolvedValueOnce({
          toolCalls: [
            { id: 'c1', name: 'tool_a', args: {} },
            { id: 'c2', name: 'tool_b', args: {} },
          ],
        })
        .mockResolvedValueOnce({ text: 'combined answer' }),
    } as any;
    const tools = {
      getAvailableDeclarations: () => [],
      execute: jest.fn().mockImplementation(async (name: string) => `${name}-result`),
    } as any;
    const agent = new AgentService(provider, tools, makeMemory(), makeConfig(), makeExecutionLog());

    const result = await agent.processUserCommand('do two things', 'telegram:1');
    expect(result).toBe('combined answer');
    expect(tools.execute).toHaveBeenCalledTimes(2);
  });

  it('stops safely once the max tool-call step limit is reached, without crashing', async () => {
    // The model NEVER returns a final text answer — always another tool call.
    const provider = {
      generate: jest.fn().mockResolvedValue({ toolCalls: [{ id: 'c', name: 'loop_tool', args: {} }] }),
    } as any;
    const tools = { getAvailableDeclarations: () => [], execute: jest.fn().mockResolvedValue('output') } as any;
    const agent = new AgentService(provider, tools, makeMemory(), makeConfig({ AGENT_MAX_TOOL_CALLS: 3 }), makeExecutionLog());

    const result = await agent.processUserCommand('loop forever', 'telegram:1');
    expect(result).toMatch(/maximum number of steps/i);
    expect(provider.generate).toHaveBeenCalledTimes(3); // never exceeds the configured max
  });

  it('turns an unknown-tool failure into a safe message instead of throwing to the caller', async () => {
    const provider = {
      generate: jest
        .fn()
        .mockResolvedValueOnce({ toolCalls: [{ id: 'c1', name: 'does_not_exist', args: {} }] })
        .mockResolvedValueOnce({ text: 'I could not do that.' }),
    } as any;
    const tools = {
      getAvailableDeclarations: () => [],
      execute: jest.fn().mockRejectedValue(new UnknownToolError('does_not_exist')),
    } as any;
    const executionLog = makeExecutionLog();
    const agent = new AgentService(provider, tools, makeMemory(), makeConfig(), executionLog);

    const result = await agent.processUserCommand('call a fake tool', 'telegram:1');
    expect(result).toBe('I could not do that.');
    expect(executionLog.record).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('rejects an over-long prompt without calling the model at all', async () => {
    const provider = { generate: jest.fn() } as any;
    const tools = { getAvailableDeclarations: () => [], execute: jest.fn() } as any;
    const agent = new AgentService(provider, tools, makeMemory(), makeConfig({ AGENT_MAX_PROMPT_CHARS: 10 }), makeExecutionLog());

    const result = await agent.processUserCommand('this message is way too long for the limit', 'telegram:1');
    expect(result).toMatch(/too long/i);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('isolates memory between channel keys', async () => {
    const provider = { generate: jest.fn().mockResolvedValue({ text: 'ok' }) } as any;
    const tools = { getAvailableDeclarations: () => [], execute: jest.fn() } as any;
    const memory = makeMemory();
    const agent = new AgentService(provider, tools, memory, makeConfig(), makeExecutionLog());

    await agent.processUserCommand('hello from user A', 'telegram:111');
    expect(memory.save).toHaveBeenCalledWith('telegram:111', expect.any(Array));

    await agent.processUserCommand('hello from user B', 'telegram:222');
    expect(memory.save).toHaveBeenCalledWith('telegram:222', expect.any(Array));
    // Each save call's history belongs to that call's own channel — load() is also called per-channel.
    expect(memory.load).toHaveBeenCalledWith('telegram:111');
    expect(memory.load).toHaveBeenCalledWith('telegram:222');
  });
});
