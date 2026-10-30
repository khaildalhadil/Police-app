// Browser storage (IndexedDB). There is no server database yet, so every record lives in
// this browser only; export a backup regularly.
import { blobToDataURL, dataURLToBlob, toLatinDigits } from "./util";

export type Appointment = { type: string; date: string; time: string; notes: string; alert: boolean };
export type Attachment = { type: string; fileName: string; fileType: string; size: number; blob: Blob | null };

// المتصلين بهم: a register of its own. civilId and nationality describe the wanted person the
// call was about.
export type Contact = {
  id?: number;
  civilId: string;
  nationality: string;
  name: string;
  phone: string;
  relation: string;
  at: string;
  location: string;
  answered: string;
  createdAt: string;
  updatedAt: string;
};

// الأشخاص: the civil number is the primary key.
export type Person = {
  civilId: string;
  name: string;
  nationality: string;
  dob: string;
  phone: string;
  wilayat: string;
  village: string;
  photo: Blob | null;
  createdAt: string;
  updatedAt: string;
};

export type Case = {
  id?: number;
  civilId: string;
  caseNo: string;
  charge: string;
  verdict: string;
  extensionDate: string;
  detentionDate: string;
  detentionOrder: string;
  releaseDate: string;
  releaseOrder: string;
  appointments: Appointment[];
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
};

// Same name as the old single-page app, so records saved there open here (see migrateV1).
const DB_NAME = "rop-case-system";
const DB_VERSION = 3;

let opening: Promise<IDBDatabase> | null = null;

export function openDB(onBlocked?: () => void) {
  opening ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("المتصفح لا يدعم التخزين المحلي"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const tx = req.transaction!;
      if (e.oldVersion < 2) {
        const cases =
          e.oldVersion < 1 ? db.createObjectStore("cases", { keyPath: "id", autoIncrement: true }) : tx.objectStore("cases");
        db.createObjectStore("persons", { keyPath: "civilId" });
        cases.createIndex("civilId", "civilId");
        if (e.oldVersion === 1) migrateV1(tx);
      }
      db.createObjectStore("contacts", { keyPath: "id", autoIncrement: true });
      if (e.oldVersion === 2) migrateV2(tx);
    };
    req.onblocked = () => onBlocked?.();
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      navigator.storage?.persist?.().catch(() => {});
      resolve(db);
    };
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("تم إلغاء العملية"));
  });

const result = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export async function loadAll() {
  const tx = (await openDB()).transaction(["persons", "cases", "contacts"]);
  const [persons, cases, contacts] = await Promise.all([
    result(tx.objectStore("persons").getAll() as IDBRequest<Person[]>),
    result(tx.objectStore("cases").getAll() as IDBRequest<Case[]>),
    result(tx.objectStore("contacts").getAll() as IDBRequest<Contact[]>),
  ]);
  return { persons: new Map(persons.map((p) => [p.civilId, p])), cases, contacts };
}

// Deletes the person once they have no cases left. Runs inside the caller's transaction.
function dropIfOrphan(tx: IDBTransaction, civilId: string) {
  const count = tx.objectStore("cases").index("civilId").count(civilId);
  count.onsuccess = () => {
    if (count.result === 0) tx.objectStore("persons").delete(civilId);
  };
}

// Saves the person (keyed by civil number) and the case together. If the case moved to a
// different civil number, its previous person is dropped when left with no cases.
export async function saveCase(person: Person, kase: Case, prevCivilId?: string) {
  const tx = (await openDB()).transaction(["persons", "cases"], "readwrite");
  tx.objectStore("persons").put(person);
  const put = tx.objectStore("cases").put(kase);
  if (prevCivilId && prevCivilId !== person.civilId) dropIfOrphan(tx, prevCivilId);
  await done(tx);
  return put.result as number;
}

export async function deleteCase(id: number) {
  const tx = (await openDB()).transaction(["persons", "cases"], "readwrite");
  const get = tx.objectStore("cases").get(id);
  get.onsuccess = () => {
    tx.objectStore("cases").delete(id);
    if (get.result) dropIfOrphan(tx, (get.result as Case).civilId);
  };
  await done(tx);
}

export async function saveContact(contact: Contact) {
  const tx = (await openDB()).transaction("contacts", "readwrite");
  const put = tx.objectStore("contacts").put(contact);
  await done(tx);
  return put.result as number;
}

export async function deleteContact(id: number) {
  const tx = (await openDB()).transaction("contacts", "readwrite");
  tx.objectStore("contacts").delete(id);
  await done(tx);
}

// ===== Old records and backups =====

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);

