import { ageOn, dailyAttendanceId, formatCpf, formatPhone, isValidCpf, isValidMobilePhone, normalizeCpf } from "@academia/domain";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getIdTokenResult,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  updatePassword,
  type User,
} from "firebase/auth";
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "./firebase";

export interface CreateStudentPayload {
  person: {
    fullName: string;
    birthDate: string;
    cpf?: string;
    phone?: string;
    whatsapp?: string;
    address?: string;
    email?: string;
  };
  student: {
    currentBelt: string;
    lastGraduationDate?: string;
    professorPersonId?: string;
    planId?: string;
    notes?: string;
  };
  guardian?: {
    fullName: string;
    cpf: string;
    relationship: string;
  };
}

export interface SessionProfile {
  kind: "ADMIN" | "PROFESSOR" | "STUDENT" | "UNLINKED";
  personId?: string;
  displayName: string;
}

export interface PersonRow {
  personId: string;
  fullName: string;
  birthDate: string;
  roles: string[];
  status: string;
  cpfFormatted?: string;
  email?: string;
}

export interface StudentPortalData {
  person: DocumentData | null;
  profile: DocumentData | null;
  enrollment: DocumentData | null;
}

export interface ProfessorOption {
  professorId: string;
  displayName: string;
  active: boolean;
}

export interface StudentDirectoryRow extends PersonRow {
  phone?: string;
  whatsapp?: string;
  address?: string;
  currentBelt: string;
  professorPersonId?: string;
  professorName: string;
  enrollmentStatus: string;
  validUntil?: string;
  guardian?: {
    personId: string;
    fullName: string;
    cpfFormatted?: string;
    phone?: string;
    address?: string;
    relationship: string;
  };
}

export interface AbsenceJustification {
  id: string;
  personId: string;
  date: string;
  text: string;
  updatedAt?: unknown;
}

export interface DailyAttendanceRow {
  id: string;
  personId: string;
  date: string;
  kind?: string;
  manual?: boolean;
}

export type AcademyDayKind = "HOLIDAY" | "CANCELED" | "EXTRA";

export interface AcademyDayRow {
  id: string;
  date: string;
  kind: AcademyDayKind;
  title: string;
  details?: string;
  closed: boolean;
  holiday: boolean;
  optionalEvent: boolean;
}

export interface StudentMessage {
  id: string;
  text: string;
  status: string;
  sentAt?: { toDate?: () => Date };
}

export interface StudentRegistrationInput {
  fullName: string;
  birthDate: string;
  cpf: string;
  phone: string;
  whatsapp: string;
  address: string;
  email: string;
  password: string;
  currentBelt: string;
  professorId: string;
  guardian?: {
    fullName: string;
    cpf: string;
    phone: string;
    address: string;
    relationship: string;
  };
  acceptance: {
    signedByName: string;
    acceptedByRole: "STUDENT" | "GUARDIAN";
    termVersion: string;
  };
}

function requireFirebase() {
  if (!auth || !db) throw new Error("Firebase ainda não foi configurado.");
  return { auth, db };
}

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function uppercaseText(value: string): string {
  return value.trim().toLocaleUpperCase("pt-BR");
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

export function friendlyAuthError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/invalid-email": "Informe um e-mail válido.",
    "auth/email-already-in-use": "Este e-mail já possui uma conta. Use Entrar ou Esqueci minha senha.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    "auth/requires-recent-login": "Por segurança, saia e entre novamente antes de trocar a senha.",
    "auth/network-request-failed": "Não foi possível acessar o Firebase. Verifique sua conexão.",
  };
  return messages[code] ?? (error instanceof Error ? error.message : "Não foi possível concluir a operação.");
}

