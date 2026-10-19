import { getDb } from "./index";
import { getSetting } from "./settings";

export interface FirstStepsSnapshot {
  accountVerified: boolean;
  ownProducts: number;
  cashSessions: number;
  sales: number;
  activeUsers: number;
  professionals: number;
  appointments: number;
  goal: string;
  teamSize: string;
  seen: Record<string, boolean>;
  dismissed: boolean;
}

export const FIRST_STEPS_SEEN_KEYS = ["arca", "celular"] as const;
export type FirstStepsSeenKey = (typeof FIRST_STEPS_SEEN_KEYS)[number];

async function count(sql: string): Promise<number> {
  try {
    const db = await getDb();
    const rows = await db.select<{ n: number }[]>(sql);
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

export async function getFirstStepsSnapshot(): Promise<FirstStepsSnapshot> {
  const [
    accountVerified,
    goal,
    teamSize,
    dismissed,
    ownProducts,
    cashSessions,
    sales,
    activeUsers,
    professionals,
    appointments,
  ] = await Promise.all([
    getSetting("account_verified").catch(() => null),
    getSetting("signup_goal").catch(() => null),
    getSetting("signup_team_size").catch(() => null),
    getSetting("first_steps_dismissed").catch(() => null),
    count(
      "SELECT COUNT(*) AS n FROM products WHERE active = 1 AND COALESCE(catalog_source, '') <> 'demo'",
    ),
    count("SELECT COUNT(*) AS n FROM cash_sessions"),
    count("SELECT COUNT(*) AS n FROM sales"),
    count("SELECT COUNT(*) AS n FROM users WHERE active = 1"),
    count("SELECT COUNT(*) AS n FROM workshop_resources WHERE active = 1"),
    count("SELECT COUNT(*) AS n FROM appointments"),
  ]);
  const seenValues = await Promise.all(
    FIRST_STEPS_SEEN_KEYS.map((k) => getSetting(`first_steps_seen_${k}`).catch(() => null)),
  );

  const seen: Record<string, boolean> = {};
  FIRST_STEPS_SEEN_KEYS.forEach((k, i) => {
    seen[k] = seenValues[i] === "1";
  });

  return {
    accountVerified: accountVerified === "1",
    ownProducts,
    cashSessions,
    sales,
    activeUsers,
    professionals,
    appointments,
    goal: goal ?? "",
    teamSize: teamSize ?? "",
    seen,
    dismissed: dismissed === "1",
  };
}
