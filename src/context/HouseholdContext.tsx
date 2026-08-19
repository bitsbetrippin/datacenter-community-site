import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import type {
  CalendarRow,
  Category,
  Household,
  MemberWithProfile,
  Person,
  Role,
} from "../lib/types";
import { useAuth } from "./AuthContext";

interface HouseholdState {
  household: Household | null;
  role: Role | null;
  calendars: CalendarRow[];
  categories: Category[];
  members: MemberWithProfile[];
  people: Person[];
  loading: boolean;
  /** true when the signed-in user has no household yet (onboarding needed) */
  needsOnboarding: boolean;
  /** true when the deployed app is newer than the database schema */
  schemaBehind: boolean;
  refresh: () => Promise<void>;
}

const HouseholdContext = createContext<HouseholdState>({
  household: null,
  role: null,
  calendars: [],
  categories: [],
  members: [],
  people: [],
  loading: true,
  needsOnboarding: false,
  schemaBehind: false,
  refresh: async () => {},
});

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [calendars, setCalendars] = useState<CalendarRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [schemaBehind, setSchemaBehind] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setHousehold(null);
      setRole(null);
      setCalendars([]);
      setCategories([]);
      setMembers([]);
      setPeople([]);
      setNeedsOnboarding(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: memberships, error } = await supabase
      .from("household_members")
      .select("household_id, role, status, households(*)")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (error || !memberships || memberships.length === 0) {
      setHousehold(null);
      setRole(null);
      setNeedsOnboarding(!error);
      setLoading(false);
      return;
    }

    // R1 targets one household per account; take the first membership.
    const m = memberships[0] as unknown as {
      household_id: string;
      role: Role;
      households: Household;
    };
    setHousehold(m.households);
    setRole(m.role);
    setNeedsOnboarding(false);

    // Calendars: try the current schema first; if the database hasn't received
    // the newer migrations yet (columns missing), fall back to the R1 columns
    // so the app KEEPS WORKING and we can tell the admin what to run.
    const loadCalendars = async (): Promise<CalendarRow[]> => {
      const full = await supabase
        .from("calendars")
        .select("id, household_id, name, color, is_default, source, connection_id, sync_direction")
        .eq("household_id", m.household_id)
        .order("is_default", { ascending: false })
        .order("name");
      if (!full.error) {
        setSchemaBehind(false);
        return (full.data as CalendarRow[]) ?? [];
      }
      const basic = await supabase
        .from("calendars")
        .select("id, household_id, name, color, is_default, source")
        .eq("household_id", m.household_id)
        .order("is_default", { ascending: false })
        .order("name");
      if (basic.error) return [];
      setSchemaBehind(true);
      return (
        (basic.data as Omit<CalendarRow, "connection_id" | "sync_direction">[]) ?? []
      ).map((c) => ({ ...c, connection_id: null, sync_direction: "twoway" as const }));
    };

    const [cals, cats, mems, ppl] = await Promise.all([
      loadCalendars(),
      supabase
        .from("categories")
        .select(
          "id, household_id, name, slug, color, foreground, group_name, sort_order, active",
        )
        .eq("household_id", m.household_id)
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("household_members")
        .select("household_id, user_id, role, status, profiles(display_name, email)")
        .eq("household_id", m.household_id)
        .eq("status", "active"),
      supabase
        .from("people")
        .select("id, household_id, display_name, email, birthday, anniversary, notes, member_user_id")
        .eq("household_id", m.household_id)
        .order("display_name"),
    ]);
    setCalendars(cals);
    setCategories((cats.data as Category[]) ?? []);
    setMembers((mems.data as unknown as MemberWithProfile[]) ?? []);
    setPeople((ppl.data as Person[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <HouseholdContext.Provider
      value={{ household, role, calendars, categories, members, people, loading, needsOnboarding, schemaBehind, refresh }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  return useContext(HouseholdContext);
}

/** Role helpers (UI convenience only — RLS is the real enforcement). */
export function canCreateEvents(role: Role | null): boolean {
  return role === "owner" || role === "admin" || role === "user";
}
export function isAdmin(role: Role | null): boolean {
  return role === "owner" || role === "admin";
}
