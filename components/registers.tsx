"use client";

import { lockLeaves } from "@/app/actions";
import { NATIONALITIES } from "@/lib/lists";
import { daysBetween, daysText, fmtDate, fmtDateTime, nowLocal, todayStr, toLatinDigits } from "@/lib/util";
import { RegisterPage, type Ctx, type Form, type RegisterConfig } from "./register-page";

const short = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n)}…` : s);
const NONE: Form = {};

// ===== المتصلين بهم =====

const SELF = "الشخص نفسه";
const RELATIONS = [SELF, "الأب", "الأم", "الأخ", "الأخت", "الزوج", "الزوجة", "الابن", "الابنة", "قريب", "صديق", "محامٍ"];
const wanted = (f: Form, { persons }: Ctx) => persons.get(toLatinDigits(f.civilId).trim());
const answeredBadge = (v: string) =>
  v && <span className={`badge sm ${v === "لم يرد" ? "unanswered" : "answered"}`}>{v}</span>;

const contacts: RegisterConfig = {
  register: "contacts",
  title: "سجل المتصلين بهم",
  newText: "تسجيل متصل جديد",
  viewText: "بيانات المتصل بهم",
  saveText: "حفظ بيانات المتصل بهم",
  listTitle: "قائمة المتصلين بهم",
  emptyText: "لا يوجد متصلين بهم بعد — سجّل أول متصل من النموذج أعلاه",
  deleteText: (f) => `هل أنت متأكد من حذف سجل الاتصال بـ «${f.name}»؟`,
  initial: () => ({ at: nowLocal() }),
  sections: [
    {
      title: "المطلوب",
      fields: [
        { key: "civilId", label: "الرقم المدني", numeric: true },
        { key: "nationality", label: "الجنسية", list: NATIONALITIES },
      ],
    },
    {
      title: "بيانات المتصل بهم",
      fields: [
        { key: "name", label: "الاسم الثلاثي", req: true },
        { key: "phone", label: "رقم الهاتف", type: "tel" },
        { key: "relation", label: "الصلة", list: RELATIONS },
        { key: "at", label: "التاريخ والوقت", type: "datetime-local" },
        { key: "location", label: "موقع المطلوب" },
        { key: "answered", label: "الرد", type: "select", options: ["رد", "لم يرد"] },
      ],
    },
  ],
  // a registered civil number fills in the nationality; «الشخص نفسه» fills in the name
  onBlur: (key, f, ctx) => (key === "civilId" ? { nationality: wanted(f, ctx)?.nationality || f.nationality } : NONE),
  onChange: (key, f, ctx) =>
    key === "relation" && f.relation === SELF && !f.name.trim() && wanted(f, ctx) ? { name: wanted(f, ctx)!.name } : NONE,
  hint: (key, f, ctx) => (key === "civilId" && wanted(f, ctx) ? `مسجل في النظام باسم «${wanted(f, ctx)!.name}»` : null),
  badge: (f) => answeredBadge(f.answered),
  filter: { key: "answered", label: "الرد", options: ["لم يرد", "رد"] },
  rowClass: (f) => (f.answered === "لم يرد" ? "row-warn" : undefined),
  searchExtra: (f, ctx) => [wanted(f, ctx)?.name],
  sort: (a, b) => b.at.localeCompare(a.at),
  summary: (rows) => {
    const n = rows.filter((f) => f.answered === "لم يرد").length;
    return n ? `بانتظار معاودة الاتصال: ${n}` : "";
  },
  columns: [
    {
      label: "المطلوب",
      value: (f, ctx) =>
        f.civilId && (
          <>
            <bdi>{f.civilId}</bdi>
            {wanted(f, ctx) && <span className="muted"> · {wanted(f, ctx)!.name}</span>}
          </>
        ),
    },
    { label: "الجنسية", value: (f) => f.nationality },
    { label: "الاسم الثلاثي", value: (f) => <b>{f.name}</b> },
    { label: "الصلة", value: (f) => f.relation },
    { label: "رقم الهاتف", value: (f) => f.phone && <bdi>{f.phone}</bdi> },
    { label: "التاريخ والوقت", value: (f) => f.at && fmtDateTime(f.at) },
    { label: "موقع المطلوب", value: (f) => f.location },
    { label: "الرد", value: (f) => answeredBadge(f.answered) },
  ],
};

// ===== السجناء =====

const daysLeft = (f: Form) => (f.endDate ? daysBetween(todayStr(), f.endDate) : null);

function prisonerBadge(f: Form) {
  const n = daysLeft(f);
  if (n == null) return null;
  if (n < 0) return <span className="badge sm released">انتهت المدة</span>;
  if (n <= 7) return <span className="badge sm soon">{n === 0 ? "تنتهي اليوم" : `تنتهي بعد ${daysText(n)}`}</span>;
  return <span className="badge sm detained">محبوس</span>;
}

const endingSoon = (f: Form) => {
  const n = daysLeft(f);
  return n != null && n >= 0 && n <= 7;
};

const prisoners: RegisterConfig = {
  register: "prisoners",
  title: "سجل السجناء",
  newText: "تسجيل سجين جديد",
  viewText: "بيانات السجين",
  saveText: "حفظ بيانات السجين",
  listTitle: "قائمة السجناء",
  emptyText: "لا يوجد سجناء مسجلون بعد — سجّل أول سجين من النموذج أعلاه",
  deleteText: (f) => `هل أنت متأكد من حذف سجل السجين «${f.name}»؟`,
  initial: () => ({ alert: "1" }),
  sections: [
    {
      title: "بيانات السجين",
      fields: [
        { key: "name", label: "الاسم الثلاثي", req: true },
        { key: "jailDate", label: "تاريخ الحبس", type: "date" },
        { key: "endDate", label: "تاريخ الانتهاء", type: "date" },
        { key: "caseType", label: "نوع القضية" },
        { key: "place", label: "مكان التوقيف" },
        { key: "alert", label: "التنبيه في جرس التنبيه قبل تاريخ الانتهاء بأسبوع", type: "check" },
        { key: "notes", label: "الملاحظات", type: "textarea" },
      ],
    },
  ],
  validate: (f) =>
    f.jailDate && f.endDate && f.endDate < f.jailDate ? { endDate: "تاريخ الانتهاء لا يمكن أن يسبق تاريخ الحبس" } : NONE,
  hint: (key, f) => {
    const n = daysLeft(f);
    if (key === "endDate" && n != null) return n < 0 ? "انتهت مدة الحبس" : n === 0 ? "تنتهي اليوم" : `متبقي ${daysText(n)}`;
    if (key === "jailDate" && f.jailDate && f.jailDate <= todayStr()) {
      const since = daysBetween(f.jailDate, todayStr());
      return since ? `محبوس منذ ${daysText(since)}` : "محبوس منذ اليوم";
    }
    return null;
  },
  badge: prisonerBadge,
  rowClass: (f) => (f.alert && endingSoon(f) ? "row-warn" : undefined),
  // soonest end first, records without an end date last
  sort: (a, b) => (a.endDate || "9999").localeCompare(b.endDate || "9999"),
  summary: (rows) => {
    const n = rows.filter(endingSoon).length;
    return n ? `تنتهي مدتهم خلال 7 أيام: ${n}` : "";
  },
  columns: [
    { label: "الاسم الثلاثي", value: (f) => <b>{f.name}</b> },
    { label: "تاريخ الحبس", value: (f) => f.jailDate && fmtDate(f.jailDate) },
    { label: "تاريخ الانتهاء", value: (f) => f.endDate && fmtDate(f.endDate) },
    { label: "نوع القضية", value: (f) => f.caseType },
    { label: "مكان التوقيف", value: (f) => f.place },
    { label: "الحالة", value: prisonerBadge },
    { label: "الملاحظات", value: (f) => short(f.notes) },
  ],
};

// ===== الإجازات الإدارية للأفراد =====

// المتبقي = الرصيد − what was deducted before − the deduction being typed now.
const num = (v: string) => Number(toLatinDigits(v).trim()) || 0;
const remainingOf = (f: Form) => num(f.balance) - num(f.taken) - num(f.deduct);

const leaves: RegisterConfig = {
  register: "leaves",
  title: "الإجازات الإدارية للأفراد",
  newText: "تسجيل فرد جديد",
  viewText: "إجازات الفرد",
  saveText: "حفظ بيانات الإجازة",
  listTitle: "سجل الإجازات الإدارية",
  emptyText: "لا توجد إجازات مسجلة بعد",
  deleteText: (f) => `هل أنت متأكد من حذف سجل إجازات «${f.name}»؟`,
  sections: [
    {
      title: "بيانات الفرد والإجازة",
      fields: [
        { key: "militaryNo", label: "الرقم العسكري", req: true, numeric: true },
        { key: "name", label: "الاسم الثلاثي", req: true },
        { key: "balance", label: "الرصيد (بالأيام)", numeric: true },
        { key: "deduct", label: "خصم من الإجازة (أيام)", numeric: true, transient: true },
        { key: "remaining", label: "المتبقي (بالأيام)", computed: (f) => (f.balance ? String(remainingOf(f)) : "") },
        { key: "taken", label: "المخصوم", hidden: true },
        { key: "notes", label: "الملاحظات", type: "textarea" },
      ],
    },
  ],
  validate: (f) => {
    if (remainingOf(f) >= 0) return NONE;
    const left = num(f.balance) - num(f.taken);
    return num(f.deduct)
      ? { deduct: `لا يمكن خصم أكثر من المتبقي (${Math.max(left, 0)} يوم)` }
      : { balance: `الرصيد أقل من المخصوم سابقاً (${num(f.taken)} يوم)` };
  },
  beforeSave: (f) => ({ taken: String(num(f.taken) + num(f.deduct)) }),
  hint: (key, f) => (key === "remaining" && num(f.taken) ? `المخصوم حتى الآن: ${num(f.taken)} يوم` : null),
  rowClass: (f) => (f.balance && remainingOf(f) <= 0 ? "row-warn" : undefined),
  columns: [
    { label: "الرقم العسكري", value: (f) => <bdi>{f.militaryNo}</bdi> },
    { label: "الاسم الثلاثي", value: (f) => <b>{f.name}</b> },
    { label: "الرصيد", value: (f) => f.balance && `${f.balance} يوم` },
    { label: "المتبقي", value: (f) => f.balance && <b>{remainingOf(f)} يوم</b> },
    { label: "الملاحظات", value: (f) => short(f.notes) },
  ],
  onLock: lockLeaves,
};

export const ContactsRegister = () => <RegisterPage config={contacts} active="contacts" />;
export const PrisonersRegister = () => <RegisterPage config={prisoners} active="prisoners" />;
export const LeavesRegister = () => <RegisterPage config={leaves} active="leaves" />;
