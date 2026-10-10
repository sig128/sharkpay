import { clsx } from "clsx";
import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display mt-2 text-[clamp(2.6rem,6vw,4.2rem)]">{title}</h1>
        {children && <div className="mt-3 max-w-2xl text-muted">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ title, children, className, action, id }: { title?: ReactNode; children: ReactNode; className?: string; action?: ReactNode; id?: string }) {
  return (
    <section className={clsx("panel p-5 md:p-6", className)} aria-labelledby={title && id ? id : undefined}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          {title && (
            <h2 id={id} className="text-sm font-semibold text-warm">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function KV({ items, className }: { items: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={clsx("divide-y divide-line text-sm", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel flex flex-col items-center px-6 py-14 text-center">
      <h2 className="display text-3xl">{title}</h2>
      {children && <div className="mt-3 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
