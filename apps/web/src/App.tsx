import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { useEffect, useState, type FormEvent } from "react";
import { auth, firebaseConfigured } from "./firebase";
import { friendlyAuthError, loadSessionProfile, requestPasswordReset, type SessionProfile } from "./services";
import { StaffPortal } from "./StaffPortal";
import { StudentOnboarding } from "./StudentOnboarding";
import { StudentPortal } from "./StudentPortal";

type Audience = "STUDENT" | "PROFESSOR" | "ADMIN";
type LoginMode = "LOGIN" | "RECOVER";

function Brand() {
  return <div className="brand-extremo"><span className="brand-x">X</span><div><strong>TREMO NORTE</strong><small>LIBERDADE</small></div></div>;
}

function Login({ onRegister }: { onRegister: () => void }) {
  const [audience, setAudience] = useState<Audience>("STUDENT");
  const [mode, setMode] = useState<LoginMode>("LOGIN");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return setMessage("O serviço de autenticação ainda não foi configurado.");
    const data = new FormData(event.currentTarget);
    setBusy(true); setMessage("");
    try { await signInWithEmailAndPassword(auth, String(data.get("email")), String(data.get("password"))); }
    catch (error) { setMessage(friendlyAuthError(error)); }
    finally { setBusy(false); }
  }

  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setMessage("");
    try { await requestPasswordReset(String(data.get("email"))); setMessage("Enviamos um link de recuperação em português. Confira sua caixa de entrada e a pasta de spam."); }
    catch (error) { setMessage(friendlyAuthError(error)); }
    finally { setBusy(false); }
  }

  function selectAudience(next: Audience) {
    setAudience(next); setMode("LOGIN"); setMessage("");
    window.history.replaceState({}, "", next === "STUDENT" ? "/?portal=aluno" : "/");
  }

  const label = audience === "STUDENT" ? "ALUNO" : audience === "PROFESSOR" ? "PROFESSOR" : "ADMINISTRADOR";
  return (
    <main className="auth-page">
      <section className="auth-brand-panel"><Brand /><div className="auth-copy"><span className="eyebrow light">EXTREMO NORTE - LIBERDADE</span><h1>Treino, evolução e liberdade.</h1><p>Faça seu cadastro, acompanhe sua frequência e mantenha seus dados atualizados em um ambiente seguro.</p></div><small>© 2026 - Developed by FGZLabs</small></section>
      <section className="auth-form-panel">
        <div className="auth-switch" role="tablist"><button className={audience === "STUDENT" ? "active" : ""} onClick={() => selectAudience("STUDENT")}>Aluno</button><button className={audience === "PROFESSOR" ? "active" : ""} onClick={() => selectAudience("PROFESSOR")}>Professor</button></div>
        {mode === "LOGIN" ? <form className="auth-form" onSubmit={login}><div><span className="eyebrow">ACESSO DO {label}</span><h2>Entrar</h2><p>Use seu e-mail e senha cadastrados.</p></div><label className="field required"><span>E-mail</span><input name="email" type="email" autoComplete="email" required /></label><label className="field required"><span>Senha</span><input name="password" type="password" autoComplete="current-password" required /></label>{message && <div className="form-message" role="status">{message}</div>}<button className="primary auth-submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button><button type="button" className="text-button" onClick={() => { setMode("RECOVER"); setMessage(""); }}>Esqueci minha senha</button>{audience === "STUDENT" && <button type="button" className="secondary auth-secondary" onClick={onRegister}>Fazer meu cadastro inicial</button>}</form>
        : <form className="auth-form" onSubmit={recover}><div><span className="eyebrow">RECUPERAÇÃO DE SENHA</span><h2>Recuperar acesso</h2><p>Você receberá um link seguro em português para criar uma nova senha.</p></div><label className="field required"><span>E-mail cadastrado</span><input name="email" type="email" autoComplete="email" required /></label>{message && <div className="form-message" role="status">{message}</div>}<button className="primary auth-submit" disabled={busy}>{busy ? "Enviando…" : "Enviar link de recuperação"}</button><button type="button" className="text-button" onClick={() => { setMode("LOGIN"); setMessage(""); }}>Voltar para o login</button></form>}
        <button className="admin-access-link" onClick={() => selectAudience("ADMIN")}>Acesso administrativo</button>
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<SessionProfile | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [sessionError, setSessionError] = useState("");
  const [onboarding, setOnboarding] = useState(false);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser); setSession(null); setSessionError("");
      if (!nextUser) { setAuthReady(true); return; }
      void loadSessionProfile(nextUser).then(setSession).catch((error) => setSessionError(friendlyAuthError(error))).finally(() => setAuthReady(true));
    });
  }, []);

  async function exitOnboarding() {
    if (auth?.currentUser) await signOut(auth).catch(() => undefined);
    setOnboarding(false);
  }

  if (onboarding) return <StudentOnboarding onBack={() => void exitOnboarding()} />;
  if (!authReady || (user && !session && !sessionError)) return <div className="loading">Carregando ambiente seguro…</div>;
  if (!firebaseConfigured || !user) return <Login onRegister={() => setOnboarding(true)} />;
  if (sessionError) return <div className="empty-state card"><h2>Não foi possível carregar a conta</h2><p>{sessionError}</p><button className="secondary" onClick={() => auth && void signOut(auth)}>Sair</button></div>;
  if (!session) return null;
  if (session.kind === "ADMIN" || session.kind === "PROFESSOR") return <StaffPortal user={user} session={session} />;
  return <StudentPortal user={user} session={session} />;
}
