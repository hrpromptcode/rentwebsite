import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "สมัครใช้งาน" };

export default async function SignupPage() {
  const session = await getSession();
  if (session) redirect("/onboarding");
  return <SignupForm />;
}
