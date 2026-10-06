import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const DetailActionContext = createContext<{ target: HTMLElement | null; disabled: boolean } | null>(null);
/** Keep each domain's request state together while showing its controls in the action column. */
export function DetailActions({ children, title, collapsible = false }: { children: ReactNode; title?: string; collapsible?: boolean }) {
  const layout = useContext(DetailActionContext);
  if (!layout) return <>{children}</>;
  if (!layout.target) return null;
  return createPortal(<fieldset className="detail-action-group" disabled={layout.disabled}>{collapsible ? <details><summary>{title ?? '更多处理'}</summary><div className="detail-secondary-actions">{children}</div></details> : <>{title && <legend>{title}</legend>}{children}</>}</fieldset>, layout.target);
}
