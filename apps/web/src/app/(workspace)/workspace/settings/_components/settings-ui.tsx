"use client";

/** Building blocks shared by the Settings sections. */
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SectionShell({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="bg-muted text-muted-foreground mt-0.5 grid size-8 place-items-center rounded-md">
          <Icon className="size-4" />
        </div>
        <div>
          <h2 className="text-foreground text-lg font-semibold leading-tight">
            {title}
          </h2>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
      <div className="border-border bg-card divide-border divide-y rounded-lg border">
        {children}
      </div>
    </section>
  );
}

export function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 p-5 sm:grid-cols-[1fr_minmax(0,2fr)] sm:items-center sm:gap-6">
      <div>
        <div className="text-foreground text-sm font-medium">{label}</div>
        {description ? (
          <div className="text-muted-foreground mt-0.5 text-xs">
            {description}
          </div>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function CopyButton({
  value,
  label,
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {label ?? (copied ? "Copied" : "Copy")}
    </Button>
  );
}
