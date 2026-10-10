import { redirect } from "next/navigation";
import { currentSession } from "./http";
import { getUser } from "./auth/accounts";

/** Server-component guard: returns the session and user or redirects to sign-in. */
export async function requirePageSession() {
  const session = await currentSession();
  if (!session) redirect("/login");
  const user = getUser(session.userId);
  if (!user) redirect("/login");
  return { session, user };
}
