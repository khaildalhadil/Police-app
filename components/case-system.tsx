"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";
import { logout } from "@/app/actions";
import logo from "@/public/rop-logo.jpg";
import * as store from "@/lib/store";
import {
  ageFrom,
  daysBetween,
  daysText,
  downloadBlob,
  errMsg,
  fmtDate,
  fmtDateTime,
  fmtSize,
  norm,
  openBlob,
  statusOf,
  toLatinDigits,
  todayStr,
} from "@/lib/util";
import { AttachmentsTable, hasFiles, type AttRow } from "./attachments-table";
import { Bell, dueItems } from "./bell";
import { useConfirm, useToasts } from "./feedback";
import { Icon } from "./icon";
import { RowTable, type Column } from "./row-table";
import { Sidebar } from "./sidebar";

const DOC_TYPES = ["التحقيق", "الترحيل", "الأمانات", "الحجز", "الإفراج", "أمر ندب", "أمر استدعاء", "أمر تفريغ هاتف", "رسالة بشرية", "أخرى"];
const APPT_TYPES = ["تمديد الحجز", "الإفراج", "المستشفى", "المحكمة", "النيابة العامة", "القضاء العسكري", "أخرى"];
const NATIONALITIES = ["عماني", "إماراتي", "سعودي", "كويتي", "بحريني", "قطري", "يمني", "هندي", "باكستاني", "بنغلاديشي", "نيبالي", "سريلانكي", "فلبيني", "إندونيسي", "مصري", "سوداني", "أردني", "سوري", "لبناني", "عراقي", "إيراني", "أفغاني", "إثيوبي", "صومالي", "كيني", "تنزاني", "أوغندي"];
const GOVERNORATES: Record<string, string[]> = {
  "محافظة مسقط": ["مسقط", "مطرح", "بوشر", "السيب", "العامرات", "قريات"],
  "محافظة ظفار": ["صلالة", "طاقة", "مرباط", "رخيوت", "ثمريت", "ضلكوت", "المزيونة", "مقشن", "شليم وجزر الحلانيات", "سدح"],
  "محافظة مسندم": ["خصب", "دبا", "بخا", "مدحاء"],
  "محافظة البريمي": ["البريمي", "محضة", "السنينة"],
  "محافظة الداخلية": ["نزوى", "بهلا", "منح", "الحمراء", "أدم", "إزكي", "سمائل", "بدبد", "الجبل الأخضر"],
  "محافظة شمال الباطنة": ["صحار", "شناص", "لوى", "صحم", "الخابورة", "السويق"],
  "محافظة جنوب الباطنة": ["الرستاق", "العوابي", "نخل", "وادي المعاول", "بركاء", "المصنعة"],
  "محافظة جنوب الشرقية": ["صور", "الكامل والوافي", "جعلان بني بو حسن", "جعلان بني بو علي", "مصيرة"],
  "محافظة شمال الشرقية": ["إبراء", "المضيبي", "بدية", "القابل", "وادي بني خالد", "دماء والطائيين", "سناو"],
  "محافظة الظاهرة": ["عبري", "ينقل", "ضنك"],
  "محافظة الوسطى": ["هيماء", "محوت", "الدقم", "الجازر"],
};

const EMPTY = {
  civilId: "",
  name: "",
  nationality: "",
  dob: "",
  phone: "",
  wilayat: "",
  village: "",
  caseNo: "",
  charge: "",
  verdict: "",
  extensionDate: "",
  detentionDate: "",
  detentionOrder: "",
  releaseDate: "",
  releaseOrder: "",
};
type Form = typeof EMPTY;
type FieldName = keyof Form;
const PERSON_FIELDS = ["civilId", "name", "nationality", "dob", "phone", "wilayat", "village"] as const;
const CASE_FIELDS = ["caseNo", "charge", "verdict", "extensionDate", "detentionDate", "detentionOrder", "releaseDate", "releaseOrder"] as const;

type Mode = "new" | "view" | "edit";
type Row = { key: number; error?: string };
type ApptRow = store.Appointment & Row;

let seq = 0;
const nextKey = () => ++seq;
const withKeys = <T extends object>(rows: T[]) => rows.map((r) => ({ ...r, key: nextKey() }));
const blankAppt = (): ApptRow => ({ key: nextKey(), type: "", date: "", time: "", notes: "", alert: true });
const blankAtt = (): AttRow => ({ key: nextKey(), type: "", fileName: "", fileType: "", size: 0, blob: null });

const APPT_COLUMNS: Column<ApptRow>[] = [
  { key: "type", label: "نوع الموعد", type: "select", options: APPT_TYPES },
  { key: "date", label: "التاريخ", type: "date" },
  { key: "time", label: "الوقت", type: "time" },
  { key: "notes", label: "ملاحظات / المكان" },
  { key: "alert", label: "التنبيه", type: "check" },
];

