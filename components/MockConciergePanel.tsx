'use client';
import { useEffect, useRef, useState } from 'react';
import type { ConciergeHandoff, ConciergePriority } from '@/lib/concierge-handoff';
import { openConcierge, replyToPriority, type ConciergeReply } from '@/lib/mock-concierge';

type Turn = { priority: ConciergePriority; label: string; reply: ConciergeReply };

/** Demo stand-in for the brand concierge. It only knows what the handoff payload tells it. */
export default function MockConciergePanel({ initialHandoff, onClose, onPreference }: { initialHandoff: ConciergeHandoff; onClose: () => void; onPreference?: (priority: ConciergePriority) => void }) {
  const [handoff, setHandoff] = useState(initialHandoff);
  const [turns, setTurns] = useState<Turn[]>([]);
  const panelRef = useRef<HTMLElement>(null);
  const opening = openConcierge(handoff);

  useEffect(() => { panelRef.current?.focus(); }, []);

  const choose = (priority: ConciergePriority, label: string) => {
    const next = { ...handoff, explicitPreferences: { priority } };
    setHandoff(next);
    setTurns(t => [...t, { priority, label, reply: replyToPriority(next, priority) }]);
    onPreference?.(priority);
  };

  return (
    <aside className="conciergePanel" ref={panelRef} tabIndex={-1} aria-label="Wanderly concierge (demo)" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <header>
        <div><strong>Wanderly concierge</strong><span className="conciergeDemoTag">Demo</span></div>
        <button className="conciergeClose" onClick={onClose} aria-label="Close concierge">×</button>
      </header>
      <div className="conciergeThread">
        <p className="conciergeBot">{opening.message}</p>
        <div className="conciergeQuick">
          {opening.quickReplies.map(q => (
            <button key={q.priority} className={handoff.explicitPreferences.priority === q.priority ? 'active' : ''} onClick={() => choose(q.priority, q.label)}>{q.label}</button>
          ))}
        </div>
        {turns.map((turn, i) => (
          <div key={i}>
            <p className="conciergeUser">{turn.label}</p>
            <div className="conciergeBot">
              <p>{turn.reply.message}</p>
              <ul>{turn.reply.facts.map(f => <li key={f.entity}><strong>{f.entity}</strong> — {f.detail}</li>)}</ul>
              <p className="muted">{turn.reply.followUp}</p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
