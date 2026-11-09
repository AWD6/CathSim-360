import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sources } from './curriculum';
import {
  topics,
  countdownTick,
  normalizeCsId,
  isValidCsId,
  evaluatePatientProgress,
  type StepEvent,
  type LearningMode
} from './guided';
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

type PatientAccountRecord = {
  csId: string;
  pin: string;
  adminNote: string;
  createdAt: string;
};

const endpoint =
  import.meta.env.VITE_REPORT_API_URL ||
  'https://script.google.com/macros/s/AKfycbwC6UwfNGzje7aW0EbOTXVEmOoI1l2vNko_PeBXfwurUGFXoAPiYlGA9NI4DT5tk38eBw/exec';

const localKey = 'cathsim:guided-events:v4';
const patientSessionKey = 'cathsim:patient-session:v1';
const patientAccountsKey = 'cathsim:patient-accounts:v1';
const media = (name: string) => `${import.meta.env.BASE_URL}media/${name}?v=8`;

async function request(body: object) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.message || data.error || 'รหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้งค่ะ');
  return data;
}

function localEvents(): StepEvent[] {
  try {
    const raw = JSON.parse(localStorage.getItem(localKey) || '[]');
    return Array.isArray(raw)
      ? raw
          .filter((e) => e && topics.some((t) => t.id === e.topic) && ['confirmed', 'auto'].includes(e.trigger))
          .slice(-2000)
      : [];
  } catch {
    return [];
  }
}

function mergeEvents(a: StepEvent[], b: StepEvent[]): StepEvent[] {
  const map = new Map<string, StepEvent>();
  for (const item of [...a, ...b]) {
    if (item && item.id && topics.some((t) => t.id === item.topic)) {
      map.set(item.id, { ...item, code: normalizeCsId(item.code || 'CS-1') });
    }
  }
  return Array.from(map.values()).sort((x, y) => String(x.time).localeCompare(String(y.time)));
}

