import { classifyAttendanceDay } from "@academia/domain";
import { useEffect, useMemo, useState, type FormEvent } from "react";
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
const weekdayLabels = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function AcademyCalendarPanel({ canManage = false, birthDate }: { canManage?: boolean; birthDate?: string }) {
  const current = new Date();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(current.getFullYear(), current.getMonth(), 1));
  const [days, setDays] = useState<AcademyDayRow[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => watchAcademyDays(setDays, setMessage), []);

  const eventByDate = useMemo(() => new Map(days.map((item) => [item.date, item])), [days]);
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const calendarCells = Array.from({ length: firstWeekday + totalDays }, (_, index) => index < firstWeekday ? null : index - firstWeekday + 1);
  const monthEvents = days.filter((item) => item.date.startsWith(monthPrefix));

  function moveMonth(offset: number) {
    setVisibleMonth((value) => new Date(value.getFullYear(), value.getMonth() + offset, 1));
  }

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
    <section className="page-stack">
      <section className="card monthly-calendar-card">
        <div className="calendar-heading"><div><span className="eyebrow">CALENDÁRIO MENSAL</span><h2>{visibleMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2></div><div className="calendar-navigation"><button className="secondary compact" type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior">←</button><button className="secondary compact" type="button" onClick={() => setVisibleMonth(new Date(current.getFullYear(), current.getMonth(), 1))}>Hoje</button><button className="secondary compact" type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês">→</button></div></div>
        {message && <div className="form-message" role="status">{message}</div>}
        <div className="monthly-calendar-weekdays">{weekdayLabels.map((label) => <span key={label}>{label}</span>)}</div>
        <div className="monthly-calendar-grid">
          {calendarCells.map((day, index) => {
            if (!day) return <div className="monthly-calendar-empty" key={`empty-${index}`} />;
            const date = isoDate(year, month, day);
            const academyDay = eventByDate.get(date);
            const weekday = new Date(`${date}T12:00:00`).getDay();
            const classification = birthDate ? classifyAttendanceDay({ birthDate, date, academyClosed: academyDay?.closed, holiday: academyDay?.holiday, optionalEvent: academyDay?.optionalEvent }) : null;
            const routineLabel = birthDate ? (classification === "SCHEDULED" ? "TREINO" : null) : (weekday >= 1 && weekday <= 5 ? "ROTINA NORMAL" : null);
            const eventLabel = academyDay?.kind === "HOLIDAY" ? "FERIADO" : academyDay?.kind === "CANCELED" ? "CANCELADO" : academyDay?.kind === "EXTRA" ? "TREINO EXTRA" : null;
            const dayClass = academyDay ? `calendar-${academyDay.kind.toLowerCase()}` : routineLabel ? "calendar-routine" : "calendar-off";
            return <article className={`monthly-calendar-day ${dayClass} ${date === todayLocal() ? "calendar-today" : ""}`} key={date}><strong>{day}</strong><span>{eventLabel || routineLabel || "—"}</span>{academyDay && <small title={academyDay.details || academyDay.title}>{academyDay.title}</small>}</article>;
          })}
        </div>
        <div className="calendar-legend"><span><i className="calendar-mark routine" /> Treino normal</span><span><i className="calendar-mark canceled" /> Cancelado/feriado</span><span><i className="calendar-mark extra" /> Treino extraordinário</span></div>
      </section>

      {canManage && <section className="calendar-layout">
        <form className="card calendar-form" onSubmit={save}>
          <span className="eyebrow">EXCEÇÃO DO CALENDÁRIO</span>
          <h2>Feriados e mudanças de treino</h2>
          <p>Cadastre somente dias diferentes da rotina normal.</p>
          <label className="field required"><span>Data</span><input name="date" type="date" defaultValue={todayLocal()} required /></label>
          <label className="field required"><span>Tipo</span><select name="kind" defaultValue="CANCELED"><option value="HOLIDAY">Feriado / academia fechada</option><option value="CANCELED">Treino cancelado</option><option value="EXTRA">Treino extraordinário</option></select></label>
          <label className="field required"><span>Nome</span><input className="uppercase-input" name="title" placeholder="EX.: FERIADO MUNICIPAL" required /></label>
          <label className="field"><span>Observação</span><textarea className="uppercase-input" name="details" rows={3} placeholder="INFORMAÇÃO OPCIONAL" /></label>
          <button className="primary action">Salvar no calendário</button>
        </form>

        <section className="card calendar-list">
          <span className="eyebrow">DATAS DO MÊS</span>
          <h2>Exceções cadastradas</h2>
          <p className="calendar-rule">Feriado e treino cancelado não geram falta. Treino extraordinário pode registrar presença, mas a ausência nele não conta como falta.</p>
          <div className="request-list">
            {monthEvents.map((item) => <article key={item.id}><div><strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR")} · {item.title}</strong><span>{kindLabels[item.kind]}</span>{item.details && <p>{item.details}</p>}</div><button className="secondary danger-text" type="button" onClick={() => void remove(item)}>Remover</button></article>)}
            {!monthEvents.length && <div className="empty-state"><strong>Nenhuma exceção neste mês</strong><p>A rotina semanal será usada normalmente.</p></div>}
          </div>
        </section>
      </section>}
    </section>
  );
}
