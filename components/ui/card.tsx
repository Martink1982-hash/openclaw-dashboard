import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "w-full rounded-2xl border border-slate-800 bg-white/5 shadow-lg shadow-slate-950/60",
  {
    variants: {
      intent: {
        default: "",
        subtle: "border-slate-800/70 bg-slate-950/60",
        elevated: "shadow-xl"
      }
    },
    defaultVariants: {
      intent: "default"
    }
  }
);

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>((props, ref) => {
  const { className, intent, ...rest } = props;
  return <div ref={ref} className={cn(cardVariants({ intent }), className)} {...rest} />;
});
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1 p-4", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn("text-lg font-semibold text-slate-50", className)} {...props} />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-slate-400", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("px-4 pb-4 pt-2", className)} {...props} />
));
CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center px-4 pb-4", className)} {...props} />
));
CardFooter.displayName = "CardFooter";
