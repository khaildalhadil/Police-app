"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { logout } from "@/app/actions";
import logo from "@/public/rop-logo.jpg";
import * as store from "@/lib/store";
import { errMsg, fmtDateTime, norm, pad, toLatinDigits } from "@/lib/util";
import { dueItems } from "./bell";
import { useConfirm, useToasts } from "./feedback";
import { Icon } from "./icon";
import { Sidebar } from "./sidebar";

const SELF = "الشخص نفسه";
const RELATIONS = [SELF, "الأب", "الأم", "الأخ", "الأخت", "الزوج", "الزوجة", "الابن", "الابنة", "قريب", "صديق", "محامٍ"];

const EMPTY = { civilId: "", wantedName: "", name: "", phone: "", relation: "", at: "", location: "", answered: "" };
type Form = typeof EMPTY;
type FieldName = keyof Form;
type Mode = "new" | "view" | "edit";

// «now» in the format a datetime-local input takes
const nowLocal = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// المتصلين بهم: its own register, saved and printed apart from the cases.
export default function ContactsPage() {
  const { toast, toastView } = useToasts();
  const { confirm, confirmView } = useConfirm();

  const [ready, setReady] = useState(false);
  const [contacts, setContacts] = useState<store.Contact[]>([]);
  const [persons, setPersons] = useState(() => new Map<string, store.Person>());
  const [dueCount, setDueCount] = useState(0);

  const [mode, setMode] = useState<Mode>("new");
  const [current, setCurrent] = useState<store.Contact | null>(null);
  const [form, setForm] = useState<Form>(() => ({ ...EMPTY, at: nowLocal() }));
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("all");
  const [printedAt, setPrintedAt] = useState("");
  const started = useRef(false);
  const ro = mode === "view";

  const reload = useCallback(async () => {
    const d = await store.loadAll();
    setContacts(d.contacts);
    setPersons(d.persons);
    setDueCount(dueItems(d.cases, d.persons).length);
    return d;
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    store
      .openDB(() => toast("نافذة أخرى من النظام مفتوحة — أغلقها لإكمال تحديث قاعدة البيانات", "warn", 10000))
      .then(reload)
      .catch((e) => toast("تعذر فتح قاعدة البيانات المحلية: " + errMsg(e), "error", 8000))
      .finally(() => setReady(true));
  }, [reload, toast]);

  const rows = useMemo(() => {
    const q = norm(query);
    return [...contacts]
      .sort((a, b) => (b.at || b.updatedAt).localeCompare(a.at || a.updatedAt))
      .filter(
        (c) =>
          (answer === "all" || c.answered === answer) &&
          (!q || [c.civilId, c.wantedName, c.name, c.phone, c.relation, c.location].some((v) => norm(v).includes(q))),
      );
  }, [contacts, query, answer]);
  const unanswered = contacts.filter((c) => c.answered === "لم يرد").length;

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
    const onPrint = () => flushSync(() => setPrintedAt(fmtDateTime(new Date().toISOString())));
    document.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("beforeprint", onPrint);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("beforeprint", onPrint);
    };
  }, []);

  function setField(name: FieldName, value: string) {
    setForm((f) => {
      const next = { ...f, [name]: value };
      // «الشخص نفسه»: the caller is the wanted person
      if (name === "relation" && value === SELF && !f.name.trim()) next.name = f.wantedName;
      return next;
    });
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
    if (mode !== "view") setDirty(true);
  }

  function onCivilBlur() {
    if (ro) return;
    const id = toLatinDigits(form.civilId).trim();
    const p = persons.get(id);
    setForm((f) => ({ ...f, civilId: id, wantedName: p ? p.name : f.wantedName }));
  }

  function fill(c: store.Contact) {
    setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, c[k as FieldName] ?? ""])) as Form);
    setCurrent(c);
    setErrors({});
    setDirty(false);
    setMode("view");
  }

  function clearForm() {
    setForm({ ...EMPTY, at: nowLocal() });
    setCurrent(null);
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
  const toForm = () => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  const focusField = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

  async function onNew() {
    if (!(await confirmDiscard())) return;
    clearForm();
    toForm();
    focusField("civilId");
  }

  async function open(c: store.Contact) {
    if (c.id === current?.id && mode !== "new") return toForm();
    if (!(await confirmDiscard())) return;
    fill(c);
    toForm();
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
    const c = contacts.find((x) => x.id === current?.id);
    if (c) fill(c);
    else clearForm();
  }

  async function remove() {
    if (current?.id == null) return;
    const ok = await confirm(`هل أنت متأكد من حذف سجل الاتصال بـ «${current.name}»؟ لا يمكن التراجع عن هذه العملية.`, {
      title: "تأكيد الحذف",
      okText: "نعم، احذف",
      danger: true,
    });
    if (!ok) return;
    try {
      await store.deleteContact(current.id);
      clearForm();
      await reload();
      toast("تم حذف سجل الاتصال", "success");
    } catch (e) {
      toast("تعذر الحذف: " + errMsg(e), "error");
    }
  }

  function validate() {
    const errs: Partial<Record<FieldName, string>> = {};
    const civil = toLatinDigits(form.civilId).trim();
    if (civil && !/^\d{4,15}$/.test(civil)) errs.civilId = "الرقم المدني يتكون من أرقام فقط";
    if (!form.name.trim()) errs.name = "هذا الحقل مطلوب";
    if (form.phone.trim() && !/^\+?[\d\s-]{6,20}$/.test(toLatinDigits(form.phone.trim()))) errs.phone = "رقم الهاتف غير صحيح — أرقام فقط";
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (!first) return true;
    const el = document.getElementById(first);
    el?.focus();
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    toast("يرجى تصحيح الحقول المظللة باللون الأحمر", "error");
    return false;
  }

  async function save() {
    if (mode === "view" || saving || !validate()) return;
    const now = new Date().toISOString();
    const trimmed = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as Form;
    const contact: store.Contact = {
      ...(current?.id != null && { id: current.id }),
      ...trimmed,
      civilId: toLatinDigits(trimmed.civilId),
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    setSaving(true);
    try {
      const id = await store.saveContact(contact);
      const d = await reload();
      const saved = d.contacts.find((c) => c.id === id);
      if (saved) fill(saved);
      toast(current ? "تم حفظ التعديلات بنجاح" : "تم حفظ بيانات المتصل بنجاح", "success");
    } catch (e) {
      toast("تعذر الحفظ: " + errMsg(e), "error", 6000);
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    if (await confirmDiscard()) await logout();
  }

  function onFormKeyDown(e: ReactKeyboardEvent<HTMLFormElement>) {
    const t = e.target as HTMLInputElement;
    if (e.key !== "Enter" || t.tagName !== "INPUT") return;
    e.preventDefault();
    const list = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>("input:not([readonly]), select:not(:disabled)"),
    ).filter((el) => el.offsetParent);
    list[list.indexOf(t) + 1]?.focus();
  }

  if (!ready) return <div className="page-loading">جاري التحميل...</div>;

  const known = persons.get(toLatinDigits(form.civilId).trim());

  const field = (
    name: FieldName,
    label: string,
    o: { req?: boolean; type?: string; list?: string; hint?: ReactNode; numeric?: boolean; onBlur?: () => void } = {},
  ) => (
    <div className={`field${errors[name] ? " invalid" : ""}`}>
      <label htmlFor={name}>
        {label} {o.req && <span className="req">*</span>}
      </label>
      <input
        id={name}
        type={o.type ?? "text"}
        value={form[name]}
        readOnly={ro}
        list={o.list}
        inputMode={o.numeric ? "numeric" : o.type === "tel" ? "tel" : undefined}
        onChange={(e) => setField(name, e.target.value)}
        onBlur={o.onBlur}
      />
      {errors[name] && <div className="err">{errors[name]}</div>}
      {o.hint && <div className="hint">{o.hint}</div>}
    </div>
  );

  return (
    <div className="shell contacts-page">
      <Sidebar active="contacts" dueCount={dueCount} onLogout={signOut} />

      <div className="page">
        <main className="card main-card contacts-form" id="contact" data-mode={mode}>
          <header className="app-header">
            <div className="logo-wrap">
              <Image src={logo} alt="شعار شرطة عمان السلطانية" priority />
            </div>
            <h1>سجل المتصلين بهم</h1>
            <p className="org">شرطة عُمان السلطانية</p>
            <div className="header-line" />
            <div className="mode-bar">
              <span className={`badge ${mode}`}>
                {mode === "new" ? "تسجيل متصل جديد" : `${ro ? "عرض" : "تعديل"} بيانات المتصل`}
              </span>
              {form.answered && (
                <span className={`badge ${form.answered === "لم يرد" ? "unanswered" : "answered"}`}>{form.answered}</span>
              )}
              {dirty && <span className="badge dirty">● تغييرات غير محفوظة</span>}
              {current && (
                <span className="meta">
                  أُضيف: {fmtDateTime(current.createdAt)} · آخر تحديث: {fmtDateTime(current.updatedAt)}
                </span>
              )}
            </div>
          </header>

          <form
            id="contactForm"
            autoComplete="off"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            onKeyDown={onFormKeyDown}
          >
            <h2 className="section-title">المطلوب</h2>
            <div className="grid3">
              {field("civilId", "الرقم المدني", {
                numeric: true,
                onBlur: onCivilBlur,
                hint: known && !ro ? `مسجل في النظام باسم «${known.name}»` : "",
              })}
              {field("wantedName", "اسم المطلوب")}
            </div>

            <h2 className="section-title">بيانات المتصل</h2>
            <div className="grid3">
              {field("name", "الاسم الثلاثي", { req: true })}
              {field("phone", "رقم الهاتف", { type: "tel" })}
              {field("relation", "الصلة", { list: "dl-rel" })}
              {field("at", "التاريخ والوقت", { type: "datetime-local" })}
              {field("location", "موقع المطلوب")}
              <div className="field">
                <label htmlFor="answered">الرد</label>
                <select id="answered" value={form.answered} disabled={ro} onChange={(e) => setField("answered", e.target.value)}>
                  <option value="">—</option>
                  <option>رد</option>
                  <option>لم يرد</option>
                </select>
              </div>
            </div>
          </form>

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
              <button type="button" className="btn btn-danger" disabled={mode === "new"} onClick={remove}>
                <Icon name="trash" /> حذف
              </button>
              {mode === "edit" && (
                <button type="button" className="btn btn-outline" onClick={cancelEdit}>
                  <Icon name="undo" /> إلغاء التعديل
                </button>
              )}
              <button type="button" className="btn btn-outline" onClick={() => window.print()}>
                <Icon name="print" /> طباعة القائمة
              </button>
            </div>
            <div className="save-wrap">
              <button type="submit" form="contactForm" className="btn btn-primary btn-lg" disabled={ro || saving}>
                <Icon name="save" className={saving ? "spin" : undefined} />
                <span>{saving ? "جاري الحفظ..." : "حفظ بيانات المتصل"}</span>
              </button>
              {!ro && (
                <div className="shortcut">
                  اختصار: <kbd>Ctrl + S</kbd>
                </div>
              )}
            </div>
          </div>
        </main>

        <section className="card contacts-list" id="list">
          <div className="print-only print-head">
            <Image src={logo} alt="" width={64} />
            <div>
              <b>شرطة عُمان السلطانية — سجل المتصلين بهم</b>
              <span>تاريخ الطباعة: {printedAt}</span>
            </div>
          </div>
          <div className="records-head">
            <h2 className="section-title">
              قائمة المتصلين بهم <span className="count">{rows.length}</span>
            </h2>
            <div className="tools no-print">
              <div className="search-input">
                <Icon name="search" />
                <input
                  type="search"
                  value={query}
                  placeholder="ابحث بالاسم أو الرقم المدني أو الهاتف..."
                  autoComplete="off"
                  aria-label="البحث في المتصلين بهم"
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                />
              </div>
              <select value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="تصفية حسب الرد">
                <option value="all">الرد: الكل</option>
                <option>لم يرد</option>
                <option>رد</option>
              </select>
            </div>
          </div>
          <div className="table-wrap">
            <table className="rec-table">
              <thead>
                <tr>
                  <th className="col-n">ت</th>
                  <th>المطلوب</th>
                  <th>الاسم الثلاثي</th>
                  <th>الصلة</th>
                  <th>رقم الهاتف</th>
                  <th>التاريخ والوقت</th>
                  <th>موقع المطلوب</th>
                  <th>الرد</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={8}>
                      {contacts.length ? "لا توجد نتائج مطابقة" : "لا يوجد متصلين بهم بعد — سجّل أول متصل من النموذج أعلاه"}
                    </td>
                  </tr>
                ) : (
                  rows.map((c, i) => (
                    <tr
                      key={c.id}
                      data-id={c.id}
                      tabIndex={0}
                      className={[c.id === current?.id && "current", c.answered === "لم يرد" && "row-warn"].filter(Boolean).join(" ") || undefined}
                      onClick={() => open(c)}
                      onKeyDown={(e) => e.key === "Enter" && open(c)}
                    >
                      <td className="col-n">{i + 1}</td>
                      <td>
                        {c.wantedName || "—"}
                        {c.civilId && (
                          <span className="muted">
                            {" "}
                            · <bdi>{c.civilId}</bdi>
                          </span>
                        )}
                      </td>
                      <td>
                        <b>{c.name}</b>
                      </td>
                      <td>{c.relation || "—"}</td>
                      <td>
                        <bdi>{c.phone || "—"}</bdi>
                      </td>
                      <td>{c.at ? fmtDateTime(c.at) : "—"}</td>
                      <td>{c.location || "—"}</td>
                      <td>
                        {c.answered ? (
                          <span className={`badge sm ${c.answered === "لم يرد" ? "unanswered" : "answered"}`}>{c.answered}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="rec-foot no-print">
            <span>انقر على أي سجل لعرضه في النموذج.</span>
            <span>{unanswered ? `بانتظار معاودة الاتصال: ${unanswered}` : ""}</span>
          </div>
        </section>

        <p className="footer">البيانات محفوظة محلياً على هذا الجهاز وفي هذا المتصفح — يُنصح بأخذ نسخة احتياطية بشكل دوري.</p>
      </div>

      <datalist id="dl-rel">
        {RELATIONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      {toastView}
      {confirmView}
    </div>
  );
}
