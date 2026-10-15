import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "btn inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "btn-primary bg-primary text-primary-foreground hover:bg-primary-hover",
        accent: "bg-accent text-accent-foreground hover:brightness-95",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border !border-border bg-transparent hover:bg-muted text-foreground",
        ghost: "hover:bg-muted text-foreground",
        link: "text-primary underline-offset-4 hover:underline !border-0 !shadow-none",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        inverse: "bg-foreground text-background hover:opacity-90",
      },
      size: {
        xs: "h-8 px-3 text-xs",
        sm: "h-9 px-3.5 text-sm",
        default: "h-11 px-5 text-sm",
        lg: "h-12 px-7 text-base",
        xl: "h-14 px-9 text-lg",
        icon: "size-11",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "default"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
