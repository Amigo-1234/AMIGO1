"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dictionaries } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/config";

/** Portal error boundary: a plain, translated message and a retry; no technical details. */
export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  const params = useParams<{ locale: string }>();
  const P = dictionaries[isLocale(params.locale) ? params.locale : "en"].portal;
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16">
      <Card className="p-6 text-center">
        <h1 className="text-xl font-semibold text-brand-950">{P.errorTitle}</h1>
        <p className="mt-2 text-charcoal-700">{P.errorBody}</p>
        <Button className="mt-5" onClick={reset}>
          {P.retry}
        </Button>
      </Card>
    </div>
  );
}
