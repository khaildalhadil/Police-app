import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export type Section = "cases" | "contacts" | "prisoners" | "leaves";

// Plain <a> links on purpose: a full page load lets the unsaved-changes warning fire.
export function Sidebar({
  active,
  dueCount = 0,
  onLogout,
}: {
  active: Section;
  dueCount?: number;
  onLogout: () => void;
}) {
  const cases = active === "cases" ? "" : "/";
  const link = (href: string, section: Section | null, icon: IconName, label: string, extra?: ReactNode) => (
    <a href={href} className={`side-link${section === active ? " active" : ""}`}>
      <Icon name={icon} /> {label}
      {extra}
    </a>
  );
  return (
    <aside className="sidebar">
      <p className="side-head">القائمة الرئيسية</p>
      {link(`${cases}#case`, "cases", "file-plus", "إدارة القضايا")}
      {link(`${cases}#appointments`, null, "bell", "المواعيد والتنبيه", dueCount > 0 && <span className="side-count">{dueCount}</span>)}
      {link("/contacts", "contacts", "phone", "المتصلين بهم")}
      {link("/prisoners", "prisoners", "lock", "السجناء")}
      {link("/leaves", "leaves", "calendar", "الإجازات الإدارية")}
      {link(`${cases}#attachments`, null, "archive", "مرفقات القضية")}
      {link(`${cases}#records`, null, "list", "سجل القضايا")}
      <p className="side-head">الحساب</p>
      <button type="button" className="side-link" onClick={onLogout}>
        <Icon name="logout" /> تسجيل الخروج
      </button>
    </aside>
  );
}
