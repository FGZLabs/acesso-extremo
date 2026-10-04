import { classifyAttendanceDay, frequencyPercentage, type AttendanceKind } from "@academia/domain";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  saveAbsenceJustification,
  setManualAttendance,
  watchAbsenceJustifications,
  watchAcademyDays,
  watchDailyAttendance,
  type AbsenceJustification,
  type AcademyDayRow,
  type DailyAttendanceRow,
} from "./services";

const weekdayLabels = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function AttendancePanel({ personId, birthDate, studentName, canJustify, canEditAttendance = false }: {
  personId: string;
  birthDate: string;
  studentName: string;
  canJustify: boolean;
  canEditAttendance?: boolean;
}) {
  const now = new Date();
  const [attendance, setAttendance] = useState<DailyAttendanceRow[]>([]);
  const [justifications, setJustifications] = useState<AbsenceJustification[]>([]);
  const [academyDays, setAcademyDays] = useState<AcademyDayRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewText, setViewText] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const days = useMemo(() => Array.from({ length: now.getDate() }, (_, index) => index + 1), [now.getDate()]);
  const attendanceByDate = new Map(attendance.map((item) => [item.date, item]));
  const justificationByDate = new Map(justifications.map((item) => [item.date, item]));
  const academyDayByDate = new Map(academyDays.map((item) => [item.date, item]));

  useEffect(() => {
    const stopAttendance = watchDailyAttendance(personId, setAttendance, setMessage);
    const stopJustifications = watchAbsenceJustifications(personId, setJustifications, setMessage);
    const stopAcademyDays = watchAcademyDays(setAcademyDays, setMessage);
    return () => { stopAttendance(); stopJustifications(); stopAcademyDays(); };
  }, [personId]);

  const monthDays = days.map((day) => {
    const date = isoDate(now.getFullYear(), now.getMonth(), day);
    const academyDay = academyDayByDate.get(date);
    const classification = classifyAttendanceDay({
      birthDate,
      date,
      academyClosed: academyDay?.closed,
      holiday: academyDay?.holiday,
      optionalEvent: academyDay?.optionalEvent,
    });
    const record = attendanceByDate.get(date);
    const justification = justificationByDate.get(date);
    const status = record ? (classification === "EXTRA" ? "EXTRA" : "P") : classification === "SCHEDULED" ? "F" : "—";
    return { day, date, academyDay, classification, record, justification, status };
  });
  const scheduled = monthDays.filter((item) => item.classification === "SCHEDULED");
  const scheduledPresent = scheduled.filter((item) => Boolean(item.record)).length;
  const absences = scheduled.length - scheduledPresent;
  const justifiedAbsences = scheduled.filter((item) => !item.record && item.justification).length;
  const extras = monthDays.filter((item) => item.classification === "EXTRA" && item.record).length;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDate) return;
    const data = new FormData(event.currentTarget);
    try {
      await saveAbsenceJustification(personId, selectedDate, String(data.get("text") || ""));
      setSelectedDate(null);
      setMessage("Justificativa registrada. A falta continua contabilizada.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar."); }
  }

  async function toggleAttendance(date: string, classification: AttendanceKind, currentlyPresent: boolean) {
    if (classification !== "SCHEDULED" && classification !== "EXTRA") return;
    try {
      await setManualAttendance(personId, date, classification, !currentlyPresent);
      setMessage(currentlyPresent ? "Presença removida; o dia voltou a contar como falta." : "Presença registrada manualmente.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível corrigir a frequência."); }
  }

  return (
    <section className="card attendance-card">
      <div className="page-heading"><div><span className="eyebrow">FREQUÊNCIA</span><h2>{studentName}</h2><p>{now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p></div><div className="attendance-legend"><span><i className="dot present" /> Presente</span><span><i className="dot absent" /> Falta</span><span><i className="dot extra" /> Presença extra</span></div></div>
      {message && <div className="form-message" role="status">{message}</div>}
      <div className="attendance-summary"><div><span>Presenças</span><strong>{scheduledPresent}</strong></div><div><span>Faltas</span><strong>{absences}</strong></div><div><span>Com justificativa</span><strong>{justifiedAbsences}</strong></div><div><span>Frequência</span><strong>{Math.round(frequencyPercentage(scheduledPresent, scheduled.length))}%</strong></div>{extras > 0 && <div><span>Extras</span><strong>{extras}</strong></div>}</div>
      <div className="attendance-calendar">
        {monthDays.map(({ day, date, academyDay, classification, record, justification, status }) => {
          const weekday = new Date(`${date}T12:00:00`).getDay();
          const statusClass = status === "—" ? "none" : status.toLowerCase();
          const exceptionLabel = academyDay?.kind === "HOLIDAY" ? "FERIADO" : academyDay?.kind === "CANCELED" ? "CANCELADO" : academyDay?.kind === "EXTRA" ? "TREINO EXTRA" : null;
          return <div className={`attendance-day status-${statusClass}`} key={date}><span>{weekdayLabels[weekday]}</span><strong>{day}</strong><em>{exceptionLabel || status}</em>{academyDay && <small title={academyDay.title}>{academyDay.title}</small>}<div className="attendance-actions">{status === "F" && canJustify && <button title={justification ? "Editar justificativa" : "Adicionar justificativa"} aria-label={justification ? "Editar justificativa" : "Adicionar justificativa"} onClick={() => setSelectedDate(date)}>✎</button>}{status === "F" && justification && !canJustify && <button title="Ver justificativa (não abona a falta)" aria-label="Ver justificativa" onClick={() => setViewText(justification.text)}>▤</button>}{canEditAttendance && (classification === "SCHEDULED" || classification === "EXTRA") && <button className="manual-attendance" title={record ? "Marcar como falta" : "Registrar presença manual"} aria-label={record ? "Marcar como falta" : "Registrar presença manual"} onClick={() => void toggleAttendance(date, classification, Boolean(record))}>{record ? "−" : "✓"}</button>}</div></div>;
        })}
      </div>
      <p className="attendance-note"><strong>Regra:</strong> a falta é contabilizada quando não existe presença em um dia normal de treino. A justificativa serve somente para registrar o motivo e não abona a falta. Feriados, treinos cancelados e treinos extras não geram falta.</p>
      {selectedDate && <div className="modal-backdrop"><form className="modal-card compact-modal" onSubmit={save}><div className="modal-header"><div><span className="eyebrow">JUSTIFICATIVA</span><h2>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString("pt-BR")}</h2></div><button type="button" className="modal-close" onClick={() => setSelectedDate(null)}>×</button></div><p className="modal-explanation">A justificativa ficará disponível para o professor, mas a data continuará marcada como falta.</p><label className="field required"><span>Motivo da ausência</span><textarea name="text" rows={5} autoCapitalize="sentences" spellCheck defaultValue={justificationByDate.get(selectedDate)?.text || ""} required /></label><button className="primary action">Salvar justificativa</button></form></div>}
      {viewText && <div className="modal-backdrop"><section className="modal-card compact-modal"><div className="modal-header"><div><span className="eyebrow">JUSTIFICATIVA DO ALUNO</span><h2>Motivo informado</h2></div><button className="modal-close" onClick={() => setViewText(null)}>×</button></div><p className="modal-explanation">Esta informação não abona a falta.</p><p className="justification-text">{viewText}</p></section></div>}
    </section>
  );
}
