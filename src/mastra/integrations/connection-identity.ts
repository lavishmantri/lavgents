import { nango, type NangoProvider } from "./nango";
import { getAuthenticatedUser as getGithubUser } from "./github";
import { getAuthenticatedUser as getSlackUser } from "./slack";
import { getMe as getNotionMe } from "./notion";

/**
 * Fetch the authenticated user's identity from a provider after OAuth.
 * Used to auto-name connections (e.g., "personal@gmail.com", "lavish-gh").
 *
 * @param provider - The integration provider
 * @param connectionId - The Nango connection ID
 * @returns Identity string (email, username) or null on failure
 */
export async function fetchConnectionIdentity(
  provider: NangoProvider,
  connectionId: string,
): Promise<string | null> {
  try {
    switch (provider) {
      case "google-mail":
      case "google-calendar": {
        const res = await nango.get<{ emailAddress?: string }>({
          providerConfigKey: provider,
          connectionId,
          endpoint: "/gmail/v1/users/me/profile",
        });
        return res.data.emailAddress ?? null;
      }

      case "github": {
        const user = await getGithubUser(connectionId);
        return user.login ?? null;
      }

      case "slack": {
        const auth = await getSlackUser(connectionId);
        const user = auth.user as string | undefined;
        const team = auth.team as string | undefined;
        if (user && team) return `${user} @ ${team}`;
        return user ?? team ?? null;
      }

      case "notion": {
        const me = await getNotionMe(connectionId);
        // me.type === "person" has person.email, me.name is the display name
        const person = me as { name?: string; person?: { email?: string } };
        return person.person?.email ?? person.name ?? null;
      }

      case "gitlab": {
        const res = await nango.get<{ username?: string }>({
          providerConfigKey: "gitlab",
          connectionId,
          endpoint: "/api/v4/user",
        });
        return res.data.username ?? null;
      }

      default:
        return null;
    }
  } catch {
    return null;
  }
}
