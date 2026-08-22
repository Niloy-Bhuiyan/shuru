/**
 * Email dispatch selection and provider choice.
 *
 * The behaviour that matters here is refusal: email is opt-in, capped, and
 * never claims a delivery that did not happen. Each of those is a rule the
 * schema states and this layer must not quietly relax.
 */
import { describe, expect, it } from "vitest";
import {
  planEmailDispatch,
  renderNotificationEmail,
  type Recipient,
} from "@/lib/notify/dispatch";
import { selectEmailProvider } from "@/lib/notify/email";
import { retryableForStatus } from "@/lib/notify/email/types";
import type { Notification, NotificationPreferences } from "@/lib/types";

let seq = 0;
function notif(over: Partial<Notification> = {}): Notification {
  seq += 1;
  return {
    id: `n${seq}`,
    user_id: "u1",
    type: "new_match",
    title: `Alert ${seq}`,
    body: null,
    data: {},
    priority: 50,
    read_at: null,
    created_at: `2026-08-2${seq % 10}T00:00:00.000Z`,
    expires_at: null,
    emailed_at: null,
    pushed_at: null,
    ...over,
  };
}

function prefs(over: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    user_id: "u1",
    in_app: true,
    email: true,
    browser_push: false,
    min_match_score: 60,
    max_alerts_per_day: 5,
    ...over,
  };
}

function recipients(r: Partial<Recipient> = {}): Map<string, Recipient> {
  return new Map([
    [
      "u1",
      { userId: "u1", email: "a@example.com", prefs: prefs(), emailedToday: 0, ...r },
    ],
  ]);
}

describe("planEmailDispatch — opt-in", () => {
  it("does not email a user who has never saved preferences", () => {
    // schema default for `email` is false, so absent preferences mean no email
    const plan = planEmailDispatch([notif()], recipients({ prefs: null }));
    expect(plan.send).toHaveLength(0);
    expect(plan.skip[0].reason).toBe("email_disabled");
  });

  it("does not email when the user switched email off", () => {
    const plan = planEmailDispatch(
      [notif()],
      recipients({ prefs: prefs({ email: false }) })
    );
    expect(plan.send).toHaveLength(0);
    expect(plan.skip[0].reason).toBe("email_disabled");
  });

  it("emails when the user opted in", () => {
    const plan = planEmailDispatch([notif()], recipients());
    expect(plan.send).toHaveLength(1);
    expect(plan.send[0].email).toBe("a@example.com");
  });

  it("skips a user with no address rather than throwing", () => {
    const plan = planEmailDispatch([notif()], recipients({ email: null }));
    expect(plan.skip[0].reason).toBe("no_email_address");
  });
});

describe("planEmailDispatch — caps and staleness", () => {
  it("respects max_alerts_per_day across the whole run", () => {
    const plan = planEmailDispatch(
      [notif(), notif(), notif(), notif()],
      recipients({ prefs: prefs({ max_alerts_per_day: 2 }) })
    );
    expect(plan.send).toHaveLength(2);
    expect(plan.skip.filter((s) => s.reason === "daily_cap_reached")).toHaveLength(2);
  });

  it("counts alerts already emailed earlier today against the cap", () => {
    const plan = planEmailDispatch(
      [notif(), notif()],
      recipients({ prefs: prefs({ max_alerts_per_day: 3 }), emailedToday: 3 })
    );
    expect(plan.send).toHaveLength(0);
    expect(plan.skip[0].reason).toBe("daily_cap_reached");
  });

  it("sends the highest-priority alerts when the cap truncates", () => {
    const low = notif({ priority: 10, title: "routine" });
    const urgent = notif({ priority: 95, title: "interview" });
    const plan = planEmailDispatch(
      [low, urgent],
      recipients({ prefs: prefs({ max_alerts_per_day: 1 }) })
    );
    expect(plan.send).toHaveLength(1);
    expect(plan.send[0].notification.title).toBe("interview");
  });

  it("drops an expired alert instead of sending it late", () => {
    const plan = planEmailDispatch(
      [notif({ expires_at: "2020-01-01T00:00:00.000Z" })],
      recipients()
    );
    expect(plan.send).toHaveLength(0);
    expect(plan.skip[0].reason).toBe("expired");
  });

  it("never re-sends something already stamped", () => {
    const plan = planEmailDispatch(
      [notif({ emailed_at: "2026-08-22T00:00:00.000Z" })],
      recipients()
    );
    expect(plan.skip[0].reason).toBe("already_emailed");
  });
});

