import { BookOpenCheck, MessagesSquare, ShieldCheck, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { BrandMark, ThemeToggle } from '@/components/shared'

const HIGHLIGHTS = [
  { icon: BookOpenCheck, title: 'Courses, resources & marks', text: 'Everything for your classes in one calm place.' },
  { icon: MessagesSquare, title: 'Live classroom chat', text: 'Talk with your class in real time.' },
  { icon: ShieldCheck, title: 'Private by design', text: 'Every file and grade is visible only to the right people.' },
]

/** Split-screen auth layout: brand panel on desktop, compact header on mobile. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="aurora relative hidden overflow-hidden p-10 text-ink-foreground lg:flex lg:flex-col">
        <div className="grid-pattern absolute inset-0 opacity-60" aria-hidden />
        <div className="relative">
          <BrandMark />
        </div>
        <div className="relative my-auto max-w-md">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium backdrop-blur">
            <Sparkles className="size-3.5 text-accent" /> German University of Technology · Learning portal
          </p>
          <h2 className="font-display text-4xl font-bold leading-[1.1] xl:text-5xl">
            Learn, teach and <span className="bg-gradient-to-r from-teal-300 to-amber-300 bg-clip-text text-transparent">grow together.</span>
          </h2>
          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title: t, text }) => (
              <li key={t} className="flex gap-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 backdrop-blur">
                  <Icon className="size-5 text-teal-300" />
                </div>
                <div>
                  <p className="font-semibold">{t}</p>
                  <p className="text-sm text-ink-foreground/70">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-ink-foreground/50">Accounts are created by the GUtech admin team.</p>
      </aside>

      <main className="relative flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <BrandMark className="lg:hidden" />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className="animate-fade-up">
            <h1 className="text-3xl font-bold">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </main>
    </div>
  )
}
