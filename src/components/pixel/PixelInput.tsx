"use client";

import React from "react";
import { cx } from "@/lib/cx";

type Common = {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
};

type InputProps = Common & {
  as?: "input";
  type?: "text" | "email" | "password" | "number" | "date";
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  step?: string;
};

type SelectProps = Common & {
  as: "select";
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
};

/**
 * PixelInput — labelled field.
 *
 * The label was upper-case letter-spaced mono at 11px, which is a decorative
 * treatment that costs legibility on the one element users must read to know
 * what to type. It is now sentence case at a readable size.
 *
 * The error state kept a hardcoded `shadow-[3px_3px_0_0_#E5533D]` — an offset
 * in a colour that had already been retired from the palette. It is a ring
 * now, and it takes its colour from the token.
 */
export function PixelInput(props: InputProps | SelectProps) {
  const { label, name, error, hint, required, className } = props;

  /*
   * The field already had a real <label for>. What it did not have was any
   * connection between the input and the message under it: a screen reader
   * read the label, then the value, then stopped — the error was on screen and
   * absent from the accessible name. `aria-describedby` attaches whichever
   * message is rendered, `aria-invalid` marks the field itself as failing, and
   * `role="alert"` announces a new error without the user having to go looking
   * for it.
   */
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined;
  const fieldClass = cx(
    "w-full rounded-lg border bg-paper px-3 py-2.5 font-sans text-[14px] text-ink",
    "placeholder:text-ui-faint focus:outline-none focus:ring-2",
    error
      ? "border-alert focus:border-alert focus:ring-alert/20"
      : "border-ui-lineStrong focus:border-amber focus:ring-amber/20"
  );

  return (
    <div className={cx("w-full", className)}>
      <label
        htmlFor={name}
        className="mb-1.5 block font-sans text-[13px] font-medium text-ink"
      >
        {label}
        {required && <span className="text-alert"> *</span>}
      </label>

      {props.as === "select" ? (
        <select
          id={name}
          name={name}
          required={required}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={fieldClass}
        >
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={name}
          name={name}
          type={props.type ?? "text"}
          required={required}
          value={props.value}
          min={props.min}
          max={props.max}
          step={props.step}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={fieldClass}
        />
      )}

      {error ? (
        <p
          id={`${name}-error`}
          role="alert"
          className="mt-1.5 font-sans text-[13px] font-medium text-alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="mt-1.5 font-sans text-[13px] text-ui-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default PixelInput;
