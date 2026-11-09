'use client';
import { useEffect, useRef, useState } from 'react';
import type { ConciergeHandoff, ConciergePriority } from '@/lib/concierge-handoff';
import { openConcierge, replyToPriority, type ConciergeReply } from '@/lib/mock-concierge';
import { getBrandConfig } from '@/lib/brand-config';

type Turn = { priority: ConciergePriority; label: string; reply?: ConciergeReply };

/** Demo stand-in for the brand concierge. It only knows what the handoff payload tells it. */
export default function MockConciergePanel({ initialHandoff, onClose, onPreference }: { initialHandoff: ConciergeHandoff; onClose: () => void; onPreference?: (priority: ConciergePriority) => void }) {
  const [handoff, setHandoff] = useState(initialHandoff);
  // A preference remembered from earlier in the session is answered immediately instead of re-asked.
  const [turns, setTurns] = useState<Turn[]>(() => {
    const priority = initialHandoff.explicitPreferences.priority;
    const brand = getBrandConfig(initialHandoff.brand);
    return priority && brand ? [{ priority, label: brand.labels[priority], reply: replyToPriority(initialHandoff, priority) }] : [];
  });
  const panelRef = useRef<HTMLElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The opening (and its "carried over" note) reflects only what was known when the concierge opened.
  const opening = openConcierge(initialHandoff);
  const brandName = getBrandConfig(handoff.brand)?.displayName ?? 'Brand';

  useEffect(() => {
    panelRef.current?.focus();
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }); }, [turns]);

  const choose = (priority: ConciergePriority, label: string) => {
    const next = { ...handoff, explicitPreferences: { priority } };
    setHandoff(next);
    const index = turns.length;
    setTurns(t => [...t, { priority, label }]);
    onPreference?.(priority);
    // A short typing pause makes the scripted reply feel conversational.
    timers.current.push(setTimeout(() => {
      setTurns(t => t.map((turn, i) => (i === index ? { ...turn, reply: replyToPriority(next, priority) } : turn)));
    }, 700));
  };

  return (
    <aside className="conciergePanel" ref={panelRef} tabIndex={-1} aria-label={`${brandName} concierge (demo)`} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <header>
        <div><strong>{brandName} concierge</strong><span className="conciergeDemoTag">Demo</span></div>
        <button className="conciergeClose" onClick={onClose} aria-label="Close concierge">×</button>
      </header>
      <div className="conciergeThread" ref={threadRef} aria-live="polite">
        <p className="conciergeBot">{opening.message}</p>
        {opening.note && <p className="conciergeNote">{opening.note}</p>}
        <div className="conciergeQuick">
          {opening.quickReplies.map(q => (
            <button key={q.priority} className={handoff.explicitPreferences.priority === q.priority ? 'active' : ''} onClick={() => choose(q.priority, q.label)}>{q.label}</button>
          ))}
        </div>
        {turns.map((turn, i) => (
          <div key={i}>
            <p className="conciergeUser">{turn.label}</p>
            {turn.reply ? (
              <div className="conciergeBot">
                <p>{turn.reply.message}</p>
                <div className="conciergeCards">
                  {turn.reply.facts.map(f => (
                    <div className="conciergeCard" key={f.entity}>
                      {f.image && <img src={f.image} alt="" loading="lazy" />}
                      <div><strong>{f.entity}</strong><span>{f.detail}</span></div>
                    </div>
                  ))}
                </div>
                <p className="muted">{turn.reply.followUp}</p>
              </div>
            ) : (
              <span className="conciergeTyping" aria-label="Concierge is typing"><i /><i /><i /></span>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
