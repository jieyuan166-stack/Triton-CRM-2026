// app/(auth)/layout.tsx — minimal layout for login / signup pages.
// No top nav, no sidebar — just the centred card on a soft surface.

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full flex items-center justify-center bg-slate-50 px-4 py-12">
      {children}
    </div>
  );
}
