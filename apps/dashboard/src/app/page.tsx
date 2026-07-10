import { MemoryVaultDashboard } from "@/components/memory-vault-dashboard";
import type { MemoryClientMode } from "@/lib/memory-client";

export const dynamic = "force-dynamic";

export default function Home() {
  return <MemoryVaultDashboard clientMode={dashboardClientMode()} />;
}

function dashboardClientMode(): MemoryClientMode {
  return process.env.HANDOFFBASE_DASHBOARD_CLIENT_MODE === "mock" ? "mock" : "http";
}
