import { ageOn, formatCpf, formatPhone } from "@academia/domain";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { friendlyAuthError, registerStudent, watchProfessors, type ProfessorOption, type StudentRegistrationInput } from "./services";
import { TERM_VERSION, TermsModal } from "./TermsModal";

const belts = ["Branca", "Cinza", "Amarela", "Laranja", "Verde", "Azul", "Roxa", "Marrom", "Preta"];

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function upper(value: FormDataEntryValue | null): string {
  return String(value || "").trim().toLocaleUpperCase("pt-BR");
}

export function StudentOnboarding({ onBack }: { onBack: () => void }) {
  const [birthDate, setBirthDate] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [guardianCpf, setGuardianCpf] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [professors, setProfessors] = useState<ProfessorOption[]>([]);
  const [pending, setPending] = useState<Omit<StudentRegistrationInput, "acceptance"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const age = useMemo(() => {
    try { return birthDate ? ageOn(birthDate, todayLocal()) : null; } catch { return null; }
  }, [birthDate]);
  const minor = age !== null && age < 18;

  useEffect(() => watchProfessors(setProfessors, setMessage), []);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    if (password !== String(data.get("confirmation") || "")) return setMessage("As senhas não conferem.");
    const registration: Omit<StudentRegistrationInput, "acceptance"> = {
      fullName: upper(data.get("fullName")),
      birthDate,
      cpf,
      phone,
      whatsapp,
      address: upper(data.get("address")),
      email: String(data.get("email") || "").trim().toLowerCase(),
      password,
      ...(photo ? { photo } : {}),
      currentBelt: String(data.get("currentBelt") || "Branca"),
      professorId: String(data.get("professorId") || ""),
      ...(minor ? { guardian: {
        fullName: upper(data.get("guardianName")),
        cpf: guardianCpf,
        phone: guardianPhone,
        address: upper(data.get("guardianAddress")),
        relationship: upper(data.get("relationship")),
      } } : {}),
    };
    setMessage("");
    setPending(registration);
  }

  async function accept(signedByName: string) {
    if (!pending) return;
    setBusy(true);
    setMessage("");
    try {
      await registerStudent({
        ...pending,
        acceptance: { signedByName, acceptedByRole: minor ? "GUARDIAN" : "STUDENT", termVersion: TERM_VERSION },
      });
      setPending(null);
    } catch (error) {
      setPending(null);
      setMessage(friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboarding-shell">
      <header className="onboarding-header"><button className="text-button" onClick={onBack}>← Voltar para o login</button><span>Cadastro do aluno</span></header>
      <main className="onboarding-main">
        <form className="card onboarding-form" onSubmit={review}>
          <div className="section-title"><div><span className="eyebrow">PRIMEIRO ACESSO</span><h1>Faça seu cadastro</h1><p>Preencha seus dados. A leitura facial será cadastrada presencialmente no equipamento quando o serviço estiver configurado.</p></div>{age !== null && <span className="age-chip">{age} anos</span>}</div>
          <div className="form-section"><h3>Dados pessoais</h3><div className="form-grid">
            <label className="field required first-field"><span>Data de nascimento</span><input className="date-input" type="date" value={birthDate} required onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => setBirthDate(event.target.value)} /></label>
            {birthDate && <>
              <label className="field wide"><span>Foto de perfil (opcional)</span><input type="file" accept="image/*" onChange={(event) => setPhoto(event.target.files?.[0] || null)} /><small>Tire uma foto ou escolha da galeria. Máximo de 5 MB.</small></label>
              <label className="field wide required"><span>Nome completo</span><input className="uppercase-input" name="fullName" minLength={3} required /></label>
              <label className={`field ${minor ? "" : "required"}`}><span>CPF {minor && "(opcional para menor)"}</span><input inputMode="numeric" value={cpf} required={!minor} placeholder="000.000.000-00" onChange={(event) => setCpf(formatCpf(event.target.value))} /></label>
              <label className="field required"><span>Telefone para ligação via operadora</span><input type="tel" inputMode="numeric" value={phone} required placeholder="(00) 00000-0000" onChange={(event) => setPhone(formatPhone(event.target.value))} /></label>
              <label className="field required"><span>WhatsApp</span><input type="tel" inputMode="numeric" value={whatsapp} required placeholder="(00) 00000-0000" onChange={(event) => setWhatsapp(formatPhone(event.target.value))} /></label>
              <label className="field wide required"><span>Endereço completo</span><input className="uppercase-input" name="address" required /></label>
              <label className="field required"><span>Faixa atual</span><select name="currentBelt" required>{belts.map((belt) => <option key={belt}>{belt}</option>)}</select></label>
              <label className="field required"><span>Professor responsável</span><select name="professorId" required defaultValue=""><option value="" disabled>Selecione</option>{professors.map((professor) => <option key={professor.professorId} value={professor.professorId}>{professor.displayName}</option>)}</select></label>
            </>}
          </div></div>

          {minor && <fieldset className="guardian-box"><legend>Responsável legal</legend><p className="guardian-help">O cadastro do menor somente poderá ser concluído após o preenchimento destes dados e o aceite do termo pelo responsável.</p><div className="form-grid">
            <label className="field wide required"><span>Nome completo do responsável</span><input className="uppercase-input" name="guardianName" required /></label>
            <label className="field required"><span>CPF do responsável</span><input inputMode="numeric" value={guardianCpf} required placeholder="000.000.000-00" onChange={(event) => setGuardianCpf(formatCpf(event.target.value))} /></label>
            <label className="field required"><span>Telefone do responsável</span><input type="tel" inputMode="numeric" value={guardianPhone} required placeholder="(00) 00000-0000" onChange={(event) => setGuardianPhone(formatPhone(event.target.value))} /></label>
            <label className="field required"><span>Parentesco</span><input className="uppercase-input" name="relationship" required placeholder="MÃE, PAI, AVÓ..." /></label>
            <label className="field wide required"><span>Endereço do responsável</span><input className="uppercase-input" name="guardianAddress" required /></label>
          </div></fieldset>}

          {birthDate && <div className="form-section"><h3>Acesso ao portal</h3><div className="form-grid">
            <label className="field wide required"><span>E-mail</span><input name="email" type="email" autoComplete="email" required /></label>
            <label className="field required"><span>Senha</span><input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
            <label className="field required"><span>Confirmar senha</span><input name="confirmation" type="password" minLength={8} autoComplete="new-password" required /></label>
          </div></div>}
          {message && <div className="form-message error" role="status">{message}</div>}
          <button className="primary onboarding-submit" disabled={busy || !birthDate || professors.length === 0}>{busy ? "Concluindo…" : "Revisar termo e concluir"}</button>
        </form>
      </main>
      {pending && <TermsModal signerName={minor ? pending.guardian?.fullName || "" : pending.fullName} minor={minor} onCancel={() => setPending(null)} onAccept={(name) => void accept(name)} />}
    </div>
  );
}
