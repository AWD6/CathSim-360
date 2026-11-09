import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sources } from './curriculum';
import {
  topics,
  countdownTick,
  normalizeCsId,
  isValidCsId,
  nextAvailableCsId,
  evaluatePatientProgress,
  checkAdminLockout,
  evaluateAdminPasswordAttempt,
  formatLockoutRemaining,
  ADMIN_MAX_WRONG_ATTEMPTS,
  type AdminLockState,
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
  username?: string;
};

type PatientAccountRecord = {
  csId: string;
  username: string;
  pin: string;
  createdAt: string;
};

type ConfidentialPatientLink = {
  csId: string;
  hn: string;
  fullName: string;
  updatedAt: string;
};

export type SpeechSpeed = 'slowest' | 'slow' | 'normal';

const endpoint =
  import.meta.env.VITE_REPORT_API_URL ||
  'https://script.google.com/macros/s/AKfycbwC6UwfNGzje7aW0EbOTXVEmOoI1l2vNko_PeBXfwurUGFXoAPiYlGA9NI4DT5tk38eBw/exec';

const localKey = 'cathsim:guided-events:v4';
const patientAccountsKey = 'cathsim:patient-accounts:v2';
const confidentialLinksKey = 'cathsim:admin-confidential-links:v1';
const adminLockStorageKey = 'cathsim:admin-lock:v1';
const media = (name: string) => `${import.meta.env.BASE_URL}media/${name}?v=8`;

async function request(body: object, timeoutMs = 8000) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
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

