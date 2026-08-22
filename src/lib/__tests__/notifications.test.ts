/**
 * Notification centre data layer.
 *
 * The behaviour worth pinning down is the part that is NOT just a PostgREST
 * passthrough: expiry filtering (done client-side so callers never handle
 * `expires_at`), the unread filter, and the preferences fallback that makes a
 * missing row behave exactly like the schema defaults.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  countUnreadNotifications,
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/data/notifications";

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  notifications: [] as Row[],
  notification_preferences: [] as Row[],
  user: { id: "u1" } as { id: string } | null,
  /** Records the last write so tests can assert what was sent. */
  lastUpdate: null as Row | null,
}));

vi.mock("@/lib/supabase/client", () => {
  function builder(table: string, rows: Row[]) {
    let out = rows;
    let counting = false;

    const b = {
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        counting = Boolean(opts?.head);
        return b;
      },
      eq: (col: string, val: unknown) => {
        out = out.filter((r) => r[col] === val);
        return b;
      },
      is: (col: string, val: unknown) => {
        out = out.filter((r) => (r[col] ?? null) === val);
        return b;
      },
      order: () => b,
      limit: (n: number) => {
        out = out.slice(0, n);
        return b;
      },
      update: (patch: Row) => {
        db.lastUpdate = patch;
        // mutate the backing rows so follow-up reads observe the change
        for (const r of out) Object.assign(r, patch);
        return b;
      },
      delete: () => {
        const doomed = new Set(out);
        const backing = (db as unknown as Record<string, Row[]>)[table];
        (db as unknown as Record<string, Row[]>)[table] = backing.filter(
          (r) => !doomed.has(r)
        );
        return b;
      },
      upsert: (row: Row) => {
        (db as unknown as Record<string, Row[]>)[table] = [row];
        return b;
      },
      maybeSingle: async () => ({ data: out[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[] | null; count?: number; error: null }) => unknown) =>
        resolve(
          counting
            ? { data: null, count: out.length, error: null }
            : { data: out, error: null }
        ),
    };
    return b;
  }

  return {
    supabaseBrowser: () => ({
      from: (table: string) =>
        builder(table, [...((db as unknown as Record<string, Row[]>)[table] ?? [])]),
      auth: { getUser: async () => ({ data: { user: db.user } }) },
    }),
  };
});

const HOUR = 3600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

beforeEach(() => {
  db.user = { id: "u1" };
  db.lastUpdate = null;
  db.notification_preferences = [];
  db.notifications = [
    {
      id: "n-unread",
      user_id: "u1",
      type: "new_match",
      title: "New match",
      read_at: null,
      created_at: iso(-HOUR),
      expires_at: null,
    },
    {
      id: "n-read",
      user_id: "u1",
      type: "application_viewed",
      title: "Viewed",
      read_at: iso(-HOUR),
      created_at: iso(-2 * HOUR),
      expires_at: null,
    },
    {
      id: "n-expired",
      user_id: "u1",
      type: "saved_closing_soon",
      title: "Closing soon",
      read_at: null,
      created_at: iso(-3 * HOUR),
      expires_at: iso(-HOUR), // already past
    },
  ];
});

describe("listNotifications", () => {
  it("drops alerts whose expires_at has passed", async () => {
    const ids = (await listNotifications()).map((n) => n.id);
    expect(ids).toContain("n-unread");
    expect(ids).toContain("n-read");
    expect(ids).not.toContain("n-expired");
  });

  it("keeps alerts with a future expiry", async () => {
    db.notifications.push({
      id: "n-future",
      user_id: "u1",
      type: "urgent_internship",
      title: "Closes tomorrow",
      read_at: null,
      created_at: iso(-HOUR),
      expires_at: iso(24 * HOUR),
    });
    expect((await listNotifications()).map((n) => n.id)).toContain("n-future");
  });

  it("returns only unread rows when asked, still minus expired ones", async () => {
    const ids = (await listNotifications({ unreadOnly: true })).map((n) => n.id);
    expect(ids).toEqual(["n-unread"]);
  });
});

describe("countUnreadNotifications", () => {
  it("counts unread rows without fetching them", async () => {
    // n-unread and n-expired are both unread at the database level
    expect(await countUnreadNotifications()).toBe(2);
  });
});

describe("markNotificationRead", () => {
  it("stamps read_at with a timestamp", async () => {
    await markNotificationRead("n-unread");
    expect(db.lastUpdate).not.toBeNull();
    const stamped = db.lastUpdate?.read_at as string;
    expect(Number.isNaN(Date.parse(stamped))).toBe(false);
  });

  it("marks every unread row when marking all read", async () => {
    await markAllNotificationsRead();
    expect(db.lastUpdate?.read_at).toBeTruthy();
  });
});

describe("getNotificationPreferences", () => {
  it("falls back to the schema defaults when no row exists", async () => {
    expect(await getNotificationPreferences()).toEqual({
      user_id: "u1",
      ...DEFAULT_NOTIFICATION_PREFERENCES,
    });
  });

  it("returns the stored row when one exists", async () => {
    db.notification_preferences = [
      {
        user_id: "u1",
        in_app: true,
        email: true,
        browser_push: false,
        min_match_score: 80,
        max_alerts_per_day: 2,
      },
    ];
    const prefs = await getNotificationPreferences();
    expect(prefs?.min_match_score).toBe(80);
    expect(prefs?.email).toBe(true);
  });

  it("returns null when signed out", async () => {
    db.user = null;
    expect(await getNotificationPreferences()).toBeNull();
  });
});
