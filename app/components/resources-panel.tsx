import { INDIA_TRANSIT_VISA_LINKS, OFFICIAL_DIRECTORY } from "@/lib/resource-directory";

export function ResourcesPanel() {
  const wellbeing = OFFICIAL_DIRECTORY.filter((e) => e.type === "wellbeing");
  const airlines = OFFICIAL_DIRECTORY.filter((e) => e.type === "airline");
  const govTransport = OFFICIAL_DIRECTORY.filter((e) => e.type === "government" || e.type === "transport");

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 md:px-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">
        Resources &amp; Contacts
      </p>

      {wellbeing.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-[var(--green)]">Emergency &amp; Wellbeing</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {wellbeing.map((entry) => (
              <article key={entry.name} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="font-medium text-sm">{entry.name}</p>
                {entry.phone && (
                  <a href={`tel:${entry.phone.replace(/\s/g, "")}`} className="mt-1 block text-sm font-mono text-[var(--green)]">
                    {entry.phone}
                  </a>
                )}
                {entry.note && <p className="mt-1 text-xs text-[var(--text-secondary)]">{entry.note}</p>}
                <a href={entry.contactPage} target="_blank" className="mt-2 inline-block text-xs text-[var(--primary-blue)] underline">
                  Official page
                </a>
              </article>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Airlines</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {airlines.map((entry) => (
            <article key={entry.name} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="font-medium text-sm">{entry.name}</p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{entry.region}</p>
              {entry.phone && (
                <a href={`tel:${entry.phone.replace(/\s/g, "")}`} className="mt-1 block text-sm font-mono text-[var(--primary-blue)]">
                  {entry.phone}
                </a>
              )}
              <a href={entry.contactPage} target="_blank" className="mt-2 inline-block text-xs text-[var(--primary-blue)] underline">
                Contact page
              </a>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Government &amp; Embassies</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {govTransport.map((entry) => (
            <article key={entry.name} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="font-medium text-sm">{entry.name}</p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{entry.region}</p>
              {entry.phone && (
                <a href={`tel:${entry.phone.replace(/\s/g, "")}`} className="mt-1 block text-sm font-mono text-[var(--primary-blue)]">
                  {entry.phone}
                </a>
              )}
              <a href={entry.contactPage} target="_blank" className="mt-2 inline-block text-xs text-[var(--primary-blue)] underline">
                Contact page
              </a>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">India Transit &amp; Visa</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {INDIA_TRANSIT_VISA_LINKS.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <p className="text-sm font-medium text-[var(--primary-blue)]">{link.label}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{link.note}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
