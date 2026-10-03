'use client';

import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle, ArrowDownRight, ArrowUpRight, Loader2, Search, X, Circle, Clock3, CircleCheck, CheckCircle2, CircleX, PauseCircle, MinusCircle, Archive, ScanEye } from 'lucide-react';
import { statusSemantic, statusLabel, type StatusDomain, type StatusSemantic } from '@/lib/status';
import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

const buttonVariants: Record<ButtonVariant, string> = {
  default: 'border-transparent bg-[var(--primary)] text-white shadow-sm hover:bg-[var(--primary-hover)]',
  secondary: 'border-[var(--border)] bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--muted)]',
  outline: 'border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] shadow-sm hover:border-[var(--border-strong)] hover:bg-[var(--muted)]',
  ghost: 'border-transparent bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
  destructive: 'border-transparent bg-[var(--destructive)] text-white shadow-sm hover:bg-[#a41d16]',
  link: 'h-auto border-transparent bg-transparent p-0 text-[var(--primary)] underline-offset-4 hover:underline',
};

const buttonSizes: Record<ButtonSize, string> = {
  default: 'h-10 px-4 py-2',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-11 px-5',
  icon: 'h-10 w-10 p-0',
};

export function buttonClassName({ variant = 'default', size = 'default', className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string | undefined } = {}) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', loading = false, children, disabled, ...props }, ref) => (
    <button ref={ref} className={buttonClassName({ variant, size, className })} disabled={disabled || loading} {...props}>
      {loading && <Loader2 aria-hidden="true" className="animate-spin" size={15} />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('card', className)} {...props} />,
);
Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('flex flex-col gap-1.5 p-5', className)} {...props} />,
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h3 ref={ref} className={cn('text-sm font-semibold leading-none', className)} {...props} />,
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <p ref={ref} className={cn('text-sm text-[var(--muted-foreground)]', className)} {...props} />,
);
CardDescription.displayName = 'CardDescription';

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />,
);
CardContent.displayName = 'CardContent';

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('flex items-center gap-3 p-5 pt-0', className)} {...props} />,
);
CardFooter.displayName = 'CardFooter';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => <input ref={ref} type={type} className={cn('input', className)} {...props} />,
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn('input min-h-24 resize-y py-2.5', className)} {...props} />,
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn('input appearance-none pr-9', className)} {...props} />,
);
Select.displayName = 'Select';
export function StatusSelect({domain='general',className,value,...props}:SelectHTMLAttributes<HTMLSelectElement> & {domain?:StatusDomain}) {
  const semantic=statusSemantic(value,domain);
  return <Select {...props} value={value} data-semantic={semantic} className={cn('status-surface',`status-${semantic}`,className)} />;
}

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => <label ref={ref} className={cn('field-label', className)} {...props} />,
);
Label.displayName = 'Label';

export function SearchField({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <div className={cn('relative min-w-0', className)}><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" size={16} /><Input type="search" className="pl-9" {...props} /></div>;
}

type BadgeTone = 'neutral' | 'green' | 'orange' | 'red' | 'blue' | 'purple';
const badgeTones: Record<BadgeTone, StatusSemantic> = { neutral: 'neutral', green: 'success', orange: 'attention', red: 'failed', blue: 'processing', purple: 'review' };

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return <span className={cn('status-badge status-surface', `status-${badgeTones[tone]}`, className)}>{children}</span>;
}
const statusIcons = { neutral: Circle, pending: Clock3, processing: Loader2, review: ScanEye, attention: AlertCircle, blocked: AlertCircle, failed: CircleX, success: CircleCheck, completed: CheckCircle2, paused: PauseCircle, inactive: MinusCircle, archived: Archive };
export function StatusBadge({ status, domain = 'general', children, className, ...props }: Omit<HTMLAttributes<HTMLSpanElement>, 'color'> & { status: unknown; domain?: StatusDomain }) {
  const semantic = statusSemantic(status, domain), Icon = statusIcons[semantic];
  return <span {...props} data-status={typeof status === 'string' ? status : 'UNKNOWN'} data-domain={domain} data-semantic={semantic} className={cn('status-badge status-surface', `status-${semantic}`, className)}><Icon size={12} aria-hidden="true" /><span>{children ?? statusLabel(status)}</span></span>;
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="tablist" className={cn('flex max-w-full gap-1 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--muted)] p-1', className)} {...props} />;
}

