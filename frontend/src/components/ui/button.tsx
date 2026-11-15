import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "action inline-flex items-center justify-center gap-2.5 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-[#1949a6]",
        secondary: "border border-[#dce5f0] bg-white text-[#21324b] hover:bg-[#f4f7fb]",
        quiet: "text-primary hover:bg-[#edf4ff]",
        danger: "border border-[#f1d2c8] bg-white text-[#a33427] hover:bg-[#fff6f3]",
      },
      size: {
        default: "min-h-12 px-5 text-sm",
        large: "min-h-14 px-6 text-[15px]",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
