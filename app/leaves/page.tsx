import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import logo from "@/public/rop-logo.jpg";
import { Icon } from "@/components/icon";
import { PasswordField } from "@/components/password-field";
import { LeavesRegister } from "@/components/registers";
import { isLoggedIn, isSupervisor } from "@/lib/auth";
import { unlockLeaves } from "../actions";

export const metadata: Metadata = { title: "الإجازات الإدارية — نظام إدارة بيانات القضايا والوثائق" };

export default async function Leaves({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (!(await isLoggedIn())) redirect("/login");
  if (await isSupervisor()) return <LeavesRegister />;

  const { e } = await searchParams;
  return (
    <main className="login-page">
      <div className="login-box">
        <div className="login-emblem">
          <Image src={logo} alt="شعار شرطة عمان السلطانية" priority />
        </div>
        <p className="login-en">ROYAL OMAN POLICE</p>
        <h1>الإجازات الإدارية</h1>
        <p className="login-system">هذه الصفحة خاصة بالمسؤول</p>

        {process.env.SUPERVISOR_PASSWORD ? (
          <form className="login-form" action={unlockLeaves}>
            {e && (
              <p className="login-error" role="alert">
                الرقم السري غير صحيح
              </p>
            )}
            <label htmlFor="password">
              <Icon name="lock" /> الرقم السري للمسؤول
            </label>
            <PasswordField />
            <button type="submit" className="btn btn-primary login-submit">
              <Icon name="login" /> فتح الصفحة
            </button>
          </form>
        ) : (
          <p className="login-error" role="alert">
            لم يُحدَّد الرقم السري للمسؤول بعد — أضِف SUPERVISOR_PASSWORD إلى إعدادات الموقع.
          </p>
        )}
        <Link href="/" className="login-back">
          العودة إلى النظام
        </Link>
      </div>
    </main>
  );
}
