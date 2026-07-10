/**
 * AGENT TOOLS — the 5 capabilities the agent can use. Every tool WRAPS
 * existing logic (eligibility.ts, realityCheck.ts, resume/ats.ts, the data
 * layer); no scoring/matching/persistence logic is reimplemented here.
 *
 * Execution is server-side (/api/agent). Data access:
 *   - Supabase mode: query with the caller's session (supabaseServer()).
 *   - Demo mode: listings/outcomes come from the bundled seed (importable
 *     on the server), but USER data (profile / applications / resume)
 *     lives in the browser's localStorage — the client ships a snapshot as
 *     `demoContext` in the request. Mutations can't touch localStorage
 *     from the server, so in demo mode update_application_status returns a
 *     `mutation` for the chat UI to apply through the existing data layer.
 */

import type { ToolCall, ToolDef } from "./adapter";
import { evaluateEligibility } from "@/lib/eligibility";
import { realityCheck, snapshotFromProfile } from "@/lib/realityCheck";
import { computeAts } from "@/lib/resume/ats";
import { isDemoMode } from "@/lib/demoMode";
import { SEED_OPPORTUNITIES, SEED_OUTCOMES } from "@/lib/data/seed";
import { supabaseServer } from "@/lib/supabase/server";
import type {
  Application,
  ApplicationStatus,
  Opportunity,
  Outcome,
  Profile,
  Resume,
  ResumeContent,
} from "@/lib/types";

// ── context the route hands to every execution ──
export type DemoContext = {
  profile: Profile | null;
  applications: Application[];
  resume: Resume | null;
};

export type ToolContext = {
  demoContext?: DemoContext;
  /** a resume attached in the agent chat (parsed via /api/parse-resume);
   *  preferred by get_ats_analysis so an in-chat upload works in both modes */
  attachedResume?: ResumeContent | null;
};

/** A client-side mutation the chat UI must apply via the existing data
 *  layer (demo mode only — the server can't write localStorage). */
export type ClientMutation = {
  type: "application_status";
  opportunity_id: string;
  status: ApplicationStatus;
};

export type ToolExecution = {
  /** JSON string fed back to the model as the tool_result */
  result: string;
  mutation?: ClientMutation;
};

// ── tool definitions (Anthropic Messages-API shape, verbatim) ──
export const TOOL_DEFS: ToolDef[] = [
  {
    name: "search_opportunities",
    description:
      "Search current internship listings. Returns id, company, role, deadline, paid, verified status, and (when the user's profile is known) the eligibility verdict per listing. Use the id with get_reality_check for the user's odds.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Free-text match against company, role and location. Omit to list everything.",
        },
        paid_only: { type: "boolean", description: "Only paid internships." },
        open_only: {
          type: "boolean",
          description: "Only listings whose deadline has not passed. Defaults to true.",
        },
        limit: { type: "number", description: "Max results, default 8, max 15." },
      },
    },
  },
  {
    name: "get_user_profile",
    description:
      "The user's profile: name, university, department, semester, CGPA, skills, and whether they have a deployed project. This profile is what all odds calculations are based on.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_reality_check",
    description:
      "Honest shortlist odds for the user at one opportunity, computed from real past outcomes (never invented). Returns either odds (percent, confidence, cohort size, the one biggest gap, what's in their favour) or an explicit abstention when there isn't enough data.",
    input_schema: {
      type: "object",
      properties: {
        opportunity_id: {
          type: "string",
          description: "Listing id from search_opportunities.",
        },
      },
      required: ["opportunity_id"],
    },
  },
  {
    name: "get_ats_analysis",
    description:
      "Rule-based ATS analysis of the user's saved resume (from Resume Forge): 0-100 score, word count, and the full checklist of passed/failed checks with details.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_application_status",
    description:
      "Move an opportunity through the user's application tracker. Valid statuses: saved, applied, interview, offer, rejected. Only call this when the user explicitly asks to track/update an application.",
    input_schema: {
      type: "object",
      properties: {
        opportunity_id: { type: "string", description: "Listing id." },
        status: {
          type: "string",
          enum: ["saved", "applied", "interview", "offer", "rejected"],
          description: "New status.",
        },
      },
      required: ["opportunity_id", "status"],
    },
  },
];