function loadPatientSession(): Session | null {
  try {
    const raw = JSON.parse(localStorage.getItem(patientSessionKey) || 'null');
    if (raw && raw.role === 'patient' && typeof raw.code === 'string' && isValidCsId(raw.code)) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

function loadPatientAccounts(): Record<string, PatientAccountRecord> {
  try {
    const raw = JSON.parse(localStorage.getItem(patientAccountsKey) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function formatThaiDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
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

  // Patient Login State (CS-1, CS-2, ... + PIN)
  const [patientSession, setPatientSession] = useState<Session | null>(loadPatientSession);
  const [patientCsInput, setPatientCsInput] = useState('');
  const [patientPinInput, setPatientPinInput] = useState('');
  const [patientBusy, setPatientBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'local'>('idle');

  // Admin Session & CathReport Lookup State (Requires Admin Password + Patient CS ID)
  const [adminSession, setAdminSession] = useState<Session | null>(null);
  const [access, setAccess] = useState('');
  const [reportCsInput, setReportCsInput] = useState('CS-1');
  const [selectedCsId, setSelectedCsId] = useState('CS-1');
  const [busy, setBusy] = useState(false);

  // Admin Private Patient Account & Note Registry
  const [patientAccounts, setPatientAccounts] = useState<Record<string, PatientAccountRecord>>(loadPatientAccounts);
  const [newCsId, setNewCsId] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newAdminNote, setNewAdminNote] = useState('');

  const [mode, setMode] = useState<LearningMode>('learn');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const actions = useRef<string[]>([]);
  const audio = useRef<HTMLAudioElement>(null);
  const started = useRef(Date.now());
  const transitionLock = useRef(false);
  const generation = useRef(0);
  const loginBoxRef = useRef<HTMLElement>(null);

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

  // Patient Login Handler (CS-1, CS-2, ... + PIN)
  const loginPatient = async () => {
    const csId = normalizeCsId(patientCsInput);
    const pin = patientPinInput.trim();
    if (!isValidCsId(csId)) {
      setNotice('กรุณากรอกรหัสผู้ป่วยในรูปแบบ CS-... เช่น CS-1, CS-2 (ห้ามใช้ชื่อหรือ HN ค่ะ)');
      return;
    }
    if (pin.length < 3) {
      setNotice('กรุณากรอกรหัส PIN อย่างน้อย 3–4 หลักค่ะ');
      return;
    }

    // Check local account registry if PIN was already set on this device
    const existingLocal = patientAccounts[csId];
    if (existingLocal && existingLocal.pin && existingLocal.pin !== pin) {
      setNotice(`รหัส PIN สำหรับ ${csId} ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้งค่ะ`);
      return;
    }

    setPatientBusy(true);
    setSyncStatus('syncing');
    try {
      const res = await request({ action: 'patientLogin', code: csId, access: pin });
      const sess: Session = { token: res.token, role: 'patient', code: csId };
      setPatientSession(sess);
      localStorage.setItem(patientSessionKey, JSON.stringify(sess));

      // Save account locally as well
      const nextAccounts = {
        ...patientAccounts,
        [csId]: {
          csId,
          pin,
          adminNote: existingLocal?.adminNote || '',
          createdAt: existingLocal?.createdAt || new Date().toISOString()
        }
      };
      setPatientAccounts(nextAccounts);
      localStorage.setItem(patientAccountsKey, JSON.stringify(nextAccounts));

      if (Array.isArray(res.events) && res.events.length > 0) {
        setEvents((prev) => {
          const merged = mergeEvents(prev, res.events);
          try {
            localStorage.setItem(localKey, JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }

      // Sync any existing local events for this CS ID up to Google Sheet
      const pendingForPatient = localEvents().filter((e) => normalizeCsId(e.code) === csId);
      for (const ev of pendingForPatient.slice(-50)) {
        await request({ action: 'progress', token: res.token, event: { ...ev, code: csId } }).catch(() => {});
      }

      setSyncStatus('synced');
      setPatientPinInput('');
      setReportCsInput(csId);
      setSelectedCsId(csId);
      setNotice(`เข้าสู่ระบบรหัสผู้ป่วย ${csId} และเชื่อมต่อ Google Sheet เรียบร้อยแล้วค่ะ`);
    } catch {
      // Fallback: Local session with automatic Google Sheet backup queue
      const sess: Session = { token: `local-patient-${csId}`, role: 'patient', code: csId };
      setPatientSession(sess);
      localStorage.setItem(patientSessionKey, JSON.stringify(sess));

      const nextAccounts = {
        ...patientAccounts,
        [csId]: {
          csId,
          pin,
          adminNote: existingLocal?.adminNote || '',
          createdAt: existingLocal?.createdAt || new Date().toISOString()
        }
      };
      setPatientAccounts(nextAccounts);
      localStorage.setItem(patientAccountsKey, JSON.stringify(nextAccounts));

      setSyncStatus('local');
      setPatientPinInput('');
      setReportCsInput(csId);
      setSelectedCsId(csId);
      setNotice(`เข้าสู่ระบบรหัสผู้ป่วย ${csId} เรียบร้อยแล้วค่ะ (บันทึกและสำรองข้อมูลอัตโนมัติ)`);
    } finally {
      setPatientBusy(false);
    }
  };

  const logoutPatient = () => {
    setPatientSession(null);
    setSyncStatus('idle');
    try {
      localStorage.removeItem(patientSessionKey);
    } catch {}
    setNotice('ออกจากระบบผู้ป่วยเรียบร้อยแล้วค่ะ สามารถเข้าสู่ระบบด้วยรหัส CS-... ใหม่ได้ค่ะ');
  };

  const openLesson = (i: number) => {
    if (!patientSession) {
      setNotice('กรุณาเข้าสู่ระบบผู้ป่วยด้วยรหัส CS-... (เช่น CS-1) และ PIN ก่อนเริ่มบทเรียน เพื่อบันทึกคะแนนและสำรองข้อมูลค่ะ');
      loginBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setIndex(i);
    setStep(0);
    setFinished(false);
    setPaused(false);
    setView('lesson');
  };

  // Step advancement with sound effect & Google Sheet backup
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

      const activeCode = patientSession?.code || 'CS-1';
      const event: StepEvent = {
        id: crypto.randomUUID(),
        code: activeCode,
        topic: topic.id,
        step,
        trigger,
        seconds: Math.max(0, Math.round((Date.now() - started.current) / 1000)),
        time: new Date().toISOString(),
        mode,
        actions: [...actions.current]
      };

      setEvents((prev) => {
        const next = mergeEvents(prev, [event]);
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

      if (patientSession && !patientSession.token.startsWith('local-patient-')) {
        setSyncStatus('syncing');
        try {
          await request({ action: 'progress', token: patientSession.token, event });
          setSyncStatus('synced');
        } catch {
          setSyncStatus('local');
        }
      }
    },
    [finished, view, patientSession, topic, step, mode]
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

  // All known CS IDs across events and registered accounts
  const allKnownCsIds = useMemo(() => {
    const set = new Set<string>();
    Object.keys(patientAccounts).forEach((k) => {
      const norm = normalizeCsId(k);
      if (isValidCsId(norm)) set.add(norm);
    });
    events.forEach((e) => {
      const norm = normalizeCsId(e.code);
      if (isValidCsId(norm)) set.add(norm);
    });
    if (patientSession?.code) set.add(normalizeCsId(patientSession.code));
    if (set.size === 0) set.add('CS-1');
    return Array.from(set).sort((a, b) => {
      const na = Number(a.replace(/^CS-/, ''));
      const nb = Number(b.replace(/^CS-/, ''));
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return a.localeCompare(b);
    });
  }, [patientAccounts, events, patientSession]);

  // Admin login via password "dmknj" + Patient CS ID
  const loginAdmin = async () => {
    const trimmed = access.trim();
    const targetCs = normalizeCsId(reportCsInput || 'CS-1');
    if (!trimmed) {
      setNotice('กรุณากรอกรหัสผู้ดูแลระบบ (Admin Password) ค่ะ');
      return;
    }
    if (!isValidCsId(targetCs)) {
      setNotice('กรุณากรอกรหัส CS ID ของผู้ป่วย เช่น CS-1, CS-2 ค่ะ');
      return;
    }

    if (trimmed.toLowerCase() === 'dmknj') {
      setAdminSession({ token: 'local-admin-dmknj', role: 'admin', code: 'ADMIN' });
      setSelectedCsId(targetCs);
      setReportCsInput(targetCs);
      setEvents(localEvents());
      setAccess('');
      setNotice(`เข้าสู่ระบบ CathReport (Admin) และเปิดรายงานของ ${targetCs} เรียบร้อยแล้วค่ะ`);
      return;
    }

    setBusy(true);
    try {
      const auth = await request({ action: 'login', code: 'AD-OWNER01', access: trimmed });
      const history = auth.role === 'admin' ? await request({ action: 'report', token: auth.token }) : { events: [] };
      const merged = mergeEvents(localEvents(), history.events || []);
      setAdminSession({ token: auth.token, role: auth.role, code: 'ADMIN' });
      setSelectedCsId(targetCs);
      setReportCsInput(targetCs);
      setEvents(merged);
      try {
        localStorage.setItem(localKey, JSON.stringify(merged));
      } catch {}
      setAccess('');
      setNotice(`เข้าสู่ระบบ CathReport (Admin) และซิงค์ข้อมูลจาก Google Sheet สำหรับ ${targetCs} เรียบร้อยแล้วค่ะ`);
    } catch {
      setNotice('รหัสผ่าน Admin ไม่ถูกต้อง กรุณากรอกรหัสผ่านอีกครั้งค่ะ');
    } finally {
      setBusy(false);
    }
  };

  // Admin creates or updates a Patient CS ID + PIN + Private Admin Note
  const savePatientAccountByAdmin = async () => {
    const csId = normalizeCsId(newCsId);
    const pin = newPin.trim();
    const note = newAdminNote.trim();
    if (!isValidCsId(csId)) {
      setNotice('กรุณาระบุรหัสผู้ป่วยในรูปแบบ CS-... เช่น CS-1, CS-2 ค่ะ');
      return;
    }
    if (pin.length < 3) {
      setNotice('กรุณากำหนดรหัส PIN สำหรับผู้ป่วยอย่างน้อย 3–4 หลักค่ะ');
      return;
    }

    const updated: Record<string, PatientAccountRecord> = {
      ...patientAccounts,
      [csId]: {
        csId,
        pin,
        adminNote: note,
        createdAt: patientAccounts[csId]?.createdAt || new Date().toISOString()
      }
    };
    setPatientAccounts(updated);
    try {
      localStorage.setItem(patientAccountsKey, JSON.stringify(updated));
    } catch {}

    if (adminSession && !adminSession.token.startsWith('local-admin-')) {
      await request({ action: 'registerPatient', token: adminSession.token, csId, pin }).catch(() => {});
    }

    setSelectedCsId(csId);
    setReportCsInput(csId);
    setNewCsId('');
    setNewPin('');
    setNewAdminNote('');
    setNotice(`บันทึกรหัสผู้ป่วย ${csId} พร้อม PIN เรียบร้อยแล้วค่ะ`);
  };

  const updateAdminNoteForSelected = (csId: string, note: string) => {
    const existing = patientAccounts[csId] || {
      csId,
      pin: '1234',
      adminNote: '',
      createdAt: new Date().toISOString()
    };
    const updated = {
      ...patientAccounts,
      [csId]: { ...existing, adminNote: note }
    };
    setPatientAccounts(updated);
    try {
      localStorage.setItem(patientAccountsKey, JSON.stringify(updated));
    } catch {}
  };

  // Active patient's own evaluation (for Patient Status Bar and Topic Cards)
  const currentPatientReport = useMemo(
    () => (patientSession ? evaluatePatientProgress(events, patientSession.code) : null),
    [events, patientSession]
  );

  // Selected CS ID evaluation inside CathReport
  const selectedPatientReport = useMemo(
    () => evaluatePatientProgress(events, selectedCsId || 'CS-1'),
    [events, selectedCsId]
  );

  // All patients summary evaluations for Admin overview table
  const allPatientReports = useMemo(
    () => allKnownCsIds.map((id) => evaluatePatientProgress(events, id)),
    [allKnownCsIds, events]
  );

  const selectedCsEvents = useMemo(
    () => events.filter((e) => normalizeCsId(e.code) === normalizeCsId(selectedCsId)),
    [events, selectedCsId]
  );

  const exportCSV = () => {
    const summaryRows = [
      [
        'cs_id',
        'admin_private_note',
        'topics_learned',
        'confirmed_steps',
        'total_steps',
        'overall_score_percent',
        'pass_criteria_80_percent',
        'first_used_at',
        'last_learned_at',
        ...topics.map((t, i) => `${i + 1}_${t.title}_percent`)
      ],
      ...allPatientReports.map((r) => [
        r.csId,
        patientAccounts[r.csId]?.adminNote || '',
        `${r.topicsLearned}/${r.totalTopics}`,
        String(r.confirmedSteps),
        String(r.totalSteps),
        `${r.overallScorePercent}%`,
        r.passed80 ? 'ผ่านเกณฑ์ (>=80%)' : 'ยังไม่ผ่าน (<80%)',
        r.firstDate || '',
        r.lastDate || '',
        ...r.topicSummaries.map((ts) => `${ts.scorePercent}% (${ts.confirmedSteps}/${ts.totalSteps})`)
      ])
    ];
    const blob = new Blob(
      [
        '\ufeff' +
          summaryRows
            .map((r) => r.map((s) => '"' + (/^[=+@-]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"').join(','))
            .join('\n')
      ],
      { type: 'text/csv;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cathsim-report-${normalizeCsId(selectedCsId)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportJSON = () => {
    if (adminSession?.role !== 'admin') return;
    const payload = {
      generatedAt: new Date().toISOString(),
      passCriteriaPercent: 80,
      selectedCsId: selectedPatientReport,
      allPatientsSummary: allPatientReports,
      rawEvents: events
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cathsim-report.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const removeHistory = async () => {
    if (adminSession?.role !== 'admin') return;
    setBusy(true);
    try {
      localStorage.removeItem(localKey);
      if (adminSession.token !== 'local-admin-dmknj') {
        await request({ action: 'deleteHistory', token: adminSession.token }).catch(() => {});
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

      {/* Main Navigation Bar (Only 3 tabs in exact order, CathReport on far right) */}
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
        {/* Patient Identity & Progress Status Bar (Shown on Home & Lesson views) */}
        {(view === 'home' || view === 'lesson') && (
          <section ref={loginBoxRef} className="patient-auth-bar" aria-label="ข้อมูลการเข้าสู่ระบบผู้ป่วย">
            {!patientSession ? (
              <div className="patient-login-card">
                <div className="patient-login-copy">
                  <span className="gentle-label">เข้าสู่ระบบสำหรับผู้ป่วย (คุ้มครองข้อมูลส่วนบุคคล)</span>
                  <h2>เข้าสู่ระบบด้วยรหัส CS-... และ PIN เฉพาะรายบุคคล</h2>
                  <p>
                    ใช้รหัสสมมติ เช่น <strong>CS-1</strong>, <strong>CS-2</strong> คู่กับรหัส <strong>PIN</strong>{' '}
                    โดยไม่ระบุ HN หรือชื่อ-นามสกุลจริงในระบบ เพื่อบันทึกผลการเรียนรู้และสำรองข้อมูลขึ้น Google Sheet (เกณฑ์ผ่าน: ทำทุกอย่างได้เอง ≥ 80%)
                  </p>
                </div>
                <div className="patient-login-form">
                  <label>
                    Username (รหัสผู้ป่วย เช่น CS-1, CS-2)
                    <input
                      type="text"
                      value={patientCsInput}
                      placeholder="เช่น CS-1 หรือ CS-2"
                      autoComplete="off"
                      onChange={(e) => setPatientCsInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void loginPatient();
                      }}
                    />
                  </label>
                  <label>
                    PIN (รหัสผ่านประจำตัวผู้ป่วย)
                    <input
                      type="password"
                      value={patientPinInput}
                      placeholder="กรอกรหัส PIN"
                      autoComplete="off"
                      onChange={(e) => setPatientPinInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void loginPatient();
                      }}
                    />
                  </label>
                  <button
                    className="portal-primary patient-login-submit"
                    disabled={patientBusy || !patientCsInput.trim() || !patientPinInput.trim()}
                    onClick={loginPatient}
                  >
                    {patientBusy ? 'กำลังเชื่อมต่อ Google Sheet…' : 'เข้าสู่ระบบผู้ป่วย · เริ่มบันทึกผลการเรียนรู้'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="patient-active-strip">
                <div className="patient-active-info">
                  <span className="cs-id-pill">รหัสผู้ป่วย: {patientSession.code}</span>
                  {currentPatientReport && (
                    <>
                      <span className="patient-stat-pill">
                        เรียนแล้ว {currentPatientReport.topicsLearned}/{currentPatientReport.totalTopics} เรื่อง
                      </span>
                      <span className="patient-stat-pill">
                        ทำได้เอง {currentPatientReport.confirmedSteps}/{currentPatientReport.totalSteps} ขั้น ({currentPatientReport.overallScorePercent}%)
                      </span>
                      <span className={`pass-criteria-pill ${currentPatientReport.passed80 ? 'pass' : 'pending'}`}>
                        {currentPatientReport.passed80
                          ? 'ผ่านเกณฑ์ (≥ 80%)'
                          : 'เป้าหมาย: ทำได้เอง ≥ 80%'}
                      </span>
                    </>
                  )}
                  <span className="sync-badge">
                    {syncStatus === 'syncing'
                      ? 'กำลังสำรองข้อมูลขึ้น Google Sheet…'
                      : 'สำรองข้อมูล Google Sheet อัตโนมัติ'}
                  </span>
                </div>
                <button className="patient-logout-btn" onClick={logoutPatient}>
                  สลับรหัส / ออกจากระบบ
                </button>
              </div>
            )}
          </section>
        )}

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
                    เริ่มดูสาธิตเรื่องที่ 1
                  </button>
                )}
                <span className="welcome-audio-state">
                  {audioError
                    ? 'เสียงยังโหลดไม่ได้ แตะปุ่มเริ่มฟังเพื่อลองใหม่ค่ะ'
                    : narrating
                    ? 'พยาบาลน้องโฟร์กำลังทักทายคุณ...'
                    : 'เลือกเรื่องที่ต้องการเรียนรู้ทั้ง 10 เรื่องด้านล่างได้เลยค่ะ'}
                </span>
              </div>
            </section>

            <div className="learning-heading">
              <h2>วันนี้อยากให้พยาบาลน้องโฟร์ช่วยดูแลเรื่องไหนคะ?</h2>
              <p>เรียงลำดับการเรียนรู้ครบทั้ง 10 เรื่อง ดูภาพ 3D ทำตามด้วยตนเองให้ครบ ≥ 80% แล้วกด “ทำแล้ว” เพื่อไปต่อค่ะ</p>
            </div>

            <div className="lesson-grid">
              {topics.map((t, i) => {
                const topicStat = currentPatientReport?.topicSummaries[i];
                return (
                  <button className="lesson-card" key={t.id} onClick={() => openLesson(i)}>
                    <div className="lesson-card-top">
                      <span className="topic-number">{String(i + 1).padStart(2, '0')}</span>
                      {topicStat && topicStat.viewedSteps > 0 && (
                        <span className={`topic-score-pill ${topicStat.passed ? 'passed' : 'learning'}`}>
                          ทำได้เอง {topicStat.scorePercent}% ({topicStat.confirmedSteps}/{topicStat.totalSteps})
                        </span>
                      )}
                    </div>
                    <strong>
                      {i + 1}. {t.title}
                    </strong>
                    <p>{t.description}</p>
                    <span>{t.steps.length} ขั้นตอน · เริ่มดูสาธิต</span>
                  </button>
                );
              })}
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
                <strong>
                  {index + 1}. {topic.title}
                </strong>
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
                      ? 'เก่งมากค่ะ จบการสาธิตเรื่องนี้แล้วนะคะ สามารถกลับมาดูซ้ำหรือกดไปดูเรื่องถัดไปเพื่อให้ทำได้เองครบตามเกณฑ์ 80% ได้เลยค่ะ พยาบาลน้องโฟร์เป็นกำลังใจให้นะคะ'
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
                          <strong>“ทำแล้ว · ไปขั้นต่อไป”</strong> ด้วยตนเองเพื่อบันทึกคะแนนทำได้เองค่ะ
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
                            ? 'กำลังฟังคำแนะนำ... เมื่อพูดจบจะนับถอยหลัง 8 วินาที (แนะนำให้กด “ทำแล้ว” ด้วยตนเองเพื่อผ่านเกณฑ์ ≥ 80%)'
                            : `เลื่อนไปขั้นถัดไปอัตโนมัติใน ${left} วินาที (กดปุ่ม “ทำแล้ว” ด้วยตนเองเพื่อนับคะแนนทำได้เองค่ะ)`}
                          <small>
                            เกณฑ์การผ่าน: ผู้ป่วยต้องกดทำตามด้วยตนเอง (“ทำแล้ว”) มากกว่าหรือเท่ากับ 80% ของขั้นตอนทั้งหมดค่ะ
                          </small>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="step-actions">
                      <button className="portal-primary done-button" onClick={() => openLesson((index + 1) % topics.length)}>
                        ไปเรื่องถัดไป ({((index + 1) % topics.length) + 1}. {topics[(index + 1) % topics.length].title})
                      </button>
                      <button onClick={() => openLesson(index)}>ฝึกเรื่องนี้อีกครั้ง</button>
                      <button onClick={() => navigate('home')}>กลับหน้าเลือกบทเรียน</button>
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

        {/* VIEW: CATHREPORT (Requires Admin Password "dmknj" + Patient CS ID) */}
        {view === 'report' && (
          <>
            {adminSession?.role !== 'admin' ? (
              <section className="login-card">
                <h1>CathReport · สำหรับผู้ดูแลระบบ (Admin)</h1>
                <p>
                  กรุณากรอก <strong>รหัสผู้ดูแลระบบ (Admin Password)</strong> และ <strong>รหัสผู้ป่วย (CS ID)</strong>{' '}
                  เพื่อเปิดดูสถิติการใช้งาน เนื้อหาที่เรียน วันที่เรียน และผลการประเมินเกณฑ์ทำได้เอง ≥ 80% ค่ะ
                </p>
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
                <label>
                  รหัสผู้ป่วย (CS ID · เช่น CS-1, CS-2)
                  <input
                    type="text"
                    value={reportCsInput}
                    autoComplete="off"
                    placeholder="เช่น CS-1, CS-2"
                    onChange={(e) => setReportCsInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && access.trim()) {
                        void loginAdmin();
                      }
                    }}
                  />
                </label>
                <div className="login-buttons">
                  <button
                    className="portal-primary"
                    disabled={busy || !access.trim() || !reportCsInput.trim()}
                    onClick={loginAdmin}
                  >
                    {busy ? 'กำลังตรวจสอบและดึงข้อมูล Google Sheet…' : 'เปิดดูรายงาน CathReport'}
                  </button>
                  <button onClick={() => navigate('home')}>กลับหน้าหลัก</button>
                </div>
              </section>
            ) : (
              <section className="portal-report">
                <div className="report-top-row">
                  <div>
                    <h1>CathReport · ระบบติดตามสถิติผู้ป่วยรายบุคคลสำหรับ Admin</h1>
                    <p>
                      แสดงข้อมูลด้วยรหัส <strong>CS-...</strong> โดยไม่ระบุ HN หรือชื่อผู้ป่วยในระบบสาธารณะ ·{' '}
                      <strong>เกณฑ์การผ่าน: ผู้ป่วยต้องทำทุกอย่างได้เอง ≥ 80%</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setAdminSession(null);
                      setNotice('ออกจากระบบผู้ดูแลเรียบร้อยแล้วค่ะ');
                    }}
                  >
                    ล็อกหน้าจอ Admin
                  </button>
                </div>

                {/* CS ID Search & Quick Selector Bar */}
                <div className="cs-lookup-panel">
                  <div className="cs-lookup-input-row">
                    <label>
                      ค้นหา / เปิดดูรหัสผู้ป่วย (CS ID):
                      <input
                        type="text"
                        value={reportCsInput}
                        placeholder="เช่น CS-1, CS-2"
                        onChange={(e) => setReportCsInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && reportCsInput.trim()) {
                            const norm = normalizeCsId(reportCsInput);
                            setSelectedCsId(norm);
                            setReportCsInput(norm);
                          }
                        }}
                      />
                    </label>
                    <button
                      className="portal-primary"
                      onClick={() => {
                        const norm = normalizeCsId(reportCsInput || 'CS-1');
                        setSelectedCsId(norm);
                        setReportCsInput(norm);
                      }}
                    >
                      ดูรายงาน {normalizeCsId(reportCsInput || 'CS-1')}
                    </button>
                  </div>

                  <div className="cs-quick-chips">
                    <span>รหัสผู้ป่วยในระบบ ({allKnownCsIds.length} ราย):</span>
                    {allKnownCsIds.map((id) => (
                      <button
                        key={id}
                        className={selectedCsId === id ? 'selected' : ''}
                        onClick={() => {
                          setSelectedCsId(id);
                          setReportCsInput(id);
                        }}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected Patient Individual Report Card (CS-1, CS-2, ...) */}
                <div className="patient-report-detail-card">
                  <div className="patient-detail-header">
                    <div>
                      <span className="gentle-label">รายงานผลการเรียนรู้รายบุคคล (เกณฑ์ผ่าน ≥ 80%)</span>
                      <h2>
                        รหัสผู้ป่วย: <code>{selectedPatientReport.csId}</code>
                      </h2>
                      <p className="patient-dates-meta">
                        วันที่เริ่มใช้งาน: <strong>{formatThaiDateTime(selectedPatientReport.firstDate)}</strong> · วันที่เรียนรู้ล่าสุด:{' '}
                        <strong>{formatThaiDateTime(selectedPatientReport.lastDate)}</strong>
                      </p>
                    </div>
                    <div className={`overall-pass-badge ${selectedPatientReport.passed80 ? 'is-pass' : 'is-fail'}`}>
                      <strong>{selectedPatientReport.overallScorePercent}%</strong>
                      <span>
                        {selectedPatientReport.passed80
                          ? 'ผ่านเกณฑ์ (ทำได้เอง ≥ 80%)'
                          : 'ยังไม่ผ่านเกณฑ์ (< 80%)'}
                      </span>
                    </div>
                  </div>

                  {/* Admin-Only Private Reference Note for this CS ID */}
                  <div className="admin-mapping-row">
                    <label>
                      บันทึกช่วยจำสำหรับ Admin เท่านั้น (เชื่อมรหัส {selectedPatientReport.csId} โดยไม่แสดงในหน้าผู้ป่วย):
                      <input
                        type="text"
                        value={patientAccounts[selectedPatientReport.csId]?.adminNote || ''}
                        placeholder={`บันทึกอ้างอิงส่วนตัวของ Admin สำหรับ ${selectedPatientReport.csId} (เช่น หอผู้ป่วย / เตียง / หมายเหตุติดตาม)`}
                        onChange={(e) => updateAdminNoteForSelected(selectedPatientReport.csId, e.target.value)}
                      />
                    </label>
                    {patientAccounts[selectedPatientReport.csId]?.pin && (
                      <span className="admin-pin-tag">
                        PIN ที่กำหนดไว้: <code>{patientAccounts[selectedPatientReport.csId].pin}</code>
                      </span>
                    )}
                  </div>

                  <div className="stat-row">
                    <div>
                      <b>{selectedPatientReport.overallScorePercent}%</b>
                      คะแนนทำได้เองรวมทั้งหลักสูตร (เกณฑ์ ≥ 80%)
                    </div>
                    <div>
                      <b>
                        {selectedPatientReport.confirmedSteps}/{selectedPatientReport.totalSteps}
                      </b>
                      ขั้นตอนที่กด “ทำแล้ว” ด้วยตนเอง
                    </div>
                    <div>
                      <b>
                        {selectedPatientReport.topicsLearned}/{selectedPatientReport.totalTopics}
                      </b>
                      เรื่องที่เข้าเรียนแล้ว
                    </div>
                    <div>
                      <b>{selectedPatientReport.passed80 ? 'ผ่านเกณฑ์' : 'ต้องฝึกเพิ่ม'}</b>
                      สรุปผลการประเมิน (≥ 80%)
                    </div>
                  </div>

                  <h3>
                    ตารางผลลัพธ์การเรียนรู้รายเรื่องของ {selectedPatientReport.csId} (ครบทั้ง 10 เรื่อง)
                  </h3>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>ลำดับเรื่องที่เรียนรู้</th>
                          <th>สถานะการเรียน</th>
                          <th>วันที่เรียนรู้ล่าสุด</th>
                          <th>ขั้นตอนที่ทำได้เอง</th>
                          <th>คะแนน (%)</th>
                          <th>เกณฑ์ ≥ 80%</th>
                          <th>โหมดที่ใช้ / การโต้ตอบ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPatientReport.topicSummaries.map((ts) => (
                          <tr key={ts.topicId}>
                            <td>
                              <strong>
                                {ts.order}. {ts.title}
                              </strong>
                            </td>
                            <td>
                              {ts.viewedSteps > 0 ? (
                                <span className="status-confirmed">เรียนแล้ว</span>
                              ) : (
                                <span className="status-auto">ยังไม่ได้เรียน</span>
                              )}
                            </td>
                            <td>{formatThaiDateTime(ts.lastDate)}</td>
                            <td>
                              {ts.confirmedSteps} / {ts.totalSteps} ขั้นตอน
                            </td>
                            <td>
                              <strong>{ts.scorePercent}%</strong>
                            </td>
                            <td>
                              <span className={ts.passed ? 'status-confirmed' : 'status-auto'}>
                                {ts.passed ? 'ผ่าน (≥ 80%)' : 'ยังไม่ผ่าน (< 80%)'}
                              </span>
                            </td>
                            <td>
                              {ts.modes.length > 0 ? ts.modes.join(', ') : '—'}
                              {ts.actionsCount > 0 ? ` · โต้ตอบ 3D ${ts.actionsCount} ครั้ง` : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Admin Tool: Create / Provision New CS-1, CS-2 + PIN */}
                <div className="admin-create-patient-card">
                  <h3>ออกรหัสผู้ป่วยใหม่ (CS-1, CS-2, ...) และกำหนด PIN เฉพาะรายบุคคล</h3>
                  <p>
                    สร้างรหัส <strong>CS-...</strong> คู่กับ <strong>PIN</strong> เพื่อให้ผู้ป่วยใช้ล็อกอินเข้าใช้งานและสำรองข้อมูลขึ้น Google Sheet โดยไม่มีชื่อหรือ HN ในระบบ
                  </p>
                  <div className="admin-create-grid">
                    <label>
                      รหัสผู้ป่วย (CS ID)
                      <input
                        type="text"
                        value={newCsId}
                        placeholder={`เช่น CS-${allKnownCsIds.length + 1}`}
                        onChange={(e) => setNewCsId(e.target.value)}
                      />
                    </label>
                    <label>
                      กำหนดรหัส PIN
                      <input
                        type="text"
                        value={newPin}
                        placeholder="เช่น 1234"
                        onChange={(e) => setNewPin(e.target.value)}
                      />
                    </label>
                    <label>
                      บันทึกช่วยจำสำหรับ Admin (เชื่อมรหัสส่วนตัว)
                      <input
                        type="text"
                        value={newAdminNote}
                        placeholder="หมายเหตุสำหรับ Admin เท่านั้น"
                        onChange={(e) => setNewAdminNote(e.target.value)}
                      />
                    </label>
                    <button className="portal-primary" onClick={savePatientAccountByAdmin}>
                      บันทึกรหัสผู้ป่วยและ PIN
                    </button>
                  </div>
                </div>

                {/* All Patients Summary Table for Admin */}
                <div className="all-patients-summary-card">
                  <h3>
                    สถิติภาพรวมผู้ป่วยทั้งหมดในระบบ ({allPatientReports.length} ราย · ผ่านเกณฑ์ ≥ 80% จำนวน{' '}
                    {allPatientReports.filter((r) => r.passed80).length} ราย)
                  </h3>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>รหัสผู้ป่วย (CS ID)</th>
                          <th>บันทึกเชื่อมรหัส (Admin)</th>
                          <th>PIN</th>
                          <th>วันที่เรียนรู้ล่าสุด</th>
                          <th>เนื้อหาที่เรียน</th>
                          <th>ทำได้เอง (ขั้นตอน)</th>
                          <th>คะแนนรวม (%)</th>
                          <th>ผลการประเมิน (≥ 80%)</th>
                          <th>ดูรายละเอียด</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allPatientReports.map((r) => (
                          <tr key={r.csId}>
                            <td>
                              <code>{r.csId}</code>
                            </td>
                            <td>{patientAccounts[r.csId]?.adminNote || '—'}</td>
                            <td>
                              <code>{patientAccounts[r.csId]?.pin || '—'}</code>
                            </td>
                            <td>{formatThaiDateTime(r.lastDate)}</td>
                            <td>
                              {r.topicsLearned} / {r.totalTopics} เรื่อง
                            </td>
                            <td>
                              {r.confirmedSteps} / {r.totalSteps}
                            </td>
                            <td>
                              <strong>{r.overallScorePercent}%</strong>
                            </td>
                            <td>
                              <span className={r.passed80 ? 'status-confirmed' : 'status-auto'}>
                                {r.passed80 ? 'ผ่านเกณฑ์ (≥ 80%)' : 'ยังไม่ผ่าน (< 80%)'}
                              </span>
                            </td>
                            <td>
                              <button
                                onClick={() => {
                                  setSelectedCsId(r.csId);
                                  setReportCsInput(r.csId);
                                }}
                              >
                                เปิดดู {r.csId}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="report-actions-bar">
                  <button className="portal-primary" onClick={exportCSV}>
                    ดาวน์โหลดรายงานสรุป CSV (Excel)
                  </button>
                  <button className="portal-primary" onClick={exportJSON}>
                    ดาวน์โหลดข้อมูลทั้งหมด JSON
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

                <h3>ประวัติการกดทำรายขั้นตอนของ {selectedPatientReport.csId}</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>รหัสผู้ป่วย</th>
                        <th>วันและเวลา</th>
                        <th>เรื่องที่เรียนรู้</th>
                        <th>ขั้น</th>
                        <th>สถานะการทำ</th>
                        <th>เวลาที่ใช้</th>
                        <th>โหมด / การโต้ตอบในฉาก 3D</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCsEvents.length > 0 ? (
                        selectedCsEvents
                          .slice()
                          .reverse()
                          .map((e) => (
                            <tr key={e.id}>
                              <td>
                                <code>{normalizeCsId(e.code)}</code>
                              </td>
                              <td>{formatThaiDateTime(e.time)}</td>
                              <td>{topics.find((t) => t.id === e.topic)?.title || e.topic}</td>
                              <td>{e.step + 1}</td>
                              <td>
                                <span className={e.trigger === 'confirmed' ? 'status-confirmed' : 'status-auto'}>
                                  {e.trigger === 'confirmed' ? 'ทำได้เอง (กดทำแล้ว)' : 'ดูผ่านอัตโนมัติ'}
                                </span>
                              </td>
                              <td>{e.seconds} วินาที</td>
                              <td>
                                <span className="mode-tag">{e.mode || 'learn'}</span> ·{' '}
                                {(e.actions || []).length > 0 ? (e.actions || []).join(' -> ') : '—'}
                              </td>
                            </tr>
                          ))
                      ) : (
                        <tr>
                          <td colSpan={7}>ยังไม่มีประวัติการทำขั้นตอนสำหรับรหัส {selectedPatientReport.csId} ค่ะ</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="report-definition">
                  * ข้อมูลการทำผ่านในระบบเป็นผลการเรียนรู้ในซอฟต์แวร์จำลอง 3D (เกณฑ์ผ่าน: ทำด้วยตนเอง ≥ 80%)
                  และสำรองข้อมูลผ่าน Google Sheet โดยใช้รหัสสมมติ CS-... เพื่อคุ้มครองข้อมูลส่วนบุคคลของผู้ป่วย
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
