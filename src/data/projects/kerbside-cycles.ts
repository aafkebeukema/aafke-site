import type { Project } from './types';

export const kerbsideCycles: Project = {
  id: 'kerbside-cycles',
  name: 'Kerbside Cycles',
  service: 'automations',
  trade: 'mobile-bike-repair',
  kind: 'example',
  status: 'published',
  landing: {
    slug: 'kerbside-cycles',
    seoTitle: "A quick example for Kerbside Cycles | Aafke Beukema",
    description:
      "Two moments from a mobile mechanic's day, automated: a booking captured from WhatsApp, and a live update drafted with a real ETA for you to send.",
    eyebrow: "A quick example, just for Kerbside Cycles",
    headline: 'Two moments from your Tuesday, automated.',
    introduction:
      "This is a mocked-up example built to show what's possible, not a live tool yet. If it looks useful, we build it for real.",
    steps: [
      {
        time: '8.12am',
        note: "You screenshot it. That's the whole of your job here.",
        demo: {
          type: 'chat',
          contact: 'Priya Shah',
          meta: 'Regular customer',
          messages: [
            {
              text: "Hiya! My gears keep slipping and the brakes feel a bit spongy, any chance you could swing by this week? I'm in Nunhead 🙏",
              time: '8:12',
            },
            {
              text: 'Yep, can sort that for you 👍',
              time: '8:13 ✓✓',
              direction: 'outgoing',
            },
          ],
        },
      },
      {
        time: '8.13am',
        note: "It slots straight into today's jobs.",
        demo: {
          type: 'calendar',
          day: 'Tuesday',
          date: '15 September',
          hours: ['8', '9', '10', '11', '12', '1', '2', '3', '4'],
          events: [
            { startRow: 3, endRow: 5, time: '9:00', title: 'Marcus · puncture repair' },
            { startRow: 6, endRow: 8, time: '10:30', title: 'Elsie · general service' },
            { startRow: 11, endRow: 13, time: '1:00', title: 'Tom · brake pads' },
            { startRow: 14, endRow: 16, time: '2:30', title: 'Steve · gears & brakes' },
            {
              startRow: 17,
              endRow: 19,
              time: '4:00 – 5:00',
              title: 'Priya · gears & brakes',
              detail: 'Nunhead · booked this morning',
              isNew: true,
            },
          ],
        },
      },
      {
        time: '3.42pm',
        note: 'One line, typed one-handed between jobs.',
        demo: {
          type: 'chat',
          contact: 'You → Automation',
          meta: 'WhatsApp',
          fromOwner: true,
          messages: [
            {
              text: 'still at steves, running a bit behind',
              time: '3:42 ✓✓',
              direction: 'outgoing',
            },
          ],
        },
      },
      {
        time: '3.43pm',
        note: "Sam copies it straight into Priya's chat. No typing from scratch, no awkward silence in the meantime.",
        demo: {
          type: 'draft',
          label: 'Ready to send to Priya',
          message:
            "Hi Priya, quick update from Sam, running a bit behind on today's jobs, should be with you in Nunhead by around 4.15 for the gears & brakes. Sorry about that!",
        },
      },
    ],
    callToAction: {
      heading: 'If this looks useful',
      body: "A few less stressful messages a day, every day, on top of never losing a booking that came in while you were halfway through a job. If this is worth five minutes to talk through for Kerbside Cycles specifically, I'd love to.",
      email: 'hello@aafke.co.uk',
    },
  },
};