// ── server-side data access (seed in demo, session-scoped Supabase otherwise) ──

async function serverOpportunities(): Promise<Opportunity[]> {
  if (isDemoMode()) return SEED_OPPORTUNITIES;
  const { data, error } = await supabaseServer().from("opportunities").select("*");
  if (error) throw error;
  return (data ?? []) as Opportunity[];
}

async function serverOutcomes(opportunityId: string): Promise<Outcome[]> {
  if (isDemoMode())
    return SEED_OUTCOMES.filter((o) => o.opportunity_id === opportunityId);
  const { data, error } = await supabaseServer()
    .from("outcomes")
    .select("*")
    .eq("opportunity_id", opportunityId);
  if (error) throw error;
  return (data ?? []) as Outcome[];
}

async function serverProfile(ctx: ToolContext): Promise<Profile | null> {
  if (isDemoMode()) return ctx.demoContext?.profile ?? null;
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as Profile) ?? null;
}

async function serverResume(ctx: ToolContext): Promise<Resume | null> {
  if (isDemoMode()) return ctx.demoContext?.resume ?? null;
  const { data } = await supabaseServer()
    .from("resumes")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Resume) ?? null;
}

// ── executors ──

function err(message: string): ToolExecution {
  return { result: JSON.stringify({ error: message }) };
}

async function execSearch(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolExecution> {
  const query = typeof input.query === "string" ? input.query.toLowerCase().trim() : "";
  const paidOnly = input.paid_only === true;
  const openOnly = input.open_only !== false; // default true
  const limit = Math.min(Math.max(Number(input.limit) || 8, 1), 15);

  const profile = await serverProfile(ctx);
  const today = new Date().toISOString().slice(0, 10);

  const results = (await serverOpportunities())
    .filter((o) => !openOnly || o.deadline >= today)
    .filter((o) => !paidOnly || o.is_paid)
    .filter(
      (o) =>
        !query ||
        `${o.company} ${o.role} ${o.location}`.toLowerCase().includes(query)
    )
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, limit)
    .map((o) => ({
      id: o.id,
      company: o.company,
      role: o.role,
      location: o.location,
      deadline: o.deadline,
      is_paid: o.is_paid,
      verified: o.is_verified,
      // existing eligibility engine — never reimplemented
      eligibility: profile ? evaluateEligibility(profile, o.eligibility_rules).status : null,
    }));

  return { result: JSON.stringify({ count: results.length, results }) };
}

async function execProfile(ctx: ToolContext): Promise<ToolExecution> {
  const p = await serverProfile(ctx);
  if (!p) return err("No profile found. The user needs to complete onboarding first.");
  return {
    result: JSON.stringify({
      name: p.name,
      university: p.university,
      department: p.department,
      semester: p.year,
      cgpa: p.cgpa,
      skills: p.skills,
      has_deployed_project: p.has_deployed_project,
    }),
  };
}

