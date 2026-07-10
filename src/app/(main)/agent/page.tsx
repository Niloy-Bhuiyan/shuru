"use client";

/**
 * ASK YOUR AGENT — a signature pixel chat over /api/agent, in the agent's own
 * phosphor CRT world.
 *
 * - Opens with a CRT power-on reveal (skipped under reduced-motion).
 * - Streams tokens from the server via SSE; falls back to the buffered JSON
 *   endpoint cleanly if streaming can't start.
 * - Uploads: attach a résumé (PDF/DOCX → /api/parse-resume) or paste a JD;
 *   the résumé feeds get_ats_analysis, the JD rides along for tailoring.
 * - Ships a demoContext snapshot with every request in demo mode; applies
 *   returned mutations through the EXISTING data layer (upsertApplication).
 * - Keeps a per-device sessionId for the soft rate limit; history is capped
 *   client- and server-side.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { LoadingBlock } from "@/components/LoadingBlock";
import { AgentAvatar } from "@/components/AgentAvatar";
import { CrtReveal } from "@/components/CrtReveal";
import { useAgentEnabled } from "@/hooks/useAgentEnabled";
import { useProfile } from "@/hooks/useProfile";
import {
  getResume,
  isDemoMode,
  listApplications,
  upsertApplication,
} from "@/lib/data";
import { useLang } from "@/lib/i18n";
import { cx } from "@/lib/cx";
import type { ClientMutation } from "@/lib/agent/tools";
import type { ResumeContent } from "@/lib/types";

type Attachment =
  | { kind: "resume"; name: string; content: ResumeContent }
  | { kind: "jd"; text: string };

type Bubble =
  | { kind: "user"; text: string; attachment?: string }
  | { kind: "agent"; text: string }
  | { kind: "system"; text: string };

type SseEvent =
  | { type: "meta"; remaining: number }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "mutation"; mutation: ClientMutation }
  | { type: "done"; text: string }
  | { type: "error"; error: string };

const LS_SESSION = "shuru.agent.session";

function sessionId(): string {
  try {
    let id = window.localStorage.getItem(LS_SESSION);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.localStorage.setItem(LS_SESSION, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

const QUICK_ACTIONS = [
  "agent.qa.odds",
  "agent.qa.paidFrontend",
  "agent.qa.tailor",
  "agent.qa.markApplied",
] as const;

export default function AgentPage() {
  const enabled = useAgentEnabled();
  const { profile } = useProfile();
  const { t, lang } = useLang();

  const [revealed, setRevealed] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState<string | null>(null); // live streamed text
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limited, setLimited] = useState(false);

  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [attachErr, setAttachErr] = useState<string | null>(null);
  const [jdOpen, setJdOpen] = useState(false);
  const [jdText, setJdText] = useState("");

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [bubbles, busy, draft]);

  const pushSystem = useCallback(
    (text: string) => setBubbles((b) => [...b, { kind: "system", text }]),
    []
  );

  async function applyMutation(m: ClientMutation) {
    if (m.type === "application_status") {
      await upsertApplication(m.opportunity_id, m.status);
      pushSystem(`✓ ${t("agent.tracked")}`);
    }
  }

  type Payload = {
    message: string;
    history: { role: "user" | "assistant"; content: string }[];
    lang: "en" | "bn";
    sessionId: string;
    demoContext?: unknown;
    attachedResume: ResumeContent | null;
  };

  /** SSE streaming attempt. Returns "ok" when it produced/handled an answer,
   *  or "fallback" when nothing was shown and the caller should retry buffered. */
  async function streamTurn(payload: Payload): Promise<"ok" | "fallback"> {
    let res: Response;
    try {
      res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(payload),
      });
    } catch {
      return "fallback";
    }
    if (res.status === 429) {
      setLimited(true);
      pushSystem(t("agent.limit"));
      return "ok";
    }
    if (!res.ok || !res.body) return "fallback";

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let acc = "";
    let done = false;
    let sawContent = false;

    const commit = (text: string) => {
      setDraft(null);
      setBubbles((b) => [...b, { kind: "agent", text }]);
    };

    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = rawEvent.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          let evt: SseEvent;
          try {
            evt = JSON.parse(json) as SseEvent;
          } catch {
            continue;
          }

          if (evt.type === "meta") {
            setRemaining(evt.remaining);
          } else if (evt.type === "delta") {
            acc += evt.text;
            sawContent = true;
            setDraft(acc);
          } else if (evt.type === "reset") {
            acc = "";
            setDraft("");
          } else if (evt.type === "mutation") {
            await applyMutation(evt.mutation);
          } else if (evt.type === "done") {
            commit(evt.text || acc);
            done = true;
          } else if (evt.type === "error") {
            if (!sawContent && !done) return "fallback";
            setDraft(null);
            pushSystem(t("agent.err"));
            return "ok";
          }
        }
      }
    } catch {
      // network dropped mid-stream
      if (done) return "ok";
      if (acc) {
        commit(acc);
        return "ok";
      }
      return "fallback";
    }

    if (done) return "ok";
    if (acc) {
      commit(acc);
      return "ok";
    }
    return "fallback";
  }

  /** Buffered JSON path — the original contract, used as a clean fallback. */
  async function bufferedTurn(payload: Payload): Promise<void> {
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 429) {
      setLimited(true);
      pushSystem(t("agent.limit"));
      return;
    }
    if (!res.ok) {
      pushSystem(t("agent.err"));
      return;
    }
    const d = (await res.json()) as {
      text: string;
      mutations: ClientMutation[];
      remaining: number;
    };
    setRemaining(d.remaining);
    for (const m of d.mutations ?? []) await applyMutation(m);
    setBubbles((b) => [...b, { kind: "agent", text: d.text }]);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy || limited) return;
    setInput("");
    setAttachMenu(false);
    setBusy(true);
    setDraft(null);

    const current = attachment;
    setAttachment(null);

    const userBubble: Bubble = {
      kind: "user",
      text: message,
      attachment:
        current?.kind === "resume"
          ? `${t("agent.attachedResume")} · ${current.name}`
          : current?.kind === "jd"
            ? t("agent.attachedJd")
            : undefined,
    };
    setBubbles((b) => [...b, userBubble]);

    // last 6 chat turns as history (server caps again)
    const history = bubbles
      .filter((b): b is Extract<Bubble, { kind: "user" | "agent" }> => b.kind !== "system")
      .slice(-6)
      .map((b) => ({ role: (b.kind === "user" ? "user" : "assistant") as "user" | "assistant", content: b.text }));

    // fold attachments into the message the model sees
    let effective = message;
    if (current?.kind === "jd") {
      effective = `${message}\n\n[Job description]\n${current.text.slice(0, 6000)}`;
    } else if (current?.kind === "resume") {
      effective = `${message}\n\n(I've attached my résumé "${current.name}" — please run an ATS check with get_ats_analysis.)`;
    }

    try {
      const demoContext = isDemoMode()
        ? { profile, applications: await listApplications(), resume: await getResume() }
        : undefined;

      const payload: Payload = {
        message: effective,
        history,
        lang,
        sessionId: sessionId(),
        demoContext,
        attachedResume: current?.kind === "resume" ? current.content : null,
      };

      const outcome = await streamTurn(payload);
      if (outcome === "fallback") await bufferedTurn(payload);
    } catch {
      setDraft(null);
      pushSystem(t("agent.err"));
    } finally {
      setBusy(false);
    }
  }

  async function handleResumeFile(file: File) {
    if (attaching) return;
    setAttaching(true);
    setAttachErr(null);
    setAttachMenu(false);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/parse-resume", { method: "POST", body: form });
      if (!res.ok) {
        setAttachErr(t("agent.attachErr"));
        return;
      }
      const d = (await res.json()) as { content: ResumeContent };
      setAttachment({ kind: "resume", name: file.name.slice(0, 40), content: d.content });
    } catch {
      setAttachErr(t("agent.attachErr"));
    } finally {
      setAttaching(false);
    }
  }

  function prefill(text: string) {
    setInput(text);
    inputRef.current?.focus();
  }

  // ── gated states (no world/reveal — kept simple) ──
  if (enabled === null) {
    return (
      <main className="px-4 pt-4">
        <LoadingBlock />
      </main>
    );
  }
  if (enabled === false) {
    return (
      <main className="px-4 pt-6">
        <p className="border-3 border-ink bg-paper p-3 font-mono text-xs text-ink shadow-pixel-sm">
          {t("agent.notConfigured")}{" "}
          <Link href="/radar" className="font-bold underline">
            ← {t("common.back")}
          </Link>
        </p>
      </main>
    );
  }

  return (
    <div className="world-agent relative min-h-dvh pb-8">
      {!revealed && <CrtReveal onDone={() => setRevealed(true)} />}

      <main className={cx("px-4 pt-4", revealed && "agent-enter")}>
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 font-pixel text-xs text-ink">
            <AgentAvatar size={28} materialize={revealed} thinking={busy} />
            {t("agent.title")}
          </h1>
          {remaining !== null && (
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-grey">
              {remaining} {t("agent.left")}
            </p>
          )}
        </div>

        {/* transcript */}
        <div className="mt-4 space-y-3 pb-3">
          {bubbles.length === 0 && !busy && (
            <div className="border-3 border-ink bg-paper p-3 shadow-pixel-sm">
              <p className="font-mono text-xs leading-relaxed text-ink">{t("agent.hello")}</p>
            </div>
          )}

          {bubbles.map((b, i) =>
            b.kind === "system" ? (
              <p
                key={i}
                className="mx-auto w-fit border-2 border-ink bg-mint px-2 py-1 font-mono text-[10px] font-bold uppercase text-ink"
              >
                {b.text}
              </p>
            ) : (
              <div
                key={i}
                className={cx(
                  "max-w-[85%] border-3 border-ink p-3 shadow-pixel-sm",
                  b.kind === "user" ? "ml-auto bg-ink" : "mr-auto bg-paper"
                )}
              >
                {b.kind === "user" && b.attachment && (
                  <span className="mb-1 flex w-fit items-center gap-1 border-2 border-cream/40 bg-ink px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-cream">
                    <PixelIcon name="upload" size={9} /> {b.attachment}
                  </span>
                )}
                <p
                  className={cx(
                    "whitespace-pre-line text-xs leading-relaxed",
                    b.kind === "user" ? "text-cream" : "text-ink",
                    lang === "bn" ? "font-bangla" : "font-mono"
                  )}
                >
                  {b.text}
                </p>
              </div>
            )
          )}

          {/* live streaming draft */}
          {busy && draft && (
            <div className="mr-auto flex max-w-[85%] items-start gap-2">
              <AgentAvatar size={24} thinking />
              <div className="border-3 border-ink bg-paper p-3 shadow-pixel-sm">
                <p
                  className={cx(
                    "whitespace-pre-line text-xs leading-relaxed text-ink",
                    lang === "bn" ? "font-bangla" : "font-mono"
                  )}
                >
                  {draft}
                  <span className="pixel-blink text-amber">▮</span>
                </p>
              </div>
            </div>
          )}

          {/* thinking (no draft yet) */}
          {busy && !draft && (
            <div className="mr-auto flex w-fit items-center gap-2 border-3 border-ink bg-paper p-3 shadow-pixel-sm">
              <AgentAvatar size={22} thinking />
              <span className="pixel-blink font-mono text-[10px] font-bold uppercase tracking-widest text-grey">
                {t("agent.thinking")}
              </span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* composer */}
        <div className="sticky bottom-20 bg-cream pb-2 pt-2">
          {/* attachment chip */}
          {attachment && (
            <div className="mb-2 flex w-fit items-center gap-2 border-2 border-ink bg-paper px-2 py-1 shadow-pixel-sm">
              <PixelIcon name={attachment.kind === "resume" ? "upload" : "edit"} size={11} className="text-amber" />
              <span className="font-mono text-[11px] font-bold text-ink">
                {attachment.kind === "resume"
                  ? `${t("agent.attachedResume")} · ${attachment.name}`
                  : t("agent.attachedJd")}
              </span>
              <button
                type="button"
                aria-label={t("agent.remove")}
                onClick={() => setAttachment(null)}
                className="text-grey active:translate-x-[1px] active:translate-y-[1px]"
              >
                <PixelIcon name="x" size={11} />
              </button>
            </div>
          )}

          {attachErr && (
            <p className="mb-2 font-mono text-[11px] font-bold text-alert">! {attachErr}</p>
          )}

          {/* quick actions */}
          <div className="no-scrollbar -mx-4 mb-2 flex gap-2 overflow-x-auto px-4">
            {QUICK_ACTIONS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => prefill(t(k))}
                className="shrink-0 border-2 border-ink bg-paper px-2 py-1 font-mono text-[11px] font-bold text-ink shadow-pixel-sm active:translate-x-[1px] active:translate-y-[1px]"
              >
                {t(k)}
              </button>
            ))}
          </div>

          {/* attach menu */}
          {attachMenu && (
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={attaching}
                className="flex items-center gap-1.5 border-2 border-ink bg-paper px-2 py-1 font-mono text-[11px] font-bold text-ink shadow-pixel-sm active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
              >
                <PixelIcon name="upload" size={11} /> {attaching ? t("agent.attaching") : t("agent.attachResume")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttachMenu(false);
                  setJdText(attachment?.kind === "jd" ? attachment.text : "");
                  setJdOpen(true);
                }}
                className="flex items-center gap-1.5 border-2 border-ink bg-paper px-2 py-1 font-mono text-[11px] font-bold text-ink shadow-pixel-sm active:translate-x-[1px] active:translate-y-[1px]"
              >
                <PixelIcon name="edit" size={11} /> {t("agent.attachJd")}
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              aria-label={t("agent.attach")}
              onClick={() => setAttachMenu((v) => !v)}
              disabled={busy || limited}
              className="flex items-center justify-center border-3 border-ink bg-paper px-2 text-ink shadow-pixel-sm active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
            >
              <PixelIcon name="upload" size={14} />
            </button>
            <input
              ref={inputRef}
              value={input}
              aria-label={t("agent.placeholder")}
              placeholder={t("agent.placeholder")}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              disabled={busy || limited}
              className="w-full border-3 border-ink bg-paper px-3 py-2 font-mono text-xs text-ink placeholder:text-grey focus:outline-none focus:shadow-pixel-sm disabled:opacity-50"
            />
            <PixelButton size="sm" onClick={() => send(input)} disabled={busy || limited || !input.trim()}>
              {t("agent.send")}
            </PixelButton>
          </div>
        </div>

        {/* hidden file input for résumé upload */}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleResumeFile(f);
            e.target.value = "";
          }}
        />
      </main>

      {/* JD paste sheet */}
      {jdOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-4">
          <div className="w-full max-w-[400px] border-3 border-ink bg-paper p-3 shadow-pixel-lg">
            <p className="font-pixel text-[10px] text-ink">{t("agent.jdTitle")}</p>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder={t("agent.jdPlaceholder")}
              rows={6}
              className="mt-2 w-full resize-none border-3 border-ink bg-cream px-2 py-1.5 font-mono text-xs text-ink placeholder:text-grey focus:outline-none"
            />
            <div className="mt-2 flex gap-2">
              <PixelButton
                size="sm"
                onClick={() => {
                  const text = jdText.trim();
                  if (text) setAttachment({ kind: "jd", text });
                  setJdOpen(false);
                }}
                disabled={!jdText.trim()}
              >
                {t("agent.jdAdd")}
              </PixelButton>
              <PixelButton size="sm" variant="secondary" onClick={() => setJdOpen(false)}>
                {t("agent.cancel")}
              </PixelButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
