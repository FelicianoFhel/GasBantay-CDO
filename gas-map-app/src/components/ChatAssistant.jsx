import { useState, useRef, useEffect, useCallback } from 'react';
import Markdown from 'react-markdown';
import { chatPostUrl, chatStatusUrl } from '../lib/chatApi';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { fetchChatDataContext } from '../lib/chatDataContext';

const PREDEFINED_QUESTIONS = [
  {
    label: 'Presyo duol nako',
    text: 'Unsa ang presyo sa gas nga duol nako karon? Tubaga pormal gamit ang LIVE_APP_DATA lang: kung dunay presyo, ipakita og tarong; kung wala, ipasabot ngano ug unsaon (lokasyon, pag-submit). Ayaw pagbuhat og tabla nga tanan “—”.',
  },
  {
    label: 'Unsaon pag-submit?',
    text: 'Paghisguti formal: giunsa pag-submit og presyo sa Gas Bantay app, unsang fuel types (Diesel, Regular/Green, Premium/Red), ug ang voting.',
  },
  {
    label: 'Unsa ang Gas Bantay?',
    text: 'Kinsa ang Gas Bantay / CDO Gas Price Map ug unsa ang katuyoan niini alang sa komunidad sa Cagayan de Oro?',
  },
];

function ChatMarkdown({ content }) {
  return (
    <div className="chat-assistant__md">
      <Markdown>{content}</Markdown>
    </div>
  );
}

export default function ChatAssistant({ stations = [], userPosition = null }) {
  const [open, setOpen] = useState(false);
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

  const sendWithText = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setError(null);
      setInput('');
      const nextUser = { role: 'user', content: trimmed };
      setMessages((m) => [...m, nextUser]);
      setSending(true);
      try {
        let context = '';
        if (isSupabaseConfigured && stations?.length) {
          try {
            context = await fetchChatDataContext(supabase, stations, userPosition);
          } catch {
            context = '_(Dili ma-load ang live data gikan sa database.)_';
          }
        } else {
          context =
            '_(Walay Supabase connection o way stations sa view — tubaga nga walay live nga tabla.)_';
        }

        const payload = {
          messages: [...messages, nextUser].map(({ role, content }) => ({ role, content })),
          context,
        };
        const res = await fetch(chatPostUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const parts = [data.error, data.hint].filter(Boolean);
          throw new Error(parts.length ? parts.join(' — ') : `Request failed (${res.status})`);
        }
        if (!data.reply) throw new Error('No reply from assistant');
        setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
      } catch (e) {
        setError(e.message || 'Something went wrong');
        setMessages((m) => m.slice(0, -1));
        setInput(trimmed);
      } finally {
        setSending(false);
      }
    },
    [sending, messages, stations, userPosition]
  );

  const send = useCallback(() => {
    sendWithText(input);
  }, [input, sendWithText]);

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
          aria-label="Ablihi ang assistant sa mapa"
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
              <p className="chat-assistant__sub">
                Groq · Bisaya default · multilingual · live prices gikan DB
              </p>
              {backendConfigured === false && (
                <p className="chat-assistant__warn" role="status">
                  Add <code>GROQ_API_KEY</code> or <code>VITE_GROQ_API_KEY</code> in Vercel env and
                  redeploy. For local Vite only, set <code>VITE_CHAT_API_URL</code> to your deployed{' '}
                  <code>/api</code> base.
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
                Default language: <strong>Bisaya</strong>. You can also type in English or Filipino.
                Ibutang ang <strong>Use my location</strong> sa dashboard aron mas tukma ang “duol
                nako.”
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={`${i}-${m.role}`}
                className={`chat-assistant__msg chat-assistant__msg--${m.role}`}
              >
                {m.role === 'assistant' ? (
                  <ChatMarkdown content={m.content} />
                ) : (
                  m.content
                )}
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

          <div className="chat-assistant__chips" role="group" aria-label="Suggested questions">
            {PREDEFINED_QUESTIONS.map(({ label, text }) => (
              <button
                key={label}
                type="button"
                className="chat-assistant__chip"
                disabled={sending}
                onClick={() => sendWithText(text)}
              >
                {label}
              </button>
            ))}
          </div>

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
