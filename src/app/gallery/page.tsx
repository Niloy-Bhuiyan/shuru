"use client";

/**
 * Design-system gallery — every primitive on one screen for offline
 * visual verification. Not linked from the app; open /gallery directly.
 */

import { useState } from "react";
import { SunriseHeader } from "@/components/SunriseHeader";
import { SunriseHero } from "@/components/SunriseHero";
import { PixelCard } from "@/components/pixel/PixelCard";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelBadge } from "@/components/pixel/PixelBadge";
import { PixelChip } from "@/components/pixel/PixelChip";
import { PixelCheckTile } from "@/components/pixel/PixelCheckTile";
import { PixelGauge } from "@/components/pixel/PixelGauge";
import { PixelInput } from "@/components/pixel/PixelInput";
import { PixelIcon } from "@/components/pixel/PixelIcon";

export default function GalleryPage() {
  const [chip, setChip] = useState("deadline");
  const [email, setEmail] = useState("");
  const [cgpa, setCgpa] = useState("3.95");

  return (
    <>
      <SunriseHeader />
      <SunriseHero greeting="Good morning, Rafid." line2="4 doors open for you." />

      <main className="space-y-6 px-4 pb-16 pt-5">
        <section className="space-y-2">
          <h2 className="font-pixel text-[10px] text-ink">RADAR CARD</h2>
          <PixelCard accent="amber">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-sm font-bold">Software Eng. Intern</p>
                <p className="font-mono text-xs text-ink/70">Grameenphone · Dhaka</p>
              </div>
              <PixelBadge tone="qualify" icon="check">
                QUALIFY
              </PixelBadge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <PixelBadge tone="urgent" icon="clock">
                6 DAYS LEFT
              </PixelBadge>
              <PixelBadge tone="alert" icon="clock">
                2 DAYS LEFT
              </PixelBadge>
              <PixelChip icon="user">3 SENIORS FROM YOUR UNI</PixelChip>
            </div>
            <div className="mt-2 flex items-center justify-between border-t-2 border-ink/20 pt-2">
              <span className="font-mono text-xs font-bold text-ink">
                ~18% SHORTLIST
              </span>
              <span className="flex items-center gap-1 font-mono text-xs font-bold text-grey">
                <PixelIcon name="signal" size={11} /> LOW SIGNAL
              </span>
            </div>
          </PixelCard>
        </section>

        <section className="space-y-2">
          <h2 className="font-pixel text-[10px] text-ink">BUTTONS</h2>
          <div className="flex flex-wrap gap-3">
            <PixelButton>Apply</PixelButton>
            <PixelButton variant="secondary">Save</PixelButton>
            <PixelButton variant="positive">Qualify</PixelButton>
            <PixelButton variant="danger">Delete</PixelButton>
            <PixelButton disabled>Closed</PixelButton>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-pixel text-[10px] text-ink">FILTER CHIPS</h2>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {[
              ["deadline", "DEADLINE SOON"],
              ["paid", "PAID ONLY"],
              ["dept", "CSE"],
              ["all", "SHOW INELIGIBLE"],
            ].map(([id, label]) => (
              <PixelChip key={id} selected={chip === id} onClick={() => setChip(id)}>
                {label}
              </PixelChip>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-pixel text-[10px] text-ink">ELIGIBILITY DECODER</h2>
          <div className="space-y-2">
            <PixelCheckTile state="met" label="CGPA ≥ 3.20" detail="Yours: 3.95 — clears it" />
            <PixelCheckTile
              state="missing"
              label="Semester ≥ 8"
              detail="You are in semester 7 — one short"
            />
            <PixelCheckTile
              state="unknown"
              label="Strong SQL preferred"
              detail="Listed as a soft requirement — can't auto-check"
            />
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-pixel text-[10px] text-ink">REALITY CHECK GAUGE</h2>
          <PixelGauge
            percent={18}
            tone="amber"
            label="SHORTLIST ODDS"
            sublabel="CONFIDENCE: HIGH · 26 similar applicants"
          />
          <PixelGauge
            percent={null}
            tone="grey"
            label="SHORTLIST ODDS"
            sublabel="SIGNAL: INSUFFICIENT — abstaining"
          />
        </section>

        <section className="space-y-3">
          <h2 className="font-pixel text-[10px] text-ink">INPUTS</h2>
          <PixelInput
            label="Email"
            name="email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@university.edu"
            required
          />
          <PixelInput
            label="CGPA"
            name="cgpa"
            type="number"
            value={cgpa}
            onChange={setCgpa}
            min="0"
            max="4"
            step="0.01"
            hint="On a 4.00 scale"
          />
          <PixelInput
            label="Password"
            name="pw"
            type="password"
            value=""
            onChange={() => {}}
            error="Minimum 8 characters"
          />
        </section>
      </main>
    </>
  );
}
