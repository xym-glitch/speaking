import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { Clock, Users, ClipboardCheck, LineChart as LineChartIcon, ChevronRight, GraduationCap, ListChecks, Tag, QrCode } from "lucide-react";
import { loadClassDataRaw, saveClassDataRaw } from "./firebase.js";

const COLORS = {
  ink: "#20304A",
  inkSoft: "#4A5A72",
  paper: "#F6F3EA",
  paperCard: "#FFFFFF",
  line: "#DAD4C0",
  gold: "#B9862F",
  goldSoft: "#EFE0BE",
  teal: "#2E6B5E",
  tealSoft: "#DCEAE4",
  rose: "#AE4F3B",
  roseSoft: "#F3DED7",
};

// Official HKDSE Paper 4 Group Interaction rubric: 4 domains, each scored 0-6.
const DSE_CRITERIA = [
  { key: "pronunciation", label: "Pronunciation & Delivery" },
  { key: "strategies", label: "Communication Strategies" },
  { key: "vocabulary", label: "Vocabulary & Language Patterns" },
  { key: "ideas", label: "Ideas & Organisation" },
];

// TSA doesn't publish a fine-grained numeric peer-scoring rubric like DSE -
// this is a simplified 4-domain version based on common TSA speaking descriptors.
// Confirm the labels below match what the school actually uses.
const TSA_CRITERIA = [
  { key: "content", label: "Content & Task Fulfilment" },
  { key: "organisation", label: "Organisation & Coherence" },
  { key: "language", label: "Language Accuracy & Range" },
  { key: "pronunciation", label: "Pronunciation & Delivery" },
];

const RUBRICS = { DSE: DSE_CRITERIA, TSA: TSA_CRITERIA };
const SCALE_MAX = 6;

// Each teaching group can be assembled from more than one home class
// (ability-based regrouping) - list every home-class code that feeds into it.
const CLASS_CONFIG = [
  { id: "F3", label: "Secondary 3 (mixed set)", rubric: "TSA", homeClasses: ["3C", "3D"] },
  { id: "F4", label: "Secondary 4", rubric: "DSE", homeClasses: ["F4"] },
  { id: "F6", label: "Secondary 6 (mixed set)", rubric: "DSE", homeClasses: ["6B", "6C", "6D"] },
];

const POLL_MS = 3000;

function classCfg(classId) {
  return CLASS_CONFIG.find((c) => c.id === classId) || CLASS_CONFIG[0];
}
function criteriaFor(classId) {
  return RUBRICS[classCfg(classId).rubric];
}
function rubricNameFor(classId) {
  return classCfg(classId).rubric;
}

function defaultClassData() {
  return {
    roster: [], // {id, name, homeClass}
    groups: {},
    groupCount: 6,
    timer: { endTime: null, durationSec: 0, running: false, label: "" },
    scoringMode: { mode: "off", targetId: null, session: 0 },
    rawscores: [],
    history: {},
  };
}

async function loadClassData(cls) {
  try {
    const raw = await loadClassDataRaw(cls);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // parse error -> fall through to default
  }
  return defaultClassData();
}

async function saveClassData(cls, data) {
  await saveClassDataRaw(cls, JSON.stringify(data));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

// ---------- shared UI atoms ----------

function Card({ children, style, ...rest }) {
  return (
    <div
      style={{
        background: COLORS.paperCard,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 10,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children, icon: Icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "Georgia, serif", fontSize: 20, color: COLORS.ink, marginBottom: 12, fontWeight: 600 }}>
      {Icon && <Icon size={18} color={COLORS.gold} />}
      {children}
    </div>
  );
}

function Button({ children, onClick, variant = "primary", disabled, style, icon: Icon }) {
  const base = {
    padding: "8px 16px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
    border: "1px solid transparent",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "background-color 120ms ease",
  };
  const variants = {
    primary: { background: COLORS.ink, color: "#fff" },
    gold: { background: COLORS.gold, color: "#fff" },
    ghost: { background: "transparent", color: COLORS.ink, border: `1px solid ${COLORS.line}` },
    rose: { background: COLORS.rose, color: "#fff" },
    teal: { background: COLORS.teal, color: "#fff" },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {Icon && <Icon size={15} />}
      {children}
    </button>
  );
}

function RubricBadge({ classId }) {
  const name = rubricNameFor(classId);
  const color = name === "DSE" ? COLORS.teal : COLORS.rose;
  const bg = name === "DSE" ? COLORS.tealSoft : COLORS.roseSoft;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, padding: "2px 8px", borderRadius: 12 }}>
      {name} rubric
    </span>
  );
}

function HomeClassTag({ homeClass }) {
  if (!homeClass) return null;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.inkSoft, background: COLORS.paper, border: `1px solid ${COLORS.line}`, padding: "1px 6px", borderRadius: 10, marginLeft: 6 }}>
      {homeClass}
    </span>
  );
}

