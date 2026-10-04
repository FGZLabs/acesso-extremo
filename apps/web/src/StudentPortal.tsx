import { formatPhone } from "@academia/domain";
import { signOut, type User } from "firebase/auth";
import { useEffect, useState, type FormEvent } from "react";
import { AccountPanel } from "./AccountPanel";
import { AcademyCalendarPanel } from "./AcademyCalendarPanel";
import { AttendancePanel } from "./AttendancePanel";
import { auth } from "./firebase";
import {
  friendlyAuthError,
  loadStudentPortal,
  requestBeltChange,
  updateOwnProfile,
  watchProfessors,
  watchStudentMessages,
  type ProfessorOption,
  type SessionProfile,
  type StudentMessage,
  type StudentPortalData,
} from "./services";

const belts = ["Branca", "Cinza", "Amarela", "Laranja", "Verde", "Azul", "Roxa", "Marrom", "Preta"];

function displayDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "Não informado";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function StudentPortal({ user, session }: { user: User; session: SessionProfile }) {
  const [active, setActive] = useState<"home" | "profile" | "attendance" | "calendar" | "payments" | "messages" | "account">("home");
  const [data, setData] = useState<StudentPortalData | null>(null);
  const [messages, setMessages] = useState<StudentMessage[]>([]);
  const [professors, setProfessors] = useState<ProfessorOption[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!session.personId) return;
    try { setData(await loadStudentPortal(session.personId)); }
    catch (error) { setMessage(friendlyAuthError(error)); }
  }

  useEffect(() => { void refresh(); }, [session.personId]);
  useEffect(() => session.personId ? watchStudentMessages(session.personId, setMessages, setMessage) : undefined, [session.personId]);
  useEffect(() => watchProfessors(setProfessors, setMessage), []);

  if (!session.personId) return <div className="empty-state card"><h2>Conta sem cadastro vinculado</h2><p>Entre em contato com o administrador.</p></div>;
  const person = data?.person;
  const profile = data?.profile;
  const enrollment = data?.enrollment;
  const professorName = professors.find((item) => item.professorId === profile?.professorPersonId)?.displayName || "NÃO DEFINIDO";

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await updateOwnProfile(session.personId!, {
        fullName: String(form.get("fullName") || ""), phone: String(form.get("phone") || ""),
        whatsapp: String(form.get("whatsapp") || ""), address: String(form.get("address") || ""),
      });
      setMessage("Dados pessoais atualizados.");
      await refresh();
    } catch (error) { setMessage(friendlyAuthError(error)); }
    finally { setBusy(false); }
  }

  async function requestBelt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const dataForm = new FormData(form);
    setBusy(true);
    try {
      await requestBeltChange(session.personId!, String(profile?.currentBelt || ""), String(dataForm.get("requestedBelt")), String(dataForm.get("reason")));
      form.reset();
      setMessage("Solicitação enviada ao professor responsável.");
    } catch (error) { setMessage(friendlyAuthError(error)); }
    finally { setBusy(false); }
  }

  return (
    <div className="student-shell">
      <header className="student-header"><div className="brand-extremo"><span className="brand-x">X</span><div><strong>TREMO NORTE</strong><small>LIBERDADE • PORTAL DO ALUNO</small></div></div><nav className="student-nav" aria-label="Navegação do aluno"><button className={active === "home" ? "active" : ""} onClick={() => setActive("home")}>Início</button><button className={active === "profile" ? "active" : ""} onClick={() => setActive("profile")}>Meu cadastro</button><button className={active === "attendance" ? "active" : ""} onClick={() => setActive("attendance")}>Frequência</button><button className={active === "calendar" ? "active" : ""} onClick={() => setActive("calendar")}>Calendário</button><button className={active === "payments" ? "active" : ""} onClick={() => setActive("payments")}>Financeiro</button><button className={active === "messages" ? "active" : ""} onClick={() => setActive("messages")}>Mensagens {messages.length > 0 && `(${messages.length})`}</button><button className={active === "account" ? "active" : ""} onClick={() => setActive("account")}>Conta</button></nav><button className="secondary student-logout" onClick={() => auth && void signOut(auth)}>Sair</button></header>
      <main className="student-main">
        {message && <div className="form-message" role="status">{message}</div>}
        {!data && !message && <div className="loading-inline">Carregando seu portal…</div>}
        {active === "home" && data && <div className="page-stack"><section className="student-hero card"><div className="avatar-placeholder">{String(person?.fullName || session.displayName).slice(0, 1)}</div><div><span className="eyebrow">BEM-VINDO</span><h1>{String(person?.fullName || session.displayName)}</h1><p>{String(profile?.currentBelt || "FAIXA NÃO INFORMADA")} • Professor: {professorName}</p></div><span className={`status-pill ${enrollment?.status === "ATIVA" ? "online" : "setup"}`}>{String(enrollment?.status || "PENDENTE")}</span></section><section className="portal-grid"><article className="metric-card"><span>Mensalidade</span><strong>{enrollment?.validUntil && String(enrollment.validUntil) >= new Date().toISOString().slice(0, 10) ? "EM DIA" : "ATRASADA"}</strong><small>Validade: {displayDate(enrollment?.validUntil)}</small></article><article className="metric-card"><span>Faixa atual</span><strong>{String(profile?.currentBelt || "—")}</strong><small>Alterações exigem aprovação</small></article><article className="metric-card"><span>Facial Topdata</span><strong>{String(profile?.facialStatus || "PENDENTE")}</strong><small>Cadastro presencial no equipamento</small></article><article className="metric-card"><span>Mensagens</span><strong>{messages.length}</strong><small>Comunicados da equipe</small></article></section></div>}
        {active === "profile" && data && <div className="profile-layout"><form className="card settings-card" onSubmit={saveProfile}><span className="eyebrow">DADOS PESSOAIS</span><h2>Editar meu cadastro</h2><div className="form-grid"><label className="field wide required"><span>Nome completo</span><input className="uppercase-input" name="fullName" defaultValue={String(person?.fullName || "")} required /></label><label className="field"><span>CPF</span><input value={String(person?.cpfFormatted || "")} disabled /></label><label className="field"><span>E-mail</span><input value={user.email || ""} disabled /></label><label className="field required"><span>Telefone</span><input name="phone" defaultValue={String(person?.phone || "")} onChange={(event) => { event.currentTarget.value = formatPhone(event.currentTarget.value); }} required /></label><label className="field required"><span>WhatsApp</span><input name="whatsapp" defaultValue={String(person?.whatsapp || "")} onChange={(event) => { event.currentTarget.value = formatPhone(event.currentTarget.value); }} required /></label><label className="field wide required"><span>Endereço</span><input className="uppercase-input" name="address" defaultValue={String(person?.address || "")} required /></label></div><button className="primary action" disabled={busy}>Salvar dados pessoais</button></form><form className="card settings-card" onSubmit={requestBelt}><span className="eyebrow">GRADUAÇÃO</span><h2>Solicitar alteração de faixa</h2><p>Sua faixa atual não pode ser alterada diretamente. O professor responsável deverá analisar e aprovar.</p><label className="field required"><span>Faixa solicitada</span><select name="requestedBelt" defaultValue="" required><option value="" disabled>Selecione</option>{belts.filter((belt) => belt !== profile?.currentBelt).map((belt) => <option key={belt}>{belt}</option>)}</select></label><label className="field required"><span>Motivo</span><textarea className="uppercase-input" name="reason" rows={4} required /></label><button className="secondary action" disabled={busy}>Enviar solicitação</button></form></div>}
        {active === "attendance" && data && <AttendancePanel personId={session.personId} birthDate={String(person?.birthDate)} studentName={String(person?.fullName)} canJustify />}
        {active === "calendar" && data && <AcademyCalendarPanel birthDate={String(person?.birthDate)} />}
        {active === "payments" && <section className="card module-page"><h2>Financeiro</h2><div className="empty-state"><strong>Nenhuma cobrança PIX disponível</strong><p>Mensalidades, comprovantes e histórico serão exibidos aqui após a integração financeira.</p></div></section>}
        {active === "messages" && <section className="card module-page"><h2>Mensagens</h2><div className="message-list">{messages.map((item) => <article key={item.id}><p>{item.text}</p><small>{item.sentAt?.toDate?.().toLocaleString("pt-BR") || "AGORA"}</small></article>)}{!messages.length && <div className="empty-state"><strong>Nenhuma mensagem</strong><p>As mensagens do professor e do administrador aparecerão aqui.</p></div>}</div></section>}
        {active === "account" && <AccountPanel user={user} />}
      </main>
    </div>
  );
}
