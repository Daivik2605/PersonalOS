export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-prose text-sm text-slate-600 dark:text-slate-400">{note}</p>
    </section>
  )
}
