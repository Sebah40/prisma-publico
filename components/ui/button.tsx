import { type ComponentProps } from "react";

type Variant = "primary" | "default" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-cobalto text-white hover:bg-cobalto-claro",
  default: "bg-grafito text-gris-200 border border-border hover:bg-gris-800",
  ghost: "text-gris-400 hover:text-gris-200 hover:bg-grafito",
};

interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
}

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
