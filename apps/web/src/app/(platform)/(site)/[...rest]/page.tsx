import { notFound } from "next/navigation";

/** Unmatched platform URLs render the branded (site)/not-found.tsx inside the marketing chrome. */
export default function CatchAll() {
  notFound();
}
