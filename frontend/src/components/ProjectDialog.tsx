import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button, Input } from "./ui";

export default function ProjectDialog({ onClose, onCreate, busy }: { onClose: () => void; onCreate: (name: string) => Promise<void>; busy: boolean }) {
  const [name, setName] = useState(""); const [error, setError] = useState(""); const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); if (!name.trim()) { setError("Give your project a name first."); return; } setSubmitting(true); try { await onCreate(name.trim()); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create project."); } finally { setSubmitting(false); } }
  return <div className="dialog-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
      <button className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
      <span className="dialog-sticker">NEW PROJECT ✳</span><h2 id="new-project-title">What are we watching?</h2><p className="muted">Create a project to group your API telemetry.</p>
      <form className="form-stack" onSubmit={submit}><label>Project name<Input autoFocus maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. storefront-api" /></label>{error && <p className="form-error">{error}</p>}<div className="dialog-actions"><Button type="button" className="button-neutral" onClick={onClose} disabled={submitting}>Cancel</Button><Button busy={busy || submitting}>Create project</Button></div></form>
    </section>
  </div>;
}
