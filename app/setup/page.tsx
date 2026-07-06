import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import SetupWizard from "@/components/SetupWizard";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const users = await prisma.user.count();
  if (users > 0) redirect("/login");
  return <SetupWizard />;
}
