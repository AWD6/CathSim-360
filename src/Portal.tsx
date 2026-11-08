import { useCallback, useEffect, useRef, useState } from 'react';
import { sources } from './curriculum';
import { topics, countdownTick, type StepEvent, type LearningMode } from './guided';
import GuidedScene from './GuidedScene';
import NurseCath from './NurseCath';
import { startSound, duckMusic, musicEnabled, successSound, stopSound } from './sound';
import './portal.css';
import './guided.css';

type Session = {
  token: string;
  role: 'patient' | 'caregiver' | 'admin';
  code: string;
};

const endpoint =
  import.meta.env.VITE_REPORT_API_URL ||
  'https://script.google.com/macros/s/AKfycbwC6UwfNGzje7aW0EbOTXVEmOoI1l2vNko_PeBXfwurUGFXoAPiYlGA9NI4DT5tk38eBw/exec';

const localKey = 'cathsim:guided-events:v4';
const media = (name: string) => `${import.meta.env.BASE_URL}media/${name}?v=8`;

async function request(body: object) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.message || 'รหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้งค่ะ');
  return data;
}

function localEvents(): StepEvent[] {
  try {
    const raw = JSON.parse(localStorage.getItem(localKey) || '[]');
    return Array.isArray(raw)
      ? raw.filter((e) => e && topics.some((t) => t.id === e.topic) && ['confirmed', 'auto'].includes(e.trigger)).slice(-1000)
      : [];
  } catch {
    return [];
  }
}

