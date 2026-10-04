import { applyActionCode, confirmPasswordReset, onAuthStateChanged, signInWithEmailAndPassword, signOut, verifyPasswordResetCode, type User } from "firebase/auth";
import { useEffect, useState, type FormEvent } from "react";
import { auth, firebaseConfigured } from "./firebase";
import { friendlyAuthError, loadSessionProfile, requestPasswordReset, sendAccountVerification, type SessionProfile } from "./services";
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
  const [message, setMessage] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("emailVerified") === "1") return "E-mail confirmado com sucesso. Faça login para acessar seu cadastro.";
    if (params.get("passwordReset") === "1") return "Senha alterada com sucesso. Faça login usando a nova senha.";
    return "";
  });
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

function EmailActionPage({ actionCode, actionMode }: { actionCode: string; actionMode: "verifyEmail" | "resetPassword" | "recoverEmail" }) {
  const [status, setStatus] = useState<"VERIFYING" | "READY" | "SUCCESS" | "ERROR">("VERIFYING");
  const [message, setMessage] = useState(actionMode === "resetPassword" ? "Validando o link de recuperação…" : "Confirmando a solicitação…");

  useEffect(() => {
    if (!auth) {
      setStatus("ERROR");
      setMessage("O serviço de autenticação não está disponível.");
      return;
    }
    const currentAuth = auth;
    let active = true;
    let timer = 0;
    const operation = actionMode === "resetPassword"
      ? verifyPasswordResetCode(currentAuth, actionCode).then((email) => {
        if (!active) return;
        setStatus("READY");
        setMessage(`Crie uma nova senha para ${email}.`);
      })
      : applyActionCode(currentAuth, actionCode).then(async () => {
      if (currentAuth.currentUser) await currentAuth.currentUser.reload().catch(() => undefined);
      if (!active) return;
      setStatus("SUCCESS");
      const verified = actionMode === "verifyEmail";
      setMessage(verified ? "E-mail confirmado. Você será direcionado para o login." : "Alteração de e-mail desfeita com sucesso.");
      const destination = verified ? "/?portal=aluno&emailVerified=1" : "/?portal=aluno";
      window.history.replaceState({}, "", destination);
      timer = window.setTimeout(() => window.location.replace(destination), 1800);
    });
    void operation.catch((error) => {
      if (!active) return;
      setStatus("ERROR");
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      setMessage(code === "auth/invalid-action-code" || code === "auth/expired-action-code"
        ? "Este link de confirmação é inválido, já foi usado ou expirou. Entre com seu e-mail e senha para solicitar outro."
        : friendlyAuthError(error));
    });
    return () => { active = false; window.clearTimeout(timer); };
  }, [actionCode, actionMode]);

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    if (password !== String(data.get("confirmation") || "")) return setMessage("As senhas não conferem.");
    setStatus("VERIFYING"); setMessage("Alterando sua senha…");
    try {
      await confirmPasswordReset(auth, actionCode, password);
      setStatus("SUCCESS"); setMessage("Senha alterada. Você será direcionado para o login.");
      window.setTimeout(() => window.location.replace("/?portal=aluno&passwordReset=1"), 1500);
    } catch (error) { setStatus("ERROR"); setMessage(friendlyAuthError(error)); }
  }

  const title = actionMode === "verifyEmail" ? "Confirmação de e-mail" : actionMode === "resetPassword" ? "Recuperação de senha" : "Proteção da conta";
  return <main className="auth-page verification-page"><section className="auth-brand-panel"><Brand /><div className="auth-copy"><span className="eyebrow light">ACESSO SEGURO</span><h1>{title}</h1><p>Protegendo seu acesso à Extremo Norte - Liberdade.</p></div><small>© 2026 - Developed by FGZLabs</small></section><section className="auth-form-panel"><div className="auth-form verification-card"><div className={`success-icon ${status === "ERROR" ? "error" : ""}`}>{status === "VERIFYING" ? "…" : status === "SUCCESS" ? "✓" : status === "READY" ? "↻" : "!"}</div><h2>{status === "VERIFYING" ? "Aguarde" : status === "READY" ? "Defina sua nova senha" : status === "SUCCESS" ? "Operação concluída" : "Não foi possível concluir"}</h2><p>{message}</p>{status === "READY" && actionMode === "resetPassword" && <form className="password-action-form" onSubmit={resetPassword}><label className="field required"><span>Nova senha</span><input name="password" type="password" minLength={8} autoComplete="new-password" required /></label><label className="field required"><span>Confirmar nova senha</span><input name="confirmation" type="password" minLength={8} autoComplete="new-password" required /></label><button className="primary auth-submit">Salvar nova senha</button></form>}{status === "ERROR" && <button className="primary auth-submit" onClick={() => window.location.replace("/?portal=aluno")}>Ir para o login</button>}</div></section></main>;
}

function VerificationRequired({ user }: { user: User }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function resend() {
    setBusy(true); setMessage("");
    try {
      await sendAccountVerification(user);
      setMessage("Novo link enviado. Verifique sua caixa de entrada e a pasta de spam.");
    } catch (error) { setMessage(friendlyAuthError(error)); }
    finally { setBusy(false); }
  }

  return <main className="auth-page verification-page"><section className="auth-brand-panel"><Brand /><div className="auth-copy"><span className="eyebrow light">ATIVAÇÃO PENDENTE</span><h1>Confirme seu e-mail.</h1><p>Seu cadastro está salvo, mas o acesso só será liberado após a confirmação.</p></div><small>© 2026 - Developed by FGZLabs</small></section><section className="auth-form-panel"><div className="auth-form verification-card"><div className="notice-icon">✉</div><h2>Verifique sua caixa de entrada</h2><p>Enviamos o link de ativação para <strong>{user.email}</strong>.</p>{message && <div className="form-message" role="status">{message}</div>}<button className="primary auth-submit" disabled={busy} onClick={() => void resend()}>{busy ? "Enviando…" : "Reenviar e-mail de ativação"}</button><button className="text-button" onClick={() => auth && void signOut(auth)}>Voltar para o login</button></div></section></main>;
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

  const actionParams = new URLSearchParams(window.location.search);
  const rawActionMode = actionParams.get("mode");
  const actionMode = rawActionMode === "verifyEmail" || rawActionMode === "resetPassword" || rawActionMode === "recoverEmail" ? rawActionMode : null;
  const actionCode = actionMode ? actionParams.get("oobCode") : null;
  if (actionCode && actionMode) return <EmailActionPage actionCode={actionCode} actionMode={actionMode} />;
  if (onboarding) return <StudentOnboarding onBack={() => void exitOnboarding()} />;
  if (!authReady || (user && !session && !sessionError)) return <div className="loading">Carregando ambiente seguro…</div>;
  if (!firebaseConfigured || !user) return <Login onRegister={() => setOnboarding(true)} />;
  if (sessionError) return <div className="empty-state card"><h2>Não foi possível carregar a conta</h2><p>{sessionError}</p><button className="secondary" onClick={() => auth && void signOut(auth)}>Sair</button></div>;
  if (!session) return null;
  if (session.kind === "UNVERIFIED") return <VerificationRequired user={user} />;
  if (session.kind === "ADMIN" || session.kind === "PROFESSOR") return <StaffPortal user={user} session={session} />;
  return <StudentPortal user={user} session={session} />;
}
