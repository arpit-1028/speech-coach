// ────────────────────────────────────────────────────────────────────────────
//  levels.js  —  5 Stages × 20 Questions = 100 Total
//  Unlock rules (handled in progress.js):
//    • First 2 questions of EVERY stage are open from the start.
//    • Within a stage: need 70+ on question N to unlock question N+1.
//    • Next stage's first 2 open only after all 20 of current stage passed (70+).
// ────────────────────────────────────────────────────────────────────────────

export const PASS_SCORE = 70;

// ── Stage definitions ─────────────────────────────────────────────────────────
export const stages = [
  // ── STAGE 1 : Easy → Medium Words ─────────────────────────────────────────
  {
    id: 1,
    title: 'Stage 1',
    subtitle: 'Easy → Medium Words',
    emoji: '🌱',
    color: '#10b981',
    description: 'Common everyday words — build confidence with clean sounds.',
    questions: [
      { id: 1,  label: 'Cat',       target: 'cat',       focus: 'short /æ/ vowel',           type: 'word' },
      { id: 2,  label: 'Dog',       target: 'dog',       focus: 'voiced stop + short vowel', type: 'word' },
      { id: 3,  label: 'Book',      target: 'book',      focus: 'short /ʊ/ vowel',           type: 'word' },
      { id: 4,  label: 'Ball',      target: 'ball',      focus: 'long /ɔː/ vowel',           type: 'word' },
      { id: 5,  label: 'Map',       target: 'map',       focus: 'bilabial stop + /æ/',       type: 'word' },
      { id: 6,  label: 'Run',       target: 'run',       focus: 'short /ʌ/ vowel',           type: 'word' },
      { id: 7,  label: 'Fish',      target: 'fish',      focus: '/ɪ/ vowel + /ʃ/',           type: 'word' },
      { id: 8,  label: 'Bird',      target: 'bird',      focus: '/ɜːr/ vowel',               type: 'word' },
      { id: 9,  label: 'Sun',       target: 'sun',       focus: '/s/ onset + /ʌ/',           type: 'word' },
      { id: 10, label: 'Rain',      target: 'rain',      focus: '/reɪn/ diphthong',          type: 'word' },
      { id: 11, label: 'Tree',      target: 'tree',      focus: '/tr/ cluster + long /iː/',  type: 'word' },
      { id: 12, label: 'Blue',      target: 'blue',      focus: '/bl/ cluster + /uː/',       type: 'word' },
      { id: 13, label: 'Star',      target: 'star',      focus: '/st/ cluster + /ɑːr/',      type: 'word' },
      { id: 14, label: 'Play',      target: 'play',      focus: '/pl/ cluster + /eɪ/',       type: 'word' },
      { id: 15, label: 'Milk',      target: 'milk',      focus: '/ɪ/ + /lk/ coda cluster',  type: 'word' },
      { id: 16, label: 'Frog',      target: 'frog',      focus: '/fr/ cluster',              type: 'word' },
      { id: 17, label: 'Skip',      target: 'skip',      focus: '/sk/ cluster + short /ɪ/', type: 'word' },
      { id: 18, label: 'Drum',      target: 'drum',      focus: '/dr/ cluster',              type: 'word' },
      { id: 19, label: 'Chest',     target: 'chest',     focus: '/tʃ/ affricate',            type: 'word' },
      { id: 20, label: 'Judge',     target: 'judge',     focus: '/dʒ/ affricate',            type: 'word' },
    ]
  },

  // ── STAGE 2 : Medium → Hard Words ─────────────────────────────────────────
  {
    id: 2,
    title: 'Stage 2',
    subtitle: 'Medium → Hard Words',
    emoji: '🔥',
    color: '#f59e0b',
    description: 'Tricky sounds — TH, V/W, consonant clusters and multi-syllable stress.',
    questions: [
      { id: 21, label: 'Think',         target: 'think',         focus: 'TH /θ/ sound',                  type: 'word' },
      { id: 22, label: 'Mother',        target: 'mother',        focus: 'voiced TH /ð/',                  type: 'word' },
      { id: 23, label: 'Three',         target: 'three',         focus: 'TH + R cluster',                 type: 'word' },
      { id: 24, label: 'Water',         target: 'water',         focus: 'W sound and flap T',             type: 'word' },
      { id: 25, label: 'Village',       target: 'village',       focus: 'V vs W distinction',             type: 'word' },
      { id: 26, label: 'School',        target: 'school',        focus: 'SK cluster',                     type: 'word' },
      { id: 27, label: 'World',         target: 'world',         focus: '/wɜːrld/ complex coda',          type: 'word' },
      { id: 28, label: 'Strength',      target: 'strength',      focus: '/strɛŋθ/ complex cluster',       type: 'word' },
      { id: 29, label: 'Clothes',       target: 'clothes',       focus: '/kloʊðz/ voiced TH coda',       type: 'word' },
      { id: 30, label: 'Sixth',         target: 'sixth',         focus: '/sɪksθ/ multiple sibilants',     type: 'word' },
      { id: 31, label: 'Comfortable',   target: 'comfortable',   focus: 'stress + reduced vowels',        type: 'word' },
      { id: 32, label: 'Vegetable',     target: 'vegetable',     focus: 'syllable reduction',             type: 'word' },
      { id: 33, label: 'Particularly',  target: 'particularly',  focus: 'stress on 2nd syllable',         type: 'word' },
      { id: 34, label: 'Important',     target: 'important',     focus: 'stress on 2nd syllable',         type: 'word' },
      { id: 35, label: 'Beautiful',     target: 'beautiful',     focus: 'BJ cluster + schwa',             type: 'word' },
      { id: 36, label: 'Pronunciation', target: 'pronunciation', focus: 'multi-syllable stress',          type: 'word' },
      { id: 37, label: 'Rhythm',        target: 'rhythm',        focus: '/r/ onset + syllabic /m/',       type: 'word' },
      { id: 38, label: 'Squirrel',      target: 'squirrel',      focus: '/skwɪrəl/ complex onset',        type: 'word' },
      { id: 39, label: 'Worcestershire', target: 'worcestershire', focus: 'silent letters + reduction',   type: 'word' },
      { id: 40, label: 'Entrepreneurship', target: 'entrepreneurship', focus: 'multi-syllable + stress', type: 'word' },
    ]
  },

  // ── STAGE 3 : Hard Words → Easy Sentences ─────────────────────────────────
  {
    id: 3,
    title: 'Stage 3',
    subtitle: 'Hard Words → Easy Phrases',
    emoji: '⚡',
    color: '#6366f1',
    description: 'Challenging words and simple phrases — link sounds naturally.',
    questions: [
      { id: 41, label: 'Thorough',          target: 'thorough',          focus: '/θʌrə/ reduced vowels',              type: 'word' },
      { id: 42, label: 'Phenomenon',        target: 'phenomenon',        focus: '/fɪˈnɒmɪnən/ stress pattern',        type: 'word' },
      { id: 43, label: 'Specifically',      target: 'specifically',      focus: '/spɪˈsɪfɪkli/ 5 syllables',         type: 'word' },
      { id: 44, label: 'Simultaneously',    target: 'simultaneously',    focus: 'long word stress control',           type: 'word' },
      { id: 45, label: 'Miscellaneous',     target: 'miscellaneous',     focus: 'vowel reduction in unstressed syls', type: 'word' },
      { id: 46, label: 'Thank You',         target: 'thank you',         focus: 'TH sound without rushing',           type: 'phrase' },
      { id: 47, label: 'Good Morning',      target: 'good morning',      focus: 'smooth linking',                     type: 'phrase' },
      { id: 48, label: 'Nice to Meet You',  target: 'nice to meet you',  focus: 'connected speech',                   type: 'phrase' },
      { id: 49, label: 'How Are You',       target: 'how are you',       focus: '/haʊ ɑːr juː/ linking',             type: 'phrase' },
      { id: 50, label: 'See You Later',     target: 'see you later',     focus: 'flap T + yod coalescence',          type: 'phrase' },
      { id: 51, label: 'I Would Like',      target: 'I would like to explain', focus: 'rhythm and confidence',       type: 'phrase' },
      { id: 52, label: 'Could You Please',  target: 'could you please',  focus: '/d/ + /j/ = /dʒ/ fusion',           type: 'phrase' },
      { id: 53, label: 'It Depends On',     target: 'it depends on',     focus: 'connected function words',          type: 'phrase' },
      { id: 54, label: 'As Far As I Know',  target: 'as far as I know',  focus: 'weak forms of "as"',               type: 'phrase' },
      { id: 55, label: 'I Am Learning',     target: 'I am learning to speak clearly.', focus: 'steady pace',        type: 'sentence' },
      { id: 56, label: 'My Name Is',        target: 'My name is and I am from India.', focus: 'self intro rhythm',  type: 'sentence' },
      { id: 57, label: 'I Think That',      target: 'I think that this is a great opportunity.', focus: 'TH in flow', type: 'sentence' },
      { id: 58, label: 'I Would Suggest',   target: 'I would suggest that we focus on this first.', focus: 'suggestion tone', type: 'sentence' },
      { id: 59, label: 'Thank You For',     target: 'Thank you for giving me this opportunity.', focus: 'formal polite tone', type: 'sentence' },
      { id: 60, label: 'I Believe That',    target: 'I believe that practice makes perfect.',  focus: 'confident assertion', type: 'sentence' },
    ]
  },

  // ── STAGE 4 : Phrases → Medium/Hard Sentences ─────────────────────────────
  {
    id: 4,
    title: 'Stage 4',
    subtitle: 'Phrases → Hard Sentences',
    emoji: '🏆',
    color: '#a855f7',
    description: 'Multi-word phrases and complex sentences with natural rhythm.',
    questions: [
      { id: 61, label: 'On the Other Hand',    target: 'on the other hand',    focus: 'discourse connector',         type: 'phrase' },
      { id: 62, label: 'To the Best of',       target: 'to the best of my knowledge', focus: 'weak form "of"',     type: 'phrase' },
      { id: 63, label: 'In Terms of',          target: 'in terms of efficiency', focus: 'prepositional phrase flow', type: 'phrase' },
      { id: 64, label: 'With Regard to',       target: 'with regard to your question', focus: 'formal register',   type: 'phrase' },
      { id: 65, label: 'Taking Into Account',  target: 'taking into account all the factors', focus: 'chunking',   type: 'phrase' },
      { id: 66, label: 'Communication',        target: 'Communication is very important for interviews.',           focus: 'word stress', type: 'sentence' },
      { id: 67, label: 'Project Confidence',   target: 'I can explain my project with confidence and clarity.',    focus: 'no fumbling', type: 'sentence' },
      { id: 68, label: 'Team Collaboration',   target: 'Effective team collaboration leads to better results.',    focus: 'long sentence pacing', type: 'sentence' },
      { id: 69, label: 'Critical Thinking',    target: 'Critical thinking helps us solve complex problems efficiently.', focus: 'consonant clusters', type: 'sentence' },
      { id: 70, label: 'Professional Growth',  target: 'I am always looking for opportunities to grow professionally.', focus: 'rhythm and stress', type: 'sentence' },
      { id: 71, label: 'Skills and Strengths', target: 'My key strengths are communication, leadership, and problem-solving.', focus: 'list intonation', type: 'sentence' },
      { id: 72, label: 'Future Goals',         target: 'In five years, I see myself leading a team of engineers.', focus: 'future tense clarity', type: 'sentence' },
      { id: 73, label: 'Achievements',         target: 'I successfully led a project that improved efficiency by thirty percent.', focus: 'numbers and stats', type: 'sentence' },
      { id: 74, label: 'Challenges Faced',     target: 'The biggest challenge I faced was managing time during exams.', focus: 'past tense narration', type: 'sentence' },
      { id: 75, label: 'Why This Company',     target: 'I admire your company culture and the innovative products you build.', focus: 'formal admiration', type: 'sentence' },
      { id: 76, label: 'Why Hire Me',          target: 'I bring a unique combination of technical skills and communication ability.', focus: 'self-advocacy', type: 'sentence' },
      { id: 77, label: 'Describe Yourself',    target: 'I am a dedicated, curious, and collaborative person who loves solving problems.', focus: 'adjective list', type: 'sentence' },
      { id: 78, label: 'Handle Pressure',      target: 'I handle pressure by breaking tasks into smaller steps and prioritizing them.', focus: 'process explanation', type: 'sentence' },
      { id: 79, label: 'Learning Style',       target: 'I learn best through hands-on experience and immediate feedback.', focus: 'natural rhythm', type: 'sentence' },
      { id: 80, label: 'Career Motivation',    target: 'I am passionate about using technology to solve real-world problems.', focus: 'passion tone', type: 'sentence' },
    ]
  },

  // ── STAGE 5 : Tough Sentences → Short Paragraphs ──────────────────────────
  {
    id: 5,
    title: 'Stage 5',
    subtitle: 'Long Sentences & Paragraphs',
    emoji: '👑',
    color: '#ec4899',
    description: 'Master sustained speech — paragraphs, pace, and fluency.',
    questions: [
      { id: 81,  label: 'The Sixth Sick',      target: 'The sixth sick sheik\'s sixth sheep is sick.',             focus: 'tongue twister: /s/ /ʃ/ /θ/', type: 'sentence' },
      { id: 82,  label: 'Red Lorry',           target: 'Red lorry, yellow lorry, red lorry, yellow lorry.',        focus: 'tongue twister: /l/ /r/', type: 'sentence' },
      { id: 83,  label: 'Unique New York',     target: 'Unique New York. You know you need unique New York.',      focus: '/juːˈniːk/ + /njuː/', type: 'sentence' },
      { id: 84,  label: 'Aluminum Linoleum',   target: 'Aluminum, linoleum, aluminum, linoleum.',                 focus: 'vowel reduction pattern', type: 'sentence' },
      { id: 85,  label: 'Statistics',          target: 'She sells seashells by the seashore.',                    focus: '/s/ /ʃ/ fricative contrast', type: 'sentence' },
      { id: 86,  label: 'Complex Analysis',    target: 'Statistical analysis requires both quantitative and qualitative interpretation of data.', focus: 'academic register', type: 'sentence' },
      { id: 87,  label: 'Tech Interview',      target: 'The algorithm uses a dynamic programming approach to optimize the time complexity from O of n squared to O of n log n.', focus: 'technical fluency', type: 'sentence' },
      { id: 88,  label: 'Leadership',          target: 'A good leader inspires others by setting a clear vision, communicating effectively, and leading by example.', focus: 'complex sentence flow', type: 'sentence' },
      { id: 89,  label: 'Problem Solving',     target: 'When faced with a difficult problem, I first break it down into smaller sub-problems and analyze each one systematically.', focus: 'methodical explanation', type: 'sentence' },
      { id: 90,  label: 'Self Introduction',   target: 'Good morning. My name is and I am a final year student. I am passionate about software development and have worked on several projects.', focus: 'intro pace and clarity', type: 'sentence' },
      { id: 91,  label: 'About My Project',    target: 'I built a web application that helps students practice English pronunciation using AI. The app analyzes phonemes and gives instant feedback.',     focus: 'project description', type: 'paragraph' },
      { id: 92,  label: 'My Career Goals',     target: 'My goal is to become a full stack developer within the next two years. I plan to achieve this by building real-world projects and continuously learning new technologies.', focus: 'future planning', type: 'paragraph' },
      { id: 93,  label: 'Why Software Eng',    target: 'I chose software engineering because I love the process of turning ideas into working products. Every problem is a puzzle, and I enjoy finding elegant solutions.', focus: 'motivation narrative', type: 'paragraph' },
      { id: 94,  label: 'Describe a Challenge', target: 'During my final year project, our team faced a major setback when the database crashed two days before the deadline. I stayed calm, identified the issue, and we recovered the data successfully.', focus: 'story structure', type: 'paragraph' },
      { id: 95,  label: 'Team Experience',     target: 'I worked in a team of four on a machine learning project. My role was to preprocess the data and build the model pipeline. Collaboration and clear communication were key to our success.', focus: 'team narration', type: 'paragraph' },
      { id: 96,  label: 'Strengths Story',     target: 'One of my greatest strengths is adaptability. When our professor changed the project requirements midway, I quickly reorganized our plan and we delivered on time.', focus: 'STAR method', type: 'paragraph' },
      { id: 97,  label: 'Industry Vision',     target: 'The software industry is evolving rapidly with AI, cloud computing, and automation transforming every sector. I am excited to be entering this field at such a dynamic time.', focus: 'industry commentary', type: 'paragraph' },
      { id: 98,  label: 'Learning Journey',    target: 'My learning journey has been shaped by curiosity and persistence. From writing my first program in Python to deploying my first web app, every step has taught me something valuable.', focus: 'reflection tone', type: 'paragraph' },
      { id: 99,  label: 'Value Proposition',   target: 'I offer a combination of strong technical fundamentals, a collaborative mindset, and a genuine passion for building products that make a difference. I am ready to contribute from day one.', focus: 'confident close', type: 'paragraph' },
      { id: 100, label: 'Grand Finale',        target: 'Good morning everyone. I am glad to be here today. Over the past few months, I have worked hard to improve my spoken English, and I believe that clear communication is the foundation of every successful career. Thank you.', focus: 'sustained fluency: full speech', type: 'paragraph' },
    ]
  }
];

// ── Flat list for backward compatibility ───────────────────────────────────────
export const allLevels = stages.flatMap((stage) =>
  stage.questions.map((q) => ({
    ...q,
    stageId: stage.id,
    stageTitle: stage.title,
    stageEmoji: stage.emoji,
    stageColor: stage.color,
    groupId: stage.id.toString(),
    groupTitle: stage.title,
  }))
);

export const levelGroups = stages.map((s) => ({
  id: s.id.toString(),
  title: s.title,
  subtitle: s.subtitle,
  levels: s.questions,
}));

export function getLevel(levelId) {
  return allLevels.find((l) => l.id === Number(levelId)) || allLevels[0];
}

// Which stage does a question belong to?
export function getStageForLevel(levelId) {
  return stages.find((s) => s.questions.some((q) => q.id === levelId));
}
