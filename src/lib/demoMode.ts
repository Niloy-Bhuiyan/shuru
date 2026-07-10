/**
 * Demo-mode detection. Deliberately framework-agnostic and NOT a client
 * module: it only reads public env vars, so it must be importable from server
 * routes too. (Importing it from the "use client" data layer turns it into a
 * client-reference stub on the server — hence this standalone home.)
 */
export function isDemoMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return (
    !url ||
    !key ||
    url.includes("YOUR_SUPABASE_URL") ||
    key.includes("YOUR_SUPABASE_ANON_KEY")
  );
}
