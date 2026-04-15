import { type ComponentProps } from "react";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      className={`h-8 w-full border border-border bg-grafito px-3 text-xs text-gris-200 placeholder:text-muted focus:border-cobalto focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Label({ className = "", ...props }: ComponentProps<"label">) {
  return (
    <label
      className={`text-[10px] font-medium uppercase tracking-wider text-muted ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <select
      className={`h-8 w-full border border-border bg-grafito px-2 text-xs text-gris-200 focus:border-cobalto focus:outline-none ${className}`}
      {...props}
    />
  );
}