export function TabsTrigger({ active, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button role="tab" aria-selected={active} className={cn('h-8 whitespace-nowrap rounded px-3 text-xs font-semibold text-[var(--muted-foreground)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]', active && 'bg-[var(--panel)] text-[var(--foreground)] shadow-sm', className)} {...props} />;
}

export function Separator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn('h-px w-full bg-[var(--border)]', className)} {...props} />;
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-[#e9ecef]', className)} {...props} />;
}

export function Alert({ title, children, tone = 'default', className }: { title?: string; children: ReactNode; tone?: 'default' | 'destructive' | 'warning' | 'success'; className?: string }) {
  const tones = { default: 'status-processing', destructive: 'status-failed', warning: 'status-attention', success: 'status-success' };
  return <div role="alert" className={cn('status-surface flex gap-3 rounded-md border p-3 text-sm', tones[tone], className)}><AlertCircle className="mt-0.5 shrink-0" size={16} /><div>{title && <div className="font-semibold">{title}</div>}<div className={cn(title && 'mt-0.5')}>{children}</div></div></div>;
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <span className="tooltip-wrap" data-tooltip={label}>{children}</span>;
}

export function Dialog({ open, onOpenChange, title, description, children, className }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; className?: string }) {
  const panelRef = useRef<HTMLElement>(null);
  const changeRef = useRef(onOpenChange);
  changeRef.current = onOpenChange;
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') changeRef.current(false);
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); panelRef.current?.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close); previouslyFocused?.focus(); };
  }, [open]);

  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onOpenChange(false)}><section ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={cn('modal-panel', className)}><div className="mb-5 flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4"><div><h2 className="text-base font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>}</div><Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)} aria-label="Close dialog"><X size={17} /></Button></div>{children}</section></div>;
}

export function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:gap-6"><div className="min-w-0"><div className="flex items-center gap-2">{eyebrow && <><span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" /><div className="text-[11px] font-bold uppercase text-[var(--accent-strong)]">{eyebrow}</div></>}</div><h1 className="mt-1 text-2xl font-semibold text-[var(--foreground)] sm:text-3xl">{title}</h1>{description && <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">{description}</p>}</div>{action && <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">{action}</div>}</div>;
}

export function Stat({ label, value, sub, trend, icon: Icon }: { label: string; value: string; sub?: string; trend?: 'up' | 'down'; icon: React.ElementType }) {
  return <Card className="relative min-w-0 overflow-hidden p-4 sm:p-5"><div className="absolute inset-y-0 left-0 w-0.5 bg-[var(--accent)]" /><div className="flex items-start justify-between gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)] text-[var(--secondary-foreground)]"><Icon size={17} /></div>{trend && <span className={cn('flex items-center gap-1 text-[11px] font-semibold', trend === 'up' ? 'text-[#067647]' : 'text-[#b42318]')}>{trend === 'up' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}</span>}</div><div className="mt-4 text-xs font-medium text-[var(--muted-foreground)]">{label}</div><div className="metric mt-1 break-words text-xl font-semibold leading-tight text-[var(--foreground)]">{value}</div>{sub && <div className="mt-1 min-h-4 text-[11px] text-muted-foreground">{sub}</div>}</Card>;
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-[var(--foreground)]">{title}</h2>{description && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{description}</p>}</div>{action}</div>;
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: React.ElementType; title: string; description: string; action?: ReactNode; className?: string }) {
  return <div className={cn('card flex min-h-56 flex-col items-center justify-center border-dashed p-6 text-center sm:p-10', className)}><div className="flex h-11 w-11 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]"><Icon size={20} /></div><div className="mt-4 font-semibold">{title}</div><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}
