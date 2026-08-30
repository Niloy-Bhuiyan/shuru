"use client";

/**
 * AgentChat — the conversation itself: transcript, streaming, attachments,
 * composer. Extracted from the /agent page so the corner dock and the
 * full-screen agent world are the SAME chat rather than two implementations
 * that drift apart.
 *
 * What lives here: everything stateful. What does not: the CRT world, the
 * reveal animation and the page title — those are the full-screen page's
 * costume, and the dock has its own.
 *
 * - Streams tokens from the server via SSE; falls back to the buffered JSON
 *   endpoint cleanly if streaming can't start.
 * - Uploads: attach a résumé (PDF/DOCX → /api/parse-resume) or paste a JD;
 *   the résumé feeds get_ats_analysis, the JD rides along for tailoring.
 *   Returned mutations go through the EXISTING data layer (upsertApplication).
 * - Keeps a per-device sessionId for the soft rate limit; history is capped
 *   client- and server-side.
 *
 * `compact` is the dock: the composer sits at the bottom of a bounded panel
 * rather than sticking above the app's bottom nav, and the transcript scrolls
 * inside the panel instead of growing the page.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { AgentAvatar } from "@/components/AgentAvatar";
import { upsertApplication } from "@/lib/data";
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

export function AgentChat({
  compact = false,
  materialize = false,
}: {
  compact?: boolean;
  /** Play the avatar assembly on first paint (the full-screen CRT reveal). */
  materialize?: boolean;
}) {
  const { t, lang } = useLang();

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
      const payload: Payload = {
        message: effective,
        history,
        lang,
        sessionId: sessionId(),
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

  return (
    <div className={cx("flex min-h-0 flex-col", compact && "h-full")}>
      {/* transcript */}
      <div
        className={cx(
          "space-y-3 pb-3",
          compact ? "min-h-0 flex-1 overflow-y-auto px-3 pt-3" : "mt-4"
        )}
      >
        {bubbles.length === 0 && !busy && (
          <div className="flex items-start gap-2.5">
            <AgentAvatar size={26} materialize={materialize} />
            <p className="rounded-2xl rounded-tl-sm bg-cream px-3.5 py-2.5 text-[14px] leading-relaxed text-ink">
              {t("agent.hello")}
            </p>
          </div>
        )}

        {bubbles.map((b, i) =>
          b.kind === "system" ? (
            <p
              key={i}
              className="mx-auto w-fit rounded-full bg-mint/10 px-3 py-1 text-[12px] font-medium text-[#047857]"
            >
              {b.text}
            </p>
          ) : (
            <div
              key={i}
              className={cx(
                "max-w-[85%] px-3.5 py-2.5 text-[14px] leading-relaxed",
                b.kind === "user"
                  ? "ml-auto rounded-2xl rounded-br-sm bg-ink"
                  : "mr-auto rounded-2xl rounded-bl-sm bg-cream"
              )}
            >
              {b.kind === "user" && b.attachment && (
                <span className="mb-1.5 flex w-fit items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 text-[12px] font-medium text-white">
                  <PixelIcon name="upload" size={9} /> {b.attachment}
                </span>
              )}
              <p
                className={cx(
                  "whitespace-pre-line",
                  b.kind === "user" ? "text-white" : "text-ink",
                  lang === "bn" && "font-bangla"
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
            <div className="rounded-2xl rounded-bl-sm bg-cream px-3.5 py-2.5">
              <p
                className={cx(
                  "whitespace-pre-line text-[14px] leading-relaxed text-ink",
                  lang === "bn" && "font-bangla"
                )}
              >
                {draft}
                <span className="pixel-blink text-amberInk">▮</span>
              </p>
            </div>
          </div>
        )}

        {/* thinking (no draft yet) */}
        {busy && !draft && (
          <div className="mr-auto flex w-fit items-center gap-2.5 rounded-2xl rounded-bl-sm bg-cream px-3.5 py-2.5">
            <AgentAvatar size={22} thinking />
            <span className="pixel-blink text-[13px] text-ui-muted">
              {t("agent.thinking")}
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* composer */}
      <div
        className={cx(
          "pb-2 pt-2",
          compact
            ? "shrink-0 border-t border-ui-line bg-paper px-3"
            : "sticky bottom-20 bg-cream"
        )}
      >
        {/* attachment chip */}
        {attachment && (
          <div className="mb-2 flex w-fit items-center gap-2 rounded-lg border border-ui-line bg-cream px-2.5 py-1.5">
            <PixelIcon
              name={attachment.kind === "resume" ? "upload" : "edit"}
              size={11}
              className="text-amberInk"
            />
            <span className="text-[13px] font-medium text-ink">
              {attachment.kind === "resume"
                ? `${t("agent.attachedResume")} · ${attachment.name}`
                : t("agent.attachedJd")}
            </span>
            <button
              type="button"
              aria-label={t("agent.remove")}
              onClick={() => setAttachment(null)}
              className="text-ui-faint transition-colors hover:text-ink"
            >
              <PixelIcon name="x" size={11} />
            </button>
          </div>
        )}

        {attachErr && (
          <p role="alert" className="mb-2 text-[13px] text-alert">{attachErr}</p>
        )}

        {/* quick actions — only while the conversation is empty; once there is
            a transcript they are noise competing with the real answer. */}
        {/* They WRAP rather than scroll. A horizontal strip inside a 400px
            dock cut the last chip in half at its right edge, with no scrollbar
            and no fade to say there was more, so it read as a broken layout
            rather than as something you could swipe. */}
        {bubbles.length === 0 && (
          <div className={cx("mb-2.5 flex flex-wrap gap-2", compact ? "" : "-mx-4 px-4")}>
            {QUICK_ACTIONS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => prefill(t(k))}
                className="rounded-full border border-ui-lineStrong bg-paper px-3 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-cream"
              >
                {t(k)}
              </button>
            ))}
          </div>
        )}

        {/* attach menu */}
        {attachMenu && (
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={attaching}
              className="flex items-center gap-1.5 rounded-lg border border-ui-lineStrong bg-paper px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-cream disabled:opacity-50"
            >
              <PixelIcon name="upload" size={11} />{" "}
              {attaching ? t("agent.attaching") : t("agent.attachResume")}
            </button>
            <button
              type="button"
              onClick={() => {
                setAttachMenu(false);
                setJdText(attachment?.kind === "jd" ? attachment.text : "");
                setJdOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-ui-lineStrong bg-paper px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-cream"
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
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-ui-lineStrong bg-paper text-ui-muted transition-colors hover:bg-cream hover:text-ink disabled:opacity-50"
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
            className="h-[42px] w-full rounded-lg border border-ui-lineStrong bg-paper px-3.5 text-[14px] text-ink placeholder:text-ui-faint focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink disabled:opacity-50"
          />
          <PixelButton
            size="sm"
            onClick={() => send(input)}
            disabled={busy || limited || !input.trim()}
          >
            {t("agent.send")}
          </PixelButton>
        </div>

        {remaining !== null && (
          <p className="mt-2 text-[12px] text-ui-faint">
            {remaining} {t("agent.left")}
          </p>
        )}
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

      {/* JD paste sheet */}
      {jdOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 p-4">
          <div className="w-full max-w-[420px] rounded-2xl border border-ui-line bg-paper p-4 shadow-xl">
            <p className="text-[15px] font-semibold text-ink">{t("agent.jdTitle")}</p>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder={t("agent.jdPlaceholder")}
              rows={6}
              className="mt-3 w-full resize-none rounded-lg border border-ui-lineStrong bg-paper px-3 py-2 text-[14px] text-ink placeholder:text-ui-faint focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
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

export default AgentChat;
