import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api/client';
import {
  IconAgent,
  IconCheck,
  IconChart,
  IconCopy,
  IconRefresh,
  IconSearch,
  IconSend,
  IconSpinner,
  IconTool,
  IconUsers,
  IconX,
} from '../components/Icons';
import MarkdownLite from '../components/MarkdownLite';
import '../styles/console.css';

/** A tool the agent actually invoked — mirrors `AgentTraceStep` on the server. */
interface TraceStep {
  tool: string;
  ok: boolean;
  durationMs: number;
}

interface Message {
  id: string;
  role: 'user' | 'agent';
  text: string;
  steps?: TraceStep[];
  elapsedMs?: number;
  failed?: boolean;
  at: number;
}

interface Capability {
  name: string;
  description: string;
}

const MAX_PROMPT = 8000;

let idCounter = 0;
const nextId = () => `m${++idCounter}`;

/** Turns `calculate_finance_summary` into `Calculate finance summary`. */
function humanizeTool(name: string): string {
  const spaced = name.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Reveals text progressively so an answer feels authored rather than pasted.
 *
 * Chunk size scales with length so a long answer still completes in roughly
 * the same time as a short one, and reduced-motion users get it instantly.
 */
function useTypewriter(full: string, enabled: boolean) {
  const [shown, setShown] = useState(enabled ? '' : full);
  const [done, setDone] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setShown(full);
      setDone(true);
      return;
    }

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduced || full.length === 0) {
      setShown(full);
      setDone(true);
      return;
    }

    setShown('');
    setDone(false);

    let i = 0;
    const chunk = Math.max(1, Math.ceil(full.length / 240));
    const timer = window.setInterval(() => {
      i += chunk;
      if (i >= full.length) {
        setShown(full);
        setDone(true);
        window.clearInterval(timer);
      } else {
        setShown(full.slice(0, i));
      }
    }, 16);

    return () => window.clearInterval(timer);
  }, [full, enabled]);

  const skip = useCallback(() => {
    setShown(full);
    setDone(true);
  }, [full]);

  return { shown, done, skip };
}

function ToolTrace({ steps }: { steps: TraceStep[] }) {
  if (!steps.length) return null;

  return (
    <div className="trace" role="list" aria-label="Tools the agent used">
      {steps.map((step, i) => (
        <div
          key={`${step.tool}-${i}`}
          role="listitem"
          className={`trace-item ${step.ok ? 'trace-item-ok' : 'trace-item-fail'}`}
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <span style={{ color: step.ok ? 'var(--cyan)' : 'var(--danger)', display: 'flex' }}>
            <IconTool size={12} />
          </span>
          <span className="trace-name">{step.tool}</span>
          <span className="trace-meta">{formatDuration(step.durationMs)}</span>
          <span
            style={{ color: step.ok ? 'var(--success)' : 'var(--danger)', display: 'flex' }}
            title={step.ok ? `${humanizeTool(step.tool)} succeeded` : `${humanizeTool(step.tool)} failed`}
          >
            {step.ok ? <IconCheck size={13} strokeWidth={2.4} /> : <IconX size={13} strokeWidth={2.4} />}
          </span>
        </div>
      ))}
    </div>
  );
}

