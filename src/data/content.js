/**
 * SHARED CONTRACT — site copy. Read-only for feature modules.
 *
 * POSITIONING, AND WHY: Michael is brand new to ponds and koi. So this site
 * NEVER claims expertise, certifications, years of experience, or fish-health
 * diagnosis, and carries NO invented testimonials. What it sells is what is
 * actually true and still worth money: shows up fast, does the heavy filthy
 * work, tells you the price before starting, and admits what he doesn't know.
 * Do not "improve" this copy by adding credentials. Add them when he earns them.
 */
import { TRAVEL } from './services.js'

const FREE_MI = TRAVEL.freeRadiusMiles
const PER_MI = TRAVEL.perMile.toFixed(2)

export const BRAND = {
  name: 'The Koi Wrangler',
  nameStacked: ['The Koi', 'Wrangler'],
  tagline: 'Pond cleaning, done honest.',
  phone: '(555) 017-3042',
  phoneHref: 'tel:+15550173042',
  email: 'book@koiwrangler.com',
  area: `Statewide — first ${FREE_MI} miles free`,
  hours: 'Mon – Sat, 7am – 6pm',
  // Eddie handles anything to do with the fish themselves.
  specialist: { name: 'Eddie', role: 'koi specialist', email: 'eddie@koiwrangler.com' },
}

export const HERO = {
  kicker: 'Pond cleaning & safe koi handling',
  headline: 'Pond cleaning, done honest.',
  sub: 'I drain it, muck it out, scrub it down and put your fish back safe. Prices on the website, no sales pitch, no surprise invoice.',
  ctaPrimary: { label: 'Book online', href: '#book' },
  ctaSecondary: { label: 'See prices', href: '#services' },
  scrollHint: 'Scroll to dive in',
}

/** The honest pitch. These are the only claims the site makes. */
export const PROMISES = [
  { icon: 'watch', emoji: '🕖', title: 'I show up when I said',
    body: 'A booked time is a real time. If I am running late you get a text, not silence.' },
  { icon: 'tag', emoji: '🏷️', title: 'The price is on the website',
    body: 'Pick your pond size and see the number before you ever talk to me. No "it depends" games.' },
  { icon: 'wader', emoji: '💪', title: 'I do the filthy part',
    body: 'Waders on, muck out, scrub the rocks. This is labour you do not want to do on a Saturday.' },
  { icon: 'ledger', emoji: '🤝', title: 'The fish side is Eddie\u2019s',
    body: 'I am good at cleaning, and I do not pretend to be a koi expert. Eddie is our koi specialist and he handles anything to do with the fish themselves. Between us you get a straight answer instead of a guess.' },
]

export const ABOUT = {
  eyebrow: 'Straight talk',
  title: 'Two of us. One does the muck, one knows the fish.',
  body: [
    'I am Michael, and The Koi Wrangler is a new outfit — so let me be upfront about how it works.',
    'I do the hard, dirty, physical part: get the water out, get the muck out, get the algae off the rocks, handle your fish gently with the right nets and an aerated holding tank, and put everything back the way it should be. I quote it up front, I show up when I said, and if I break something I replace it.',
    'What I am not is a koi expert, and I will not pretend to be one. That is why Eddie is here. He is our koi specialist and the fish themselves are his department — health, handling, what the water chemistry is doing to them, whether that mark on your prize kohaku is worth worrying about.',
    'Between the two of us you get a clean pond and a straight answer. Where neither of us knows, we will say so and tell you who does, rather than guessing with a fish worth more than the job.',
  ],
  signature: '— Michael, owner · with Eddie, koi specialist',
}

export const FAQ = [
  { q: 'Will you hurt my koi?',
    a: 'Nets matter more than skill here: I use soft knotless nets that do not strip their protective slime coat, move them into a tank of their own pond water with an air stone, match temperature before they go back, and count heads in and out. No chasing, no buckets, no sudden temperature swings.' },
  { q: 'Can you tell me why my fish is sick?',
    a: 'Ask Eddie — the fish are his department, not mine. He will look at the animal and at what the water chemistry is doing to it, and tell you straight whether it is something we can sort out or something that needs a koi vet. If it is beyond us, you get the name of someone better rather than a guess.' },
  { q: 'How often does a pond need a full clean?',
    a: 'Most backyard koi ponds want one full deep clean a year, usually spring, plus ongoing upkeep in between. If the bottom muck is more than an inch deep or the water smells like a ditch, it is time.' },
  { q: 'Do I have to sign a contract for monthly keeping?',
    a: 'No. Monthly Pond Keeping is month to month and you can stop whenever you like. If it needed a contract to keep you, it was not worth paying for.' },
  { q: 'How far will you travel?',
    a: `Statewide. The first ${FREE_MI} miles from my base are free, after that it is $${PER_MI} a mile round trip and the exact figure is in your quote before you agree to anything.` },
  { q: 'What if it costs more once you see it?',
    a: 'Then I stop and tell you, with a number, before any extra work happens. The booking price assumes a normal pond for its size. Genuine surprises — a cracked liner, a dead pump, four years of leaf mulch — get quoted on the spot and you can say no.' },
  { q: 'Are you insured?',
    a: 'Yes, general liability. Certificate available on request before I set foot on your property.' },
  { q: 'Do you clean anything besides koi ponds?',
    a: 'Water features, fountains, goldfish ponds, farm troughs — yes. Swimming pools — no, wrong trade entirely.' },
]

export const AREA = {
  eyebrow: 'Service area',
  title: 'Statewide, and honest about the drive',
  body: `I will come to you anywhere in the state. The first ${FREE_MI} miles from base costs you nothing extra. Beyond that it is $${PER_MI} per mile round trip, calculated and shown to you in the quote — not slipped onto the invoice afterwards.`,
}

export const BOOKING_INTRO = {
  eyebrow: 'Book online',
  title: 'Four questions, a real price, done',
  body: 'Tell me the pond size and what it needs. You will see the exact price as you go, and your summary is ready to send the moment you are done.',
}
