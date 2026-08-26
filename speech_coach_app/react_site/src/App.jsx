// ────────────────────────────────────────────────────────────────────────────
//  App.jsx — Sapphire Speech Coach (Human-Crafted Gamified Experience)
//  Full UI/UX Alignment with Reference Mockups:
//  - English & Hindi phonetic translations for all IPA symbols
//  - Clean, uncluttered Home Dashboard (Screen 2)
//  - Mobile Navigation with direct Translator & AI access (Screen 7)
//  - Clean Practice Screen without distractions (Screen 4)
//  - Streamlined Result Screen with Phoneme breakdown (Screen 5 - Fluency/Clarity removed)
//  - Diagnostic Test without hints/audio + Detailed 15-Question Report (Screen 8)
//  - Auto-silence voice recording detection across Pronunciation, Grammar & Translator
// ────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import Mascot from './Mascot.jsx';
import { formatPhoneme, formatPhonemeShort, humanizeFeedback } from './phoneticMap.js';
import { 
  API_BASE, 
  checkPronunciation, 
  translateAudio, 
  fetchGrammarSentence, 
  checkGrammar,
  fetchScenario,
  translateInterview,
  fetchDiagnosticQuestions,
  evaluateDiagnosticSound
} from './api.js';
import { AudioRecorder } from './audio.js';
import { 
  loadSession, 
  loadTeacherSession, 
  signInUser, 
  signUpUser, 
  signOutUser, 
  signOutTeacher, 
  resetUserPassword, 
  getAllStudentReports, 
  exportCSVReport 
} from './auth.js';
import { stages, allLevels, getLevel, PASS_SCORE } from './levels.js';
import { 
  isUnlocked, 
  loadProgressForUser, 
  syncAndLoadProgressForUser, 
  saveAttempt 
} from './progress.js';

