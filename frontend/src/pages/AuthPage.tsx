import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, Fingerprint, ShieldCheck, Sparkles } from "lucide-react";
import { Button, Input } from "../components/ui";
import { useAuth } from "../services/auth";
import { ApiError } from "../services/api";

export default function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";
  const { token, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  if (token) return <Navigate to="/" replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try { await (signup ? signUp(email, password) : signIn(email, password)); navigate("/", { replace: true }); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to authenticate right now."); }
    finally { setBusy(false); }
  }
  return <main className="auth-page">
    <div className="auth-brand"><a href="/" className="brand-mark"><span className="brand-symbol">◒</span> API LENS</a><span className="brand-dot" /></div>
    <div className="auth-wrap">
      <section className="auth-copy">
        <span className="sticker">OBSERVE THE GOOD STUFF <Sparkles size={15} /></span>
        <h1>Make your<br /><span>API make sense.</span></h1>
        <p>Every request has a story. API Lens helps you read it—without digging through a thousand lines of logs.</p>
        <div className="auth-perks"><span><ShieldCheck size={17} /> Your data stays yours</span><span><Fingerprint size={17} /> Private by design</span></div>
        <div className="auth-squiggle" aria-hidden="true">〰</div>
      </section>
      <section className="auth-form-card">
        <span className="auth-icon"><Eye size={23} /></span>
        <p className="eyebrow">{signup ? "YOUR FRONT ROW SEAT" : "GOOD TO SEE YOU"}</p>
        <h2>{signup ? "Create your account" : "Welcome back"}</h2>
        <p className="muted">{signup ? "Start watching your API in a few clicks." : "Sign in to check on your endpoints."}</p>
        <form onSubmit={submit} className="form-stack">
          <label>Email address<Input autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" /></label>
          <label>Password<Input autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : undefined} type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder={signup ? "At least 8 characters" : "Your password"} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" busy={busy} className="auth-submit">{signup ? "Create account" : "Sign in"}<ArrowRight size={17} /></Button>
        </form>
        <p className="auth-switch">{signup ? "Already have an account?" : "New around here?"} <Link to={signup ? "/login" : "/signup"}>{signup ? "Sign in" : "Create an account"}</Link></p>
        <div className="form-footnote">JWT-protected dashboard <span>·</span> No tracking pixels here</div>
      </section>
    </div>
    <div className="auth-footer"><span>BUILT FOR THE BACKEND-OBSESSED</span><span>API LENS © 2026</span></div>
  </main>;
}
