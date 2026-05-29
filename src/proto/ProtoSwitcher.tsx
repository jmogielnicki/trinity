/* Tiny fixed nav so you can hop between the three prototype themes and home.
   It is intentionally un-themed (neutral dark chip) so it reads as scaffolding,
   not part of any proposal. */
const links = [
  { href: '/', label: 'Live app' },
  { href: '/optiona', label: 'A · Evergreen' },
  { href: '/optionb', label: 'B · Midnight' },
  { href: '/optionc', label: 'C · Sunrise' },
];

export function ProtoSwitcher({ current }: { current: string }) {
  return (
    <div
      className="fixed z-[100] left-1/2 -translate-x-1/2 bottom-4 flex items-center gap-1 p-1 rounded-full"
      style={{
        background: 'rgba(17,19,34,0.92)',
        boxShadow: '0 12px 30px -8px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {links.map((l) => {
        const active = l.href === current;
        return (
          <a
            key={l.href}
            href={l.href}
            className="px-3.5 py-1.5 rounded-full font-semibold no-underline transition"
            style={{
              fontSize: 12.5,
              color: active ? '#0A0E18' : '#C7CEDC',
              background: active ? '#2EE6C3' : 'transparent',
            }}
          >
            {l.label}
          </a>
        );
      })}
    </div>
  );
}
