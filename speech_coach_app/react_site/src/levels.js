export const PASS_SCORE = 75;

export const levelGroups = [
  {
    id: 'words',
    title: 'Word Practice',
    subtitle: 'Build clean sounds first',
    levels: [
      { id: 1,  label: 'Cat',           type: 'word', target: 'cat',           focus: 'short /æ/ vowel' },
      { id: 2,  label: 'Dog',           type: 'word', target: 'dog',           focus: 'voiced stop + short vowel' },
      { id: 3,  label: 'Book',          type: 'word', target: 'book',          focus: 'short /ʊ/ vowel' },
      { id: 4,  label: 'Think',         type: 'word', target: 'think',         focus: 'TH /θ/ sound' },
      { id: 5,  label: 'Water',         type: 'word', target: 'water',         focus: 'W sound and flap T' },
      { id: 6,  label: 'Village',       type: 'word', target: 'village',       focus: 'V vs W distinction' },
      { id: 7,  label: 'Mother',        type: 'word', target: 'mother',        focus: 'voiced TH /ð/' },
      { id: 8,  label: 'School',        type: 'word', target: 'school',        focus: 'SK cluster' },
      { id: 9,  label: 'Three',         type: 'word', target: 'three',         focus: 'TH + R cluster' },
      { id: 10, label: 'Important',     type: 'word', target: 'important',     focus: 'stress on 2nd syllable' },
      { id: 11, label: 'Beautiful',     type: 'word', target: 'beautiful',     focus: 'BJ cluster + schwa' },
      { id: 12, label: 'Pronunciation', type: 'word', target: 'pronunciation', focus: 'multi-syllable stress' },
    ]
  },
  {
    id: 'phrases',
    title: 'Phrase Practice',
    subtitle: 'Connect words naturally',
    levels: [
      { id: 13, label: 'Thank You',             type: 'phrase', target: 'thank you',              focus: 'TH sound without rushing' },
      { id: 14, label: 'Good Morning',           type: 'phrase', target: 'good morning',            focus: 'smooth linking' },
      { id: 15, label: 'Nice to Meet You',       type: 'phrase', target: 'nice to meet you',        focus: 'connected speech' },
      { id: 16, label: 'I Would Like to Explain', type: 'phrase', target: 'I would like to explain', focus: 'rhythm and confidence' }
    ]
  },
  {
    id: 'sentences',
    title: 'Sentence Practice',
    subtitle: 'Speak complete thoughts',
    levels: [
      { id: 17, label: 'Learning Clearly',   type: 'sentence', target: 'I am learning to speak clearly.',                                focus: 'steady pace' },
      { id: 18, label: 'Communication',       type: 'sentence', target: 'Communication is very important for interviews.',                focus: 'word stress' },
      { id: 19, label: 'Project Confidence',  type: 'sentence', target: 'I can explain my project with confidence and clarity.',           focus: 'continuation without fumbling' }
    ]
  },
  {
    id: 'paragraph',
    title: 'Short Paragraph',
    subtitle: 'Practice continuous speech',
    levels: [
      {
        id: 20,
        label: 'Self Introduction',
        type: 'paragraph',
        target: 'Good morning. My name is Arpit. I am practicing spoken English so I can speak clearly in interviews and presentations.',
        focus: 'confidence, pace, and sentence flow'
      }
    ]
  }
];

export const allLevels = levelGroups.flatMap((group) =>
  group.levels.map((level) => ({ ...level, groupId: group.id, groupTitle: group.title }))
);

export function getLevel(levelId) {
  return allLevels.find((level) => level.id === Number(levelId)) || allLevels[0];
}
