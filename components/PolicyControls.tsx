'use client';
import { policyLimits, resetPolicyOptions, setPolicyOptions } from '@/lib/policy-settings';
import { usePolicyOptions } from './use-policy-options';

/** What-if controls for the deterministic policy gate; changes apply to the embedded site immediately. */
export default function PolicyControls() {
  const options = usePolicyOptions();
  const { minConfidence, cooldownSeconds, maxInvitationsPerSession } = policyLimits;
  return (
    <details className="panel policyControls">
      <summary>Policy controls (what-if)</summary>
      <p className="muted">The model proposes; this gate decides. Try raising the confidence threshold to see an invitation get blocked.</p>
      <label>
        <span>Minimum confidence <strong>{Math.round(options.minConfidence * 100)}%</strong></span>
        <input type="range" min={minConfidence.min} max={minConfidence.max} step={0.01} value={options.minConfidence}
          onChange={e => setPolicyOptions({ ...options, minConfidence: Number(e.target.value) })} />
      </label>
      <label>
        <span>Cooldown after a dismissal <strong>{options.cooldownMs / 1000}s</strong></span>
        <input type="range" min={cooldownSeconds.min} max={cooldownSeconds.max} step={10} value={options.cooldownMs / 1000}
          onChange={e => setPolicyOptions({ ...options, cooldownMs: Number(e.target.value) * 1000 })} />
      </label>
      <label>
        <span>Invitations per session <strong>{options.maxInvitationsPerSession}</strong></span>
        <input type="range" min={maxInvitationsPerSession.min} max={maxInvitationsPerSession.max} step={1} value={options.maxInvitationsPerSession}
          onChange={e => setPolicyOptions({ ...options, maxInvitationsPerSession: Number(e.target.value) })} />
      </label>
      <button className="btn ghost" onClick={resetPolicyOptions}>Reset to defaults</button>
    </details>
  );
}
