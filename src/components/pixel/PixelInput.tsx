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
 * PixelInput — labeled field with a 3px ink border. Error state flips the
 * border + shadow to alert red and prints the message underneath in mono.
 */
export function PixelInput(props: InputProps | SelectProps) {
  const { label, name, error, hint, required, className } = props;
  const fieldClass = cx(
    "w-full border-3 bg-paper px-3 py-2 font-mono text-sm text-ink",
    "placeholder:text-grey focus:outline-none focus:shadow-pixel-sm",
    error ? "border-alert shadow-[3px_3px_0_0_#E5533D]" : "border-ink"
  );

  return (
    <div className={cx("w-full", className)}>
      <label
        htmlFor={name}
        className="mb-1 block font-mono text-[11px] font-bold uppercase tracking-widest text-ink"
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
          className={cx(fieldClass, "appearance-none")}
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
          className={fieldClass}
        />
      )}

      {error ? (
        <p className="mt-1 flex items-center gap-1 font-mono text-[11px] font-bold text-alert">
          ! {error}
        </p>
      ) : hint ? (
        <p className="mt-1 font-mono text-[11px] text-grey">{hint}</p>
      ) : null}
    </div>
  );
}

export default PixelInput;
