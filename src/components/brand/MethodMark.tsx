/**
 * The mark (or marks) that belong to one payment method.
 *
 * One place decides what a method LOOKS like, so the pro page, the employer
 * checkout and the admin review queue cannot drift into showing bKash three
 * different ways.
 *
 * `card` is the one that resolves to more than one mark, and deliberately:
 * "Card" names a form factor, not a brand, and the thing a payer scans for is
 * whether their own scheme is accepted. A row of scheme marks answers that;
 * the word "Card" does not.
 *
 * `demo` resolves to nothing at all. There is no such company, and inventing
 * a logo for the method whose entire job is to say "this is not real" would
 * be the single most misleading mark on the screen.
 */

import React from "react";
import {
  BkashMark,
  GooglePayMark,
  MastercardMark,
  NagadMark,
  RocketMark,
  VisaMark,
} from "./PaymentMarks";
import type { PaymentMethodId } from "@/lib/payments/methods";

/**
 * Whether this method draws its own name.
 *
 * bKash, Nagad and Rocket render wordmarks, so printing "bKash" beside the
 * bKash wordmark says it twice. Card and Demo need the text label kept.
 */
export function markIsWordmark(id: PaymentMethodId): boolean {
  return id === "bkash" || id === "nagad" || id === "rocket";
}

export function MethodMark({
  id,
  height = 22,
}: {
  id: PaymentMethodId;
  height?: number;
}) {
  switch (id) {
    case "bkash":
      return <BkashMark height={height} />;
    case "nagad":
      return <NagadMark height={height} />;
    case "rocket":
      return <RocketMark height={height} />;
    case "card":
      return (
        <span className="flex items-center gap-2">
          <VisaMark height={height} />
          <MastercardMark height={height} />
          <GooglePayMark height={height} />
        </span>
      );
    case "demo":
      return null;
    default:
      return null;
  }
}

export default MethodMark;
