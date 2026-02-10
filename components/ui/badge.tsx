import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest", {
  variants: {
    intent: {
      default: "bg-slate-800/70 text-slate-200",
      success: "bg-emerald-500/20 text-emerald-200",
      warning: "bg-amber-500/20 text-amber-200",
      danger: "bg-rose-500/20 text-rose-200"
    }
  },
  defaultVariants: {
    intent: "default"
  }
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(({ intent, className, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ intent }), className)} {...props} />
));
Badge.displayName = "Badge";
