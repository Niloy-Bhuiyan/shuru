import { expect, test, type Page } from "@playwright/test";

/**
 * Accessibility regression gate.
 *
 * These are the checks that caught real defects rather than theoretical ones.
 * When this suite was written the app had **12 WCAG AA contrast failures** —
 * the `grey`, `amber` and `alert` palette tokens measured 3.07:1, 2.16:1 and
 * 3.10:1 as text on the cream background, against a 4.5:1 requirement. Those
 * were fixed by darkening `grey` and adding `amberInk` / `alertInk` for
 * text-on-light use; this suite is what stops the next palette tweak from
 * quietly undoing it.
 *
 * Scope is the signed-out surface, because that is what runs without seeding a
 * session. It is where every user starts, so it is the right floor.
 */

const PUBLIC_PAGES = [
  // The landing page. It is the largest signed-out surface and the only one
  // with prose, a nav and a footer, so it has by far the most text nodes for
  // a palette change to break — and it is what a first-time visitor sees.
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

/** Contrast of every leaf text node against its effective background. */
async function contrastFailures(page: Page) {
  return page.evaluate(() => {
    const lum = (c: number[]) => {
      const x = c.map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2];
    };
    const parse = (s: string) => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(",").map(parseFloat);
      return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
    };
    // Walk up for the first opaque ancestor background — the colour the text
    // is actually read against, which is not necessarily its own parent's.
    const effBg = (el: Element): number[] => {
      let n: Element | null = el;
      while (n && n !== document.documentElement) {
        const b = parse(getComputedStyle(n).backgroundColor);
        if (b && b.a > 0.9) return b.rgb;
        n = n.parentElement;
      }
      return [255, 255, 255];
    };
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)];
      const [hi, lo] = x > y ? [x, y] : [y, x];
      return (hi + 0.05) / (lo + 0.05);
    };

    const fails: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll("p,span,a,button,label,h1,h2,h3,li,dt,dd,input")
    )) {
      const text = el.textContent?.trim();
      if (!text || el.children.length) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const fg = parse(cs.color);
      if (!fg) continue;
      const size = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      // WCAG AA: 3:1 for large text (24px, or 18.66px bold), else 4.5:1.
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      const r = ratio(fg.rgb, effBg(el));
      if (r < need) {
        fails.push(
          `"${text.slice(0, 30)}" ${r.toFixed(2)}:1 (needs ${need}) — ${el.className}`
        );
      }
    }
    return fails;
  });
}

for (const path of PUBLIC_PAGES) {
  test.describe(path, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(path);
    });

    test("meets WCAG AA contrast on every text node", async ({ page }) => {
      expect(await contrastFailures(page)).toEqual([]);
    });

    test("has exactly one h1 and a main landmark", async ({ page }) => {
      expect(await page.locator("h1").count()).toBe(1);
      expect(await page.locator("main").count()).toBe(1);
    });

    test("declares a document language", async ({ page }) => {
      // Without it, a screen reader announces Bangla content with an English
      // voice — the app is bilingual, so this is not academic.
      expect(await page.locator("html").getAttribute("lang")).toBeTruthy();
    });

    test("every form control has an accessible name", async ({ page }) => {
      const unlabelled = await page.evaluate(() =>
        Array.from(document.querySelectorAll("input,select,textarea"))
          .filter((el) => {
            const e = el as HTMLInputElement;
            if (e.type === "hidden") return false;
            const byFor =
              e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`);
            return !(
              byFor ||
              e.getAttribute("aria-label") ||
              e.getAttribute("aria-labelledby") ||
              e.closest("label")
            );
          })
          .map((el) => (el as HTMLInputElement).name || el.tagName)
      );
      expect(unlabelled).toEqual([]);
    });

    test("every control is reachable and shows a visible focus state", async ({
      page,
    }) => {
      // A keyboard user who cannot see where they are is locked out just as
      // effectively as one who cannot tab at all.
      const noFocusRing = await page.evaluate(() => {
        const bad: string[] = [];
        const els = Array.from(
          document.querySelectorAll("a,button,input")
        ).filter((e) => (e as HTMLElement).offsetParent !== null);
        for (const el of els) {
          const before = getComputedStyle(el);
          const snap = `${before.outlineStyle}${before.outlineWidth}${before.boxShadow}${before.borderColor}`;
          (el as HTMLElement).focus();
          const after = getComputedStyle(el);
          if (
            `${after.outlineStyle}${after.outlineWidth}${after.boxShadow}${after.borderColor}` ===
            snap
          ) {
            bad.push(`${el.tagName}"${el.textContent?.trim().slice(0, 20)}"`);
          }
          (el as HTMLElement).blur();
        }
        return bad;
      });
      expect(noFocusRing).toEqual([]);
    });

    test("standalone controls meet the 24px minimum target size", async ({
      page,
    }) => {
      /*
       * WCAG 2.2 AA (2.5.8). Links sitting inside a sentence are exempt — the
       * spec's inline exception — so this only measures controls that are the
       * sole content of their block. That distinction is the whole reason
       * "Create account" (inline after "New here?") is not flagged while
       * "Forgot password?" (its own paragraph) was, and got padding.
       */
      const small = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll("a,button"))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          const parent = el.parentElement;
          const inline =
            parent && parent.textContent?.trim() !== el.textContent?.trim();
          if (inline) continue;
          if (r.height < 24 || r.width < 24) {
            out.push(
              `${el.tagName}"${el.textContent?.trim().slice(0, 24)}" ${Math.round(
                r.width
              )}x${Math.round(r.height)}`
            );
          }
        }
        return out;
      });
      expect(small).toEqual([]);
    });
  });
}
