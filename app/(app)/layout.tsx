import { requireUser } from "@/lib/auth";
import { laborTargets } from "@/lib/lotPerformance";
import Sidebar from "@/components/Sidebar";
import Shortcuts from "@/components/Shortcuts";
import LogHours from "@/components/LogHours";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Loaded here so "Log hours" reaches every screen. Hours get logged where
  // the work happened, not on whichever page happens to be about lots.
  const targets = await laborTargets();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar userName={user.name} />
      <Shortcuts />
      <main className="min-w-0 flex-1 p-3 md:p-4">{children}</main>
      <LogHours targets={targets} />
    </div>
  );
}
