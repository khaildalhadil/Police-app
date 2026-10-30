"use client";

import { useEffect, useRef, useState } from "react";
import type { Case, Person } from "@/lib/store";
import { addDays, dueOf, fmtDate, todayStr } from "@/lib/util";
import { Icon } from "./icon";

export type DueItem = {
  caseId: number;
  caseNo: string;
  name: string;
  type: string;
  date: string;
  time: string;
  notes: string;
  n: number;
  cls: string;
  label: string;
};

export function dueItems(cases: Case[], persons: Map<string, Person>): DueItem[] {
  const limit = addDays(todayStr(), 7);
  return cases
    .flatMap((c) =>
      c.appointments
        .filter((a) => a.alert && a.date && a.date <= limit)
        .map((a) => ({
          caseId: c.id!,
          caseNo: c.caseNo,
          name: persons.get(c.civilId)?.name ?? "",
          type: a.type,
          date: a.date,
          time: a.time,
          notes: a.notes,
          ...dueOf(a.date),
        })),
    )
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

// جرس التنبيه: appointments with the alert on, from overdue up to a week ahead.
export function Bell({ items, onOpen }: { items: DueItem[]; onOpen: (caseId: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const urgent = items.some((i) => i.n <= 0);

  return (
    <div className="bell" ref={ref}>
      <button
        type="button"
        className={`bell-btn${items.length ? " has" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`جرس التنبيه — ${items.length} مواعيد`}
        title="جرس التنبيه"
      >
        <Icon name="bell" />
        {items.length > 0 && <span className={`bell-count${urgent ? " urgent" : ""}`}>{items.length}</span>}
      </button>
      {open && (
        <div className="bell-panel">
          <div className="bell-head">المواعيد خلال 7 أيام والمتأخرة</div>
          {items.length ? (
            items.map((i, k) => (
              <button
                key={k}
                type="button"
                className="bell-item"
                onClick={() => {
                  setOpen(false);
                  onOpen(i.caseId);
                }}
              >
                <span className={`due ${i.cls}`}>{i.label}</span>
                <span>
                  <b>موعد {i.type}</b> — {i.name}
                  <small>
                    قضية <bdi>{i.caseNo}</bdi> · {fmtDate(i.date)}
                    {i.time && ` · ${i.time}`}
                    {i.notes && ` · ${i.notes}`}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p className="bell-empty">لا توجد مواعيد قريبة</p>
          )}
        </div>
      )}
    </div>
  );
}
