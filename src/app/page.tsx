/**
 * Entry — the public landing page.
 *
 * This was previously a client component that read the profile and bounced to
 * /radar or /login, so `/` had no content of its own: a first-time visitor met
 * a password form before anything explained what Shuru was.
 *
 * Sending an already-signed-in user onward is middleware's job, not this
 * file's. `/` is listed in PUBLIC_ROUTES, which is the same rule that already
 * covers /login and /register — middleware has called getUser() before this
 * renders, so redirecting there costs no extra round trip and keeps this route
 * free of `next/headers`, and therefore statically renderable.
 */

import { LandingPage } from "@/components/landing/LandingPage";

export default function Entry() {
  return <LandingPage />;
}
