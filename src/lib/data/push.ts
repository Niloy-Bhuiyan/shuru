"use client";

/**
 * BROWSER PUSH SUBSCRIPTION (client side)
 *
 * Push is best-effort and heavily environment-dependent, so every entry point
 * here reports *why* it is unavailable rather than failing silently. The
 * caller renders that reason — a toggle that does nothing with no explanation
 * is the worst outcome for a permission-gated feature.
 *
 * Known platform limit: on iOS, Web Push only works once the site has been
 * added to the Home Screen. Safari reports no PushManager until then, which
 * `pushSupport()` surfaces as an explicit reason.
 */

import { supabaseBrowser } from "@/lib/supabase/client";

export type PushSupport =
  | { supported: true }
  | { supported: false; reason: string };

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") {
    return { supported: false, reason: "not in a browser" };
  }
  if (!("serviceWorker" in navigator)) {
    return { supported: false, reason: "This browser has no service worker support." };
  }
  if (!("PushManager" in window)) {
    // The iOS case lands here until the app is installed to the Home Screen.
    return {
      supported: false,
      reason:
        "This browser does not support push notifications. On iPhone or iPad, add Shuru to your Home Screen first.",
    };
  }
  if (!("Notification" in window)) {
    return { supported: false, reason: "This browser has no Notification API." };
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return { supported: false, reason: "Push is not configured on this deployment." };
  }
  return { supported: true };
}

/** base64url VAPID key → the Uint8Array the PushManager expects. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function keyToBase64(key: ArrayBuffer | null): string {
  if (!key) return "";
  const bytes = new Uint8Array(key);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Registers the worker, asks permission, subscribes, and stores the handle.
 *
 * Permission is requested only at this point — never on page load. A browser
 * permanently blocks a site that prompts unprompted, which would make push
 * unrecoverable for that user.
 */
export async function subscribeToPush(): Promise<SubscribeResult> {
  const support = pushSupport();
  if (!support.supported) return { ok: false, reason: support.reason };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      reason:
        permission === "denied"
          ? "Notifications are blocked for this site. Re-enable them in your browser settings."
          : "Notification permission was dismissed.",
    };
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    // Reuse an existing subscription; re-subscribing rotates the endpoint and
    // orphans the stored row.
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      }));

    const json = subscription.toJSON() as { endpoint?: string };
    const sb = supabaseBrowser();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return { ok: false, reason: "Not signed in." };

    const { error } = await sb.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: json.endpoint ?? subscription.endpoint,
        p256dh: keyToBase64(subscription.getKey("p256dh")),
        auth: keyToBase64(subscription.getKey("auth")),
        user_agent: navigator.userAgent.slice(0, 300),
      },
      { onConflict: "user_id,endpoint" }
    );
    if (error) return { ok: false, reason: error.message };

    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/** Unsubscribes this device and removes its row. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;

  await sb
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);
}

/** Whether this device currently holds a push subscription. */
export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupport().supported) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    return Boolean(await registration?.pushManager.getSubscription());
  } catch {
    return false;
  }
}
