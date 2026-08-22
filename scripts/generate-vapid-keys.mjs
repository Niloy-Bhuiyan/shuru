#!/usr/bin/env node
/**
 * Generates a VAPID keypair for Web Push.
 *
 * VAPID keys identify *your server* to the browser's push service. They are
 * self-issued — there is no account to create and no third party to ask, so
 * this needs no credentials. Generate once, keep the pair stable: rotating it
 * invalidates every existing subscription and silently stops delivery.
 *
 *   node scripts/generate-vapid-keys.mjs
 *
 * A VAPID key is a P-256 keypair. The public half is the uncompressed EC
 * point (65 bytes, base64url); the private half is the 32-byte scalar.
 */

import { generateKeyPairSync } from "node:crypto";

const b64url = (buf) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});

// The uncompressed point sits at the end of the SPKI DER structure and always
// starts with 0x04 — find it rather than slicing at a hardcoded offset.
const spki = publicKey.export({ type: "spki", format: "der" });
const pointIndex = spki.indexOf(0x04, spki.length - 65);
const publicBytes = spki.subarray(pointIndex, pointIndex + 65);

if (publicBytes.length !== 65 || publicBytes[0] !== 0x04) {
  console.error("unexpected SPKI layout — could not extract the EC point");
  process.exit(1);
}

// `d` in the JWK is the private scalar, already base64url. generateKeyPairSync
// returns KeyObjects here (no encoding option given), so export directly.
const jwk = privateKey.export({ format: "jwk" });

console.log("Add these to .env.local (and to your deployment's env):\n");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${b64url(publicBytes)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log(`VAPID_SUBJECT=mailto:you@yourdomain.com`);
console.log(
  "\nThe public key is shipped to browsers. The private key is server-only —\n" +
    "never prefix it with NEXT_PUBLIC_. Keep the pair stable: rotating it\n" +
    "invalidates every existing push subscription."
);
