"use client";

import { useState, type DragEvent } from "react";
import type { Attachment } from "@/lib/store";
import { downloadBlob, fileClass, fileExt, fmtSize, openBlob } from "@/lib/util";
import { Icon } from "./icon";

export type AttRow = Attachment & { key: number; error?: string };

export const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

// جدول مرفقات القضية: a type without a file is kept as «بانتظار الإرفاق».
export function AttachmentsTable({
  rows,
  types,
  readOnly,
  onUpdate,
  onRemove,
  onDropFiles,
}: {
  rows: AttRow[];
  types: string[];
  readOnly: boolean;
  onUpdate: (key: number, patch: Partial<AttRow>) => void;
  onRemove: (key: number) => void;
  onDropFiles: (files: File[]) => void;
}) {
  const [drag, setDrag] = useState(false);
  const over = (e: DragEvent) => {
    if (readOnly || !hasFiles(e)) return;
    e.preventDefault();
    setDrag(true);
  };

  return (
    <div
      className={`table-wrap${drag ? " drag" : ""}`}
      onDragEnter={over}
      onDragOver={over}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        setDrag(false);
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onDropFiles(files);
      }}
    >
      <table className="att-table">
        <thead>
          <tr>
            <th className="col-n">ت</th>
            <th>نوع المستند المطلوب إرفاقه</th>
            <th>ملف المستند</th>
            <th className="col-act">إجراء</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="empty-row">
              <td colSpan={4}>
                {readOnly ? "لا توجد مرفقات لهذه القضية" : "لا توجد مستندات — اضغط «إضافة مستند جديد» أو اسحب الملفات هنا"}
              </td>
            </tr>
          )}
          {rows.map((a, i) => (
            <tr key={a.key} className={a.error ? "row-invalid" : undefined}>
              <td className="col-n">{i + 1}</td>
              <td>
                <select
                  className="att-type"
                  value={a.type}
                  disabled={readOnly}
                  aria-label="نوع المستند"
                  onChange={(e) => onUpdate(a.key, { type: e.target.value })}
                >
                  <option value="">اختر نوع المستند...</option>
                  {(a.type && !types.includes(a.type) ? [...types, a.type] : types).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                {a.error && <div className="row-err">{a.error}</div>}
              </td>
              <td>
                <div className="file-cell">
                  {a.blob && (
                    <div className="file-chip">
                      <span className={`ftype ${fileClass(a.fileName, a.fileType)}`}>{fileExt(a.fileName)}</span>
                      <button type="button" className="fname" title="فتح الملف" onClick={() => openBlob(a.blob!, a.fileName)}>
                        {a.fileName || "ملف"}
                      </button>
                      <span className="fsize">{fmtSize(a.size)}</span>
                    </div>
                  )}
                  {!a.blob && readOnly && <span className="pending">بانتظار الإرفاق</span>}
                  {!readOnly && (
                    <label className="file-pick">
                      <input
                        type="file"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) onUpdate(a.key, { blob: f, fileName: f.name, fileType: f.type, size: f.size });
                        }}
                      />
                      <span className="btn btn-sm btn-outline">
                        <Icon name="upload" />
                        {a.blob ? "استبدال الملف" : "اختيار ملف"}
                      </span>
                      {!a.blob && <span className="muted">لم يتم اختيار ملف</span>}
                    </label>
                  )}
                </div>
              </td>
              <td className="col-act">
                <div className="row-actions">
                  {a.blob && (
                    <>
                      <button type="button" className="icon-btn" title="عرض" onClick={() => openBlob(a.blob!, a.fileName)}>
                        <Icon name="eye" />
                      </button>
                      <button type="button" className="icon-btn" title="تنزيل" onClick={() => downloadBlob(a.blob!, a.fileName)}>
                        <Icon name="download" />
                      </button>
                    </>
                  )}
                  {!readOnly && (
                    <button type="button" className="icon-btn danger" title="حذف المستند" onClick={() => onRemove(a.key)}>
                      <Icon name="trash" />
                    </button>
                  )}
                  {readOnly && !a.blob && <span className="muted">—</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
