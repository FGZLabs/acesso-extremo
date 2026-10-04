import { describe, expect, it } from "vitest";
import {
  ageOn,
  billingNotificationSchedule,
  classifyAttendanceDay,
  dailyAttendanceId,
  formatCpf,
  formatPhone,
  frequencyPercentage,
  isValidCpf,
  isValidMobilePhone,
  normalizeCpf,
  paymentEventKey,
  renewMembershipValidity,
  requiredWeekdaysForAge,
} from "./index.js";

describe("CPF", () => {
  it("normaliza, formata e valida matematicamente", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("123.456.789-10")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });
});

describe("telefone", () => {
  it("aplica máscara de celular com DDD", () => {
    expect(formatPhone("95991234567")).toBe("(95) 99123-4567");
    expect(formatPhone("(95) 99123-4567")).toBe("(95) 99123-4567");
    expect(isValidMobilePhone("(95) 99123-4567")).toBe(true);
    expect(isValidMobilePhone("95 8123-4567")).toBe(false);
  });
});

describe("idade e faixa de treino", () => {
  it("muda a regra ao completar 15 anos", () => {
    expect(ageOn("2011-10-01", "2026-09-30")).toBe(14);
    expect(requiredWeekdaysForAge(14)).toEqual([1, 3, 5]);
    expect(ageOn("2011-10-01", "2026-10-01")).toBe(15);
    expect(requiredWeekdaysForAge(15)).toEqual([1, 2, 3, 4, 5]);
  });

  it("muda para adulto aos 18 anos", () => {
    expect(ageOn("2008-09-30", "2026-09-29")).toBe(17);
    expect(ageOn("2008-09-30", "2026-09-30")).toBe(18);
  });
});

describe("validade financeira", () => {
  it("preserva dias restantes no pagamento antecipado", () => {
    expect(renewMembershipValidity("2026-10-10", "2026-10-08")).toBe("2026-11-09");
  });

  it("parte do pagamento quando a validade está vencida", () => {
    expect(renewMembershipValidity("2026-10-05", "2026-10-12")).toBe("2026-11-11");
  });

  it("produz chave estável para webhook duplicado", () => {
    expect(paymentEventKey("MOCK", "evt-123")).toBe("mock_evt-123");
    expect(paymentEventKey("MOCK", "evt-123")).toBe(paymentEventKey("mock", "evt-123"));
  });
});

describe("frequência", () => {
  it("não prevê falta no domingo", () => {
    expect(classifyAttendanceDay({ birthDate: "2014-01-01", date: "2026-09-27" })).toBe("NONE");
  });

  it("não prevê falta em feriado", () => {
    expect(classifyAttendanceDay({ birthDate: "2014-01-01", date: "2026-09-28", holiday: true })).toBe("NONE");
  });

  it("não prevê falta quando o treino foi cancelado", () => {
    expect(classifyAttendanceDay({ birthDate: "2000-01-01", date: "2026-10-01", academyClosed: true })).toBe("NONE");
  });

  it("considera OpenMat no sábado como presença extra", () => {
    expect(classifyAttendanceDay({ birthDate: "2014-01-01", date: "2026-09-26", openMat: true })).toBe("EXTRA");
  });

  it("considera quinta-feira da criança como treino extra", () => {
    expect(classifyAttendanceDay({ birthDate: "2014-01-01", date: "2026-10-01" })).toBe("EXTRA");
  });

  it("usa chave diária idempotente e exclui extras do percentual", () => {
    expect(dailyAttendanceId("person-1", "2026-09-30")).toBe("person-1_2026-09-30");
    expect(frequencyPercentage(8, 10)).toBe(80);
  });
});

describe("notificações", () => {
  it("agenda somente D-3, D-1, D0 e D+1", () => {
    expect(billingNotificationSchedule("2026-10-10")).toEqual([
      { key: "D-3", date: "2026-10-07", time: "10:00" },
      { key: "D-1", date: "2026-10-09", time: "10:00" },
      { key: "D0", date: "2026-10-10", time: "16:00" },
      { key: "D+1", date: "2026-10-11", time: "12:00" },
    ]);
  });
});
