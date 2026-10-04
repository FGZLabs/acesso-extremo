import { ageOn, formatCpf, formatPhone, isValidCpf, isValidMobilePhone } from "@academia/domain";
import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { createStudent, watchProfessors, type CreateStudentPayload, type ProfessorOption } from "./services";

const belts = ["Branca", "Cinza", "Amarela", "Laranja", "Verde", "Azul", "Roxa", "Marrom", "Preta"];

function uppercaseInput(event: FormEvent<HTMLInputElement | HTMLTextAreaElement>) {
  event.currentTarget.value = event.currentTarget.value.toLocaleUpperCase("pt-BR");
}

function openDatePicker(event: MouseEvent<HTMLInputElement>) {
  event.currentTarget.showPicker?.();
}

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function PersonForm({ enabled, onCreated }: { enabled: boolean; onCreated?: () => void }) {
  const [birthDate, setBirthDate] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [guardianCpf, setGuardianCpf] = useState("");
  const [createdAccess, setCreatedAccess] = useState<{ personId: string; accessPin: string; guardianPin?: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [professors, setProfessors] = useState<ProfessorOption[]>([]);
  useEffect(() => watchProfessors(setProfessors, setMessage), []);
  const age = useMemo(() => {
    try { return birthDate ? ageOn(birthDate, todayLocal()) : null; }
    catch { return null; }
  }, [birthDate]);
  const minor = age !== null && age < 18;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setMessage("");
    const form = new FormData(formElement);
    if (age === null) return setMessage("Informe uma data de nascimento válida.");
    if (!minor && !isValidCpf(cpf)) return setMessage("CPF obrigatório e inválido para aluno adulto.");
    if (cpf && !isValidCpf(cpf)) return setMessage("CPF informado é inválido.");
    if (phone && !isValidMobilePhone(phone)) return setMessage("Telefone para ligação deve ter DDD e 9 dígitos.");
    if (whatsapp && !isValidMobilePhone(whatsapp)) return setMessage("WhatsApp deve ter DDD e 9 dígitos.");
    if (minor && !isValidCpf(guardianCpf)) return setMessage("CPF do responsável é obrigatório e inválido.");
    if (!enabled) return setMessage("Configure o Firebase para salvar o cadastro.");

    const payload: CreateStudentPayload = {
      ...(form.get("photo") instanceof File && (form.get("photo") as File).size > 0 ? { photo: form.get("photo") as File } : {}),
      person: {
        birthDate,
        fullName: String(form.get("fullName") ?? "").trim().toLocaleUpperCase("pt-BR"),
        ...(cpf ? { cpf } : {}),
        phone: String(form.get("phone") ?? ""),
        whatsapp: String(form.get("whatsapp") ?? ""),
        address: String(form.get("address") ?? "").trim().toLocaleUpperCase("pt-BR"),
        email: String(form.get("email") ?? ""),
      },
      student: {
        currentBelt: String(form.get("currentBelt") ?? "Branca"),
        lastGraduationDate: String(form.get("lastGraduationDate") ?? "") || undefined,
        professorPersonId: String(form.get("professorPersonId") ?? "") || undefined,
        planId: String(form.get("planId") ?? "") || undefined,
        notes: String(form.get("notes") ?? "").trim().toLocaleUpperCase("pt-BR") || undefined,
      },
    };

    if (minor) {
      payload.guardian = {
        fullName: String(form.get("guardianName") ?? "").trim().toLocaleUpperCase("pt-BR"),
        cpf: guardianCpf,
        relationship: String(form.get("relationship") ?? "").trim().toLocaleUpperCase("pt-BR"),
      };
    }

    setBusy(true);
    try {
      const result = await createStudent(payload);
      formElement.reset();
      setBirthDate("");
      setCpf("");
      setPhone("");
      setWhatsapp("");
      setGuardianCpf("");
      setMessage("Cadastro concluído e PIN de acesso gerado.");
      setCreatedAccess(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card person-form" onSubmit={submit}>
      <div className="section-title">
        <div>
          <span className="eyebrow">ENTIDADE CENTRAL</span>
          <h2>Novo aluno</h2>
          <p>O cadastro começa pela data de nascimento e adapta os campos automaticamente.</p>
        </div>
        {age !== null && <span className="age-chip">{age} anos</span>}
      </div>

      <div className="form-grid">
        <label className="field required first-field">
          <span>Data de nascimento</span>
          <input className="date-input" name="birthDate" type="date" required value={birthDate} onClick={openDatePicker} onChange={(event) => setBirthDate(event.target.value)} />
        </label>
        {birthDate && (
          <>
            <label className="field wide"><span>Foto de perfil (opcional)</span><input name="photo" type="file" accept="image/*" /><small>Tire uma foto ou escolha da galeria. Máximo de 5 MB.</small></label>
            <label className="field wide required">
              <span>Nome completo</span>
              <input className="uppercase-input" name="fullName" required autoComplete="name" onInput={uppercaseInput} />
            </label>
            <label className={`field ${minor ? "" : "required"}`}>
              <span>CPF {minor && "(opcional para menor)"}</span>
              <input
                name="cpf"
                inputMode="numeric"
                value={cpf}
                onChange={(event) => setCpf(formatCpf(event.target.value))}
                required={!minor}
                placeholder="000.000.000-00"
              />
            </label>
            <label className="field"><span>Telefone para ligação via operadora</span><input name="phone" type="tel" inputMode="numeric" placeholder="(00) 00000-0000" value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} /></label>
            <label className="field"><span>WhatsApp</span><input name="whatsapp" type="tel" inputMode="numeric" placeholder="(00) 00000-0000" value={whatsapp} onChange={(event) => setWhatsapp(formatPhone(event.target.value))} /></label>
            <label className="field"><span>E-mail</span><input name="email" type="email" /></label>
            <label className="field wide"><span>Endereço</span><input className="uppercase-input" name="address" onInput={uppercaseInput} /></label>
            <label className="field required">
              <span>Graduação atual</span>
              <select name="currentBelt" required>{belts.map((belt) => <option key={belt}>{belt}</option>)}</select>
            </label>
            <label className="field"><span>Última graduação</span><input className="date-input" name="lastGraduationDate" type="date" onClick={openDatePicker} /></label>
            <label className="field"><span>Professor responsável</span><select name="professorPersonId" defaultValue=""><option value="">Selecione</option>{professors.map((professor) => <option key={professor.professorId} value={professor.professorId}>{professor.displayName}</option>)}</select></label>
            <label className="field"><span>ID do plano</span><input name="planId" /></label>
            <label className="field wide"><span>Observações</span><textarea className="uppercase-input" name="notes" rows={3} onInput={uppercaseInput} /></label>
          </>
        )}
      </div>

      {minor && (
        <fieldset className="guardian-box">
          <legend>Responsável obrigatório</legend>
          <p className="guardian-help">Informe os dados abaixo. O CPF será verificado automaticamente: se o responsável já existir, o vínculo será reutilizado; caso contrário, um novo personId será criado.</p>
          <div className="form-grid">
            <label className="field wide required"><span>Nome do responsável</span><input className="uppercase-input" name="guardianName" required onInput={uppercaseInput} /></label>
            <label className="field required"><span>CPF do responsável</span><input name="guardianCpf" inputMode="numeric" placeholder="000.000.000-00" required value={guardianCpf} onChange={(event) => setGuardianCpf(formatCpf(event.target.value))} /></label>
            <label className="field required"><span>Parentesco</span><input className="uppercase-input" name="relationship" required placeholder="EX.: MÃE, PAI, AVÓ" onInput={uppercaseInput} /></label>
          </div>
        </fieldset>
      )}

      {message && <div className="form-message" role="status">{message}</div>}
      <button className="primary action" disabled={busy || !birthDate}>{busy ? "Salvando…" : "Salvar pessoa"}</button>
      {createdAccess && <div className="modal-backdrop"><section className="modal-card compact-modal access-pin-modal"><span className="eyebrow">CADASTRO CONCLUÍDO</span><h2>Guarde os PINs de acesso</h2><p>Use estes códigos somente quando a leitura facial não reconhecer a pessoa.</p><div className="pin-result"><span>Aluno</span><strong>{createdAccess.accessPin}</strong></div>{createdAccess.guardianPin && <div className="pin-result"><span>Responsável</span><strong>{createdAccess.guardianPin}</strong></div>}<button type="button" className="primary action" onClick={() => { setCreatedAccess(null); onCreated?.(); }}>Entendi e guardei</button></section></div>}
    </form>
  );
}
