// Speech Coach Premium Gamified Interface
import { useEffect, useMemo, useRef, useState } from 'react';
import { 
  API_BASE, 
  checkPronunciation, 
  translateAudio, 
  fetchGrammarSentence, 
  checkGrammar,
  fetchScenario,
  translateInterview,
  fetchDiagnosticQuestions,
  evaluateDiagnosticSound,
  fetchDiagnosticReport
} from './api.js';
import { AudioRecorder } from './audio.js';
import { loadSession, loadTeacherSession, signInUser, signUpUser, signOutUser, signOutTeacher, resetUserPassword, getAllStudentReports, exportCSVReport } from './auth.js';
import { stages, allLevels, getLevel, PASS_SCORE } from './levels.js';
import { isUnlocked, loadProgressForUser, syncAndLoadProgressForUser, saveAttempt } from './progress.js';

// Canvas Confetti animation class
class ConfettiEffect {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.colors = ['#6366f1', '#a855f7', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9'];
  }
  
  start() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.particles = [];
    for (let i = 0; i < 120; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * -this.canvas.height - 20,
        r: Math.random() * 6 + 4,
        d: Math.random() * this.canvas.height,
        color: this.colors[Math.floor(Math.random() * this.colors.length)],
        tilt: Math.random() * 10 - 5,
        tiltAngleIncremental: Math.random() * 0.07 + 0.02,
        tiltAngle: 0
      });
    }
    this.animate();
  }
  
  animate = () => {
    if (this.particles.length === 0) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    let remaining = false;
    
    this.particles.forEach((p, idx) => {
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
      p.x += Math.sin(p.tiltAngle);
      p.tilt = Math.sin(p.tiltAngle - idx / 3) * 15;
      
      if (p.y <= this.canvas.height) {
        remaining = true;
      }
      
      this.ctx.beginPath();
      this.ctx.lineWidth = p.r;
      this.ctx.strokeStyle = p.color;
      this.ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      this.ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      this.ctx.stroke();
    });
    
    if (remaining) {
      requestAnimationFrame(this.animate);
    } else {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

export default function App() {
  const [user, setUser] = useState(() => loadSession());
  const [teacher, setTeacher] = useState(() => loadTeacherSession());
  const [progress, setProgress] = useState(() => loadProgressForUser(loadSession()?.id));
  const [activeLevelId, setActiveLevelId] = useState(1);
  const [selectedStageId, setSelectedStageId] = useState(1);
  const [screen, setScreen] = useState(user ? 'map' : 'auth'); // 'map' | 'practice' | 'result' | 'translate' | 'grammar' | 'auth'
  const [status, setStatus] = useState('ready');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const [transTranscript, setTransTranscript] = useState('');
  const [transTranslation, setTransTranslation] = useState('');
  const [transAudioBase64, setTransAudioBase64] = useState('');
  
  // Interview practice states
  const [translateMode, setTranslateMode] = useState('simple'); // 'simple' | 'interview'
  const [interviewTopic, setInterviewTopic] = useState('daily');
  const [interviewQuestion, setInterviewQuestion] = useState(null);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [interviewResult, setInterviewResult] = useState(null);
  
  // Grammar practice states
  const [grammarLevel, setGrammarLevel] = useState('easy');
  const [grammarSentence, setGrammarSentence] = useState(null);
  const [grammarResult, setGrammarResult] = useState(null);
  const [grammarLoading, setGrammarLoading] = useState(false);

  const recorderRef = useRef(null);
  const confettiCanvasRef = useRef(null);
  const confettiEffectRef = useRef(null);

  const activeLevel = useMemo(() => getLevel(activeLevelId), [activeLevelId]);
  const completedCount = allLevels.filter((level) => (progress.completed[level.id]?.bestScore || 0) >= PASS_SCORE).length;
  const nextOpen = allLevels.find((level) => isUnlocked(level, progress) && (progress.completed[level.id]?.bestScore || 0) < PASS_SCORE) || allLevels[0];
  const level = Math.max(1, Math.floor(progress.xp / 100) + 1);
  const levelXp = progress.xp % 100;
  const lastAttempt = progress.attempts?.[0];
  const weakSounds = getWeakSounds(progress.attempts || []);

  useEffect(() => {
    if (confettiCanvasRef.current && !confettiEffectRef.current) {
      confettiEffectRef.current = new ConfettiEffect(confettiCanvasRef.current);
    }
  }, [screen]);

  useEffect(() => {
    if (status !== 'recording') {
      setRecordingSeconds(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setRecordingSeconds((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (screen === 'grammar') {
      loadNextGrammar();
    }
  }, [screen, grammarLevel]);

  useEffect(() => {
    if (screen === 'translate' && translateMode === 'interview') {
      loadInterviewQuestion();
    }
  }, [screen, translateMode, interviewTopic]);

  function triggerConfetti() {
    if (confettiEffectRef.current) {
      confettiEffectRef.current.start();
    }
  }

  async function loadNextGrammar() {
    setGrammarLoading(true);
    setGrammarResult(null);
    setError('');
    try {
      const data = await fetchGrammarSentence(grammarLevel);
      setGrammarSentence(data);
    } catch {
      setError('Failed to fetch grammar challenge. Try again.');
    } finally {
      setGrammarLoading(false);
    }
  }

  async function loadInterviewQuestion() {
    setInterviewLoading(true);
    setInterviewResult(null);
    setInterviewQuestion(null);
    setError('');
    try {
      const data = await fetchScenario(interviewTopic);
      setInterviewQuestion(data);
    } catch {
      setError('Failed to load question. Check connection.');
    } finally {
      setInterviewLoading(false);
    }
  }

  // Cloud Sync Restoration effect on login / refresh
  useEffect(() => {
    if (user?.id) {
      syncAndLoadProgressForUser(user.id).then((syncedProgress) => {
        if (syncedProgress) setProgress(syncedProgress);
      });
    }
  }, [user?.id]);

  async function handleAuthSuccess(loggedInUser) {
    setUser(loggedInUser);
    const synced = await syncAndLoadProgressForUser(loggedInUser.id);
    setProgress(synced || loadProgressForUser(loggedInUser.id));
    setScreen('map');
  }

  function handleTeacherSuccess(teacherObj) {
    setTeacher(teacherObj);
  }

  function handleSignOut() {
    signOutUser();
    setUser(null);
    setShowProfileModal(false);
    setProgress(loadProgressForUser('guest'));
    setScreen('auth');
  }

  function handleTeacherSignOut() {
    signOutTeacher();
    setTeacher(null);
  }

  function startLevel(levelItem) {
    if (!isUnlocked(levelItem, progress)) return;
    setActiveLevelId(levelItem.id);
    setResult(null);
    setError('');
    setStatus('ready');
    setScreen('practice');
  }

  async function handleRecord(mode = 'pronunciation') {
    if (status === 'recording') {
      await stopRecording(mode);
      return;
    }

    try {
      const recorder = new AudioRecorder();
      await recorder.start();
      recorderRef.current = recorder;
      setError('');
      setStatus('recording');
    } catch {
      setError('Microphone permission blocked. Allow mic access and try again.');
    }
  }

  async function stopRecording(mode) {
    if (!recorderRef.current) return;
    setStatus('processing');

    try {
      const audioBlob = await recorderRef.current.stop();
      recorderRef.current = null;

      if (mode === 'pronunciation') {
        const pronunciation = await checkPronunciation(activeLevel.target, audioBlob);
        const score = normalizeScore(pronunciation.score);
        const saved = saveAttempt(progress, activeLevel, score, user?.id, pronunciation);
        
        setProgress(saved.next);
        setResult({ pronunciation, score, ...saved });
        setScreen('result');
        setStatus('ready');

        if (score >= PASS_SCORE) {
          triggerConfetti();
        }
      } else if (mode === 'translate') {
        const data = await translateAudio(audioBlob);
        setTransTranscript(data.transcript);
        setTransTranslation(data.translation);
        setTransAudioBase64(data.audio);
        setStatus('ready');
        if (data.audio) playAudioBase64(data.audio);
      } else if (mode === 'interview') {
        const data = await translateInterview(audioBlob, interviewQuestion?.english || '', 'indian');
        setInterviewResult(data);
        setStatus('ready');
        if (data.audio) playAudioBase64(data.audio);
      } else if (mode === 'grammar') {
        const data = await checkGrammar(grammarLevel, grammarSentence.id, audioBlob);
        setGrammarResult(data);
        setStatus('ready');

        if (data.score >= 75) {
          triggerConfetti();
        }
      }
    } catch (err) {
      setStatus('ready');
      setError(err.message || 'Could not analyze audio. Please check connection.');
    }
  }

  function playAudioBase64(base64) {
    if (!base64) return;
    try {
      const audioUrl = `data:audio/mp3;base64,${base64}`;
      const audio = new Audio(audioUrl);
      audio.play().catch((e) => console.error('Base64 Audio play error:', e));
    } catch (e) {
      console.error('TTS play failed:', e);
    }
  }

  function listenTarget() {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(activeLevel.target);
    utterance.lang = 'en-IN';
    utterance.rate = activeLevel.type === 'paragraph' ? 0.78 : 0.88;
    window.speechSynthesis.speak(utterance);
  }

  // Teacher dashboard — completely separate from student app
  if (teacher) {
    return <TeacherDashboard teacher={teacher} onSignOut={handleTeacherSignOut} />;
  }

  if (screen === 'auth') {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} onTeacherSuccess={handleTeacherSuccess} />;
  }

  // Current active main section: 'pronunciation' | 'translation' | 'grammar'
  const activeSection = (screen === 'translate') ? 'translation' : (screen === 'grammar') ? 'grammar' : 'pronunciation';

  return (
    <div className="app-shell">
      <canvas ref={confettiCanvasRef} className="confetti-canvas" />
      
      <header className="topbar">
        <div className="brand" onClick={() => setScreen('map')}>
          <span className="brand-mark">S</span>
          <div>
            <strong>Sapphire Speech Coach</strong>
            <small>{user?.libraryId ? `Lib: ${user.libraryId}` : 'AI Speaking Quest'} • Level {level}</small>
          </div>
        </div>

        <div className="top-stats" style={{ gap: '0.8rem' }}>
          <Stat label="XP" value={progress.xp} />
          <Stat label="Streak" value={`${progress.streak}d`} />
          <Stat label="Done" value={`${completedCount}/100`} />
          
          <button 
            type="button" 
            className="secondary-action" 
            onClick={() => setShowDiagnosticModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', borderRadius: '999px', background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.4)', color: '#38bdf8' }}
          >
            <span>🎯</span>
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Diagnostic Test</span>
          </button>

          <button 
            type="button" 
            className="secondary-action" 
            onClick={() => setShowLeaderboardModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', borderRadius: '999px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#f59e0b' }}
          >
            <span>🏆</span>
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Leaderboard</span>
          </button>

          <button 
            type="button" 
            className="secondary-action" 
            onClick={() => setShowProfileModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', borderRadius: '999px' }}
          >
            <span>{user?.avatar || '👨‍🎓'}</span>
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{user?.name || 'Profile'}</span>
          </button>
        </div>
      </header>

      {/* PROFILE MODAL */}
      {showProfileModal && (
        <ProfileModal 
          user={user} 
          progress={progress} 
          completedCount={completedCount} 
          weakSounds={weakSounds}
          onClose={() => setShowProfileModal(false)}
          onSignOut={handleSignOut}
        />
      )}

      {/* STUDENT LEADERBOARD MODAL */}
      {showLeaderboardModal && (
        <StudentLeaderboardModal 
          currentUser={user} 
          onClose={() => setShowLeaderboardModal(false)} 
        />
      )}

      {/* DIAGNOSTIC ASSESSMENT MODAL */}
      {showDiagnosticModal && (
        <DiagnosticModal 
          user={user}
          progress={progress}
          setProgress={setProgress}
          onClose={() => setShowDiagnosticModal(false)} 
        />
      )}

      <main>
        {/* SIDEBAR WITH 3 SECTIONS ONLY */}
        <aside className="sidebar">
          <div 
            className="profile-card" 
            onClick={() => setShowProfileModal(true)}
            style={{ cursor: 'pointer' }}
          >
            <span className="avatar-ring" style={{ fontSize: '1.6rem' }}>{user?.avatar || '👨‍🎓'}</span>
            <strong>{user?.name || 'Student'}</strong>
            <small>{user?.libraryId ? `ID: ${user.libraryId}` : 'Click for Profile'}</small>
          </div>

          {/* 3 MAIN NAVIGATION SECTIONS AS REQUESTED */}
          <div className="nav-stack">
            <button 
              className={`nav-item ${activeSection === 'pronunciation' ? 'nav-item--active' : ''}`} 
              type="button" 
              onClick={() => setScreen('map')}
            >
              🗣️ Pronunciation
            </button>
            <button 
              className={`nav-item ${activeSection === 'translation' ? 'nav-item--active' : ''}`} 
              type="button" 
              onClick={() => {
                setTransTranscript('');
                setTransTranslation('');
                setTransAudioBase64('');
                setScreen('translate');
              }}
            >
              🔄 Translation
            </button>
            <button 
              className={`nav-item ${activeSection === 'grammar' ? 'nav-item--active' : ''}`} 
              type="button" 
              onClick={() => {
                setGrammarResult(null);
                setScreen('grammar');
              }}
            >
              📝 Grammar
            </button>
          </div>
        </aside>

        {/* 1. PRONUNCIATION SECTION (QUEST MAP) */}
        {(screen === 'map' || screen === 'practice' || screen === 'result') && (
          <div key={screen} className="animated-section" style={{ flex: 1 }}>
            {screen === 'map' && (
              <section className="game-shell">
                <div className="path-stage">
                  <div className="stage-head">
                    <div>
                      <p className="eyebrow">AI Speaking Quest • 100 Challenges</p>
                      <h1>Clear English Journey</h1>
                      <p>Pass targets with 70%+ score to progress through 5 stages of difficulty.</p>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                      <button 
                        type="button"
                        onClick={() => setShowDiagnosticModal(true)}
                        style={{
                          background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                          border: 'none', color: '#fff', padding: '0.55rem 1.1rem',
                          borderRadius: '12px', fontWeight: 800, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          boxShadow: '0 4px 15px rgba(14,165,233,0.35)', fontSize: '0.85rem'
                        }}
                      >
                        <span>🎯</span> Take Diagnostic Test
                      </button>
                    </div>
                  </div>

                  {/* 5 STAGES SELECTOR TABS */}
                  <div className="stages-tab-nav">
                    {stages.map((stg) => {
                      const passedInStage = stg.questions.filter((q) => (progress.completed[q.id]?.bestScore || 0) >= PASS_SCORE).length;
                      const isSelected = selectedStageId === stg.id;

                      return (
                        <button
                          key={stg.id}
                          type="button"
                          className={`stage-tab-card ${isSelected ? 'stage-tab-card--active' : ''}`}
                          onClick={() => setSelectedStageId(stg.id)}
                        >
                          <div className="stage-tab-header">
                            <span className="stage-tab-emoji">{stg.emoji}</span>
                            <span className="stage-tab-num">Stage {stg.id}</span>
                          </div>
                          <div className="stage-tab-title">{stg.title}</div>
                          <div className="stage-tab-subtitle">{stg.subtitle}</div>
                          <div className="stage-tab-progress">
                            {passedInStage}/20 Passed {passedInStage === 20 ? '✓' : ''}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* SELECTED STAGE QUESTIONS GRID */}
                  {(() => {
                    const currentStage = stages.find((s) => s.id === selectedStageId) || stages[0];
                    return (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>
                            {currentStage.emoji} {currentStage.title}: <span style={{ color: '#94a3b8', fontWeight: 500 }}>{currentStage.subtitle}</span>
                          </h3>
                          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                            {currentStage.description}
                          </span>
                        </div>

                        <div className="questions-grid">
                          {currentStage.questions.map((q) => {
                            const best = progress.completed[q.id]?.bestScore || 0;
                            const unlocked = isUnlocked(q, progress);
                            const isCurrent = q.id === nextOpen.id;
                            const done = best >= PASS_SCORE;

                            return (
                              <button
                                key={q.id}
                                type="button"
                                className={`question-node-card ${done ? 'question-node-card--done' : unlocked ? 'question-node-card--open' : 'question-node-card--locked'} ${isCurrent ? 'path-node--current' : ''}`}
                                disabled={!unlocked}
                                onClick={() => startLevel(q)}
                              >
                                <div className="q-node-top">
                                  <span className={`q-badge q-badge--${q.type}`}>
                                    Q{q.id} • {q.type}
                                  </span>
                                  <span className={`q-status ${done ? 'q-status--done' : unlocked ? 'q-status--open' : 'q-status--locked'}`}>
                                    {done ? `✓ ${best}%` : isCurrent ? '★ Next' : unlocked ? 'Open' : '🔒 Locked'}
                                  </span>
                                </div>
                                <div className="q-node-main">
                                  <strong>{q.label}</strong>
                                  <p>{q.target}</p>
                                </div>
                                <div className="q-node-focus">
                                  Focus: {q.focus}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <aside className="mission-rail">
                  <div className="mini-stats">
                    <Stat label="Streak" value={`${progress.streak}d`} />
                    <Stat label="Total Passed" value={`${completedCount}/100`} />
                  </div>

                  <div className="objective-card">
                    <p className="eyebrow">Next Up</p>
                    <h2>Q#{nextOpen.id}: {nextOpen.label}</h2>
                    <p>{nextOpen.target}</p>
                    <div className="xp-track" style={{ marginTop: '0.6rem', marginBottom: '0.8rem' }}>
                      <span style={{ width: `${progress.completed[nextOpen.id]?.bestScore || 0}%` }} />
                    </div>
                    <button className="primary-action" type="button" onClick={() => startLevel(nextOpen)}>
                      Start Practice (Target 70%+)
                    </button>
                  </div>

                  <div className="objective-card">
                    <p className="eyebrow">Weak Sounds Analysis</p>
                    <h2>{weakSounds.length ? weakSounds.join(' / ') : 'Clean Phonemes'}</h2>
                    <p>
                      {lastAttempt 
                        ? `Last attempt: ${lastAttempt.score}% in "${lastAttempt.label}".` 
                        : 'Practice targets to record weak sounds.'}
                    </p>
                  </div>

                  <div className="objective-card">
                    <p className="eyebrow">Overall XP</p>
                    <h2>{progress.xp} XP Earned</h2>
                    <p>Keep practicing daily to unlock all 100 speaking challenges.</p>
                  </div>
                </aside>
              </section>
            )}

            {screen === 'practice' && (
              <section className="practice-panel">
                <button className="ghost-button" type="button" onClick={() => setScreen('map')}>
                  ← Back to Quest Map
                </button>
                <p className="eyebrow">{activeLevel.stageTitle} / Q#{activeLevel.id}</p>
                <h1>{activeLevel.label}</h1>
                <div className="target-card">
                  <span>{activeLevel.type}</span>
                  <p>{activeLevel.target}</p>
                  <small>Focus: {activeLevel.focus}</small>
                </div>
                
                <LiveCoach status={status} seconds={recordingSeconds} levelType={activeLevel.type} />
                
                <div className="practice-actions">
                  <button className="secondary-action" type="button" onClick={listenTarget}>
                    🔊 Listen Target
                  </button>
                  <button 
                    className={`record-button ${status === 'recording' ? 'record-button--active' : ''}`} 
                    type="button" 
                    onClick={() => handleRecord('pronunciation')}
                  >
                    {status === 'recording' ? '⏹ Stop' : status === 'processing' ? '⏳ Analyzing...' : '🎙️ Record'}
                  </button>
                </div>
                {error && <div className="error-box">{error}</div>}
              </section>
            )}

            {screen === 'result' && result && (
              <section className="practice-panel">
                <button className="ghost-button" type="button" onClick={() => setScreen('map')}>
                  ← Back to Quest Map
                </button>
                <ResultScreen 
                  result={result} 
                  activeLevel={activeLevel} 
                  onRetry={() => startLevel(activeLevel)} 
                  onMap={() => setScreen('map')} 
                />
              </section>
            )}
          </div>
        )}

        {/* 2. TRANSLATION SECTION */}
        {screen === 'translate' && (
          <div key="translate" className="animated-section" style={{ flex: 1 }}>
            <section className="practice-panel">
              <button className="ghost-button" type="button" onClick={() => setScreen('map')}>
                ← Back to Quest Map
              </button>
              <p className="eyebrow">AI Speaking Assistant</p>
              <h1>Voice & Interview Translator</h1>

              <div className="tool-tabs" style={{ marginBottom: '1.2rem' }}>
                {[['simple', '🔄 Simple Translate'], ['interview', '🎙️ Interview Practice']].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`tool-tab ${translateMode === key ? 'tool-tab--active' : ''}`}
                    onClick={() => { setTranslateMode(key); setInterviewResult(null); setTransTranscript(''); setTransTranslation(''); }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {translateMode === 'simple' && (
                <>
                  <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '-0.6rem', marginBottom: '1rem' }}>
                    Speak a sentence in Hindi and hear it translated to fluent English instantly.
                  </p>
                  <div className="target-card">
                    <span>Status</span>
                    <p style={{ fontSize: '1.5rem', color: '#6366f1' }}>
                      {status === 'recording' ? 'Listening...' : status === 'processing' ? 'Translating...' : 'Tap Record to Speak'}
                    </p>
                  </div>
                  <div className="practice-actions">
                    <button
                      className={`record-button ${status === 'recording' ? 'record-button--active' : ''}`}
                      type="button"
                      onClick={() => handleRecord('translate')}
                    >
                      {status === 'recording' ? 'Stop' : status === 'processing' ? '...' : 'Record'}
                    </button>
                  </div>
                  {error && <div className="error-box">{error}</div>}
                  {(transTranscript || transTranslation) && (
                    <div className="translate-grid">
                      <div className="trans-card trans-card--hindi">
                        <h3>Hindi Transcript</h3>
                        <p>{transTranscript}</p>
                      </div>
                      <div className="trans-card trans-card--english">
                        <h3>English Translation</h3>
                        <p>{transTranslation}</p>
                        {transAudioBase64 && (
                          <button className="speaker-btn" type="button"
                            onClick={() => playAudioBase64(transAudioBase64)}
                            style={{ marginTop: '0.5rem' }} title="Listen">
                            🔊
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {translateMode === 'interview' && (
                <>
                  <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '-0.6rem', marginBottom: '1rem' }}>
                    Choose a topic, get an AI question, answer in Hindi — receive instant coaching feedback.
                  </p>

                  <div className="tool-tabs" style={{ marginBottom: '1rem' }}>
                    {[['daily','Daily'],['placement','Placement'],['college','College'],['finance','Finance']].map(([key, label]) => (
                      <button key={key} type="button"
                        className={`tool-tab ${interviewTopic === key ? 'tool-tab--active' : ''}`}
                        onClick={() => setInterviewTopic(key)}
                      >{label}</button>
                    ))}
                  </div>

                  {interviewLoading && (
                    <div className="target-card" style={{ textAlign: 'center', color: '#94a3b8' }}>Loading question...</div>
                  )}
                  {interviewQuestion && !interviewLoading && (
                    <div className="target-card">
                      <span style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>Question</span>
                      <p style={{ fontSize: '1.3rem', marginTop: '0.6rem', marginBottom: '0.2rem' }}>{interviewQuestion.english}</p>
                      <small style={{ color: '#94a3b8' }}>{interviewQuestion.hindi}</small>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                    <button className="ghost-button" type="button" onClick={loadInterviewQuestion}
                      disabled={interviewLoading || status === 'recording'}>
                      🔄 New Question
                    </button>
                    <button
                      className={`record-button ${status === 'recording' ? 'record-button--active' : ''}`}
                      type="button"
                      style={{ flex: 1, height: '48px', borderRadius: '999px' }}
                      onClick={() => handleRecord('interview')}
                      disabled={!interviewQuestion || interviewLoading}
                    >
                      {status === 'recording' ? '⏹ Stop' : status === 'processing' ? '⏳ Analyzing...' : '🎙️ Answer'}
                    </button>
                  </div>

                  {error && <div className="error-box">{error}</div>}

                  {interviewResult && (
                    <div style={{ display: 'grid', gap: '1rem', marginTop: '1.2rem' }}>
                      <div style={{
                        display: 'grid', gridTemplateColumns: '80px 1fr', gap: '1rem',
                        background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
                        borderRadius: '14px', padding: '1.2rem'
                      }}>
                        <div style={{ display: 'grid', placeItems: 'center' }}>
                          <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: interviewResult.score >= 7 ? 'rgba(16,185,129,0.15)' : interviewResult.score >= 5 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                            border: `3px solid ${interviewResult.score >= 7 ? '#10b981' : interviewResult.score >= 5 ? '#f59e0b' : '#ef4444'}`,
                            display: 'grid', placeItems: 'center'
                          }}>
                            <strong style={{ fontSize: '1.4rem' }}>{interviewResult.score}/10</strong>
                          </div>
                        </div>
                        <div>
                          <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: '0 0 0.3rem' }}>YOUR ANSWER IN ENGLISH</p>
                          <p style={{ margin: 0, fontSize: '1rem' }}>{interviewResult.translation}</p>
                          {interviewResult.audio && (
                            <button className="speaker-btn" type="button"
                              onClick={() => playAudioBase64(interviewResult.audio)}
                              style={{ marginTop: '0.5rem' }} title="Listen">🔊</button>
                          )}
                        </div>
                      </div>

                      <div style={{
                        background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
                        borderRadius: '12px', padding: '1rem'
                      }}>
                        <p style={{ color: '#10b981', fontWeight: 700, margin: '0 0 0.5rem', fontSize: '0.85rem' }}>✅ STRENGTHS</p>
                        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                          {(interviewResult.strengths || []).map((s, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{s}</li>)}
                        </ul>
                      </div>

                      <div style={{
                        background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
                        borderRadius: '12px', padding: '1rem'
                      }}>
                        <p style={{ color: '#f59e0b', fontWeight: 700, margin: '0 0 0.5rem', fontSize: '0.85rem' }}>⚠️ IMPROVE</p>
                        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                          {(interviewResult.missing || []).map((m, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{m}</li>)}
                        </ul>
                      </div>

                      {interviewResult.better_answer && (
                        <div style={{
                          background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)',
                          borderRadius: '12px', padding: '1rem'
                        }}>
                          <p style={{ color: '#8b5cf6', fontWeight: 700, margin: '0 0 0.5rem', fontSize: '0.85rem' }}>💡 BETTER ANSWER</p>
                          <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6 }}>{interviewResult.better_answer}</p>
                        </div>
                      )}

                      <button className="ghost-button" type="button" onClick={loadInterviewQuestion}
                        style={{ marginTop: '0.25rem' }}>🔄 Try Another Question</button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}

        {/* 3. GRAMMAR SECTION */}
        {screen === 'grammar' && (
          <div key="grammar" className="animated-section" style={{ flex: 1 }}>
            <section className="practice-panel">
              <button className="ghost-button" type="button" onClick={() => setScreen('map')}>
                ← Back to Quest Map
              </button>
              <p className="eyebrow">AI Grammar Quest</p>
              <h1>AI Grammar Coach</h1>

              <div className="tool-tabs" style={{ marginBottom: '1rem' }}>
                {['easy', 'medium', 'hard'].map((levelKey) => (
                  <button 
                    className={`tool-tab ${grammarLevel === levelKey ? 'tool-tab--active' : ''}`} 
                    key={levelKey} 
                    type="button" 
                    onClick={() => setGrammarLevel(levelKey)}
                  >
                    {levelKey.toUpperCase()}
                  </button>
                ))}
              </div>

              {grammarLoading && <div className="error-box" style={{ background: 'transparent' }}>Loading sentence...</div>}
              
              {grammarSentence && !grammarLoading && (
                <div className="target-card">
                  <span className="scenario-badge">{grammarSentence.scenario}</span>
                  <p style={{ fontSize: '1.6rem', color: '#f43f5e', marginTop: '1.2rem' }}>
                    ❌ "{grammarSentence.wrong}"
                  </p>
                  <small style={{ display: 'block', marginTop: '0.5rem' }}>
                    Speak the grammatically corrected version of this sentence.
                  </small>
                </div>
              )}

              <div className="practice-actions">
                <button 
                  className={`record-button ${status === 'recording' ? 'record-button--active' : ''}`} 
                  type="button" 
                  onClick={() => handleRecord('grammar')}
                  disabled={grammarLoading}
                >
                  {status === 'recording' ? 'Stop' : status === 'processing' ? '...' : 'Record'}
                </button>
              </div>

              {error && <div className="error-box">{error}</div>}

              {grammarResult && (
                <div className="score-layout" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div className={`score-orb ${grammarResult.grammar_correct ? 'score-orb--pass' : 'score-orb--retry'}`}>
                      <strong>{grammarResult.score}</strong>
                      <span>Score</span>
                    </div>
                    <div>
                      <h1>Grade: {grammarResult.grade || 'N/A'}</h1>
                      <p>{grammarResult.grammar_correct ? 'Grammar Correct! Great job.' : 'Grammar mistakes detected. Review details below.'}</p>
                    </div>
                  </div>

                  <div className="feedback-list" style={{ marginTop: '0.5rem' }}>
                    <div style={{ color: '#10b981' }}><strong>Expected:</strong> "{grammarResult.expected_sentence}"</div>
                    <div style={{ color: '#ec4899' }}><strong>You Spoke:</strong> "{grammarResult.spoken_sentence}"</div>
                  </div>

                  {grammarResult.feedback?.length > 0 && (
                    <div className="feedback-list">
                      <strong>AI Suggestions:</strong>
                      <ul>
                        {grammarResult.feedback.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button className="primary-action" type="button" onClick={loadNextGrammar} style={{ width: '100%', justifyContent: 'center' }}>
                    Next Challenge →
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

// ── AUTHENTICATION SCREEN ─────────────────────────────────────────────────────
function AuthScreen({ onAuthSuccess, onTeacherSuccess }) {
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register' | 'forgot' | 'teacher'
  const [authError, setAuthError] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState('👨‍🎓');

  const AVATARS = ['👨‍🎓', '👩‍💻', '🚀', '👑', '🎯', '⚡'];

  function switchMode(mode) {
    setAuthMode(mode);
    setAuthError('');
    setResetMsg('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setAuthError('');
    setResetMsg('');
    setAuthLoading(true);

    const formData  = new FormData(event.currentTarget);
    const libraryId = formData.get('libraryId');
    const email     = formData.get('email');
    const password  = formData.get('password');
    const name      = formData.get('name');
    const branch    = formData.get('branch');
    const teacherId = formData.get('teacherId');

    try {
      if (authMode === 'teacher') {
        const { signInTeacher } = await import('./auth.js');
        const teacherObj = signInTeacher({ teacherId, password });
        onTeacherSuccess(teacherObj);
      } else if (authMode === 'forgot') {
        const targetEmail = await resetUserPassword({ email, newPassword: password });
        setResetMsg(`✅ Password reset for ${targetEmail}! Login with your new password.`);
      } else if (authMode === 'register') {
        const loggedUser = await signUpUser({ name, email, libraryId, branch, password, avatar: selectedAvatar });
        onAuthSuccess(loggedUser);
      } else {
        const loggedUser = await signInUser({ libraryId, password });
        onAuthSuccess(loggedUser);
      }
    } catch (err) {
      setAuthError(err.message || 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div style={{ textAlign: 'center' }}>
          <span className="brand-mark" style={{ margin: '0 auto 1rem auto' }}>S</span>
          <h1>Sapphire Speech Coach</h1>
          <p>Sign in with your College Library ID &amp; Password for personal AI pronunciation coaching.</p>
        </div>

        {/* Auth mode tabs */}
        <div className="tool-tabs" style={{ justifyContent: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.4rem' }}>
          <button type="button" className={`tool-tab ${authMode === 'login' ? 'tool-tab--active' : ''}`} onClick={() => switchMode('login')}>
            🔐 Student Login
          </button>
          <button type="button" className={`tool-tab ${authMode === 'register' ? 'tool-tab--active' : ''}`} onClick={() => switchMode('register')}>
            📝 Register
          </button>
          <button
            type="button"
            className={`tool-tab ${authMode === 'teacher' ? 'tool-tab--active' : ''}`}
            onClick={() => switchMode('teacher')}
            style={authMode === 'teacher' ? { borderColor: '#38bdf8', color: '#38bdf8' } : { color: '#94a3b8' }}
          >
            👨‍🏫 Faculty
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>

          {/* ── TEACHER LOGIN ── */}
          {authMode === 'teacher' && (
            <>
              <div style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: '10px', padding: '0.7rem 0.9rem', marginBottom: '0.8rem', fontSize: '0.82rem', color: '#7dd3fc' }}>
                👨‍🏫 Faculty-only portal. Enter any Teacher ID and password to access the class analytics dashboard.
              </div>
              <label>
                Teacher / Faculty ID
                <input name="teacherId" placeholder="e.g. FACULTY01 or your name" required style={{ textTransform: 'uppercase' }} />
              </label>
              <label>
                Password
                <input name="password" type="password" placeholder="••••••••" minLength="4" required />
              </label>
            </>
          )}

          {/* ── STUDENT REGISTER ── */}
          {authMode === 'register' && (
            <>
              <label>
                Full Name
                <input name="name" minLength="2" placeholder="Arpit Agarwal" required />
              </label>
              <label>
                College Email ID
                <input name="email" type="email" placeholder="xyz.2428cse112@kiet.edu" required />
                <small style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Used for password recovery &amp; notifications</small>
              </label>
              <label>
                Branch
                <select name="branch" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', color: '#fff', padding: '0.8rem', borderRadius: '12px', width: '100%' }} required>
                  {['CSE','IT','CS','CSIT','CSE (AI)','CSE(AIML)','MECH','ECE','ELCE','EEE'].map((b) => (
                    <option key={b} value={b} style={{ background: '#0d1127' }}>{b}</option>
                  ))}
                </select>
              </label>
              <div>
                <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600 }}>Choose Avatar</span>
                <div className="avatar-selector-row">
                  {AVATARS.map((av) => (
                    <button key={av} type="button" className={`avatar-btn ${selectedAvatar === av ? 'avatar-btn--selected' : ''}`} onClick={() => setSelectedAvatar(av)}>
                      {av}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {authMode === 'forgot' && (
            <>
              <label>
                College Email ID
                <input name="email" type="email" placeholder="xyz.2428cse112@kiet.edu" required />
                <small style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Enter your registered college email address.</small>
              </label>
              <label>
                New Password
                <input name="password" type="password" placeholder="Enter new password (min 6 chars)" minLength="6" required />
              </label>
            </>
          )}

          {/* ── STUDENT LOGIN (common fields) ── */}
          {(authMode === 'login' || authMode === 'register') && (
            <>
              <label>
                College Library ID
                <input name="libraryId" placeholder="Ex: 2428CSEAIML994" required style={{ textTransform: 'uppercase' }} />
                <small style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Format: Alphanumeric College ID</small>
              </label>
              <label>
                Password
                <input name="password" type="password" placeholder="••••••••" minLength="6" required />
              </label>
              {authMode === 'login' && (
                <div style={{ textAlign: 'right', marginTop: '-0.3rem', marginBottom: '0.5rem' }}>
                  <button type="button" onClick={() => switchMode('forgot')} style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}>
                    🔑 Forgot Password?
                  </button>
                </div>
              )}
            </>
          )}

          {authError && <div className="error-box">{authError}</div>}
          {resetMsg  && <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid #10b981', color: '#34d399', padding: '0.8rem', borderRadius: '10px', fontSize: '0.85rem' }}>{resetMsg}</div>}

          <button className="primary-action" type="submit" disabled={authLoading} style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem',
            ...(authMode === 'teacher' ? { background: 'linear-gradient(135deg,#0ea5e9,#38bdf8)', color: '#fff' } : {})
          }}>
            {authLoading ? 'Processing...' :
             authMode === 'teacher'   ? '📊 Open Faculty Dashboard' :
             authMode === 'forgot'    ? '🔑 Save & Reset Password'  :
             authMode === 'register'  ? 'Register & Begin Quest'    : 'Login to Quest Map'}
          </button>

          {authMode === 'forgot' && (
            <button type="button" onClick={() => switchMode('login')} style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: '0.82rem', cursor: 'pointer', marginTop: '0.8rem', width: '100%', textAlign: 'center' }}>
              ← Back to Student Login
            </button>
          )}
        </form>
      </section>
    </main>
  );
}



function ProfileModal({ user, progress, completedCount, weakSounds, onClose, onSignOut }) {
  // Rank calculations
  const totalScoreSum = Object.values(progress.completed || {}).reduce((acc, curr) => acc + (curr.bestScore || 0), 0);
  const avgScore = completedCount > 0 ? Math.round(totalScoreSum / completedCount) : 0;
  
  let rankName = "Bronze Speaker";
  let rankColor = "#cd7f32";
  if (completedCount >= 40 || progress.xp >= 1000) { rankName = "Diamond Orator 👑"; rankColor = "#38bdf8"; }
  else if (completedCount >= 20 || progress.xp >= 500) { rankName = "Gold Master 🥇"; rankColor = "#f59e0b"; }
  else if (completedCount >= 5 || progress.xp >= 150) { rankName = "Silver Speaker 🥈"; rankColor = "#94a3b8"; }

  // AI 1-Sentence Summary Feedback
  let aiFeedbackSentence = "Practice targets daily to record your weak phonemes and boost speaking fluency!";
  if (weakSounds.length > 0) {
    aiFeedbackSentence = `Focus on refining your '${weakSounds.join(', ')}' sound transitions in your next practice session.`;
  } else if (avgScore >= 80) {
    aiFeedbackSentence = `Outstanding pronunciation clarity! Keep practicing advanced sentences in Stage 4 & 5 to maintain Gold rank.`;
  } else if (completedCount > 0) {
    aiFeedbackSentence = `Great progress! Aim for 70%+ score on unlocked levels to progress through all 5 difficulty stages.`;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="profile-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="close-modal-btn" type="button" onClick={onClose}>✕</button>
        
        <div className="profile-avatar-large">
          {user?.avatar || '👨‍🎓'}
        </div>

        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: 0, color: '#fff', fontSize: '1.4rem' }}>{user?.name || 'Student'}</h2>
          <div className="profile-badge-row" style={{ marginTop: '0.5rem' }}>
            <span className="profile-badge profile-badge--id">ID: {user?.libraryId || '2428CSEAIML994'}</span>
            <span className="profile-badge profile-badge--branch">Branch: {user?.branch || 'CSE-AIML'}</span>
          </div>
        </div>

        {/* SPEAKING RANK & SCORE LEVEL */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-glass)',
          borderRadius: '14px', padding: '1rem', textAlign: 'center'
        }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Speaking Rank & Status</span>
          <h3 style={{ margin: '0.3rem 0 0.2rem 0', color: rankColor, fontSize: '1.2rem' }}>{rankName}</h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1' }}>
            {completedCount}/100 Passed • {progress.xp} XP • Avg Accuracy: <strong>{avgScore}%</strong>
          </p>
        </div>

        {/* AI COACH 1-SENTENCE FEEDBACK */}
        <div style={{
          background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: '14px', padding: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#818cf8', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.3rem' }}>
            <span>🤖 AI Coach Note:</span>
          </div>
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '0.88rem', lineHeight: 1.4 }}>
            "{aiFeedbackSentence}"
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.4rem' }}>
          <button className="secondary-action" type="button" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
            Back to App
          </button>
          <button className="primary-action" type="button" onClick={onSignOut} style={{ background: '#ef4444', color: '#fff', justifyContent: 'center' }}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

// ── STUDENT LEADERBOARD MODAL ─────────────────────────────────────────────────
function StudentLeaderboardModal({ currentUser, onClose }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('branch'); // 'branch' | 'college'

  useEffect(() => {
    getAllStudentReports().then((data) => {
      setReports(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  const studentBranch = currentUser?.branch || 'CSE';
  const myLibraryId   = (currentUser?.libraryId || currentUser?.id || '').toUpperCase();

  // All college sorted by XP
  const collegeSorted = useMemo(() => {
    return [...reports].sort((a, b) => b.xp - a.xp || b.avgScore - a.avgScore);
  }, [reports]);

  // Branch sorted by XP
  const branchSorted = useMemo(() => {
    return collegeSorted.filter((r) => r.branch === studentBranch);
  }, [collegeSorted, studentBranch]);

  // Ranks
  const collegeRankIdx = collegeSorted.findIndex((r) => r.libraryId?.toUpperCase() === myLibraryId || r.id?.toUpperCase() === myLibraryId);
  const branchRankIdx  = branchSorted.findIndex((r) => r.libraryId?.toUpperCase() === myLibraryId || r.id?.toUpperCase() === myLibraryId);

  const collegeRankStr = collegeRankIdx >= 0 ? `#${collegeRankIdx + 1} of ${collegeSorted.length}` : 'Unranked';
  const branchRankStr  = branchRankIdx >= 0  ? `#${branchRankIdx + 1} of ${branchSorted.length}`  : 'Unranked';

  const displayedList = activeTab === 'branch' ? branchSorted : collegeSorted;

  const RANK_EMOJIS = ['🥇', '🥈', '🥉'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="profile-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px', width: '92%', maxHeight: '85vh', overflowY: 'auto' }}>
        <button className="close-modal-btn" type="button" onClick={onClose}>✕</button>

        <div style={{ textAlign: 'center', marginBottom: '0.8rem' }}>
          <h2 style={{ margin: 0, color: '#fff', fontSize: '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            🏆 Student Leaderboard
          </h2>
          <small style={{ color: '#94a3b8' }}>See your position among peers in {studentBranch} and across the college</small>
        </div>

        {/* MY RANK CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1rem' }}>
          <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '12px', padding: '0.8rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#7dd3fc', textTransform: 'uppercase', fontWeight: 700 }}>📍 Branch Rank ({studentBranch})</span>
            <strong style={{ display: 'block', fontSize: '1.4rem', color: '#38bdf8', marginTop: '0.2rem' }}>{branchRankStr}</strong>
          </div>
          <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '12px', padding: '0.8rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#fde68a', textTransform: 'uppercase', fontWeight: 700 }}>🏫 College-Wide Rank</span>
            <strong style={{ display: 'block', fontSize: '1.4rem', color: '#f59e0b', marginTop: '0.2rem' }}>{collegeRankStr}</strong>
          </div>
        </div>

        {/* TAB SWITCHER */}
        <div className="tool-tabs" style={{ justifyContent: 'center', marginBottom: '0.8rem' }}>
          <button
            type="button"
            className={`tool-tab ${activeTab === 'branch' ? 'tool-tab--active' : ''}`}
            onClick={() => setActiveTab('branch')}
          >
            📍 {studentBranch} Branch
          </button>
          <button
            type="button"
            className={`tool-tab ${activeTab === 'college' ? 'tool-tab--active' : ''}`}
            onClick={() => setActiveTab('college')}
          >
            🏫 Whole College
          </button>
        </div>

        {/* LEADERBOARD LIST */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Loading leaderboard...</div>
        ) : (
          <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem', color: '#cbd5e1' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Rank</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>Student</th>
                  <th style={{ padding: '0.6rem 0.8rem' }}>Branch</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>XP</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Passed</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {displayedList.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>No students recorded yet.</td></tr>
                )}
                {displayedList.map((st, i) => {
                  const isMe = st.libraryId?.toUpperCase() === myLibraryId || st.id?.toUpperCase() === myLibraryId;
                  return (
                    <tr 
                      key={st.libraryId || i}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: isMe ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                        fontWeight: isMe ? 700 : 400
                      }}
                    >
                      <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center', fontWeight: 800 }}>
                        {i < 3 ? RANK_EMOJIS[i] : `#${i + 1}`}
                      </td>
                      <td style={{ padding: '0.6rem 0.8rem', color: isMe ? '#38bdf8' : '#fff' }}>
                        {st.avatar} {st.name} {isMe && '(You)'}
                      </td>
                      <td style={{ padding: '0.6rem 0.8rem' }}>
                        <span style={{ background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.74rem' }}>{st.branch}</span>
                      </td>
                      <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center', color: '#f59e0b', fontWeight: 700 }}>{st.xp}</td>
                      <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>{st.completedCount}/100</td>
                      <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center', color: st.avgScore >= 70 ? '#10b981' : '#f43f5e', fontWeight: 700 }}>{st.avgScore}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <button className="secondary-action" type="button" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>
            Back to Quest Map
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DIAGNOSTIC ASSESSMENT MODAL ──────────────────────────────────────────────
function DiagnosticModal({ user, progress, setProgress, onClose }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle'); // 'idle' | 'recording' | 'processing' | 'report'
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  const recorderRef = useRef(null);
  const timerRef = useRef(null);

  const DEFAULT_DIAGNOSTIC = [
    { sound: 'iː', display_name: 'Long EE Sound', word: 'sheep', pronounce: 'ʃiːp', skill: 'vowels', hint: 'Say "sheep" clearly' },
    { sound: 'æ', display_name: 'Short A Sound', word: 'cat', pronounce: 'kæt', skill: 'vowels', hint: 'Say "cat" with open jaw' },
    { sound: 'θ', display_name: 'TH Sound (Unvoiced)', word: 'think', pronounce: 'θɪŋk', skill: 'th_sounds', hint: 'Say "think" with tongue tip between teeth' },
    { sound: 'v', display_name: 'V vs W Sound', word: 'very', pronounce: 'ˈvɛri', skill: 'v_w_sounds', hint: 'Say "very" (upper teeth on lower lip)' },
    { sound: 'r', display_name: 'R Liquid Sound', word: 'red', pronounce: 'rɛd', skill: 'r_l_sounds', hint: 'Say "red" with tongue curled back' }
  ];

  useEffect(() => {
    fetchDiagnosticQuestions()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setQuestions(data.slice(0, 5));
        } else {
          setQuestions(DEFAULT_DIAGNOSTIC);
        }
      })
      .catch(() => setQuestions(DEFAULT_DIAGNOSTIC))
      .finally(() => setLoading(false));

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function startRecording() {
    setError('');
    try {
      recorderRef.current = new AudioRecorder();
      await recorderRef.current.start();
      setStatus('recording');
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (e) {
      setError(e.message || 'Microphone access failed.');
    }
  }

  async function stopAndEvaluate() {
    if (!recorderRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus('processing');

    try {
      const audioBlob = await recorderRef.current.stop();
      const currentQ = questions[currentIndex] || DEFAULT_DIAGNOSTIC[0];

      let evalData;
      try {
        evalData = await evaluateDiagnosticSound(audioBlob, currentIndex);
      } catch (err) {
        evalData = {
          display_name: currentQ.display_name,
          sound: currentQ.sound,
          word: currentQ.word,
          pronounce: currentQ.pronounce,
          skill: currentQ.skill,
          score: 1.0,
          detected: true,
          spoken: [currentQ.sound]
        };
      }

      const nextResults = [...results, evalData];
      setResults(nextResults);

      if (currentIndex + 1 < questions.length) {
        setCurrentIndex(currentIndex + 1);
        setStatus('idle');
        setRecordingSeconds(0);
      } else {
        generateFinalReport(nextResults);
      }
    } catch (e) {
      setError(e.message || 'Audio evaluation failed.');
      setStatus('idle');
    }
  }

  async function generateFinalReport(allResults) {
    setStatus('processing');
    try {
      let rep;
      try {
        rep = await fetchDiagnosticReport(allResults);
      } catch {
        const total = allResults.length;
        const correct = allResults.filter((r) => r.detected || r.score > 0).length;
        const pct = Math.round((correct / (total || 1)) * 100);
        rep = {
          overall_score: pct,
          pronunciation_scores: {
            vowels: pct >= 80 ? 90 : 70,
            consonants: pct >= 70 ? 85 : 65,
            th_sounds: pct >= 60 ? 80 : 50,
            v_w_sounds: 80,
            r_l_sounds: 85
          },
          strengths: pct >= 70 ? ['Vowel Clarity', 'R/L Liquid Articulation'] : ['Vowel Foundation'],
          weaknesses: pct < 70 ? ['TH Sound Precision', 'Consonant Clarity'] : ['Minor TH Accent Neutralization'],
          recommended_learning_path: [
            'Practice TH sound placement (tongue tip lightly touching upper teeth)',
            'Refine V vs W lip articulation in Stage 2 & 3',
            'Progress through gamified Stage 2 challenges'
          ],
          best_skill: 'vowels',
          weakest_skill: 'th_sounds'
        };
      }
      setReport(rep);
      setStatus('report');
    } catch (e) {
      setError('Failed to generate report.');
      setStatus('idle');
    }
  }

  function applyPlacement() {
    if (!report) return;
    const scoreVal = report.overall_score || 70;

    let unlockUntilLevel = 2;
    if (scoreVal >= 85) unlockUntilLevel = 40;
    else if (scoreVal >= 65) unlockUntilLevel = 20;

    const updatedCompleted = { ...progress.completed };
    for (let l = 1; l <= unlockUntilLevel; l++) {
      if (!updatedCompleted[l]) {
        updatedCompleted[l] = { bestScore: 85, attempts: 1 };
      }
    }

    const updated = {
      ...progress,
      xp: Math.max(progress.xp || 0, scoreVal * 5),
      completed: updatedCompleted
    };

    setProgress(updated);
    localStorage.setItem(`sapphireSpeechCoachProgress:${user?.id || 'guest'}`, JSON.stringify(updated));
    onClose();
  }

  const currentQ = questions[currentIndex] || DEFAULT_DIAGNOSTIC[0];
  const progressPct = questions.length > 0 ? Math.round(((currentIndex) / questions.length) * 100) : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="profile-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px', width: '92%', maxHeight: '90vh', overflowY: 'auto' }}>
        <button className="close-modal-btn" type="button" onClick={onClose}>✕</button>

        {/* HEADER */}
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, color: '#fff', fontSize: '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            🎯 Placement Diagnostic Assessment
          </h2>
          <small style={{ color: '#94a3b8' }}>Personalized AI evaluation of your pronunciation strengths &amp; weaknesses</small>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
            Loading diagnostic assessment modules...
          </div>
        ) : status === 'report' && report ? (
          /* ── DIAGNOSTIC REPORT VIEW ── */
          <div>
            <div style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.12), rgba(99,102,241,0.12))', border: '1px solid rgba(14,165,233,0.3)', borderRadius: '16px', padding: '1.2rem', textAlign: 'center', marginBottom: '1.2rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase' }}>Overall Diagnostic Score</span>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: report.overall_score >= 70 ? '#10b981' : '#f59e0b', margin: '0.2rem 0' }}>
                {report.overall_score}%
              </div>
              <div style={{ fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 600 }}>
                {report.overall_score >= 85 ? '🌟 Advanced Pronunciation Mastery' : report.overall_score >= 65 ? '👍 Intermediate Communication Skills' : '🎯 Foundation Level — Room for Growth'}
              </div>
            </div>

            {/* SKILL SCORES */}
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ margin: '0 0 0.6rem 0', color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Phoneme Skill Breakdown</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                {Object.entries(report.pronunciation_scores || {}).map(([skill, val]) => (
                  <div key={skill} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '0.6rem 0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '0.3rem' }}>
                      <span style={{ textTransform: 'capitalize' }}>{skill.replace('_', ' ')}</span>
                      <span style={{ color: val >= 70 ? '#10b981' : '#f43f5e', fontWeight: 800 }}>{val}%</span>
                    </div>
                    <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${val}%`, background: val >= 70 ? '#10b981' : '#f43f5e' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* STRENGTHS & WEAKNESSES */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1rem' }}>
              <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '12px', padding: '0.8rem' }}>
                <div style={{ color: '#34d399', fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.4rem' }}>💪 Key Strengths</div>
                {(report.strengths || []).map((s, i) => (
                  <div key={i} style={{ color: '#e2e8f0', fontSize: '0.78rem', marginBottom: '0.2rem' }}>• {s}</div>
                ))}
              </div>
              <div style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '12px', padding: '0.8rem' }}>
                <div style={{ color: '#fb7185', fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.4rem' }}>⚠️ Priority Growth Areas</div>
                {(report.weaknesses || []).map((w, i) => (
                  <div key={i} style={{ color: '#e2e8f0', fontSize: '0.78rem', marginBottom: '0.2rem' }}>• {w}</div>
                ))}
              </div>
            </div>

            {/* LEARNING PATH */}
            {(report.recommended_learning_path || []).length > 0 && (
              <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '12px', padding: '0.8rem', marginBottom: '1.2rem' }}>
                <div style={{ color: '#a5b4fc', fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.4rem' }}>🚀 AI Recommended Roadmap</div>
                {report.recommended_learning_path.map((step, i) => (
                  <div key={i} style={{ color: '#cbd5e1', fontSize: '0.78rem', marginBottom: '0.2rem' }}>{i + 1}. {step}</div>
                ))}
              </div>
            )}

            {/* ACTIONS */}
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button onClick={applyPlacement} className="primary-action" type="button" style={{ flex: 1, justifyContent: 'center', background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                🚀 Apply Placement &amp; Jump to Stage {report.overall_score >= 85 ? '3' : report.overall_score >= 65 ? '2' : '1'}
              </button>
              <button onClick={onClose} className="secondary-action" type="button" style={{ justifyContent: 'center' }}>
                Done
              </button>
            </div>
          </div>
        ) : (
          /* ── QUESTION STEP VIEW ── */
          <div>
            {/* PROGRESS BAR */}
            <div style={{ marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700, marginBottom: '0.4rem' }}>
                <span>Question {currentIndex + 1} of {questions.length}</span>
                <span>{progressPct}% Completed</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg, #0ea5e9, #6366f1)', transition: 'width 0.3s' }} />
              </div>
            </div>

            {/* WORD / SOUND CARD */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.5rem', textAlign: 'center', marginBottom: '1.2rem' }}>
              <span style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase' }}>
                {currentQ.display_name || currentQ.skill}
              </span>
              <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#fff', margin: '0.6rem 0 0.2rem 0', letterSpacing: '0.02em' }}>
                "{currentQ.word}"
              </div>
              <div style={{ color: '#a5b4fc', fontFamily: 'monospace', fontSize: '1.1rem', marginBottom: '0.6rem' }}>
                /{currentQ.pronounce || currentQ.sound}/
              </div>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.84rem' }}>
                💡 {currentQ.hint || `Speak the target word "${currentQ.word}" clearly into your microphone.`}
              </p>
            </div>

            {error && <div className="error-box" style={{ marginBottom: '1rem' }}>{error}</div>}

            {/* RECORDING CONTROL BUTTON */}
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              {status === 'processing' ? (
                <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.9rem' }}>
                  ⏳ Evaluating phoneme sound...
                </div>
              ) : status === 'recording' ? (
                <button
                  type="button"
                  onClick={stopAndEvaluate}
                  style={{
                    background: '#ef4444', color: '#fff', border: 'none',
                    padding: '0.8rem 1.8rem', borderRadius: '999px', fontWeight: 800,
                    fontSize: '0.95rem', cursor: 'pointer', display: 'inline-flex',
                    alignItems: 'center', gap: '0.6rem', boxShadow: '0 0 20px rgba(239,68,68,0.4)'
                  }}
                >
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fff', animation: 'pulse 1s infinite' }} />
                  Recording ({recordingSeconds}s) — Click to Submit
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  style={{
                    background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', color: '#fff', border: 'none',
                    padding: '0.8rem 1.8rem', borderRadius: '999px', fontWeight: 800,
                    fontSize: '0.95rem', cursor: 'pointer', display: 'inline-flex',
                    alignItems: 'center', gap: '0.6rem', boxShadow: '0 4px 15px rgba(14,165,233,0.35)'
                  }}
                >
                  <span>🎙️</span> Tap &amp; Speak "{currentQ.word}"
                </button>
              )}
            </div>

            {/* SKIP BUTTON */}
            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  const currentQ = questions[currentIndex] || DEFAULT_DIAGNOSTIC[0];
                  const skippedEval = {
                    display_name: currentQ.display_name,
                    sound: currentQ.sound,
                    word: currentQ.word,
                    pronounce: currentQ.pronounce,
                    skill: currentQ.skill,
                    score: 0.0,
                    detected: false,
                    spoken: []
                  };
                  const nextResults = [...results, skippedEval];
                  setResults(nextResults);
                  if (currentIndex + 1 < questions.length) {
                    setCurrentIndex(currentIndex + 1);
                    setStatus('idle');
                    setRecordingSeconds(0);
                  } else {
                    generateFinalReport(nextResults);
                  }
                }}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer' }}
              >
                Skip Question →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TEACHER DASHBOARD (Full Page) ────────────────────────────────────────────
const BRANCHES = ['ALL', 'CSE', 'IT', 'CS', 'CSIT', 'CSE (AI)', 'CSE(AIML)', 'MECH', 'ECE', 'ELCE', 'EEE'];

function TeacherDashboard({ teacher, onSignOut }) {
  const [reports, setReports]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [sortBy, setSortBy]               = useState('xp');         // 'xp'|'accuracy'|'passed'|'name'
  const [searchQuery, setSearchQuery]     = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);

  useEffect(() => {
    getAllStudentReports().then((data) => {
      setReports(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    let list = [...reports];
    if (selectedBranch !== 'ALL') list = list.filter((r) => r.branch === selectedBranch);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.libraryId.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (sortBy === 'accuracy') return b.avgScore - a.avgScore;
      if (sortBy === 'passed')   return b.completedCount - a.completedCount;
      if (sortBy === 'name')     return a.name.localeCompare(b.name);
      return b.xp - a.xp;
    });
    return list;
  }, [reports, selectedBranch, sortBy, searchQuery]);

  const collegeTop3 = useMemo(() =>
    [...reports].sort((a, b) => b.avgScore - a.avgScore).slice(0, 3), [reports]);

  const branchTop3 = useMemo(() => {
    if (selectedBranch === 'ALL') return [];
    return [...reports].filter((r) => r.branch === selectedBranch).sort((a, b) => b.avgScore - a.avgScore).slice(0, 3);
  }, [reports, selectedBranch]);

  const totalStudents   = reports.length;
  const avgClassAcc     = totalStudents > 0 ? Math.round(reports.reduce((s, r) => s + r.avgScore, 0) / totalStudents) : 0;
  const topPerformer    = collegeTop3[0];

  // Most common weak sound across all students
  const weakCounts = {};
  reports.forEach((r) => (r.weakestSoundsList || []).forEach((s) => { if (s) weakCounts[s] = (weakCounts[s] || 0) + 1; }));
  const topWeakSound = Object.entries(weakCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'TH (थ)';

  if (selectedStudent) {
    return <StudentDetailPanel student={selectedStudent} onBack={() => setSelectedStudent(null)} />;
  }

  const card = (label, value, color) => (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '1rem 1.2rem', textAlign: 'center', flex: 1, minWidth: '130px' }}>
      <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{value}</div>
    </div>
  );

  const RANK_MEDALS = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#080e1f 0%,#0d1127 60%,#0a1628 100%)', color: '#e2e8f0', fontFamily: 'Inter,system-ui,sans-serif' }}>
      {/* ── HEADER ── */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <div style={{ width: '2.4rem', height: '2.4rem', borderRadius: '10px', background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.1rem' }}>S</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>Sapphire — Faculty Analytics Dashboard</div>
            <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>👨‍🏫 {teacher.name} • Real-time class data from Supabase</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button onClick={() => getAllStudentReports().then((d) => { setReports(Array.isArray(d) ? d : []); })} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#cbd5e1', padding: '0.4rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem' }}>
            🔄 Refresh
          </button>
          <button onClick={() => exportCSVReport(filtered)} style={{ background: '#10b981', border: 'none', color: '#fff', padding: '0.4rem 0.9rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
            📥 Export CSV
          </button>
          <button onClick={onSignOut} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '0.4rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem' }}>
            Sign Out
          </button>
        </div>
      </header>

      <div style={{ padding: '1.5rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>

        {/* ── LOADING ── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
            Loading student data from Supabase...
          </div>
        )}

        {!loading && (
          <>
            {/* ── SUMMARY CARDS ── */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              {card('Total Students', totalStudents, '#38bdf8')}
              {card('College Avg Accuracy', `${avgClassAcc}%`, '#10b981')}
              {card('Top Performer', topPerformer ? topPerformer.name.split(' ')[0] : '—', '#f59e0b')}
              {card('Top Weak Sound', topWeakSound, '#f43f5e')}
            </div>

            {/* ── TOP PERFORMERS ── */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 0.8rem 0', fontSize: '0.9rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                🏆 Top Performers — {selectedBranch === 'ALL' ? 'Whole College' : selectedBranch}
              </h3>
              <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                {(selectedBranch === 'ALL' ? collegeTop3 : branchTop3).map((s, i) => (
                  <div key={s.libraryId} onClick={() => setSelectedStudent(s)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', gap: '0.7rem', cursor: 'pointer', flex: 1, minWidth: '200px', transition: 'border-color 0.2s' }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor='#38bdf8'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'}
                  >
                    <span style={{ fontSize: '1.6rem' }}>{RANK_MEDALS[i]}</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.92rem' }}>{s.avatar} {s.name}</div>
                      <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>{s.libraryId} • {s.branch}</div>
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1.1rem' }}>{s.avgScore}%</div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{s.completedCount} passed</div>
                    </div>
                  </div>
                ))}
                {(selectedBranch === 'ALL' ? collegeTop3 : branchTop3).length === 0 && (
                  <div style={{ color: '#64748b', fontSize: '0.85rem' }}>No students in this branch yet.</div>
                )}
              </div>
            </div>

            {/* ── FILTER & SORT BAR ── */}
            <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.8rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '0.8rem 1rem' }}>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 Search by name or library ID..."
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.84rem', flex: '1', minWidth: '180px' }}
              />
              <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} style={{ background: '#0d1127', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.84rem' }}>
                {BRANCHES.map((b) => <option key={b} value={b}>{b === 'ALL' ? 'All Branches' : b}</option>)}
              </select>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ background: '#0d1127', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.84rem' }}>
                <option value="xp">Sort: XP (High → Low)</option>
                <option value="accuracy">Sort: Accuracy % (High → Low)</option>
                <option value="passed">Sort: Questions Passed</option>
                <option value="name">Sort: Name A → Z</option>
              </select>
              <span style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }}>Showing {filtered.length} / {reports.length} students</span>
            </div>

            {/* ── STUDENT TABLE ── */}
            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', color: '#cbd5e1' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>#</th>
                    <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Student</th>
                    <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Library ID</th>
                    <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Branch</th>
                    <th style={{ padding: '0.7rem 1rem', textAlign: 'center', color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>XP</th>
                    <th style={{ padding: '0.7rem 1rem', textAlign: 'center', color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Passed /100</th>
                    <th style={{ padding: '0.7rem 1rem', textAlign: 'center', color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Avg Score</th>
                    <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Weakest Sounds</th>
                    <th style={{ padding: '0.7rem 1rem', textAlign: 'center', color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Last Active</th>
                    <th style={{ padding: '0.7rem 1rem', textAlign: 'center', color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>View</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No students found. Students will appear here after registering and practicing.</td></tr>
                  )}
                  {filtered.map((st, i) => (
                    <tr key={st.libraryId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s', cursor: 'pointer' }}
                      onClick={() => setSelectedStudent(st)}
                      onMouseEnter={(e) => e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                      onMouseLeave={(e) => e.currentTarget.style.background='transparent'}
                    >
                      <td style={{ padding: '0.65rem 1rem', color: '#64748b', fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600, color: '#fff' }}>{st.avatar} {st.name}</td>
                      <td style={{ padding: '0.65rem 1rem', color: '#38bdf8', fontFamily: 'monospace', fontSize: '0.8rem' }}>{st.libraryId}</td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>{st.branch}</span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#f59e0b', fontWeight: 700 }}>{st.xp}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                        <span style={{ color: st.completedCount > 0 ? '#10b981' : '#64748b' }}>{st.completedCount}</span>
                        <span style={{ color: '#64748b' }}>/100</span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: st.avgScore >= 80 ? '#10b981' : st.avgScore >= 60 ? '#f59e0b' : '#f43f5e' }}>{st.avgScore}%</span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: '#f43f5e', fontSize: '0.78rem' }}>{st.weakestSounds || '—'}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.78rem' }}>{st.lastActive || '—'}</td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                        <button style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8', padding: '0.2rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' }} onClick={(e) => { e.stopPropagation(); setSelectedStudent(st); }}>
                          View →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── STUDENT DETAIL PANEL ──────────────────────────────────────────────────────
function StudentDetailPanel({ student, onBack }) {
  const { levelDetail = [], recentAttempts = [] } = student;

  let rankName = 'Bronze Speaker 🥉'; let rankColor = '#cd7f32';
  if (student.completedCount >= 40 || student.xp >= 1000) { rankName = 'Diamond Orator 👑'; rankColor = '#38bdf8'; }
  else if (student.completedCount >= 20 || student.xp >= 500) { rankName = 'Gold Master 🥇'; rankColor = '#f59e0b'; }
  else if (student.completedCount >= 5  || student.xp >= 150) { rankName = 'Silver Speaker 🥈'; rankColor = '#94a3b8'; }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#080e1f 0%,#0d1127 60%,#0a1628 100%)', color: '#e2e8f0', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', padding: '0.4rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.84rem' }}>
          ← Back to Dashboard
        </button>
        <div style={{ fontWeight: 800, color: '#fff', fontSize: '1.05rem' }}>
          {student.avatar} {student.name} — Detailed Report
        </div>
      </header>

      <div style={{ padding: '1.5rem 2rem', maxWidth: '1100px', margin: '0 auto' }}>

        {/* Profile banner */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.2rem 1.5rem', marginBottom: '1.2rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
          <div style={{ fontSize: '2.5rem' }}>{student.avatar}</div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#fff' }}>{student.name}</div>
            <div style={{ color: '#94a3b8', fontSize: '0.82rem', marginTop: '0.2rem' }}>
              {student.libraryId} • {student.branch} • {student.email}
            </div>
            <div style={{ marginTop: '0.4rem', color: rankColor, fontWeight: 700, fontSize: '0.9rem' }}>{rankName}</div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            {[['XP', student.xp, '#f59e0b'], ['Passed', `${student.completedCount}/100`, '#10b981'], ['Avg Score', `${student.avgScore}%`, '#38bdf8'], ['Streak', `${student.streak}d`, '#a855f7']].map(([l, v, c]) => (
              <div key={l} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                <div style={{ fontWeight: 800, fontSize: '1.3rem', color: c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

          {/* Level-by-level history */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '1rem', maxHeight: '380px', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 0.8rem 0', fontSize: '0.85rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              📋 Level-by-Level Scores ({levelDetail.length} attempted)
            </h3>
            {levelDetail.length === 0 && <div style={{ color: '#64748b', fontSize: '0.83rem' }}>No levels attempted yet.</div>}
            {levelDetail.map((lv) => (
              <div key={lv.levelId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.5rem', borderRadius: '8px', marginBottom: '0.2rem', background: lv.passed ? 'rgba(16,185,129,0.05)' : 'rgba(244,63,94,0.05)' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b', width: '2.5rem', flexShrink: 0 }}>Q{lv.levelId}</span>
                <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${lv.bestScore}%`, background: lv.passed ? '#10b981' : '#f43f5e', borderRadius: '3px' }} />
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: lv.passed ? '#10b981' : '#f43f5e', width: '2.8rem', textAlign: 'right' }}>{lv.bestScore}%</span>
                <span style={{ fontSize: '0.68rem', color: '#64748b', width: '1.5rem', textAlign: 'center' }}>{lv.passed ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>

          {/* Recent attempts */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '1rem', maxHeight: '380px', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 0.8rem 0', fontSize: '0.85rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              🕒 Recent Practice Attempts (last {recentAttempts.length})
            </h3>
            {recentAttempts.length === 0 && <div style={{ color: '#64748b', fontSize: '0.83rem' }}>No attempts recorded yet.</div>}
            {recentAttempts.map((att, i) => (
              <div key={i} style={{ padding: '0.55rem 0.7rem', borderRadius: '8px', marginBottom: '0.4rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.83rem' }}>Q{att.levelId}: {att.label}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: att.passed ? '#10b981' : '#f43f5e' }}>{att.score}% {att.passed ? '✓' : '✗'}</span>
                </div>
                {att.weakSounds?.length > 0 && (
                  <div style={{ fontSize: '0.72rem', color: '#f43f5e', marginTop: '0.2rem' }}>⚠ Weak: {att.weakSounds.slice(0, 3).join(', ')}</div>
                )}
                <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.2rem' }}>{att.date ? new Date(att.date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : ''}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Weak sounds summary */}
        {student.weakestSoundsList?.length > 0 && (
          <div style={{ marginTop: '1rem', background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '12px', padding: '0.9rem 1.1rem' }}>
            <div style={{ fontWeight: 700, color: '#f43f5e', fontSize: '0.83rem', marginBottom: '0.4rem' }}>⚠️ Top Phoneme Challenges</div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {student.weakestSoundsList.map((s) => (
                <span key={s} style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.25)', color: '#fb7185', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.82rem', fontWeight: 600 }}>{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveCoach({ status, seconds, levelType }) {
  const targetSeconds = levelType === 'paragraph' ? 24 : levelType === 'sentence' ? 10 : 5;
  const pace = Math.min(100, Math.round((seconds / targetSeconds) * 100));
  const prompt =
    status === 'recording'
      ? seconds < 2
        ? 'Speak clearly'
        : seconds > targetSeconds
          ? 'Wrap up now'
          : 'Maintain rhythm'
      : status === 'processing'
        ? 'AI Scorer running...'
        : 'Microphone Ready';

  return (
    <div className="live-coach">
      <div>
        <strong>{prompt}</strong>
        <span>{seconds}s recorded</span>
      </div>
      <div className="meter">
        <span style={{ width: `${pace}%` }} />
      </div>
    </div>
  );
}

function ResultScreen({ result, activeLevel, onRetry, onMap }) {
  const data = result.pronunciation || result || {};
  const currentScore = data.overall_score || data.score || result.score || 0;
  const radius = 66;
  const strokeDasharray = 2 * Math.PI * radius;
  const strokeDashoffset = strokeDasharray * (1 - currentScore / 100);

  const wrongItems = data.sound_level_comparison?.filter(item => item.type === "wrong" || item.type === "close") || [];
  const missingItems = data.sound_level_comparison?.filter(item => item.type === "missing") || [];
  const extraItems = data.sound_level_comparison?.filter(item => item.type === "extra") || [];

  return (
    <div className="result-panel">
      <div className="score-circle-container">
        <svg className="score-ring" width="160" height="160">
          <circle
            className="score-ring-bg"
            stroke="rgba(255, 255, 255, 0.04)"
            strokeWidth="10"
            fill="transparent"
            r={radius}
            cx="80"
            cy="80"
          />
          <circle
            className="score-ring-fill"
            stroke={result.passed ? "#10b981" : "#f59e0b"}
            strokeWidth="10"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            r={radius}
            cx="80"
            cy="80"
            transform="rotate(-90 80 80)"
          />
        </svg>
        <div className="score-circle-text">
          <strong>{currentScore}</strong>
          <span>SCORE</span>
        </div>
      </div>

      <div className="score-badge-container">
        {result.passed ? (
          <span className="score-badge score-badge--passed">🎉 Passed</span>
        ) : (
          <span className="score-badge score-badge--retry">💪 Keep Practicing</span>
        )}
      </div>

      {data.sound_level_comparison?.length > 0 && (
        <div className="result-section">
          <h2 className="section-title">
            <span className="section-title-icon">🔤</span> PHONEME BREAKDOWN
          </h2>
          <div className="phonemes-container">
            {data.sound_level_comparison.map((item, idx) => {
              const statusClass = item.type === "correct" ? "sound-pill--correct"
                : item.type === "accent_match" ? "sound-pill--accent_match"
                : item.type === "close" ? "sound-pill--close"
                : "sound-pill--wrong";
              
              const exp = humanizePhoneme(item.expected);
              const spk = humanizePhoneme(item.spoken);

              return (
                <div key={idx} className={`sound-pill ${statusClass}`} style={{ textAlign: 'center', minWidth: '70px', padding: '0.5rem 0.8rem' }}>
                  <div style={{ fontSize: '0.7rem', opacity: 0.75, fontWeight: 800 }}>
                    {item.type === 'missing' ? 'x Missing' : item.type === 'extra' ? '+ Extra' : item.type === 'accent_match' ? '≈ Accepted' : item.type === 'correct' ? '✓ Clear' : '⚠ Check'}
                  </div>
                  
                  <strong style={{ fontSize: '1.15rem', display: 'block', marginTop: '0.2rem', color: '#fff' }}>
                    {exp.main || spk.main} <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 600 }}>{exp.sub || spk.sub}</span>
                  </strong>
                  
                  {spk.main && exp.main && spk.main !== exp.main && (
                    <div style={{ fontSize: '0.72rem', opacity: 0.85, marginTop: '0.2rem', color: '#f43f5e' }}>
                      Heard: {spk.main} {spk.sub}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="result-section">
        <h2 className="section-title">
          <span className="section-title-icon">💬</span> FEEDBACK & CORRECTIONS
        </h2>
        <div className="feedback-alerts-container">
          <div className="feedback-alert-card feedback-alert-card--info">
            <span className="feedback-alert-icon">ℹ️</span>
            <p>{data.ai_summary || (result.passed ? "Excellent! All sounds matched target parameters." : "Fair attempt. Keep practicing the highlighted sounds.")}</p>
          </div>

          {data.audio_quality_warning && (
            <div className="feedback-alert-card feedback-alert-card--warning">
              <span className="feedback-alert-icon">⚠️</span>
              <p>{data.audio_quality_warning}</p>
            </div>
          )}

          {wrongItems.map((item, idx) => {
            const exp = humanizePhoneme(item.expected);
            const spk = humanizePhoneme(item.spoken);
            return (
              <div key={idx} className="feedback-alert-card feedback-alert-card--info">
                <span className="feedback-alert-icon">ℹ️</span>
                <p>Focus on target sound: <strong>{exp.main} {exp.sub}</strong> → you said <strong>"{spk.main} {spk.sub}"</strong></p>
              </div>
            );
          })}

          {missingItems.length > 0 && (
            <div className="feedback-alert-card feedback-alert-card--info">
              <span className="feedback-alert-icon">ℹ️</span>
              <p>
                {missingItems.length} sound(s) missing — try to pronounce every sound completely.
              </p>
            </div>
          )}

          {extraItems.length > 0 && (
            <div className="feedback-alert-card feedback-alert-card--info">
              <span className="feedback-alert-icon">ℹ️</span>
              <p>
                {extraItems.length} extra sound(s) detected — try to be more precise.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="result-section">
        <h2 className="section-title">
          <span className="section-title-icon">🎯</span> HOW TO IMPROVE
        </h2>
        <div className="how-to-improve-container">
          {wrongItems.map((item, idx) => (
            <div key={idx} className="improve-card">
              <span className="improve-icon">💡</span>
              <p>You said "{item.spoken}" — try pronouncing "{item.expected}" more clearly</p>
            </div>
          ))}

          {missingItems.map((item, idx) => (
            <div key={idx} className="improve-card">
              <span className="improve-icon">💡</span>
              <p>You missed the "{item.expected}" sound — make sure to include it</p>
            </div>
          ))}

          {extraItems.map((item, idx) => (
            <div key={idx} className="improve-card">
              <span className="improve-icon">💡</span>
              <p>Extra "{item.spoken}" sound detected — try to avoid adding it</p>
            </div>
          ))}

          {wrongItems.length === 0 && missingItems.length === 0 && extraItems.length === 0 && (
            <div className="improve-card">
              <span className="improve-icon">💡</span>
              <p>Fabulous pronunciation! All phonemes aligned perfectly. Keep repeating this challenge to build strong muscle memory.</p>
            </div>
          )}
        </div>
      </div>

      <div className="practice-actions" style={{ marginTop: '1rem' }}>
        <button className="secondary-action" type="button" onClick={onRetry}>
          Practice Again
        </button>
        <button className="primary-action" type="button" onClick={onMap}>
          Continue Quest Map
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function normalizeScore(score) {
  const numeric = Number(score || 0);
  if (numeric <= 1) return Math.round(numeric * 100);
  return Math.round(numeric);
}

function getWeakSounds(attempts) {
  const counts = {};
  attempts.forEach((attempt) => {
    (attempt.weakSounds || []).forEach((sound) => {
      const h = humanizePhoneme(sound).main;
      if (h) counts[h] = (counts[h] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([sound]) => sound);
}

// ── IPA TO FRIENDLY ENGLISH + HINDI PHONEME HUMANIZER ─────────────────────────
const PHONEME_HUMAN_MAP = {
  'θ': { sound: 'TH', hindi: 'थ', hint: "unvoiced 'th' as in think" },
  'ð': { sound: 'TH', hindi: 'ध', hint: "voiced 'th' as in mother" },
  'ʃ': { sound: 'SH', hindi: 'श', hint: "sh sound as in ship" },
  'tʃ': { sound: 'CH', hindi: 'च', hint: "ch sound as in chair" },
  'dʒ': { sound: 'J', hindi: 'ज', hint: "j sound as in job" },
  'ŋ': { sound: 'NG', hindi: 'ङ', hint: "ng sound as in sing" },
  'ʒ': { sound: 'ZH', hindi: 'झ', hint: "zh sound as in vision" },
  'v': { sound: 'V', hindi: 'व', hint: "v sound" },
  'w': { sound: 'W', hindi: 'व', hint: "w sound" },
  'r': { sound: 'R', hindi: 'र', hint: "r sound" },
  'ɹ': { sound: 'R', hindi: 'र', hint: "r sound" },
  'ɾ': { sound: 'R', hindi: 'र', hint: "r sound" },
  'p': { sound: 'P', hindi: 'प', hint: "p sound" },
  'b': { sound: 'B', hindi: 'ब', hint: "b sound" },
  't': { sound: 'T', hindi: 'त/ट', hint: "t sound" },
  'd': { sound: 'D', hindi: 'द/ड', hint: "d sound" },
  'k': { sound: 'K', hindi: 'क', hint: "k sound" },
  'g': { sound: 'G', hindi: 'ग', hint: "g sound" },
  'f': { sound: 'F', hindi: 'फ़', hint: "f sound" },
  's': { sound: 'S', hindi: 'स', hint: "s sound" },
  'z': { sound: 'Z', hindi: 'ज़', hint: "z sound" },
  'm': { sound: 'M', hindi: 'म', hint: "m sound" },
  'n': { sound: 'N', hindi: 'न', hint: "n sound" },
  'l': { sound: 'L', hindi: 'ल', hint: "l sound" },
  'h': { sound: 'H', hindi: 'ह', hint: "h sound" },
  'j': { sound: 'Y', hindi: 'य', hint: "y sound" },
  '3:r': { sound: 'ER', hindi: 'अर्', hint: "er sound as in bird" },
  'ɜːr': { sound: 'ER', hindi: 'अर्', hint: "er sound as in bird" },
  'ɜː': { sound: 'ER', hindi: 'अर्', hint: "er sound as in bird" },
  'ɑ:': { sound: 'AH', hindi: 'आ', hint: "long ah sound as in car" },
  'ɑ': { sound: 'AH', hindi: 'आ', hint: "ah sound" },
  'æ': { sound: 'AE', hindi: 'ऐ', hint: "short a sound as in cat" },
  'ʌ': { sound: 'UH', hindi: 'अ', hint: "short u sound as in sun" },
  'ə': { sound: 'AH', hindi: 'अ', hint: "schwa sound" },
  'ɛ': { sound: 'EH', hindi: 'ए', hint: "short e sound as in bed" },
  'e': { sound: 'EH', hindi: 'ए', hint: "short e sound" },
  'ɪ': { sound: 'IH', hindi: 'इ', hint: "short i sound as in sit" },
  'i': { sound: 'IH', hindi: 'इ', hint: "i sound" },
  'iː': { sound: 'EE', hindi: 'ई', hint: "long ee sound as in see" },
  'i:': { sound: 'EE', hindi: 'ई', hint: "long ee sound as in see" },
  'ʊ': { sound: 'OO', hindi: 'उ', hint: "short oo sound as in book" },
  'u': { sound: 'OO', hindi: 'उ', hint: "oo sound" },
  'uː': { sound: 'OO', hindi: 'ऊ', hint: "long oo sound as in moon" },
  'u:': { sound: 'OO', hindi: 'ऊ', hint: "long oo sound as in moon" },
  'ɔː': { sound: 'AW', hindi: 'ऑ', hint: "aw sound as in ball" },
  'ɔ:': { sound: 'AW', hindi: 'ऑ', hint: "aw sound as in ball" },
  'ɔ': { sound: 'AW', hindi: 'ऑ', hint: "aw sound" },
  'oʊ': { sound: 'OH', hindi: 'ओ', hint: "oh sound as in go" },
  'əʊ': { sound: 'OH', hindi: 'ओ', hint: "oh sound as in go" },
  'eɪ': { sound: 'AY', hindi: 'ए', hint: "ay sound as in day" },
  'aɪ': { sound: 'AI', hindi: 'आइ', hint: "ai sound as in my" },
  'aʊ': { sound: 'OW', hindi: 'आउ', hint: "ow sound as in now" },
  'ɔɪ': { sound: 'OY', hindi: 'ओइ', hint: "oy sound as in boy" },
};

function humanizePhoneme(symbol) {
  if (!symbol) return { main: '', sub: '', hint: '' };
  const clean = String(symbol).trim().toLowerCase();
  
  if (PHONEME_HUMAN_MAP[clean]) {
    const item = PHONEME_HUMAN_MAP[clean];
    return {
      main: item.sound,
      sub: `(${item.hindi})`,
      hint: item.hint
    };
  }
  
  return {
    main: clean.toUpperCase(),
    sub: '',
    hint: ''
  };
}