export async function loadSessionProfile(user: User): Promise<SessionProfile> {
  const { db } = requireFirebase();
  const token = await getIdTokenResult(user, true);
  if (token.claims.admin === true) {
    return { kind: "ADMIN", displayName: user.displayName || user.email || "Administrador" };
  }
  if (token.claims.professor === true) {
    return { kind: "PROFESSOR", displayName: user.displayName || user.email || "Professor" };
  }
  const account = await getDoc(doc(db, "users", user.uid));
  if (account.exists()) {
    const data = account.data();
    const roles = Array.isArray(data.roles) ? data.roles.map(String) : [];
    return {
      kind: roles.includes("PROFESSOR") ? "PROFESSOR" : "STUDENT",
      personId: String(data.personId || user.uid),
      displayName: String(data.displayName || user.displayName || user.email || "Aluno"),
    };
  }
  return { kind: "UNLINKED", displayName: user.displayName || user.email || "Usuário" };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { auth } = requireFirebase();
  auth.languageCode = "pt-BR";
  await sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/?portal=aluno` });
}

export async function changePassword(user: User, currentPassword: string, newPassword: string): Promise<void> {
  if (!user.email) throw new Error("Esta conta não possui e-mail para reautenticação.");
  if (newPassword.length < 8) throw new Error("A nova senha deve ter pelo menos 8 caracteres.");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
  await updatePassword(user, newPassword);
}

export async function registerStudent(input: StudentRegistrationInput): Promise<void> {
  const firebase = requireFirebase();
  const age = ageOn(input.birthDate, todayLocal());
  const minor = age < 18;
  const cpfDigits = normalizeCpf(input.cpf);
  const guardianCpf = input.guardian ? normalizeCpf(input.guardian.cpf) : "";
  if ((!minor || cpfDigits) && !isValidCpf(cpfDigits)) throw new Error("CPF do aluno inválido.");
  if (!isValidMobilePhone(input.phone)) throw new Error("Telefone do aluno inválido.");
  if (!isValidMobilePhone(input.whatsapp)) throw new Error("WhatsApp do aluno inválido.");
  if (minor && !input.guardian) throw new Error("Os dados do responsável são obrigatórios para menor de 18 anos.");
  if (input.guardian && !isValidCpf(guardianCpf)) throw new Error("CPF do responsável inválido.");
  if (input.guardian && !isValidMobilePhone(input.guardian.phone)) throw new Error("Telefone do responsável inválido.");
  if (cpfDigits && guardianCpf && guardianCpf === cpfDigits) throw new Error("Aluno e responsável não podem usar o mesmo CPF.");
  if (uppercaseText(input.acceptance.signedByName) !== uppercaseText(minor ? input.guardian?.fullName || "" : input.fullName)) {
    throw new Error("O nome usado no aceite deve corresponder ao aluno adulto ou responsável legal.");
  }

  const credential = await createUserWithEmailAndPassword(firebase.auth, input.email, input.password);
  const uid = credential.user.uid;
  try {
    const studentCpfRef = cpfDigits ? doc(firebase.db, "cpfIndex", await sha256(cpfDigits)) : null;
    const guardianCpfRef = guardianCpf ? doc(firebase.db, "cpfIndex", await sha256(guardianCpf)) : null;
    const generatedGuardianRef = input.guardian ? doc(collection(firebase.db, "people")) : null;

    await runTransaction(firebase.db, async (transaction) => {
      const studentIndex = studentCpfRef ? await transaction.get(studentCpfRef) : null;
      const guardianIndex = guardianCpfRef ? await transaction.get(guardianCpfRef) : null;
      if (studentIndex?.exists()) throw new Error("Este CPF já possui cadastro.");

      const now = serverTimestamp();
      const guardianPersonId = guardianIndex?.exists()
        ? String(guardianIndex.data().personId || "")
        : generatedGuardianRef?.id || null;

      transaction.set(doc(firebase.db, "users", uid), {
        uid,
        personId: uid,
        displayName: uppercaseText(input.fullName),
        roles: ["ALUNO"],
        onboardingStatus: "CONCLUIDO",
        createdAt: now,
        updatedAt: now,
      });
      transaction.set(doc(firebase.db, "people", uid), {
        personId: uid,
        fullName: uppercaseText(input.fullName),
        birthDate: input.birthDate,
        cpfDigits: cpfDigits || null,
        cpfFormatted: cpfDigits ? formatCpf(cpfDigits) : null,
        phone: formatPhone(input.phone),
        whatsapp: formatPhone(input.whatsapp),
        address: uppercaseText(input.address),
        email: credential.user.email || input.email.trim().toLowerCase(),
        roles: ["ALUNO"],
        status: "ATIVA",
        ageBand: age < 15 ? "ATE_14" : age < 18 ? "15_A_17" : "ADULTO",
        registrationSource: "SELF_SERVICE",
        createdAt: now,
        createdBy: uid,
        updatedAt: now,
        deletedAt: null,
      });
      transaction.set(doc(firebase.db, "studentProfiles", uid), {
        personId: uid,
        currentBelt: input.currentBelt,
        lastGraduationDate: null,
        professorPersonId: input.professorId,
        facialStatus: "PENDENTE",
        profilePhotoPath: null,
        administrativeRestriction: null,
        onboardingStatus: "CONCLUIDO",
        updatedAt: now,
      });
      transaction.set(doc(firebase.db, "enrollments", uid), {
        personId: uid,
        planId: null,
        status: "PENDENTE",
        validUntil: null,
        createdAt: now,
        updatedAt: now,
      });
      if (studentCpfRef) transaction.set(studentCpfRef, { personId: uid, ownerUid: uid, kind: "STUDENT", createdAt: now });

      if (input.guardian && guardianPersonId && guardianCpfRef) {
        if (!guardianIndex?.exists() && generatedGuardianRef) {
          transaction.set(generatedGuardianRef, {
            personId: generatedGuardianRef.id,
            fullName: uppercaseText(input.guardian.fullName),
            birthDate: null,
            cpfDigits: guardianCpf,
            cpfFormatted: formatCpf(guardianCpf),
            phone: formatPhone(input.guardian.phone),
            whatsapp: null,
            address: uppercaseText(input.guardian.address),
            email: null,
            roles: ["RESPONSAVEL"],
            status: "ATIVA",
            registrationSource: "STUDENT_ONBOARDING",
            createdAt: now,
            createdBy: uid,
            updatedAt: now,
            deletedAt: null,
          });
          transaction.set(guardianCpfRef, { personId: generatedGuardianRef.id, ownerUid: uid, kind: "GUARDIAN", createdAt: now });
        }
        transaction.set(doc(firebase.db, "guardianLinks", `${guardianPersonId}_${uid}`), {
          guardianPersonId,
          dependentPersonId: uid,
          relationship: uppercaseText(input.guardian.relationship),
          status: "ATIVO",
          historicallyLinked: true,
          createdBy: uid,
          guardianSnapshot: {
            fullName: uppercaseText(input.guardian.fullName),
            cpfFormatted: formatCpf(guardianCpf),
            phone: formatPhone(input.guardian.phone),
            address: uppercaseText(input.guardian.address),
          },
          createdAt: now,
        });
      }

      transaction.set(doc(firebase.db, "termAcceptances", `${uid}_${input.acceptance.termVersion}`), {
        personId: uid,
        guardianPersonId: minor ? guardianPersonId : null,
        actorUid: uid,
        termVersion: input.acceptance.termVersion,
        signedByName: uppercaseText(input.acceptance.signedByName),
        acceptedByRole: input.acceptance.acceptedByRole,
        accepted: true,
        acceptedAt: now,
        userAgent: navigator.userAgent,
        documentStatus: "MINUTA_REVISAO_JURIDICA_PENDENTE",
      });
    });
  } catch (error) {
    await deleteUser(credential.user).catch(() => undefined);
    throw error;
  }
}

export async function createStudent(payload: CreateStudentPayload): Promise<{ personId: string }> {
  const { auth, db } = requireFirebase();
  if (!auth.currentUser) throw new Error("Sessão expirada. Entre novamente.");
  const age = ageOn(payload.person.birthDate, todayLocal());
  const minor = age < 18;
  if (minor && !payload.guardian) throw new Error("Responsável obrigatório para menor de 18 anos.");

  const studentCpf = normalizeCpf(payload.person.cpf ?? "");
  const phone = payload.person.phone?.trim() || "";
  const whatsapp = payload.person.whatsapp?.trim() || "";
  if ((!minor || studentCpf) && !isValidCpf(studentCpf)) throw new Error("CPF do aluno inválido.");
  if (phone && !isValidMobilePhone(phone)) throw new Error("Telefone para ligação inválido.");
  if (whatsapp && !isValidMobilePhone(whatsapp)) throw new Error("WhatsApp inválido.");
  const guardianCpf = payload.guardian ? normalizeCpf(payload.guardian.cpf) : "";
  if (guardianCpf && !isValidCpf(guardianCpf)) throw new Error("CPF do responsável inválido.");
  if (studentCpf && guardianCpf === studentCpf) throw new Error("Aluno e responsável não podem usar o mesmo CPF.");

  const personRef = doc(collection(db, "people"));
  const profileRef = doc(db, "studentProfiles", personRef.id);
  const enrollmentRef = doc(db, "enrollments", personRef.id);
  const studentCpfRef = studentCpf ? doc(db, "cpfIndex", await sha256(studentCpf)) : null;
  const newGuardianRef = payload.guardian ? doc(collection(db, "people")) : null;
  const guardianCpfRef = guardianCpf ? doc(db, "cpfIndex", await sha256(guardianCpf)) : null;
  const actorUid = auth.currentUser.uid;

  await runTransaction(db, async (transaction) => {
    const studentIndex = studentCpfRef ? await transaction.get(studentCpfRef) : null;
    const guardianIndex = guardianCpfRef ? await transaction.get(guardianCpfRef) : null;
    if (studentIndex?.exists()) throw new Error("CPF do aluno já cadastrado.");

    let resolvedGuardianRef = newGuardianRef;
    let existingGuardianFound = false;
    if (guardianIndex?.exists()) {
      const existingPersonId = String(guardianIndex.data().personId || "");
      if (!existingPersonId) throw new Error("Índice do responsável está inconsistente.");
      resolvedGuardianRef = doc(db, "people", existingPersonId);
      const existingGuardian = await transaction.get(resolvedGuardianRef);
      if (!existingGuardian.exists()) throw new Error("Responsável localizado pelo CPF não foi encontrado.");
      existingGuardianFound = true;
    }

    const now = serverTimestamp();
    transaction.set(personRef, {
      personId: personRef.id,
      fullName: uppercaseText(payload.person.fullName),
      birthDate: payload.person.birthDate,
      ...(studentCpf ? { cpfDigits: studentCpf, cpfFormatted: formatCpf(studentCpf) } : {}),
      phone: phone ? formatPhone(phone) : null,
      whatsapp: whatsapp ? formatPhone(whatsapp) : null,
      address: payload.person.address ? uppercaseText(payload.person.address) : null,
      email: payload.person.email?.trim().toLowerCase() || null,
      roles: ["ALUNO"],
      status: "ATIVA",
      ageBand: age < 15 ? "ATE_14" : age < 18 ? "15_A_17" : "ADULTO",
      requiresAdultTerm: false,
      createdAt: now,
      createdBy: actorUid,
      updatedAt: now,
      deletedAt: null,
    });
    transaction.set(profileRef, {
      personId: personRef.id,
      currentBelt: payload.student.currentBelt,
      lastGraduationDate: payload.student.lastGraduationDate || null,
      professorPersonId: payload.student.professorPersonId || null,
      planId: payload.student.planId || null,
      notes: payload.student.notes ? uppercaseText(payload.student.notes) : null,
      facialStatus: "PENDENTE",
      profilePhotoPath: null,
      administrativeRestriction: null,
      updatedAt: now,
    });
    transaction.set(enrollmentRef, {
      personId: personRef.id,
      planId: payload.student.planId || null,
      status: "ATIVA",
      validUntil: null,
      createdAt: now,
      updatedAt: now,
    });
    if (studentCpfRef) transaction.set(studentCpfRef, { personId: personRef.id, createdAt: now });

    let guardianPersonId: string | null = null;
    let relationship: string | null = null;
    if (payload.guardian && resolvedGuardianRef && guardianCpfRef) {
      guardianPersonId = resolvedGuardianRef.id;
      relationship = uppercaseText(payload.guardian.relationship);
      if (existingGuardianFound) {
        transaction.update(resolvedGuardianRef, { roles: arrayUnion("RESPONSAVEL"), updatedAt: now });
      } else {
        transaction.set(resolvedGuardianRef, {
        personId: resolvedGuardianRef.id,
        fullName: uppercaseText(payload.guardian.fullName),
        birthDate: null,
        cpfDigits: guardianCpf,
        cpfFormatted: formatCpf(guardianCpf),
        phone: null,
        whatsapp: null,
        email: null,
        roles: ["RESPONSAVEL"],
        status: "ATIVA",
        createdAt: now,
        createdBy: actorUid,
        updatedAt: now,
        deletedAt: null,
      });
        transaction.set(guardianCpfRef, { personId: resolvedGuardianRef.id, createdAt: now });
      }
    }
    if (guardianPersonId && relationship) {
      transaction.set(doc(db, "guardianLinks", `${guardianPersonId}_${personRef.id}`), {
        guardianPersonId,
        dependentPersonId: personRef.id,
        relationship,
        status: "ATIVO",
        historicallyLinked: true,
        createdAt: now,
      });
    }
    const auditRef = doc(collection(db, "auditLogs"));
    transaction.set(auditRef, {
      actorUid,
      action: "PERSON_CREATED",
      entityType: "people",
      entityId: personRef.id,
      occurredAt: now,
      after: { fullName: uppercaseText(payload.person.fullName), roles: ["ALUNO"], minor },
    });
  });

  return { personId: personRef.id };
}

export function watchPeople(onData: (people: PersonRow[]) => void, onError: (message: string) => void): Unsubscribe {
  const { db } = requireFirebase();
  const peopleQuery = query(collection(db, "people"), orderBy("fullName"), limit(200));
  return onSnapshot(peopleQuery, (snapshot) => {
    onData(snapshot.docs.map((item) => ({ personId: item.id, ...item.data() } as PersonRow)));
  }, (error) => onError(error.message));
}

export async function loadStudentPortal(personId: string): Promise<StudentPortalData> {
  const { db } = requireFirebase();
  const [person, profile, enrollment] = await Promise.all([
    getDoc(doc(db, "people", personId)),
    getDoc(doc(db, "studentProfiles", personId)),
    getDoc(doc(db, "enrollments", personId)),
  ]);
  return {
    person: person.exists() ? person.data() : null,
    profile: profile.exists() ? profile.data() : null,
    enrollment: enrollment.exists() ? enrollment.data() : null,
  };
}

export function watchProfessors(onData: (professors: ProfessorOption[]) => void, onError: (message: string) => void): Unsubscribe {
  const { db } = requireFirebase();
  return onSnapshot(query(collection(db, "professors"), limit(50)), (snapshot) => {
    const professors = snapshot.docs
      .map((item) => ({ professorId: item.id, ...item.data() } as ProfessorOption))
      .filter((item) => item.active !== false)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
    onData(professors);
  }, (error) => onError(error.message));
}

export function watchStudentDirectory(onData: (students: StudentDirectoryRow[]) => void, onError: (message: string) => void): Unsubscribe {
  const { db } = requireFirebase();
  let people: DocumentData[] = [];
  let profiles: DocumentData[] = [];
  let enrollments: DocumentData[] = [];
  let guardianLinks: DocumentData[] = [];
  let professors: ProfessorOption[] = [];
  const ready = new Set<string>();

  function emit(key: string) {
    ready.add(key);
    if (ready.size < 5) return;
    const peopleById = new Map(people.map((item) => [String(item.personId), item]));
    const profileById = new Map(profiles.map((item) => [String(item.personId), item]));
    const enrollmentById = new Map(enrollments.map((item) => [String(item.personId), item]));
    const guardianByDependent = new Map(guardianLinks.map((item) => [String(item.dependentPersonId), item]));
    const professorById = new Map(professors.map((item) => [item.professorId, item]));

    const rows = people
      .filter((item) => Array.isArray(item.roles) && item.roles.includes("ALUNO") && !item.deletedAt)
      .map((person) => {
        const personId = String(person.personId);
        const profile = profileById.get(personId) || {};
        const enrollment = enrollmentById.get(personId) || {};
        const link = guardianByDependent.get(personId);
        const guardianPerson = link ? peopleById.get(String(link.guardianPersonId)) : undefined;
        const snapshot = link?.guardianSnapshot || {};
        const professorId = String(profile.professorPersonId || "");
        return {
          ...person,
          personId,
          roles: person.roles || [],
          status: String(person.status || "ATIVA"),
          currentBelt: String(profile.currentBelt || "NÃO INFORMADA"),
          professorPersonId: professorId || undefined,
          professorName: professorById.get(professorId)?.displayName || "NÃO DEFINIDO",
          enrollmentStatus: String(enrollment.status || "PENDENTE"),
          validUntil: enrollment.validUntil ? String(enrollment.validUntil) : undefined,
          guardian: link ? {
            personId: String(link.guardianPersonId),
            fullName: String(guardianPerson?.fullName || snapshot.fullName || "RESPONSÁVEL"),
            cpfFormatted: String(guardianPerson?.cpfFormatted || snapshot.cpfFormatted || "") || undefined,
            phone: String(guardianPerson?.phone || snapshot.phone || "") || undefined,
            address: String(guardianPerson?.address || snapshot.address || "") || undefined,
            relationship: String(link.relationship || ""),
          } : undefined,
        } as StudentDirectoryRow;
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
    onData(rows);
  }

  const subscriptions = [
    onSnapshot(query(collection(db, "people"), limit(500)), (snapshot) => { people = snapshot.docs.map((item) => ({ personId: item.id, ...item.data() })); emit("people"); }, (error) => onError(error.message)),
    onSnapshot(query(collection(db, "studentProfiles"), limit(500)), (snapshot) => { profiles = snapshot.docs.map((item) => item.data()); emit("profiles"); }, (error) => onError(error.message)),
    onSnapshot(query(collection(db, "enrollments"), limit(500)), (snapshot) => { enrollments = snapshot.docs.map((item) => item.data()); emit("enrollments"); }, (error) => onError(error.message)),
    onSnapshot(query(collection(db, "guardianLinks"), limit(500)), (snapshot) => { guardianLinks = snapshot.docs.map((item) => item.data()); emit("links"); }, (error) => onError(error.message)),
    watchProfessors((items) => { professors = items; emit("professors"); }, onError),
  ];
  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}

export async function updateOwnProfile(personId: string, input: { fullName: string; phone: string; whatsapp: string; address: string }): Promise<void> {
  const { db } = requireFirebase();
  if (!isValidMobilePhone(input.phone) || !isValidMobilePhone(input.whatsapp)) throw new Error("Informe telefone e WhatsApp completos.");
  await updateDoc(doc(db, "people", personId), {
    fullName: uppercaseText(input.fullName),
    phone: formatPhone(input.phone),
    whatsapp: formatPhone(input.whatsapp),
    address: uppercaseText(input.address),
    updatedAt: serverTimestamp(),
  });
}

export async function requestBeltChange(personId: string, currentBelt: string, requestedBelt: string, reason: string): Promise<void> {
  const { auth, db } = requireFirebase();
  if (!auth.currentUser) throw new Error("Sessão expirada.");
  const requestRef = doc(collection(db, "beltChangeRequests"));
  await setDoc(requestRef, {
    requestId: requestRef.id,
    personId,
    currentBelt,
    requestedBelt,
    reason: uppercaseText(reason),
    status: "PENDENTE",
    requestedBy: auth.currentUser.uid,
    requestedAt: serverTimestamp(),
  });
}

export function watchBeltRequests(onData: (requests: DocumentData[]) => void, onError: (message: string) => void): Unsubscribe {
  const { db } = requireFirebase();
  return onSnapshot(query(collection(db, "beltChangeRequests"), limit(200)), (snapshot) => {
    onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as DocumentData)).filter((item) => item.status === "PENDENTE"));
  }, (error) => onError(error.message));
}

export async function decideBeltRequest(requestId: string, personId: string, requestedBelt: string, approved: boolean): Promise<void> {
  const { auth, db } = requireFirebase();
  if (!auth.currentUser) throw new Error("Sessão expirada.");
  await runTransaction(db, async (transaction) => {
    transaction.update(doc(db, "beltChangeRequests", requestId), {
      status: approved ? "APROVADA" : "REJEITADA",
      decidedBy: auth.currentUser!.uid,
      decidedAt: serverTimestamp(),
    });
    if (approved) transaction.update(doc(db, "studentProfiles", personId), { currentBelt: requestedBelt, updatedAt: serverTimestamp() });
  });
}

export async function saveAbsenceJustification(personId: string, date: string, text: string): Promise<void> {
  const { auth, db } = requireFirebase();
  if (!auth.currentUser) throw new Error("Sessão expirada.");
  await setDoc(doc(db, "absenceJustifications", `${personId}_${date}`), {
    personId,
    date,
    text: uppercaseText(text),
    authorUid: auth.currentUser.uid,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function watchAbsenceJustifications(personId: string, onData: (items: AbsenceJustification[]) => void, onError: (message: string) => void): Unsubscribe {
  const { db } = requireFirebase();
  return onSnapshot(query(collection(db, "absenceJustifications"), where("personId", "==", personId), limit(100)), (snapshot) => {
    onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as AbsenceJustification)));
  }, (error) => onError(error.message));
}

export function watchDailyAttendance(personId: string, onData: (items: DailyAttendanceRow[]) => void, onError: (message: string) => void): Unsubscribe {
  const { db } = requireFirebase();
  return onSnapshot(query(collection(db, "dailyAttendance"), where("personId", "==", personId), limit(100)), (snapshot) => {
    onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as DailyAttendanceRow)));
  }, (error) => onError(error.message));
}

export function watchAcademyDays(onData: (items: AcademyDayRow[]) => void, onError: (message: string) => void): Unsubscribe {
  const { db } = requireFirebase();
  return onSnapshot(query(collection(db, "academyDays"), limit(500)), (snapshot) => {
    const items = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() } as AcademyDayRow))
      .sort((a, b) => a.date.localeCompare(b.date));
    onData(items);
  }, (error) => onError(error.message));
}

export async function saveAcademyDay(input: { date: string; kind: AcademyDayKind; title: string; details?: string }): Promise<void> {
  const { auth, db } = requireFirebase();
  if (!auth.currentUser) throw new Error("Sessão expirada.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Informe uma data válida.");
  if (!input.title.trim()) throw new Error("Informe o nome do evento.");
  await setDoc(doc(db, "academyDays", input.date), {
    eventId: input.date,
    date: input.date,
    kind: input.kind,
    title: uppercaseText(input.title),
    details: uppercaseText(input.details || "") || null,
    closed: input.kind === "HOLIDAY" || input.kind === "CANCELED",
    holiday: input.kind === "HOLIDAY",
    optionalEvent: input.kind === "EXTRA",
    openMat: false,
    updatedBy: auth.currentUser.uid,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function removeAcademyDay(date: string): Promise<void> {
  const { db } = requireFirebase();
  await deleteDoc(doc(db, "academyDays", date));
}

export async function setManualAttendance(personId: string, date: string, kind: "SCHEDULED" | "EXTRA", present: boolean): Promise<void> {
  const { auth, db } = requireFirebase();
  if (!auth.currentUser) throw new Error("Sessão expirada.");
  const attendanceRef = doc(db, "dailyAttendance", dailyAttendanceId(personId, date));
  if (!present) {
    await deleteDoc(attendanceRef);
    return;
  }
  await setDoc(attendanceRef, {
    attendanceId: dailyAttendanceId(personId, date),
    personId,
    date,
    kind,
    extra: kind === "EXTRA",
    manual: true,
    recordedBy: auth.currentUser.uid,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function staffUpdateStudent(personId: string, input: { fullName: string; phone: string; whatsapp: string; address: string; professorPersonId: string }): Promise<void> {
  const { db } = requireFirebase();
  await Promise.all([
    updateDoc(doc(db, "people", personId), {
      fullName: uppercaseText(input.fullName),
      phone: input.phone ? formatPhone(input.phone) : null,
      whatsapp: input.whatsapp ? formatPhone(input.whatsapp) : null,
      address: uppercaseText(input.address),
      updatedAt: serverTimestamp(),
    }),
    updateDoc(doc(db, "studentProfiles", personId), { professorPersonId: input.professorPersonId, updatedAt: serverTimestamp() }),
  ]);
}

export async function setStudentAccess(personId: string, blocked: boolean): Promise<void> {
  const { db } = requireFirebase();
  await updateDoc(doc(db, "people", personId), {
    status: blocked ? "BLOQUEADA" : "ATIVA",
    updatedAt: serverTimestamp(),
  });
}

export async function softDeleteStudent(personId: string): Promise<void> {
  const { db } = requireFirebase();
  await updateDoc(doc(db, "people", personId), { status: "INATIVA", deletedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function createExternalReceipt(personId: string, amount: number, method: string, notes: string): Promise<void> {
  const { auth, db } = requireFirebase();
  if (!auth.currentUser) throw new Error("Sessão expirada.");
  const receiptRef = doc(collection(db, "externalReceipts"));
  await setDoc(receiptRef, {
    receiptId: receiptRef.id,
    personId,
    amount,
    method: uppercaseText(method),
    notes: uppercaseText(notes),
    status: "AGUARDANDO_APROVACAO",
    createdBy: auth.currentUser.uid,
    createdAt: serverTimestamp(),
  });
}

export async function createStudentNote(personId: string, text: string): Promise<void> {
  const { auth, db } = requireFirebase();
  if (!auth.currentUser) throw new Error("Sessão expirada.");
  const noteRef = doc(collection(db, "studentNotes"));
  await setDoc(noteRef, { noteId: noteRef.id, personId, text: uppercaseText(text), createdBy: auth.currentUser.uid, createdAt: serverTimestamp() });
}

export async function sendInAppMessage(personId: string, text: string): Promise<void> {
  const { auth, db } = requireFirebase();
  if (!auth.currentUser) throw new Error("Sessão expirada.");
  const messageRef = doc(collection(db, "messages"));
  await setDoc(messageRef, {
    messageId: messageRef.id,
    personId,
    text: uppercaseText(text),
    channel: "IN_APP",
    status: "ENVIADA",
    sentBy: auth.currentUser.uid,
    sentAt: serverTimestamp(),
  });
}

export function watchStudentMessages(personId: string, onData: (items: StudentMessage[]) => void, onError: (message: string) => void): Unsubscribe {
  const { db } = requireFirebase();
  return onSnapshot(query(collection(db, "messages"), where("personId", "==", personId), limit(100)), (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as StudentMessage));
    onData(items.sort((a, b) => (b.sentAt?.toDate?.().getTime() || 0) - (a.sentAt?.toDate?.().getTime() || 0)));
  }, (error) => onError(error.message));
}
