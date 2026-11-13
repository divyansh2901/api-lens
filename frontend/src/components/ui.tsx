import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

export function Button({ children, className = "", busy = false, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return <button className={`nb-button ${className}`} disabled={busy || disabled} {...props}>{busy && <LoaderCircle size={16} className="spin" />}{children}</button>;
}
export function Card({ children, className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`nb-card ${className}`} {...props}>{children}</section>;
}
export function SectionTitle({ kicker, title, action }: { kicker?: string; title: string; action?: ReactNode }) {
  return <div className="section-title"> <div>{kicker && <p className="eyebrow">{kicker}</p>}<h2>{title}</h2></div>{action}</div>;
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input className="nb-input" {...props} />; }
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select className="nb-input nb-select" {...props} />; }
export function StatusBadge({ code }: { code: number }) {
  const tone = code >= 500 ? "coral" : code >= 400 ? "yellow" : code >= 300 ? "purple" : "green";
  return <span className={`status-badge ${tone}`}>{code}</span>;
}
export function EmptyState({ title, body }: { title: string; body: string }) { return <div className="empty-state"><span className="empty-icon">✳</span><h3>{title}</h3><p>{body}</p></div>; }
export function LoadingState({ label = "Fetching your observability data" }: { label?: string }) { return <div className="loading-state"><LoaderCircle className="spin" size={22} />{label}…</div>; }
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) { return <div className="error-notice"><strong>Something went sideways.</strong><span>{message}</span>{retry && <Button type="button" onClick={retry}>Try again</Button>}</div>; }
