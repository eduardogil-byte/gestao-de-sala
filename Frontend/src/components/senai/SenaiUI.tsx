import type { KeyboardEvent, ReactNode } from "react";
import "./senai.css";

/** Delimita as telas que já usam o design SENAI. */
export function SenaiScope({ children, modals = false }: { children: ReactNode; modals?: boolean }) {
  return <div className={modals ? "sg-scope sg-modals" : "sg-scope"}>{children}</div>;
}

export function PageHeading({ title, eyebrow, subtitle, action }: { title: string; eyebrow?: string; subtitle?: string; action?: ReactNode }) {
  return <header className="sg-heading">
    <div>
      {eyebrow && <span className="sg-eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {action && <div className="sg-actions">{action}</div>}
  </header>;
}

export function StatCard({ label, value, detail, tone = "blue" }: { label: string; value: ReactNode; detail?: string; tone?: "blue" | "green" | "amber" | "gray" }) {
  return <article className={`card sg-stat is-${tone}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    {detail && <small>{detail}</small>}
  </article>;
}

export function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="card sg-panel">
    <div className="sg-panel-head">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
    <div className="sg-panel-body">{children}</div>
  </section>;
}

export function Tabs({ label, idPrefix, items, active, onChange }: {
  label: string; idPrefix: string; active: string; onChange: (id: string) => void;
  items: { id: string; label: string; count?: number }[];
}) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const targets: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: items.length - 1 };
    if (!(event.key in targets)) return;
    event.preventDefault();
    const next = (targets[event.key] + items.length) % items.length;
    onChange(items[next].id);
    (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  }
  return <div className="sg-tabs" role="tablist" aria-label={label}>
    {items.map((item, index) => <button type="button" role="tab" key={item.id} id={`${idPrefix}-tab-${item.id}`}
      aria-selected={active === item.id} aria-controls={active === item.id ? `${idPrefix}-panel-${item.id}` : undefined}
      tabIndex={active === item.id ? 0 : -1} onClick={() => onChange(item.id)} onKeyDown={(event) => onKeyDown(event, index)}>
      {item.label}{item.count !== undefined && <span>{item.count}</span>}
    </button>)}
  </div>;
}
