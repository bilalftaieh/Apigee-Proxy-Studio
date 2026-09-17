import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LEVELS,
  clearRecords,
  flushToServer,
  getLevel,
  getRecords,
  setLevel,
  subscribe,
  type LogLevel,
} from '../lib/log/logger';
import { useUiStore } from '../store/useUiStore';
import { Icon } from './Icon';

/**
 * The log panel: everything the client and the server have recorded, in one
 * list, newest last.
 *
 * WHY IT POLLS RATHER THAN STREAMS: the server keeps its recent records in a
 * ring with a monotonic cursor, so a poll asks "anything after 1423?" and
 * normally gets an empty array back — a few dozen bytes. A WebSocket or SSE
 * channel would be strictly more machinery for a panel that is closed almost
 * all the time, and polling only runs while it is open.
 */

/** As stored by the server's ring: short keys, arbitrary extra fields. */
interface ServerRecord {
  t: string;
  l: string;
  mod: string;
  msg: string;
  seq: number;
  src?: string;
  [field: string]: unknown;
}

interface Row {
  key: string;
  t: string;
  level: string;
  mod: string;
  msg: string;
  source: 'server' | 'client';
  fields: Record<string, unknown>;
}

const POLL_MS = 1000;
const MAX_ROWS = 1000;
const LEVEL_OPTIONS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];

// The panel's own requests deliberately bypass api/client.ts. That client logs
// every call, so polling through it would add a record per second — the panel
// would fill with the sound of itself being open.
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return res.status === 204 ? (null as T) : ((await res.json()) as T);
  } catch {
    // The server being unreachable is a normal state for this panel to be in —
    // it is often the thing you opened it to look at. Client-side records keep
    // arriving regardless.
    return null;
  }
}

function fieldsOf(record: ServerRecord): Record<string, unknown> {
  const { t, l, mod, msg, seq, src, ...rest } = record;
  return rest;
}

function formatFields(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join('  ');
}

// An error record carries a full stack, which inline is a dozen wrapped lines
// that push every other row off screen. Collapsed to a single line's worth
// here; clicking the row shows the whole thing, formatted.
const INLINE_FIELD_CHARS = 220;

function inlineFields(fields: Record<string, unknown>): string {
  const text = formatFields(fields);
  return text.length > INLINE_FIELD_CHARS ? `${text.slice(0, INLINE_FIELD_CHARS)}… (click)` : text;
}

