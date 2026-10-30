import { Icon } from "./icon";

// Plain <a> links on purpose: a full page load lets the unsaved-changes warning fire.
export function Sidebar({
  active,
  dueCount = 0,
  onLogout,
}: {
  active: "cases" | "contacts";
  dueCount?: number;
  onLogout: () => void;
}) {
  const cases = active === "cases" ? "" : "/";
  return (
    <aside className="sidebar">
      <p className="side-head">القائمة الرئيسية</p>
      <a href={`${cases}#case`} className={`side-link${active === "cases" ? " active" : ""}`}>
        <Icon name="file-plus" /> إدارة القضايا
      </a>
      <a href={`${cases}#appointments`} className="side-link">
        <Icon name="bell" /> المواعيد والتنبيه
        {dueCount > 0 && <span className="side-count">{dueCount}</span>}
      </a>
      <a href="/contacts" className={`side-link${active === "contacts" ? " active" : ""}`}>
        <Icon name="phone" /> المتصلين بهم
      </a>
      <a href={`${cases}#attachments`} className="side-link">
        <Icon name="archive" /> مرفقات القضية
      </a>
      <a href={`${cases}#records`} className="side-link">
        <Icon name="list" /> سجل القضايا
      </a>
      <p className="side-head">الحساب</p>
      <button type="button" className="side-link" onClick={onLogout}>
        <Icon name="logout" /> تسجيل الخروج
      </button>
    </aside>
  );
}
