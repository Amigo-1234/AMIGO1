/** Shown while a portal page loads: a calm placeholder, no layout shift for the header. */
export default function PortalLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl animate-pulse px-4 py-10 sm:px-6" aria-busy="true">
      <div className="h-4 w-32 rounded bg-sand-200" />
      <div className="mt-4 h-8 w-64 rounded bg-sand-200" />
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="h-40 rounded-lg bg-sand-100" />
        <div className="h-40 rounded-lg bg-sand-100" />
      </div>
    </div>
  );
}
