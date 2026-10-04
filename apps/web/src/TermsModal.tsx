import { useState } from "react";

export const TERM_VERSION = "2026-01-MINUTA";

export function TermsModal({ signerName, minor, onCancel, onAccept }: {
  signerName: string;
  minor: boolean;
  onCancel: () => void;
  onAccept: (signedByName: string) => void;
}) {
  const [signature, setSignature] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const normalizedSignature = signature.trim().toLocaleLowerCase("pt-BR");
  const canAccept = confirmed && normalizedSignature === signerName.trim().toLocaleLowerCase("pt-BR");

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <section className="modal-card terms-modal">
        <div className="modal-header">
          <div><span className="eyebrow">TERMO {TERM_VERSION}</span><h2 id="terms-title">Responsabilidade e proteção de dados</h2></div>
          <button className="modal-close" onClick={onCancel} aria-label="Fechar">×</button>
        </div>
        <div className="terms-content">
          <div className="legal-warning"><strong>Minuta em revisão jurídica</strong><span>Este documento deverá ser validado por advogado antes do uso definitivo.</span></div>
          <h3>1. Prática esportiva e saúde</h3>
          <p>Declaro que as informações fornecidas são verdadeiras e que o aluno está apto à prática esportiva, comprometendo-se a informar limitações, condições de saúde e recomendações médicas relevantes.</p>
          <h3>2. Instalações e regras internas</h3>
          <p>O aluno compromete-se a respeitar professores, colegas, horários, normas de segurança, conservação das instalações e regras de acesso da Extremo Norte - Liberdade.</p>
          <h3>3. Matrícula, pagamentos e acesso</h3>
          <p>A matrícula e o acesso poderão ser bloqueados quando houver mensalidade vencida, restrição administrativa ou descumprimento das regras internas, preservado o histórico do aluno.</p>
          <h3>4. Dados pessoais e LGPD</h3>
          <p>Autorizo o tratamento dos dados necessários à matrícula, comunicação, cobrança, frequência, segurança, controle de acesso e cumprimento de obrigações legais. Os dados serão acessados somente por pessoas autorizadas e fornecedores tecnológicos necessários.</p>
          <h3>5. Foto e biometria facial</h3>
          <p>A foto de perfil serve somente para identificação visual. Eventual biometria facial será cadastrada futuramente e diretamente no equipamento Topdata, mediante configuração e informação específica, sem transformar a foto de perfil em template biométrico.</p>
          <h3>6. Comunicações</h3>
          <p>Autorizo comunicações operacionais e financeiras pelos canais informados, inclusive WhatsApp, respeitadas as regras do provedor e a possibilidade de atualização das preferências.</p>
          {minor && <><h3>7. Menor de idade</h3><p>Na condição de responsável legal, autorizo a matrícula e a prática esportiva do menor, confirmo o vínculo informado e assumo responsabilidade pelas informações, pagamentos, autorizações e acompanhamento necessário.</p></>}
          <h3>{minor ? "8" : "7"}. Direitos do titular</h3>
          <p>O titular poderá solicitar consulta, correção, exportação e, quando juridicamente aplicável, exclusão ou anonimização de seus dados. Registros financeiros, de segurança e auditoria poderão ser retidos pelo prazo legal.</p>
        </div>
        <div className="terms-acceptance">
          <label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Li e aceito o termo de responsabilidade e o tratamento de dados descrito acima.</span></label>
          <label className="field required"><span>{minor ? "Nome completo do responsável legal" : "Nome completo do aluno"}</span><input value={signature} autoComplete="name" autoCapitalize="words" spellCheck onChange={(event) => setSignature(event.target.value)} placeholder={signerName} /></label>
          <div className="button-row"><button className="secondary" onClick={onCancel}>Voltar</button><button className="primary page-action" disabled={!canAccept} onClick={() => onAccept(signature.trim())}>Aceitar e concluir cadastro</button></div>
        </div>
      </section>
    </div>
  );
}