// Minimalist Clean App Logo
export function CatheterLogo() {
  return (
    <svg viewBox="0 0 64 64" fill="none" className="app-logo-svg" aria-label="CathSim 360 - ดูแลสายสวนปัสสาวะอย่างมั่นใจ">
      <rect x="4" y="4" width="56" height="56" rx="16" fill="#23685c" />
      <rect
        x="21"
        y="22"
        width="22"
        height="27"
        rx="5"
        stroke="#ffffff"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M23.5 36.5H40.5V44C40.5 45.6569 39.1569 47 37.5 47H26.5C24.8431 47 23.5 45.6569 23.5 44V36.5Z" fill="#ffffff" fillOpacity="0.22" />
      <line x1="25" y1="36.5" x2="39" y2="36.5" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="27" y1="28" x2="33" y2="28" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <line x1="27" y1="32" x2="31" y2="32" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <path d="M32 22V16C32 13.7909 30.2091 12 28 12H23" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="32" y1="49" x2="32" y2="53" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Portal() {
  const [view, setView] = useState<'home' | 'lesson' | 'report' | 'sources'>('home');
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [paused, setPaused] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [ready, setReady] = useState(false);
  const [left, setLeft] = useState(8);
  const [needsStart, setNeedsStart] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [notice, setNotice] = useState('');

  const [events, setEvents] = useState<StepEvent[]>(localEvents);
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState('');
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<LearningMode>('learn');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const actions = useRef<string[]>([]);
  const audio = useRef<HTMLAudioElement>(null);
  const started = useRef(Date.now());
  const transitionLock = useRef(false);
  const generation = useRef(0);

  // Set document title
  useEffect(() => {
    document.title = 'CathSim 360 - ดูแลสายสวนปัสสาวะอย่างมั่นใจ';
  }, []);

  // Background music is always enabled and starts on user interaction
  useEffect(() => {
    musicEnabled(true);
    const wake = () => {
      musicEnabled(true);
      startSound();
    };
    document.addEventListener('pointerdown', wake);
    document.addEventListener('keydown', wake);
    return () => {
      document.removeEventListener('pointerdown', wake);
      document.removeEventListener('keydown', wake);
      stopSound();
    };
  }, []);

  // Auto-trigger audio playback on the very first user gesture if browser blocked initial autoplay
  useEffect(() => {
    if (!needsStart) return;
    const unlockAudio = () => {
      const a = audio.current;
      if (!a || !needsStart) return;
      a.play()
        .then(() => {
          setNarrating(true);
          setNeedsStart(false);
        })
        .catch(() => {});
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [needsStart]);
  // Duck background music softly while Nurse Nong Four is speaking
  useEffect(() => {
    duckMusic(narrating);
  }, [narrating]);

  const topic = topics[index];
  const current = topic?.steps[step];

  const clip =
    view === 'lesson'
      ? finished
        ? 'complete'
        : mode === 'challenge'
        ? `challenge-${topic.id}-${step}`
        : `${topic.id}-${step}`
      : view === 'home'
      ? 'welcome'
      : null;

  // Practice mode allows clicking "ทำแล้ว" OR auto-advancing after 8 seconds
  const autoAdvance = mode === 'practice';

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view, index]);

  const play = useCallback(() => {
    musicEnabled(true);
    startSound();
    const a = audio.current;
    if (!a) return;
    setAudioError(false);
    setNeedsStart(false);
    setPaused(false);
    setReady(false);
    a.play()
      .then(() => setNarrating(true))
      .catch(() => {
        setNeedsStart(true);
        setNarrating(false);
      });
  }, []);

  // Audio clip loader
  useEffect(() => {
    const a = audio.current;
    const gen = ++generation.current;
    setReady(false);
    setLeft(8);
    setAudioError(false);
    setNarrating(false);
    setNeedsStart(false);
    transitionLock.current = false;
    started.current = Date.now();
    actions.current = [];
    if (!a || !clip) return;

    a.src = media(`${clip}.mp3`);
    a.load();
    a.play()
      .then(() => {
        if (gen === generation.current) setNarrating(true);
      })
      .catch(() => {
        if (gen === generation.current) setNeedsStart(true);
      });

    return () => {
      a.pause();
    };
  }, [clip]);

  // Handle browser visibility
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        audio.current?.pause();
        setPaused(true);
        setNarrating(false);
        stopSound();
      } else {
        musicEnabled(true);
        startSound();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    transitionLock.current = false;
    started.current = Date.now();
    actions.current = [];
  }, [view, index, step, mode]);

  const openLesson = (i: number) => {
    setIndex(i);
    setStep(0);
    setFinished(false);
    setPaused(false);
    setView('lesson');
  };

  // Step advancement with sound effect
  const advance = useCallback(
    async (trigger: 'confirmed' | 'auto') => {
      if (transitionLock.current || finished || view !== 'lesson') return;
      transitionLock.current = true;

      if (trigger === 'confirmed') {
        successSound();
      }

      setPaused(false);
      setReady(false);
      setLeft(8);

      const event: StepEvent = {
        id: crypto.randomUUID(),
        code: session?.code || 'USER',
        topic: topic.id,
        step,
        trigger,
        seconds: Math.max(0, Math.round((Date.now() - started.current) / 1000)),
        time: new Date().toISOString(),
        mode,
        actions: [...actions.current]
      };

      setEvents((prev) => {
        const next = [...prev, event].slice(-1000);
        try {
          localStorage.setItem(localKey, JSON.stringify(next));
        } catch {
          setNotice('บันทึกในอุปกรณ์ไม่ได้ ส่งออกรายงานก่อนปิดหน้านะคะ');
        }
        return next;
      });

      if (step < topic.steps.length - 1) {
        setStep((s) => s + 1);
      } else {
        setFinished(true);
      }

      if (session && (session.role === 'patient' || session.role === 'caregiver')) {
        try {
          await request({ action: 'progress', token: session.token, event });
        } catch {
          // Saved locally in browser storage
        }
      }
    },
    [finished, view, session, topic, step, mode]
  );

  // Practice mode 8-second auto-advance countdown tick
  useEffect(() => {
    if (view !== 'lesson' || finished || !autoAdvance || !ready || paused || needsStart || audioError) return;
    const interval = setInterval(() => {
      setLeft((n) => countdownTick(n, true, false, !document.hidden));
    }, 1000);
    return () => clearInterval(interval);
  }, [view, finished, autoAdvance, ready, paused, needsStart, audioError]);

  useEffect(() => {
    if (left === 0 && autoAdvance && ready && !paused && !needsStart && !audioError) {
      void advance('auto');
    }
  }, [left, autoAdvance, ready, paused, needsStart, audioError, advance]);

  const navigate = (v: typeof view) => {
    audio.current?.pause();
    setView(v);
    setPaused(false);
  };

  // Admin login via password "dmknj"
  const loginAdmin = async () => {
    const trimmed = access.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === 'dmknj') {
      setSession({ token: 'local-admin-dmknj', role: 'admin', code: 'ADMIN' });
      setEvents(localEvents());
      setAccess('');
      setNotice('เข้าสู่ระบบ CathReport (Admin) เรียบร้อยแล้วค่ะ');
      return;
    }

    setBusy(true);
    try {
      const auth = await request({ action: 'login', code: 'AD-OWNER01', access: trimmed });
      const history = auth.role === 'admin' ? await request({ action: 'report', token: auth.token }) : { events: [] };
      setSession({ token: auth.token, role: auth.role, code: 'ADMIN' });
      setEvents([...localEvents(), ...(history.events || [])]);
      setAccess('');
      setNotice('เข้าสู่ระบบ CathReport (Admin) เรียบร้อยแล้วค่ะ');
    } catch {
      setNotice('รหัสผ่าน Admin ไม่ถูกต้อง กรุณากรอกรหัสผ่านอีกครั้งค่ะ');
    } finally {
      setBusy(false);
    }
  };

  const visibleEvents = events;

  const exportCSV = () => {
    const rows = [
      ['id', 'participant_code', 'topic', 'step', 'event', 'seconds', 'timestamp', 'mode', 'actions'],
      ...visibleEvents.map((e) => [
        e.id,
        e.code,
        e.topic,
        String(e.step + 1),
        e.trigger,
        String(e.seconds),
        e.time,
        e.mode || 'learn',
        (e.actions || []).join(' | ')
      ])
    ];
    const blob = new Blob(
      ['\ufeff' + rows.map((r) => r.map((s) => '"' + (/^[=+@-]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"').join(',')).join('\n')],
      { type: 'text/csv;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cathsim-progress.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportJSON = () => {
    if (session?.role !== 'admin') return;
    const blob = new Blob([JSON.stringify(visibleEvents, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cathsim-report.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const removeHistory = async () => {
    if (session?.role !== 'admin') return;
    setBusy(true);
    try {
      localStorage.removeItem(localKey);
      if (session.token !== 'local-admin-dmknj') {
        await request({ action: 'deleteHistory', token: session.token }).catch(() => {});
      }
      setEvents([]);
      setDeleteConfirm(false);
      setNotice('ลบประวัติการทดลองทั้งหมดเรียบร้อยแล้วค่ะ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="portal guided-app">
      {/* Hidden Audio Element for Nurse Nong Four Voice Clips */}
      <audio
        ref={audio}
        preload="auto"
        onEnded={() => {
          setNarrating(false);
          setReady(true);
          setLeft(8);
        }}
        onPlay={() => {
          musicEnabled(true);
          startSound();
          setNarrating(true);
          setNeedsStart(false);
        }}
        onPause={() => setNarrating(false)}
        onError={() => {
          setAudioError(true);
          setNarrating(false);
          setReady(false);
          setPaused(true);
        }}
      />

      {/* Minimalist Header (Requirement 7) */}
      <header className="portal-header">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('home');
          }}
          className="brand-link"
        >
          <CatheterLogo />
          <div className="brand-text">
            <b>
              CathSim <em>360</em> <span className="brand-dash">- ดูแลสายสวนปัสสาวะอย่างมั่นใจ</span>
            </b>
            <span className="brand-sub">โรงพยาบาลมหาราชนครเชียงใหม่ · ระบบฝึกดูแลสายสวนปัสสาวะ 3 มิติ</span>
          </div>
        </a>
        <div className="header-meta">
          <span className="credit">conceived, designed and Brought to Life by RN.Patipon Wiyo</span>
        </div>
      </header>

      {/* Main Navigation Bar (Requirement 5 & 6: Only 3 tabs in exact order, CathReport on far right) */}
      <nav className="portal-nav" role="navigation" aria-label="เมนูหลัก">
        <div className="nav-left-group">
          <button className={view === 'home' || view === 'lesson' ? 'active-nav' : ''} onClick={() => navigate('home')}>
            ดูสาธิตและทำไปด้วยกัน
          </button>
          <button className={view === 'sources' ? 'active-nav' : ''} onClick={() => navigate('sources')}>
            แหล่งอ้างอิงและแนวทางดูแล
          </button>
        </div>
        <div className="nav-right-group">
          <button className={view === 'report' ? 'active-nav' : ''} onClick={() => navigate('report')}>
            CathReport
          </button>
        </div>
      </nav>

      {/* Application Content Shell */}
      <main className="portal-main">
        {/* Learning Mode Bar (Distinct Learn, Practice, Challenge) */}
        <div className="experience-bar">
          <div className="mode-switch" aria-label="โหมดการเรียนรู้">
            {(['learn', 'practice', 'challenge'] as LearningMode[]).map((m) => (
              <button
                key={m}
                className={mode === m ? 'selected' : ''}
                onClick={() => {
                  setMode(m);
                  setPaused(false);
                  setLeft(8);
                }}
              >
                {m === 'learn'
                  ? 'CathLearn · ดูสาธิต'
                  : m === 'practice'
                  ? 'CathPractice · ฝึกทำ'
                  : 'CathChallenge · ลองเอง'}
              </button>
            ))}
          </div>
          <span className="mode-description-badge">
            {mode === 'learn'
              ? 'โหมดดูสาธิต: ฟังคำอธิบายละเอียดและกดปุ่ม “ทำแล้ว” เพื่อไปขั้นตอนถัดไป'
              : mode === 'practice'
              ? 'โหมดฝึกทำ: กดปุ่ม “ทำแล้ว” ได้เอง หรือระบบเลื่อนให้อัตโนมัติหลังฟังจบ 8 วินาที'
              : 'โหมดลองเอง: แสดงเฉพาะจอสาธิต 3D และฟังคำแนะนำสั้นกระชับจากพยาบาลน้องโฟร์'}
          </span>
        </div>

        {/* Global Notice Toast */}
        {notice && (
          <div className="portal-notice" role="status">
            <span>{notice}</span>
            <button onClick={() => setNotice('')}>ปิด</button>
          </div>
        )}

        {/* VIEW: HOME (Welcome Stage & Topic Grid) */}
        {view === 'home' && (
          <>
            <section className="welcome-stage">
              <div className={`cath-portrait ${narrating ? 'speaking' : ''}`}>
                <NurseCath speaking={narrating} />
              </div>
              <div className="welcome-copy">
                <span className="gentle-label">พยาบาลน้องโฟร์ · โรงพยาบาลมหาราชนครเชียงใหม่</span>
                <h1>
                  ค่อย ๆ ดูแลไปด้วยกัน
                  <br />
                  ทีละขั้น อย่างมั่นใจ
                </h1>
                <p>
                  สวัสดีค่ะ ดิฉันพยาบาลน้องโฟร์ ยินดีต้อนรับสู่ CathSim 360 นะคะ ดูภาพสาธิต 3D
                  ฟังคำแนะนำ แล้วทดลองทำไปพร้อมกันนะคะ
                </p>
                {needsStart ? (
                  <button className="portal-primary welcome-start" onClick={play}>
                    แตะเพื่อเริ่มฟังเสียงพยาบาลน้องโฟร์
                  </button>
                ) : (
                  <button className="welcome-start portal-primary" onClick={() => openLesson(0)}>
                    เริ่มดูสาธิตเรื่องแรก
                  </button>
                )}
                <span className="welcome-audio-state">
                  {audioError
                    ? 'เสียงยังโหลดไม่ได้ แตะปุ่มเริ่มฟังเพื่อลองใหม่ค่ะ'
                    : narrating
                    ? 'พยาบาลน้องโฟร์กำลังทักทายคุณ...'
                    : 'เลือกเรื่องที่ต้องการเรียนรู้ด้านล่างได้เลยค่ะ'}
                </span>
              </div>
            </section>

            <div className="learning-heading">
              <h2>วันนี้อยากให้พยาบาลน้องโฟร์ช่วยดูแลเรื่องไหนคะ?</h2>
              <p>เลือกบทเรียน ดูภาพ 3D ฟังคำแนะนำ ทำตาม แล้วกด “ทำแล้ว” เพื่อไปต่อค่ะ</p>
            </div>

            <div className="lesson-grid">
              {topics.map((t, i) => (
                <button className="lesson-card" key={t.id} onClick={() => openLesson(i)}>
                  <span className="topic-number">{String(i + 1).padStart(2, '0')}</span>
                  <strong>{t.title}</strong>
                  <p>{t.description}</p>
                  <span>{t.steps.length} ขั้นตอน · เริ่มดูสาธิต</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* VIEW: LESSON (Guided 3D Scene & Mode-Specific Layout) */}
        {view === 'lesson' && topic && (
          <section className="guided-lesson">
            <div className="lesson-top">
              <button className="back-topic-btn" onClick={() => navigate('home')}>
                กลับหน้าเลือกบทเรียน
              </button>
              <div className="lesson-top-title">
                <strong>{topic.title}</strong>
                <span className="lesson-step-badge">
                  {finished ? 'สาธิตครบแล้ว' : `ขั้นที่ ${step + 1} / ${topic.steps.length}`}
                </span>
              </div>
            </div>

            <div className={`demo-layout ${mode === 'challenge' ? 'challenge-mode' : ''}`}>
              {/* 3D Interactive Demonstration Stage */}
              <div className="demonstration">
                <GuidedScene
                  topic={topic.id}
                  visual={current.visual}
                  paused={paused}
                  speaking={narrating}
                  mode={mode}
                  onAction={(a) => {
                    actions.current = [...actions.current, a].slice(-80);
                  }}
                />
                <div className="demo-nurse">
                  <NurseCath speaking={narrating} compact />
                  <span>{narrating ? 'พยาบาลน้องโฟร์กำลังพูด...' : 'พยาบาลน้องโฟร์'}</span>
                </div>

                {/* In CathChallenge mode: show ONLY the demonstration stage + compact action bar */}
                {mode === 'challenge' && (
                  <div className="challenge-action-bar">
                    <div className="challenge-status-text">
                      <strong>
                        {finished
                          ? 'ผ่านการลองทำครบทุกขั้นตอนในหัวข้อนี้แล้วค่ะ'
                          : `โหมดลองเอง (ขั้นที่ ${step + 1}/${topic.steps.length}): ฟังพยาบาลน้องโฟร์แล้วกดทำในจอสาธิต`}
                      </strong>
                      {needsStart && (
                        <button className="portal-primary" onClick={play}>
                          แตะเพื่อฟังเสียงคำแนะนำสั้น ๆ
                        </button>
                      )}
                    </div>
                    {!finished ? (
                      <div className="challenge-buttons">
                        <button className="portal-primary done-button" onClick={() => advance('confirmed')}>
                          ทำแล้ว · ไปขั้นต่อไป
                        </button>
                        <button
                          onClick={() => {
                            if (audio.current) {
                              audio.current.currentTime = 0;
                              setReady(false);
                              setLeft(8);
                              play();
                            }
                          }}
                        >
                          ฟังคำแนะนำสั้น ๆ ซ้ำ
                        </button>
                        <button
                          onClick={() => {
                            if (paused) {
                              play();
                            } else {
                              audio.current?.pause();
                              setPaused(true);
                            }
                          }}
                        >
                          {paused ? 'ทำต่อ' : 'พักก่อน'}
                        </button>
                      </div>
                    ) : (
                      <div className="challenge-buttons">
                        <button className="portal-primary" onClick={() => openLesson((index + 1) % topics.length)}>
                          ไปหัวข้อถัดไป
                        </button>
                        <button onClick={() => openLesson(index)}>ลองทำหัวข้อนี้อีกครั้ง</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Spoken Step Text Panel (Shown in CathLearn and CathPractice modes) */}
              {mode !== 'challenge' && (
                <div className="spoken-step">
                  <span className="gentle-label">
                    {finished
                      ? 'ขอบคุณที่ดูแลไปด้วยกันค่ะ'
                      : mode === 'learn'
                      ? `โหมดดูสาธิต · ขั้นที่ ${step + 1} (กดปุ่มทำแล้วเมื่อดูและทำตามเสร็จ)`
                      : `โหมดฝึกทำ · ขั้นที่ ${step + 1} (กดปุ่มทำแล้ว หรือรอเลื่อนอัตโนมัติใน 8 วินาที)`}
                  </span>
                  <h1>{finished ? 'จบการสาธิตเรื่องนี้แล้วค่ะ' : current.cue}</h1>
                  <p className="nurse-script" aria-live="polite">
                    {finished
                      ? 'เก่งมากค่ะ จบการสาธิตเรื่องนี้แล้วนะคะ สามารถกลับมาดูซ้ำหรือทดลองทำได้ทุกเมื่อค่ะ พยาบาลน้องโฟร์เป็นกำลังใจให้นะคะ'
                      : current.text}
                  </p>

                  {needsStart && (
                    <button className="portal-primary" onClick={play}>
                      แตะเพื่อฟังเสียงขั้นตอนนี้
                    </button>
                  )}

                  {audioError && (
                    <div role="alert" className="audio-error">
                      เสียงยังโหลดไม่ได้ แตะปุ่มเพื่อลองใหม่ หรืออ่านข้อความแล้วทำตามได้ค่ะ ระบบจะไม่เลื่อนเอง
                      <button onClick={play}>ลองเล่นเสียงใหม่</button>
                    </div>
                  )}

                  {/* Step Action Buttons */}
                  {!finished ? (
                    <>
                      <div className="step-actions">
                        <button className="portal-primary done-button" onClick={() => advance('confirmed')}>
                          ทำแล้ว · ไปขั้นต่อไป
                        </button>
                        <button
                          onClick={() => {
                            if (audio.current) {
                              audio.current.currentTime = 0;
                              setReady(false);
                              setLeft(8);
                              play();
                            }
                          }}
                        >
                          ฟังและดูซ้ำ
                        </button>
                        <button
                          onClick={() => {
                            if (paused) {
                              play();
                            } else {
                              audio.current?.pause();
                              setPaused(true);
                            }
                          }}
                        >
                          {paused ? 'ทำต่อ' : 'พักก่อน'}
                        </button>
                      </div>

                      {mode === 'learn' && (
                        <div className="mode-hint-box">
                          โหมดดูสาธิต: เมื่อฟังพยาบาลน้องโฟร์และดูภาพสาธิตเสร็จแล้ว กรุณากดปุ่ม{' '}
                          <strong>“ทำแล้ว · ไปขั้นต่อไป”</strong> เพื่อไปยังขั้นตอนถัดไปค่ะ
                        </div>
                      )}

                      {mode === 'practice' && (
                        <div className="countdown" aria-live="polite">
                          {paused
                            ? 'หยุดพักอยู่ (กด “ทำต่อ” หรือกด “ทำแล้ว” เพื่อไปต่อได้ค่ะ)'
                            : needsStart
                            ? 'แตะเริ่มเสียงก่อนค่ะ'
                            : audioError
                            ? 'รอโหลดเสียงใหม่'
                            : !ready
                            ? 'กำลังฟังคำแนะนำ... เมื่อพูดจบจะนับถอยหลัง 8 วินาที (หรือกด “ทำแล้ว” ได้ทันที)'
                            : `เลื่อนไปขั้นถัดไปอัตโนมัติใน ${left} วินาที (หรือกดปุ่ม “ทำแล้ว” ได้เลยค่ะ)`}
                          <small>
                            โหมดฝึกทำ: กดปุ่ม “ทำแล้ว” ได้เอง หรือปล่อยให้ระบบเลื่อนอัตโนมัติเมื่อครบ 8 วินาทีหลังฟังจบค่ะ
                          </small>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="step-actions">
                      <button className="portal-primary" onClick={() => openLesson((index + 1) % topics.length)}>
                        ดูเรื่องถัดไป
                      </button>
                      <button onClick={() => openLesson(index)}>ดูเรื่องนี้อีกครั้ง</button>
                    </div>
                  )}

                  <details>
                    <summary>แหล่งอ้างอิงของคำแนะนำในขั้นตอนนี้</summary>
                    {topic.sources.map((srcIdx) => (
                      <p key={srcIdx}>
                        <a href={sources[srcIdx]?.url} target="_blank" rel="noreferrer">
                          {sources[srcIdx]?.name}
                        </a>
                      </p>
                    ))}
                  </details>
                </div>
              )}
            </div>

            {/* Step Navigation Dots */}
            <div className="step-dots">
              {topic.steps.map((s, i) => (
                <button
                  className={i === step ? 'active' : ''}
                  key={i}
                  aria-label={`ดูขั้นที่ ${i + 1}`}
                  onClick={() => {
                    setReady(false);
                    setLeft(8);
                    setStep(i);
                    setFinished(false);
                    setPaused(false);
                  }}
                >
                  {i + 1}
                  {mode !== 'challenge' && <span>{s.cue}</span>}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* VIEW: CATHREPORT (Prompts for Admin Password "dmknj" if not logged in, otherwise shows Admin Report) */}
        {view === 'report' && (
          <>
            {session?.role !== 'admin' ? (
              <section className="login-card">
                <h1>CathReport · สำหรับผู้ดูแลระบบ (Admin)</h1>
                <p>กรุณากรอกรหัสผู้ดูแลระบบเพื่อเข้าดูรายงานผลการฝึกและส่งออกข้อมูลค่ะ</p>
                <label>
                  รหัสผู้ดูแลระบบ (Admin Password)
                  <input
                    type="password"
                    value={access}
                    autoComplete="off"
                    placeholder="กรอกรหัส Admin"
                    onChange={(e) => setAccess(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && access.trim()) {
                        void loginAdmin();
                      }
                    }}
                  />
                </label>
                <div className="login-buttons">
                  <button className="portal-primary" disabled={busy || !access.trim()} onClick={loginAdmin}>
                    {busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่หน้า CathReport'}
                  </button>
                  <button onClick={() => navigate('home')}>กลับหน้าหลัก</button>
                </div>
              </section>
            ) : (
              <section className="portal-report">
                <div className="report-top-row">
                  <div>
                    <h1>CathReport · รายงานผลการทดลอง (สำหรับผู้ดูแลระบบ)</h1>
                    <p>
                      รายงานสรุปการทดลองปฏิบัติการ แยกการกดยืนยัน (“ทำแล้ว”) การดูผ่านอัตโนมัติ
                      และบันทึกสายการโต้ตอบกับอุปกรณ์ 3D อย่างละเอียด
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSession(null);
                      setNotice('ออกจากระบบผู้ดูแลเรียบร้อยแล้วค่ะ');
                    }}
                  >
                    ล็อกหน้าจอ Admin
                  </button>
                </div>

                <div className="stat-row">
                  <div>
                    <b>{visibleEvents.filter((e) => e.trigger === 'confirmed').length}</b>
                    ขั้นตอนที่กด “ทำแล้ว” (Confirmed)
                  </div>
                  <div>
                    <b>{visibleEvents.filter((e) => e.trigger === 'auto').length}</b>
                    ขั้นตอนที่เลื่อนอัตโนมัติ (Auto)
                  </div>
                  <div>
                    <b>
                      {new Set(visibleEvents.map((e) => e.topic)).size}/{topics.length}
                    </b>
                    บทเรียนที่เปิดดู
                  </div>
                </div>

                <div className="report-actions-bar">
                  <button className="portal-primary" onClick={exportCSV}>
                    ดาวน์โหลด CSV
                  </button>
                  <button className="portal-primary" onClick={exportJSON}>
                    ดาวน์โหลด JSON
                  </button>
                  <button onClick={() => setDeleteConfirm(true)} className="delete-btn">
                    ลบประวัติการทดลอง
                  </button>
                </div>

                {deleteConfirm && (
                  <div className="delete-confirm" role="alert">
                    <p>
                      <strong>ยืนยันการลบประวัติ?</strong> ข้อมูลประวัติการทดลองทั้งหมดจะถูกลบอย่างถาวรและไม่สามารถย้อนกลับได้
                    </p>
                    <button disabled={busy} onClick={removeHistory} className="confirm-delete-btn">
                      ยืนยันลบประวัติทั้งหมด
                    </button>
                    <button onClick={() => setDeleteConfirm(false)}>ยกเลิก</button>
                  </div>
                )}

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>รหัสผู้ใช้</th>
                        <th>เรื่อง</th>
                        <th>ขั้น</th>
                        <th>สถานะการผ่าน</th>
                        <th>เวลาในขั้น (วินาที)</th>
                        <th>โหมด / ลำดับการโต้ตอบ (Interactive Actions)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleEvents
                        .slice()
                        .reverse()
                        .map((e) => (
                          <tr key={e.id}>
                            <td>
                              <code>{e.code}</code>
                            </td>
                            <td>{topics.find((t) => t.id === e.topic)?.title || e.topic}</td>
                            <td>{e.step + 1}</td>
                            <td>
                              <span className={e.trigger === 'confirmed' ? 'status-confirmed' : 'status-auto'}>
                                {e.trigger === 'confirmed' ? 'ผู้ใช้กดยืนยัน' : 'ดูผ่านอัตโนมัติ'}
                              </span>
                            </td>
                            <td>{e.seconds} วินาที</td>
                            <td>
                              <span className="mode-tag">{e.mode || 'learn'}</span> ·{' '}
                              {(e.actions || []).length > 0 ? (e.actions || []).join(' -> ') : '—'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                <p className="report-definition">
                  * ข้อมูลการทำผ่านในระบบเป็นผลการเรียนรู้ในซอฟต์แวร์จำลอง 3D ไม่ใช่การรับรองทักษะทางคลินิก (Clinical Competence)
                  ซึ่งต้องได้รับการประเมินแบบ Return Demonstration โดยพยาบาลวิชาชีพโดยตรง
                </p>
              </section>
            )}
          </>
        )}

        {/* VIEW: SOURCES & CLINICAL GUIDELINES */}
        {view === 'sources' && (
          <section className="source-page">
            <h1>แหล่งอ้างอิงและแนวทางการดูแลสายสวนปัสสาวะ</h1>
            <div className="hospital-guideline-card">
              <h3>แนวทางของโรงพยาบาลมหาราชนครเชียงใหม่</h3>
              <ul>
                <li>
                  <strong>การเปลี่ยนสายสวนปัสสาวะ:</strong> นัดเปลี่ยนสายที่สถานพยาบาลใกล้บ้านทุก 2 สัปดาห์ หรือตามใบนัดของแพทย์
                  (ห้ามผู้ป่วยหรือผู้ดูแลถอดหรือใส่สายเองที่บ้าน)
                </li>
                <li>
                  <strong>การเปลี่ยนถุงปัสสาวะ:</strong> โรงพยาบาลมหาราชนครเชียงใหม่แนะนำให้เปลี่ยนถุงทุกสัปดาห์
                  โดยใช้วิธีปลอดเชื้อ (Non-touch technique)
                </li>
                <li>
                  <strong>การทำความสะอาดอวัยวะเพศ:</strong> แนะนำทำความสะอาดวันละ 3 ครั้ง ปรับตามเวลาตื่นนอนและทำเพิ่มเมื่อเปื้อน
                  โดยใช้สบู่อ่อนกับน้ำสะอาด ล้างและซับให้แห้ง
                </li>
                <li>
                  <strong>การดื่มน้ำ:</strong> หากไม่มีข้อจำกัดทางการแพทย์ (เช่น โรคหัวใจหรือโรคไต) แนะนำดื่มน้ำ 2.5–3 ลิตรต่อวัน
                  เพื่อช่วยระบายทางเดินปัสสาวะ
                </li>
              </ul>
            </div>

            <h2>หลักฐานเชิงประจักษ์และแนวทางมาตรฐานสากล</h2>
            {sources.map((s) => (
              <article key={s.url}>
                <h3>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.name}
                  </a>
                </h3>
                <p>{s.note}</p>
              </article>
            ))}
          </section>
        )}

        {/* Modern Footer */}
        <footer className="portal-footer">
          conceived, designed and Brought to Life by RN.Patipon Wiyo
          <br />
          CathSim 360 - ดูแลสายสวนปัสสาวะอย่างมั่นใจ · โรงพยาบาลมหาราชนครเชียงใหม่
        </footer>
      </main>
    </div>
  );
}
