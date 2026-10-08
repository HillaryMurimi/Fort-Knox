'use client';
import { Mail, Smartphone, ShieldCheck } from 'lucide-react';
import { Alert, Button } from '@/components/ui';
import { WorkflowPipeline } from '@/components/workflow-pipeline';
import { orderedWorkflow } from '@/lib/status';
import type { AdminMfaChoice } from '@/types/auth';

export function AdminMfaChoicePanel({ choice, sending, error, onChoose, onRestart }: {
  choice: AdminMfaChoice; sending: 'EMAIL' | 'SMS' | null; error: string | null;
  onChoose: (channel: 'EMAIL' | 'SMS') => void; onRestart: () => void;
}) {
  return <section className="mt-8 space-y-5" aria-labelledby="admin-channel-title">
    <WorkflowPipeline label="Administrator authentication progress" domain="auth"
      stages={orderedWorkflow(['Password accepted', 'Choose verification method', 'Verify code', 'Privileged session'], 1, sending ? 'PROCESSING' : 'UNDER_REVIEW')} />
    <h2 id="admin-channel-title" className="text-lg font-semibold">Choose how to verify</h2>
    <p className="text-sm text-muted-foreground">Your password is verified. Receive one sign-in code through your verified email or phone.</p>
    <div className="grid gap-3">
      {choice.channels.map(option => <Button key={option.channel} type="button" variant="outline"
        className="h-auto min-h-16 justify-start gap-3 py-3 text-left" disabled={sending !== null}
        loading={sending === option.channel} aria-busy={sending === option.channel} onClick={() => onChoose(option.channel)}>
        {option.channel === 'EMAIL' ? <Mail size={20} aria-hidden /> : <Smartphone size={20} aria-hidden />}
        <span><span className="block font-semibold">{option.channel === 'EMAIL' ? 'Send email code' : 'Send SMS code'}</span>
          <span className="block text-xs text-muted-foreground">{option.destination}</span></span>
      </Button>)}
    </div>
    {sending && <p className="text-sm text-muted-foreground" role="status">Sending your {sending === 'EMAIL' ? 'email' : 'SMS'} code…</p>}
    {error && <div role="alert"><Alert tone="destructive">{error}</Alert></div>}
    <Button type="button" variant="ghost" className="w-full" disabled={sending !== null} onClick={onRestart}>Start sign-in again</Button>
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={14} aria-hidden /> No administrator access is granted until your chosen code is verified.</p>
  </section>;
}
