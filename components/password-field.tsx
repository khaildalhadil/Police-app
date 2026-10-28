"use client";

import { useState } from "react";
import { Icon } from "./icon";

export function PasswordField() {
  const [show, setShow] = useState(false);
  return (
    <div className="password-field">
      <input
        id="password"
        name="password"
        type={show ? "text" : "password"}
        required
        autoComplete="current-password"
        placeholder="••••••••"
      />
      <button
        type="button"
        className="icon-btn"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
      >
        <Icon name={show ? "eye-off" : "eye"} />
      </button>
    </div>
  );
}
