-- ════════════════════════════════════════════════════════════════
-- 0009 — Revoke the implicit PUBLIC execute grant
--
-- 0008 revoked EXECUTE from `anon` and `authenticated` and the linter kept
-- reporting the same functions. The revokes did land — but PostgreSQL grants
-- EXECUTE on every new function to the pseudo-role PUBLIC by default, and
-- anon/authenticated inherit through it. Revoking a privilege a role never
-- held directly is a no-op while the PUBLIC grant stands.
--
--   proacl before: {=X/postgres, postgres=X/postgres, service_role=X/postgres}
--                   ^ this leading "=" is the PUBLIC grant
--
-- Forward-only: 0008 is already applied and recorded, so editing it would
-- leave this database and a freshly-migrated one permanently divergent.
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════

-- ── drop every implicit and inherited execute grant ─────────────
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;

-- ── re-grant only what each role genuinely needs ────────────────
-- service_role is the trusted server-side worker.
grant execute on all functions in schema public to service_role;

-- `authenticated` gets the policy helpers ONLY. RLS policy expressions are
-- evaluated as the calling role, so the caller does need EXECUTE on any
-- function a policy invokes. Trigger functions are deliberately excluded:
-- PostgreSQL does not check EXECUTE when a trigger fires, so they keep
-- working while losing their /rest/v1/rpc/... endpoint.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_employer() to authenticated;
grant execute on function public.is_service_role() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_member_of_company(uuid) to authenticated;
grant execute on function public.is_member_of_opportunity_company(uuid) to authenticated;

-- anon is granted nothing: it has no table privileges (0007), so no RLS
-- policy is ever evaluated for it and no helper needs to be reachable.