const pick = <K extends string>(src: Partial<Record<K, unknown>> | undefined, keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, String(src?.[k] ?? "").trim()])) as Record<K, string>;

// A row counts as filled once any of its own fields is set (the alert box is on by default).
const filled = (r: object) => Object.entries(r).some(([k, v]) => !["key", "error", "alert"].includes(k) && v);

function BlobImg({ blob, alt }: { blob: Blob; alt: string }) {
  const ref = useCallback(
    (el: HTMLImageElement | null) => {
      if (!el) return;
      const url = URL.createObjectURL(blob);
      el.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [blob],
  );
  // eslint-disable-next-line @next/next/no-img-element -- a local blob, nothing for next/image to optimize
  return <img ref={ref} alt={alt} />;
}

export default function CaseSystem() {
  const { toast, toastView } = useToasts();
  const { confirm, confirmView } = useConfirm();

  const [ready, setReady] = useState(false);
  const [persons, setPersons] = useState(() => new Map<string, store.Person>());
  const [cases, setCases] = useState<store.Case[]>([]);
  const [unanswered, setUnanswered] = useState(0);
  const [usage, setUsage] = useState("");

  const [mode, setMode] = useState<Mode>("new");
  const [current, setCurrent] = useState<store.Case | null>(null);
  // Whose photo and basic data are in the form, so a civil number that belongs to someone
  // else is never saved over them.
  const [loadedCivilId, setLoadedCivilId] = useState("");
  const [form, setForm] = useState<Form>(EMPTY);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [appts, setAppts] = useState<ApptRow[]>([]);
  const [atts, setAtts] = useState<AttRow[]>(() => [blankAtt()]);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searchField, setSearchField] = useState("all");
  const [query, setQuery] = useState("");
  const [photoDrag, setPhotoDrag] = useState(false);
  const [printedAt, setPrintedAt] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const ro = mode === "view";

  const reload = useCallback(async () => {
    const d = await store.loadAll();
    setPersons(d.persons);
    setCases(d.cases);
    setUnanswered(d.contacts.filter((c) => c.answered === "لم يرد").length);
    navigator.storage
      ?.estimate?.()
      .then((e) => e.usage != null && setUsage(`المساحة المستخدمة: ${fmtSize(e.usage)}`))
      .catch(() => {});
    return d;
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    store
      .openDB(() => toast("نافذة أخرى من النظام مفتوحة — أغلقها لإكمال تحديث قاعدة البيانات", "warn", 10000))
      .then(reload)
      .then((d) => {
        const n = dueItems(d.cases, d.persons).filter((i) => i.n <= 0).length;
        if (n) toast(`لديك ${n} ${n === 1 ? "موعد مستحق" : "مواعيد مستحقة"} اليوم أو متأخرة — راجع جرس التنبيه`, "warn", 7000);
      })
      .catch((e) => toast("تعذر فتح قاعدة البيانات المحلية: " + errMsg(e), "error", 8000))
      .finally(() => setReady(true));
  }, [reload, toast]);

  const records = useMemo(
    () => cases.map((c) => ({ c, p: persons.get(c.civilId) })).sort((a, b) => b.c.updatedAt.localeCompare(a.c.updatedAt)),
    [cases, persons],
  );
  const due = useMemo(() => dueItems(cases, persons), [cases, persons]);
  const results = useMemo(() => {
    const q = norm(query);
    if (!q) return records.slice(0, 6);
    const keys = searchField === "all" ? ["civilId", "name", "caseNo", "phone", "wilayat", "village"] : [searchField];
    return records.filter(({ c, p }) => {
      const hay: Record<string, string> = {
        civilId: c.civilId,
        caseNo: c.caseNo,
        name: p?.name ?? "",
        phone: p?.phone ?? "",
        wilayat: p?.wilayat ?? "",
        village: p?.village ?? "",
      };
      return keys.some((k) => norm(hay[k]).includes(q));
    });
  }, [records, query, searchField]);
  const stats = useMemo(() => {
    const s = { detained: 0, released: 0, pending: 0 };
    for (const c of cases) {
      const k = statusOf(c).key;
      if (k !== "none") s[k]++;
      s.pending += c.attachments.filter((a) => !a.blob).length;
    }
    return s;
  }, [cases]);

  // Ctrl+S, the unsaved-changes warning and print time read the latest state through a ref.
  const latest = useRef({ mode, dirty, save });
  useEffect(() => {
    latest.current = { mode, dirty, save };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
        e.preventDefault();
        if (latest.current.mode !== "view") latest.current.save();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (latest.current.dirty) e.preventDefault();
    };
    // a file dropped outside the drop zones must not navigate away from the form
    const stop = (e: Event) => e.preventDefault();
    const onPrint = () => flushSync(() => setPrintedAt(fmtDateTime(new Date().toISOString())));
    document.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    window.addEventListener("beforeprint", onPrint);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
      window.removeEventListener("beforeprint", onPrint);
    };
  }, []);

  function markDirty() {
    if (mode !== "view") setDirty(true);
  }

  function setField(name: FieldName, value: string) {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
    markDirty();
  }

  function rowsApi<R extends Row>(setRows: Dispatch<SetStateAction<R[]>>) {
    return {
      onUpdate: (key: number, patch: Partial<R>) => {
        setRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch, error: "" } : r)));
        markDirty();
      },
      onRemove: (key: number) => {
        setRows((rows) => rows.filter((r) => r.key !== key));
        markDirty();
      },
    };
  }

  function addRow<R>(setRows: Dispatch<SetStateAction<R[]>>, row: R) {
    setRows((rows) => [...rows, row]);
    markDirty();
  }

  function fill(c: store.Case, p: store.Person | undefined) {
    setForm({ ...pick(p, PERSON_FIELDS), ...pick(c, CASE_FIELDS), civilId: c.civilId });
    setPhoto(p?.photo ?? null);
    setAppts(withKeys(c.appointments));
    setAtts(withKeys(c.attachments));
    setCurrent(c);
    setLoadedCivilId(c.civilId);
    setErrors({});
    setDirty(false);
  }

  function clearForm() {
    setForm(EMPTY);
    setPhoto(null);
    setAppts([]);
    setAtts([blankAtt()]);
    setCurrent(null);
    setLoadedCivilId("");
    setErrors({});
    setDirty(false);
    setMode("new");
  }

  const confirmDiscard = () =>
    dirty
      ? confirm("توجد تغييرات غير محفوظة على النموذج الحالي. هل تريد تجاهلها والمتابعة؟", {
          title: "تغييرات غير محفوظة",
          okText: "تجاهل التغييرات",
          danger: true,
        })
      : Promise.resolve(true);
  const scrollToCase = () => document.getElementById("case")?.scrollIntoView({ behavior: "smooth" });
  const focusField = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

  async function onNew() {
    if (!(await confirmDiscard())) return;
    clearForm();
    scrollToCase();
    focusField("civilId");
  }

  async function openCase(id: number) {
    if (id === current?.id && mode !== "new") return scrollToCase();
    if (!(await confirmDiscard())) return;
    const c = cases.find((x) => x.id === id);
    if (!c) return toast("تعذر العثور على السجل", "error");
    fill(c, persons.get(c.civilId));
    setMode("view");
    scrollToCase();
  }

  async function cancelEdit() {
    const ok =
      !dirty ||
      (await confirm("سيتم تجاهل التعديلات غير المحفوظة. هل تريد المتابعة؟", {
        title: "إلغاء التعديل",
        okText: "تجاهل التعديلات",
        danger: true,
      }));
    if (!ok) return;
    const c = cases.find((x) => x.id === current?.id);
    if (!c) return clearForm();
    fill(c, persons.get(c.civilId));
    setMode("view");
  }

  async function deleteCurrent() {
    if (current?.id == null) return;
    const id = current.id;
    const last = !cases.some((c) => c.id !== id && c.civilId === current.civilId);
    const ok = await confirm(
      `هل أنت متأكد من حذف القضية رقم «${current.caseNo}» الخاصة بـ «${persons.get(current.civilId)?.name ?? ""}» مع جميع مواعيدها ومرفقاتها؟` +
        (last ? " ولأنها آخر قضية لهذا الشخص ستُحذف أيضاً بياناته وصورته." : "") +
        " لا يمكن التراجع عن هذه العملية.",
      { title: "تأكيد الحذف", okText: "نعم، احذف", danger: true },
    );
    if (!ok) return;
    try {
      await store.deleteCase(id);
      clearForm();
      await reload();
      toast("تم حذف القضية وجميع مرفقاتها", "success");
    } catch (e) {
      toast("تعذر الحذف: " + errMsg(e), "error");
    }
  }

  function newForSamePerson() {
    setForm({ ...EMPTY, ...pick(form, PERSON_FIELDS) });
    setAppts([]);
    setAtts([blankAtt()]);
    setCurrent(null);
    setErrors({});
    setDirty(true);
    setMode("new");
    focusField("caseNo");
    toast("تم نسخ البيانات الأساسية للمتهم — أدخل بيانات القضية الجديدة", "info");
  }

  function loadPerson(p: store.Person) {
    setForm((f) => ({ ...f, ...pick(p, PERSON_FIELDS) }));
    setPhoto(p.photo);
    setLoadedCivilId(p.civilId);
    setDirty(true);
    toast(`الرقم المدني مسجل مسبقاً باسم «${p.name}» — تم تحميل بياناته الأساسية`, "info", 5000);
  }

  function onCivilBlur() {
    if (ro) return;
    const id = toLatinDigits(form.civilId).trim();
    if (id !== form.civilId) setField("civilId", id);
    const p = persons.get(id);
    if (p && id !== loadedCivilId) loadPerson(p);
  }

  function pickPhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("الملف المختار ليس صورة", "error");
    setPhoto(file);
    markDirty();
  }

  function addFiles(files: File[]) {
    setAtts((rows) => {
      const next = [...rows];
      for (const f of files) {
        const data = { blob: f, fileName: f.name, fileType: f.type, size: f.size, error: "" };
        const i = next.findIndex((a) => !a.blob);
        if (i >= 0) next[i] = { ...next[i], ...data };
        else next.push({ ...blankAtt(), ...data });
      }
      return next;
    });
    markDirty();
    toast(files.length === 1 ? "تمت إضافة الملف — حدد نوع المستند" : `تمت إضافة ${files.length} ملفات — حدد نوع كل مستند`, "info");
  }

  function validate() {
    const t = todayStr();
    const f = form;
    const errs: Partial<Record<FieldName, string>> = {};
    const civil = toLatinDigits(f.civilId).trim();
    if (!civil) errs.civilId = "هذا الحقل مطلوب";
    else if (!/^\d{4,15}$/.test(civil)) errs.civilId = "الرقم المدني يتكون من أرقام فقط";
    if (!f.name.trim()) errs.name = "هذا الحقل مطلوب";
    if (f.dob && f.dob > t) errs.dob = "تاريخ الميلاد لا يمكن أن يكون في المستقبل";
    if (f.phone.trim() && !/^\+?[\d\s-]{6,20}$/.test(toLatinDigits(f.phone.trim()))) errs.phone = "رقم الهاتف غير صحيح — أرقام فقط";
    if (!f.caseNo.trim()) errs.caseNo = "هذا الحقل مطلوب";
    if (f.detentionDate && f.extensionDate && f.extensionDate < f.detentionDate)
      errs.extensionDate = "تاريخ تمديد الحجز لا يمكن أن يسبق تاريخ الحجز";
    if (f.detentionDate && f.releaseDate && f.releaseDate < f.detentionDate)
      errs.releaseDate = "تاريخ الإفراج لا يمكن أن يسبق تاريخ الحجز";

    const a2 = appts.map((a) => ({ ...a, error: filled(a) && (!a.type || !a.date) ? "حدد نوع الموعد وتاريخه" : "" }));
    const t2 = atts.map((a) => ({ ...a, error: a.blob && !a.type ? "يرجى تحديد نوع المستند" : "" }));
    setErrors(errs);
    setAppts(a2);
    setAtts(t2);

    const first = Object.keys(errs)[0];
    if (first) {
      const el = document.getElementById(first);
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      toast("يرجى تصحيح الحقول المظللة باللون الأحمر", "error");
      return null;
    }
    const badTable = [a2, t2].findIndex((rows) => rows.some((r) => r.error));
    if (badTable >= 0) {
      document.getElementById(["appointments", "attachments"][badTable])?.scrollIntoView({ block: "start", behavior: "smooth" });
      toast("يرجى إكمال بيانات الصفوف المظللة باللون الأحمر", "error");
      return null;
    }
    return { civil, appts: a2, atts: t2 };
  }

  async function save() {
    if (mode === "view" || saving) return;
    const v = validate();
    if (!v) return;
    const known = persons.get(v.civil);
    if (known && v.civil !== loadedCivilId) {
      loadPerson(known); // never save this form's person over someone already registered
      return;
    }
    const dup = cases.find((c) => c.id !== current?.id && c.civilId === v.civil && norm(c.caseNo) === norm(form.caseNo));
    if (
      dup &&
      !(await confirm(`يوجد سجل محفوظ مسبقاً بنفس رقم القضية «${form.caseNo}» لنفس الرقم المدني. هل تريد الحفظ على أي حال؟`, {
        title: "سجل مكرر",
        okText: "حفظ على أي حال",
      }))
    )
      return;

    const now = new Date().toISOString();
    const person: store.Person = {
      ...pick(form, PERSON_FIELDS),
      civilId: v.civil,
      photo,
      createdAt: known?.createdAt || now,
      updatedAt: now,
    };
    const kase: store.Case = {
      ...(current?.id != null && { id: current.id }),
      ...pick(form, CASE_FIELDS),
      civilId: v.civil,
      appointments: v.appts
        .filter((a) => a.type && a.date)
        .map((a) => ({ ...pick(a, ["type", "date", "time", "notes"]), alert: a.alert })),
      attachments: v.atts
        .filter((a) => a.type || a.blob)
        .map(({ type, fileName, fileType, size, blob }) => ({ type, fileName, fileType, size, blob })),
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };

    setSaving(true);
    try {
      const id = await store.saveCase(person, kase, current?.civilId);
      const d = await reload();
      const saved = d.cases.find((c) => c.id === id);
      if (saved) fill(saved, d.persons.get(saved.civilId));
      setMode("view");
      toast(current ? "تم حفظ التعديلات بنجاح" : "تم حفظ بيانات القضية وكافة المرفقات بنجاح", "success");
    } catch (e) {
      toast(
        e instanceof DOMException && e.name === "QuotaExceededError"
          ? "مساحة التخزين ممتلئة — احذف بعض المرفقات الكبيرة"
          : "تعذر الحفظ: " + errMsg(e),
        "error",
        6000,
      );
    } finally {
      setSaving(false);
    }
  }

  async function doExport() {
    if (!cases.length) return toast("لا توجد قضايا لتصديرها", "warn");
    setBusy(true);
    try {
      downloadBlob(await store.exportBackup(), `نسخة-احتياطية-القضايا-${todayStr()}.json`);
      toast(`تم تصدير ${cases.length} قضية`, "success");
    } catch (e) {
      toast("تعذر التصدير: " + errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function doImport(file: File) {
    try {
      const data = await store.readBackup(file);
      const ok = await confirm(
        `سيتم استيراد ${data.cases.length} قضية من النسخة الاحتياطية. القضايا التي لها نفس المعرّف والأشخاص بنفس الرقم المدني سيتم استبدالهم بالنسخة المستوردة. هل تريد المتابعة؟`,
        { title: "استيراد نسخة احتياطية", okText: "استيراد" },
      );
      if (!ok) return;
      await store.importBackup(data.persons, data.cases, data.contacts);
      const d = await reload();
      const c = mode === "view" ? d.cases.find((x) => x.id === current?.id) : undefined;
      if (c) fill(c, d.persons.get(c.civilId));
      toast(`تم استيراد ${data.cases.length} قضية بنجاح`, "success");
    } catch (e) {
      toast("تعذر الاستيراد: " + errMsg(e), "error");
    }
  }

  async function signOut() {
    if (await confirmDiscard()) await logout();
  }

  function onFormKeyDown(e: ReactKeyboardEvent<HTMLFormElement>) {
    const t = e.target as HTMLInputElement;
    if (e.key !== "Enter" || t.tagName !== "INPUT" || t.type === "file") return;
    e.preventDefault();
    const list = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(
        "input:not([type=file]):not([readonly]), textarea:not([readonly]), select:not(:disabled)",
      ),
    ).filter((el) => el.offsetParent);
    list[list.indexOf(t) + 1]?.focus();
  }

  const onPhotoDrag = (e: DragEvent) => {
    if (ro || !hasFiles(e)) return;
    e.preventDefault();
    setPhotoDrag(true);
  };
  const photoClick = () => {
    if (photo) openBlob(photo, "photo");
    else if (!ro) photoInput.current?.click();
  };

  if (!ready) return <div className="page-loading">جاري التحميل...</div>;

  const t = todayStr();
  const status = statusOf(form);
  const civil = toLatinDigits(form.civilId).trim();
  const otherCases = civil ? cases.filter((c) => c.id !== current?.id && c.civilId === civil).length : 0;
  const ageHint = form.dob && form.dob <= t ? `العمر: ${ageFrom(form.dob)} سنة` : "";
  const detHint = (() => {
    const det = form.detentionDate;
    const rel = form.releaseDate;
    if (!det) return "";
    if (rel && rel >= det && rel <= t) {
      const n = daysBetween(det, rel);
      return n ? `مدة الحجز: ${daysText(n)}` : "تم الإفراج في نفس يوم الحجز";
    }
    const n = daysBetween(det, t);
    const since = n > 0 ? `محتجز منذ ${daysText(n)}` : n === 0 ? "محتجز منذ اليوم" : "تاريخ الحجز في المستقبل";
    return rel > t ? `${since} · الإفراج بعد ${daysText(daysBetween(t, rel))}` : since;
  })();
  const filesIn = atts.filter((a) => a.blob);
  const pendingDocs = atts.filter((a) => a.type && !a.blob).length;
  const filesSize = filesIn.reduce((s, a) => s + (a.size || 0), 0);

  const field = (
    name: FieldName,
    label: string,
    o: { req?: boolean; type?: string; area?: boolean; list?: string; hint?: ReactNode; span?: boolean; max?: string; numeric?: boolean; onBlur?: () => void } = {},
  ) => (
    <div className={`field${o.span ? " span3" : ""}${errors[name] ? " invalid" : ""}`}>
      <label htmlFor={name}>
        {label} {o.req && <span className="req">*</span>}
      </label>
      {o.area ? (
        <textarea id={name} value={form[name]} readOnly={ro} onChange={(e) => setField(name, e.target.value)} />
      ) : (
        <input
          id={name}
          type={o.type ?? "text"}
          value={form[name]}
          readOnly={ro}
          list={o.list}
          max={o.max}
          inputMode={o.numeric ? "numeric" : o.type === "tel" ? "tel" : undefined}
          className={o.type === "date" && !form[name] ? "is-empty" : undefined}
          onChange={(e) => setField(name, e.target.value)}
          onBlur={o.onBlur}
        />
      )}
      {errors[name] && <div className="err">{errors[name]}</div>}
      {o.hint && <div className="hint">{o.hint}</div>}
    </div>
  );

  return (
    <div className="shell">
      <Sidebar active="cases" dueCount={due.length} onLogout={signOut} />

      <div className="page">
        <main className="card main-card" id="case" data-mode={mode}>
          <header className="app-header">
            <div className="header-tools">
              <Bell items={due} onOpen={openCase} />
            </div>
            <div className="logo-wrap">
              <Image src={logo} alt="شعار شرطة عمان السلطانية" priority />
            </div>
            <h1>نظام إدارة بيانات القضايا والوثائق</h1>
            <p className="org">شرطة عُمان السلطانية</p>
            <div className="header-line" />
            <div className="mode-bar">
              <span className={`badge ${mode}`}>
                {mode === "new" ? "إدخال قضية جديدة" : `${ro ? "عرض" : "تعديل"} القضية رقم ${current?.caseNo ?? ""}`}
              </span>
              {status.key !== "none" && <span className={`badge ${status.key}`}>{status.text}</span>}
              {dirty && <span className="badge dirty">● تغييرات غير محفوظة</span>}
              {current && (
                <span className="meta">
                  أُنشئت: {fmtDateTime(current.createdAt)} · آخر تحديث: {fmtDateTime(current.updatedAt)}
                </span>
              )}
            </div>
          </header>

          {/* ===== Search (right) + Photo (left, above nationality) ===== */}
          <section className="top-row">
            <div className="panel search-panel" id="search">
              <h3 className="panel-title">
                <Icon name="search" /> البحث عن المعلومات
              </h3>
              <div className="search-row">
                <select value={searchField} onChange={(e) => setSearchField(e.target.value)} aria-label="البحث في">
                  <option value="all">البحث في: الكل</option>
                  <option value="civilId">الرقم المدني</option>
                  <option value="name">الاسم</option>
                  <option value="caseNo">رقم القضية</option>
                  <option value="phone">رقم الهاتف</option>
                </select>
                <div className="search-input">
                  <Icon name="search" />
                  <input
                    type="search"
                    value={query}
                    placeholder="ابحث بالاسم أو الرقم المدني أو رقم القضية..."
                    autoComplete="off"
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && results[0]) {
                        e.preventDefault();
                        openCase(results[0].c.id!);
                      }
                      if (e.key === "Escape") setQuery("");
                    }}
                  />
                </div>
              </div>
              {results.length > 0 && (
                <div className="results-head">{query.trim() ? `نتائج البحث (${results.length})` : "آخر القضايا المحدّثة"}</div>
              )}
              <div className="results">
                {results.length ? (
                  results.slice(0, 50).map(({ c, p }) => {
                    const st = statusOf(c);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`result${c.id === current?.id ? " current" : ""}`}
                        onClick={() => openCase(c.id!)}
                      >
                        <span className="r-avatar">{(p?.name || "?").trim().charAt(0)}</span>
                        <span className="r-main">
                          <span className="r-name">{p?.name}</span>
                          <span className="r-meta">
                            قضية: <bdi>{c.caseNo}</bdi> · مدني: <bdi>{c.civilId}</bdi>
                            {p?.phone && (
                              <>
                                {" "}
                                · هاتف: <bdi>{p.phone}</bdi>
                              </>
                            )}
                          </span>
                        </span>
                        <span className={`badge sm ${st.key}`}>{st.text}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="results-empty">
                    {query.trim() ? "لا توجد نتائج مطابقة" : "لا توجد قضايا محفوظة بعد — ابدأ بإدخال قضية جديدة"}
                  </div>
                )}
              </div>
            </div>

            <div className="print-only print-summary">
              <div>
                <b>رقم القضية:</b> <bdi>{form.caseNo || "—"}</bdi>
              </div>
              <div>
                <b>الاسم:</b> {form.name || "—"}
              </div>
              <div>
                <b>الحالة:</b> {status.text}
              </div>
              <div>
                <b>تاريخ الطباعة:</b> {printedAt}
              </div>
            </div>

            <div className="panel photo-panel">
              <h3 className="panel-title">
                <Icon name="camera" /> صورة المتهم
              </h3>
              <div
                className={`photo-frame${photo ? " has-photo" : ""}${photoDrag ? " drag" : ""}`}
                role="button"
                tabIndex={0}
                title={photo ? "انقر لعرض الصورة بالحجم الكامل" : ro ? "" : "انقر أو اسحب صورة هنا"}
                onClick={photoClick}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    photoClick();
                  }
                }}
                onDragEnter={onPhotoDrag}
                onDragOver={onPhotoDrag}
                onDragLeave={() => setPhotoDrag(false)}
                onDrop={(e) => {
                  setPhotoDrag(false);
                  if (ro) return;
                  e.preventDefault();
                  e.stopPropagation();
                  pickPhoto(e.dataTransfer.files[0]);
                }}
              >
                {photo ? (
                  <BlobImg blob={photo} alt="صورة المتهم" />
                ) : (
                  <div className="photo-ph">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
                    </svg>
                    <span>{ro ? "لا توجد صورة" : "انقر أو اسحب الصورة هنا"}</span>
                  </div>
                )}
              </div>
              {!ro && (
                <div className="photo-actions">
                  <label className="btn btn-sm btn-outline">
                    <Icon name="upload" />
                    {photo ? "تغيير الصورة" : "اختيار صورة"}
                    <input
                      ref={photoInput}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        pickPhoto(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {photo && (
                    <button
                      type="button"
                      className="btn btn-sm btn-text-danger"
                      onClick={() => {
                        setPhoto(null);
                        markDirty();
                      }}
                    >
                      <Icon name="trash" />
                      حذف
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          <form
            id="caseForm"
            autoComplete="off"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            onKeyDown={onFormKeyDown}
          >
            <h2 className="section-title">البيانات الأساسية</h2>
            <div className="grid3">
              {field("civilId", "الرقم المدني", {
                req: true,
                numeric: true,
                onBlur: onCivilBlur,
                hint: otherCases ? (
                  <button
                    type="button"
                    className="hint-link"
                    onClick={() => {
                      setSearchField("civilId");
                      setQuery(civil);
                      document.getElementById("search")?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                  >
                    ⚠ {otherCases === 1 ? "توجد قضية أخرى مسجلة" : `توجد ${otherCases} قضايا أخرى مسجلة`} لنفس الرقم المدني — عرض
                  </button>
                ) : null,
              })}
              {field("name", "الاسم", { req: true })}
              {field("nationality", "الجنسية", { list: "dl-nat" })}
              {field("dob", "تاريخ الميلاد", { type: "date", max: t, hint: ageHint })}
              {field("phone", "رقم الهاتف", { type: "tel" })}
              {field("wilayat", "الولاية", { list: "dl-wil" })}
              {field("village", "القرية")}
              {field("caseNo", "رقم القضية", { req: true })}
            </div>

            <h2 className="section-title">تفاصيل التهمة والإجراءات</h2>
            <div className="grid3">
              {field("charge", "التهمة", { area: true, span: true })}
              {field("verdict", "منطوق الحكم", { area: true, span: true })}
              {field("extensionDate", "تاريخ تمديد الحجز", { type: "date" })}
              {field("detentionDate", "تاريخ الحجز", { type: "date", hint: detHint })}
              {field("detentionOrder", "الأمر بالحجز")}
              {field("releaseDate", "تاريخ الإفراج", { type: "date" })}
              {field("releaseOrder", "الأمر بالإفراج")}
            </div>

            <div className="section-head" id="appointments">
              <h2 className="section-title">المواعيد والتنبيه</h2>
              {!ro && (
                <button type="button" className="btn btn-success" onClick={() => addRow(setAppts, blankAppt())}>
                  <Icon name="plus" /> إضافة موعد
                </button>
              )}
            </div>
            <RowTable
              rows={appts}
              columns={APPT_COLUMNS}
              readOnly={ro}
              empty={ro ? "لا توجد مواعيد لهذه القضية" : "لا توجد مواعيد — اضغط «إضافة موعد»"}
              {...rowsApi(setAppts)}
            />
            <div className="att-foot">
              <span>المواعيد المفعّل تنبيهها تظهر في جرس التنبيه قبل موعدها بأسبوع، وتبقى فيه إذا تأخرت حتى يُلغى تنبيهها.</span>
            </div>

            <div className="section-head" id="attachments">
              <h2 className="section-title">جدول مرفقات القضية</h2>
              {!ro && (
                <button type="button" className="btn btn-success" onClick={() => addRow(setAtts, blankAtt())}>
                  <Icon name="plus" /> إضافة مستند جديد
                </button>
              )}
            </div>
            <AttachmentsTable rows={atts} types={DOC_TYPES} readOnly={ro} onDropFiles={addFiles} {...rowsApi(setAtts)} />
            <div className="att-foot">
              <span>
                الملفات المرفقة: {filesIn.length}
                {pendingDocs > 0 && ` · بانتظار الإرفاق: ${pendingDocs}`}
                {filesSize > 0 && ` · الحجم: ${fmtSize(filesSize)}`}
              </span>
              {!ro && <span>يمكنك سحب الملفات وإفلاتها على الجدول مباشرة · نوع المستند بدون ملف يُحفظ «بانتظار الإرفاق»</span>}
            </div>
          </form>

          {/* ===== Actions: CRUD (right) + Save (left) ===== */}
          <div className="action-bar">
            <div className="crud">
              <button type="button" className="btn btn-success" onClick={onNew}>
                <Icon name="plus" /> إضافة جديد
              </button>
              <button
                type="button"
                className="btn btn-warning"
                disabled={mode !== "view"}
                onClick={() => {
                  setMode("edit");
                  focusField("civilId");
                }}
              >
                <Icon name="edit" /> تعديل
              </button>
              <button type="button" className="btn btn-danger" disabled={mode === "new"} onClick={deleteCurrent}>
                <Icon name="trash" /> حذف
              </button>
              {mode === "edit" && (
                <button type="button" className="btn btn-outline" onClick={cancelEdit}>
                  <Icon name="undo" /> إلغاء التعديل
                </button>
              )}
              {mode === "view" && (
                <button type="button" className="btn btn-outline" onClick={newForSamePerson}>
                  <Icon name="user-plus" /> قضية جديدة لنفس المتهم
                </button>
              )}
              <button type="button" className="btn btn-outline" onClick={() => window.print()}>
                <Icon name="print" /> طباعة
              </button>
            </div>
            <div className="save-wrap">
              <button type="submit" form="caseForm" className="btn btn-primary btn-lg" disabled={ro || saving}>
                <Icon name="save" className={saving ? "spin" : undefined} />
                <span>{saving ? "جاري الحفظ..." : "حفظ البيانات وكافة المرفقات"}</span>
              </button>
              {!ro && (
                <div className="shortcut">
                  اختصار: <kbd>Ctrl + S</kbd>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* ===== Saved records ===== */}
        <section className="card records-card" id="records">
          <div className="records-head">
            <h2 className="section-title">
              سجل القضايا المحفوظة <span className="count">{cases.length}</span>
            </h2>
            <div className="tools">
              <button type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={doExport}>
                <Icon name="download" /> تصدير نسخة احتياطية
              </button>
              <label className="btn btn-sm btn-outline">
                <Icon name="archive" /> استيراد نسخة احتياطية
                <input
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) doImport(f);
                  }}
                />
              </label>
            </div>
          </div>
          <div className="stats">
            <div className="stat">
              <b>{cases.length}</b>
              <span>إجمالي القضايا</span>
            </div>
            <div className="stat danger">
              <b>{stats.detained}</b>
              <span>محتجزون حالياً</span>
            </div>
            <div className="stat success">
              <b>{stats.released}</b>
              <span>مُفرج عنهم</span>
            </div>
            <div className="stat warn">
              <b>{stats.pending}</b>
              <span>مستندات بانتظار الإرفاق</span>
            </div>
            <a href="/contacts" className="stat warn" title="فتح سجل المتصلين بهم">
              <b>{unanswered}</b>
              <span>متصلون لم يردوا</span>
            </a>
          </div>
          <div className="table-wrap">
            <table className="rec-table">
              <thead>
                <tr>
                  <th className="col-n">ت</th>
                  <th>رقم القضية</th>
                  <th>الاسم</th>
                  <th>الرقم المدني</th>
                  <th>الجنسية</th>
                  <th>تاريخ الحجز</th>
                  <th>الحالة</th>
                  <th>المرفقات</th>
                  <th>آخر تحديث</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={9}>لا توجد قضايا محفوظة بعد</td>
                  </tr>
                ) : (
                  records.map(({ c, p }, i) => {
                    const st = statusOf(c);
                    const files = c.attachments.filter((a) => a.blob).length;
                    const pending = c.attachments.length - files;
                    return (
                      <tr
                        key={c.id}
                        data-id={c.id}
                        tabIndex={0}
                        className={c.id === current?.id ? "current" : undefined}
                        onClick={() => openCase(c.id!)}
                        onKeyDown={(e) => e.key === "Enter" && openCase(c.id!)}
                      >
                        <td className="col-n">{i + 1}</td>
                        <td>
                          <b>
                            <bdi>{c.caseNo}</bdi>
                          </b>
                        </td>
                        <td>{p?.name}</td>
                        <td>
                          <bdi>{c.civilId}</bdi>
                        </td>
                        <td>{p?.nationality || "—"}</td>
                        <td>{fmtDate(c.detentionDate)}</td>
                        <td>
                          <span className={`badge sm ${st.key}`}>{st.text}</span>
                        </td>
                        <td>
                          {files}
                          {pending > 0 && <span className="pending sm">+{pending} بانتظار</span>}
                        </td>
                        <td className="muted">{fmtDateTime(c.updatedAt)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="rec-foot">
            <span>انقر على أي قضية لعرضها في النموذج.</span>
            <span>{usage}</span>
          </div>
        </section>

        <p className="footer">البيانات محفوظة محلياً على هذا الجهاز وفي هذا المتصفح — يُنصح بأخذ نسخة احتياطية بشكل دوري.</p>
      </div>

      <datalist id="dl-nat">
        {NATIONALITIES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="dl-wil">
        {Object.entries(GOVERNORATES).flatMap(([g, ws]) =>
          ws.map((w) => (
            <option key={`${g}-${w}`} value={w}>
              {g}
            </option>
          )),
        )}
      </datalist>
      {toastView}
      {confirmView}
    </div>
  );
}
