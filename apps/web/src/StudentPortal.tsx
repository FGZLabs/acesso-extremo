import { formatPhone } from "@academia/domain";
import { signOut, type User } from "firebase/auth";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { AccountPanel } from "./AccountPanel";
import { AcademyCalendarPanel } from "./AcademyCalendarPanel";
import { AttendancePanel } from "./AttendancePanel";
import { auth } from "./firebase";
import {
  friendlyAuthError,
  loadStudentPortal,
  markMessagesRead,
  requestBeltChange,
  updateOwnProfile,
  uploadProfilePhoto,
  watchProfessors,
  watchPaymentHistory,
  watchStudentMessages,
  type PaymentHistoryRow,
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

function displayMonth(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${value}-02T12:00:00`));
}

function displayMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function StudentPortal({ user, session }: { user: User; session: SessionProfile }) {
  const [active, setActive] = useState<"home" | "profile" | "attendance" | "payments" | "messages">("home");
  const [attendanceView, setAttendanceView] = useState<"calendar" | "frequency">("calendar");
  const [profileView, setProfileView] = useState<"profile" | "account">("profile");
  const [data, setData] = useState<StudentPortalData | null>(null);
  const [messages, setMessages] = useState<StudentMessage[]>([]);
  const [payments, setPayments] = useState<PaymentHistoryRow[]>([]);
  const [newMessagesNotice, setNewMessagesNotice] = useState(0);
  const [professors, setProfessors] = useState<ProfessorOption[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!session.personId) return;
    try { setData(await loadStudentPortal(session.personId)); }
    catch (error) { setMessage(friendlyAuthError(error)); }
  }

  useEffect(() => { void refresh(); }, [session.personId]);
  useEffect(() => {
    if (!session.personId) return undefined;
    const storageKey = `extremo-notified-messages-${session.personId}`;
    return watchStudentMessages(session.personId, (items) => {
      setMessages(items);
      const notified = new Set<string>(JSON.parse(localStorage.getItem(storageKey) || "[]"));
      const newUnread = items.filter((item) => item.status !== "LIDA" && !notified.has(item.id));
      if (newUnread.length) {
        setNewMessagesNotice(newUnread.length);
        newUnread.forEach((item) => notified.add(item.id));
        localStorage.setItem(storageKey, JSON.stringify([...notified].slice(-200)));
      }
    }, setMessage);
  }, [session.personId]);
  useEffect(() => session.personId ? watchPaymentHistory(session.personId, setPayments, setMessage) : undefined, [session.personId]);
  useEffect(() => watchProfessors(setProfessors, setMessage), []);

  const unreadMessages = messages.filter((item) => item.status !== "LIDA");

  useEffect(() => {
    if (active === "messages" && unreadMessages.length) void markMessagesRead(unreadMessages.map((item) => item.id));
  }, [active, messages]);

  if (!session.personId) return <div className="empty-state card"><h2>Conta sem cadastro vinculado</h2><p>Entre em contato com o administrador.</p></div>;
  const person = data?.person;
  const profile = data?.profile;
  const enrollment = data?.enrollment;
  const professorName = professors.find((item) => item.professorId === profile?.professorPersonId)?.displayName || "NÃO DEFINIDO";

  async function changePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { await uploadProfilePhoto(session.personId!, file); await refresh(); setMessage("Foto de perfil atualizada."); }
    catch (error) { setMessage(friendlyAuthError(error)); }
    finally { setBusy(false); event.target.value = ""; }
  }

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
      <header className="student-header"><div className="brand-extremo"><span className="brand-x">X</span><div><strong>TREMO NORTE</strong><small>LIBERDADE • PORTAL DO ALUNO</small></div></div><nav className="student-nav" aria-label="Navegação do aluno"><button className={active === "home" ? "active" : ""} onClick={() => setActive("home")}>Início</button><button className={active === "profile" ? "active" : ""} onClick={() => setActive("profile")}>Meu cadastro</button><button className={active === "attendance" ? "active" : ""} onClick={() => setActive("attendance")}>Calendário e frequência</button><button className={active === "payments" ? "active" : ""} onClick={() => setActive("payments")}>Financeiro</button><button className={active === "messages" ? "active" : ""} onClick={() => setActive("messages")}>Mensagens {unreadMessages.length > 0 && <b className="nav-count">{unreadMessages.length}</b>}</button></nav><button className="secondary student-logout" onClick={() => auth && void signOut(auth)}>Sair</button></header>
      <main className="student-main">
        {message && <div className="form-message" role="status">{message}</div>}
        {!data && !message && <div className="loading-inline">Carregando seu portal…</div>}
        {active === "home" && data && <div className="page-stack"><section className="student-hero card">{person?.profilePhotoUrl ? <img className="avatar-photo" src={String(person.profilePhotoUrl)} alt="Foto do aluno" /> : <div className="avatar-placeholder">{String(person?.fullName || session.displayName).slice(0, 1)}</div>}<div><span className="eyebrow">BEM-VINDO</span><h1>{String(person?.fullName || session.displayName)}</h1><p>{String(profile?.currentBelt || "FAIXA NÃO INFORMADA")} • Professor: {professorName}</p></div><span className={`status-pill ${enrollment?.status === "ATIVA" ? "online" : "setup"}`}>{String(enrollment?.status || "PENDENTE")}</span></section><section className="portal-grid"><article className="metric-card"><span>Mensalidade</span><strong>{enrollment?.validUntil && String(enrollment.validUntil) >= new Date().toISOString().slice(0, 10) ? "EM DIA" : "ATRASADA"}</strong><small>Validade: {displayDate(enrollment?.validUntil)}</small></article><article className="metric-card"><span>PIN do aluno</span><strong>{String(person?.accessPin || "—")}</strong><small>Use somente se a facial não reconhecer</small></article><article className="metric-card"><span>Faixa atual</span><strong>{String(profile?.currentBelt || "—")}</strong><small>Alterações exigem aprovação</small></article><article className="metric-card"><span>Facial Topdata</span><strong>{String(profile?.facialStatus || "PENDENTE")}</strong><small>Cadastro presencial no equipamento</small></article><button className="metric-card metric-button" onClick={() => setActive("messages")}><span>Mensagens não lidas</span><strong>{unreadMessages.length}</strong><small>Abrir caixa de entrada →</small></button></section></div>}
        {active === "profile" && data && <section className="page-stack"><div className="section-tabs" role="tablist"><button className={profileView === "profile" ? "active" : ""} onClick={() => setProfileView("profile")}>Meu cadastro</button><button className={profileView === "account" ? "active" : ""} onClick={() => setProfileView("account")}>Conta e senha</button></div>{profileView === "profile" ? <div className="profile-layout"><form className="card settings-card" onSubmit={saveProfile}><span className="eyebrow">DADOS PESSOAIS</span><h2>Editar meu cadastro</h2><label className="photo-editor">{person?.profilePhotoUrl ? <img className="avatar-photo large" src={String(person.profilePhotoUrl)} alt="Foto atual" /> : <div className="avatar-placeholder">{String(person?.fullName || "A").slice(0, 1)}</div>}<span>{busy ? "Enviando…" : "Tirar foto ou escolher da galeria"}</span><input type="file" accept="image/*" disabled={busy} onChange={(event) => void changePhoto(event)} /></label><div className="form-grid"><label className="field wide required"><span>Nome completo</span><input className="uppercase-input" name="fullName" defaultValue={String(person?.fullName || "")} required /></label><label className="field"><span>CPF</span><input value={String(person?.cpfFormatted || "")} disabled /></label><label className="field"><span>E-mail</span><input value={user.email || ""} disabled /></label><label className="field required"><span>Telefone</span><input name="phone" defaultValue={String(person?.phone || "")} onChange={(event) => { event.currentTarget.value = formatPhone(event.currentTarget.value); }} required /></label><label className="field required"><span>WhatsApp</span><input name="whatsapp" defaultValue={String(person?.whatsapp || "")} onChange={(event) => { event.currentTarget.value = formatPhone(event.currentTarget.value); }} required /></label><label className="field wide required"><span>Endereço</span><input className="uppercase-input" name="address" defaultValue={String(person?.address || "")} required /></label></div><button className="primary action" disabled={busy}>Salvar dados pessoais</button></form><form className="card settings-card" onSubmit={requestBelt}><span className="eyebrow">GRADUAÇÃO</span><h2>Solicitar alteração de faixa</h2><p>Sua faixa atual não pode ser alterada diretamente. O professor responsável deverá analisar e aprovar.</p><label className="field required"><span>Faixa solicitada</span><select name="requestedBelt" defaultValue="" required><option value="" disabled>Selecione</option>{belts.filter((belt) => belt !== profile?.currentBelt).map((belt) => <option key={belt}>{belt}</option>)}</select></label><label className="field required"><span>Motivo</span><textarea className="uppercase-input" name="reason" rows={4} required /></label><button className="secondary action" disabled={busy}>Enviar solicitação</button></form></div> : <AccountPanel user={user} />}</section>}
        {active === "attendance" && data && <section className="page-stack"><div className="section-tabs" role="tablist"><button className={attendanceView === "calendar" ? "active" : ""} onClick={() => setAttendanceView("calendar")}>Calendário</button><button className={attendanceView === "frequency" ? "active" : ""} onClick={() => setAttendanceView("frequency")}>Minha frequência</button></div>{attendanceView === "calendar" ? <AcademyCalendarPanel birthDate={String(person?.birthDate)} /> : <AttendancePanel personId={session.personId} birthDate={String(person?.birthDate)} studentName={String(person?.fullName)} canJustify />}</section>}
        {active === "payments" && <section className="card module-page"><span className="eyebrow">HISTÓRICO</span><h2>Financeiro</h2><p className="module-intro">Pagamentos lançados manualmente pela academia.</p><div className="payment-history">{payments.map((payment) => <article key={payment.id}><div><strong>{displayMoney(payment.amount)}</strong><small>{payment.method}</small></div><dl><div><dt>Pago em</dt><dd>{displayDate(payment.paymentDate)}</dd></div><div><dt>Mês vigente</dt><dd className="capitalize">{displayMonth(payment.referenceMonth)}</dd></div><div><dt>Próximo vencimento</dt><dd>{displayDate(payment.validUntil)}</dd></div></dl></article>)}{!payments.length && <div className="empty-state"><strong>Nenhum pagamento lançado</strong><p>Quando o professor ou administrador confirmar um pagamento, ele aparecerá aqui.</p></div>}</div></section>}
        {active === "messages" && <section className="card module-page"><span className="eyebrow">CAIXA DE ENTRADA</span><h2>Mensagens da academia</h2><p className="module-intro">Este é o canal oficial de comunicação da Extremo Norte - Liberdade.</p><div className="message-list">{messages.map((item) => <article className={item.status === "LIDA" ? "" : "unread"} key={item.id}><strong>{item.title || "COMUNICADO"}</strong><p>{item.text}</p><small>{item.sentAt?.toDate?.().toLocaleString("pt-BR") || "AGORA"} · {item.status === "LIDA" ? "LIDA" : "NOVA"}</small></article>)}{!messages.length && <div className="empty-state"><strong>Nenhuma mensagem</strong><p>Os comunicados do professor e do administrador aparecerão aqui.</p></div>}</div></section>}
      </main>
      {newMessagesNotice > 0 && <div className="modal-backdrop message-notice"><section className="modal-card compact-modal"><div className="notice-icon">✉</div><h2>{newMessagesNotice} {newMessagesNotice === 1 ? "nova mensagem" : "novas mensagens"}</h2><p>Você recebeu um novo comunicado da Extremo Norte - Liberdade.</p><div className="button-row"><button className="secondary" onClick={() => setNewMessagesNotice(0)}>Agora não</button><button className="primary page-action" onClick={() => { setNewMessagesNotice(0); setActive("messages"); }}>Ver mensagens</button></div></section></div>}
    </div>
  );
}
