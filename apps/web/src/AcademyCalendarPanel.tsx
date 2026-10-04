import { classifyAttendanceDay } from "@academia/domain";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { removeAcademyDay, saveAcademyDay, watchAcademyDays, type AcademyDayKind, type AcademyDayRow } from "./services";

const kindLabels: Record<AcademyDayKind, string> = { HOLIDAY: "Feriado / academia fechada", CANCELED: "Treino cancelado", EXTRA: "Treino extraordinário" };
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => watchAcademyDays(setDays, setMessage), []);

  const eventByDate = useMemo(() => new Map(days.map((item) => [item.date, item])), [days]);
  const selectedEvent = selectedDate ? eventByDate.get(selectedDate) : undefined;
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const calendarCells = Array.from({ length: firstWeekday + totalDays }, (_, index) => index < firstWeekday ? null : index - firstWeekday + 1);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDate) return;
    const data = new FormData(event.currentTarget);
    try {
      await saveAcademyDay({ date: selectedDate, kind: String(data.get("kind") || "CANCELED") as AcademyDayKind, title: String(data.get("title") || ""), details: String(data.get("details") || "") });
      setMessage("Calendário atualizado.");
      setSelectedDate(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar."); }
  }

  async function remove() {
    if (!selectedEvent || !window.confirm(`Remover ${selectedEvent.title} do calendário?`)) return;
    try { await removeAcademyDay(selectedEvent.date); setMessage("Exceção removida."); setSelectedDate(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível remover."); }
  }

  return (
    <section className="card monthly-calendar-card">
      <div className="calendar-heading"><div><span className="eyebrow">CALENDÁRIO MENSAL</span><h2>{visibleMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2><p>{canManage ? "Toque em um dia para cadastrar ou editar uma exceção." : "Toque nos dias destacados para ver os detalhes."}</p></div><div className="calendar-navigation"><button className="secondary compact" type="button" onClick={() => setVisibleMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))}>←</button><button className="secondary compact" type="button" onClick={() => setVisibleMonth(new Date(current.getFullYear(), current.getMonth(), 1))}>Hoje</button><button className="secondary compact" type="button" onClick={() => setVisibleMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))}>→</button></div></div>
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
          const interactive = canManage || Boolean(academyDay);
          return <button type="button" disabled={!interactive} className={`monthly-calendar-day ${dayClass} ${date === todayLocal() ? "calendar-today" : ""}`} key={date} onClick={() => setSelectedDate(date)}><strong>{day}</strong><span>{eventLabel || routineLabel || "—"}</span>{academyDay && <small>{academyDay.title}</small>}</button>;
        })}
      </div>
      <div className="calendar-legend"><span><i className="calendar-mark routine" /> Treino normal</span><span><i className="calendar-mark canceled" /> Cancelado/feriado</span><span><i className="calendar-mark extra" /> Treino extraordinário</span></div>

      {selectedDate && <div className="modal-backdrop">{canManage ? <form className="modal-card compact-modal" autoComplete="on" onSubmit={save} key={`${selectedDate}-${selectedEvent?.kind || "new"}`}><div className="modal-header"><div><span className="eyebrow">EXCEÇÃO DO CALENDÁRIO</span><h2>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString("pt-BR")}</h2></div><button type="button" className="modal-close" onClick={() => setSelectedDate(null)}>×</button></div><label className="field required"><span>Tipo</span><select name="kind" defaultValue={selectedEvent?.kind || "CANCELED"}><option value="HOLIDAY">Feriado / academia fechada</option><option value="CANCELED">Treino cancelado</option><option value="EXTRA">Treino extraordinário</option></select></label><label className="field required"><span>Nome</span><input name="title" autoCapitalize="sentences" spellCheck defaultValue={selectedEvent?.title || ""} placeholder="Ex.: feriado municipal" required /></label><label className="field"><span>Observação</span><textarea name="details" rows={3} autoCapitalize="sentences" spellCheck defaultValue={selectedEvent?.details || ""} /></label><div className="button-row calendar-modal-actions">{selectedEvent && <button className="secondary danger-text" type="button" onClick={() => void remove()}>Remover exceção</button>}<button className="primary action">Salvar</button></div></form> : <section className="modal-card compact-modal"><div className="modal-header"><div><span className="eyebrow">{selectedEvent ? kindLabels[selectedEvent.kind] : "CALENDÁRIO"}</span><h2>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString("pt-BR")}</h2></div><button className="modal-close" onClick={() => setSelectedDate(null)}>×</button></div><h3>{selectedEvent?.title}</h3>{selectedEvent?.details && <p className="justification-text">{selectedEvent.details}</p>}</section>}</div>}
    </section>
  );
}
