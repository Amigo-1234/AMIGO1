import { notFound } from "next/navigation";

// Any unmatched URL under a locale renders that locale's not-found page inside the root layout.
export default function CatchAll() {
  notFound();
}