export function LogConsole() {
  const open = useUiStore((s) => s.logConsoleOpen);
  const close = useUiStore((s) => s.closeLogConsole);

  const [serverRecords, setServerRecords] = useState<ServerRecord[]>([]);
  const [, forceRender] = useState(0);
  const [minLevel, setMinLevel] = useState<LogLevel>('debug');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<'all' | 'server' | 'client'>('all');
  const [follow, setFollow] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [clientLevel, setClientLevel] = useState<LogLevel>(getLevel());
  const [serverConfig, setServerConfig] = useState<{ fileLevel: string; file: string; fileBytes: number | null } | null>(null);

  const cursor = useRef(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // Re-render when the client logger records something — coalesced inside the
  // logger, so a burst costs one render.
  useEffect(() => (open ? subscribe(() => forceRender((n) => n + 1)) : undefined), [open]);

  // Poll the server's ring, but only while the panel is open.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    const tick = async () => {
      const data = await fetchJson<{ records: ServerRecord[]; cursor: number }>(
        `/api/logs?after=${cursor.current}&limit=500`
      );
      if (cancelled || !data) return;
      cursor.current = data.cursor;
      if (data.records.length) {
        setServerRecords((prev) => [...prev, ...data.records].slice(-MAX_ROWS));
      }
    };

    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void fetchJson<{ fileLevel: string; file: string; fileBytes: number | null }>('/api/logs/config').then(
      (data) => data && setServerConfig(data)
    );
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    if (!open) return [];

    const floor = LEVELS[minLevel];
    const needle = query.trim().toLowerCase();
    const merged: Row[] = [];

    if (source !== 'client') {
      for (const record of serverRecords) {
        // Records the server received FROM a browser are skipped: this tab
        // already holds the originals, at full client-side detail, and showing
        // both would double every line the moment shipping is on.
        if (record.src === 'client') continue;
        merged.push({
          key: `s${record.seq}`,
          t: record.t,
          level: record.l,
          mod: record.mod,
          msg: record.msg,
          source: 'server',
          fields: fieldsOf(record),
        });
      }
    }

    if (source !== 'server') {
      for (const record of getRecords()) {
        merged.push({
          key: `c${record.seq}`,
          t: record.t,
          level: record.level,
          mod: record.mod,
          msg: record.msg,
          source: 'client',
          fields: record.fields || {},
        });
      }
    }

    return merged
      .filter((row) => (LEVELS[row.level as LogLevel] ?? 0) >= floor)
      .filter((row) => !needle || `${row.msg} ${row.mod} ${formatFields(row.fields)}`.toLowerCase().includes(needle))
      // Both sides timestamp in ISO UTC, so a lexical sort is a chronological
      // one — and it interleaves the browser's view of a request with the
      // server's handling of it, which is the whole point of merging them.
      .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0))
      .slice(-MAX_ROWS);
    // Note: `expanded` is deliberately NOT a dependency — it changes what one
    // row renders, not which rows exist, and listing it here would re-filter and
    // re-sort the whole list on every click.
  }, [open, serverRecords, minLevel, query, source]);

  useEffect(() => {
    if (!open || !follow || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [rows.length, open, follow]);

  // Scrolling up means "let me read this" — following resumes when the user
  // returns to the bottom.
  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  }, []);

  const copyVisible = useCallback(() => {
    const text = rows
      .map((row) => `${row.t} ${row.level.toUpperCase()} ${row.source}:${row.mod} ${row.msg} ${formatFields(row.fields)}`)
      .join('\n');
    void navigator.clipboard?.writeText(text);
  }, [rows]);

  const downloadFile = useCallback(() => {
    // Anything the browser has queued is pushed first, so the downloaded file
    // ends with the line the user is looking at rather than a few seconds short
    // of it.
    flushToServer();
    window.setTimeout(() => window.open('/api/logs/download', '_blank'), 250);
  }, []);

  const changeClientLevel = useCallback((next: LogLevel) => {
    setLevel(next);
    setClientLevel(next);
  }, []);

  const changeServerLevel = useCallback((next: LogLevel) => {
    void fetchJson('/api/logs/level', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileLevel: next }),
    }).then(() => setServerConfig((prev) => (prev ? { ...prev, fileLevel: next } : prev)));
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="log-console">
      <div className="log-console-head">
        <span className="log-console-title">
          <Icon name="scroll-text" size={14} />
          Logs
        </span>

        <input
          className="log-console-search"
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <select className="log-console-select" value={minLevel} onChange={(e) => setMinLevel(e.target.value as LogLevel)}>
          {LEVEL_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}+
            </option>
          ))}
        </select>

        <select className="log-console-select" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
          <option value="all">all</option>
          <option value="server">server</option>
          <option value="client">browser</option>
        </select>

        <span className="log-console-count">{rows.length}</span>

        <div className="log-console-actions">
          <button className="icon-btn" title="Copy what is shown" onClick={copyVisible}>
            <Icon name="copy" size={14} />
          </button>
          <button className="icon-btn" title="Download the full log file" onClick={downloadFile}>
            <Icon name="download" size={14} />
          </button>
          <button
            className="icon-btn"
            title="Clear this view (the file is untouched)"
            onClick={() => {
              clearRecords();
              setServerRecords([]);
            }}
          >
            <Icon name="eraser" size={14} />
          </button>
          <button className="icon-btn" title="Close" onClick={close}>
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>

      <div className="log-console-body" ref={listRef} onScroll={onScroll}>
        {rows.length === 0 ? (
          <div className="log-console-empty">Nothing at this level yet.</div>
        ) : (
          rows.map((row) => {
            const fieldText = inlineFields(row.fields);
            const isOpen = expanded === row.key;
            return (
              <div
                key={row.key}
                className={`log-row log-${row.level}${isOpen ? ' expanded' : ''}`}
                onClick={() => setExpanded(isOpen ? null : row.key)}
              >
                <span className="log-time">{row.t.slice(11, 23)}</span>
                <span className={`log-level log-level-${row.level}`}>{row.level}</span>
                <span className="log-mod">{row.source === 'client' ? `ui:${row.mod}` : row.mod}</span>
                <span className="log-msg">{row.msg}</span>
                {fieldText && !isOpen && <span className="log-fields">{fieldText}</span>}
                {isOpen && <pre className="log-detail">{JSON.stringify(row.fields, null, 2)}</pre>}
              </div>
            );
          })
        )}
      </div>

      <div className="log-console-foot">
        <label>
          browser
          <select className="log-console-select" value={clientLevel} onChange={(e) => changeClientLevel(e.target.value as LogLevel)}>
            {LEVEL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          server file
          <select
            className="log-console-select"
            value={serverConfig?.fileLevel || 'debug'}
            onChange={(e) => changeServerLevel(e.target.value as LogLevel)}
          >
            {LEVEL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        {serverConfig && (
          <span className="log-console-file" title={serverConfig.file}>
            {serverConfig.file.replace(/^.*[\\/]/, '')}
            {serverConfig.fileBytes !== null && ` · ${Math.round(serverConfig.fileBytes / 1024)} KB`}
          </span>
        )}
        {!follow && (
          <button className="btn btn-sm" onClick={() => setFollow(true)}>
            Follow
          </button>
        )}
      </div>
    </div>
  );
}
