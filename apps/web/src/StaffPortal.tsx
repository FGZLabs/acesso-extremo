import { signOut, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { AccountPanel } from "./AccountPanel";
import { AcademyCalendarPanel } from "./AcademyCalendarPanel";
import { AttendancePanel } from "./AttendancePanel";
import { auth } from "./firebase";
import { PeoplePanel } from "./PeoplePanel";
import { decideBeltRequest, watchBeltRequests, watchStudentDirectory, type SessionProfile, type StudentDirectoryRow } from "./services";

type StaffPage = "home" | "students" | "attendance" | "calendar" | "belts" | "account";

export function StaffPortal({ user, session }: { user: User; session: SessionProfile }) {
  const [page, setPage] = useState<StaffPage>("home");
  const [students, setStudents] = useState<StudentDirectoryRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [beltRequests, setBeltRequests] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState("");
  const role = session.kind === "ADMIN" ? "ADMIN" : "PROFESSOR";
  const selected = students.find((student) => student.personId === selectedId);

  useEffect(() => {
    const stopStudents = watchStudentDirectory(setStudents, setMessage);
    const stopBelts = watchBeltRequests((items) => setBeltRequests(items), setMessage);
    return () => { stopStudents(); stopBelts(); };
  }, []);

  const nav: Array<[StaffPage, string]> = [["home", "Visão geral"], ["students", "Alunos"], ["attendance", "Frequência"], ["calendar", "Calendário"], ["belts", "Faixas"], ["account", "Minha conta"]];

  async function decide(request: Record<string, unknown>, approved: boolean) {
    try {
      await decideBeltRequest(String(request.id), String(request.personId), String(request.requestedBelt), approved);
      setMessage(approved ? "Alteração de faixa aprovada." : "Solicitação rejeitada.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível concluir."); }
  }

  return (
    <div className="app-shell-v2">
      <aside className="sidebar-v2"><div className="brand-extremo sidebar-brand"><span className="brand-x">X</span><div><strong>TREMO NORTE</strong><small>LIBERDADE</small></div></div><div className="role-badge">{role === "ADMIN" ? "ADMINISTRADOR" : "PROFESSOR"}</div><nav>{nav.map(([key, label]) => <button key={key} className={page === key ? "active" : ""} onClick={() => setPage(key)}>{label}</button>)}</nav><div className="sidebar-note"><strong>{session.displayName}</strong><span>{user.email}</span></div></aside>
      <main className="main-v2"><header className="topbar-v2"><div><span className="eyebrow">AMBIENTE {role}</span><h1>{nav.find(([key]) => key === page)?.[1]}</h1></div><div className="top-actions-v2"><span className="status-pill online">Firebase conectado</span><button className="secondary" onClick={() => auth && void signOut(auth)}>Sair</button></div></header><div className="mobile-admin-nav">{nav.map(([key, label]) => <button key={key} className={page === key ? "active" : ""} onClick={() => setPage(key)}>{label}</button>)}</div><section className="content-v2">
        {message && <div className="form-message" role="status">{message}</div>}
        {page === "home" && <section className="page-stack"><div className="page-heading"><div><span className="eyebrow">VISÃO GERAL</span><h2>{role === "ADMIN" ? "Administração do sistema" : "Área do professor"}</h2><p>Acompanhamento dos alunos da Extremo Norte - Liberdade.</p></div></div><div className="dashboard-grid"><button className="dashboard-card" onClick={() => setPage("students")}><span>Alunos cadastrados</span><strong>{students.length}</strong><small>Abrir cadastros →</small></button><button className="dashboard-card" onClick={() => setPage("attendance")}><span>Frequência</span><strong>Hoje</strong><small>Acompanhar faltas →</small></button><button className="dashboard-card" onClick={() => setPage("belts")}><span>Faixas pendentes</span><strong>{beltRequests.length}</strong><small>Analisar solicitações →</small></button><button className="dashboard-card" onClick={() => setPage("students")}><span>Mensalidades</span><strong>{students.filter((student) => !student.validUntil || student.validUntil < new Date().toISOString().slice(0, 10)).length}</strong><small>Alunos em atraso →</small></button></div><div className="card portal-link-card"><div><h3>Link para cadastro do aluno</h3><p>Compartilhe este endereço no grupo para que o aluno faça o cadastro, aceite o termo e conclua o primeiro acesso.</p></div><code>{window.location.origin}/?portal=aluno</code></div></section>}
        {page === "students" && <PeoplePanel role={role} />}
        {page === "attendance" && <section className="page-stack"><div className="page-heading"><div><span className="eyebrow">FREQUÊNCIA</span><h2>Acompanhamento individual</h2></div><label className="field student-picker"><span>Selecione o aluno</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Selecione</option>{students.map((student) => <option key={student.personId} value={student.personId}>{student.fullName}</option>)}</select></label></div>{selected ? <AttendancePanel personId={selected.personId} birthDate={selected.birthDate} studentName={selected.fullName} canJustify={false} canEditAttendance /> : <div className="card empty-state"><strong>Selecione um aluno</strong><p>Faltas com justificativa mostram um ícone de texto. A justificativa não abona a falta.</p></div>}</section>}
        {page === "calendar" && <AcademyCalendarPanel canManage />}
        {page === "belts" && <section className="card module-page"><span className="eyebrow">APROVAÇÃO DO PROFESSOR</span><h2>Solicitações de faixa</h2><div className="request-list">{beltRequests.map((request) => { const student = students.find((item) => item.personId === request.personId); return <article key={String(request.id)}><div><strong>{student?.fullName || String(request.personId)}</strong><span>{String(request.currentBelt)} → {String(request.requestedBelt)}</span><p>{String(request.reason || "SEM JUSTIFICATIVA")}</p></div><div className="button-row"><button className="secondary" onClick={() => void decide(request, false)}>Rejeitar</button><button className="primary page-action" onClick={() => void decide(request, true)}>Aprovar</button></div></article>; })}{!beltRequests.length && <div className="empty-state"><strong>Nenhuma solicitação pendente</strong></div>}</div></section>}
        {page === "account" && <AccountPanel user={user} />}
      </section></main>
    </div>
  );
}
