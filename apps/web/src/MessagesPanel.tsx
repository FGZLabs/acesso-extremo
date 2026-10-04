import { useState, type FormEvent } from "react";
import { sendBulkInAppMessage, type StudentDirectoryRow } from "./services";

export function MessagesPanel({ students }: { students: StudentDirectoryRow[] }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const target = String(data.get("target") || "ALL");
    const personIds = target === "ALL" ? students.map((student) => student.personId) : [target];
    setBusy(true);
    try {
      await sendBulkInAppMessage(personIds, String(data.get("title") || "COMUNICADO"), String(data.get("text") || ""));
      setMessage(target === "ALL" ? `Mensagem enviada para ${personIds.length} aluno(s).` : "Mensagem enviada ao aluno.");
      form.reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível enviar."); }
    finally { setBusy(false); }
  }

  return <section className="card module-page message-composer"><span className="eyebrow">COMUNICAÇÃO INTERNA</span><h2>Enviar mensagem pelo PWA</h2><p className="module-intro">O comunicado aparecerá na caixa de entrada do aluno e ficará marcado como novo até ele abrir.</p>{message && <div className="form-message" role="status">{message}</div>}<form onSubmit={submit}><label className="field required"><span>Destinatário</span><select name="target" defaultValue="ALL"><option value="ALL">Todos os alunos ({students.length})</option>{students.map((student) => <option key={student.personId} value={student.personId}>{student.fullName}</option>)}</select></label><label className="field required"><span>Título</span><input className="uppercase-input" name="title" defaultValue="COMUNICADO" required /></label><label className="field required"><span>Mensagem</span><textarea className="uppercase-input" name="text" rows={6} placeholder="ESCREVA O COMUNICADO" required /></label><button className="primary action" disabled={busy || !students.length}>{busy ? "Enviando…" : "Enviar pelo sistema"}</button></form></section>;
}
