import { Notice } from "@/components/ui/notice";

/** Shows a message for a `?reason=` redirect (expired session, signed out, ...). */
export function ReasonNotice({
  reason,
  messages,
}: {
  reason: string | string[] | undefined;
  messages: Record<string, { text: string; tone: "info" | "warning" | "danger" }>;
}) {
  const key = typeof reason === "string" ? reason : undefined;
  const message = key ? messages[key] : undefined;
  return message ? (
    <Notice tone={message.tone} className="mb-6">
      {message.text}
    </Notice>
  ) : null;
}
