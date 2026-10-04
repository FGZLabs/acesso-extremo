import { useEffect, useState, type FormEvent } from "react";
import {
  removeAcademyDay,
  saveAcademyDay,
  watchAcademyDays,
  type AcademyDayKind,
  type AcademyDayRow,
} from "./services";

const kindLabels: Record<AcademyDayKind, string> = {
  HOLIDAY: "Feriado / academia fechada",
  CANCELED: "Treino cancelado",
  EXTRA: "Treino extraordinário",
};

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function AcademyCalendarPanel() {
  const [days, setDays] = useState<AcademyDayRow[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => watchAcademyDays(setDays, setMessage), []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await saveAcademyDay({
        date: String(data.get("date") || ""),
        kind: String(data.get("kind") || "CANCELED") as AcademyDayKind,
        title: String(data.get("title") || ""),
        details: String(data.get("details") || ""),
      });
      setMessage("Calendário atualizado.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  }

  async function remove(item: AcademyDayRow) {
    if (!window.confirm(`Remover ${item.title} do calendário?`)) return;
    try {
      await removeAcademyDay(item.date);
      setMessage("Evento removido.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível remover.");
    }
  }

  return (
    <section className="calendar-layout">
      <form className="card calendar-form" onSubmit={save}>
        <span className="eyebrow">EXCEÇÃO DO CALENDÁRIO</span>
        <h2>Feriados e mudanças de treino</h2>
        <p>Cadastre somente dias diferentes da rotina normal.</p>
        {message && <div className="form-message" role="status">{message}</div>}
        <label className="field required"><span>Data</span><input name="date" type="date" defaultValue={todayLocal()} required /></label>
        <label className="field required"><span>Tipo</span><select name="kind" defaultValue="CANCELED"><option value="HOLIDAY">Feriado / academia fechada</option><option value="CANCELED">Treino cancelado</option><option value="EXTRA">Treino extraordinário</option></select></label>
        <label className="field required"><span>Nome</span><input className="uppercase-input" name="title" placeholder="EX.: FERIADO MUNICIPAL" required /></label>
        <label className="field"><span>Observação</span><textarea className="uppercase-input" name="details" rows={3} placeholder="INFORMAÇÃO OPCIONAL" /></label>
        <button className="primary action">Salvar no calendário</button>
      </form>

      <section className="card calendar-list">
        <span className="eyebrow">DATAS CADASTRADAS</span>
        <h2>Exceções da rotina</h2>
        <p className="calendar-rule">Feriado e treino cancelado não geram falta. Treino extraordinário pode registrar presença, mas a ausência nele não conta como falta.</p>
        <div className="request-list">
          {days.map((item) => <article key={item.id}><div><strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR")} · {item.title}</strong><span>{kindLabels[item.kind]}</span>{item.details && <p>{item.details}</p>}</div><button className="secondary danger-text" type="button" onClick={() => void remove(item)}>Remover</button></article>)}
          {!days.length && <div className="empty-state"><strong>Nenhuma exceção cadastrada</strong><p>A rotina semanal será usada normalmente.</p></div>}
        </div>
      </section>
    </section>
  );
}