function loadPatientAccounts(): Record<string, PatientAccountRecord> {
  try {
    const raw = JSON.parse(localStorage.getItem(patientAccountsKey) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function loadConfidentialLinks(): Record<string, ConfidentialPatientLink> {
  try {
    const raw = JSON.parse(localStorage.getItem(confidentialLinksKey) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function loadAdminLockState(): AdminLockState {
  try {
    const raw = JSON.parse(localStorage.getItem(adminLockStorageKey) || 'null');
    if (raw && typeof raw.failedAttempts === 'number' && typeof raw.lockUntil === 'number') {
      return raw;
    }
    return { failedAttempts: 0, lockUntil: 0 };
  } catch {
    return { failedAttempts: 0, lockUntil: 0 };
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

// Minimal line icons used inside login fields (no emoji)
function AuthIcon({ name }: { name: 'user' | 'lock' | 'id' | 'shield' | 'check' }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'user':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case 'id':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="12" r="2" />
          <path d="M14 10h4M14 14h3" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      );
  }
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

  // Mandatory Login Gate State (Forces login first for both User and Admin on open)
  const [loginRoleTab, setLoginRoleTab] = useState<'patient' | 'admin'>('patient');
  const [patientAuthMode, setPatientAuthMode] = useState<'login' | 'register'>('login');
  const [loginIdMode, setLoginIdMode] = useState<'csId' | 'username'>('csId');
  const [patientNumberInput, setPatientNumberInput] = useState('');

  // Patient Session & Credentials
  const [patientSession, setPatientSession] = useState<Session | null>(null);
  const [patientUsernameInput, setPatientUsernameInput] = useState('');
  const [patientPinInput, setPatientPinInput] = useState('');
  const [patientBusy, setPatientBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'local'>('idle');

  // Admin Session, Lockout (>2 wrong attempts -> 15 min lock), and CS ID Lookup
  const [adminSession, setAdminSession] = useState<Session | null>(null);
  const [access, setAccess] = useState('');
  const [reportCsInput, setReportCsInput] = useState('CS-1');
  const [selectedCsId, setSelectedCsId] = useState('CS-1');
  const [busy, setBusy] = useState(false);
  const [adminLockState, setAdminLockState] = useState<AdminLockState>(loadAdminLockState);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Patient Account Registry (CS-1, CS-2, ... + Username + PIN)
  const [patientAccounts, setPatientAccounts] = useState<Record<string, PatientAccountRecord>>(loadPatientAccounts);

  // Admin-Only Confidential Link Registry (CS ID -> HN + ชื่อ - นามสกุล)
  const [confidentialLinks, setConfidentialLinks] = useState<Record<string, ConfidentialPatientLink>>(loadConfidentialLinks);
  const [linkCsIdInput, setLinkCsIdInput] = useState('CS-1');
  const [linkHnInput, setLinkHnInput] = useState('');
  const [linkFullNameInput, setLinkFullNameInput] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  // Search filter for Patient CS ID ↔ HN Directory
  const [directorySearch, setDirectorySearch] = useState('');

  // Nurse Nong Four Speech Speed ('slowest' = 0.65x, 'slow' = 0.8x, 'normal' = 1.0x)
  const [speechSpeed, setSpeechSpeed] = useState<SpeechSpeed>(() => {
    try {
      const saved = localStorage.getItem('cathsim:speech-speed');
      if (saved === 'slowest' || saved === 'slow' || saved === 'normal') return saved;
    } catch {}
    return 'normal';
  });

  const speechPlaybackRate = speechSpeed === 'slowest' ? 0.65 : speechSpeed === 'slow' ? 0.8 : 1.0;

  const [mode, setMode] = useState<LearningMode>('learn');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const actions = useRef<string[]>([]);
  const audio = useRef<HTMLAudioElement>(null);
  const started = useRef(Date.now());
  const transitionLock = useRef(false);
  const generation = useRef(0);

  // Whether the user has authenticated as either Patient or Admin
  const isAuthenticated = Boolean(patientSession || adminSession);

  // Live 1-second timer while Admin lockout is active
  const adminLockCheck = useMemo(() => checkAdminLockout(adminLockState, nowTick), [adminLockState, nowTick]);

  useEffect(() => {
    if (!adminLockCheck.locked) return;
    const timer = setInterval(() => {
      const currentNow = Date.now();
      setNowTick(currentNow);
      const status = checkAdminLockout(adminLockState, currentNow);
      if (!status.locked && adminLockState.lockUntil > 0) {
        const cleared = { failedAttempts: 0, lockUntil: 0 };
        setAdminLockState(cleared);
        try {
          localStorage.setItem(adminLockStorageKey, JSON.stringify(cleared));
        } catch {}
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [adminLockCheck.locked, adminLockState]);

  // Keep link inputs synced when selectedCsId changes
  useEffect(() => {
    const norm = normalizeCsId(selectedCsId || 'CS-1');
    setLinkCsIdInput(norm);
    const existingLink = confidentialLinks[norm];
    setLinkHnInput(existingLink?.hn || '');
    setLinkFullNameInput(existingLink?.fullName || '');
  }, [selectedCsId, confidentialLinks]);

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

  // Only play voice clips after authenticated into Home or Lesson
  const clip = !isAuthenticated
    ? null
    : view === 'lesson'
    ? finished
      ? 'complete'
      : mode === 'challenge'
      ? `challenge-${topic.id}-${step}`
      : `${topic.id}-${step}`
    : view === 'home' && patientSession
    ? 'welcome'
    : null;

  const autoAdvance = mode === 'practice';

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view, index, isAuthenticated]);

  // Synchronize audio playbackRate in real time when speechSpeed changes
  useEffect(() => {
    try {
      localStorage.setItem('cathsim:speech-speed', speechSpeed);
    } catch {}
    if (audio.current) {
      audio.current.playbackRate = speechPlaybackRate;
    }
  }, [speechSpeed, speechPlaybackRate]);

  const play = useCallback(() => {
    musicEnabled(true);
    startSound();
    const a = audio.current;
    if (!a) return;
    a.playbackRate = speechPlaybackRate;
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
  }, [speechPlaybackRate]);

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
    a.playbackRate = speechPlaybackRate;
    a.play()
      .then(() => {
        if (gen === generation.current) {
          a.playbackRate = speechPlaybackRate;
          setNarrating(true);
        }
      })
      .catch(() => {
        if (gen === generation.current) setNeedsStart(true);
      });

    return () => {
      a.pause();
    };
  }, [clip, speechPlaybackRate]);

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

  // All known CS IDs across events, registered accounts, and confidential links
  const allKnownCsIds = useMemo(() => {
    const set = new Set<string>();
    Object.keys(patientAccounts).forEach((k) => {
      const norm = normalizeCsId(k);
      if (isValidCsId(norm)) set.add(norm);
    });
    Object.keys(confidentialLinks).forEach((k) => {
      const norm = normalizeCsId(k);
      if (isValidCsId(norm)) set.add(norm);
    });
    events.forEach((e) => {
      const norm = normalizeCsId(e.code);
      if (isValidCsId(norm)) set.add(norm);
    });
    if (patientSession?.code) set.add(normalizeCsId(patientSession.code));
    return Array.from(set).sort((a, b) => {
      const na = Number(a.replace(/^CS-/, ''));
      const nb = Number(b.replace(/^CS-/, ''));
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return a.localeCompare(b);
    });
  }, [patientAccounts, confidentialLinks, events, patientSession]);

  // Preview of the next auto-generated CS-... code for new patient registration
  const nextAutoCsId = useMemo(() => nextAvailableCsId(allKnownCsIds), [allKnownCsIds]);

  // Patient Registration Handler: Patient chooses Username & PIN -> Auto-assigns CS-... and saves to Google Sheet
  const registerPatientAccount = async () => {
    const rawUser = patientUsernameInput.trim();
    const pin = patientPinInput.trim();
    if (rawUser.length < 2) {
      setNotice('กรุณากำหนดชื่อบัญชีผู้ใช้ (Username) อย่างน้อย 2 ตัวอักษรค่ะ');
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setNotice('กรุณากำหนดรหัส PIN เป็นตัวเลข 6 หลักค่ะ (เช่น 123456)');
      return;
    }

    // Check if username already exists locally
    const existingLocal = Object.values(patientAccounts).find(
      (acc) => acc.username.toLowerCase() === rawUser.toLowerCase()
    );
    if (existingLocal) {
      setNotice('ชื่อบัญชีนี้มีอยู่ในระบบแล้วค่ะ สามารถเข้าสู่ระบบด้วยชื่อนี้และรหัส PIN ได้เลยค่ะ');
      return;
    }

    setPatientBusy(true);
    setSyncStatus('syncing');

    let assignedCsId = nextAutoCsId;
    let token = `local-patient-${assignedCsId}`;
    let isRemoteSynced = false;

    try {
      const res = await request({ action: 'patientRegister', username: rawUser, access: pin }, 5000);
      if (res && res.ok) {
        assignedCsId = normalizeCsId(res.code || assignedCsId);
        token = res.token || token;
        isRemoteSynced = true;
      }
    } catch {
      // Remote unavailable or pending GAS deployment: proceed locally without blocking
      isRemoteSynced = false;
    }

    const sess: Session = { token, role: 'patient', code: assignedCsId, username: rawUser };
    setPatientSession(sess);

    const nextAccounts: Record<string, PatientAccountRecord> = {
      ...patientAccounts,
      [assignedCsId]: {
        csId: assignedCsId,
        username: rawUser,
        pin,
        createdAt: new Date().toISOString()
      }
    };
    setPatientAccounts(nextAccounts);
    try {
      localStorage.setItem(patientAccountsKey, JSON.stringify(nextAccounts));
    } catch {}

    setSyncStatus(isRemoteSynced ? 'synced' : 'local');
    setPatientPinInput('');
    setPatientUsernameInput('');
    setReportCsInput(assignedCsId);
    setSelectedCsId(assignedCsId);
    setView('home');
    setNotice(
      isRemoteSynced
        ? `สมัครบัญชีสำเร็จ! รหัสผู้ป่วยของคุณคือ ${assignedCsId} (บันทึกข้อมูลเข้า Google Sheet เรียบร้อยแล้วค่ะ)`
        : `สมัครบัญชีสำเร็จ! รหัสผู้ป่วยของคุณคือ ${assignedCsId} ค่ะ (พร้อมใช้งานทันที)`
    );
    setPatientBusy(false);
  };

  // Patient Login Handler: Login with Username or CS-ID + 6-digit PIN
  const loginPatient = async () => {
    const targetCode = loginIdMode === 'csId'
      ? (patientNumberInput.trim() ? (patientNumberInput.trim().toUpperCase().startsWith('CS-') ? patientNumberInput.trim().toUpperCase() : `CS-${patientNumberInput.trim().replace(/\D/g, '')}`) : '')
      : patientUsernameInput.trim();
    const pin = patientPinInput.trim();

    if (!targetCode) {
      setNotice(loginIdMode === 'csId' ? 'กรุณากรอกหมายเลขรหัสผู้ป่วย (เช่น 1, 2) ค่ะ' : 'กรุณากรอกชื่อบัญชีผู้ใช้ (Username) ค่ะ');
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setNotice('กรุณากรอกรหัส PIN เป็นตัวเลข 6 หลักค่ะ');
      return;
    }

    // Find matching local account by Username or CS ID
    const matchedLocal = Object.values(patientAccounts).find(
      (acc) =>
        acc.username.toLowerCase() === targetCode.toLowerCase() ||
        acc.csId.toLowerCase() === targetCode.toLowerCase() ||
        acc.csId.toLowerCase() === normalizeCsId(targetCode).toLowerCase()
    );

    // If account exists locally, verify PIN
    if (matchedLocal && matchedLocal.pin !== pin) {
      setNotice('รหัส PIN ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้งค่ะ');
      return;
    }

    setPatientBusy(true);
    setSyncStatus('syncing');

    let finalCsId = matchedLocal ? matchedLocal.csId : normalizeCsId(targetCode);
    let finalUsername = matchedLocal ? matchedLocal.username : (loginIdMode === 'username' ? targetCode : finalCsId);
    let sessionToken = matchedLocal ? `local-patient-${finalCsId}` : `local-patient-${finalCsId}`;
    let isRemoteSynced = false;

    try {
      const res = await request({ action: 'patientLogin', code: targetCode, access: pin }, 5000);
      if (res && res.ok) {
        finalCsId = normalizeCsId(res.code || targetCode);
        finalUsername = res.username || matchedLocal?.username || finalUsername;
        sessionToken = res.token || sessionToken;
        isRemoteSynced = true;

        if (Array.isArray(res.events) && res.events.length > 0) {
          setEvents((prev) => {
            const merged = mergeEvents(prev, res.events);
            try {
              localStorage.setItem(localKey, JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      }
    } catch {
      // Remote unavailable or pending GAS update: proceed locally with zero lockout
      isRemoteSynced = false;
    }

    const sess: Session = { token: sessionToken, role: 'patient', code: finalCsId, username: finalUsername };
    setPatientSession(sess);

    const nextAccounts: Record<string, PatientAccountRecord> = {
      ...patientAccounts,
      [finalCsId]: {
        csId: finalCsId,
        username: finalUsername,
        pin,
        createdAt: matchedLocal?.createdAt || new Date().toISOString()
      }
    };
    setPatientAccounts(nextAccounts);
    try {
      localStorage.setItem(patientAccountsKey, JSON.stringify(nextAccounts));
    } catch {}

    setSyncStatus(isRemoteSynced ? 'synced' : 'local');
    setPatientPinInput('');
    setPatientNumberInput('');
    setPatientUsernameInput('');
    setReportCsInput(finalCsId);
    setSelectedCsId(finalCsId);
    setView('home');
    setNotice(
      isRemoteSynced
        ? `เข้าสู่ระบบสำเร็จ! รหัสผู้ป่วยของคุณคือ ${finalCsId} ค่ะ`
        : `เข้าสู่ระบบสำเร็จ! รหัสผู้ป่วยของคุณคือ ${finalCsId} ค่ะ (พร้อมใช้งานทันที)`
    );
    setPatientBusy(false);
  };

  const logoutAll = () => {
    audio.current?.pause();
    setPatientSession(null);
    setAdminSession(null);
    setSyncStatus('idle');
    setView('home');
    setNotice('ออกจากระบบเรียบร้อยแล้วค่ะ กรุณาเข้าสู่ระบบก่อนใช้งาน');
  };

  const openLesson = (i: number) => {
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
    if (!isAuthenticated) {
      if (v === 'report') {
        setLoginRoleTab('admin');
      } else {
        setLoginRoleTab('patient');
      }
      return;
    }
    setView(v);
    setPaused(false);
  };

  // Admin Login Handler: Requires password "dmknj" + CS ID; wrong > 2 times locks system for 15 minutes
  const loginAdmin = async () => {
    const now = Date.now();
    setNowTick(now);
    const currentCheck = checkAdminLockout(adminLockState, now);
    if (currentCheck.locked) {
      setNotice(
        `กรอกรหัส admin ผิดเกิน ${ADMIN_MAX_WRONG_ATTEMPTS} ครั้ง ระบบถูกล็อค 15 นาที (เหลือเวลา ${formatLockoutRemaining(
          currentCheck.remainingSeconds
        )} นาที)`
      );
      return;
    }

    const trimmed = access.trim();
    const targetCs = normalizeCsId(reportCsInput || 'CS-1');
    if (!trimmed) {
      setNotice('กรุณากรอกรหัส admin ค่ะ');
      return;
    }
    if (!isValidCsId(targetCs)) {
      setNotice('กรุณากรอกรหัส CS ID ของผู้ป่วย เช่น CS-1, CS-2 ค่ะ');
      return;
    }

    const isDmknj = trimmed.toLowerCase() === 'dmknj';
    if (isDmknj) {
      const attemptResult = evaluateAdminPasswordAttempt(adminLockState, true, now);
      setAdminLockState(attemptResult.state);
      try {
        localStorage.setItem(adminLockStorageKey, JSON.stringify(attemptResult.state));
      } catch {}

      setAdminSession({ token: 'local-admin-dmknj', role: 'admin', code: 'ADMIN' });
      setSelectedCsId(targetCs);
      setReportCsInput(targetCs);
      setLinkCsIdInput(targetCs);
      setEvents(localEvents());
      setAccess('');
      setView('report');
      setNotice(`เข้าสู่ระบบสำหรับ admin และเปิดดูข้อมูลของ ${targetCs} เรียบร้อยแล้วค่ะ`);
      return;
    }

    // Wrong password attempt -> evaluate lockout (> 2 wrong attempts locks for 15 minutes)
    const wrongResult = evaluateAdminPasswordAttempt(adminLockState, false, now);
    setAdminLockState(wrongResult.state);
    setNowTick(now);
    try {
      localStorage.setItem(adminLockStorageKey, JSON.stringify(wrongResult.state));
    } catch {}
    setAccess('');

    if (wrongResult.locked) {
      setNotice(
        `กรอกรหัส admin ผิดเกิน ${ADMIN_MAX_WRONG_ATTEMPTS} ครั้ง ระบบถูกล็อคเป็นเวลา 15 นาที (เหลือเวลา ${formatLockoutRemaining(
          wrongResult.remainingSeconds
        )} นาที)`
      );
    } else {
      setNotice(
        `รหัส admin ไม่ถูกต้อง (ผิดครั้งที่ ${wrongResult.state.failedAttempts}/${ADMIN_MAX_WRONG_ATTEMPTS}) หากผิดเกิน ${ADMIN_MAX_WRONG_ATTEMPTS} ครั้ง ระบบจะล็อค 15 นาทีค่ะ`
      );
    }
  };

  // Admin Confidential Identity Linking: CS ID -> HN + ชื่อ - นามสกุล (Saved confidentially to Google Sheet, never published)
  const saveConfidentialLink = async () => {
    const csId = normalizeCsId(linkCsIdInput);
    const hn = linkHnInput.trim();
    const fullName = linkFullNameInput.trim();
    if (!isValidCsId(csId)) {
      setNotice('กรุณากรอกรหัส CS ID ในรูปแบบ CS-... เช่น CS-1, CS-2 ค่ะ');
      return;
    }
    if (!hn) {
      setNotice('กรุณากรอก HN ของผู้ป่วยค่ะ');
      return;
    }
    if (!fullName) {
      setNotice('กรุณากรอก ชื่อ - นามสกุล ของผู้ป่วยค่ะ');
      return;
    }

    setLinkBusy(true);
    try {
      const updated: Record<string, ConfidentialPatientLink> = {
        ...confidentialLinks,
        [csId]: {
          csId,
          hn,
          fullName,
          updatedAt: new Date().toISOString()
        }
      };
      setConfidentialLinks(updated);
      try {
        localStorage.setItem(confidentialLinksKey, JSON.stringify(updated));
      } catch {}

      if (adminSession && !adminSession.token.startsWith('local-admin-')) {
        await request({
          action: 'linkPatientIdentity',
          token: adminSession.token,
          csId,
          hn,
          fullName
        }).catch(() => {});
      }

      setSelectedCsId(csId);
      setReportCsInput(csId);
      setNotice(
        `เชื่อมโยงรหัส ${csId} กับข้อมูล HN และ ชื่อ - นามสกุล เก็บเป็นความลับไว้ที่ Google Sheet เรียบร้อยแล้วค่ะ (ห้ามเผยแพร่)`
      );
    } finally {
      setLinkBusy(false);
    }
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
  const allPatientReports = useMemo(() => {
    const ids = allKnownCsIds.length > 0 ? allKnownCsIds : ['CS-1'];
    return ids.map((id) => evaluatePatientProgress(events, id));
  }, [allKnownCsIds, events]);

  // Dedicated Patient Directory combining accounts, progress evaluations, and confidential identity links
  const patientDirectoryList = useMemo(() => {
    const allCsSet = new Set<string>();
    allKnownCsIds.forEach((id) => allCsSet.add(id));
    Object.keys(confidentialLinks).forEach((id) => allCsSet.add(id));
    Object.keys(patientAccounts).forEach((id) => allCsSet.add(id));
    if (allCsSet.size === 0) allCsSet.add('CS-1');

    const list = Array.from(allCsSet).map((csId) => {
      const rep = allPatientReports.find((r) => r.csId === csId);
      const conf = confidentialLinks[csId];
      const acc = patientAccounts[csId];
      const isLinked = Boolean(conf && conf.hn && conf.fullName);
      return {
        csId,
        username: acc?.username || '—',
        hn: conf?.hn || '',
        fullName: conf?.fullName || '',
        updatedAt: conf?.updatedAt || rep?.lastDate || '',
        lastDate: rep?.lastDate || '',
        scorePercent: rep?.overallScorePercent ?? 0,
        passed80: rep?.passed80 ?? false,
        topicsLearned: rep?.topicsLearned ?? 0,
        confirmedSteps: rep?.confirmedSteps ?? 0,
        isLinked
      };
    });

    list.sort((a, b) => {
      const numA = parseInt(a.csId.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.csId.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    return list;
  }, [allKnownCsIds, allPatientReports, confidentialLinks, patientAccounts]);

  // Filtered Patient Directory by search query
  const filteredDirectory = useMemo(() => {
    const q = directorySearch.trim().toLowerCase();
    if (!q) return patientDirectoryList;
    return patientDirectoryList.filter((item) => {
      return (
        item.csId.toLowerCase().includes(q) ||
        item.username.toLowerCase().includes(q) ||
        item.hn.toLowerCase().includes(q) ||
        item.fullName.toLowerCase().includes(q)
      );
    });
  }, [patientDirectoryList, directorySearch]);

  const selectedCsEvents = useMemo(
    () => events.filter((e) => normalizeCsId(e.code) === normalizeCsId(selectedCsId)),
    [events, selectedCsId]
  );

  const exportCSV = () => {
    const summaryRows = [
      [
        'cs_id',
        'username',
        'confidential_hn',
        'confidential_full_name',
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
        patientAccounts[r.csId]?.username || r.csId,
        confidentialLinks[r.csId]?.hn || '',
        confidentialLinks[r.csId]?.fullName || '',
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
    a.download = `cathsim-confidential-report-${normalizeCsId(selectedCsId)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportJSON = () => {
    if (adminSession?.role !== 'admin') return;
    const payload = {
      generatedAt: new Date().toISOString(),
      confidentialNotice: 'CONFIDENTIAL_ADMIN_ONLY_DO_NOT_PUBLISH',
      passCriteriaPercent: 80,
      selectedCsId: selectedPatientReport,
      confidentialIdentityLinks: confidentialLinks,
      allPatientsSummary: allPatientReports,
      rawEvents: events
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cathsim-confidential-report.json';
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

  // Reusable Admin Login Form (Used both in Mandatory Login Gate and CathReport tab)
  const renderAdminLoginForm = () => (
    <div className="admin-auth-panel">
      <div className="auth-heading">
        <h2>เข้าสู่ระบบสำหรับ admin</h2>
        <p className="auth-subtext">กรอกรหัส admin และ CS ID เพื่อดูข้อมูลผู้ป่วยรายบุคคล</p>
      </div>

      {adminLockCheck.locked && (
        <div className="admin-lockout-banner" role="alert">
          <strong>ระบบถูกล็อคชั่วคราว 15 นาที</strong>
          <span>
            คุณกรอกรหัส admin ผิดเกิน {ADMIN_MAX_WRONG_ATTEMPTS} ครั้ง กรุณารออีก{' '}
            <code>{formatLockoutRemaining(adminLockCheck.remainingSeconds)}</code> นาที จึงจะสามารถลองใหม่ได้ค่ะ
          </span>
        </div>
      )}

      {!adminLockCheck.locked && adminLockState.failedAttempts > 0 && (
        <div className="admin-warning-banner" role="status">
          รหัส admin ไม่ถูกต้อง ({adminLockState.failedAttempts}/{ADMIN_MAX_WRONG_ATTEMPTS} ครั้ง) · หากผิดเกิน{' '}
          {ADMIN_MAX_WRONG_ATTEMPTS} ครั้ง ระบบจะล็อค 15 นาที
        </div>
      )}

      <div className="auth-fields-stack">
        <label className="auth-field">
          <span className="auth-label">รหัส admin</span>
          <span className="auth-input-wrap">
          <AuthIcon name="lock" />
          <input
            type="password"
            value={access}
            disabled={adminLockCheck.locked}
            autoComplete="off"
            placeholder="กรอกรหัส admin"
            onChange={(e) => setAccess(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !adminLockCheck.locked) {
                void loginAdmin();
              }
            }}
          />
          </span>
        </label>
        <label className="auth-field">
          <span className="auth-label">CS ID ของผู้ป่วย</span>
          <span className="auth-input-wrap">
          <AuthIcon name="id" />
          <input
            type="text"
            value={reportCsInput}
            disabled={adminLockCheck.locked}
            autoComplete="off"
            placeholder="เช่น CS-1, CS-2"
            onChange={(e) => setReportCsInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !adminLockCheck.locked) {
                void loginAdmin();
              }
            }}
          />
          </span>
        </label>
        <button
          className="portal-primary auth-submit-btn"
          disabled={busy || adminLockCheck.locked || !access.trim() || !reportCsInput.trim()}
          onClick={loginAdmin}
        >
          {adminLockCheck.locked
            ? `ระบบถูกล็อค (${formatLockoutRemaining(adminLockCheck.remainingSeconds)})`
            : busy
            ? 'กำลังตรวจสอบ…'
            : 'เข้าสู่ระบบ'}
        </button>
      </div>
      <p className="auth-footnote">
        <AuthIcon name="shield" />
        ข้อมูล HN และชื่อ-นามสกุล เก็บเป็นความลับใน Google Sheet เฉพาะ admin
      </p>
    </div>
  );

  return (
    <div className="portal guided-app">
      {/* Hidden Audio Element for Nurse Nong Four Voice Clips */}
      <audio
        ref={audio}
        preload="auto"
        onLoadedMetadata={() => {
          if (audio.current) {
            audio.current.playbackRate = speechPlaybackRate;
          }
        }}
        onEnded={() => {
          setNarrating(false);
          setReady(true);
          setLeft(8);
        }}
        onPlay={() => {
          if (audio.current) {
            audio.current.playbackRate = speechPlaybackRate;
          }
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

      {/* Minimalist Header */}
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

      {/* Main Navigation Bar */}
      <nav className="portal-nav" role="navigation" aria-label="เมนูหลัก">
        <div className="nav-left-group">
          <button
            className={isAuthenticated && (view === 'home' || view === 'lesson') ? 'active-nav' : ''}
            onClick={() => navigate('home')}
          >
            ดูสาธิตและทำไปด้วยกัน
          </button>
          <button
            className={isAuthenticated && view === 'sources' ? 'active-nav' : ''}
            onClick={() => navigate('sources')}
          >
            แหล่งอ้างอิงและแนวทางดูแล
          </button>
        </div>
        <div className="nav-right-group">
          <button
            className={(isAuthenticated && view === 'report') || (!isAuthenticated && loginRoleTab === 'admin') ? 'active-nav' : ''}
            onClick={() => navigate('report')}
          >
            CathReport
          </button>
        </div>
      </nav>

      {/* Application Content Shell */}
      <main className="portal-main">
        {/* Global Notice Toast */}
        {notice && (
          <div className="portal-notice" role="status">
            <span>{notice}</span>
            <button onClick={() => setNotice('')}>ปิด</button>
          </div>
        )}

        {/* MANDATORY LOGIN GATE: Shown first whenever user is not logged in */}
        {!isAuthenticated ? (
          <section className="mandatory-login-gate" aria-label="เข้าสู่ระบบก่อนใช้งาน">
            <div className="login-shell">
              {/* Left: brand / welcome panel */}
              <aside className="login-aside">
                <div className="login-aside-brand">
                  <CatheterLogo />
                  <div>
                    <strong>
                      CathSim <em>360</em>
                    </strong>
                    <span>ดูแลสายสวนปัสสาวะอย่างมั่นใจ</span>
                  </div>
                </div>
                <h1 className="login-aside-title">ยินดีต้อนรับค่ะ</h1>
                <p className="login-aside-text">
                  เรียนรู้การดูแลสายสวนปัสสาวะที่บ้าน ทีละขั้นตอน พร้อมพยาบาลน้องโฟร์
                </p>
                <ul className="login-aside-points">
                  <li>
                    <AuthIcon name="check" />
                    ดูสาธิต 3 มิติ และทำไปพร้อมกัน
                  </li>
                  <li>
                    <AuthIcon name="check" />
                    ติดตามความก้าวหน้าและบันทึกการเรียนรู้
                  </li>
                  <li>
                    <AuthIcon name="shield" />
                    ใช้รหัส CS แทนชื่อจริง ข้อมูลเป็นความลับ
                  </li>
                </ul>
              </aside>

              {/* Right: form card */}
              <div className="login-card-panel">
                <div className="login-role-switcher" role="tablist" aria-label="เลือกประเภทการเข้าสู่ระบบ">
                  <button
                    role="tab"
                    aria-selected={loginRoleTab === 'patient'}
                    className={loginRoleTab === 'patient' ? 'active-role-tab' : ''}
                    onClick={() => setLoginRoleTab('patient')}
                  >
                    ผู้ป่วย
                  </button>
                  <button
                    role="tab"
                    aria-selected={loginRoleTab === 'admin'}
                    className={loginRoleTab === 'admin' ? 'active-role-tab' : ''}
                    onClick={() => setLoginRoleTab('admin')}
                  >
                    admin
                  </button>
                </div>

                {loginRoleTab === 'patient' ? (
                  <div className="patient-auth-panel">
                    <div className="auth-heading">
                      <h2>{patientAuthMode === 'login' ? 'เข้าสู่ระบบสำหรับผู้ป่วย' : 'สมัครบัญชีผู้ป่วย'}</h2>
                      <p className="patient-auth-subtitle">
                        {patientAuthMode === 'login'
                          ? 'เข้าสู่ระบบด้วยรหัส CS หรือชื่อบัญชี และ PIN 6 หลัก'
                          : 'ตั้งชื่อบัญชีและ PIN 6 หลักของคุณเอง'}
                      </p>
                    </div>

                    {patientAuthMode === 'login' ? (
                      <div className="auth-fields-stack">
                        <div className="login-id-type-switcher" role="tablist" aria-label="เลือกวิธีระบุตัวตน">
                          <button
                            type="button"
                            className={`id-type-btn ${loginIdMode === 'csId' ? 'active' : ''}`}
                            onClick={() => setLoginIdMode('csId')}
                          >
                            เข้าด้วยรหัสคนไข้ (CS-)
                          </button>
                          <button
                            type="button"
                            className={`id-type-btn ${loginIdMode === 'username' ? 'active' : ''}`}
                            onClick={() => setLoginIdMode('username')}
                          >
                            เข้าด้วยชื่อบัญชี (Username)
                          </button>
                        </div>

                        {loginIdMode === 'csId' ? (
                          <label className="auth-field">
                            <span className="auth-label">รหัสผู้ป่วยของคุณ (พิมพ์เฉพาะตัวเลข)</span>
                            <div className="cs-prefix-input-wrap">
                              <span className="cs-static-prefix">CS-</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={patientNumberInput}
                                placeholder="เติมแค่เลข เช่น 1, 2, 3..."
                                autoComplete="off"
                                onChange={(e) => {
                                  const v = e.target.value.replace(/^CS-?/i, '').replace(/\D/g, '');
                                  setPatientNumberInput(v);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void loginPatient();
                                }}
                              />
                            </div>
                          </label>
                        ) : (
                          <label className="auth-field">
                            <span className="auth-label">ชื่อบัญชีผู้ใช้ (Username)</span>
                            <span className="auth-input-wrap">
                              <AuthIcon name="user" />
                              <input
                                type="text"
                                value={patientUsernameInput}
                                placeholder="กรอกชื่อบัญชีผู้ใช้"
                                autoComplete="username"
                                autoCapitalize="none"
                                onChange={(e) => setPatientUsernameInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void loginPatient();
                                }}
                              />
                            </span>
                          </label>
                        )}

                        <label className="auth-field">
                          <span className="auth-label">รหัส PIN (ตัวเลข 6 หลัก)</span>
                          <span className="auth-input-wrap">
                            <AuthIcon name="lock" />
                            <input
                              type="password"
                              inputMode="numeric"
                              maxLength={6}
                              value={patientPinInput}
                              placeholder="กรอกรหัส PIN 6 หลัก"
                              autoComplete="current-password"
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                                setPatientPinInput(v);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void loginPatient();
                              }}
                            />
                          </span>
                        </label>
                        <button
                          className="portal-primary auth-submit-btn"
                          disabled={
                            patientBusy ||
                            (loginIdMode === 'csId' ? !patientNumberInput.trim() : !patientUsernameInput.trim()) ||
                            patientPinInput.length !== 6
                          }
                          onClick={loginPatient}
                        >
                          {patientBusy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
                        </button>
                        <div className="auth-divider">
                          <span>ยังไม่มีบัญชี</span>
                        </div>
                        <button
                          type="button"
                          className="register-switch-btn"
                          onClick={() => {
                            setPatientAuthMode('register');
                            setNotice('');
                          }}
                        >
                          กดเพื่อสมัครบัญชี
                        </button>
                      </div>
                    ) : (
                      <div className="auth-fields-stack">
                        <div className="auto-cs-preview-badge">
                          <span>รหัสผู้ป่วยที่คุณจะได้รับ</span>
                          <strong>{nextAutoCsId}</strong>
                        </div>
                        <label className="auth-field">
                          <span className="auth-label">ตั้งบัญชีผู้ใช้ (Username)</span>
                          <span className="auth-input-wrap">
                            <AuthIcon name="user" />
                            <input
                              type="text"
                              value={patientUsernameInput}
                              placeholder="เช่น somchai01"
                              autoComplete="off"
                              autoCapitalize="none"
                              onChange={(e) => setPatientUsernameInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void registerPatientAccount();
                              }}
                            />
                          </span>
                        </label>
                        <label className="auth-field">
                          <span className="auth-label">ตั้งรหัส PIN (ตัวเลข 6 หลัก)</span>
                          <span className="auth-input-wrap">
                            <AuthIcon name="lock" />
                            <input
                              type="password"
                              inputMode="numeric"
                              maxLength={6}
                              value={patientPinInput}
                              placeholder="ตั้งรหัส PIN ตัวเลข 6 หลัก"
                              autoComplete="new-password"
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                                setPatientPinInput(v);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void registerPatientAccount();
                              }}
                            />
                          </span>
                        </label>
                        <button
                          className="portal-primary auth-submit-btn"
                          disabled={patientBusy || !patientUsernameInput.trim() || patientPinInput.length !== 6}
                          onClick={registerPatientAccount}
                        >
                          {patientBusy ? 'กำลังสร้างบัญชี…' : 'ยืนยันสมัครบัญชี'}
                        </button>
                        <button
                          type="button"
                          className="register-switch-btn"
                          onClick={() => {
                            setPatientAuthMode('login');
                            setNotice('');
                          }}
                        >
                          มีบัญชีแล้ว กลับไปเข้าสู่ระบบ
                        </button>
                      </div>
                    )}
                    <p className="auth-footnote">
                      <AuthIcon name="shield" />
                      ระบบแสดงเฉพาะรหัส CS ไม่แสดง HN หรือชื่อ-นามสกุล
                    </p>
                  </div>
                ) : (
                  renderAdminLoginForm()
                )}
              </div>
            </div>
          </section>
        ) : (
          <>
            {/* Active User / Patient Code Banner (Shows only CS ID, Username, and Logout as requested) */}
            {(view === 'home' || view === 'lesson') && (
              <section className="patient-auth-bar" aria-label="รหัสประจำตัวผู้ป่วย">
                <div className="patient-active-strip">
                  <div className="patient-active-info">
                    <span className="cs-id-pill">
                      รหัสผู้ป่วยของคุณ : {patientSession?.code || selectedCsId}
                    </span>
                    {patientSession?.username && (
                      <span className="patient-stat-pill">ชื่อบัญชี: {patientSession.username}</span>
                    )}
                  </div>
                  <button className="patient-logout-btn" onClick={logoutAll}>
                    ออกจากระบบ
                  </button>
                </div>
              </section>
            )}

            {/* Learning Mode Bar (Shown on Home & Lesson views) */}
            {(view === 'home' || view === 'lesson') && (
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
            )}

            {/* VIEW: HOME (Welcome Stage & Topic Grid) */}
            {view === 'home' && (
              <>
                <section className="welcome-stage">
                  <div className={`cath-portrait ${narrating ? 'speaking' : ''}`}>
                    <NurseCath speaking={narrating} />
                  </div>
                  <div className="welcome-copy">
                    <span className="gentle-label">
                      พยาบาลน้องโฟร์ · รหัสประจำตัวของคุณคือ {patientSession?.code || selectedCsId}
                    </span>
                    <h1>
                      ค่อย ๆ ดูแลไปด้วยกัน
                      <br />
                      ทีละขั้น อย่างมั่นใจ
                    </h1>
                    <p>
                      สวัสดีค่ะ ดิฉันพยาบาลน้องโฟร์ ยินดีต้อนรับเข้าสู่ CathSim 360 นะคะ ดูภาพสาธิต 3 มิติ
                      ฟังคำแนะนำ แล้วฝึกทำตามไปด้วยกันนะคะ
                    </p>

                    {/* Speed Selection Pills for Nurse Nong Four */}
                    <div className="nurse-speed-selector welcome-speed-selector">
                      <span className="speed-title">⚡ ความเร็วเสียงพูดพยาบาลน้องโฟร์:</span>
                      <div className="speed-pill-group" role="group" aria-label="เลือกความเร็วเสียงพูดพยาบาลน้องโฟร์">
                        <button
                          type="button"
                          className={`speed-pill ${speechSpeed === 'slowest' ? 'active' : ''}`}
                          onClick={() => setSpeechSpeed('slowest')}
                        >
                          ช้ามาก (0.65x)
                        </button>
                        <button
                          type="button"
                          className={`speed-pill ${speechSpeed === 'slow' ? 'active' : ''}`}
                          onClick={() => setSpeechSpeed('slow')}
                        >
                          ช้า (0.8x)
                        </button>
                        <button
                          type="button"
                          className={`speed-pill ${speechSpeed === 'normal' ? 'active' : ''}`}
                          onClick={() => setSpeechSpeed('normal')}
                        >
                          ปกติ (1.0x)
                        </button>
                      </div>
                    </div>
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
                  <p>เรียนรู้ครบทั้ง 10 เรื่อง ดูภาพสาธิต 3 มิติ และกด “ทำแล้ว” เพื่อบันทึกการเรียนรู้ค่ะ</p>
                </div>

                <div className="lesson-grid">
                  {topics.map((t, i) => {
                    const topicStat = currentPatientReport?.topicSummaries[i];
                    const completedCount = topicStat?.completedCount || 0;
                    return (
                      <button className="lesson-card" key={t.id} onClick={() => openLesson(i)}>
                        <div className="lesson-card-top">
                          <span className="topic-number">{String(i + 1).padStart(2, '0')}</span>
                          {completedCount > 0 ? (
                            <span className="topic-score-pill passed">
                              เรียนแล้ว {completedCount} ครั้ง
                            </span>
                          ) : topicStat && topicStat.viewedSteps > 0 ? (
                            <span className="topic-score-pill learning">
                              กำลังเรียน
                            </span>
                          ) : null}
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
                      <div className="demo-nurse-details">
                        <span>{narrating ? 'พยาบาลน้องโฟร์กำลังพูด...' : 'พยาบาลน้องโฟร์'}</span>
                        <div className="speed-pill-group mini" role="group" aria-label="ความเร็วเสียงพยาบาลน้องโฟร์">
                          <button
                            type="button"
                            className={`speed-pill ${speechSpeed === 'slowest' ? 'active' : ''}`}
                            onClick={() => setSpeechSpeed('slowest')}
                            title="ช้ามาก (0.65x)"
                          >
                            ช้ามาก
                          </button>
                          <button
                            type="button"
                            className={`speed-pill ${speechSpeed === 'slow' ? 'active' : ''}`}
                            onClick={() => setSpeechSpeed('slow')}
                            title="ช้า (0.8x)"
                          >
                            ช้า
                          </button>
                          <button
                            type="button"
                            className={`speed-pill ${speechSpeed === 'normal' ? 'active' : ''}`}
                            onClick={() => setSpeechSpeed('normal')}
                            title="ปกติ (1.0x)"
                          >
                            ปกติ
                          </button>
                        </div>
                      </div>
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
                          ? 'เก่งมากค่ะ จบการสาธิตเรื่องนี้แล้วนะคะ สามารถกลับมาดูซ้ำเพื่อฝึกฝนเพิ่มเติม หรือกดไปดูเรื่องถัดไปได้เลยค่ะ พยาบาลน้องโฟร์เป็นกำลังใจให้นะคะ'
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

                      {/* Nurse Nong Four Speech Speed Control */}
                      <div className="nurse-speed-selector lesson-speed-selector">
                        <span className="speed-title">⚡ ความเร็วเสียงพูด:</span>
                        <div className="speed-pill-group" role="group" aria-label="เลือกความเร็วเสียงพูดพยาบาลน้องโฟร์">
                          <button
                            type="button"
                            className={`speed-pill ${speechSpeed === 'slowest' ? 'active' : ''}`}
                            onClick={() => setSpeechSpeed('slowest')}
                          >
                            ช้ามาก (0.65x)
                          </button>
                          <button
                            type="button"
                            className={`speed-pill ${speechSpeed === 'slow' ? 'active' : ''}`}
                            onClick={() => setSpeechSpeed('slow')}
                          >
                            ช้า (0.8x)
                          </button>
                          <button
                            type="button"
                            className={`speed-pill ${speechSpeed === 'normal' ? 'active' : ''}`}
                            onClick={() => setSpeechSpeed('normal')}
                          >
                            ปกติ (1.0x)
                          </button>
                        </div>
                      </div>

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
                              <strong>“ทำแล้ว · ไปขั้นต่อไป”</strong> เพื่อบันทึกการเรียนรู้ค่ะ
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
                                ? 'กำลังฟังคำแนะนำ... เมื่อพูดจบจะนับถอยหลัง 8 วินาที'
                                : `เลื่อนไปขั้นถัดไปอัตโนมัติใน ${left} วินาที`}
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

            {/* VIEW: CATHREPORT (Requires Admin Login; Wrong > 2 times locks 15 minutes) */}
            {view === 'report' && (
              <>
                {adminSession?.role !== 'admin' ? (
                  <section className="mandatory-login-gate">{renderAdminLoginForm()}</section>
                ) : (
                  <section className="portal-report admin-dashboard">
                    {/* Top Dashboard Header */}
                    <div className="admin-dash-header">
                      <div className="admin-dash-title-group">
                        <div className="admin-badge-row">
                          <span className="admin-shield-badge">🛡️ ผู้ดูแลระบบ (Admin Only)</span>
                          <span className="live-sync-pill">🟢 เชื่อมต่อ Google Sheet แบบสด (Live)</span>
                        </div>
                        <h1>CathReport · Dashboard ผู้ดูแลระบบ</h1>
                        <p>
                          ศูนย์วิเคราะห์ข้อมูลผลการประเมินทักษะการดูแลสายสวนปัสสาวะรายบุคคลด้วยรหัส <strong>CS ID</strong> (เกณฑ์ผ่าน ≥ 80%) และเชื่อมโยงข้อมูลความลับทางการแพทย์ (HN / ชื่อ - นามสกุล) เก็บไว้ที่ Google Sheet
                        </p>
                      </div>
                      <button className="admin-logout-btn" onClick={logoutAll}>🚪 ออกจากระบบ Admin</button>
                    </div>

                    {/* Symmetrical 4-Card KPI Overview Dashboard Tiles */}
                    <div className="admin-kpi-grid">
                      <div className="kpi-card">
                        <div className="kpi-icon">👥</div>
                        <div className="kpi-content">
                          <span className="kpi-label">ผู้ป่วยทั้งหมดในระบบ</span>
                          <b className="kpi-value">{allPatientReports.length} <small>ราย</small></b>
                          <span className="kpi-sub">ลงทะเบียนรับ CS ID แล้ว</span>
                        </div>
                      </div>
                      <div className="kpi-card highlight-pass">
                        <div className="kpi-icon">🏆</div>
                        <div className="kpi-content">
                          <span className="kpi-label">ผ่านเกณฑ์มาตรฐาน (≥ 80%)</span>
                          <b className="kpi-value">
                            {allPatientReports.filter((r) => r.passed80).length} / {allPatientReports.length || 1}
                          </b>
                          <span className="kpi-sub">
                            {allPatientReports.length > 0
                              ? Math.round((allPatientReports.filter((r) => r.passed80).length / allPatientReports.length) * 100)
                              : 0}% ของผู้ป่วยทั้งหมด
                          </span>
                        </div>
                      </div>
                      <div className="kpi-card">
                        <div className="kpi-icon">✅</div>
                        <div className="kpi-content">
                          <span className="kpi-label">ขั้นตอนปฏิบัติที่บันทึก</span>
                          <b className="kpi-value">
                            {allPatientReports.reduce((acc, r) => acc + r.confirmedSteps, 0)} <small>ขั้นตอน</small>
                          </b>
                          <span className="kpi-sub">กด “ทำแล้ว” ในระบบ</span>
                        </div>
                      </div>
                      <div className="kpi-card">
                        <div className="kpi-icon">🔒</div>
                        <div className="kpi-content">
                          <span className="kpi-label">เชื่อมโยงข้อมูลความลับ</span>
                          <b className="kpi-value">
                            {Object.keys(confidentialLinks).length} / {allPatientReports.length || 1}
                          </b>
                          <span className="kpi-sub">บันทึก HN และชื่อลง Sheet แล้ว</span>
                        </div>
                      </div>
                    </div>

                    {/* Symmetrical Confidential Identity Linker Card (จัด Layout สวยงาม สมมาตร เข้ากับธีมแอพ) */}
                    <div className="admin-confidential-link-card">
                      <div className="confidential-header">
                        <div className="confidential-badge-wrap">
                          <span className="confidential-badge">🔒 ข้อมูลความลับเฉพาะ Admin · จัดเก็บลง Google Sheet · ห้ามเผยแพร่</span>
                        </div>
                        <h3>ช่องเชื่อมต่อข้อมูลผู้ป่วยรายบุคคล (CS ID ↔ HN และ ชื่อ - นามสกุล)</h3>
                        <p>
                          หลังจากผู้ป่วยสมัครบัญชีและได้รับรหัส <strong>CS ID</strong> แล้ว ให้ Admin กรอก <strong>CS ID</strong> คู่กับ <strong>HN</strong> และ <strong>ชื่อ - นามสกุล</strong> เพื่อเก็บเป็นความลับไว้ที่ Google Sheet แท็บ <code>ConfidentialIdentity</code> ที่เชื่อมต่อไว้ (ห้ามเผยแพร่ภายนอก)
                        </p>
                      </div>

                      <div className="confidential-form-layout">
                        <div className="confidential-inputs-grid">
                          <div className="confidential-field">
                            <label htmlFor="admin-csid-input">
                              <span className="field-title">CS ID (รหัสผู้ป่วย)</span>
                              <span className="field-hint">เช่น CS-1, CS-2</span>
                            </label>
                            <input
                              id="admin-csid-input"
                              type="text"
                              value={linkCsIdInput}
                              placeholder="เช่น CS-1, CS-2"
                              onChange={(e) => setLinkCsIdInput(e.target.value)}
                            />
                          </div>
                          <div className="confidential-field">
                            <label htmlFor="admin-hn-input">
                              <span className="field-title">HN (หมายเลขประจำตัวผู้ป่วย)</span>
                              <span className="field-hint">หมายเลขประจำตัว รพ.</span>
                            </label>
                            <input
                              id="admin-hn-input"
                              type="text"
                              value={linkHnInput}
                              placeholder="กรอก HN เช่น 6501234"
                              onChange={(e) => setLinkHnInput(e.target.value)}
                            />
                          </div>
                          <div className="confidential-field">
                            <label htmlFor="admin-name-input">
                              <span className="field-title">ชื่อ - นามสกุล (ผู้ป่วย)</span>
                              <span className="field-hint">ชื่อจริงสำหรับโรงพยาบาล</span>
                            </label>
                            <input
                              id="admin-name-input"
                              type="text"
                              value={linkFullNameInput}
                              placeholder="กรอก ชื่อ - นามสกุล ของผู้ป่วย"
                              onChange={(e) => setLinkFullNameInput(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="confidential-actions-row">
                          <button
                            type="button"
                            className="portal-primary confidential-submit-btn"
                            disabled={linkBusy || !linkCsIdInput.trim() || !linkHnInput.trim() || !linkFullNameInput.trim()}
                            onClick={saveConfidentialLink}
                          >
                            {linkBusy ? '⏳ กำลังบันทึกข้อมูลความลับลง Google Sheet…' : '💾 บันทึกเชื่อมข้อมูลไว้ที่ Google Sheet (ความลับ)'}
                          </button>
                          {confidentialLinks[normalizeCsId(linkCsIdInput)] && (
                            <span className="confidential-linked-pill">
                              ✓ รหัส {normalizeCsId(linkCsIdInput)} เชื่อมต่อกับ HN: {confidentialLinks[normalizeCsId(linkCsIdInput)].hn} ({confidentialLinks[normalizeCsId(linkCsIdInput)].fullName}) เรียบร้อยแล้ว
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Dedicated Patient CS ID ↔ HN Directory Card with Live Search */}
                    <div className="patient-directory-card">
                      <div className="directory-card-header">
                        <div className="directory-title-wrap">
                          <span className="directory-badge">📋 ชีทแยกรายชื่อและข้อมูลเชื่อมโยง</span>
                          <h3>ชีทข้อมูลผู้ป่วย CS ID ↔ HN และ ชื่อ - นามสกุล</h3>
                          <p>
                            ค้นหาและตรวจสอบการผูกรหัส <strong>CS ID</strong> เข้ากับ <strong>HN</strong> และ{' '}
                            <strong>ชื่อ - นามสกุล</strong> เพื่อค้นหาดูได้ง่าย รวดเร็ว และเป็นสัดส่วน (ซิงค์ตรงกับ Google Sheet แท็บ <code>CS_HN_Directory</code>)
                          </p>
                        </div>
                        <div className="directory-stats-pills">
                          <span className="stat-pill linked">
                            ✓ ผูกข้อมูลแล้ว {Object.keys(confidentialLinks).length} ราย
                          </span>
                          <span className="stat-pill total">
                            ผู้ป่วยทั้งหมด {patientDirectoryList.length} ราย
                          </span>
                        </div>
                      </div>

                      <div className="directory-search-bar">
                        <div className="search-input-wrap">
                          <span className="search-icon">🔍</span>
                          <input
                            type="text"
                            value={directorySearch}
                            onChange={(e) => setDirectorySearch(e.target.value)}
                            placeholder="พิมพ์ค้นหาด้วย CS ID (เช่น CS-1), HN, หรือ ชื่อ-นามสกุล คนไข้..."
                            className="directory-search-input"
                          />
                          {directorySearch && (
                            <button
                              type="button"
                              className="search-clear-btn"
                              onClick={() => setDirectorySearch('')}
                            >
                              ✕ ล้างคำค้น
                            </button>
                          )}
                        </div>
                        <span className="search-count-badge">
                          ผลการค้นหา: {filteredDirectory.length} ราย
                        </span>
                      </div>

                      <div className="table-scroll directory-table-wrap">
                        <table className="directory-table">
                          <thead>
                            <tr>
                              <th style={{ width: '60px' }}>ลำดับ</th>
                              <th style={{ width: '130px' }}>CS ID</th>
                              <th>บัญชีผู้ใช้ (Username)</th>
                              <th>HN (โรงพยาบาล)</th>
                              <th>ชื่อ - นามสกุล ผู้ป่วย</th>
                              <th>วันที่เชื่อมโยงล่าสุด</th>
                              <th>สถานะการเชื่อมต่อ</th>
                              <th style={{ width: '220px' }}>การจัดการ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredDirectory.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="empty-directory-cell">
                                  {directorySearch
                                    ? `ไม่พบข้อมูลผู้ป่วยที่ตรงกับคำค้นหา "${directorySearch}"`
                                    : 'ยังไม่มีข้อมูลผู้ป่วยในระบบ'}
                                </td>
                              </tr>
                            ) : (
                              filteredDirectory.map((item, idx) => (
                                <tr key={item.csId} className={item.isLinked ? 'row-linked' : 'row-unlinked'}>
                                  <td>{idx + 1}</td>
                                  <td>
                                    <span className="cs-id-pill">
                                      <code>{item.csId}</code>
                                      <button
                                        type="button"
                                        className="copy-mini-btn"
                                        title="คัดลอก CS ID"
                                        onClick={() => {
                                          navigator.clipboard?.writeText(item.csId);
                                          setNotice(`คัดลอกรหัส ${item.csId} เรียบร้อยแล้วค่ะ`);
                                        }}
                                      >
                                        📋
                                      </button>
                                    </span>
                                  </td>
                                  <td>{item.username || '—'}</td>
                                  <td>
                                    {item.hn ? (
                                      <strong className="hn-text">{item.hn}</strong>
                                    ) : (
                                      <span className="text-muted">ยังไม่ได้ระบุ HN</span>
                                    )}
                                  </td>
                                  <td>
                                    {item.fullName ? (
                                      <span className="name-text">{item.fullName}</span>
                                    ) : (
                                      <span className="text-muted">ยังไม่ได้ระบุชื่อ</span>
                                    )}
                                  </td>
                                  <td>{formatThaiDateTime(item.updatedAt || item.lastDate)}</td>
                                  <td>
                                    <span className={`status-pill ${item.isLinked ? 'linked' : 'unlinked'}`}>
                                      {item.isLinked ? '✓ ผูกข้อมูลแล้ว' : 'รอผูก HN'}
                                    </span>
                                  </td>
                                  <td>
                                    <div className="directory-actions-cell">
                                      <button
                                        type="button"
                                        className="dir-action-btn edit"
                                        onClick={() => {
                                          setLinkCsIdInput(item.csId);
                                          setLinkHnInput(item.hn || '');
                                          setLinkFullNameInput(item.fullName || '');
                                          setNotice(`เลือกผู้ป่วย ${item.csId} เพื่อกรอกหรือแก้ไขข้อมูลแล้วค่ะ`);
                                          const el = document.querySelector('.admin-confidential-link-card');
                                          el?.scrollIntoView({ behavior: 'smooth' });
                                        }}
                                        title="แก้ไขหรือผูกข้อมูลคนไข้รายนี้"
                                      >
                                        ✏️ ผูกข้อมูล
                                      </button>
                                      <button
                                        type="button"
                                        className="dir-action-btn view"
                                        onClick={() => {
                                          setSelectedCsId(item.csId);
                                          setReportCsInput(item.csId);
                                          const el = document.querySelector('.patient-full-report-card');
                                          el?.scrollIntoView({ behavior: 'smooth' });
                                        }}
                                        title="ดูรายงานผลการเรียนรู้"
                                      >
                                        📊 ดูผล
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* CS ID Search & Quick Selector Bar */}
                    <div className="cs-lookup-panel">
                      <div className="cs-lookup-input-row">
                        <label>
                          <span className="field-title">ค้นหาหรือใส่รหัส CS ID เพื่อดูข้อมูลผู้ป่วยรายบุคคล:</span>
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
                          className="portal-primary lookup-submit-btn"
                          onClick={() => {
                            const norm = normalizeCsId(reportCsInput || 'CS-1');
                            setSelectedCsId(norm);
                            setReportCsInput(norm);
                          }}
                        >
                          🔍 ดูข้อมูล {normalizeCsId(reportCsInput || 'CS-1')}
                        </button>
                      </div>

                      {allKnownCsIds.length > 0 && (
                        <div className="cs-quick-chips">
                          <span>รหัส CS ID ในระบบ ({allKnownCsIds.length} ราย):</span>
                          {allKnownCsIds.map((id) => {
                            const pReport = allPatientReports.find((r) => r.csId === id);
                            const isPass = pReport?.passed80;
                            return (
                              <button
                                key={id}
                                className={`${selectedCsId === id ? 'selected' : ''} ${isPass ? 'chip-pass' : ''}`}
                                onClick={() => {
                                  setSelectedCsId(id);
                                  setReportCsInput(id);
                                }}
                              >
                                {id} {isPass ? '✓' : ''}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Selected Patient Individual Report Card (CS-1, CS-2, ...) */}
                    <div className="patient-report-detail-card">
                      <div className="patient-detail-header">
                        <div>
                          <span className="gentle-label">ข้อมูลผู้ป่วยรายบุคคล (เกณฑ์ผ่าน ≥ 80%)</span>
                          <h2>
                            รหัสผู้ป่วย: <code>{selectedPatientReport.csId}</code>
                            {patientAccounts[selectedPatientReport.csId]?.username && (
                              <span className="report-username-pill">
                                บัญชีผู้ใช้: {patientAccounts[selectedPatientReport.csId].username}
                              </span>
                            )}
                          </h2>
                          {confidentialLinks[selectedPatientReport.csId] ? (
                            <div className="confidential-linked-summary">
                              <span>
                                <strong>HN (ความลับ):</strong> {confidentialLinks[selectedPatientReport.csId].hn}
                              </span>
                              <span>
                                <strong>ชื่อ - นามสกุล (ความลับ):</strong> {confidentialLinks[selectedPatientReport.csId].fullName}
                              </span>
                              <span className="confidential-mini-tag">เฉพาะ Admin · ห้ามเผยแพร่</span>
                            </div>
                          ) : (
                            <p className="unlinked-hint">
                              ยังไม่ได้เชื่อมข้อมูล HN และ ชื่อ - นามสกุล สำหรับรหัส {selectedPatientReport.csId} (กรอกในช่องเชื่อมต่อข้อมูลด้านบนได้ค่ะ)
                            </p>
                          )}
                          <p className="patient-dates-meta">
                            วันที่เริ่มใช้งาน: <strong>{formatThaiDateTime(selectedPatientReport.firstDate)}</strong> · วันที่เรียนรู้ล่าสุด:{' '}
                            <strong>{formatThaiDateTime(selectedPatientReport.lastDate)}</strong>
                          </p>
                        </div>
                        <div className={`overall-pass-badge ${selectedPatientReport.passed80 ? 'is-pass' : 'is-fail'}`}>
                          <strong>{selectedPatientReport.overallScorePercent}%</strong>
                          <span>
                            {selectedPatientReport.passed80 ? 'ผ่านเกณฑ์ (ทำได้เอง ≥ 80%)' : 'ยังไม่ผ่านเกณฑ์ (< 80%)'}
                          </span>
                        </div>
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

                      <h3>ตารางผลลัพธ์การเรียนรู้รายเรื่องของ {selectedPatientReport.csId} (ครบทั้ง 10 เรื่อง)</h3>
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

                    {/* All Patients Summary Table for Admin */}
                    <div className="all-patients-summary-card">
                      <h3>
                        ตารางสรุปข้อมูลผู้ป่วยทั้งหมดสำหรับ Admin ({allPatientReports.length} ราย · ผ่านเกณฑ์ ≥ 80% จำนวน{' '}
                        {allPatientReports.filter((r) => r.passed80).length} ราย)
                      </h3>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>CS ID</th>
                              <th>บัญชีผู้ใช้ (Username)</th>
                              <th>HN (ความลับ Google Sheet)</th>
                              <th>ชื่อ - นามสกุล (ความลับ Google Sheet)</th>
                              <th>วันที่เรียนรู้ล่าสุด</th>
                              <th>เนื้อหาที่เรียน</th>
                              <th>ทำได้เอง</th>
                              <th>คะแนน (%)</th>
                              <th>ผลการประเมิน (≥ 80%)</th>
                              <th>จัดการ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allPatientReports.map((r) => (
                              <tr key={r.csId}>
                                <td>
                                  <code>{r.csId}</code>
                                </td>
                                <td>{patientAccounts[r.csId]?.username || '—'}</td>
                                <td>{confidentialLinks[r.csId]?.hn || '—'}</td>
                                <td>{confidentialLinks[r.csId]?.fullName || '—'}</td>
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
                        ดาวน์โหลดรายงาน CSV (สำหรับ Admin)
                      </button>
                      <button className="portal-primary" onClick={exportJSON}>
                        ดาวน์โหลดข้อมูล JSON (สำหรับ Admin)
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
          </>
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
