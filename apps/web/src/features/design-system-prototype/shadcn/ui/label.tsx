import * as RadixLabel from "@radix-ui/react-label";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "./cn";

export const Label = forwardRef<
  ElementRef<typeof RadixLabel.Root>,
  ComponentPropsWithoutRef<typeof RadixLabel.Root>
>(({ className, ...props }, ref) => (
  <RadixLabel.Root
    ref={ref}
    className={cn("text-sm font-medium text-slate-900", className)}
    {...props}
  />
));
Label.displayName = "Label";
