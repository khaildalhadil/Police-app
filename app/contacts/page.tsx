import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContactsRegister } from "@/components/registers";
import { isLoggedIn } from "@/lib/auth";

export const metadata: Metadata = { title: "المتصلين بهم — نظام إدارة بيانات القضايا والوثائق" };

export default async function Contacts() {
  if (!(await isLoggedIn())) redirect("/login");
  return <ContactsRegister />;
}