function AgentMessage({ message, animate }: { message: Message; animate: boolean }) {
  const { shown, done, skip } = useTypewriter(message.text, animate);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked by permissions/insecure origin — silently skip.
    }
  };

  return (
    <div className="msg">
      <div className="avatar avatar-sm" aria-hidden="true">
        <IconAgent size={16} />
      </div>

      <div className="msg-agent-body">
        <div className="agent-name">
          <span className="gradient-text">Agent</span>
          {message.elapsedMs !== undefined && (
            <span className="muted tiny mono">· {formatDuration(message.elapsedMs)}</span>
          )}
        </div>

        {message.steps && <ToolTrace steps={message.steps} />}

        <div
          className="agent-text"
          onClick={!done ? skip : undefined}
          style={{ cursor: !done ? 'pointer' : 'default' }}
          title={!done ? 'Click to show the full answer' : undefined}
        >
          {message.failed ? (
            <span style={{ color: 'var(--danger)' }}>{message.text}</span>
          ) : (
            <>
              <MarkdownLite text={shown} />
              {!done && <span className="caret" aria-hidden="true" />}
            </>
          )}
        </div>

        {done && !message.failed && (
          <div className="msg-actions">
            <button className="btn btn-ghost btn-sm" onClick={copy} aria-label="Copy answer">
              {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Thinking({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <div className="msg">
      <div className="avatar avatar-sm avatar-thinking" aria-hidden="true">
        <IconAgent size={16} />
      </div>
      <div className="msg-agent-body">
        <div className="agent-name">
          <span className="gradient-text">Agent</span>
        </div>
        <div className="thinking" role="status" aria-live="polite">
          <span className="dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>Thinking</span>
          <span className="mono tiny muted tabular">{(elapsed / 1000).toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
}

/** Suggested prompts, derived from the tools the agent can actually use right now. */
function suggestionsFor(capabilities: Capability[]) {
  const names = capabilities.map((c) => c.name);
  const out: { icon: ReactNode; text: string }[] = [];

  if (names.includes('calculate_finance_summary')) {
    out.push({ icon: <IconChart size={15} />, text: 'Summarize my income and expenses for last month' });
  }
  if (names.includes('get_patient_prescriptions')) {
    out.push({ icon: <IconUsers size={15} />, text: 'Show the prescription history for a patient by name' });
  }
  if (names.includes('find_latest_drive_file')) {
    out.push({ icon: <IconSearch size={15} />, text: 'Find the most recent document for a person in Drive' });
  }
  out.push({ icon: <IconTool size={15} />, text: 'What can you help me with, and what data can you access?' });

  return out.slice(0, 4);
}

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [capsLoaded, setCapsLoaded] = useState(false);

  const streamRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastAgentId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ tools: Capability[] }>('/ai/capabilities')
      .then((res) => {
        if (!cancelled) setCapabilities(res.data.tools ?? []);
      })
      .catch(() => {
        /* Non-fatal: the console still works, it just shows no tool count. */
      })
      .finally(() => {
        if (!cancelled) setCapsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the newest message in view as content streams in.
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 190)}px`;
  }, []);

  useEffect(autoGrow, [input, autoGrow]);

  const send = async (raw?: string) => {
    const prompt = (raw ?? input).trim();
    if (!prompt || busy) return;

    const userMsg: Message = { id: nextId(), role: 'user', text: prompt, at: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setBusy(true);
    setStartedAt(Date.now());

    try {
      const res = await api.post<{ result: string; steps?: TraceStep[]; elapsedMs?: number }>('/ai/command', {
        prompt,
      });
      const id = nextId();
      lastAgentId.current = id;
      setMessages((prev) => [
        ...prev,
        {
          id,
          role: 'agent',
          text: res.data.result,
          steps: res.data.steps ?? [],
          elapsedMs: res.data.elapsedMs,
          at: Date.now(),
        },
      ]);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const id = nextId();
      lastAgentId.current = id;
      setMessages((prev) => [
        ...prev,
        {
          id,
          role: 'agent',
          failed: true,
          text:
            status === 403
              ? "You don't have permission to use the agent."
              : 'The agent could not be reached. Check that the API is running and try again.',
          at: Date.now(),
        },
      ]);
    } finally {
      setBusy(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const resetConversation = async () => {
    try {
      await api.post('/ai/reset');
    } catch {
      // Even if the server call fails, clearing locally is the useful half.
    }
    setMessages([]);
    lastAgentId.current = null;
  };

  const suggestions = useMemo(() => suggestionsFor(capabilities), [capabilities]);
  const overLimit = input.length > MAX_PROMPT;
  const nearLimit = input.length > MAX_PROMPT * 0.9;

  return (
    <div className="console">
      <header className="console-header">
        <div className={`avatar ${busy ? 'avatar-thinking' : ''}`} aria-hidden="true">
          <IconAgent size={18} />
        </div>

        <div className="grow">
          <div className="row gap-2">
            <h2 style={{ fontSize: 15 }}>Agent Console</h2>
            <span className="badge badge-success">
              <span className={`dot ${busy ? 'dot-warning' : 'dot-live'}`} />
              {busy ? 'Working' : 'Online'}
            </span>
          </div>
          <div className="row gap-2 tiny muted" style={{ marginTop: 2 }}>
            {capsLoaded ? (
              <span>
                {capabilities.length} tool{capabilities.length === 1 ? '' : 's'} available
              </span>
            ) : (
              <span>Checking capabilities…</span>
            )}
            <span>·</span>
            <span>Conversation memory is scoped to your account</span>
          </div>
        </div>

        <button
          className="btn btn-ghost btn-sm"
          onClick={resetConversation}
          disabled={busy || messages.length === 0}
          title="Clear this conversation and the agent's memory of it"
        >
          <IconRefresh size={14} />
          Reset
        </button>
      </header>

      <div className="stream scroll-area" ref={streamRef}>
        <div className="stream-inner">
          {messages.length === 0 && !busy && (
            <div className="empty-hero">
              <div className="orb" aria-hidden="true">
                <IconAgent size={32} />
              </div>
              <h1 style={{ fontSize: 26, marginBottom: 8 }}>
                How can I <span className="gradient-text">help</span>?
              </h1>
              <p className="secondary" style={{ maxWidth: 460 }}>
                Ask in plain language. I can search your connected sources, pull records, and run
                calculations — and I'll show you exactly which tools I used.
              </p>

              <div className="suggestions">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    className="suggestion"
                    onClick={() => send(s.text)}
                    style={{ animation: `fade-in-up 480ms var(--ease-out) ${i * 60}ms both` }}
                  >
                    {s.icon}
                    <span>{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <div className="msg msg-user" key={m.id}>
                <div className="bubble-user">{m.text}</div>
              </div>
            ) : (
              <AgentMessage key={m.id} message={m} animate={m.id === lastAgentId.current} />
            ),
          )}

          {busy && <Thinking startedAt={startedAt} />}
        </div>
      </div>

      <div className="composer-wrap">
        <div className="composer">
          <label className="sr-only" htmlFor="agent-input">
            Message the agent
          </label>
          <textarea
            id="agent-input"
            ref={textareaRef}
            rows={1}
            value={input}
            placeholder="Ask the agent anything…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!overLimit) void send();
              }
            }}
            disabled={busy}
          />

          <div className="composer-bar">
            <span className="composer-hint">
              <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
            </span>

            <div className="grow" />

            {nearLimit && (
              <span className={`tiny mono tabular ${overLimit ? '' : 'muted'}`} style={overLimit ? { color: 'var(--danger)' } : undefined}>
                {input.length.toLocaleString()}/{MAX_PROMPT.toLocaleString()}
              </span>
            )}

            <button
              className="send-btn"
              onClick={() => void send()}
              disabled={busy || !input.trim() || overLimit}
              aria-label="Send message"
            >
              {busy ? <IconSpinner size={16} /> : <IconSend size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