// ── Confetti Celebration Animation ──────────────────────────────────────────
class ConfettiEffect {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.colors = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];
  }
  
  start() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.particles = [];
    for (let i = 0; i < 100; i++) {
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
    if (this.particles.length === 0 || !this.ctx) return;
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

// ── MAIN APPLICATION COMPONENT ──────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => loadSession());
  const [teacher, setTeacher] = useState(() => loadTeacherSession());
  const [progress, setProgress] = useState(() => loadProgressForUser(loadSession()?.id));
  const [activeLevelId, setActiveLevelId] = useState(1);
  const [selectedStageId, setSelectedStageId] = useState(1);
  const [screen, setScreen] = useState(user ? 'home' : 'auth');
  const [status, setStatus] = useState('ready');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Dark theme support — defaults to Light theme unless user explicitly chooses Dark
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('sapphireTheme');
    return saved === 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('sapphireTheme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Modals state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const [showAchievementsModal, setShowAchievementsModal] = useState(false);

  // Translator & Interview state
  const [transTranscript, setTransTranscript] = useState('');
  const [transTranslation, setTransTranslation] = useState('');
  const [transAudioBase64, setTransAudioBase64] = useState('');
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
  
  // Live silence detection refs for auto-stop
  const audioCtxRef = useRef(null);
  const silenceDetectRef = useRef(null);
  const speechDetectedRef = useRef(false);

  const activeLevel = useMemo(() => getLevel(activeLevelId), [activeLevelId]);
  const completedCount = allLevels.filter((lvl) => (progress.completed[lvl.id]?.bestScore || 0) >= PASS_SCORE).length;
  const nextOpen = allLevels.find((lvl) => isUnlocked(lvl, progress) && (progress.completed[lvl.id]?.bestScore || 0) < PASS_SCORE) || allLevels[0];
  
  const todayDateStr = new Date().toISOString().slice(0, 10);
  const todayPassedAttempts = useMemo(() => {
    return (progress.attempts || []).filter(
      (a) => a.date && a.date.slice(0, 10) === todayDateStr && a.passed
    );
  }, [progress.attempts, todayDateStr]);
  const dailyGoalTarget = 5;
  const dailyGoalProgress = Math.min(dailyGoalTarget, todayPassedAttempts.length);
  
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

  function cleanupSilenceDetector() {
    if (silenceDetectRef.current) {
      cancelAnimationFrame(silenceDetectRef.current);
      silenceDetectRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
  }

  // ── Auto Silence Detection across Pronunciation, Translation & Grammar ──
  function startSilenceDetector(stream, mode) {
    try {
      cleanupSilenceDetector();
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.fftSize);
      let speechDetected = false;
      let silenceStartTime = null;

      function checkLoop() {
        if (!recorderRef.current) return;
        analyser.getByteTimeDomainData(dataArray);
        let sumSq = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const norm = (dataArray[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / dataArray.length) * 100;

        if (rms > 8) {
          speechDetected = true;
          speechDetectedRef.current = true;
          silenceStartTime = null;
        } else if (speechDetected) {
          if (!silenceStartTime) {
            silenceStartTime = Date.now();
          } else if (Date.now() - silenceStartTime > 1300) {
            // User finished speaking and paused for 1.3s -> Auto-Stop!
            cleanupSilenceDetector();
            stopRecording(mode);
            return;
          }
        }
        silenceDetectRef.current = requestAnimationFrame(checkLoop);
      }
      silenceDetectRef.current = requestAnimationFrame(checkLoop);
    } catch {}
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
    setScreen('home');
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
      cleanupSilenceDetector();
      const recorder = new AudioRecorder();
      const stream = await recorder.start();
      recorderRef.current = recorder;
      speechDetectedRef.current = false;
      setError('');
      setStatus('recording');

      // Attach silence detector for auto-stop
      if (stream) {
        startSilenceDetector(stream, mode);
      }
    } catch {
      setError('Microphone permission blocked. Please allow mic access in your browser.');
    }
  }

  async function stopRecording(mode) {
    cleanupSilenceDetector();
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

  // Teacher dashboard (full page)
  if (teacher) {
    return <TeacherDashboard teacher={teacher} onSignOut={handleTeacherSignOut} />;
  }

  // Auth screen (if not logged in)
  if (screen === 'auth' || !user) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} onTeacherSuccess={handleTeacherSuccess} />;
  }

  return (
    <div className="app-layout">
      <canvas ref={confettiCanvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99 }} />

      {/* ── DESKTOP LEFT SIDEBAR ────────────────────────────────────────── */}
      <aside className="desktop-sidebar">
        <div className="brand-logo-wrap" onClick={() => setScreen('home')}>
          <Mascot state="mini" size={36} />
          <div className="brand-title">
            Sapphire
            <small>Speech Coach</small>
          </div>
        </div>

        <nav className="sidebar-nav-list">
          <button 
            className={`sidebar-nav-btn ${screen === 'home' ? 'active' : ''}`}
            type="button"
            onClick={() => setScreen('home')}
          >
            <span className="sidebar-nav-icon">🏠</span>
            <span>Home</span>
          </button>

          <button 
            className={`sidebar-nav-btn ${screen === 'map' ? 'active' : ''}`}
            type="button"
            onClick={() => setScreen('map')}
          >
            <span className="sidebar-nav-icon">🗺️</span>
            <span>Quest Map</span>
          </button>

          <button 
            className={`sidebar-nav-btn ${screen === 'practice' || screen === 'result' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              if (activeLevel) setScreen('practice');
              else setScreen('map');
            }}
          >
            <span className="sidebar-nav-icon">🎯</span>
            <span>Pronunciation</span>
          </button>

          <button 
            className={`sidebar-nav-btn ${screen === 'translate' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setTransTranscript('');
              setTransTranslation('');
              setTransAudioBase64('');
              setScreen('translate');
            }}
          >
            <span className="sidebar-nav-icon">🔄</span>
            <span>Translator &amp; AI</span>
          </button>

          <button 
            className={`sidebar-nav-btn ${screen === 'grammar' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setGrammarResult(null);
              setScreen('grammar');
            }}
          >
            <span className="sidebar-nav-icon">📝</span>
            <span>Grammar</span>
          </button>



          <button 
            className="sidebar-nav-btn"
            type="button"
            onClick={() => setShowDiagnosticModal(true)}
          >
            <span className="sidebar-nav-icon">🎯</span>
            <span>Diagnostic Test</span>
          </button>

          <button 
            className="sidebar-nav-btn"
            type="button"
            onClick={() => setShowLeaderboardModal(true)}
          >
            <span className="sidebar-nav-icon">🏆</span>
            <span>Leaderboard</span>
          </button>

          <button 
            className="sidebar-nav-btn"
            type="button"
            onClick={() => setShowAchievementsModal(true)}
          >
            <span className="sidebar-nav-icon">🎖️</span>
            <span>Achievements</span>
          </button>

          <button 
            className="sidebar-nav-btn"
            type="button"
            onClick={() => setShowProfileModal(true)}
          >
            <span className="sidebar-nav-icon">👤</span>
            <span>Profile</span>
          </button>
        </nav>

        {/* Sidebar Motivational Mascot Card */}
        <div className="sidebar-mascot-card">
          <Mascot state="happy" size={48} />
          <div className="sidebar-mascot-text">
            <h4>Level {level} Speaker</h4>
            <p>Practice daily to unlock Stage {selectedStageId + 1}!</p>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT WRAPPER ────────────────────────────────────────── */}
      <div className="main-wrapper">
        {/* TOP BAR */}
        <header className="top-appbar">
          <div className="topbar-greeting">
            <h2>Good {getTimeOfDay()}, {user?.name?.split(' ')[0] || 'Learner'}! 👋</h2>
            <p>Let's reach your speech goal today!</p>
          </div>

          <div className="topbar-badges">
            <div className="stat-pill stat-pill-streak" title="Daily Streak">
              <span>🔥</span>
              <span>{progress.streak}d Streak</span>
            </div>

            <div className="stat-pill stat-pill-xp" title="Total XP Earned">
              <span>🪙</span>
              <span>{progress.xp} XP</span>
            </div>

            <div className="stat-pill stat-pill-goal" title="Daily Goal: Practice 5 words today">
              <span>🎯</span>
              <span>{dailyGoalProgress}/{dailyGoalTarget} Goal</span>
            </div>

            <button 
              className="user-avatar-btn"
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              style={{ fontSize: '1.2rem', cursor: 'pointer', border: 'none', background: darkMode ? '#232738' : 'var(--bg-surface-subtle)' }}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>

            <div 
              className="user-avatar-btn" 
              onClick={() => setShowProfileModal(true)}
              title="View Profile"
            >
              {user?.avatar || '👨‍🎓'}
            </div>
          </div>
        </header>

        {/* ── CONTENT AREA (ROUTED SCREENS) ─────────────────────────────── */}
        <main className="content-area">
          {/* 1. HOME DASHBOARD (Screen 2 in Mockup) */}
          {screen === 'home' && (
            <div className="dashboard-grid" style={{ maxWidth: '780px', margin: '0 auto' }}>
              
              {/* TOP ROW: STAT PILLS & LEVEL BANNER */}
              <div className="dash-hero-row" style={{ gridTemplateColumns: '1fr' }}>
                {/* Level Card with Sapphire Mascot */}
                <div className="level-hero-card">
                  <div className="level-hero-info">
                    <span className="level-tag">
                      👑 Level {level} • {level >= 5 ? 'Diamond Orator' : level >= 3 ? 'Rising Speaker' : 'Foundation'}
                    </span>
                    <h2 className="level-hero-title">{levelXp} / 100 XP to Level {level + 1}</h2>
                    <p className="level-hero-sub">{completedCount}/100 Speaking Challenges Mastered</p>

                    <div className="level-xp-bar-wrap">
                      <div className="level-xp-bar-bg">
                        <div className="level-xp-bar-fill" style={{ width: `${Math.min(100, Math.max(8, levelXp))}%` }} />
                      </div>
                    </div>
                  </div>

                  <Mascot state="crowned" size={96} />
                </div>
              </div>

              {/* CONTINUE YOUR JOURNEY */}
              <div>
                <div className="section-title-row">
                  <h3 className="section-title">
                    <span>🚀</span> Continue Your Journey
                  </h3>
                  <button 
                    className="btn-3d btn-3d-white btn-sm"
                    type="button"
                    onClick={() => setScreen('map')}
                  >
                    View Quest Map →
                  </button>
                </div>

                <div className="journey-cards-grid">
                  {/* Pronunciation Card */}
                  <div className="journey-card" onClick={() => startLevel(nextOpen)}>
                    <div className="journey-card-left">
                      <div className="journey-icon-wrap journey-icon-pronunciation">
                        🎙️
                      </div>
                      <div className="journey-card-info">
                        <h3>Pronunciation Practice</h3>
                        <p>Q#{nextOpen.id}: "{nextOpen.label}" • {formatPhoneme(nextOpen.focus)}</p>
                      </div>
                    </div>
                    <button className="btn-3d btn-3d-primary btn-sm" type="button">
                      Continue ➔
                    </button>
                  </div>

                  {/* Grammar Card */}
                  <div className="journey-card" onClick={() => setScreen('grammar')}>
                    <div className="journey-card-left">
                      <div className="journey-icon-wrap journey-icon-grammar">
                        📖
                      </div>
                      <div className="journey-card-info">
                        <h3>Grammar Challenge</h3>
                        <p>Level: {grammarLevel.toUpperCase()} • Daily Scenarios</p>
                      </div>
                    </div>
                    <button className="btn-3d btn-3d-primary btn-sm" type="button">
                      Start ➔
                    </button>
                  </div>
                </div>

                {/* Direct Mobile & Desktop Translator Quick Card */}
                <div 
                  className="journey-card" 
                  onClick={() => setScreen('translate')}
                  style={{ marginTop: '0.9rem', background: 'var(--bg-lavender)', borderColor: '#C7D2FE' }}
                >
                  <div className="journey-card-left">
                    <div className="journey-icon-wrap" style={{ background: '#FFFFFF', border: '1px solid #C7D2FE' }}>
                      🔄
                    </div>
                    <div className="journey-card-info">
                      <h3 style={{ color: 'var(--royal-violet-deep)' }}>Voice Translator &amp; AI Interview</h3>
                      <p style={{ color: 'var(--royal-violet)' }}>Speak in Hindi ➔ Get fluent English + interview analysis</p>
                    </div>
                  </div>
                  <button className="btn-3d btn-3d-primary btn-sm" type="button">
                    Open ➔
                  </button>
                </div>
              </div>

              {/* TODAY'S PLAN CHECKLIST */}
              <div className="today-plan-card">
                <h3 className="section-title">
                  <span>📋</span> Today's Action Plan
                </h3>
                
                <div className="plan-item-list">
                  <div className="plan-item">
                    <div className="plan-item-left">
                      <div className="plan-item-icon">🎯</div>
                      <div>
                        <div className="plan-item-title">Practice 5 pronunciation words</div>
                        <div className="plan-item-reward">+50 XP Reward</div>
                      </div>
                    </div>
                    <div className="plan-item-progress">{dailyGoalProgress} / {dailyGoalTarget} {dailyGoalProgress >= dailyGoalTarget ? '✓' : ''}</div>
                  </div>

                  <div className="plan-item">
                    <div className="plan-item-left">
                      <div className="plan-item-icon">📝</div>
                      <div>
                        <div className="plan-item-title">Complete 1 grammar sentence challenge</div>
                        <div className="plan-item-reward">+40 XP Reward</div>
                      </div>
                    </div>
                    <div className="plan-item-progress">{grammarResult ? '1/1 ✓' : '0/1'}</div>
                  </div>

                  <div className="plan-item">
                    <div className="plan-item-left">
                      <div className="plan-item-icon">🎯</div>
                      <div>
                        <div className="plan-item-title">15-Question Diagnostic Test</div>
                        <div className="plan-item-reward">+100 XP Reward</div>
                      </div>
                    </div>
                    <button 
                      className="btn-3d btn-3d-primary btn-sm"
                      type="button"
                      onClick={() => setShowDiagnosticModal(true)}
                    >
                      Take Test
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* 2. QUEST MAP (Stepping Stones Path Journey - Screen 3 in Mockup) */}
          {screen === 'map' && (
            <div className="quest-map-view">
              {/* STAGE SELECTOR TABS */}
              <div className="stage-selector-wrap">
                {stages.map((stg) => {
                  const passedInStage = stg.questions.filter((q) => (progress.completed[q.id]?.bestScore || 0) >= PASS_SCORE).length;
                  const isSelected = selectedStageId === stg.id;

                  return (
                    <button
                      key={stg.id}
                      type="button"
                      className={`stage-tab-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => setSelectedStageId(stg.id)}
                    >
                      <span>{stg.emoji}</span>
                      <span>Stage {stg.id}</span>
                      <small style={{ opacity: 0.8, fontSize: '0.75rem' }}>({passedInStage}/20)</small>
                    </button>
                  );
                })}
              </div>

              {/* CURRENT STAGE BANNER */}
              {(() => {
                const currentStage = stages.find((s) => s.id === selectedStageId) || stages[0];
                const passedInStage = currentStage.questions.filter((q) => (progress.completed[q.id]?.bestScore || 0) >= PASS_SCORE).length;

                return (
                  <div className="stage-banner-card" style={{ background: currentStage.color ? `linear-gradient(135deg, ${currentStage.color}, #4338CA)` : undefined }}>
                    <div>
                      <h2>{currentStage.emoji} {currentStage.title}: {currentStage.subtitle}</h2>
                      <p>{currentStage.description}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{passedInStage}/20</div>
                      <small style={{ opacity: 0.9 }}>Questions Passed</small>
                    </div>
                  </div>
                );
              })()}

              {/* STEPPING STONES PATH */}
              {(() => {
                const currentStage = stages.find((s) => s.id === selectedStageId) || stages[0];

                return (
                  <div className="stepping-stones-container">
                    {currentStage.questions.map((q) => {
                      const best = progress.completed[q.id]?.bestScore || 0;
                      const unlocked = isUnlocked(q, progress);
                      const isCurrent = q.id === nextOpen.id;
                      const done = best >= PASS_SCORE;

                      const nodeStateClass = done 
                        ? 'node-completed' 
                        : isCurrent 
                          ? 'node-unlocked-active' 
                          : unlocked 
                            ? 'node-unlocked' 
                            : 'node-locked';

                      return (
                        <div key={q.id} className="map-level-node-row">
                          {/* Stepping stone button */}
                          <div 
                            className={`level-stone-node ${nodeStateClass}`}
                            onClick={() => {
                              if (unlocked) startLevel(q);
                            }}
                            title={unlocked ? `Level ${q.id}: ${q.label}` : `Level ${q.id} (Locked)`}
                          >
                            {/* Mascot stands on top of active current node */}
                            {isCurrent && (
                              <div className="active-node-mascot">
                                <Mascot state="waving" size={54} />
                              </div>
                            )}

                            {unlocked ? (
                              <>
                                <span className="node-num">{q.id}</span>
                                <span className="node-stars">
                                  {done ? (best >= 90 ? '⭐⭐⭐' : best >= 80 ? '⭐⭐' : '⭐') : '🎯'}
                                </span>
                              </>
                            ) : (
                              <span className="node-lock-icon">🔒</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* 3. PRONUNCIATION PRACTICE SCREEN (Screen 4 in Mockup) */}
          {screen === 'practice' && activeLevel && (
            <div className="practice-container">
              <button 
                className="btn-3d btn-3d-white btn-sm"
                type="button" 
                onClick={() => setScreen('map')}
                style={{ width: 'fit-content' }}
              >
                ← Back to Quest Map
              </button>

              <div className="practice-card">
                <span className="practice-level-badge">
                  {activeLevel.stageTitle || 'Stage 1'} • Challenge #{activeLevel.id}
                </span>

                <div className="target-word-display">
                  {activeLevel.target}
                </div>

                <div className="target-ipa-display" title="English & Hindi Phonetic Guide">
                  {formatPhoneme(activeLevel.focus)}
                </div>

                <p className="target-focus-hint">
                  Listen first, then say the word clearly into your microphone.
                </p>

                <div>
                  <button className="listen-audio-btn" type="button" onClick={listenTarget}>
                    <span>🔊</span> Listen Target Voice
                  </button>
                </div>

                {/* Microphone Record Area with Auto-Silence */}
                <div className="mic-action-area">
                  <button 
                    type="button"
                    className={`large-mic-btn ${status === 'recording' ? 'recording' : ''}`}
                    onClick={() => handleRecord('pronunciation')}
                    disabled={status === 'processing'}
                    title={status === 'recording' ? 'Click to Stop Recording' : 'Click to Speak'}
                  >
                    {status === 'recording' ? '⏹' : status === 'processing' ? '⏳' : '🎙️'}
                  </button>

                  <div className="mic-timer-label">
                    {status === 'recording' ? (
                      <span style={{ color: 'var(--coral)', fontWeight: 800 }}>
                        🔴 Recording ({recordingSeconds}s) — Auto-stops on pause
                      </span>
                    ) : status === 'processing' ? (
                      <span style={{ color: 'var(--royal-violet)', fontWeight: 800 }}>
                        ⏳ AI analyzing pronunciation sounds...
                      </span>
                    ) : (
                      'Tap to Speak'
                    )}
                  </div>
                </div>

                {/* Animated Mascot reacting while speaking */}
                {status === 'recording' && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <Mascot state="listening" size={80} speechBubble="Listening to your pronunciation..." />
                  </div>
                )}

                {error && (
                  <div style={{ marginTop: '1rem', padding: '0.8rem', background: '#FFF1F2', color: '#BE123C', borderRadius: '12px', fontSize: '0.85rem' }}>
                    {error}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. PRONUNCIATION RESULT SCREEN (Screen 5 in Mockup - Clean & Focused) */}
          {screen === 'result' && result && (
            <div className="result-container">
              <button 
                className="btn-3d btn-3d-white btn-sm"
                type="button" 
                onClick={() => setScreen('map')}
                style={{ width: 'fit-content' }}
              >
                ← Back to Quest Map
              </button>

              <div className="result-hero-card">
                {/* Celebratory Mascot */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <Mascot state={result.passed ? 'celebrating' : 'encouraging'} size={105} />
                </div>

                <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                  {result.passed ? 'Good Job! Passed 🎉' : 'Good Effort! Keep Practicing 💪'}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                  Target word: <strong>"{activeLevel?.target}"</strong>
                </p>

                {/* Score Badge */}
                <div className={`result-score-circle ${result.passed ? 'score-pass' : 'score-fail'}`} style={{ marginTop: '1rem' }}>
                  <span className="score-number">{result.score || 0}%</span>
                  <span className="score-label">{result.passed ? 'Passed ✓' : 'Needs Practice'}</span>
                </div>

                {/* Phoneme Level Breakdown Boxes (English + Hindi notation) */}
                {result.pronunciation?.comparison?.length > 0 && (
                  <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
                      Phoneme Sound Breakdown (English &amp; Hindi)
                    </div>
                    <div className="phoneme-boxes-wrap">
                      {result.pronunciation.comparison.map((item, idx) => {
                        const isCorrect = item.type === 'correct' || item.type === 'accent_match';
                        const isClose = item.type === 'close';
                        const boxClass = isCorrect ? 'phoneme-correct' : isClose ? 'phoneme-close' : 'phoneme-wrong';
                        const expHuman = formatPhoneme(item.expected);
                        const spkHuman = item.spoken ? formatPhoneme(item.spoken) : '—';

                        return (
                          <div key={idx} className={`phoneme-box ${boxClass}`} style={{ minWidth: '72px' }}>
                            <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>{expHuman || '?'}</span>
                            <small style={{ fontSize: '0.7rem', marginTop: '0.2rem', opacity: 0.85 }}>
                              {isCorrect ? '✓ Match' : isClose ? `≈ heard ${spkHuman}` : `✗ heard ${spkHuman}`}
                            </small>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* AI Coach Feedback Box */}
                <div className="feedback-box" style={{ marginTop: '1.25rem' }}>
                  <h4><span>💬</span> AI Coach Feedback</h4>
                  <p style={{ lineHeight: 1.6 }}>
                    {humanizeFeedback(
                      result.pronunciation?.feedback?.summary || 
                      (result.passed 
                        ? 'All target sounds matched standard English pronunciation clearly.' 
                        : 'Focus on pronouncing the highlighted sounds clearly without rushing.')
                    )}
                  </p>

                  {result.pronunciation?.feedback?.improvements?.length > 0 && (
                    <ul style={{ marginTop: '0.6rem', paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--royal-violet-deep)' }}>
                      {result.pronunciation.feedback.improvements.map((tip, idx) => (
                        <li key={idx} style={{ marginBottom: '0.3rem' }}>{humanizeFeedback(tip)}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.5rem' }}>
                  <button 
                    className="btn-3d btn-3d-white"
                    type="button" 
                    onClick={() => startLevel(activeLevel)}
                    style={{ flex: 1 }}
                  >
                    🔄 Practice Again
                  </button>

                  <button 
                    className="btn-3d btn-3d-primary"
                    type="button" 
                    onClick={() => {
                      if (nextOpen) startLevel(nextOpen);
                      else setScreen('map');
                    }}
                    style={{ flex: 1.2 }}
                  >
                    Next Word ➔
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 5. GRAMMAR CHALLENGE SCREEN (Screen 6 in Mockup) */}
          {screen === 'grammar' && (
            <div className="practice-container">
              <button 
                className="btn-3d btn-3d-white btn-sm"
                type="button" 
                onClick={() => setScreen('home')}
                style={{ width: 'fit-content' }}
              >
                ← Back to Home
              </button>

              <div className="practice-card">
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  {['easy', 'medium', 'hard'].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      className={`btn-3d ${grammarLevel === lvl ? 'btn-3d-primary' : 'btn-3d-white'} btn-sm`}
                      onClick={() => setGrammarLevel(lvl)}
                    >
                      {lvl.toUpperCase()}
                    </button>
                  ))}
                </div>

                {grammarLoading ? (
                  <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>
                    ⏳ Loading grammar challenge...
                  </div>
                ) : grammarSentence ? (
                  <div>
                    <span className="practice-level-badge">
                      Scenario: {grammarSentence.scenario}
                    </span>

                    <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: '14px', padding: '1.2rem', margin: '1rem 0' }}>
                      <div style={{ color: '#BE123C', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Incorrect Sentence</div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#BE123C', marginTop: '0.2rem' }}>
                        "{grammarSentence.wrong}"
                      </div>
                    </div>

                    <p className="target-focus-hint">
                      🎙️ Speak the grammatically corrected version of this sentence.
                    </p>

                    <div className="mic-action-area">
                      <button 
                        type="button"
                        className={`large-mic-btn ${status === 'recording' ? 'recording' : ''}`}
                        onClick={() => handleRecord('grammar')}
                        disabled={status === 'processing'}
                      >
                        {status === 'recording' ? '⏹' : status === 'processing' ? '⏳' : '🎙️'}
                      </button>

                      <div className="mic-timer-label">
                        {status === 'recording' ? `Recording (${recordingSeconds}s) — Auto-stops on pause` : 'Tap to Speak Corrected Sentence'}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Grammar Result Card */}
                {grammarResult && (
                  <div className="feedback-box" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 900, color: grammarResult.grammar_correct ? 'var(--emerald)' : 'var(--gold)' }}>
                      {grammarResult.score}%
                    </div>
                    <div style={{ fontWeight: 800, color: 'var(--text-main)', margin: '0.3rem 0' }}>
                      {grammarResult.grammar_correct ? '✅ Grammar Correct! Excellent.' : '⚠️ Needs Correction'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'left', marginTop: '0.8rem' }}>
                      <div><strong>Expected:</strong> "{grammarResult.expected_sentence}"</div>
                      <div style={{ marginTop: '0.3rem' }}><strong>You Spoke:</strong> "{grammarResult.spoken_sentence}"</div>
                    </div>

                    <button 
                      className="btn-3d btn-3d-primary btn-sm"
                      type="button" 
                      onClick={loadNextGrammar}
                      style={{ marginTop: '1rem' }}
                    >
                      Next Challenge ➔
                    </button>
                  </div>
                )}

                {error && <div style={{ color: '#BE123C', marginTop: '1rem', fontSize: '0.85rem' }}>{error}</div>}
              </div>
            </div>
          )}

          {/* 6. TRANSLATOR & AI INTERVIEW SCREEN (Screen 7 in Mockup) */}
          {screen === 'translate' && (
            <div className="practice-container">
              <button 
                className="btn-3d btn-3d-white btn-sm"
                type="button" 
                onClick={() => setScreen('home')}
                style={{ width: 'fit-content' }}
              >
                ← Back to Home
              </button>

              <div className="practice-card">
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  <button 
                    type="button"
                    className={`btn-3d ${translateMode === 'simple' ? 'btn-3d-primary' : 'btn-3d-white'} btn-sm`}
                    onClick={() => { setTranslateMode('simple'); setInterviewResult(null); }}
                  >
                    🔄 Hindi ➔ English Translator
                  </button>
                  <button 
                    type="button"
                    className={`btn-3d ${translateMode === 'interview' ? 'btn-3d-primary' : 'btn-3d-white'} btn-sm`}
                    onClick={() => { setTranslateMode('interview'); setTransTranscript(''); }}
                  >
                    🎙️ AI Interview Practice
                  </button>
                </div>

                {translateMode === 'simple' && (
                  <div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
                      Speak in Hindi — Sapphire AI instantly translates and speaks fluent English back to you.
                    </p>

                    <div className="mic-action-area">
                      <button 
                        type="button"
                        className={`large-mic-btn ${status === 'recording' ? 'recording' : ''}`}
                        onClick={() => handleRecord('translate')}
                      >
                        {status === 'recording' ? '⏹' : '🎙️'}
                      </button>
                      <div className="mic-timer-label">
                        {status === 'recording' ? `Listening in Hindi (${recordingSeconds}s) — Auto-stops on pause` : 'Tap to Speak in Hindi'}
                      </div>
                    </div>

                    {(transTranscript || transTranslation) && (
                      <div style={{ marginTop: '1.5rem', display: 'grid', gap: '0.75rem', textAlign: 'left' }}>
                        <div style={{ background: 'var(--bg-surface-subtle)', padding: '0.9rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Hindi Input</span>
                          <p style={{ fontWeight: 700, marginTop: '0.2rem', color: 'var(--text-main)' }}>{transTranscript}</p>
                        </div>

                        <div style={{ background: 'var(--bg-lavender)', padding: '0.9rem', borderRadius: '12px', border: '1px solid #C7D2FE' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--royal-violet)', textTransform: 'uppercase' }}>English Translation</span>
                          <p style={{ fontWeight: 800, marginTop: '0.2rem', color: 'var(--royal-violet-deep)', fontSize: '1.05rem' }}>{transTranslation}</p>
                          {transAudioBase64 && (
                            <button 
                              type="button"
                              onClick={() => playAudioBase64(transAudioBase64)}
                              className="btn-3d btn-3d-primary btn-sm"
                              style={{ marginTop: '0.5rem' }}
                            >
                              🔊 Listen Pronunciation
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {translateMode === 'interview' && (
                  <div>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                      {['daily', 'placement', 'college', 'finance'].map((top) => (
                        <button
                          key={top}
                          type="button"
                          className={`btn-3d ${interviewTopic === top ? 'btn-3d-gold' : 'btn-3d-white'} btn-sm`}
                          onClick={() => setInterviewTopic(top)}
                        >
                          {top.toUpperCase()}
                        </button>
                      ))}
                    </div>

                    {interviewQuestion && (
                      <div style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-light)', borderRadius: '14px', padding: '1rem', margin: '1rem 0' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--royal-violet)' }}>Interview Question</span>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                          "{interviewQuestion.english}"
                        </h3>
                        <small style={{ color: 'var(--text-muted)' }}>{interviewQuestion.hindi}</small>
                      </div>
                    )}

                    <div className="mic-action-area">
                      <button 
                        type="button"
                        className={`large-mic-btn ${status === 'recording' ? 'recording' : ''}`}
                        onClick={() => handleRecord('interview')}
                      >
                        {status === 'recording' ? '⏹' : '🎙️'}
                      </button>
                      <div className="mic-timer-label">
                        {status === 'recording' ? `Answering Question (${recordingSeconds}s) — Auto-stops on pause` : 'Tap to Answer in Hindi'}
                      </div>
                    </div>

                    {interviewResult && (
                      <div className="feedback-box" style={{ marginTop: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h4>Interview Score</h4>
                          <span style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--royal-violet)' }}>
                            {interviewResult.score}/10
                          </span>
                        </div>
                        <p style={{ marginTop: '0.5rem' }}><strong>English Answer:</strong> {interviewResult.translation}</p>
                        {interviewResult.better_answer && (
                          <p style={{ marginTop: '0.4rem', color: 'var(--royal-violet)' }}>
                            💡 <strong>Better phrasing:</strong> {interviewResult.better_answer}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* ── PERSISTENT BOTTOM MOTIVATION BAR (DESKTOP) ────────────────── */}
        <div className="bottom-motivation-bar">
          <div className="bottom-motivation-left">
            <Mascot state="mini" size={36} />
            <span className="bottom-motivation-msg">
              Keep practicing, keep improving. You're doing amazing! 💜
            </span>
          </div>

          <div className="bottom-motivation-stats">
            <span>Practiced: <strong>{completedCount} words</strong></span>
            <span>Total XP: <strong>{progress.xp}</strong></span>
            <span>Streak: <strong>{progress.streak}d</strong></span>
          </div>
        </div>

        {/* ── MOBILE BOTTOM NAVIGATION BAR (Prominent Translator Tab - Screen 7) ── */}
        <div className="mobile-bottom-nav">
          <div className="mobile-nav-items">
            <button 
              className={`mobile-nav-btn ${screen === 'home' ? 'active' : ''}`}
              type="button"
              onClick={() => setScreen('home')}
            >
              <span className="mobile-nav-icon">🏠</span>
              <span>Home</span>
            </button>

            <button 
              className={`mobile-nav-btn ${screen === 'map' ? 'active' : ''}`}
              type="button"
              onClick={() => setScreen('map')}
            >
              <span className="mobile-nav-icon">🗺️</span>
              <span>Quest</span>
            </button>

            {/* Floating Highlight Center Button */}
            <button 
              className="mobile-nav-center-btn"
              type="button"
              onClick={() => {
                if (nextOpen) startLevel(nextOpen);
                else setScreen('map');
              }}
              title="Practice Pronunciation"
            >
              🎙️
            </button>

            <button 
              className={`mobile-nav-btn ${screen === 'translate' ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setTransTranscript('');
                setTransTranslation('');
                setTransAudioBase64('');
                setScreen('translate');
              }}
            >
              <span className="mobile-nav-icon">🔄</span>
              <span>Translate</span>
            </button>

            <button 
              className={`mobile-nav-btn ${screen === 'grammar' ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setGrammarResult(null);
                setScreen('grammar');
              }}
            >
              <span className="mobile-nav-icon">📝</span>
              <span>Grammar</span>
            </button>

          </div>
        </div>
      </div>

      {/* ── PROFILE MODAL ──────────────────────────────────────────────── */}
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

      {/* ── STUDENT LEADERBOARD MODAL (Screen 9 in Mockup) ─────────────── */}
      {showLeaderboardModal && (
        <StudentLeaderboardModal 
          currentUser={user} 
          onClose={() => setShowLeaderboardModal(false)} 
        />
      )}

      {/* ── ACHIEVEMENTS MODAL (Screen 10 in Mockup) ───────────────────── */}
      {showAchievementsModal && (
        <AchievementsModal
          progress={progress}
          completedCount={completedCount}
          onClose={() => setShowAchievementsModal(false)}
        />
      )}

      {/* ── 15-QUESTION DIAGNOSTIC ASSESSMENT MODAL (Screen 8 in Mockup) ── */}
      {showDiagnosticModal && (
        <DiagnosticModal 
          user={user}
          progress={progress}
          setProgress={setProgress}
          onClose={() => setShowDiagnosticModal(false)} 
        />
      )}
    </div>
  );
}

// ── ACHIEVEMENTS MODAL ──────────────────────────────────────────────────────
function AchievementsModal({ progress, completedCount, onClose }) {
  const BADGES = [
    { id: 'first_step', icon: '🚀', title: 'First Steps', desc: 'Complete your first speaking challenge', unlocked: completedCount >= 1 },
    { id: 'streak_7', icon: '🔥', title: '7-Day Streak', desc: 'Practice 7 days in a row', unlocked: (progress.streak || 0) >= 7 },
    { id: 'rising_star', icon: '🌟', title: 'Rising Star', desc: 'Earn 300+ XP in your journey', unlocked: (progress.xp || 0) >= 300 },
    { id: 'word_master', icon: '📚', title: 'Word Master', desc: 'Pass 20+ words in Stage 1', unlocked: completedCount >= 20 },
    { id: 'perfect_score', icon: '⭐', title: 'Perfect Score', desc: 'Score 90%+ on any pronunciation test', unlocked: Object.values(progress.completed || {}).some(c => (c.bestScore || 0) >= 90) },
    { id: 'confident_speaker', icon: '👑', title: 'Confident Speaker', desc: 'Complete 50+ speaking challenges', unlocked: completedCount >= 50 }
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="close-modal-btn" type="button" onClick={onClose}>✕</button>

        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-main)' }}>
            🎖️ Achievement Badges
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Earn badges as you practice speaking and grow your confidence
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
          {BADGES.map((b) => (
            <div 
              key={b.id}
              style={{
                background: b.unlocked ? 'var(--bg-lavender)' : 'var(--bg-surface-subtle)',
                border: b.unlocked ? '1.5px solid #C7D2FE' : '1px solid var(--border-light)',
                borderRadius: '16px',
                padding: '1rem',
                textAlign: 'center',
                opacity: b.unlocked ? 1 : 0.6
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.2rem' }}>{b.icon}</div>
              <strong style={{ display: 'block', fontSize: '0.92rem', color: b.unlocked ? 'var(--royal-violet-deep)' : 'var(--text-muted)' }}>
                {b.title}
              </strong>
              <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: 1.3, display: 'block', marginTop: '0.2rem' }}>
                {b.desc}
              </small>
              <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', fontWeight: 800, color: b.unlocked ? 'var(--emerald-dark)' : 'var(--text-muted)' }}>
                {b.unlocked ? '✓ Unlocked' : '🔒 In Progress'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── PROFILE MODAL ───────────────────────────────────────────────────────────
function ProfileModal({ user, progress, completedCount, weakSounds, onClose, onSignOut }) {
  const totalScoreSum = Object.values(progress.completed || {}).reduce((acc, curr) => acc + (curr.bestScore || 0), 0);
  const avgScore = completedCount > 0 ? Math.round(totalScoreSum / completedCount) : 0;
  
  let rankName = "Bronze Speaker";
  let rankColor = "#cd7f32";
  if (completedCount >= 40 || progress.xp >= 1000) { rankName = "Diamond Orator 👑"; rankColor = "var(--accent-sky)"; }
  else if (completedCount >= 20 || progress.xp >= 500) { rankName = "Gold Master 🥇"; rankColor = "var(--gold)"; }
  else if (completedCount >= 5 || progress.xp >= 150) { rankName = "Silver Speaker 🥈"; rankColor = "#94A3B8"; }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="close-modal-btn" type="button" onClick={onClose}>✕</button>

        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '3rem', width: '70px', height: '70px', borderRadius: '50%', background: 'var(--bg-lavender)', border: '2px solid #C7D2FE', margin: '0 auto 0.5rem auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {user?.avatar || '👨‍🎓'}
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-main)' }}>{user?.name || 'Student'}</h2>
          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginTop: '0.3rem' }}>
            <span style={{ background: 'var(--bg-surface-subtle)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              ID: {user?.libraryId || '2428CSEAIML994'}
            </span>
            <span style={{ background: 'var(--bg-lavender)', color: 'var(--royal-violet)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700 }}>
              {user?.branch || 'CSE'}
            </span>
          </div>
        </div>

        {/* Rank & Stats */}
        <div style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-light)', borderRadius: '16px', padding: '1rem', textAlign: 'center', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Speaking Rank</span>
          <h3 style={{ margin: '0.2rem 0', color: rankColor, fontSize: '1.25rem', fontWeight: 900 }}>{rankName}</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {completedCount}/100 Completed • {progress.xp} XP • Avg Accuracy: <strong>{avgScore}%</strong>
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.25rem' }}>
          <button className="btn-3d btn-3d-white" type="button" onClick={onClose} style={{ flex: 1 }}>
            Back
          </button>
          <button className="btn-3d" type="button" onClick={onSignOut} style={{ background: 'var(--coral)', color: '#fff', boxShadow: '0 4px 0 #9F1239' }}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

// ── STUDENT LEADERBOARD MODAL ───────────────────────────────────────────────
function StudentLeaderboardModal({ currentUser, onClose }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('branch');

  useEffect(() => {
    getAllStudentReports().then((data) => {
      setReports(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  const studentBranch = currentUser?.branch || 'CSE';
  const myLibraryId = (currentUser?.libraryId || currentUser?.id || '').toUpperCase();

  const collegeSorted = useMemo(() => {
    return [...reports].sort((a, b) => b.xp - a.xp || b.avgScore - a.avgScore);
  }, [reports]);

  const branchSorted = useMemo(() => {
    return collegeSorted.filter((r) => r.branch === studentBranch);
  }, [collegeSorted, studentBranch]);

  const displayedList = activeTab === 'branch' ? branchSorted : collegeSorted;
  const RANK_EMOJIS = ['🥇', '🥈', '🥉'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <button className="close-modal-btn" type="button" onClick={onClose}>✕</button>

        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-main)' }}>
            🏆 Student Leaderboard
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            See your rank among peers in {studentBranch} and across college
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem' }}>
          <button 
            type="button"
            className={`btn-3d ${activeTab === 'branch' ? 'btn-3d-primary' : 'btn-3d-white'} btn-sm`}
            onClick={() => setActiveTab('branch')}
          >
            📍 {studentBranch} Branch
          </button>
          <button 
            type="button"
            className={`btn-3d ${activeTab === 'college' ? 'btn-3d-primary' : 'btn-3d-white'} btn-sm`}
            onClick={() => setActiveTab('college')}
          >
            🏫 Whole College
          </button>
        </div>

        {/* Leaderboard Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading leaderboard...</div>
        ) : (
          <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '14px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-subtle)', borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Rank</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Student</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>XP</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {displayedList.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>No student records yet.</td></tr>
                )}
                {displayedList.map((st, i) => {
                  const isMe = st.libraryId?.toUpperCase() === myLibraryId || st.id?.toUpperCase() === myLibraryId;
                  return (
                    <tr 
                      key={st.libraryId || i}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: isMe ? 'var(--bg-lavender)' : 'transparent',
                        fontWeight: isMe ? 800 : 500
                      }}
                    >
                      <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center', fontWeight: 800 }}>
                        {i < 3 ? RANK_EMOJIS[i] : `#${i + 1}`}
                      </td>
                      <td style={{ padding: '0.6rem 0.8rem' }}>
                        {st.avatar} {st.name} {isMe && '(You)'}
                      </td>
                      <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center', color: 'var(--gold-dark)', fontWeight: 800 }}>
                        {st.xp}
                      </td>
                      <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center', color: st.avgScore >= 70 ? 'var(--emerald-dark)' : 'var(--coral)', fontWeight: 800 }}>
                        {st.avgScore}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 15-QUESTION DIAGNOSTIC ASSESSMENT MODAL (Screen 8 in Mockup) ─────────────
const FULL_DIAGNOSTIC_15 = [
  { sound: 'm', display_name: 'M Sound', word: 'map', pronounce: 'mæp', skill: 'consonants', difficulty: 'easy' },
  { sound: 'b', display_name: 'B Sound', word: 'ball', pronounce: 'bɔːl', skill: 'consonants', difficulty: 'easy' },
  { sound: 's', display_name: 'S Sound', word: 'sun', pronounce: 'sʌn', skill: 'consonants', difficulty: 'easy' },
  { sound: 'sh', display_name: 'SH Sound', word: 'ship', pronounce: 'ʃɪp', skill: 'sh_confusion', difficulty: 'easy' },
  { sound: 'ch', display_name: 'CH Sound', word: 'chair', pronounce: 'tʃɛər', skill: 'consonants', difficulty: 'easy' },
  { sound: 'j', display_name: 'J Sound', word: 'jump', pronounce: 'dʒʌmp', skill: 'consonants', difficulty: 'medium' },
  { sound: 'z', display_name: 'Z Sound', word: 'zero', pronounce: 'ˈzɪəroʊ', skill: 'consonants', difficulty: 'medium' },
  { sound: 'v', display_name: 'V Sound', word: 'very', pronounce: 'ˈvɛri', skill: 'vw_confusion', difficulty: 'medium' },
  { sound: 'w', display_name: 'W Sound', word: 'water', pronounce: 'ˈwɔːtər', skill: 'vw_confusion', difficulty: 'medium' },
  { sound: 'th', display_name: 'TH Sound (Unvoiced)', word: 'think', pronounce: 'θɪŋk', skill: 'th_sounds', difficulty: 'medium' },
  { sound: 'dh', display_name: 'TH Sound (Voiced)', word: 'this', pronounce: 'ðɪs', skill: 'th_sounds', difficulty: 'medium' },
  { sound: 'r', display_name: 'R Sound', word: 'red', pronounce: 'rɛd', skill: 'rl_confusion', difficulty: 'medium' },
  { sound: 'l', display_name: 'L Sound', word: 'little', pronounce: 'ˈlɪtəl', skill: 'rl_confusion', difficulty: 'hard' },
  { sound: 'th', display_name: 'TH in Context', word: 'weather', pronounce: 'ˈwɛðər', skill: 'th_sounds', difficulty: 'hard' },
  { sound: 'w', display_name: 'W + R Blend', word: 'world', pronounce: 'wɜːrld', skill: 'vw_confusion', difficulty: 'hard' }
];

const DIAGNOSTIC_IMPROVEMENT_TIPS = {
  m: "Press lips together firmly for M (म)",
  b: "Pop lips open with voice vibration for B (ब)",
  s: "Keep tongue behind front teeth with a clean hissing S (स)",
  sh: "Round lips forward and widen air stream for SH (श)",
  ch: "Place tongue behind front teeth and release with sharp burst for CH (च)",
  j: "Voice the sound with tongue touching palate firmly for J (ज)",
  z: "Vibrate vocal cords while hissing for Z (ज़)",
  v: "Touch top teeth to lower lip with vocal vibration for V (व)",
  w: "Round both lips into an 'O' circle without teeth for W (व/वा)",
  th: "Place tongue tip gently between teeth and blow air for TH (थ)",
  dh: "Place tongue tip between teeth with vocal vibration for DH (द)",
  r: "Curl tongue tip back slightly without touching the roof for R (र)",
  l: "Touch tongue tip flatly behind upper front teeth for L (ल)",
};

function DiagnosticModal({ user, progress, setProgress, onClose }) {
  const [questions, setQuestions] = useState(FULL_DIAGNOSTIC_15);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle'); // 'idle' | 'recording' | 'processing' | 'answered' | 'report'
  const [currentEval, setCurrentEval] = useState(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [liveHeard, setLiveHeard] = useState('');

  const recorderRef = useRef(null);
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);
  const heardRef = useRef('');

  useEffect(() => {
    fetchDiagnosticQuestions()
      .then((data) => {
        if (Array.isArray(data) && data.length >= 10) {
          setQuestions(data);
        }
      })
      .catch(() => {});

    return () => {
      cleanupAll();
    };
  }, []);

  function cleanupAll() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    if (recorderRef.current) {
      try { recorderRef.current.cancel(); } catch {}
      recorderRef.current = null;
    }
  }

  async function startRecording() {
    setError('');
    setLiveHeard('');
    heardRef.current = '';
    setCurrentEval(null);

    try {
      const rec = new AudioRecorder();
      recorderRef.current = rec;
      await rec.start();

      setStatus('recording');
      setRecordingSeconds(0);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => {
          if (s >= 5) {
            stopAndEvaluate();
            return s;
          }
          return s + 1;
        });
      }, 1000);

      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch {}
          }
          const sRec = new SpeechRec();
          sRec.continuous = false;
          sRec.interimResults = true;
          sRec.lang = 'en-US';
          sRec.onresult = (evt) => {
            let transcript = '';
            for (let i = evt.resultIndex; i < evt.results.length; ++i) {
              transcript += evt.results[i][0].transcript;
            }
            const clean = transcript.trim().toLowerCase();
            if (clean) {
              setLiveHeard(clean);
              heardRef.current = clean;
            }
          };
          sRec.start();
          recognitionRef.current = sRec;
        } catch {}
      }
    } catch (e) {
      console.error('Diagnostic startRecording error:', e);
      setError(e.message || 'Microphone access failed. Please grant mic permission.');
      setStatus('idle');
    }
  }

  async function stopAndEvaluate() {
    if (!recorderRef.current || status === 'processing') return;

    if (timerRef.current) clearInterval(timerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }

    setStatus('processing');

    const currentQ = questions[currentIndex] || FULL_DIAGNOSTIC_15[0];
    const targetWord = (currentQ.word || '').trim().toLowerCase();
    const soundImprovementTip = DIAGNOSTIC_IMPROVEMENT_TIPS[currentQ.sound] || 'Practice sound clarity.';

    try {
      const audioBlob = await recorderRef.current.stop();
      recorderRef.current = null;

      let calcScore = 0;
      let detected = false;
      let spokenWord = '';
      let diagnosisNote = '';

      // 1. Evaluate using gold-standard checkPronunciation engine
      try {
        const checkRes = await checkPronunciation(currentQ.word, audioBlob);
        if (checkRes && typeof checkRes.score !== 'undefined') {
          calcScore = normalizeScore(checkRes.score);
          detected = calcScore >= 60;
          spokenWord = checkRes.spoken_word || (checkRes.spoken && checkRes.spoken.join('')) || currentQ.word;
          diagnosisNote = calcScore >= 70 ? 'Clear pronunciation! ✓' : `Needs attention: ${soundImprovementTip}`;
        }
      } catch {
        // Fallback: evaluateDiagnosticSound
        try {
          const diagRes = await evaluateDiagnosticSound(audioBlob, currentIndex);
          if (diagRes && typeof diagRes.score !== 'undefined') {
            calcScore = normalizeScore(diagRes.score);
            detected = diagRes.detected || calcScore >= 60;
            spokenWord = diagRes.spoken_word || currentQ.word;
            diagnosisNote = calcScore >= 70 ? 'Clear pronunciation! ✓' : `Needs attention: ${soundImprovementTip}`;
          }
        } catch {
          // Client-side Web Speech recognition fallback for standalone deployment
          const spoken = (heardRef.current || liveHeard || '').trim().toLowerCase();
          spokenWord = spoken;
          if (spoken) {
            if (spoken === targetWord || spoken.includes(targetWord)) {
              calcScore = 92;
              detected = true;
              diagnosisNote = 'Target word matched accurately! ✓';
            } else if (targetWord.startsWith(spoken.slice(0, 3)) || spoken.startsWith(targetWord.slice(0, 3))) {
              calcScore = 76;
              detected = true;
              diagnosisNote = `Close match — ${soundImprovementTip}`;
            } else {
              calcScore = 25;
              detected = false;
              diagnosisNote = `Heard '${spoken}' instead of '${targetWord}'. ${soundImprovementTip}`;
            }
          } else {
            calcScore = 0;
            detected = false;
            diagnosisNote = 'No speech detected';
          }
        }
      }

      const evalData = {
        qNum: currentIndex + 1,
        display_name: currentQ.display_name,
        sound: currentQ.sound,
        word: currentQ.word,
        pronounce: currentQ.pronounce,
        skill: currentQ.skill || 'consonants',
        score: calcScore,
        detected: detected,
        spoken_word: spokenWord,
        diagnosis_note: diagnosisNote,
        improvement_tip: soundImprovementTip,
        spoken: spokenWord ? [spokenWord] : []
      };

      setCurrentEval(evalData);
      setStatus('answered');
    } catch (err) {
      console.error('Diagnostic evaluation error:', err);
      setError('Evaluation error. Please tap Record to try again.');
      setStatus('idle');
    }
  }

  function handleNext() {
    if (!currentEval) return;
    const nextResults = [...results, currentEval];
    setResults(nextResults);
    setCurrentEval(null);
    setLiveHeard('');

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(currentIndex + 1);
      setRecordingSeconds(0);
      setStatus('idle');
    } else {
      cleanupAll();
      generateFinalReport(nextResults);
    }
  }

  function handleSkip() {
    if (status === 'processing') return;
    if (recorderRef.current) {
      try { recorderRef.current.cancel(); } catch {}
      recorderRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }

    const currentQ = questions[currentIndex] || FULL_DIAGNOSTIC_15[0];
    const skippedData = {
      qNum: currentIndex + 1,
      display_name: currentQ.display_name,
      sound: currentQ.sound,
      word: currentQ.word,
      pronounce: currentQ.pronounce,
      skill: currentQ.skill || 'consonants',
      score: 0,
      detected: false,
      spoken_word: '',
      diagnosis_note: 'Skipped question',
      improvement_tip: DIAGNOSTIC_IMPROVEMENT_TIPS[currentQ.sound] || '',
      spoken: []
    };
    const nextResults = [...results, skippedData];
    setResults(nextResults);
    setCurrentEval(null);
    setLiveHeard('');

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(currentIndex + 1);
      setRecordingSeconds(0);
      setStatus('idle');
    } else {
      cleanupAll();
      generateFinalReport(nextResults);
    }
  }

  function generateFinalReport(allResults) {
    setStatus('processing');
    try {
      const rep = buildLocalReport(allResults);
      setReport(rep);
      setStatus('report');
    } catch {
      setError('Failed to generate report.');
      setStatus('idle');
    }
  }

  function computeLocalOverall(allResults) {
    if (!allResults.length) return 0;
    const total = allResults.reduce((sum, r) => sum + normalizeScore(r.score), 0);
    return Math.round(total / allResults.length);
  }

  function buildLocalReport(allResults) {
    const skillGroups = {};
    allResults.forEach((r) => {
      const skill = r.skill || 'consonants';
      if (!skillGroups[skill]) skillGroups[skill] = [];
      skillGroups[skill].push(normalizeScore(r.score));
    });

    const pronunciation_scores = {};
    Object.entries(skillGroups).forEach(([skill, scores]) => {
      pronunciation_scores[skill] = Math.round(
        scores.reduce((a, b) => a + b, 0) / scores.length
      );
    });

    const scoreValues = Object.values(pronunciation_scores);
    const overall_score = scoreValues.length
      ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length)
      : computeLocalOverall(allResults);

    const SKILL_LABELS = {
      consonants: 'Consonant Clarity (m, b, s, ch, j, z)',
      th_sounds: 'TH Sounds (थ/द)',
      vw_confusion: 'V vs W Distinction (व/वा)',
      rl_confusion: 'R vs L Distinction (र/ल)',
      sh_confusion: 'SH Sound (श/स)',
      vowels: 'Vowel Precision'
    };

    const strengths = Object.entries(pronunciation_scores)
      .filter(([, v]) => v >= 70)
      .map(([k]) => SKILL_LABELS[k] || k.replace('_', ' '));

    const weaknesses = Object.entries(pronunciation_scores)
      .filter(([, v]) => v < 70)
      .map(([k]) => SKILL_LABELS[k] || k.replace('_', ' '));

    const recommended_learning_path = [];
    if (pronunciation_scores.th_sounds != null && pronunciation_scores.th_sounds < 70) {
      recommended_learning_path.push('Practice TH (थ/द) sound placement with tongue between teeth');
    }
    if (pronunciation_scores.vw_confusion != null && pronunciation_scores.vw_confusion < 70) {
      recommended_learning_path.push('Master V (teeth on lip) vs W (circle lips) in Stage 2');
    }
    if (pronunciation_scores.rl_confusion != null && pronunciation_scores.rl_confusion < 70) {
      recommended_learning_path.push('Refine R vs L liquid tongue curls in Stage 3');
    }
    if (recommended_learning_path.length === 0) {
      recommended_learning_path.push('Progress through Stage 2 & 3 speaking challenges');
      recommended_learning_path.push('Practice multi-syllabic rhythm for complete fluency');
    }

    return {
      overall_score,
      pronunciation_scores,
      all_question_results: allResults,
      strengths: strengths.length ? strengths : ['Basic Sound Recognition'],
      weaknesses: weaknesses.length ? weaknesses : ['Consonant Articulation'],
      recommended_learning_path
    };
  }

  function applyPlacement() {
    if (!report) return;
    const scoreVal = report.overall_score || 0;

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

  const currentQ = questions[currentIndex] || FULL_DIAGNOSTIC_15[0];
  const progressPct = questions.length > 0 ? Math.round(((currentIndex) / questions.length) * 100) : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: status === 'report' ? '720px' : '520px' }}>
        <button className="close-modal-btn" type="button" onClick={onClose}>✕</button>

        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-main)' }}>
            🎯 Diagnostic Assessment
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            15-Question Comprehensive Pronunciation &amp; Sound Mastery Test
          </p>
        </div>

        {/* ── DETAILED REPORT VIEW ── */}
        {status === 'report' && report ? (
          <div>
            <div style={{ background: 'var(--bg-lavender)', border: '1.5px solid #C7D2FE', borderRadius: '20px', padding: '1.5rem', textAlign: 'center', marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--royal-violet)', textTransform: 'uppercase' }}>Overall Diagnostic Score</span>
              <div style={{ fontSize: '2.8rem', fontWeight: 900, color: report.overall_score >= 70 ? 'var(--emerald-dark)' : 'var(--gold-dark)', margin: '0.2rem 0' }}>
                {report.overall_score}%
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 800 }}>
                {report.overall_score >= 85 ? '🌟 Advanced Pronunciation Mastery' : report.overall_score >= 65 ? '👍 Intermediate Communication Skills' : '🎯 Foundation Level — Recommended Stage 1'}
              </div>
            </div>

            {/* Skill Breakdown */}
            <div style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Phoneme Skill Breakdown
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                {Object.entries(report.pronunciation_scores || {}).map(([skill, val]) => (
                  <div key={skill} style={{ background: 'var(--bg-surface-subtle)', padding: '0.6rem 0.8rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                      <span style={{ textTransform: 'capitalize' }}>{skill.replace('_', ' ')}</span>
                      <span style={{ color: val >= 70 ? 'var(--emerald-dark)' : 'var(--coral)', fontWeight: 800 }}>{val}%</span>
                    </div>
                    <div style={{ height: '5px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${val}%`, background: val >= 70 ? 'var(--emerald)' : 'var(--coral)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Detailed Per-Question Breakdown List */}
            <div style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Detailed Question-by-Question Results ({results.length}/15)
              </h4>
              <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '14px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface-subtle)', borderBottom: '1px solid var(--border-light)', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem 0.6rem' }}>Q#</th>
                      <th style={{ padding: '0.5rem 0.6rem' }}>Target</th>
                      <th style={{ padding: '0.5rem 0.6rem' }}>Sound</th>
                      <th style={{ padding: '0.5rem 0.6rem' }}>You Said</th>
                      <th style={{ padding: '0.5rem 0.6rem' }}>Feedback &amp; How to Improve</th>
                      <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', background: r.score >= 70 ? 'transparent' : 'rgba(244, 63, 94, 0.06)' }}>
                        <td style={{ padding: '0.5rem 0.6rem', fontWeight: 800 }}>{i + 1}</td>
                        <td style={{ padding: '0.5rem 0.6rem', fontWeight: 800, color: 'var(--royal-violet-deep)' }}>"{r.word}"</td>
                        <td style={{ padding: '0.5rem 0.6rem' }}>{formatPhoneme(r.sound)}</td>
                        <td style={{ padding: '0.5rem 0.6rem', fontWeight: 600, color: r.spoken_word ? 'var(--text-main)' : 'var(--text-muted)' }}>
                          {r.spoken_word ? `"${r.spoken_word}"` : '—'}
                        </td>
                        <td style={{ padding: '0.5rem 0.6rem', fontSize: '0.78rem', color: r.score >= 70 ? 'var(--emerald-dark)' : 'var(--coral-dark)', fontWeight: 600 }}>
                          {r.diagnosis_note || (r.score >= 70 ? 'Clear pronunciation! ✓' : r.improvement_tip)}
                        </td>
                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', fontWeight: 800, color: r.score >= 70 ? 'var(--emerald-dark)' : 'var(--coral)' }}>
                          {r.score}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
              <button 
                onClick={applyPlacement} 
                className="btn-3d btn-3d-success" 
                type="button" 
                style={{ flex: 1 }}
              >
                🚀 Apply Results &amp; Jump to Stage {report.overall_score >= 85 ? '3' : report.overall_score >= 65 ? '2' : '1'}
              </button>
              <button 
                onClick={() => {
                  // Generate printable PDF report
                  const rows = results.map((r, i) => 
                    `<tr style="border-bottom:1px solid #ddd;${r.score < 70 ? 'background:#FFF1F2;' : ''}">
                      <td style="padding:6px 8px;font-weight:700">${i+1}</td>
                      <td style="padding:6px 8px;font-weight:700;color:#4338CA">"${r.word}"</td>
                      <td style="padding:6px 8px">${r.display_name || formatPhoneme(r.sound)}</td>
                      <td style="padding:6px 8px;color:#475569">${r.spoken_word || '—'}</td>
                      <td style="padding:6px 8px;color:#475569">${r.diagnosis_note || 'Clear'}</td>
                      <td style="padding:6px 8px;text-align:center;font-weight:700;color:${r.score >= 70 ? '#059669' : '#F43F5E'}">${r.score}%</td>
                    </tr>`
                  ).join('');
                  const skillRows = Object.entries(report.pronunciation_scores || {}).map(([skill, val]) =>
                    `<div style="display:inline-block;margin:4px 6px;padding:6px 12px;border-radius:8px;background:${val >= 70 ? '#ECFDF5' : '#FFF1F2'};color:${val >= 70 ? '#059669' : '#F43F5E'};font-weight:700;font-size:13px">
                      ${skill.replace('_', ' ')}: ${val}%
                    </div>`
                  ).join('');
                  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
                    <title>Sapphire Diagnostic Report - ${user?.name || 'Student'}</title>
                    <style>body{font-family:'Segoe UI',sans-serif;padding:24px;color:#0F172A;max-width:800px;margin:0 auto}
                    h1{color:#4338CA;margin-bottom:4px}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}
                    th{background:#F1F5F9;padding:8px;text-align:left;border-bottom:2px solid #E2E8F0;font-size:12px}
                    .score-big{font-size:48px;font-weight:900;text-align:center;margin:8px 0}
                    .section{margin:16px 0;padding:12px;border:1px solid #E2E8F0;border-radius:12px}
                    @media print{body{padding:12px}}</style></head><body>
                    <h1>🎯 Sapphire Speech Coach — Diagnostic Report</h1>
                    <p style="color:#64748B;margin-bottom:16px">Student: <strong>${user?.name || 'Student'}</strong> | ID: ${user?.libraryId || '—'} | Date: ${new Date().toLocaleDateString()}</p>
                    <div class="section" style="text-align:center;background:#EEF2FF;border-color:#C7D2FE">
                      <div style="font-size:12px;font-weight:700;color:#6366F1;text-transform:uppercase">Overall Diagnostic Score</div>
                      <div class="score-big" style="color:${report.overall_score >= 70 ? '#059669' : '#D97706'}">${report.overall_score}%</div>
                      <div style="font-weight:700">${report.overall_score >= 85 ? '🌟 Advanced' : report.overall_score >= 65 ? '👍 Intermediate' : '🎯 Foundation Level'}</div>
                    </div>
                    <div class="section"><h3 style="font-size:14px;margin-bottom:8px">Skill Breakdown</h3>${skillRows}</div>
                    <div class="section"><h3 style="font-size:14px;margin-bottom:8px">Per-Question Breakdown (${results.length}/15)</h3>
                    <table><thead><tr><th>Q#</th><th>Target</th><th>Sound</th><th>You Said</th><th>Feedback</th><th style="text-align:center">Score</th></tr></thead>
                    <tbody>${rows}</tbody></table></div>
                    <div class="section"><h3 style="font-size:14px;margin-bottom:6px">Recommended Next Steps</h3>
                    <ul style="padding-left:18px;font-size:13px;color:#475569">${(report.recommended_learning_path || []).map(t => '<li style="margin:4px 0">' + t + '</li>').join('')}</ul></div>
                    <p style="text-align:center;color:#94A3B8;font-size:11px;margin-top:20px">Generated by Sapphire Speech Coach • ${new Date().toLocaleString()}</p>
                    </body></html>`;
                  const blob = new Blob([html], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const win = window.open(url, '_blank');
                  if (win) {
                    win.onload = () => { setTimeout(() => { win.print(); }, 300); };
                  }
                }}
                className="btn-3d btn-3d-primary" 
                type="button"
              >
                📄 Download Report
              </button>
              <button onClick={onClose} className="btn-3d btn-3d-white" type="button">
                Done
              </button>
            </div>
          </div>
        ) : (
          /* ── QUESTION TEST VIEW (Clean, Simple, Intuitive) ── */
          <div>
            {/* Progress */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                <span>Question {currentIndex + 1} of {questions.length}</span>
                <span>{progressPct}% Done</span>
              </div>
              <div style={{ height: '6px', background: 'var(--bg-surface-subtle)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--royal-violet)', transition: 'width 0.3s' }} />
              </div>
            </div>

            {/* Word Card */}
            <div style={{ background: 'var(--bg-surface-subtle)', border: '1.5px solid var(--border-light)', borderRadius: '20px', padding: '2rem 1.5rem', textAlign: 'center', marginBottom: '1.25rem' }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Say the word shown below:
              </p>
              
              <div style={{ fontSize: '2.8rem', fontWeight: 900, color: 'var(--text-main)', margin: '0.4rem 0', letterSpacing: '-0.02em' }}>
                {currentQ.word}
              </div>

              {/* Mascot */}
              <div style={{ margin: '0.5rem auto' }}>
                <Mascot state={status === 'recording' ? 'listening' : status === 'answered' ? (currentEval?.score >= 70 ? 'crowned' : 'thinking') : 'happy'} size={72} />
              </div>

              {error && (
                <div style={{ marginTop: '0.6rem', color: 'var(--coral)', fontSize: '0.82rem', fontWeight: 700 }}>
                  ⚠️ {error}
                </div>
              )}

              {/* Instant Question Feedback after Speaking */}
              {status === 'answered' && currentEval && (
                <div style={{ marginTop: '0.8rem', padding: '0.75rem 1rem', background: currentEval.score >= 70 ? 'var(--bg-mint)' : 'var(--bg-rose)', border: `1px solid ${currentEval.score >= 70 ? '#A7F3D0' : '#FECDD3'}`, borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: 900, color: currentEval.score >= 70 ? 'var(--emerald-dark)' : 'var(--coral-dark)' }}>
                      {currentEval.score}%
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {currentEval.score >= 70 ? 'Great pronunciation!' : 'Needs Practice'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {currentEval.diagnosis_note}
                  </div>
                </div>
              )}

              {liveHeard && status === 'recording' && (
                <div style={{ marginTop: '0.8rem', padding: '0.4rem 0.8rem', background: 'var(--bg-lavender)', borderRadius: '8px', color: 'var(--royal-violet-deep)', fontSize: '0.85rem', fontWeight: 700 }}>
                  🗣️ Heard: "{liveHeard}"
                </div>
              )}
            </div>

            {/* Action Area: Simple & Clear */}
            {status === 'answered' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn-3d btn-3d-primary"
                  onClick={handleNext}
                  style={{ width: '100%', padding: '0.9rem', fontSize: '1.05rem' }}
                >
                  {currentIndex + 1 < questions.length ? 'Next Question ➔' : 'View Final Report ➔'}
                </button>
                <button
                  type="button"
                  onClick={startRecording}
                  style={{ background: 'none', border: 'none', color: 'var(--royal-violet)', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 700 }}
                >
                  🔁 Re-record this word
                </button>
              </div>
            ) : (
              <div>
                <div className="mic-action-area">
                  <button 
                    type="button"
                    className={`large-mic-btn ${status === 'recording' ? 'recording' : ''}`}
                    onClick={() => {
                      if (status === 'recording') {
                        stopAndEvaluate();
                      } else if (status !== 'processing') {
                        startRecording();
                      }
                    }}
                    disabled={status === 'processing'}
                    title={status === 'recording' ? 'Tap to Stop' : 'Tap to Speak Word'}
                  >
                    {status === 'recording' ? '⏹' : status === 'processing' ? '⏳' : '🎙️'}
                  </button>

                  <div className="mic-timer-label">
                    {status === 'recording' 
                      ? `Recording (${recordingSeconds}s) — Tap ⏹ when done` 
                      : status === 'processing'
                      ? '⚡ Analyzing with Groq AI...'
                      : 'Tap to Speak Word'}
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                  <button 
                    type="button"
                    onClick={handleSkip}
                    disabled={status === 'processing'}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Skip Question ➔
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TEACHER / FACULTY ANALYTICS DASHBOARD ───────────────────────────────────
const BRANCHES = ['ALL', 'CSE', 'IT', 'CS', 'CSIT', 'CSE (AI)', 'CSE(AIML)', 'MECH', 'ECE', 'ELCE', 'EEE'];

function TeacherDashboard({ teacher, onSignOut }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [sortBy, setSortBy] = useState('xp');
  const [searchQuery, setSearchQuery] = useState('');

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
      if (sortBy === 'passed') return b.completedCount - a.completedCount;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return b.xp - a.xp;
    });
    return list;
  }, [reports, selectedBranch, sortBy, searchQuery]);

  const collegeTop3 = useMemo(() => [...reports].sort((a, b) => b.avgScore - a.avgScore).slice(0, 3), [reports]);
  const totalStudents = reports.length;
  const avgClassAcc = totalStudents > 0 ? Math.round(reports.reduce((s, r) => s + r.avgScore, 0) / totalStudents) : 0;
  const topPerformer = collegeTop3[0];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-main)' }}>
      <header className="top-appbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <Mascot state="crowned" size={40} />
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--royal-violet)' }}>Sapphire — Faculty Analytics Dashboard</h2>
            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>👨‍🏫 {teacher.name} • Class Analytics</small>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="btn-3d btn-3d-success btn-sm" onClick={() => exportCSVReport(filtered)}>
            📥 Export CSV
          </button>
          <button className="btn-3d btn-sm" onClick={onSignOut} style={{ background: 'var(--coral)', color: '#fff' }}>
            Sign Out
          </button>
        </div>
      </header>

      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="stat-widget-card">
            <div className="stat-widget-label">Total Enrolled</div>
            <div className="stat-widget-val">{totalStudents}</div>
          </div>
          <div className="stat-widget-card">
            <div className="stat-widget-label">Class Avg Accuracy</div>
            <div className="stat-widget-val" style={{ color: 'var(--emerald)' }}>{avgClassAcc}%</div>
          </div>
          <div className="stat-widget-card">
            <div className="stat-widget-label">Top Student</div>
            <div className="stat-widget-val" style={{ color: 'var(--gold)' }}>{topPerformer?.name?.split(' ')[0] || '—'}</div>
          </div>
          <div className="stat-widget-card">
            <div className="stat-widget-label">Target Stage</div>
            <div className="stat-widget-val" style={{ color: 'var(--royal-violet)' }}>Stage 3</div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1rem', background: 'var(--bg-surface)', padding: '0.8rem', borderRadius: '14px', border: '1px solid var(--border-light)' }}>
          <input 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            placeholder="🔍 Search student name or ID..."
            style={{ flex: 1, padding: '0.5rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontFamily: 'var(--font-sans)' }}
          />
          <select 
            value={selectedBranch} 
            onChange={(e) => setSelectedBranch(e.target.value)}
            style={{ padding: '0.5rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
          >
            {BRANCHES.map(b => <option key={b} value={b}>{b === 'ALL' ? 'All Branches' : b}</option>)}
          </select>
        </div>

        {/* Student Table */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '16px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-subtle)', borderBottom: '1px solid var(--border-light)', textAlign: 'left' }}>
                <th style={{ padding: '0.8rem 1rem' }}>#</th>
                <th style={{ padding: '0.8rem 1rem' }}>Student</th>
                <th style={{ padding: '0.8rem 1rem' }}>Library ID</th>
                <th style={{ padding: '0.8rem 1rem' }}>Branch</th>
                <th style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>XP</th>
                <th style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>Passed</th>
                <th style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>Avg Score</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((st, i) => (
                <tr key={st.libraryId || i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '0.8rem 1rem', color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td style={{ padding: '0.8rem 1rem', fontWeight: 700 }}>{st.avatar} {st.name}</td>
                  <td style={{ padding: '0.8rem 1rem', fontFamily: 'monospace', color: 'var(--royal-violet)' }}>{st.libraryId}</td>
                  <td style={{ padding: '0.8rem 1rem' }}>{st.branch}</td>
                  <td style={{ padding: '0.8rem 1rem', textAlign: 'center', color: 'var(--gold-dark)', fontWeight: 800 }}>{st.xp}</td>
                  <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>{st.completedCount}/100</td>
                  <td style={{ padding: '0.8rem 1rem', textAlign: 'center', fontWeight: 800, color: st.avgScore >= 70 ? 'var(--emerald-dark)' : 'var(--coral)' }}>
                    {st.avgScore}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── AUTHENTICATION SCREEN ───────────────────────────────────────────────────
function AuthScreen({ onAuthSuccess, onTeacherSuccess }) {
  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState('👨‍🎓');

  const AVATARS = ['👨‍🎓', '👩‍💻', '🚀', '👑', '🎯', '⚡'];

  async function handleSubmit(event) {
    event.preventDefault();
    setAuthError('');
    setResetMsg('');
    setAuthLoading(true);

    const formData = new FormData(event.currentTarget);
    const libraryId = formData.get('libraryId');
    const email = formData.get('email');
    const password = formData.get('password');
    const name = formData.get('name');
    const branch = formData.get('branch');
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg-page)' }}>
      <div style={{ background: 'var(--bg-surface)', border: '1.5px solid var(--border-light)', borderRadius: '24px', padding: '2.5rem', maxWidth: '440px', width: '100%', boxShadow: 'var(--shadow-floating)', textAlign: 'center' }}>
        <Mascot state="waving" size={88} />
        
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '0.6rem' }}>
          Speak Better. Grow Confident.
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Your friendly AI companion to master pronunciation, grammar &amp; communication.
        </p>

        {/* Tab switch */}
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginBottom: '1.25rem' }}>
          <button 
            type="button" 
            className={`btn-3d ${authMode === 'login' ? 'btn-3d-primary' : 'btn-3d-white'} btn-sm`}
            onClick={() => setAuthMode('login')}
          >
            Student Login
          </button>
          <button 
            type="button" 
            className={`btn-3d ${authMode === 'register' ? 'btn-3d-primary' : 'btn-3d-white'} btn-sm`}
            onClick={() => setAuthMode('register')}
          >
            Register
          </button>
          <button 
            type="button" 
            className={`btn-3d ${authMode === 'teacher' ? 'btn-3d-primary' : 'btn-3d-white'} btn-sm`}
            onClick={() => setAuthMode('teacher')}
          >
            Faculty
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', textAlign: 'left' }}>
          {authMode === 'teacher' && (
            <>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)' }}>Faculty ID</label>
                <input name="teacherId" required placeholder="e.g. FACULTY01" style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid var(--border-light)', marginTop: '0.2rem', fontFamily: 'var(--font-sans)' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)' }}>Password</label>
                <input name="password" type="password" required placeholder="••••••••" style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid var(--border-light)', marginTop: '0.2rem' }} />
              </div>
            </>
          )}

          {authMode === 'register' && (
            <>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)' }}>Full Name</label>
                <input name="name" required placeholder="Arpit Agarwal" style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid var(--border-light)', marginTop: '0.2rem' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)' }}>College Email</label>
                <input name="email" type="email" required placeholder="xyz.2428cse112@kiet.edu" style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid var(--border-light)', marginTop: '0.2rem' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)' }}>Branch</label>
                <select name="branch" style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid var(--border-light)', marginTop: '0.2rem' }}>
                  {['CSE','IT','CS','CSIT','CSE (AI)','CSE(AIML)','MECH','ECE','ELCE','EEE'].map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)' }}>Choose Avatar</label>
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem' }}>
                  {AVATARS.map(av => (
                    <button 
                      key={av} 
                      type="button" 
                      onClick={() => setSelectedAvatar(av)}
                      style={{
                        fontSize: '1.4rem',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '10px',
                        border: selectedAvatar === av ? '2px solid var(--royal-violet)' : '1px solid var(--border-light)',
                        background: selectedAvatar === av ? 'var(--bg-lavender)' : 'var(--bg-surface)'
                      }}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {(authMode === 'login' || authMode === 'register') && (
            <>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)' }}>College Library ID</label>
                <input name="libraryId" required placeholder="Ex: 2428CSEAIML994" style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid var(--border-light)', marginTop: '0.2rem', textTransform: 'uppercase' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)' }}>Password</label>
                <input name="password" type="password" required placeholder="••••••••" style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid var(--border-light)', marginTop: '0.2rem' }} />
              </div>
            </>
          )}

          {authError && <div style={{ color: '#BE123C', fontSize: '0.82rem' }}>{authError}</div>}
          {resetMsg && <div style={{ color: 'var(--emerald-dark)', fontSize: '0.82rem' }}>{resetMsg}</div>}

          <button className="btn-3d btn-3d-primary" type="submit" disabled={authLoading} style={{ marginTop: '0.5rem' }}>
            {authLoading ? 'Processing...' : authMode === 'register' ? 'Register & Begin Quest 🚀' : 'Start Your Journey 🚀'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── UTILITY HELPERS ─────────────────────────────────────────────────────────
function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
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
      if (sound) counts[sound] = (counts[sound] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([sound]) => sound);
}
