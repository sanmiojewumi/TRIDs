'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function MessagesPage() {
  const [conversations, setConversations] = useState<{ id: string; messages: { id: string; body: string; senderId: string }[] }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ conversations: typeof conversations }>('/conversations').then((data) => setConversations(data.conversations)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Sign in to read messages'));
  }, []);
  return (
    <>
      <h1 style={{ fontFamily: 'var(--serif)' }}>Inbox</h1>
      {error ? <div className="error">{error}</div> : null}
      {!conversations.length && !error ? <div className="empty">No conversations yet. Message a seller from a listing.</div> : null}
      {conversations.map((conversation) => (
        <article key={conversation.id} className="panel section stack">
          {conversation.messages.map((message) => <p key={message.id}>{message.body}</p>)}
          <form className="row" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const body = String(new FormData(event.currentTarget).get('body') || '');
            api(`/conversations/${conversation.id}/messages`, { method: 'POST', body: { body } }).then(() => location.reload());
          }}>
            <input name="body" placeholder="Reply" />
            <button className="btn" type="submit">Send</button>
          </form>
        </article>
      ))}
    </>
  );
}
