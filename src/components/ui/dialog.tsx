"use client"

import type * as React from "react"
import { useSyncExternalStore } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** Provide the Radix dialog's open state and accessibility context. */
function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

/** Render the control that opens its surrounding dialog. */
function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

/** Mount dialog content through the Radix portal. */
function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

/** Render a control that closes its surrounding dialog. */
function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/** Render the dialog's fixed, dimmed backdrop with open/close transitions. */
function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-120 bg-black/20 backdrop-blur-sm",
        className
      )}
      {...props}
    />
  )
}

/** Subscribe to visual viewport resizing and scrolling, returning a cleanup function. */
function subscribeViewport(onChange: () => void) {
  const viewport = window.visualViewport
  viewport?.addEventListener("resize", onChange)
  viewport?.addEventListener("scroll", onChange)
  return () => {
    viewport?.removeEventListener("resize", onChange)
    viewport?.removeEventListener("scroll", onChange)
  }
}

/** Serialize visual viewport bounds into a stable snapshot, or return null when unsupported. */
function viewportSnapshot() {
  const viewport = window.visualViewport
  return viewport
    ? [
        viewport.offsetLeft,
        viewport.offsetTop,
        viewport.width,
        viewport.height
      ].join(",")
    : null
}

/**
 * Center dialog content within the visible mobile viewport rather than the
 * wider layout viewport.
 *
 * Subscribe to visual viewport bounds and use the full viewport as a
 * server-rendering or unsupported-browser fallback.
 */
function DialogViewport({ children }: { children: React.ReactNode }) {
  // Wide mobile pages can pan a visual viewport inside a larger layout viewport.
  const snapshot = useSyncExternalStore(
    subscribeViewport,
    viewportSnapshot,
    () => null
  )
  const [left = 0, top = 0, width = 0, height = 0] =
    snapshot?.split(",").map(Number) ?? []
  return (
    <div
      data-slot="dialog-viewport"
      className="pointer-events-none fixed z-121 grid place-items-center p-4"
      style={snapshot ? { left, top, width, height } : { inset: 0 }}
    >
      {children}
    </div>
  )
}

/**
 * Render a portaled, scrollable dialog panel with backdrop, viewport
 * positioning and a close control.
 */
function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogViewport>
        <DialogPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 pointer-events-auto relative grid max-h-full w-full max-w-lg gap-4 overflow-y-auto rounded-lg border p-6 shadow-lg duration-200",
            className
          )}
          {...props}
        >
          {children}
          <DialogPrimitive.Close
            aria-label="Fermer"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 cursor-pointer rounded-xs opacity-70 transition-opacity not-disabled:hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogViewport>
    </DialogPortal>
  )
}

/** Group a dialog's heading content with responsive text alignment. */
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

/**
 * Lay out dialog actions vertically on small screens and trailing horizontally
 * on larger screens.
 */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

/** Render the styled Radix title used as the dialog's accessible name. */
function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

/** Render the styled Radix description associated with the dialog. */
function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
}
