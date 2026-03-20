import { useState, useRef, useEffect, useCallback } from 'react';
import { chatPostUrl, chatStatusUrl } from '../lib/chatApi';

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  /** Server has GROQ_API_KEY (from GET /api/chat). FAB is always shown regardless. */
  const [backendConfigured, setBackendConfigured] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(chatStatusUrl(), { method: 'GET' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setBackendConfigured(false);
          return;
        }
        setBackendConfigured(Boolean(data.enabled));
      } catch {
        if (!cancelled) setBackendConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, sending]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setInput('');
    const nextUser = { role: 'user', content: text };
    setMessages((m) => [...m, nextUser]);
    setSending(true);
    try {
      const payload = {
        messages: [...messages, nextUser].map(({ role, content }) => ({ role, content })),
      };
      const res = await fetch(chatPostUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      if (!data.reply) throw new Error('No reply from assistant');
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
    } catch (e) {
      setError(e.message || 'Something went wrong');
      setMessages((m) => m.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
    }
  }, [input, messages, sending]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-assistant">
      {!open && (
        <button
          type="button"
          className="chat-assistant__fab"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-haspopup="dialog"
          aria-label="Open fuel map assistant"
        >
          <span className="chat-assistant__fab-icon" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
              <path d="M8 9h8M8 13h5" />
            </svg>
          </span>
          <span className="chat-assistant__fab-label">Assistant</span>
        </button>
      )}

      {open && (
        <div
          className="chat-assistant__panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="chat-assistant-title"
        >
          <div className="chat-assistant__head">
            <div>
              <h2 id="chat-assistant-title" className="chat-assistant__title">
                Map assistant
              </h2>
              <p className="chat-assistant__sub">Groq · CDO gas prices help</p>
              {backendConfigured === false && (
                <p className="chat-assistant__warn" role="status">
                  Add <code>GROQ_API_KEY</code> in Vercel project env and redeploy, or set{' '}
                  <code>VITE_CHAT_API_URL</code> for local dev.
                </p>
              )}
            </div>
            <button
              type="button"
              className="chat-assistant__close"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
            >
              ×
            </button>
          </div>

          <div className="chat-assistant__body" ref={listRef}>
            {messages.length === 0 && (
              <p className="chat-assistant__empty">
                Ask how to submit a price, use the map, or what Diesel / Regular / Premium mean.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={`${i}-${m.role}`}
                className={`chat-assistant__msg chat-assistant__msg--${m.role}`}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <div className="chat-assistant__msg chat-assistant__msg--assistant chat-assistant__typing">
                …
              </div>
            )}
          </div>

          {error && (
            <p className="chat-assistant__error" role="alert">
              {error}
            </p>
          )}

          <div className="chat-assistant__foot">
            <textarea
              className="chat-assistant__input"
              rows={2}
              placeholder="Message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={sending}
              aria-label="Message to assistant"
            />
            <button
              type="button"
              className="chat-assistant__send btn-primary"
              onClick={send}
              disabled={sending || !input.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
