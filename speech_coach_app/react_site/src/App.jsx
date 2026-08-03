// Speech Coach Premium Gamified Interface
import { useEffect, useMemo, useRef, useState } from 'react';
import { 
  API_BASE, 
  checkPronunciation, 
  translateAudio, 
  fetchGrammarSentence, 
  checkGrammar,
  fetchScenario,
  translateInterview
} from './api.js';
import { AudioRecorder } from './audio.js';
import { loadSession, signInUser, signUpUser, signOutUser } from './auth.js';
import { stages, allLevels, getLevel, PASS_SCORE } from './levels.js';
import { isUnlocked, loadProgressForUser, saveAttempt } from './progress.js';

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
  const [progress, setProgress] = useState(() => loadProgressForUser(loadSession()?.id));
  const [activeLevelId, setActiveLevelId] = useState(1);
  const [selectedStageId, setSelectedStageId] = useState(1);
  const [screen, setScreen] = useState(user ? 'map' : 'auth'); // 'map' | 'practice' | 'result' | 'translate' | 'grammar' | 'auth'
  const [status, setStatus] = useState('ready');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // Translation feature states
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

  async function handleAuthSuccess(loggedInUser) {
    setUser(loggedInUser);
    setProgress(loadProgressForUser(loggedInUser.id));
    setScreen('map');
  }

  function handleSignOut() {
    signOutUser();
    setUser(null);
    setShowProfileModal(false);
    setProgress(loadProgressForUser('guest'));
    setScreen('auth');
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

  if (screen === 'auth') {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
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
                    <button className="primary-action" type="button" onClick={() => startLevel(nextOpen)}>
                      🚀 Start Q#{nextOpen.id}: {nextOpen.label}
                    </button>
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

// ── AUTHENTICATION SCREEN WITH LIBRARY ID + SUPABASE / LOCAL ────────────────────
function AuthScreen({ onAuthSuccess }) {
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState('👨‍🎓');

  const AVATARS = ['👨‍🎓', '👩‍💻', '🚀', '👑', '🎯', '⚡'];

  async function handleSubmit(event) {
    event.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    const formData = new FormData(event.currentTarget);
    const libraryId = formData.get('libraryId');
    const password = formData.get('password');
    const name = formData.get('name');
    const branch = formData.get('branch');

    try {
      let loggedUser;
      if (authMode === 'register') {
        loggedUser = await signUpUser({
          name,
          libraryId,
          branch,
          password,
          avatar: selectedAvatar
        });
      } else {
        loggedUser = await signInUser({
          libraryId,
          password
        });
      }
      onAuthSuccess(loggedUser);
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
          <p>Sign in with your College Library ID & Password for personal AI pronunciation coaching.</p>
        </div>

        {/* Auth mode toggle */}
        <div className="tool-tabs" style={{ justifyContent: 'center', marginBottom: '0.8rem' }}>
          <button
            type="button"
            className={`tool-tab ${authMode === 'login' ? 'tool-tab--active' : ''}`}
            onClick={() => { setAuthMode('login'); setAuthError(''); }}
          >
            🔐 Student Login
          </button>
          <button
            type="button"
            className={`tool-tab ${authMode === 'register' ? 'tool-tab--active' : ''}`}
            onClick={() => { setAuthMode('register'); setAuthError(''); }}
          >
            📝 Register ID
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {authMode === 'register' && (
            <>
              <label>
                Full Name
                <input name="name" minLength="2" placeholder="Arpit Agarwal" required />
              </label>

              <label>
                Branch
                <select name="branch" style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)',
                  color: '#fff', padding: '0.8rem', borderRadius: '12px', width: '100%'
                }} required>
                  <option value="CSE" style={{ background: '#0d1127' }}>CSE</option>
                  <option value="IT" style={{ background: '#0d1127' }}>IT</option>
                  <option value="CS" style={{ background: '#0d1127' }}>CS</option>
                  <option value="CSIT" style={{ background: '#0d1127' }}>CSIT</option>
                  <option value="CSE (AI)" style={{ background: '#0d1127' }}>CSE (AI)</option>
                  <option value="CSE(AIML)" style={{ background: '#0d1127' }}>CSE(AIML)</option>
                  <option value="MECH" style={{ background: '#0d1127' }}>MECH</option>
                  <option value="ECE" style={{ background: '#0d1127' }}>ECE</option>
                  <option value="ELCE" style={{ background: '#0d1127' }}>ELCE</option>
                  <option value="EEE" style={{ background: '#0d1127' }}>EEE</option>
                </select>
              </label>

              <div>
                <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600 }}>Choose Avatar</span>
                <div className="avatar-selector-row">
                  {AVATARS.map((av) => (
                    <button
                      key={av}
                      type="button"
                      className={`avatar-btn ${selectedAvatar === av ? 'avatar-btn--selected' : ''}`}
                      onClick={() => setSelectedAvatar(av)}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <label>
            College Library ID
            <input 
              name="libraryId" 
              placeholder="Ex: 2428CSEAIML994" 
              required 
              style={{ textTransform: 'uppercase' }}
            />
            <small style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Format: Alphanumeric College ID</small>
          </label>

          <label>
            Password
            <input 
              name="password" 
              type="password" 
              placeholder="••••••••" 
              minLength="6" 
              required 
            />
          </label>

          {authError && <div className="error-box">{authError}</div>}

          <button className="primary-action" type="submit" disabled={authLoading} style={{ width: '100%', justifyContent: 'center' }}>
            {authLoading ? 'Signing in...' : authMode === 'register' ? 'Register & Begin Quest' : 'Login to Quest Map'}
          </button>
        </form>
      </section>
    </main>
  );
}

// ── PROFILE MODAL COMPONENT ───────────────────────────────────────────────────
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
