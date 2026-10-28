"use client";

import { Icon } from "./icon";

export type Column<R> = {
  key: keyof R & string;
  label: string;
  type?: "text" | "tel" | "date" | "time" | "datetime-local" | "select" | "check";
  options?: string[];
  list?: string;
};

type Row = { key: number; error?: string };

// Editable rows for المواعيد and المتصلين بهم.
export function RowTable<R extends Row>({
  rows,
  columns,
  readOnly,
  empty,
  onUpdate,
  onRemove,
  rowClass,
}: {
  rows: R[];
  columns: Column<R>[];
  readOnly: boolean;
  empty: string;
  onUpdate: (key: number, patch: Partial<R>) => void;
  onRemove: (key: number) => void;
  rowClass?: (r: R) => string;
}) {
  const cell = (c: Column<R>, r: R) => {
    const v = r[c.key];
    const set = (value: string | boolean) => onUpdate(r.key, { [c.key]: value } as Partial<R>);
    if (c.type === "check")
      return (
        <input type="checkbox" checked={Boolean(v)} disabled={readOnly} aria-label={c.label} onChange={(e) => set(e.target.checked)} />
      );
    if (c.type === "select")
      return (
        <select value={String(v ?? "")} disabled={readOnly} aria-label={c.label} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          {c.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    return (
      <input
        type={c.type ?? "text"}
        value={String(v ?? "")}
        readOnly={readOnly}
        list={c.list}
        aria-label={c.label}
        onChange={(e) => set(e.target.value)}
      />
    );
  };

  return (
    <div className="table-wrap">
      <table className="row-table">
        <thead>
          <tr>
            <th className="col-n">ت</th>
            {columns.map((c) => (
              <th key={c.key} className={c.type === "check" ? "col-check" : undefined}>
                {c.label}
              </th>
            ))}
            {!readOnly && <th className="col-del">حذف</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="empty-row">
              <td colSpan={columns.length + 2}>{empty}</td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={r.key} className={[r.error && "row-invalid", rowClass?.(r)].filter(Boolean).join(" ") || undefined}>
              <td className="col-n">{i + 1}</td>
              {columns.map((c, ci) => (
                <td key={c.key} className={c.type === "check" ? "col-check" : undefined}>
                  {cell(c, r)}
                  {ci === 0 && r.error && <div className="row-err">{r.error}</div>}
                </td>
              ))}
              {!readOnly && (
                <td className="col-del">
                  <button type="button" className="icon-btn danger" title="حذف الصف" onClick={() => onRemove(r.key)}>
                    <Icon name="trash" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