describe("renderNotificationEmail", () => {
  it("deep-links to the opportunity when the payload carries one", () => {
    const m = renderNotificationEmail(
      notif({ data: { opportunity_id: "op-1" } }),
      "https://shuru.app/"
    );
    expect(m.text).toContain("https://shuru.app/opportunity/op-1");
    expect(m.html).toContain("https://shuru.app/opportunity/op-1");
  });

  it("falls back to the notification centre with no deep link", () => {
    const m = renderNotificationEmail(notif(), "https://shuru.app");
    expect(m.text).toContain("https://shuru.app/notifications");
  });

  it("escapes HTML so a title cannot inject markup", () => {
    const m = renderNotificationEmail(
      notif({ title: '<img src=x onerror="alert(1)">' }),
      "https://shuru.app"
    );
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&lt;img");
  });

  it("always produces a plain-text part", () => {
    const m = renderNotificationEmail(notif({ body: "Details" }), "https://shuru.app");
    expect(m.text.length).toBeGreaterThan(0);
    expect(m.subject.length).toBeGreaterThan(0);
  });
});

describe("selectEmailProvider", () => {
  it("is unconfigured — not an error — when EMAIL_PROVIDER is unset", () => {
    const s = selectEmailProvider({});
    expect(s.provider).toBeNull();
  });

  it("reports the missing key rather than half-configuring", () => {
    const s = selectEmailProvider({ EMAIL_PROVIDER: "resend", EMAIL_FROM: "a@b.co" });
    expect(s.provider).toBeNull();
    if (s.provider === null) expect(s.reason).toContain("RESEND_API_KEY");
  });

  it("treats an unfilled placeholder as unset", () => {
    const s = selectEmailProvider({
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "a@b.co",
      RESEND_API_KEY: "your-resend-api-key",
    });
    expect(s.provider).toBeNull();
  });

  it("selects resend when fully configured", () => {
    const s = selectEmailProvider({
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "a@b.co",
      RESEND_API_KEY: "re_live_abc123",
    });
    expect(s.provider?.name).toBe("resend");
  });

  it("selects postmark when fully configured", () => {
    const s = selectEmailProvider({
      EMAIL_PROVIDER: "postmark",
      EMAIL_FROM: "a@b.co",
      POSTMARK_SERVER_TOKEN: "tok-123",
    });
    expect(s.provider?.name).toBe("postmark");
  });

  it("refuses the console provider in production without an explicit opt-in", () => {
    const s = selectEmailProvider({
      EMAIL_PROVIDER: "console",
      NODE_ENV: "production",
    });
    // a console "send" stamps emailed_at — allowing it here would falsify the record
    expect(s.provider).toBeNull();
  });

  it("allows console in development", () => {
    const s = selectEmailProvider({ EMAIL_PROVIDER: "console", NODE_ENV: "development" });
    expect(s.provider?.name).toBe("console");
  });

  it("names an unknown provider instead of falling back silently", () => {
    const s = selectEmailProvider({ EMAIL_PROVIDER: "sendgrid", EMAIL_FROM: "a@b.co" });
    expect(s.provider).toBeNull();
    if (s.provider === null) expect(s.reason).toContain("sendgrid");
  });
});

describe("retryableForStatus", () => {
  it("retries 5xx and 429, not other 4xx", () => {
    expect(retryableForStatus(500)).toBe(true);
    expect(retryableForStatus(503)).toBe(true);
    expect(retryableForStatus(429)).toBe(true);
    expect(retryableForStatus(422)).toBe(false);
    expect(retryableForStatus(401)).toBe(false);
  });
});
