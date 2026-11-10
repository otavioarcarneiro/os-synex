import { supabase } from "@/integrations/supabase/client";
export const SESSION_KEY = "synex_session_key";
export const REMEMBER_KEY = "synex_remember";
export const ALIVE_KEY = "synex_alive";

export async function signOutEverywhere(queryClient?: { cancelQueries: () => Promise<void>; clear: () => void }) {
  await queryClient?.cancelQueries();
  queryClient?.clear();
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem("synex_sudo_until");
  await supabase.auth.signOut();
}
