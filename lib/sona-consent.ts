// The SONA survey's consent form. Every statement describes what the survey code actually
// does. The IRB protocol number is on the study's SONA listing, which the form links to.

/** Who a participant writes to about the study or their data. Also shown on the error screen. */
export const SONA_CONTACT_EMAIL = 'jxia8@engineering.upenn.edu';

export const SONA_STUDY_TITLE = 'Human perception of AI generated voices';

/** The study's SONA listing, linked from the consent form's title. */
export const SONA_STUDY_URL = 'https://upenn.sona-systems.com/exp_info.aspx?experiment_id=1660';

/** A run of plain text, or a link (opened in a new tab so the survey keeps its place). */
export type ConsentPart = string | { text: string; href: string };

export interface ConsentSection {
  title: string;
  /** Each paragraph is plain text, or a list of parts when it carries a link. */
  paragraphs: (string | ConsentPart[])[];
}

/** The consent form's sections, given the estimated time in minutes and the number of clips. */
export function consentSections(minutes: number, trials: number): ConsentSection[] {
  return [
    {
      title: 'Study and researchers',
      paragraphs: [
        [
          { text: SONA_STUDY_TITLE, href: SONA_STUDY_URL },
          '. Researcher: Justin Xia. Principal investigator: Jianjing Kuang, Penn Phonetics Lab, University of Pennsylvania.',
        ],
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
    { title: 'Compensation', paragraphs: ['You will be granted SONA credit when you complete the study.'] },
    {
      title: 'Risks and benefits',
      paragraphs: [
        'The risks are minimal, no greater than those of everyday listening. Please use headphones at a comfortable volume. You will not benefit directly from taking part.',
      ],
    },
    {
      title: 'Your rights',
      paragraphs: [
        'Taking part is voluntary. You can stop at any time, without penalty, by closing this page. If you stop before the end, no credit is granted.',
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
        'Your name and email address are kept in a separate table from your answers and are used only to grant your SONA credit.',
        'Retention: the data are kept indefinitely. You are never identified in any use of them.',
      ],
    },
    {
      title: 'Contacts',
      paragraphs: [
        `Questions about the study: Justin Xia, ${SONA_CONTACT_EMAIL}.`,
        [
          'Questions about your rights as a participant: the University of Pennsylvania Institutional Review Board (IRB). The protocol number is listed on the ',
          { text: 'study’s SONA page', href: SONA_STUDY_URL },
          '.',
        ],
      ],
    },
  ];
}
