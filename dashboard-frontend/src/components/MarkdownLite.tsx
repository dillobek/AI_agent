import React from 'react';

/**
 * A deliberately small Markdown renderer for agent output.
 *
 * SECURITY: this builds React elements directly and never touches
 * `dangerouslySetInnerHTML`. Agent output is model-generated text that may
 * itself echo untrusted content (a patient note, a Drive filename, a web
 * snippet), so treating it as HTML would be a real XSS path. React escapes
 * every string we emit here, so the worst a malicious payload can do is
 * render as visible text.
 *
 * Supports the subset the agent actually produces: headings, bullet/numbered
 * lists, fenced code blocks, blockquotes, `code`, **bold**, *italic*.
 */

type Props = { text: string };

/** Splits a line into inline spans: `code`, **bold**, *italic*. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Order matters: code first so ** inside backticks isn't treated as bold.
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g;
  const parts = text.split(pattern);

  parts.forEach((part, i) => {
    if (!part) return;
    const key = `${keyPrefix}-i${i}`;

    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      nodes.push(
        <code
          key={key}
          style={{
            padding: '1.5px 5px',
            borderRadius: 4,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid var(--border)',
            color: 'var(--cyan)',
          }}
        >
          {part.slice(1, -1)}
        </code>,
      );
    } else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      nodes.push(
        <strong key={key} style={{ fontWeight: 600, color: 'var(--text)' }}>
          {part.slice(2, -2)}
        </strong>,
      );
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      nodes.push(
        <em key={key} style={{ fontStyle: 'italic' }}>
          {part.slice(1, -1)}
        </em>,
      );
    } else {
      nodes.push(<React.Fragment key={key}>{part}</React.Fragment>);
    }
  });

  return nodes;
}

export default function MarkdownLite({ text }: Props) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split('\n');

  let listBuffer: { ordered: boolean; items: string[] } | null = null;
  let codeBuffer: string[] | null = null;
  let quoteBuffer: string[] | null = null;

  const flushList = (key: string) => {
    if (!listBuffer) return;
    const { ordered, items } = listBuffer;
    const ListTag = ordered ? 'ol' : 'ul';
    blocks.push(
      React.createElement(
        ListTag,
        { key, style: { margin: '8px 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 } },
        items.map((item, i) => (
          <li key={`${key}-${i}`} style={{ lineHeight: 1.65 }}>
            {renderInline(item, `${key}-${i}`)}
          </li>
        )),
      ),
    );
    listBuffer = null;
  };

  const flushCode = (key: string) => {
    if (!codeBuffer) return;
    blocks.push(
      <pre
        key={key}
        style={{
          margin: '10px 0',
          padding: '12px 14px',
          borderRadius: 'var(--r-md)',
          background: 'var(--bg-sunken)',
          border: '1px solid var(--border)',
          overflowX: 'auto',
          fontSize: 12.5,
          lineHeight: 1.6,
        }}
      >
        <code>{codeBuffer.join('\n')}</code>
      </pre>,
    );
    codeBuffer = null;
  };

  const flushQuote = (key: string) => {
    if (!quoteBuffer) return;
    blocks.push(
      <blockquote
        key={key}
        style={{
          margin: '10px 0',
          padding: '8px 14px',
          borderLeft: '2px solid var(--border-accent)',
          background: 'rgba(34,211,238,0.04)',
          borderRadius: '0 var(--r-sm) var(--r-sm) 0',
          color: 'var(--text-secondary)',
        }}
      >
        {renderInline(quoteBuffer.join(' '), key)}
      </blockquote>,
    );
    quoteBuffer = null;
  };

  lines.forEach((line, idx) => {
    const key = `b${idx}`;

    // Fenced code blocks swallow everything until the closing fence.
    if (line.trim().startsWith('```')) {
      if (codeBuffer) flushCode(key);
      else {
        flushList(`${key}-l`);
        flushQuote(`${key}-q`);
        codeBuffer = [];
      }
      return;
    }
    if (codeBuffer) {
      codeBuffer.push(line);
      return;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);

    if (heading) {
      flushList(`${key}-l`);
      flushQuote(`${key}-q`);
      const level = heading[1].length;
      const sizes: Record<number, number> = { 1: 18, 2: 16, 3: 14.5, 4: 13.5 };
      blocks.push(
        <div
          key={key}
          style={{
            fontSize: sizes[level] ?? 14,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            margin: blocks.length ? '14px 0 6px' : '0 0 6px',
            color: 'var(--text)',
          }}
        >
          {renderInline(heading[2], key)}
        </div>,
      );
      return;
    }

    if (bullet || numbered) {
      flushQuote(`${key}-q`);
      const ordered = Boolean(numbered);
      const content = (bullet ? bullet[1] : numbered![1]) ?? '';
      if (!listBuffer || listBuffer.ordered !== ordered) {
        flushList(`${key}-l`);
        listBuffer = { ordered, items: [] };
      }
      listBuffer.items.push(content);
      return;
    }

    if (quote) {
      flushList(`${key}-l`);
      if (!quoteBuffer) quoteBuffer = [];
      quoteBuffer.push(quote[1]);
      return;
    }

    flushList(`${key}-l`);
    flushQuote(`${key}-q`);

    if (line.trim() === '') return;

    blocks.push(
      <p key={key} style={{ margin: blocks.length ? '7px 0 0' : 0, lineHeight: 1.68 }}>
        {renderInline(line, key)}
      </p>,
    );
  });

  flushList('tail-l');
  flushCode('tail-c');
  flushQuote('tail-q');

  return <>{blocks}</>;
}
