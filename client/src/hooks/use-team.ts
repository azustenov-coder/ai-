import { useQuery } from "@tanstack/react-query";
import { TeamMember } from "@shared/schema";

export async function fetchTeam(): Promise<{ success: boolean; data: TeamMember[] }> {
  try {
    const res = await fetch("/api/team", { credentials: "include" });
    if (res.ok) return res.json();
    throw new Error("API unavailable");
  } catch {
    const res = await fetch("/team.json");
    if (!res.ok) throw new Error("Team data not found");
    return res.json();
  }
}

export function useTeam() {
  return useQuery<{ success: boolean; data: TeamMember[] }>({
    queryKey: ["/api/team"],
    queryFn: fetchTeam,
  });
}