// Accepts the old single-page format too: رقم الوثيقة (docNo) became the civil number and
// المنطقة (region) became القرية.
function toPerson(r: Raw): Person {
  return {
    civilId: toLatinDigits(r.civilId ?? r.docNo).trim() || `غير-معروف-${r.id}`,
    name: str(r.name),
    nationality: str(r.nationality),
    dob: str(r.dob),
    phone: str(r.phone),
    wilayat: str(r.wilayat),
    village: str(r.village) || str(r.region),
    photo: r.photo instanceof Blob ? r.photo : null,
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
}

function toContact(r: Raw): Contact {
  return {
    ...(typeof r.id === "number" && { id: r.id }),
    civilId: toLatinDigits(r.civilId).trim(),
    nationality: str(r.nationality),
    name: str(r.name),
    phone: str(r.phone),
    relation: str(r.relation),
    at: str(r.at),
    location: str(r.location),
    answered: str(r.answered),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
}

// Version 2 kept contacts inside each person; each one becomes a register entry about them.
function contactsOf(p: Raw) {
  return list<Raw>(p.contacts).map((c) =>
    toContact({ ...c, civilId: p.civilId, nationality: p.nationality, createdAt: p.updatedAt, updatedAt: p.updatedAt }),
  );
}

function toCase(r: Raw, civilId: string): Case {
  return {
    ...(typeof r.id === "number" && { id: r.id }),
    civilId,
    caseNo: str(r.caseNo),
    charge: str(r.charge),
    verdict: str(r.verdict),
    extensionDate: str(r.extensionDate),
    detentionDate: str(r.detentionDate),
    detentionOrder: str(r.detentionOrder),
    releaseDate: str(r.releaseDate),
    releaseOrder: str(r.releaseOrder),
    appointments: list<Appointment>(r.appointments),
    attachments: list<Attachment>(r.attachments),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
}

// Several old records can share one person: the newest wins, keeping any photo and the
// earliest creation date.
function mergePerson(a: Person | undefined, b: Person): Person {
  if (!a) return b;
  const [older, newer] = a.updatedAt > b.updatedAt ? [b, a] : [a, b];
  return {
    ...newer,
    photo: newer.photo ?? older.photo,
    createdAt: older.createdAt < newer.createdAt ? older.createdAt : newer.createdAt,
  };
}

function splitLegacy(records: Raw[]) {
  const persons = new Map<string, Person>();
  const cases = records.map((r) => {
    const p = toPerson(r);
    persons.set(p.civilId, mergePerson(persons.get(p.civilId), p));
    return toCase(r, p.civilId);
  });
  return { persons, cases };
}

// Version 1 kept the person's fields on every case record; split them out.
function migrateV1(tx: IDBTransaction) {
  const all = tx.objectStore("cases").getAll();
  all.onsuccess = () => {
    const { persons, cases } = splitLegacy(all.result as Raw[]);
    persons.forEach((p) => tx.objectStore("persons").put(p));
    cases.forEach((c) => tx.objectStore("cases").put(c));
  };
}

function migrateV2(tx: IDBTransaction) {
  const all = tx.objectStore("persons").getAll();
  all.onsuccess = () => {
    for (const p of all.result as Raw[]) {
      if (!list(p.contacts).length) continue;
      contactsOf(p).forEach((c) => tx.objectStore("contacts").put(c));
      tx.objectStore("persons").put(toPerson(p));
    }
  };
}

export async function exportBackup() {
  const { persons, cases, contacts } = await loadAll();
  const data = {
    app: DB_NAME,
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    persons: await Promise.all(
      [...persons.values()].map(async (p) => ({ ...p, photo: p.photo && (await blobToDataURL(p.photo)) })),
    ),
    cases: await Promise.all(
      cases.map(async (c) => ({
        ...c,
        attachments: await Promise.all(
          c.attachments.map(async (a) => ({ ...a, blob: a.blob && (await blobToDataURL(a.blob)) })),
        ),
      })),
    ),
    contacts,
  };
  return new Blob([JSON.stringify(data)], { type: "application/json" });
}

// Reads a backup from this version or from the old single-page app. Records with the same
// id or civil number are replaced.
export async function readBackup(file: File) {
  let data: Raw;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("الملف غير صالح");
  }
  if (data?.app !== DB_NAME) throw new Error("الملف ليس نسخة احتياطية من هذا النظام");
  const blob = (v: unknown) => (typeof v === "string" && v.startsWith("data:") ? dataURLToBlob(v) : null);
  const withFiles = (r: Raw): Raw => ({
    ...r,
    photo: blob(r.photo),
    attachments: list<Raw>(r.attachments).map((a) => ({ ...a, blob: blob(a.blob) })),
  });

  if (Array.isArray(data.records)) {
    const { persons, cases } = splitLegacy((data.records as Raw[]).map(withFiles));
    return { persons: [...persons.values()], cases, contacts: [] };
  }
  const persons = list<Raw>(data.persons);
  return {
    persons: persons.map((p) => toPerson(withFiles(p))),
    cases: list<Raw>(data.cases).map((c) => toCase(withFiles(c), str(c.civilId))),
    contacts: [...list<Raw>(data.contacts).map(toContact), ...persons.flatMap(contactsOf)],
  };
}

export async function importBackup(persons: Person[], cases: Case[], contacts: Contact[]) {
  const tx = (await openDB()).transaction(["persons", "cases", "contacts"], "readwrite");
  persons.forEach((p) => tx.objectStore("persons").put(p));
  cases.forEach((c) => tx.objectStore("cases").put(c));
  contacts.forEach((c) => tx.objectStore("contacts").put(c));
  await done(tx);
}
