"use client";

import * as React from "react";

export interface MediaPlanesProps {
  children?: React.ReactNode;
  /** liquid hover distortion strength 0..1 */
  hover?: number;
  /** scroll-velocity bend 0..1 */
  bend?: number;
  className?: string;
}

/**
 * P2 (not yet implemented as WebGL): scope for `[data-media-plane]` images that will get liquid hover + scroll bend.
 * Today it renders its children unchanged, so sections can adopt the API safely.
 */
export function MediaPlanes({ children, className }: MediaPlanesProps) {
  return (
    <div className={className} data-media-planes="">
      {children}
    </div>
  );
}
