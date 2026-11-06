"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { logout } from "@/app/actions";
import logo from "@/public/rop-logo.jpg";
import * as store from "@/lib/store";
import { errMsg, fmtDateTime, norm, toLatinDigits } from "@/lib/util";
import { dueItems } from "./bell";
import { useConfirm, useToasts } from "./feedback";
import { Icon } from "./icon";
import { Sidebar, type Section } from "./sidebar";

export type Form = Record<string, string>;
export type Ctx = { persons: Map<string, store.Person> };

export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "tel" | "date" | "datetime-local" | "select" | "textarea" | "check";
  options?: string[]; // for select
  list?: string[]; // suggestions while typing
  req?: boolean;
  numeric?: boolean; // digits only; Arabic digits are turned into Latin ones
  computed?: (f: Form) => string; // shown read-only, worked out from other fields, not saved
  transient?: boolean; // typed while adding or editing, used by beforeSave, not saved
  hidden?: boolean; // saved but not shown
};

// One register page (المتصلين بهم، السجناء، الإجازات الإدارية): a form, then a list that can
// be searched and printed on its own.
export type RegisterConfig = {
  register: store.RegisterName;
  title: string;
  newText: string;
  viewText: string;
  saveText: string;
  listTitle: string;
  emptyText: string;
  deleteText: (f: Form) => string;
  sections: { title: string; fields: FieldDef[] }[];
  columns: { label: string; value: (f: Form, ctx: Ctx) => ReactNode }[];
  initial?: () => Form;
  sort?: (a: Form, b: Form) => number;
  filter?: { key: string; label: string; options: string[] };
  rowClass?: (f: Form) => string | undefined;
  badge?: (f: Form) => ReactNode;
  hint?: (key: string, f: Form, ctx: Ctx) => ReactNode;
  summary?: (rows: Form[]) => string;
  validate?: (f: Form) => Form;
  beforeSave?: (f: Form) => Form;
  // fields filled in from others while typing / on leaving a field
  onChange?: (key: string, f: Form, ctx: Ctx) => Form;
  onBlur?: (key: string, f: Form, ctx: Ctx) => Form;
  searchExtra?: (f: Form, ctx: Ctx) => (string | undefined)[];
  onLock?: () => Promise<void>;
};

type Mode = "new" | "view" | "edit";

