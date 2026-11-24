// The SONA survey's consent form. Every statement describes what the survey code actually
// does; facts not decided yet are marked [TO FILL: …] and must be filled in (and the form
// approved by the IRB) before the study is posted.

/** Who a participant writes to about the study or their data. Also shown on the error screen. */
export const SONA_CONTACT_EMAIL = '[TO FILL: email]';

export const SONA_STUDY_TITLE = '[TO FILL: title]';

export interface ConsentSection {
  title: string;
  paragraphs: string[];
}

/** The consent form's sections, given the estimated time in minutes and the number of clips. */
export function consentSections(minutes: number, trials: number): ConsentSection[] {
  return [
    {
      title: 'Study and researchers',
      paragraphs: [
        `${SONA_STUDY_TITLE}. Principal investigator: [TO FILL: PI], Penn Phonetics Lab, University of Pennsylvania.`,
      ],
    },
    {
      title: 'Purpose',
      paragraphs: [
        'We are studying whether listeners can hear emphasis (prosodic focus) in human and AI-generated speech: which word of a sentence a speaker stresses, and what that tells a listener.',
      ],
    },
    {
      title: 'Procedure',
      paragraphs: [
        `You will hear ${trials} short recordings of one sentence. After each recording you will answer three questions: how natural it sounded, whether the voice was a human or an AI system, and which question the sentence answers. At the end we ask for your name and email address.`,
      ],
    },
    { title: 'Time', paragraphs: [`About ${minutes} minutes.`] },
    { title: 'Compensation', paragraphs: ['[TO FILL: SONA credits].'] },
    {
      title: 'Risks and benefits',
      paragraphs: [
        'The risks are minimal, no greater than those of everyday listening. Please use headphones at a comfortable volume. You will not benefit directly from taking part.',
      ],
    },
    {
      title: 'Your rights',
      paragraphs: [
        'Taking part is voluntary. You can stop at any time, without penalty, by closing this page [TO FILL: credit policy].',
        `You can ask for your data to be withdrawn by writing to ${SONA_CONTACT_EMAIL}.`,
      ],
    },
    {
      title: 'Data we collect',
      paragraphs: [
        'Your answers; how long each answer took; how long you listened to each recording; your browser’s user agent (its name and version); your SONA ID, if the study link provides one; and, at the end, your name and email address.',
      ],
    },
    {
      title: 'How the data are used',
      paragraphs: ['Results are published only in aggregate and de-identified form. No published result names you.'],
    },
    {
      title: 'Storage',
      paragraphs: [
        'The data are stored with Supabase, a database provider, in a private project that only the research team can access.',
        'Your name and email address are kept in a separate table from your answers and are used only for [TO FILL: credit/follow-up].',
        'Retention: [TO FILL].',
      ],
    },
    {
      title: 'Contacts',
      paragraphs: [
        `Questions about the study: [TO FILL: researcher], ${SONA_CONTACT_EMAIL}.`,
        'Questions about your rights as a participant: the University of Pennsylvania Institutional Review Board (IRB), protocol [TO FILL: protocol #].',
      ],
    },
  ];
}