function urlForRole(role) {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("role", role);
    return u.toString();
  } catch (e) {
    return window.location.href;
  }
}

function qrImageSrc(url) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
}

function QRPanel() {
  return (
    <Card style={{ padding: 20 }}>
      <SectionLabel icon={QrCode}>Links</SectionLabel>
      <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 16 }}>
        This tab is only visible here in the teacher console — it never appears on the student side or the public landing page.
        Both roles open from the <strong>same published link</strong> — there's no separate teacher/student URL. Share the link below with your class, and each person just taps "Teacher" or "Student" on the screen that appears.
      </div>
      <Card style={{ padding: 16, background: COLORS.paper }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink, marginBottom: 6 }}>Share this with students:</div>
        <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
          Use the link from Claude's own "Publish & copy link" button (the one you already have) — that's the real, working URL.
          To turn it into a QR code your class can scan, paste that link into any QR generator (e.g. Chrome's built-in page-share icon in
          the address bar, or a site like qr-code-generator.com) — or tell me the link once it's published and I can generate a
          downloadable QR image for you directly.
        </div>
      </Card>
      <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: 14 }}>
        Since there's no password on either role, anyone with the link could technically open the Teacher console too — so still
        only hand the link out through channels you trust (your school's LMS, a printed QR code, etc.), not anywhere it could be
        indexed or forwarded freely.
      </div>
    </Card>
  );
}

// ---------- landing ----------

