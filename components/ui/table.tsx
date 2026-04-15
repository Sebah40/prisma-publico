import { type ComponentProps } from "react";

export function Table({ className = "", ...props }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={`w-full border-collapse text-left ${className}`}
        {...props}
      />
    </div>
  );
}

export function Thead({ className = "", ...props }: ComponentProps<"thead">) {
  return (
    <thead
      className={`border-b border-border bg-grafito text-[10px] uppercase tracking-wider text-muted ${className}`}
      {...props}
    />
  );
}

export function Th({ className = "", ...props }: ComponentProps<"th">) {
  return (
    <th
      className={`px-3 py-2 font-medium ${className}`}
      {...props}
    />
  );
}

export function Tbody({ className = "", ...props }: ComponentProps<"tbody">) {
  return <tbody className={`divide-y divide-border ${className}`} {...props} />;
}

export function Tr({ className = "", ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={`hover:bg-grafito/50 ${className}`}
      {...props}
    />
  );
}

export function Td({ className = "", ...props }: ComponentProps<"td">) {
  return (
    <td
      className={`px-3 py-1.5 text-gris-200 ${className}`}
      {...props}
    />
  );
}
