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
import { loadSession, signInUser, signOutUser } from './auth.js';
import { stages, allLevels, getLevel, PASS_SCORE } from './levels.js';
import { isUnlocked, loadProgressForUser, saveAttempt } from './progress.js';

const TOOL_TABS = ['translate', 'grammar'];

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
  const [screen, setScreen] = useState(user ? 'map' : 'auth');
  const [status, setStatus] = useState('ready');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  
  // Translation feature states
  const [transTranscript, setTransTranscript] = useState('');
  const [transTranslation, setTransTranslation] = useState('');
  const [transAudioBase64, setTransAudioBase64] = useState('');
  
  // Interview practice states
  const [translateMode, setTranslateMode] = useState('simple'); // 'simple' | 'interview'
  const [interviewTopic, setInterviewTopic] = useState('daily');
  const [interviewQuestion, setInterviewQuestion] = useState(null);  // { english, hindi }
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [interviewResult, setInterviewResult] = useState(null);  // { transcript, translation, score, strengths, missing, better_answer }
  
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

  // Load initial grammar sentence when entering grammar screen
  useEffect(() => {
    if (screen === 'grammar') {
      loadNextGrammar();
    }
  }, [screen, grammarLevel]);

  // Load interview question when entering translate screen in interview mode
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
    } catch (err) {
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
    } catch (err) {
      setError('Failed to load question. Check connection.');
    } finally {
      setInterviewLoading(false);
    }
  }

  function handleAuth(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextUser = signInUser({
      name: formData.get('name'),
      mobile: formData.get('mobile'),
      city: formData.get('city')
    });
    setUser(nextUser);
    setProgress(loadProgressForUser(nextUser.id));
    setScreen('map');
  }

  function handleSignOut() {
    signOutUser();
    setUser(null);
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
    return <AuthScreen onSubmit={handleAuth} />;
  }

  return (
    <div className="app-shell">
      <canvas ref={confettiCanvasRef} className="confetti-canvas" />
      
      <header className="topbar">
        <div className="brand" onClick={() => setScreen('map')}>
          <span className="brand-mark">S</span>
          <div>
            <strong>Sapphire Speech Coach</strong>
            <small>{user?.name || 'AI speaking quest'} / Level {level}</small>
          </div>
        </div>
        <div className="top-stats">
          <Stat label="XP" value={progress.xp} />
          <Stat label="Streak" value={`${progress.streak}d`} />
          <Stat label="Done" value={`${completedCount}/${allLevels.length}`} />
          <button className="logout-btn" type="button" onClick={handleSignOut}>Logout</button>
        </div>
      </header>

      <main>
        <aside className="sidebar">
          <div className="profile-card">
            <span className="avatar-ring">SC</span>
            <strong>{user?.name || 'Speaker'}</strong>
            <small>Rank: {level >= 4 ? 'Fluency Ninja' : 'Pro Speaker'}</small>
          </div>
          <div className="nav-stack">
            <button 
              className={`nav-item ${screen === 'map' ? 'nav-item--active' : ''}`} 
              type="button" 
              onClick={() => setScreen('map')}
            >
              Quest Map
            </button>
            <button 
              className={`nav-item ${screen === 'practice' ? 'nav-item--active' : ''}`} 
              type="button" 
              onClick={() => startLevel(nextOpen)}
            >
              Practice
            </button>
            <button 
              className={`nav-item ${screen === 'translate' ? 'nav-item--active' : ''}`} 
              type="button" 
              onClick={() => {
                setTransTranscript('');
                setTransTranslation('');
                setTransAudioBase64('');
                setScreen('translate');
              }}
            >
              Translator
            </button>
            <button 
              className={`nav-item ${screen === 'grammar' ? 'nav-item--active' : ''}`} 
              type="button" 
              onClick={() => {
                setGrammarResult(null);
                setScreen('grammar');
              }}
            >
              Grammar
            </button>
          </div>
        </aside>

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
                  const isStageUnlocked = stg.id === 1 || stages.find((s) => s.id === stg.id - 1)?.questions.every((q) => (progress.completed[q.id]?.bestScore || 0) >= PASS_SCORE);
                  const isSelected = selectedStageId === stg.id;

                  return (
                    <button
                      key={stg.id}
                      type="button"
                      className={`stage-tab-card ${isSelected ? 'stage-tab-card--active' : ''} ${!isStageUnlocked ? 'stage-tab-card--locked' : ''}`}
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
              ← Back to Map
            </button>
            <p className="eyebrow">{activeLevel.groupTitle} / Level {activeLevel.id}</p>
            <h1>{activeLevel.label}</h1>
            <div className="target-card">
              <span>{activeLevel.type}</span>
              <p>{activeLevel.target}</p>
              <small>Focus: {activeLevel.focus}</small>
            </div>
            
            <LiveCoach status={status} seconds={recordingSeconds} levelType={activeLevel.type} />
            
            <div className="practice-actions">
              <button className="secondary-action" type="button" onClick={listenTarget}>
                Listen Target
              </button>
              <button 
                className={`record-button ${status === 'recording' ? 'record-button--active' : ''}`} 
                type="button" 
                onClick={() => handleRecord('pronunciation')}
              >
                {status === 'recording' ? 'Stop' : status === 'processing' ? '...' : 'Record'}
              </button>
            </div>
            {error && <div className="error-box">{error}</div>}
            <p className="api-note">Engine base: {API_BASE}</p>
          </section>
        )}

        {screen === 'result' && result && (
          <section className="practice-panel">
            <button className="ghost-button" type="button" onClick={() => setScreen('map')}>
              ← Back to Map
            </button>
            <ResultScreen 
              result={result} 
              activeLevel={activeLevel} 
              onRetry={() => startLevel(activeLevel)} 
              onMap={() => setScreen('map')} 
            />
          </section>
        )}

        {screen === 'translate' && (
          <section className="practice-panel">
            <button className="ghost-button" type="button" onClick={() => setScreen('map')}>
              ← Back to Map
            </button>
            <p className="eyebrow">AI Tools</p>
            <h1>Voice Translator (Hindi → English)</h1>

            {/* Mode tabs */}
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

            {/* ── SIMPLE TRANSLATE ── */}
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

            {/* ── INTERVIEW PRACTICE ── */}
            {translateMode === 'interview' && (
              <>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '-0.6rem', marginBottom: '1rem' }}>
                  Choose a topic, get an AI question, answer in Hindi — receive instant coaching feedback.
                </p>

                {/* Topic selector */}
                <div className="tool-tabs" style={{ marginBottom: '1rem' }}>
                  {[['daily','Daily'],['placement','Placement'],['college','College'],['finance','Finance']].map(([key, label]) => (
                    <button key={key} type="button"
                      className={`tool-tab ${interviewTopic === key ? 'tool-tab--active' : ''}`}
                      onClick={() => setInterviewTopic(key)}
                    >{label}</button>
                  ))}
                </div>

                {/* Question card */}
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

                {/* Refresh + Record */}
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

                {/* Interview Feedback Result */}
                {interviewResult && (
                  <div style={{ display: 'grid', gap: '1rem', marginTop: '1.2rem' }}>

                    {/* Score + Translation */}
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

                    {/* Strengths */}
                    <div style={{
                      background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
                      borderRadius: '12px', padding: '1rem'
                    }}>
                      <p style={{ color: '#10b981', fontWeight: 700, margin: '0 0 0.5rem', fontSize: '0.85rem' }}>✅ STRENGTHS</p>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                        {(interviewResult.strengths || []).map((s, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{s}</li>)}
                      </ul>
                    </div>

                    {/* Missing */}
                    <div style={{
                      background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
                      borderRadius: '12px', padding: '1rem'
                    }}>
                      <p style={{ color: '#f59e0b', fontWeight: 700, margin: '0 0 0.5rem', fontSize: '0.85rem' }}>⚠️ IMPROVE</p>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                        {(interviewResult.missing || []).map((m, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{m}</li>)}
                      </ul>
                    </div>

                    {/* Better Answer */}
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
        )}

        {screen === 'grammar' && (
          <section className="practice-panel">
            <button className="ghost-button" type="button" onClick={() => setScreen('map')}>
              ← Back to Map
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
                    <strong>AI Advice:</strong>
                    {grammarResult.feedback.map((fbText, i) => <div key={i}>• {fbText}</div>)}
                  </div>
                )}

                {grammarResult.mistakes?.length > 0 && (
                  <div className="mistake-panel">
                    <h2>Identified Mistakes</h2>
                    {grammarResult.mistakes.map((mis, i) => (
                      <article key={i}>
                        <strong style={{ color: '#f43f5e' }}>{mis.type || 'Error'}</strong>
                        <span>"{mis.wrong_part}" → "{mis.correct_part}"</span>
                        <p>{mis.tip}</p>
                      </article>
                    ))}
                  </div>
                )}

                <button className="primary-action" type="button" onClick={loadNextGrammar} style={{ width: '100%', justifyContent: 'center' }}>
                  Next Challenge →
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function AuthScreen({ onSubmit }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div style={{ textAlign: 'center' }}>
          <span className="brand-mark" style={{ margin: '0 auto 1rem auto' }}>S</span>
          <h1>Sapphire Speech Coach</h1>
          <p>AI-powered speaking, clarity training, and grammar feedback for confident English communication.</p>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Full Name
            <input name="name" minLength="2" placeholder="Arpit Agarwal" required />
          </label>
          <label>
            Mobile Number
            <input name="mobile" placeholder="9876543210" required />
          </label>
          <label>
            City
            <input name="city" placeholder="Jaipur" />
          </label>
          <button className="primary-action" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
            Enter Quest Map
          </button>
        </form>
      </section>
    </main>
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

  // Group wrong/close/missing/extra elements from alignment
  const wrongItems = data.sound_level_comparison?.filter(item => item.type === "wrong" || item.type === "close") || [];
  const missingItems = data.sound_level_comparison?.filter(item => item.type === "missing") || [];
  const extraItems = data.sound_level_comparison?.filter(item => item.type === "extra") || [];

  return (
    <div className="result-panel">
      {/* SVG Score Circle */}
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

      {/* Passed/Keep Practicing Badge */}
      <div className="score-badge-container">
        {result.passed ? (
          <span className="score-badge score-badge--passed">🎉 Passed</span>
        ) : (
          <span className="score-badge score-badge--retry">💪 Keep Practicing</span>
        )}
      </div>

      {/* Phoneme Breakdown Section */}
      {data.sound_level_comparison?.length > 0 && (
        <div className="result-section">
          <h2 className="section-title">
            <span className="section-title-icon">🔤</span> PHONEME BREAKDOWN
          </h2>
          <div className="phoneme-breakdown-grid">
            {data.sound_level_comparison.map((item, index) => {
              let cardClass = "";
              let icon = "";
              let midVal = "";
              let botVal = "";

              if (item.type === "correct" || item.type === "accent_match") {
                cardClass = "phoneme-card--correct";
                icon = "✓";
                midVal = item.expected;
              } else if (item.type === "wrong" || item.type === "close") {
                cardClass = "phoneme-card--wrong";
                icon = "✗";
                midVal = item.expected;
                botVal = item.spoken;
              } else if (item.type === "missing") {
                cardClass = "phoneme-card--missing";
                icon = "?";
                midVal = item.expected;
              } else if (item.type === "extra") {
                cardClass = "phoneme-card--extra";
                icon = "+";
                midVal = item.spoken;
              }

              return (
                <div key={index} className={`phoneme-card ${cardClass}`}>
                  <span className="phoneme-card-icon">{icon}</span>
                  <span className="phoneme-card-expected">{midVal || "-"}</span>
                  {botVal && <span className="phoneme-card-spoken">{botVal}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Feedback & Corrections Section */}
      <div className="result-section">
        <h2 className="section-title">
          <span className="section-title-icon">💬</span> FEEDBACK & CORRECTIONS
        </h2>
        <div className="feedback-alerts-container">

          {/* Main Coach Feedback Alert */}
          <div className="feedback-alert-card feedback-alert-card--info">
            <span className="feedback-alert-icon">ℹ️</span>
            <p>{data.ai_summary || (result.passed ? "Excellent! All sounds matched target parameters." : "Fair attempt. Keep practicing the highlighted sounds.")}</p>
          </div>

          {/* Audio Quality warnings */}
          {data.audio_quality_warning && (
            <div className="feedback-alert-card feedback-alert-card--warning">
              <span className="feedback-alert-icon">⚠️</span>
              <p>{data.audio_quality_warning}</p>
            </div>
          )}

          {/* Dynamic Wrong/Close sounds corrections */}
          {wrongItems.map((item, idx) => (
            <div key={idx} className="feedback-alert-card feedback-alert-card--info">
              <span className="feedback-alert-icon">ℹ️</span>
              <p>Focus on: "{item.expected}" → you said "{item.spoken}"</p>
            </div>
          ))}

          {/* Missing sounds corrections */}
          {missingItems.length > 0 && (
            <div className="feedback-alert-card feedback-alert-card--warning">
              <span className="feedback-alert-icon">⚠️</span>
              <p>
                You missed {missingItems.length} sound(s):{" "}
                {missingItems.map(item => item.expected).join(", ")}
              </p>
            </div>
          )}

          {/* Extra sounds corrections */}
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

      {/* How to Improve Section */}
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

          {/* Standard pass recommendation */}
          {wrongItems.length === 0 && missingItems.length === 0 && extraItems.length === 0 && (
            <div className="improve-card">
              <span className="improve-icon">💡</span>
              <p>Fabulous pronunciation! All phonemes aligned perfectly. Keep repeating this challenge to build strong muscle memory.</p>
            </div>
          )}
        </div>
      </div>

      {/* Buttons */}
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
      counts[sound] = (counts[sound] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([sound]) => sound);
}
