import { randomBytes, timingSafeEqual } from 'node:crypto';

export const LIVE_SESSION_COOKIE = 'void_mission_session';

function constantEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

export interface LiveAuth {
  exchange(supplied: string): string | undefined;
  authorized(cookieHeader: string | undefined): boolean;
}

/** One process-local launch exchange. No token or session is persisted. */
export function createLiveAuth(launchToken: string): LiveAuth {
  const sessionToken = randomBytes(32).toString('base64url');
  let launchConsumed = false;
  return {
    exchange: (supplied) => {
      if (launchConsumed || !constantEqual(supplied, launchToken)) {
        return undefined;
      }
      launchConsumed = true;
      return sessionToken;
    },
    authorized: (header) => {
      const supplied = cookieValue(header, LIVE_SESSION_COOKIE);
      return supplied !== undefined && constantEqual(supplied, sessionToken);
    },
  };
}

export function sessionCookie(sessionToken: string): string {
  return `${LIVE_SESSION_COOKIE}=${sessionToken}; HttpOnly; SameSite=Strict; Path=/`;
}