export function RegisterPage({ config: c, active }: { config: RegisterConfig; active: Section }) {
  const { toast, toastView } = useToasts();
  const { confirm, confirmView } = useConfirm();
  const fields = useMemo(() => c.sections.flatMap((s) => s.fields), [c]);
  const blank = useCallback(
    () => ({ ...Object.fromEntries(fields.map((d) => [d.key, ""])), ...c.initial?.() }) as Form,
    [c, fields],
  );
  const toForm = useCallback(
    (r: store.Rec) => Object.fromEntries(fields.map((d) => [d.key, typeof r[d.key] === "string" ? r[d.key] : ""])) as Form,
    [fields],
  );

  const [ready, setReady] = useState(false);
  const [records, setRecords] = useState<store.Rec[]>([]);
  const [persons, setPersons] = useState(() => new Map<string, store.Person>());
  const [dueCount, setDueCount] = useState(0);

  const [mode, setMode] = useState<Mode>("new");
  const [current, setCurrent] = useState<store.Rec | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [errors, setErrors] = useState<Form>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [filterValue, setFilterValue] = useState("all");
  const [printedAt, setPrintedAt] = useState("");
  const started = useRef(false);
  const ro = mode === "view";
  const ctx = useMemo(() => ({ persons }), [persons]);

  const reload = useCallback(async () => {
    const d = await store.loadAll();
    setRecords(d[c.register]);
    setPersons(d.persons);
    setDueCount(dueItems(d).length);
    return d;
  }, [c.register]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    store
      .openDB(() => toast("نافذة أخرى من النظام مفتوحة — أغلقها لإكمال تحديث قاعدة البيانات", "warn", 10000))
      .then(reload)
      .then((d) => {
        // ?open=<id>, from the bell
        const id = Number(new URLSearchParams(window.location.search).get("open"));
        const r = id ? d[c.register].find((x) => x.id === id) : undefined;
        if (!r) return;
        setForm(toForm(r));
        setCurrent(r);
        setMode("view");
      })
      .catch((e) => toast("تعذر فتح قاعدة البيانات المحلية: " + errMsg(e), "error", 8000))
      .finally(() => setReady(true));
  }, [reload, toast, toForm, c.register]);

  const rows = useMemo(() => {
    const q = norm(query);
    return records
      .map((r) => ({ r, f: toForm(r) }))
      .filter(({ f }) => !c.filter || filterValue === "all" || f[c.filter.key] === filterValue)
      .filter(({ f }) => !q || [...Object.values(f), ...(c.searchExtra?.(f, ctx) ?? [])].some((v) => norm(v).includes(q)))
      .sort((a, b) => c.sort?.(a.f, b.f) || b.r.updatedAt.localeCompare(a.r.updatedAt));
  }, [records, toForm, query, filterValue, c, ctx]);

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

  function setField(key: string, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      return { ...next, ...c.onChange?.(key, next, ctx) };
    });
    setErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
    if (!ro) setDirty(true);
  }

  function onBlur(d: FieldDef) {
    if (ro) return;
    setForm((f) => {
      const next = d.numeric || d.type === "tel" ? { ...f, [d.key]: toLatinDigits(f[d.key]).trim() } : f;
      return { ...next, ...c.onBlur?.(d.key, next, ctx) };
    });
  }

  function fill(r: store.Rec) {
    setForm(toForm(r));
    setCurrent(r);
    setErrors({});
    setDirty(false);
    setMode("view");
  }

  function clearForm() {
    setForm(blank());
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
  const toTop = () => document.getElementById("entry")?.scrollIntoView({ behavior: "smooth" });
  const focusFirst = () => requestAnimationFrame(() => document.getElementById(fields[0].key)?.focus());

  async function onNew() {
    if (!(await confirmDiscard())) return;
    clearForm();
    toTop();
    focusFirst();
  }

  async function open(r: store.Rec) {
    if (r.id === current?.id && mode !== "new") return toTop();
    if (!(await confirmDiscard())) return;
    fill(r);
    toTop();
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
    const r = records.find((x) => x.id === current?.id);
    if (r) fill(r);
    else clearForm();
  }

  async function remove() {
    if (current?.id == null) return;
    const ok = await confirm(`${c.deleteText(toForm(current))} لا يمكن التراجع عن هذه العملية.`, {
      title: "تأكيد الحذف",
      okText: "نعم، احذف",
      danger: true,
    });
    if (!ok) return;
    try {
      await store.deleteRecord(c.register, current.id);
      clearForm();
      await reload();
      toast("تم الحذف", "success");
    } catch (e) {
      toast("تعذر الحذف: " + errMsg(e), "error");
    }
  }

  function validate() {
    const errs: Form = {};
    for (const d of fields) {
      if (d.hidden || d.computed) continue;
      const v = toLatinDigits(form[d.key]).trim();
      if (d.req && !v) errs[d.key] = "هذا الحقل مطلوب";
      else if (v && d.numeric && !/^\d+$/.test(v)) errs[d.key] = "أرقام فقط";
      else if (v && d.type === "tel" && !/^\+?[\d\s-]{6,20}$/.test(v)) errs[d.key] = "رقم الهاتف غير صحيح — أرقام فقط";
    }
    Object.assign(errs, c.validate?.(form));
    setErrors(errs);
    const first = fields.find((d) => errs[d.key]);
    if (!first) return true;
    const el = document.getElementById(first.key);
    el?.focus();
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    toast("يرجى تصحيح الحقول المظللة باللون الأحمر", "error");
    return false;
  }

  async function save() {
    if (mode === "view" || saving || !validate()) return;
    const now = new Date().toISOString();
    const values = Object.fromEntries(
      fields
        .filter((d) => !d.transient && !d.computed)
        .map((d) => [d.key, (d.numeric || d.type === "tel" ? toLatinDigits(form[d.key]) : form[d.key] ?? "").trim()]),
    );
    const rec: store.Rec = {
      ...(current?.id != null && { id: current.id }),
      ...values,
      ...c.beforeSave?.(form),
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    setSaving(true);
    try {
      const id = await store.saveRecord(c.register, rec);
      const d = await reload();
      const saved = d[c.register].find((x) => x.id === id);
      if (saved) fill(saved);
      toast(current ? "تم حفظ التعديلات بنجاح" : "تم الحفظ بنجاح", "success");
    } catch (e) {
      toast("تعذر الحفظ: " + errMsg(e), "error", 6000);
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    if (await confirmDiscard()) await logout();
  }

  async function lock() {
    if (await confirmDiscard()) await c.onLock?.();
  }

  function onFormKeyDown(e: ReactKeyboardEvent<HTMLFormElement>) {
    const t = e.target as HTMLInputElement;
    if (e.key !== "Enter" || t.tagName !== "INPUT") return;
    e.preventDefault();
    const list = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>("input:not([readonly]), textarea:not([readonly]), select:not(:disabled)"),
    ).filter((el) => el.offsetParent);
    list[list.indexOf(t) + 1]?.focus();
  }

  if (!ready) return <div className="page-loading">جاري التحميل...</div>;

  const field = (d: FieldDef) => {
    if (d.hidden || (d.transient && ro)) return null;
    const v = d.computed ? d.computed(form) : form[d.key] ?? "";
    const hint = c.hint?.(d.key, form, ctx);
    const change = (value: string) => setField(d.key, value);
    let control: ReactNode;
    if (d.computed) control = <input id={d.key} type="text" value={v} readOnly className="computed" tabIndex={-1} />;
    else if (d.type === "select")
      control = (
        <select id={d.key} value={v} disabled={ro} onChange={(e) => change(e.target.value)}>
          <option value="">—</option>
          {d.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    else if (d.type === "textarea")
      control = <textarea id={d.key} value={v} readOnly={ro} onChange={(e) => change(e.target.value)} />;
    else if (d.type === "check")
      control = (
        <label className="check-line">
          <input id={d.key} type="checkbox" checked={v === "1"} disabled={ro} onChange={(e) => change(e.target.checked ? "1" : "")} />
          {d.label}
        </label>
      );
    else
      control = (
        <input
          id={d.key}
          type={d.type ?? "text"}
          value={v}
          readOnly={ro}
          list={d.list ? `dl-${d.key}` : undefined}
          inputMode={d.numeric ? "numeric" : d.type === "tel" ? "tel" : undefined}
          className={d.type === "date" && !v ? "is-empty" : undefined}
          onChange={(e) => change(e.target.value)}
          onBlur={() => onBlur(d)}
        />
      );
    return (
      <div key={d.key} className={`field${d.type === "textarea" ? " span3" : ""}${errors[d.key] ? " invalid" : ""}`}>
        {d.type !== "check" && (
          <label htmlFor={d.key}>
            {d.label} {d.req && <span className="req">*</span>}
          </label>
        )}
        {control}
        {errors[d.key] && <div className="err">{errors[d.key]}</div>}
        {hint && <div className="hint">{hint}</div>}
      </div>
    );
  };

  const summary = c.summary?.(rows.map((x) => x.f));

  return (
    <div className="shell register-page">
      <Sidebar active={active} dueCount={dueCount} onLogout={signOut} />

      <div className="page">
        <main className="card main-card register-form" id="entry" data-mode={mode}>
          <header className="app-header">
            <div className="logo-wrap">
              <Image src={logo} alt="شعار شرطة عمان السلطانية" priority />
            </div>
            <h1>{c.title}</h1>
            <p className="org">شرطة عُمان السلطانية</p>
            <div className="header-line" />
            <div className="mode-bar">
              <span className={`badge ${mode}`}>{mode === "new" ? c.newText : `${ro ? "عرض" : "تعديل"} ${c.viewText}`}</span>
              {c.badge?.(form)}
              {dirty && <span className="badge dirty">● تغييرات غير محفوظة</span>}
              {current && (
                <span className="meta">
                  أُضيف: {fmtDateTime(current.createdAt)} · آخر تحديث: {fmtDateTime(current.updatedAt)}
                </span>
              )}
            </div>
          </header>

          <form
            id="registerForm"
            autoComplete="off"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            onKeyDown={onFormKeyDown}
          >
            {c.sections.map((s) => (
              <section key={s.title}>
                <h2 className="section-title">{s.title}</h2>
                <div className="grid3">{s.fields.map(field)}</div>
              </section>
            ))}
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
                  focusFirst();
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
              {c.onLock && (
                <button type="button" className="btn btn-outline" onClick={lock}>
                  <Icon name="lock" /> قفل الصفحة
                </button>
              )}
            </div>
            <div className="save-wrap">
              <button type="submit" form="registerForm" className="btn btn-primary btn-lg" disabled={ro || saving}>
                <Icon name="save" className={saving ? "spin" : undefined} />
                <span>{saving ? "جاري الحفظ..." : c.saveText}</span>
              </button>
              {!ro && (
                <div className="shortcut">
                  اختصار: <kbd>Ctrl + S</kbd>
                </div>
              )}
            </div>
          </div>
        </main>

        <section className="card register-list" id="list">
          <div className="print-only print-head">
            <Image src={logo} alt="" width={64} />
            <div>
              <b>شرطة عُمان السلطانية — {c.title}</b>
              <span>تاريخ الطباعة: {printedAt}</span>
            </div>
          </div>
          <div className="records-head">
            <h2 className="section-title">
              {c.listTitle} <span className="count">{rows.length}</span>
            </h2>
            <div className="tools no-print">
              <div className="search-input">
                <Icon name="search" />
                <input
                  type="search"
                  value={query}
                  placeholder="ابحث..."
                  autoComplete="off"
                  aria-label={`البحث في ${c.listTitle}`}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                />
              </div>
              {c.filter && (
                <select value={filterValue} onChange={(e) => setFilterValue(e.target.value)} aria-label={`تصفية حسب ${c.filter.label}`}>
                  <option value="all">{c.filter.label}: الكل</option>
                  {c.filter.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="table-wrap">
            <table className="rec-table">
              <thead>
                <tr>
                  <th className="col-n">ت</th>
                  {c.columns.map((col) => (
                    <th key={col.label}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={c.columns.length + 1}>{records.length ? "لا توجد نتائج مطابقة" : c.emptyText}</td>
                  </tr>
                ) : (
                  rows.map(({ r, f }, i) => (
                    <tr
                      key={r.id}
                      data-id={r.id}
                      tabIndex={0}
                      className={[r.id === current?.id && "current", c.rowClass?.(f)].filter(Boolean).join(" ") || undefined}
                      onClick={() => open(r)}
                      onKeyDown={(e) => e.key === "Enter" && open(r)}
                    >
                      <td className="col-n">{i + 1}</td>
                      {c.columns.map((col) => (
                        <td key={col.label}>{col.value(f, ctx) || "—"}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="rec-foot no-print">
            <span>انقر على أي سجل لعرضه في النموذج.</span>
            <span>{summary}</span>
          </div>
        </section>

        <p className="footer">البيانات محفوظة محلياً على هذا الجهاز وفي هذا المتصفح — يُنصح بأخذ نسخة احتياطية بشكل دوري.</p>
      </div>

      {fields
        .filter((d) => d.list)
        .map((d) => (
          <datalist key={d.key} id={`dl-${d.key}`}>
            {d.list!.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        ))}
      {toastView}
      {confirmView}
    </div>
  );
}
