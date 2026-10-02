// MinistryFilter — chips de filtro por ministerio/entidad

export function MinistryFilter({
  options,
  selected,
  onChange,
}: {
  options: { slug: string; title: string; count: number }[];
  selected: string; // "all" o slug
  onChange: (slug: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Chip
        label={`Todos (${options.reduce((a, o) => a + o.count, 0)})`}
        active={selected === "all"}
        onClick={() => onChange("all")}
      />
      {options.map((o) => (
        <Chip
          key={o.slug}
          label={`${o.title} (${o.count})`}
          active={selected === o.slug}
          onClick={() => onChange(o.slug)}
        />
      ))}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition whitespace-nowrap ${
        active
          ? "bg-accent/15 border-accent/40 text-accent"
          : "border-line text-fg-soft hover:border-accent/30 hover:text-fg"
      }`}
    >
      {label}
    </button>
  );
}
