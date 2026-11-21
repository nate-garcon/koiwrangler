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
  { icon: 'ledger', emoji: '🤝', title: 'I tell you what I do not know',
    body: 'I am good at cleaning. If something is beyond me I will say so and point you to someone who knows, instead of guessing with a fish worth more than the job.' },
]

export const ABOUT = {
  eyebrow: 'Straight talk',
  title: 'New business. Old-fashioned about it.',
  body: [
    'I am Michael, and The Koi Wrangler is a new outfit — so let me be upfront about what that means for you.',
    'I do the hard, dirty, physical part: get the water out, get the muck out, get the algae off the rocks, handle your fish gently with the right nets and an aerated holding tank, and put everything back the way it should be. I quote it up front, I show up when I said, and if I break something I replace it.',
    'I am careful, insured, and honest about my own limits, which is more than you can say for some of the operations that will quote you over the phone sight-unseen.',
    'Where something is beyond me, I will say so and tell you who to call, rather than guessing with a fish worth more than the job.',
    'You may be wondering why a one-man pond cleaning operation has a website with a scroll-synchronised underwater camera and eight individually patterned koi rendered in real time. So am I. It seemed important at the time.',
  ],
  signature: '— Michael, owner',
}

export const FAQ = [
  { q: 'Will you hurt my koi?',
    a: 'Nets matter more than skill here: I use soft knotless nets that do not strip their protective slime coat, move them into a tank of their own pond water with an air stone, match temperature before they go back, and count heads in and out. No chasing, no buckets, no sudden temperature swings.' },
  { q: 'Can you tell me why my fish is sick?',
    a: 'I can tell you what your water chemistry is doing, because I test it. For anything on the fish itself — ulcers, flashing, gasping, white spots — you want a koi vet or an experienced breeder, and I will happily give you names rather than guess.' },
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
  { q: 'Why is this website like this?',
    a: 'I asked for a website. Things got away from us. The pond you have been scrolling through cleans itself as you read, which is more than I can say for yours.' },
  { q: 'Do you clean anything besides koi ponds?',
    a: 'Water features, fountains, goldfish ponds, farm troughs — yes. Swimming pools — no, wrong trade entirely.' },
]

/**
 * Footer quips. The joke this site is allowed to make is about ITSELF — a
 * plain one-man business with an absurdly over-built website — never about
 * anybody who works here. One is picked at random per load.
 */
export const FOOTER_QUIPS = [
  'No koi were consulted in the making of this website.',
  'This website contains more fish than Michael has cleaned.',
  'Absurdly over-engineered for a man with a bucket.',
  'The pond above is rendered in real time. The muck in yours is not.',
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
