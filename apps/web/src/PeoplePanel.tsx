import { ageOn, formatPhone } from "@academia/domain";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PersonForm } from "./PersonForm";
import {
  createExternalReceipt,
  createStudentNote,
  sendInAppMessage,
  setStudentAccess,
  softDeleteStudent,
  staffUpdateStudent,
  watchProfessors,
  watchStudentDirectory,
  type ProfessorOption,
  type StudentDirectoryRow,
} from "./services";

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

function ageOf(birthDate: string): string {
  try { return `${ageOn(birthDate, todayLocal())} anos`; } catch { return "—"; }
}

function isAdultStudent(birthDate: string): boolean {
  try { return ageOn(birthDate, todayLocal()) >= 18; } catch { return false; }
}

function displayDate(value?: string): string {
  if (!value) return "Nenhum lançamento";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function displayMoney(value?: number): string {
  return typeof value === "number" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value) : "";
}

function whatsappHref(value?: string): string | undefined {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 10) return undefined;
  return `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}`;
}

function monthlyStatus(student: StudentDirectoryRow): "EM DIA" | "ATRASADA" {
  return student.validUntil && student.validUntil >= todayLocal() ? "EM DIA" : "ATRASADA";
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function PeoplePanel({ role = "ADMIN" }: { role?: "ADMIN" | "PROFESSOR" }) {
  const [students, setStudents] = useState<StudentDirectoryRow[]>([]);
  const [professors, setProfessors] = useState<ProfessorOption[]>([]);
  const [queryText, setQueryText] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<StudentDirectoryRow | null>(null);
  const [guardian, setGuardian] = useState<StudentDirectoryRow["guardian"] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stopStudents = watchStudentDirectory(setStudents, setMessage);
    const stopProfessors = watchProfessors(setProfessors, setMessage);
    return () => { stopStudents(); stopProfessors(); };
  }, []);

  const filtered = useMemo(() => {
    const term = queryText.trim().toLocaleLowerCase("pt-BR");
    if (!term) return students;
    return students.filter((student) => `${student.fullName} ${student.cpfFormatted || ""} ${student.professorName}`.toLocaleLowerCase("pt-BR").includes(term));
  }, [students, queryText]);

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await staffUpdateStudent(selected.personId, {
        fullName: String(data.get("fullName") || ""),
        phone: String(data.get("phone") || ""),
        whatsapp: String(data.get("whatsapp") || ""),
        address: String(data.get("address") || ""),
        professorPersonId: String(data.get("professorId") || ""),
      });
      setMessage("Cadastro atualizado com sucesso.");
      setSelected(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível atualizar."); }
    finally { setBusy(false); }
  }

  async function submitAction(event: FormEvent<HTMLFormElement>, action: "PAYMENT" | "MESSAGE" | "NOTE") {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      let paymentValidity = "";
      if (action === "PAYMENT") {
        const amount = Number(data.get("amount"));
        const result = await createExternalReceipt(selected.personId, amount, String(data.get("method")), String(data.get("text")));
        paymentValidity = result.validUntil;
        setSelected({ ...selected, enrollmentStatus: "ATIVA", validUntil: result.validUntil, lastPaymentDate: todayLocal(), lastPaymentAmount: amount });
      }
      if (action === "MESSAGE") await sendInAppMessage(selected.personId, String(data.get("text")));
      if (action === "NOTE") await createStudentNote(selected.personId, String(data.get("text")));
      form.reset();
      setMessage(action === "PAYMENT" ? `Pagamento confirmado. Mensalidade em dia até ${paymentValidity.split("-").reverse().join("/")}.` : action === "MESSAGE" ? "Mensagem enviada ao portal do aluno." : "Anotação registrada.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível concluir."); }
    finally { setBusy(false); }
  }

  async function toggleBlocked() {
    if (!selected) return;
    setBusy(true);
    try { await setStudentAccess(selected.personId, selected.status !== "BLOQUEADA"); setSelected(null); }
    finally { setBusy(false); }
  }

  async function removeStudent() {
    if (!selected || !window.confirm(`Excluir logicamente o cadastro de ${selected.fullName}? O histórico será preservado.`)) return;
    setBusy(true);
    try { await softDeleteStudent(selected.personId); setSelected(null); }
    finally { setBusy(false); }
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div><span className="eyebrow">ALUNOS</span><h2>Cadastros e acompanhamento</h2><p>{students.length} aluno(s) cadastrado(s)</p></div>
        <button className="primary page-action" onClick={() => setShowForm((value) => !value)}>{showForm ? "Fechar cadastro" : "+ Cadastrar aluno"}</button>
      </div>
      {showForm && <PersonForm enabled onCreated={() => setShowForm(false)} />}
      {message && <div className="form-message" role="status">{message}</div>}
      <div className="card table-card">
        <div className="table-toolbar"><label className="search-field"><span>Buscar aluno</span><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Nome, CPF ou professor" /></label><span className="table-count">{filtered.length} resultado(s)</span></div>
        <div className="responsive-table"><table className="student-table"><thead><tr><th>Aluno</th><th>Mensalidade</th><th>Professor responsável</th><th>Faixa</th><th>Idade</th><th>Responsável</th><th>Ações</th></tr></thead><tbody>
          {filtered.map((student) => {
            const payment = monthlyStatus(student);
            return <tr key={student.personId}>
              <td><button className="person-link" onClick={() => setSelected(student)}>{student.profilePhotoUrl ? <img className="mini-avatar photo" src={student.profilePhotoUrl} alt="" /> : <span className="mini-avatar">{initials(student.fullName)}</span>}<span><strong>{student.fullName}</strong><small>Ver dados pessoais</small></span></button></td>
              <td><span className={`status-pill ${payment === "EM DIA" ? "online" : "danger"}`}>{payment}</span></td>
              <td>{student.professorName}</td><td>{student.currentBelt}</td><td>{ageOf(student.birthDate)}</td>
              <td>{student.guardian ? <button className="guardian-button" onClick={() => setGuardian(student.guardian)}>ⓘ {student.guardian.fullName}</button> : "—"}</td>
              <td><button className="secondary compact" onClick={() => setSelected(student)}>Gerenciar</button></td>
            </tr>;
          })}
          {!filtered.length && <tr><td colSpan={7}><div className="empty-state"><strong>Nenhum aluno encontrado</strong><p>O próprio aluno pode se cadastrar pelo link público ou você pode usar “Cadastrar aluno”.</p></div></td></tr>}
        </tbody></table></div>
        <div className="student-card-list">{filtered.map((student) => { const payment = monthlyStatus(student); const adult = isAdultStudent(student.birthDate); const studentWhatsApp = whatsappHref(student.whatsapp); const guardianWhatsApp = whatsappHref(student.guardian?.phone); return <article className="student-mobile-card" key={student.personId}><div className="student-card-header">{student.profilePhotoUrl ? <img className="mini-avatar photo" src={student.profilePhotoUrl} alt="" /> : <span className="mini-avatar">{initials(student.fullName)}</span>}<div><strong>{student.fullName}</strong><small>{student.currentBelt} · {ageOf(student.birthDate)}</small>{studentWhatsApp && <a className="whatsapp-link" href={studentWhatsApp} target="_blank" rel="noreferrer" aria-label={`Abrir WhatsApp de ${student.fullName}`}>◉ WhatsApp</a>}</div><span className={`status-pill ${payment === "EM DIA" ? "online" : "danger"}`}>{payment}</span></div><dl><div><dt>Professor</dt><dd>{student.professorName}</dd></div>{adult ? <div><dt>Último pagamento</dt><dd>{displayDate(student.lastPaymentDate)} {displayMoney(student.lastPaymentAmount)}</dd></div> : <div><dt>Responsável</dt><dd>{student.guardian ? <><button className="guardian-button" onClick={() => setGuardian(student.guardian)}>ⓘ {student.guardian.fullName}</button>{guardianWhatsApp && <a className="whatsapp-icon-link" href={guardianWhatsApp} target="_blank" rel="noreferrer" aria-label={`Abrir WhatsApp de ${student.guardian.fullName}`}>◉</a>}</> : "—"}</dd></div>}</dl><button className="primary student-card-manage" onClick={() => setSelected(student)}>Gerenciar aluno</button></article>; })}{!filtered.length && <div className="empty-state"><strong>Nenhum aluno encontrado</strong></div>}</div>
      </div>

      {guardian && <div className="modal-backdrop"><section className="modal-card compact-modal"><div className="modal-header"><div><span className="eyebrow">RESPONSÁVEL</span><h2>{guardian.fullName}</h2></div><button className="modal-close" onClick={() => setGuardian(null)}>×</button></div><dl className="detail-list"><div><dt>Parentesco</dt><dd>{guardian.relationship}</dd></div><div><dt>CPF</dt><dd>{guardian.cpfFormatted || "Não informado"}</dd></div><div><dt>Telefone</dt><dd>{whatsappHref(guardian.phone) ? <a className="whatsapp-link" href={whatsappHref(guardian.phone)} target="_blank" rel="noreferrer">◉ {guardian.phone}</a> : guardian.phone || "Não informado"}</dd></div><div><dt>Endereço</dt><dd>{guardian.address || "Não informado"}</dd></div><div><dt>PIN de acesso</dt><dd>{guardian.accessPin || "Gerado apenas nos novos cadastros"}</dd></div></dl></section></div>}

      {selected && <div className="modal-backdrop"><section className="modal-card student-manage-modal"><div className="modal-header"><div><span className="eyebrow">{role === "ADMIN" ? "ADMINISTRAÇÃO" : "PROFESSOR"}</span><h2>{selected.fullName}</h2></div><button className="modal-close" onClick={() => setSelected(null)}>×</button></div><div className="manage-grid">
        <form className="manage-section" autoComplete="on" onSubmit={saveEdit}><h3>Dados do aluno</h3><div className="form-grid"><label className="field wide required"><span>Nome</span><input name="fullName" autoComplete="name" autoCapitalize="words" spellCheck defaultValue={selected.fullName} required /></label><label className="field"><span>CPF</span><input value={selected.cpfFormatted || ""} disabled /></label><label className="field"><span>E-mail</span><input value={selected.email || ""} disabled /></label><label className="field"><span>PIN de acesso</span><input value={selected.accessPin || "Gerado apenas nos novos cadastros"} disabled /></label><label className="field"><span>Telefone</span><input name="phone" type="tel" autoComplete="tel" defaultValue={selected.phone || ""} onChange={(event) => { event.currentTarget.value = formatPhone(event.currentTarget.value); }} /></label><label className="field"><span>WhatsApp</span><input name="whatsapp" type="tel" autoComplete="tel" defaultValue={selected.whatsapp || ""} onChange={(event) => { event.currentTarget.value = formatPhone(event.currentTarget.value); }} /></label><label className="field wide"><span>Endereço</span><input name="address" autoComplete="street-address" autoCapitalize="words" spellCheck defaultValue={selected.address || ""} /></label><label className="field wide"><span>Professor responsável</span><select name="professorId" defaultValue={selected.professorPersonId || ""}>{professors.map((professor) => <option key={professor.professorId} value={professor.professorId}>{professor.displayName}</option>)}</select></label></div><button className="primary action" disabled={busy}>Salvar alterações</button></form>
        <div className="manage-actions"><form className="manage-section" onSubmit={(event) => void submitAction(event, "PAYMENT")}><h3>Confirmar pagamento recebido</h3><p>O lançamento deixa a mensalidade em dia e acrescenta 30 dias à validade atual.</p><div className="form-grid"><label className="field required"><span>Valor</span><input name="amount" type="number" min="0.01" step="0.01" defaultValue="150.00" required /></label><label className="field required"><span>Forma</span><input className="uppercase-input" name="method" placeholder="DINHEIRO, PIX, TRANSFERÊNCIA..." required /></label><label className="field wide"><span>Observação</span><textarea className="uppercase-input" name="text" rows={2} /></label></div><button className="secondary action" disabled={busy}>Confirmar pagamento</button></form>
          <form className="manage-section" onSubmit={(event) => void submitAction(event, "MESSAGE")}><h3>Mensagem ao aluno</h3><textarea className="uppercase-input full-textarea" name="text" rows={3} required /><button className="secondary action" disabled={busy}>Enviar no portal</button></form>
          <form className="manage-section" onSubmit={(event) => void submitAction(event, "NOTE")}><h3>Anotação interna</h3><textarea className="uppercase-input full-textarea" name="text" rows={3} required /><button className="secondary action" disabled={busy}>Salvar anotação</button></form>
          <div className="danger-zone"><button className="secondary" disabled={busy} onClick={() => void toggleBlocked()}>{selected.status === "BLOQUEADA" ? "Desbloquear acesso" : "Bloquear acesso"}</button><button className="danger-button" disabled={busy} onClick={() => void removeStudent()}>Excluir cadastro</button></div>
        </div>
      </div></section></div>}
    </section>
  );
}