function Landing({ onPick }) {
  return (
    <div style={{ minHeight: "100%", background: COLORS.paper, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 30, color: COLORS.ink, marginBottom: 6, fontWeight: 700 }}>
          Group Work Scoreboard
        </div>
        <div style={{ color: COLORS.inkSoft, fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
          Grouping, timing, and peer assessment in one place. Choose your role to continue.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card
            onClick={() => onPick("teacher")}
            style={{ padding: "18px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: COLORS.goldSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <GraduationCap size={18} color={COLORS.gold} />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: COLORS.ink, fontSize: 16 }}>Teacher</div>
                <div style={{ color: COLORS.inkSoft, fontSize: 13, marginTop: 2 }}>Roster, grouping, timer, scoring</div>
              </div>
            </div>
            <ChevronRight color={COLORS.gold} size={20} />
          </Card>
          <Card
            onClick={() => onPick("student")}
            style={{ padding: "18px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: COLORS.tealSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Users size={18} color={COLORS.teal} />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: COLORS.ink, fontSize: 16 }}>Student</div>
                <div style={{ color: COLORS.inkSoft, fontSize: 13, marginTop: 2 }}>View group, take part in scoring, check results</div>
              </div>
            </div>
            <ChevronRight color={COLORS.teal} size={20} />
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------- teacher view ----------

function TeacherView({ onBack }) {
  const [cls, setCls] = useState(CLASS_CONFIG[0].id);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("roster");
  const [rosterTextByClass, setRosterTextByClass] = useState({});
  const [newStudentHome, setNewStudentHome] = useState(null);
  const [newStudentNumber, setNewStudentNumber] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [minutes, setMinutes] = useState(5);
  const [timerLabel, setTimerLabel] = useState("");
  const [now, setNow] = useState(Date.now());
  const pollRef = useRef(null);
  const cfg = classCfg(cls);
  const CRITERIA = criteriaFor(cls);

  const refresh = useCallback(async () => {
    const d = await loadClassData(cls);
    setData(d);
  }, [cls]);

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!data) {
    return <div style={{ padding: 40, color: COLORS.inkSoft }}>Loading…</div>;
  }

  async function persist(next) {
    setData(next);
    await saveClassData(cls, next);
  }

  function parseRosterLine(line, cfg) {
    // Splits "<code><number>\t<Name>" (tab, spaces, or comma before the name) into a token + name.
    // Examples this handles: "3C03\tCHAN PUI YUET", "3D01  CHAN TSZ YAU CASSIE", "03, Chan Tai Man".
    const m = line.match(/^\s*(\S+)[\t ,]+(.+?)\s*$/);
    if (!m) return { homeClass: null, number: "", name: line.trim() };
    const token = m[1];
    const name = m[2];

    // Try to match a known home-class code as the token's prefix (longest code first).
    const sortedCodes = [...cfg.homeClasses].sort((a, b) => b.length - a.length);
    for (const hc of sortedCodes) {
      if (token.toUpperCase().startsWith(hc.toUpperCase())) {
        const rest = token.slice(hc.length);
        if (/^\d+$/.test(rest)) return { homeClass: hc, number: rest, name };
      }
    }
    // No code prefix found - if this teaching group has only one home class, a plain
    // number is enough (e.g. F4's roster doesn't need a code prefix).
    if (cfg.homeClasses.length === 1 && /^\d+$/.test(token)) {
      return { homeClass: cfg.homeClasses[0], number: token, name };
    }
    return { homeClass: null, number: "", name: `${token} ${name}`.trim() };
  }

  function buildRoster() {
    const text = rosterTextByClass[cls] || "";
    const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0) return;
    let unmatchedCount = 0;
    const newEntries = lines.map((line) => {
      const { homeClass, number, name } = parseRosterLine(line, cfg);
      if (homeClass && number) {
        return { id: `${homeClass}-${pad2(+number)}`, name, homeClass };
      }
      // Couldn't detect a home-class code - fall back to the first home class with a
      // clearly temporary ID so it's obvious this one needs a manual check.
      unmatchedCount += 1;
      const fallbackHome = cfg.homeClasses[0];
      return { id: `${fallbackHome}-X${unmatchedCount}`, name, homeClass: fallbackHome };
    });
    persist({ ...data, roster: newEntries, groups: {} });
    setRosterTextByClass((prev) => ({ ...prev, [cls]: "" }));
    return unmatchedCount;
  }

  function calcBalancedGroupCount(n) {
    if (n === 0) return 1;
    let numGroups = Math.max(1, Math.round(n / 3.5));
    while (numGroups > 1 && Math.ceil(n / numGroups) > 4) numGroups += 1;
    while (numGroups > 1 && Math.floor(n / numGroups) < 3) numGroups -= 1;
    return numGroups;
  }

  function autoGroup() {
    const n = data.roster.length;
    if (n === 0) return;
    const numGroups = calcBalancedGroupCount(n);
    const shuffled = [...data.roster].sort(() => Math.random() - 0.5);
    const q = Math.floor(n / numGroups);
    const r = n % numGroups;
    const groups = {};
    let idx = 0;
    for (let g = 1; g <= numGroups; g++) {
      const size = g <= r ? q + 1 : q;
      for (let i = 0; i < size; i++) {
        groups[shuffled[idx].id] = g;
        idx++;
      }
    }
    persist({ ...data, groupCount: numGroups, groups });
  }

  function addStudent(homeClass, number, name) {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    let id;
    if (number && /^\d+$/.test(number)) {
      id = `${homeClass}-${pad2(+number)}`;
    } else {
      const existingX = data.roster.filter((s) => s.homeClass === homeClass && /^-X\d+$/.test(s.id.slice(homeClass.length)));
      id = `${homeClass}-X${existingX.length + 1}`;
    }
    const withoutOld = data.roster.filter((s) => s.id !== id);
    const roster = [...withoutOld, { id, name: trimmedName, homeClass }];
    persist({ ...data, roster });
  }

  function deleteStudent(id) {
    const roster = data.roster.filter((s) => s.id !== id);
    const groups = { ...data.groups };
    delete groups[id];
    persist({ ...data, roster, groups });
  }

  function setGroup(id, g) {
    persist({ ...data, groups: { ...data.groups, [id]: g } });
  }

  function startTimer() {
    const durationSec = Math.max(1, Math.round(minutes * 60));
    persist({
      ...data,
      timer: { endTime: Date.now() + durationSec * 1000, durationSec, running: true, label: timerLabel },
    });
  }

  function pauseTimer() {
    if (!data.timer.running) return;
    const remain = Math.max(0, Math.round((data.timer.endTime - Date.now()) / 1000));
    persist({ ...data, timer: { ...data.timer, running: false, durationSec: remain, endTime: null } });
  }

  function resumeTimer() {
    persist({
      ...data,
      timer: { ...data.timer, running: true, endTime: Date.now() + data.timer.durationSec * 1000 },
    });
  }

  function resetTimer() {
    persist({ ...data, timer: { endTime: null, durationSec: 0, running: false, label: "" } });
  }

  function setScoringMode(mode, targetId = null) {
    persist({
      ...data,
      scoringMode: { mode, targetId, session: data.scoringMode.session },
    });
  }

  function finalizeSession() {
    const session = data.scoringMode.session;
    const entries = data.rawscores.filter((r) => r.session === session);
    const byTarget = {};
    entries.forEach((e) => {
      if (!byTarget[e.targetId]) byTarget[e.targetId] = [];
      byTarget[e.targetId].push(e);
    });
    const history = { ...data.history };
    Object.keys(byTarget).forEach((targetId) => {
      const list = byTarget[targetId];
      const avg = {};
      CRITERIA.forEach((c) => {
        const vals = list.map((e) => e.criteria[c.key]).filter((v) => typeof v === "number");
        avg[c.key] = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : 0;
      });
      const overall = +(CRITERIA.reduce((sum, c) => sum + avg[c.key], 0) / CRITERIA.length).toFixed(2);
      const prev = history[targetId] || [];
      history[targetId] = [...prev, { session, date: new Date().toISOString().slice(0, 10), avg, overall, raters: list.length }];
    });
    persist({
      ...data,
      history,
      scoringMode: { mode: "off", targetId: null, session: session + 1 },
    });
  }

  const remainSec = data.timer.running
    ? Math.max(0, Math.round((data.timer.endTime - now) / 1000))
    : data.timer.durationSec;

  const tabs = [
    { id: "roster", label: "Roster", icon: Users },
    { id: "groups", label: "Groups", icon: Users },
    { id: "timer", label: "Timer", icon: Clock },
    { id: "scoring", label: "Scoring Mode", icon: ClipboardCheck },
    { id: "overview", label: "Overview", icon: LineChartIcon },
    { id: "qr", label: "QR / Link", icon: QrCode },
  ];

  return (
    <div style={{ minHeight: "100%", background: COLORS.paper }}>
      <div style={{ borderBottom: `1px solid ${COLORS.line}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: COLORS.paperCard, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: COLORS.inkSoft, cursor: "pointer", fontSize: 13 }}>← Back</button>
          <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18, color: COLORS.ink }}>Teacher Console</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {CLASS_CONFIG.map((c) => (
            <button
              key={c.id}
              onClick={() => setCls(c.id)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: `1px solid ${cls === c.id ? COLORS.gold : COLORS.line}`,
                background: cls === c.id ? COLORS.goldSoft : "transparent",
                color: COLORS.ink,
                fontSize: 13,
                fontWeight: cls === c.id ? 700 : 400,
                cursor: "pointer",
              }}
            >
              {c.label}
            </button>
          ))}
          <RubricBadge classId={cls} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "14px 24px 0", flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: tab === t.id ? COLORS.ink : COLORS.inkSoft,
              background: "none",
              border: "none",
              borderBottom: tab === t.id ? `2px solid ${COLORS.gold}` : "2px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 24, maxWidth: 880, margin: "0 auto" }}>
        {tab === "roster" && (
          <Card style={{ padding: 20 }}>
            <SectionLabel icon={Users}>{cfg.label} Roster</SectionLabel>
            <div style={{ color: COLORS.inkSoft, fontSize: 13, marginBottom: 16 }}>
              {cfg.homeClasses.length > 1 ? (
                <>
                  This teaching group draws from <strong>{cfg.homeClasses.join(", ")}</strong>. Paste the whole list at once,
                  one student per line as <strong>class code + number, then name</strong> (tab, space, or comma between them) —
                  e.g. <code>3C03&nbsp;&nbsp;CHAN PUI YUET</code> or <code>3D01, CHAN TSZ YAU CASSIE</code>. The code tells the
                  system which home class each student is from, and the ID keeps their real number (e.g. 3C-03).
                </>
              ) : (
                <>
                  One student per line as <strong>number, then name</strong> — e.g. <code>03, Chan Tai Man</code>. The ID keeps
                  their real class number (e.g. {cfg.homeClasses[0]}-03).
                </>
              )}
              {" "}If a line has no number the system recognizes, that student gets a clearly temporary ID (…-X1, X2…) so it's
              obvious it isn't a real class number. Building the roster replaces the whole list for {cfg.label} and clears
              current group assignments.
            </div>
            <textarea
              value={rosterTextByClass[cls] || ""}
              onChange={(e) => setRosterTextByClass((prev) => ({ ...prev, [cls]: e.target.value }))}
              placeholder={cfg.homeClasses.length > 1
                ? `${cfg.homeClasses[0]}03\tCHAN PUI YUET\n${cfg.homeClasses[1]}01\tCHAN TSZ YAU CASSIE\n…`
                : "03, Chan Tai Man\n07, Lee Siu Ming\n…"}
              style={{ width: "100%", minHeight: 220, padding: 10, border: `1px solid ${COLORS.line}`, borderRadius: 8, fontSize: 14, color: COLORS.ink, background: COLORS.paper, resize: "vertical", fontFamily: "monospace" }}
            />
            <div style={{ marginTop: 10 }}>
              <Button onClick={buildRoster} disabled={!(rosterTextByClass[cls] || "").trim()}>
                Build {cfg.label} roster (replaces the whole list)
              </Button>
            </div>

            {data.roster.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink, marginBottom: 8 }}>
                  Current roster ({data.roster.length} students)
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap", padding: 12, background: COLORS.paper, borderRadius: 8, border: `1px solid ${COLORS.line}` }}>
                  {cfg.homeClasses.length > 1 && (
                    <select
                      value={newStudentHome || cfg.homeClasses[0]}
                      onChange={(e) => setNewStudentHome(e.target.value)}
                      style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${COLORS.line}`, fontSize: 13 }}
                    >
                      {cfg.homeClasses.map((hc) => <option key={hc} value={hc}>{hc}</option>)}
                    </select>
                  )}
                  <input
                    placeholder="No."
                    value={newStudentNumber}
                    onChange={(e) => setNewStudentNumber(e.target.value)}
                    style={{ width: 60, padding: "6px 8px", border: `1px solid ${COLORS.line}`, borderRadius: 6, fontSize: 13 }}
                  />
                  <input
                    placeholder="Student name"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    style={{ flex: 1, minWidth: 160, padding: "6px 10px", border: `1px solid ${COLORS.line}`, borderRadius: 6, fontSize: 13 }}
                  />
                  <Button
                    onClick={() => {
                      addStudent(newStudentHome || cfg.homeClasses[0], newStudentNumber.trim(), newStudentName);
                      setNewStudentNumber("");
                      setNewStudentName("");
                    }}
                    disabled={!newStudentName.trim()}
                  >
                    Add student
                  </Button>
                </div>

                {cfg.homeClasses.map((hc) => {
                  const group = data.roster.filter((s) => s.homeClass === hc);
                  if (group.length === 0) return null;
                  return (
                    <div key={hc} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.inkSoft, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        <Tag size={12} color={COLORS.gold} /> {hc} ({group.length})
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                        {group.map((s) => (
                          <div key={s.id} style={{ fontSize: 13, color: COLORS.inkSoft, padding: "6px 6px 6px 10px", background: COLORS.paper, borderRadius: 6, border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                            <span><span style={{ color: COLORS.gold, fontWeight: 700 }}>{s.id}</span> {s.name}</span>
                            <button
                              onClick={() => deleteStudent(s.id)}
                              title="Remove student"
                              style={{ background: "none", border: "none", color: COLORS.rose, cursor: "pointer", fontSize: 15, fontWeight: 700, padding: "0 4px", lineHeight: 1 }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {tab === "groups" && (
          <Card style={{ padding: 20 }}>
            <SectionLabel icon={Users}>{cfg.label} Grouping</SectionLabel>
            {data.roster.length === 0 ? (
              <div style={{ color: COLORS.inkSoft, fontSize: 14 }}>Build the roster first.</div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                  <Button variant="gold" onClick={autoGroup}>Auto-assign groups (3–4 students each)</Button>
                  <span style={{ fontSize: 12, color: COLORS.inkSoft }}>Currently {data.groupCount} group{data.groupCount === 1 ? "" : "s"} for {data.roster.length} students.</span>
                </div>
                <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 16 }}>
                  Any change here — auto-assign or a manual dropdown edit below — saves immediately and reaches students' own screens within a few seconds, no refresh needed on their end.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {data.roster.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: COLORS.paper, borderRadius: 6, border: `1px solid ${COLORS.line}` }}>
                      <span style={{ fontSize: 13, color: COLORS.ink }}>
                        {s.name} <span style={{ color: COLORS.inkSoft }}>({s.id})</span>
                        <HomeClassTag homeClass={s.homeClass} />
                      </span>
                      <select
                        value={data.groups[s.id] || 0}
                        onChange={(e) => setGroup(s.id, +e.target.value)}
                        style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${COLORS.line}`, fontSize: 13 }}
                      >
                        <option value={0}>Unassigned</option>
                        {Array.from({ length: Math.max(data.groupCount, data.groups[s.id] || 0) }, (_, i) => i + 1).map((g) => (
                          <option key={g} value={g}>Group {g}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        )}

        {tab === "timer" && (
          <Card style={{ padding: 20 }}>
            <SectionLabel icon={Clock}>Timer</SectionLabel>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 56, fontWeight: 700, color: COLORS.ink, fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>
              {fmtTime(remainSec)}
            </div>
            {data.timer.label && <div style={{ color: COLORS.inkSoft, fontSize: 13, marginBottom: 12 }}>{data.timer.label}</div>}
            {remainSec === 0 && data.timer.durationSec > 0 && (
              <div style={{ color: COLORS.rose, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Time's up!</div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <input
                type="number"
                min={1}
                value={minutes}
                onChange={(e) => setMinutes(+e.target.value || 1)}
                style={{ width: 70, padding: "6px 8px", border: `1px solid ${COLORS.line}`, borderRadius: 6 }}
              />
              <span style={{ fontSize: 13, color: COLORS.inkSoft }}>minutes</span>
              <input
                placeholder="Activity name (optional)"
                value={timerLabel}
                onChange={(e) => setTimerLabel(e.target.value)}
                style={{ flex: 1, minWidth: 160, padding: "6px 10px", border: `1px solid ${COLORS.line}`, borderRadius: 6, fontSize: 13 }}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="gold" onClick={startTimer}>Start new timer</Button>
              {data.timer.durationSec > 0 && data.timer.running && <Button variant="ghost" onClick={pauseTimer}>Pause</Button>}
              {data.timer.durationSec > 0 && !data.timer.running && remainSec > 0 && <Button variant="ghost" onClick={resumeTimer}>Resume</Button>}
              <Button variant="ghost" onClick={resetTimer}>Reset</Button>
            </div>
          </Card>
        )}

        {tab === "scoring" && (
          <Card style={{ padding: 20 }}>
            <SectionLabel icon={ClipboardCheck}>Scoring Mode — Round {data.scoringMode.session + 1}</SectionLabel>
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: COLORS.inkSoft }}>Rubric for {cfg.label}: </span>
              <RubricBadge classId={cls} />
              <span style={{ fontSize: 12, color: COLORS.inkSoft, marginLeft: 8 }}>({CRITERIA.map((c) => c.label).join(" · ")})</span>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <Button
                variant={data.scoringMode.mode === "off" ? "primary" : "ghost"}
                onClick={() => setScoringMode("off")}
              >
                Scoring off
              </Button>
              <Button
                variant={data.scoringMode.mode === "group" ? "teal" : "ghost"}
                onClick={() => setScoringMode("group")}
                icon={Users}
              >
                Within-group scoring
              </Button>
              <Button
                variant={data.scoringMode.mode === "individual" ? "rose" : "ghost"}
                onClick={() => setScoringMode("individual", data.scoringMode.targetId || (data.roster[0] && data.roster[0].id))}
                icon={ListChecks}
              >
                Score a chosen student
              </Button>
            </div>

            {data.scoringMode.mode === "individual" && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: COLORS.inkSoft, marginRight: 8 }}>Student being scored:</label>
                <select
                  value={data.scoringMode.targetId || ""}
                  onChange={(e) => setScoringMode("individual", e.target.value)}
                  style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${COLORS.line}`, fontSize: 13 }}
                >
                  {data.roster.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                  ))}
                </select>
                <div style={{ fontSize: 12, color: COLORS.inkSoft, marginTop: 6 }}>Everyone else in this teaching group can score this student.</div>
              </div>
            )}

            {(() => {
              if (data.scoringMode.mode === "off") return null;
              const session = data.scoringMode.session;
              const submittedIds = new Set(data.rawscores.filter((r) => r.session === session).map((r) => r.fromId));
              const groupSizeMap = {};
              data.roster.forEach((s) => {
                const g = data.groups[s.id];
                if (g) groupSizeMap[g] = (groupSizeMap[g] || 0) + 1;
              });
              let expected;
              if (data.scoringMode.mode === "group") {
                expected = data.roster.filter((s) => data.groups[s.id] && groupSizeMap[data.groups[s.id]] > 1);
              } else {
                expected = data.roster.filter((s) => s.id !== data.scoringMode.targetId);
              }
              const missing = expected.filter((s) => !submittedIds.has(s.id));
              return (
                <div style={{ marginBottom: 16, padding: 12, background: missing.length ? COLORS.roseSoft : COLORS.tealSoft, borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: missing.length ? COLORS.rose : COLORS.teal, marginBottom: missing.length ? 6 : 0 }}>
                    {expected.length - missing.length} / {expected.length} submitted this round
                    {missing.length === 0 && expected.length > 0 ? " — all caught up!" : ""}
                  </div>
                  {missing.length > 0 && (
                    <div style={{ fontSize: 12, color: COLORS.inkSoft }}>
                      Still waiting on: {missing.map((s) => s.name).join(", ")}
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 12 }}>
              {data.rawscores.filter((r) => r.session === data.scoringMode.session).length} submissions received this round.
            </div>
            <Button
              variant="gold"
              onClick={finalizeSession}
              disabled={data.rawscores.filter((r) => r.session === data.scoringMode.session).length === 0}
            >
              Finalize round & save to records
            </Button>
          </Card>
        )}

        {tab === "overview" && (
          <Card style={{ padding: 20 }}>
            <SectionLabel icon={LineChartIcon}>{cfg.label} Overview</SectionLabel>
            {data.roster.length === 0 ? (
              <div style={{ color: COLORS.inkSoft, fontSize: 14 }}>No roster yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.roster.map((s) => {
                  const hist = data.history[s.id] || [];
                  const last = hist[hist.length - 1];
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: COLORS.paper, borderRadius: 8, border: `1px solid ${COLORS.line}` }}>
                      <span style={{ fontSize: 13, color: COLORS.ink }}>
                        {s.name} <span style={{ color: COLORS.inkSoft }}>({s.id})</span>
                        <HomeClassTag homeClass={s.homeClass} />
                      </span>
                      <span style={{ fontSize: 13, color: last ? COLORS.teal : COLORS.inkSoft, fontWeight: 700 }}>
                        {last ? `Latest avg ${last.overall} / ${SCALE_MAX} (${hist.length} rounds recorded)` : "No records yet"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {tab === "qr" && <QRPanel />}
      </div>
    </div>
  );
}

// ---------- student view ----------

function StudentView({ onBack }) {
  const [cls, setCls] = useState(null);
  const [studentId, setStudentId] = useState(null);
  const [data, setData] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [scores, setScores] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const pollRef = useRef(null);
  const CRITERIA = cls ? criteriaFor(cls) : DSE_CRITERIA;

  const refresh = useCallback(async () => {
    if (!cls) return;
    const d = await loadClassData(cls);
    setData(d);
  }, [cls]);

  useEffect(() => {
    if (!cls) return;
    refresh();
    pollRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [cls, refresh]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setSubmitted(false);
    setScores({});
  }, [data && data.scoringMode.session, data && data.scoringMode.mode]);

  if (!cls) {
    return (
      <div style={{ minHeight: "100%", background: COLORS.paper, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 380, width: "100%" }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: COLORS.inkSoft, cursor: "pointer", fontSize: 13, marginBottom: 16 }}>← Back</button>
          <SectionLabel icon={GraduationCap}>Choose your class</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {CLASS_CONFIG.map((c) => (
              <Card key={c.id} onClick={() => setCls(c.id)} style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontWeight: 700, color: COLORS.ink }}>{c.label}</span>
                  <div style={{ fontSize: 11, color: COLORS.inkSoft, marginTop: 2 }}>{c.homeClasses.join(" / ")}</div>
                </div>
                <RubricBadge classId={c.id} />
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div style={{ padding: 40, color: COLORS.inkSoft }}>Loading…</div>;
  }

  if (!studentId) {
    return (
      <div style={{ minHeight: "100%", background: COLORS.paper, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 380, width: "100%" }}>
          <button onClick={() => setCls(null)} style={{ background: "none", border: "none", color: COLORS.inkSoft, cursor: "pointer", fontSize: 13, marginBottom: 16 }}>← Choose a different class</button>
          <SectionLabel icon={Users}>{classCfg(cls).label} · Pick your name</SectionLabel>
          {data.roster.length === 0 ? (
            <div style={{ color: COLORS.inkSoft, fontSize: 14 }}>Your teacher hasn't built this roster yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto" }}>
              {data.roster.map((s) => (
                <Card key={s.id} onClick={() => setStudentId(s.id)} style={{ padding: "12px 16px", cursor: "pointer" }}>
                  <span style={{ fontWeight: 600, color: COLORS.ink }}>{s.name}</span>
                  <HomeClassTag homeClass={s.homeClass} />
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const me = data.roster.find((s) => s.id === studentId);
  const myGroup = data.groups[studentId] || 0;
  const groupmates = data.roster.filter((s) => data.groups[s.id] === myGroup && s.id !== studentId && myGroup !== 0);
  const remainSec = data.timer.running
    ? Math.max(0, Math.round((data.timer.endTime - now) / 1000))
    : data.timer.durationSec;

  const mode = data.scoringMode.mode;
  const session = data.scoringMode.session;
  const isTarget = mode === "individual" && data.scoringMode.targetId === studentId;
  const targets = mode === "group" ? groupmates : mode === "individual" && !isTarget ? [data.roster.find((s) => s.id === data.scoringMode.targetId)].filter(Boolean) : [];

  function setScore(targetId, key, val) {
    setScores((prev) => ({ ...prev, [targetId]: { ...(prev[targetId] || {}), [key]: val } }));
  }

  async function submitScores() {
    const fresh = await loadClassData(cls);
    let rawscores = [...fresh.rawscores];
    targets.forEach((t) => {
      rawscores = rawscores.filter((r) => !(r.session === session && r.fromId === studentId && r.targetId === t.id));
      const criteria = {};
      CRITERIA.forEach((c) => { criteria[c.key] = (scores[t.id] && scores[t.id][c.key]) ?? Math.round(SCALE_MAX / 2); });
      rawscores.push({ session, fromId: studentId, targetId: t.id, criteria, timestamp: Date.now() });
    });
    const next = { ...fresh, rawscores };
    setData(next);
    await saveClassData(cls, next);
    setSubmitted(true);
  }

  const myHistory = data.history[studentId] || [];
  const latest = myHistory[myHistory.length - 1];
  const radarData = CRITERIA.map((c) => ({ criterion: c.label, Score: latest ? latest.avg[c.key] : 0 }));
  const lineData = myHistory.map((h) => ({ Round: `R${h.session + 1}`, Overall: h.overall }));

  return (
    <div style={{ minHeight: "100%", background: COLORS.paper }}>
      <div style={{ borderBottom: `1px solid ${COLORS.line}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: COLORS.paperCard, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => setStudentId(null)} style={{ background: "none", border: "none", color: COLORS.inkSoft, cursor: "pointer", fontSize: 13 }}>← Switch student</button>
          <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18, color: COLORS.ink }}>
            {me ? me.name : ""} <span style={{ color: COLORS.inkSoft, fontSize: 13, fontWeight: 400 }}>({classCfg(cls).label} · {studentId})</span>
          </div>
        </div>
        <div style={{ fontSize: 13, color: COLORS.inkSoft, display: "flex", alignItems: "center", gap: 8 }}>
          {myGroup ? `Group ${myGroup}` : "Not grouped yet"}
          <RubricBadge classId={cls} />
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <Card style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: COLORS.inkSoft, marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Clock size={13} /> {data.timer.label || "Timer"}
          </div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 40, fontWeight: 700, color: remainSec === 0 && data.timer.durationSec > 0 ? COLORS.rose : COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
            {fmtTime(remainSec)}
          </div>
        </Card>

        {myGroup !== 0 && (
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <Users size={14} color={COLORS.gold} /> My group (Group {myGroup})
            </div>
            <div style={{ fontSize: 13, color: COLORS.inkSoft }}>
              {groupmates.length ? groupmates.map((g) => g.name).join(", ") : "Just you so far"}
            </div>
          </Card>
        )}

        {mode !== "off" && (
          <Card style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <ClipboardCheck size={14} color={COLORS.gold} />
              {mode === "group" ? "Within-group scoring" : "Score your classmate"}
            </div>
            {isTarget ? (
              <div style={{ color: COLORS.inkSoft, fontSize: 13 }}>You're being scored right now — please wait.</div>
            ) : targets.length === 0 ? (
              <div style={{ color: COLORS.inkSoft, fontSize: 13 }}>No one for you to score this round.</div>
            ) : submitted ? (
              <div style={{ color: COLORS.teal, fontSize: 13, fontWeight: 700 }}>Submitted — thanks! Wait for your teacher to finalize this round.</div>
            ) : (
              <>
                {targets.map((t) => (
                  <div key={t.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${COLORS.line}` }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink, marginBottom: 8 }}>{t.name}</div>
                    {CRITERIA.map((c) => (
                      <div key={c.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: COLORS.inkSoft, width: 190 }}>{c.label}</span>
                        <input
                          type="range"
                          min={0}
                          max={SCALE_MAX}
                          value={(scores[t.id] && scores[t.id][c.key]) ?? Math.round(SCALE_MAX / 2)}
                          onChange={(e) => setScore(t.id, c.key, +e.target.value)}
                          style={{ flex: 1, margin: "0 10px" }}
                        />
                        <span style={{ fontSize: 12, color: COLORS.gold, fontWeight: 700, width: 16, textAlign: "right" }}>
                          {(scores[t.id] && scores[t.id][c.key]) ?? Math.round(SCALE_MAX / 2)}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
                <Button variant="gold" onClick={submitScores}>Submit scores</Button>
              </>
            )}
          </Card>
        )}

        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <LineChartIcon size={14} color={COLORS.gold} /> My ability profile
          </div>
          {latest ? (
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="70%">
                  <PolarGrid stroke={COLORS.line} />
                  <PolarAngleAxis dataKey="criterion" tick={{ fill: COLORS.inkSoft, fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, SCALE_MAX]} tick={{ fill: COLORS.inkSoft, fontSize: 10 }} />
                  <Radar dataKey="Score" stroke={COLORS.gold} fill={COLORS.gold} fillOpacity={0.35} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ color: COLORS.inkSoft, fontSize: 13 }}>No finalized scores yet.</div>
          )}
        </Card>

        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <LineChartIcon size={14} color={COLORS.teal} /> Score trend
          </div>
          {lineData.length > 0 ? (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData}>
                  <CartesianGrid stroke={COLORS.line} strokeDasharray="3 3" />
                  <XAxis dataKey="Round" tick={{ fill: COLORS.inkSoft, fontSize: 11 }} />
                  <YAxis domain={[0, SCALE_MAX]} tick={{ fill: COLORS.inkSoft, fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="Overall" stroke={COLORS.teal} strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ color: COLORS.inkSoft, fontSize: 13 }}>Once a few rounds are recorded, your trend line will show here.</div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------- root ----------

export default function App() {
  const [role, setRole] = useState("landing");

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const r = params.get("role");
      if (r === "teacher" || r === "student") setRole(r);
    } catch (e) {
      // no-op if URL access is unavailable
    }
  }, []);

  return (
    <div style={{ width: "100%", minHeight: "100vh", fontFamily: "-apple-system, 'Segoe UI', sans-serif" }}>
      {role === "landing" && <Landing onPick={setRole} />}
      {role === "teacher" && <TeacherView onBack={() => setRole("landing")} />}
      {role === "student" && <StudentView onBack={() => setRole("landing")} />}
    </div>
  );
}