async function execRealityCheck(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolExecution> {
  const id = typeof input.opportunity_id === "string" ? input.opportunity_id : "";
  if (!id) return err("opportunity_id is required.");
  const profile = await serverProfile(ctx);
  if (!profile) return err("No profile found. The user needs to complete onboarding first.");

  const opp = (await serverOpportunities()).find((o) => o.id === id);
  if (!opp) return err(`No opportunity with id ${id}. Use search_opportunities first.`);

  // existing engines only: snapshot + realityCheck + eligibility
  const rc = realityCheck(snapshotFromProfile(profile), await serverOutcomes(id));
  const eligibility = evaluateEligibility(profile, opp.eligibility_rules);

  const payload =
    rc.kind === "odds"
      ? {
          kind: "odds",
          company: opp.company,
          role: opp.role,
          percent: rc.percent,
          confidence: rc.confidence,
          based_on_n_similar_applicants: rc.n,
          cohort: rc.cohort,
          one_thing_missing: rc.oneThing?.label ?? null,
          fix_hint: rc.oneThing?.fixHint ?? null,
          in_your_favour: rc.inYourFavour?.label ?? null,
          eligibility: eligibility.status,
        }
      : {
          kind: "abstain",
          company: opp.company,
          role: opp.role,
          reason: `Only ${rc.n} similar past applicants — fewer than the ${rc.needed} needed for an honest number. Do NOT invent odds for this listing.`,
          eligibility: eligibility.status,
        };
  return { result: JSON.stringify(payload) };
}

async function execAts(ctx: ToolContext): Promise<ToolExecution> {
  // an in-chat uploaded resume wins over the saved one, so ATS analysis
  // works even before the upload is saved (and in Supabase mode too)
  const content =
    ctx.attachedResume ?? (await serverResume(ctx))?.content ?? null;
  if (!content?.order) {
    return err("No saved resume. The user should build one in Resume Forge first, or attach one in the chat.");
  }
  const ats = computeAts(content); // existing engine, untouched
  return {
    result: JSON.stringify({
      score: ats.score,
      word_count: ats.wordCount,
      checks: ats.checks.map((c) => ({
        label: c.label,
        state: c.state,
        detail: c.detail,
      })),
    }),
  };
}

const VALID_STATUSES: ApplicationStatus[] = [
  "saved",
  "applied",
  "interview",
  "offer",
  "rejected",
];

async function execUpdateStatus(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolExecution> {
  const id = typeof input.opportunity_id === "string" ? input.opportunity_id : "";
  const status = input.status as ApplicationStatus;
  if (!id || !VALID_STATUSES.includes(status)) {
    return err("opportunity_id and a valid status (saved/applied/interview/offer/rejected) are required.");
  }
  const opp = (await serverOpportunities()).find((o) => o.id === id);
  if (!opp) return err(`No opportunity with id ${id}.`);

  if (isDemoMode()) {
    // server can't write localStorage — hand the mutation to the client,
    // which applies it through the existing data layer (upsertApplication)
    return {
      result: JSON.stringify({
        ok: true,
        company: opp.company,
        role: opp.role,
        status,
        note: "Queued — applied on the user's device.",
      }),
      mutation: { type: "application_status", opportunity_id: id, status },
    };
  }

  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return err("Not signed in.");
  const now = new Date().toISOString();
  const { data: existing } = await sb
    .from("applications")
    .select("id")
    .eq("user_id", user.id)
    .eq("opportunity_id", id)
    .maybeSingle();
  const { error } = existing
    ? await sb
        .from("applications")
        .update({ status, updated_at: now })
        .eq("id", (existing as { id: string }).id)
    : await sb
        .from("applications")
        .insert({ user_id: user.id, opportunity_id: id, status, updated_at: now });
  if (error) return err("Could not update the tracker. Try again.");
  return {
    result: JSON.stringify({ ok: true, company: opp.company, role: opp.role, status }),
  };
}

// ── dispatcher ──
export async function executeTool(
  call: ToolCall,
  ctx: ToolContext
): Promise<ToolExecution> {
  try {
    switch (call.name) {
      case "search_opportunities":
        return await execSearch(call.input, ctx);
      case "get_user_profile":
        return await execProfile(ctx);
      case "get_reality_check":
        return await execRealityCheck(call.input, ctx);
      case "get_ats_analysis":
        return await execAts(ctx);
      case "update_application_status":
        return await execUpdateStatus(call.input, ctx);
      default:
        return err(`Unknown tool: ${call.name}`);
    }
  } catch {
    return err(`Tool ${call.name} failed. Answer with what you already know.`);
  }
}
