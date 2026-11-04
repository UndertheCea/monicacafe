import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative flex min-h-screen items-center justify-center bg-stone-900 px-4 text-center">
        <div className="max-w-4xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">
            Single Origin · Direct Trade
          </p>
          <h1 className="mb-6 text-5xl font-bold leading-tight text-white md:text-7xl">
            Coffee that tells{" "}
            <span className="italic text-amber-300">a story</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-stone-300">
            We work directly with the world&apos;s finest producers to bring you
            exceptional coffees you can taste the difference in — from harvest
            to your cup.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/coffees"
              className="rounded-full bg-amber-400 px-8 py-4 font-semibold text-stone-900 transition hover:bg-amber-300"
            >
              Shop Coffees
            </Link>
            <Link
              href="/subscribe"
              className="rounded-full border border-white/30 px-8 py-4 font-semibold text-white backdrop-blur-sm transition hover:border-white/60"
            >
              Subscribe &amp; Save
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-stone-50 px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-16 text-center text-3xl font-bold text-stone-900">
            Why Monica Cafe?
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: "🌍",
                title: "Direct from Producers",
                body: "We build lasting relationships with farmers and cooperatives in Ethiopia, Colombia, Guatemala, and beyond.",
              },
              {
                icon: "☕",
                title: "Roasted to Order",
                body: "Every bag is roasted within 48 hours of shipping, so you always receive the freshest possible coffee.",
              },
              {
                icon: "📦",
                title: "Flexible Subscriptions",
                body: "Choose your roast, grind, and cadence. Skip, pause, or cancel anytime — no questions asked.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-stone-100"
              >
                <span className="mb-4 block text-4xl">{f.icon}</span>
                <h3 className="mb-3 text-lg font-semibold text-stone-900">
                  {f.title}
                </h3>
                <p className="text-stone-500">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
