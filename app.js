"use strict";

/* ==========================================================================
   1. Configuration & Constants
   ========================================================================== */

const STORAGE_KEY = "ledger.expense-log.v1";

const PALETTE = [
  "#1b6846",
  "#8d3b32",
  "#234e86",
  "#0f6e6e",
  "#8a5a12",
  "#a33b6b",
  "#5c4d7a",
  "#b45309",
  "#3d6b2f",
  "#6f675e",
  "#7a4e2d",
  "#355c7d",
];

const FREQUENCY_LABELS = {
  once: "One-time",
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  monthly: "Monthly",
};

const STREAK_MILESTONES = [
  { days: 3, title: "3-Day Spark", desc: "Three consecutive days of tracking." },
  { days: 7, title: "Full Week", desc: "One full week of financial mindfulness." },
  { days: 14, title: "Bi-weekly Habit", desc: "Two full weeks without missing a beat." },
  { days: 30, title: "Monthly Master", desc: "30 straight days of logging or checking in." },
  { days: 60, title: "Steady Saver", desc: "Two months of consistent tracking." },
  { days: 100, title: "Centurion", desc: "100 consecutive days of clarity." },
];

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function seedCategories() {
  return [
    { id: "cat-groceries", name: "Groceries", kind: "expense", color: "#1b6846", fallback: false },
    { id: "cat-dining", name: "Dining", kind: "expense", color: "#8d3b32", fallback: false },
    { id: "cat-housing", name: "Housing", kind: "expense", color: "#234e86", fallback: false },
    { id: "cat-utilities", name: "Utilities", kind: "expense", color: "#0f6e6e", fallback: false },
    { id: "cat-transport", name: "Transport", kind: "expense", color: "#8a5a12", fallback: false },
    { id: "cat-health", name: "Healthcare", kind: "expense", color: "#a33b6b", fallback: false },
    { id: "cat-insurance", name: "Insurance", kind: "expense", color: "#7a4e2d", fallback: false },
    { id: "cat-debt", name: "Debt payments", kind: "expense", color: "#5c4d7a", fallback: false },
    { id: "cat-fun", name: "Entertainment", kind: "expense", color: "#b45309", fallback: false },
    { id: "cat-shopping", name: "Shopping", kind: "expense", color: "#3d6b2f", fallback: false },
    { id: "cat-other-exp", name: "Other", kind: "expense", color: "#6f675e", fallback: true },
    { id: "cat-paycheck", name: "Paycheck", kind: "income", color: "#1b6846", fallback: false },
    { id: "cat-other-inc", name: "Other income", kind: "income", color: "#355c7d", fallback: true },
  ];
}

/* ==========================================================================
   2. Formatting & Date Utilities
   ========================================================================== */

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

function money(cents) {
  return CURRENCY_FORMATTER.format((Number(cents) || 0) / 100);
}

function moneyInput(cents) {
  return ((Number(cents) || 0) / 100).toFixed(2);
}

function parseMoney(value, allowZero = false) {
  const cleaned = String(value ?? "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  if (!Number.isFinite(cents) || cents < 0 || (!allowZero && cents === 0)) return null;
  return cents;
}

function safeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color || "") ? color : "#6f675e";
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayISO() {
  return toISO(new Date());
}

function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(iso, days) {
  const date = parseISO(iso);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

function addMonths(iso, count) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1 + count, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toISO(new Date(target.getFullYear(), target.getMonth(), Math.min(d, lastDay)));
}

function nextOccurrenceDate(iso, frequency) {
  if (frequency === "weekly") return addDays(iso, 7);
  if (frequency === "biweekly") return addDays(iso, 14);
  if (frequency === "monthly") return addMonths(iso, 1);
  return null;
}

function endOfMonth(iso) {
  const date = parseISO(iso);
  return toISO(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function startOfWeek(iso) {
  const date = parseISO(iso);
  date.setDate(date.getDate() - date.getDay());
  return toISO(date);
}

function monthRange(anchor) {
  const start = `${anchor.slice(0, 7)}-01`;
  return { start, end: endOfMonth(start) };
}

function rangeFor(period, anchor) {
  if (period === "day") return { start: anchor, end: anchor };
  if (period === "week") {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 6) };
  }
  if (period === "biweekly") {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 13) };
  }
  return monthRange(anchor);
}

function eachDay(start, end) {
  const days = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

function formatDay(iso) {
  return parseISO(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatWeekday(iso) {
  return parseISO(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function periodLabel(period, anchor) {
  const { start, end } = rangeFor(period, anchor);
  if (period === "day") {
    return parseISO(start).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
  if (period === "week" || period === "biweekly") {
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    const leftOpts = sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
    const left = parseISO(start).toLocaleDateString("en-US", leftOpts);
    const right = parseISO(end).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${left} – ${right}`;
  }
  return parseISO(start).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function shiftAnchor(period, anchor, dir) {
  if (period === "day") return addDays(anchor, dir);
  if (period === "week") return addDays(anchor, dir * 7);
  if (period === "biweekly") return addDays(anchor, dir * 14);
  return addMonths(anchor, dir);
}

/* ==========================================================================
   3. Application State, Theme & Persistence
   ========================================================================== */

const ui = {
  view: "overview",
  period: "month",
  anchor: todayISO(),
  filter: "all",
  query: "",
};

let state = blankState();
let pendingImport = null;

const main = document.getElementById("main");
const dialog = document.getElementById("dialog");
const systemDarkQuery =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function blankState() {
  return {
    version: 1,
    categories: seedCategories(),
    transactions: [],
    debts: [],
    checkIns: [],
    settings: {
      monthlyGoalCents: 0,
      theme: "system",
    },
  };
}

function normalizeState(parsed) {
  if (!parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.transactions)) {
    return null;
  }
  const theme = ["light", "dark", "system"].includes(parsed.settings?.theme)
    ? parsed.settings.theme
    : "system";
  return {
    version: 1,
    categories: parsed.categories,
    transactions: parsed.transactions,
    debts: Array.isArray(parsed.debts) ? parsed.debts : [],
    checkIns: Array.isArray(parsed.checkIns) ? parsed.checkIns : [],
    settings: {
      monthlyGoalCents: Number(parsed.settings?.monthlyGoalCents) || 0,
      theme,
    },
  };
}

function resolveTheme(mode) {
  if (mode === "light" || mode === "dark") return mode;
  return systemDarkQuery && systemDarkQuery.matches ? "dark" : "light";
}

function applyTheme() {
  const mode = state.settings?.theme || "system";
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;

  const metaTheme = document.getElementById("meta-theme-color");
  if (metaTheme) {
    metaTheme.setAttribute("content", resolved === "dark" ? "#1c1916" : "#efe4d4");
  }

  document.querySelectorAll("[data-action='theme']").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.themeMode === mode));
  });
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const normalized = normalizeState(JSON.parse(raw));
    if (normalized) state = normalized;
  } catch {
    state = blankState();
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `ledger-backup-${todayISO()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function readImport(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const normalized = normalizeState(JSON.parse(String(reader.result)));
      if (!normalized) throw new Error("incomplete");
      pendingImport = normalized;
      openConfirm({
        title: "Restore backup?",
        body: "This replaces the categories, entries, debts, streak check-ins, and settings currently in this browser.",
        confirmLabel: "Restore",
        danger: true,
        onConfirm: () => {
          state = pendingImport;
          pendingImport = null;
          syncRecurringTransactions();
          save();
          applyTheme();
          closeDialog();
          render();
        },
      });
    } catch {
      openConfirm({
        title: "That file could not be read",
        body: "Choose a backup downloaded from Ledger.",
        confirmLabel: "OK",
        danger: false,
        onConfirm: closeDialog,
      });
    }
  };
  reader.readAsText(file);
}

/* ==========================================================================
   4. Domain Selectors, Bi-Weekly Recurrence & Streak Logic
   ========================================================================== */

function categoryById(id) {
  return state.categories.find((category) => category.id === id);
}

function categoriesOf(kind) {
  return state.categories.filter((category) => category.kind === kind);
}

function debtPaymentCategoryId() {
  const seeded = categoryById("cat-debt");
  if (seeded && seeded.kind === "expense") return seeded.id;
  const named = state.categories.find(
    (category) => category.kind === "expense" && category.name.toLowerCase() === "debt payments"
  );
  if (named) return named.id;
  const fallback = state.categories.find((category) => category.fallback && category.kind === "expense");
  return (fallback || categoriesOf("expense")[0]).id;
}

function inRange(tx, start, end) {
  return tx.date >= start && tx.date <= end;
}

function sumOf(list) {
  return list.reduce((total, tx) => total + tx.amountCents, 0);
}

function sortTransactionsDesc(a, b) {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
}

function periodTransactions() {
  const { start, end } = rangeFor(ui.period, ui.anchor);
  return state.transactions.filter((tx) => inRange(tx, start, end)).sort(sortTransactionsDesc);
}

function visibleTransactions() {
  const query = ui.query.trim().toLowerCase();
  return periodTransactions().filter((tx) => {
    if (ui.filter !== "all" && tx.type !== ui.filter) return false;
    if (!query) return true;
    const category = categoryById(tx.categoryId);
    const freqLabel = tx.frequency && tx.frequency !== "once" ? FREQUENCY_LABELS[tx.frequency] || "" : "";
    const haystack = `${category?.name || ""} ${tx.note || ""} ${freqLabel}`.toLowerCase();
    return haystack.includes(query);
  });
}

function thisMonthTransactions() {
  const { start, end } = monthRange(todayISO());
  return state.transactions.filter((tx) => inRange(tx, start, end));
}

function comparison() {
  const { start, end } = rangeFor(ui.period, ui.anchor);
  let currentStart = start;
  let currentEnd = end;
  let prevStart;
  let prevEnd;
  let label;

  if (ui.period === "day") {
    prevStart = prevEnd = addDays(start, -1);
    label = "yesterday";
  } else if (ui.period === "week") {
    prevStart = addDays(start, -7);
    prevEnd = addDays(end, -7);
    label = "last week";
  } else if (ui.period === "biweekly") {
    prevStart = addDays(start, -14);
    prevEnd = addDays(end, -14);
    label = "the previous two weeks";
  } else {
    const today = todayISO();
    const isCurrentMonth = today.slice(0, 7) === start.slice(0, 7);
    currentEnd = isCurrentMonth && today < end ? today : end;
    prevStart = addMonths(start, -1);
    const dayNum = Number(currentEnd.slice(8, 10));
    const prevMonthEnd = endOfMonth(prevStart);
    const capped = Math.min(dayNum, Number(prevMonthEnd.slice(8, 10)));
    prevEnd = `${prevStart.slice(0, 8)}${String(capped).padStart(2, "0")}`;
    label = isCurrentMonth ? "the same days last month" : "last month";
  }

  const spent = (from, to) =>
    sumOf(state.transactions.filter((tx) => tx.type === "expense" && inRange(tx, from, to)));

  return {
    current: spent(currentStart, currentEnd),
    previous: spent(prevStart, prevEnd),
    label,
  };
}

function deltaCopy() {
  const { current, previous, label } = comparison();
  if (current === 0 && previous === 0) return "";
  const diff = current - previous;
  if (diff === 0) return `Same spending as ${label}.`;
  if (diff > 0) return `Spent ${money(diff)} more than ${label}.`;
  return `Spent ${money(-diff)} less than ${label}.`;
}

function defaultEntryDate() {
  const { start, end } = rangeFor(ui.period, ui.anchor);
  const today = todayISO();
  if (today >= start && today <= end) return today;
  return ui.period === "month" ? end : start;
}

/**
 * Automatically materializes due recurring transactions (e.g. bi-weekly, weekly, monthly)
 * up through today so recurring paychecks/bills appear automatically.
 */
function syncRecurringTransactions() {
  const today = todayISO();
  let added = false;

  const recurringRoots = state.transactions.filter(
    (tx) => tx.frequency && tx.frequency !== "once" && !tx.recoupled
  );

  recurringRoots.forEach((source) => {
    let nextDate = nextOccurrenceDate(source.date, source.frequency);
    let safety = 0;
    while (nextDate && nextDate <= today && safety < 52) {
      safety += 1;
      const alreadySpawned = state.transactions.some(
        (item) =>
          (item.parentId === (source.parentId || source.id) || item.id === (source.parentId || source.id)) &&
          item.date === nextDate
      );
      if (!alreadySpawned) {
        state.transactions.push({
          id: uid(),
          createdAt: new Date().toISOString(),
          date: nextDate,
          amountCents: source.amountCents,
          categoryId: source.categoryId,
          note: source.note,
          type: source.type,
          frequency: source.frequency,
          parentId: source.parentId || source.id,
          debtId: null,
        });
        added = true;
      }
      nextDate = nextOccurrenceDate(nextDate, source.frequency);
    }
  });

  if (added) save();
}

function activeDatesSet() {
  const dates = new Set();
  state.transactions.forEach((tx) => {
    if (tx.date) dates.add(tx.date);
  });
  (state.checkIns || []).forEach((iso) => {
    if (iso) dates.add(iso);
  });
  return dates;
}

function computeStreakStats() {
  const dates = activeDatesSet();
  const today = todayISO();
  const yesterday = addDays(today, -1);

  let current = 0;
  let cursor = dates.has(today) ? today : dates.has(yesterday) ? yesterday : null;
  while (cursor && dates.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  const sorted = [...dates].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  sorted.forEach((iso) => {
    if (prev && addDays(prev, 1) === iso) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = iso;
  });

  return {
    current,
    longest,
    totalDays: dates.size,
    checkedInToday: dates.has(today),
    dates,
  };
}

function payoffPlan(debt) {
  const payment = debt.minPaymentCents;
  if (!payment) return null;
  const balance = debt.balanceCents / 100;
  const monthly = payment / 100;
  const rate = (Number(debt.apr) || 0) / 100 / 12;
  if (monthly <= 0) return null;
  if (rate === 0) {
    return { months: Math.ceil(balance / monthly), interestCents: 0 };
  }
  if (monthly <= balance * rate + 0.004) {
    return { months: Infinity, interestCents: Infinity };
  }
  const months = Math.ceil(-Math.log(1 - (rate * balance) / monthly) / Math.log(1 + rate));
  let remaining = balance;
  let interest = 0;
  for (let i = 0; i < months && i < 1200; i += 1) {
    const charge = remaining * rate;
    interest += charge;
    remaining = remaining + charge - monthly;
  }
  return { months, interestCents: Math.round(interest * 100) };
}

function payoffSentence(debt) {
  if (debt.balanceCents === 0) return "Nothing left on this balance.";
  const plan = payoffPlan(debt);
  if (!plan) return "Add a minimum payment to estimate a payoff date.";
  if (!Number.isFinite(plan.months)) return "That minimum does not cover monthly interest.";
  const years = Math.floor(plan.months / 12);
  const months = plan.months % 12;
  const parts = [];
  if (years) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  const time = parts.join(" and ") || "under a month";
  const interest = plan.interestCents > 0 ? ` Interest would be about ${money(plan.interestCents)}.` : "";
  return `At the minimum, payoff takes about ${time}.${interest}`;
}

function syncDebtPayment(debtId, previousCents, nextCents) {
  const debt = state.debts.find((item) => item.id === debtId);
  if (!debt) return nextCents;
  const available = debt.balanceCents + previousCents;
  const applied = Math.max(0, Math.min(nextCents, available));
  debt.balanceCents = available - applied;
  return applied;
}

function highestAprDebt() {
  return state.debts
    .filter((debt) => debt.balanceCents > 0 && Number(debt.apr) > 0)
    .sort((a, b) => Number(b.apr) - Number(a.apr))[0];
}

function upsertTransaction(existing, data) {
  const previous = existing ? existing.amountCents : 0;
  const previousDebt = existing ? existing.debtId : null;
  if (previousDebt && (previousDebt !== data.debtId || data.type !== "expense")) {
    syncDebtPayment(previousDebt, previous, 0);
    data.debtId = data.debtId === previousDebt ? null : data.debtId;
  }
  let amount = data.amountCents;
  if (data.debtId && data.type === "expense") {
    const prior = existing && existing.debtId === data.debtId ? existing.amountCents : 0;
    const applied = syncDebtPayment(data.debtId, prior, amount);
    if (applied !== amount) {
      syncDebtPayment(data.debtId, applied, prior);
      return "That payment is larger than the remaining balance.";
    }
    amount = applied;
  }
  const record = existing || {
    id: uid(),
    createdAt: new Date().toISOString(),
  };
  record.date = data.date;
  record.amountCents = amount;
  record.categoryId = data.categoryId;
  record.note = data.note;
  record.type = data.type;
  record.frequency = data.frequency || "once";
  record.debtId = data.type === "expense" ? data.debtId || null : null;
  if (!existing) state.transactions.push(record);
  syncRecurringTransactions();
  return "";
}

/* ==========================================================================
   5. View Templates & Renderers
   ========================================================================== */

const PAGE_RENDERERS = {
  overview: renderOverview,
  log: renderLog,
  debts: renderDebts,
  streak: renderStreak,
  categories: renderCategories,
};

function render() {
  const active = document.activeElement;
  const activeId = active && active.id;
  const caret = active && typeof active.selectionStart === "number" ? active.selectionStart : null;

  document.querySelectorAll(".nav button").forEach((button) => {
    if (button.dataset.view === ui.view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  applyTheme();

  const renderPage = PAGE_RENDERERS[ui.view] || renderOverview;
  main.innerHTML = renderPage() + renderFooter();

  if (activeId) {
    const next = document.getElementById(activeId);
    if (next) {
      next.focus();
      if (caret != null && next.setSelectionRange) next.setSelectionRange(caret, caret);
    }
  }
}

function renderFooter() {
  return `
    <footer class="foot">
      <p>Entries stay in this browser on this computer.</p>
      <button class="ghost" type="button" data-action="export">Download backup</button>
      <button class="ghost" type="button" data-action="pick-import">Restore backup</button>
      <input id="import-file" type="file" accept="application/json,.json" hidden />
    </footer>
  `;
}

function statCard(label, cents, tone = "", text = null) {
  const shown = text != null ? esc(text) : money(cents);
  const cls = tone ? `stat ${tone}` : "stat";
  return `<article class="${cls}"><span>${esc(label)}</span><strong>${shown}</strong></article>`;
}

function renderLog() {
  const rows = visibleTransactions();
  const all = periodTransactions();
  const spent = sumOf(all.filter((tx) => tx.type === "expense"));
  const income = sumOf(all.filter((tx) => tx.type === "income"));
  const left = income - spent;
  const tone = income === 0 ? "" : left >= 0 ? "good" : "bad";
  const third = income === 0 ? statCard("Left over", 0, "", "—") : statCard("Left over", left, tone);
  const word =
    ui.period === "day"
      ? "day"
      : ui.period === "week"
        ? "week"
        : ui.period === "biweekly"
          ? "two-week stretch"
          : "month";
  const emptyCopy =
    all.length > 0 && rows.length === 0
      ? "No entries match your search or filter."
      : `Nothing logged for this ${word}.`;

  return `
    <section>
      <div class="page-head">
        <div>
          <h2>Expenses</h2>
          <p class="lede">Log what comes in and what goes out. Switch the view to a day, week, bi-weekly, or month.</p>
        </div>
        <div class="controls">${periodSwitch()}</div>
      </div>
      <div class="controls controls-bar">
        ${dateNavigator()}
        <input class="search" id="search" type="search" placeholder="Search notes or categories" value="${esc(ui.query)}" />
        ${filterSwitch()}
      </div>
      <div class="stats">${statCard("Spent", spent)}${statCard("Income", income)}${third}</div>
      <p class="delta">${esc(deltaCopy())}${income === 0 ? " Add income when you want to see what is left to save or send to debt." : ""}</p>
      <div class="layout">
        <div class="card">
          <h3>${ui.period === "day" ? "That day" : "By day"}</h3>
          ${renderSeries()}
          ${renderTxList(rows, emptyCopy)}
        </div>
        <aside class="card">
          <h3>By category</h3>
          ${renderCategoryBars(all.filter((tx) => tx.type === "expense"))}
        </aside>
      </div>
    </section>
  `;
}

function periodSwitch() {
  const periods = [
    ["day", "Day"],
    ["week", "Week"],
    ["biweekly", "Bi-weekly"],
    ["month", "Month"],
  ];
  const buttons = periods
    .map(([period, label]) => {
      const on = ui.period === period;
      return `<button type="button" data-action="period" data-period="${period}" aria-pressed="${on}">${label}</button>`;
    })
    .join("");
  return `<div class="seg" role="group" aria-label="Time span">${buttons}</div>`;
}

function dateNavigator() {
  return `
    <div class="date-nav">
      <button class="ghost" type="button" data-action="shift" data-dir="-1" aria-label="Previous">‹</button>
      <strong>${esc(periodLabel(ui.period, ui.anchor))}</strong>
      <button class="ghost" type="button" data-action="shift" data-dir="1" aria-label="Next">›</button>
      <button class="ghost" type="button" data-action="today">Today</button>
    </div>
  `;
}

function filterSwitch() {
  const options = [
    ["all", "All"],
    ["expense", "Expenses"],
    ["income", "Income"],
  ];
  const buttons = options
    .map(
      ([id, label]) =>
        `<button type="button" data-action="filter" data-filter="${id}" aria-pressed="${ui.filter === id}">${label}</button>`
    )
    .join("");
  return `<div class="filters" role="group" aria-label="Entry type">${buttons}</div>`;
}

function renderSeries() {
  const { start, end } = rangeFor(ui.period, ui.anchor);
  const days = eachDay(start, end);
  const totals = days.map((day) =>
    sumOf(state.transactions.filter((tx) => tx.type === "expense" && tx.date === day))
  );
  const max = Math.max(...totals, 1);
  const today = todayISO();

  const cols = days
    .map((day, index) => {
      const height = Math.round((totals[index] / max) * 100);
      const cls = totals[index] > 0 ? "bar has" : "bar";
      const todayCls = day === today ? " today" : "";
      const dayNum = Number(day.slice(8, 10));
      const label =
        ui.period === "week"
          ? parseISO(day).toLocaleDateString("en-US", { weekday: "narrow" })
          : ui.period === "biweekly"
            ? index % 2 === 0
              ? String(dayNum)
              : ""
            : ui.period === "month"
              ? dayNum === 1 || dayNum % 7 === 1
                ? String(dayNum)
                : ""
              : String(dayNum);
      const shown = totals[index] > 0 ? Math.max(height, 8) : 0;
      const title = esc(`${formatDay(day)} · ${money(totals[index])}`);
      return `
        <div class="bar-col">
          <div class="bar-track">
            <div class="${cls}${todayCls}" style="height:${shown}%" title="${title}"></div>
          </div>
          <span>${label}</span>
        </div>
      `;
    })
    .join("");

  return `<div class="series">${cols}</div>`;
}

function renderCategoryBars(expenses) {
  const totals = new Map();
  expenses.forEach((tx) => {
    totals.set(tx.categoryId, (totals.get(tx.categoryId) || 0) + tx.amountCents);
  });
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (!rows.length) return '<p class="empty">No spending in this stretch yet.</p>';

  const max = rows[0][1];
  const total = sumOf(expenses);

  return rows
    .map(([id, cents]) => {
      const category = categoryById(id);
      const name = category ? category.name : "Uncategorized";
      const color = safeColor(category && category.color);
      const pct = Math.round((cents / total) * 100);
      const width = Math.max(4, Math.round((cents / max) * 100));
      return `
        <div class="cat-row">
          <div><span class="swatch-dot" style="background:${color}"></span>${esc(name)}</div>
          <strong class="tx-amt">${money(cents)}</strong>
          <div class="meter"><span style="width:${width}%;background:${color}"></span></div>
          <span class="tx-meta">${pct}% of spending</span>
        </div>
      `;
    })
    .join("");
}

function renderTxList(rows, emptyCopy) {
  if (!rows.length) {
    return `
      <div class="empty">
        <p>${esc(emptyCopy)}</p>
        <button class="primary" type="button" data-action="add-transaction">Add entry</button>
      </div>
    `;
  }
  let html = "";
  let lastDate = "";
  rows.forEach((tx) => {
    if (ui.period !== "day" && tx.date !== lastDate) {
      lastDate = tx.date;
      html += `<p class="section-label">${esc(formatWeekday(tx.date))}</p>`;
    }
    html += txRow(tx);
  });
  return html;
}

function txRow(tx) {
  const category = categoryById(tx.categoryId);
  const name = category ? category.name : "Uncategorized";
  const color = safeColor(category && category.color);
  const amount = tx.type === "income" ? `+${money(tx.amountCents)}` : money(tx.amountCents);
  const noteText = esc(tx.note || (tx.type === "income" ? "Income" : "Expense"));
  const dateSuffix = ui.period === "day" ? "" : ` · ${esc(formatDay(tx.date))}`;
  const amtClass = tx.type === "income" ? "tx-amt income" : "tx-amt";
  const freqBadge =
    tx.frequency && tx.frequency !== "once" && FREQUENCY_LABELS[tx.frequency]
      ? `<span class="badge-pill">${esc(FREQUENCY_LABELS[tx.frequency])}</span>`
      : "";

  return `
    <article class="tx">
      <span class="dot" style="background:${color}"></span>
      <div>
        <div class="tx-title">${esc(name)}${freqBadge}</div>
        <div class="tx-meta">${noteText}${dateSuffix}</div>
      </div>
      <div class="tx-side">
        <div class="${amtClass}">${amount}</div>
        <div class="tx-actions">
          <button class="textish" type="button" data-action="edit-transaction" data-id="${esc(tx.id)}">Edit</button>
          <button class="textish danger-text" type="button" data-action="delete-transaction" data-id="${esc(tx.id)}">Delete</button>
        </div>
      </div>
    </article>
  `;
}

function renderOverview() {
  const month = thisMonthTransactions();
  const spent = sumOf(month.filter((tx) => tx.type === "expense"));
  const income = sumOf(month.filter((tx) => tx.type === "income"));
  const left = income - spent;
  const goal = state.settings.monthlyGoalCents;
  const monthName = parseISO(todayISO()).toLocaleDateString("en-US", { month: "long" });
  const owed = state.debts.reduce((total, debt) => total + debt.balanceCents, 0);
  const focus = highestAprDebt();
  const recent = state.transactions.slice().sort(sortTransactionsDesc).slice(0, 5);

  let goalBlock;
  if (!goal) {
    goalBlock = `
      <p class="hint">Set a monthly amount to keep, then measure what is left after spending.</p>
      <button class="ghost" type="button" data-action="set-goal">Set savings goal</button>
    `;
  } else if (income === 0) {
    goalBlock = `
      <p>Goal this month: <strong>${money(goal)}</strong>. Log income to see whether spending leaves that much.</p>
      <button class="ghost" type="button" data-action="set-goal">Change goal</button>
    `;
  } else {
    const pct = Math.max(0, Math.min(100, Math.round((left / goal) * 100)));
    const message =
      left >= goal
        ? `This month covers the savings goal, with ${money(left - goal)} still unassigned.`
        : left > 0
          ? `${money(goal - left)} still to find before the goal is covered.`
          : "Spending is ahead of income, so the goal is not covered yet.";
    goalBlock = `
      <p>Goal ${money(goal)} · left over ${money(left)}</p>
      <div class="goal-bar"><span style="width:${pct}%"></span></div>
      <p class="hint">${esc(message)}</p>
      <button class="ghost" type="button" data-action="set-goal">Change goal</button>
    `;
  }

  const debtHint = focus
    ? `Highest interest still open is ${focus.name} at ${Number(focus.apr)}%. Extra payments there cost less over time.`
    : owed > 0
      ? "Add an interest rate on a debt to see where an extra payment helps most."
      : "No balances yet. Add a debt when you want a payoff plan.";

  const leftCard =
    income === 0
      ? statCard("Left over", 0, "", "—")
      : statCard("Left over", left, left >= 0 ? "good" : "bad");

  return `
    <section>
      <div class="page-head">
        <div>
          <h2>${esc(monthName)}</h2>
          <p class="lede">A month-level look at spending, what you can keep, and the balances you are paying down.</p>
        </div>
      </div>
      <div class="stats">${statCard("Spent", spent)}${statCard("Income", income)}${leftCard}</div>
      <div class="layout">
        <div class="card">
          <h3>Savings goal</h3>
          ${goalBlock}
        </div>
        <aside class="card">
          <h3>Debts</h3>
          <p class="balance">${money(owed)}</p>
          <p class="hint">${esc(debtHint)}</p>
          <button class="ghost" type="button" data-action="view" data-view="debts">Open debts</button>
        </aside>
      </div>
      <div class="layout">
        <div class="card">
          <h3>Where ${esc(monthName)} went</h3>
          ${renderCategoryBars(month.filter((tx) => tx.type === "expense"))}
        </div>
        <aside class="card">
          <h3>Latest entries</h3>
          ${recent.length ? recent.map(txRow).join("") : '<p class="empty">Your log is empty. Add an expense to begin.</p>'}
        </aside>
      </div>
    </section>
  `;
}

function renderDebts() {
  const owed = state.debts.reduce((total, debt) => total + debt.balanceCents, 0);
  const minimums = state.debts.reduce(
    (total, debt) => total + (debt.balanceCents > 0 ? debt.minPaymentCents : 0),
    0
  );
  const paidDown = state.debts.reduce(
    (total, debt) => total + Math.max(0, debt.startingBalanceCents - debt.balanceCents),
    0
  );
  const cards = state.debts.length
    ? `<div class="debt-grid">${state.debts.map(debtCard).join("")}</div>`
    : '<div class="card"><p class="empty">Add a balance you want to pay off. A payment recorded here is also saved in the expense log under Debt payments.</p></div>';

  return `
    <section>
      <div class="page-head">
        <div>
          <h2>Debts</h2>
          <p class="lede">Track balances and record payments. The payoff line uses the minimum and the interest rate.</p>
        </div>
        <button class="primary" type="button" data-action="add-debt">Add debt</button>
      </div>
      <div class="stats">
        ${statCard("Still owed", owed)}
        ${statCard("Minimums", minimums)}
        ${statCard("Paid down", paidDown, "good")}
      </div>
      ${cards}
    </section>
  `;
}

function debtCard(debt) {
  const start = Math.max(debt.startingBalanceCents, debt.balanceCents, 1);
  const paidPct = Math.round(((start - debt.balanceCents) / start) * 100);
  const status =
    debt.balanceCents === 0
      ? '<p class="paid">Paid off</p>'
      : `<p class="balance">${money(debt.balanceCents)}</p>`;
  const payButton =
    debt.balanceCents > 0
      ? `<button class="primary" type="button" data-action="pay-debt" data-id="${esc(debt.id)}">Record payment</button>`
      : "";

  return `
    <article class="card debt-card">
      <div class="debt-top"><h3>${esc(debt.name)}</h3></div>
      ${status}
      <p class="kvs">
        <span>${Number(debt.apr) ? `${Number(debt.apr)}% APR` : "No APR"}</span>
        <span>Min ${debt.minPaymentCents ? money(debt.minPaymentCents) : "—"}</span>
      </p>
      <div class="progress" title="${paidPct}% of the original balance paid">
        <span style="width:${Math.max(0, paidPct)}%"></span>
      </div>
      <p class="hint">${esc(payoffSentence(debt))}</p>
      <div class="row-actions">
        ${payButton}
        <button class="ghost" type="button" data-action="edit-debt" data-id="${esc(debt.id)}">Edit</button>
        <button class="textish danger-text" type="button" data-action="delete-debt" data-id="${esc(debt.id)}">Delete</button>
      </div>
    </article>
  `;
}

function renderStreak() {
  const { current, longest, totalDays, checkedInToday, dates } = computeStreakStats();
  const today = todayISO();
  const endWeek = addDays(startOfWeek(today), 6);
  const startGrid = addDays(endWeek, -27);
  const gridDays = eachDay(startGrid, endWeek);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    .map((day) => `<div class="streak-weekday">${day}</div>`)
    .join("");

  const cells = gridDays
    .map((iso) => {
      const active = dates.has(iso);
      const isToday = iso === today;
      const dayNum = Number(iso.slice(8, 10));
      const cls = `streak-day${active ? " active" : ""}${isToday ? " today" : ""}`;
      const label = `${formatDay(iso)}${active ? " · Logged" : ""}`;
      return `<div class="${cls}" title="${esc(label)}"><span>${dayNum}</span></div>`;
    })
    .join("");

  const milestones = STREAK_MILESTONES.map((m) => {
    const unlocked = longest >= m.days;
    return `
      <div class="milestone${unlocked ? " unlocked" : ""}">
        <div>
          <strong>${esc(m.title)}</strong>
          <div class="tx-meta">${esc(m.desc)}</div>
        </div>
        <span class="badge-pill">${unlocked ? "Unlocked" : `${m.days} days`}</span>
      </div>
    `;
  }).join("");

  const checkInAction = checkedInToday
    ? `<span class="badge-pill">Checked in for today</span>`
    : `<button class="primary" type="button" data-action="checkin-today">Check in today (no-spend)</button>`;

  return `
    <section>
      <div class="page-head">
        <div>
          <h2>Streak</h2>
          <p class="lede">Build a daily habit of tracking your spending or checking in on no-spend days.</p>
        </div>
        <div class="controls">${checkInAction}</div>
      </div>
      <div class="stats">
        ${statCard("Current streak", 0, current > 0 ? "good" : "", `${current} ${current === 1 ? "day" : "days"}`)}
        ${statCard("Longest streak", 0, "", `${longest} ${longest === 1 ? "day" : "days"}`)}
        ${statCard("Active days", 0, "", `${totalDays} ${totalDays === 1 ? "day" : "days"}`)}
      </div>
      <div class="layout">
        <div class="card">
          <h3>Last 4 weeks</h3>
          <p class="hint">Days light up when you log an entry or record a no-spend check-in.</p>
          <div class="streak-calendar">
            ${weekdays}
            ${cells}
          </div>
        </div>
        <aside class="card">
          <h3>Milestones</h3>
          <div class="milestone-list">${milestones}</div>
        </aside>
      </div>
    </section>
  `;
}

function renderCategories() {
  const group = (kind, title) => {
    const items = categoriesOf(kind)
      .map((category) => {
        const count = state.transactions.filter((tx) => tx.categoryId === category.id).length;
        const entryLabel = count === 1 ? " entry" : " entries";
        const fallbackNote = category.fallback ? " · holds uncategorized items" : "";
        const deleteBtn = category.fallback
          ? ""
          : `<button class="textish danger-text" type="button" data-action="delete-category" data-id="${esc(category.id)}">Delete</button>`;

        return `
          <article class="card cat-card">
            <div>
              <div class="tx-title">
                <span class="swatch-dot" style="background:${safeColor(category.color)}"></span>${esc(category.name)}
              </div>
              <div class="tx-meta">${count}${entryLabel}${fallbackNote}</div>
            </div>
            <div class="row-actions">
              <button class="textish" type="button" data-action="edit-category" data-id="${esc(category.id)}">Edit</button>
              ${deleteBtn}
            </div>
          </article>
        `;
      })
      .join("");
    return `<h3 class="section-label">${esc(title)}</h3><div class="cat-grid">${items}</div>`;
  };

  return `
    <section>
      <div class="page-head">
        <div>
          <h2>Categories</h2>
          <p class="lede">Group spending and income so the month is easy to read. Other is kept so entries always have a home.</p>
        </div>
        <button class="primary" type="button" data-action="add-category">Add category</button>
      </div>
      ${group("expense", "Expenses")}
      ${group("income", "Income")}
    </section>
  `;
}

/* ==========================================================================
   6. Modal Dialogs & Form Builders
   ========================================================================== */

function clearDialogState() {
  delete dialog.dataset.txId;
  delete dialog.dataset.txType;
  delete dialog.dataset.catId;
  delete dialog.dataset.catKind;
  delete dialog.dataset.debtId;
  delete dialog.dataset.payDebtId;
  delete dialog.dataset.confirm;
  dialog._confirm = null;
}

function openDialog(html) {
  clearDialogState();
  dialog.innerHTML = `<div class="dialog-body">${html}</div>`;
  if (!dialog.open) dialog.showModal();
}

function closeDialog() {
  pendingImport = null;
  clearDialogState();
  if (dialog.open) dialog.close();
}

function formError(message = "") {
  return `<p class="error" id="form-error"${message ? "" : " hidden"}>${esc(message)}</p>`;
}

function showFormError(message) {
  const node = document.getElementById("form-error");
  if (!node) return;
  node.hidden = !message;
  node.textContent = message || "";
}

function categoryOptions(kind, selectedId) {
  return categoriesOf(kind)
    .map(
      (category) =>
        `<option value="${esc(category.id)}"${category.id === selectedId ? " selected" : ""}>${esc(category.name)}</option>`
    )
    .join("");
}

function frequencyOptions(selectedFreq = "once") {
  return Object.entries(FREQUENCY_LABELS)
    .map(
      ([value, label]) =>
        `<option value="${value}"${value === selectedFreq ? " selected" : ""}>${esc(label)}</option>`
    )
    .join("");
}

function colorPicker(selected) {
  const current = PALETTE.includes(selected) ? selected : PALETTE[0];
  const swatches = PALETTE.map(
    (color) => `
      <label class="swatch">
        <input type="radio" name="color" value="${color}"${color === current ? " checked" : ""} />
        <span style="background:${color}"></span>
      </label>
    `
  ).join("");
  return `<div class="swatches">${swatches}</div>`;
}

function openTransactionDialog(existing) {
  const tx = existing || {
    type: "expense",
    amountCents: 0,
    date: defaultEntryDate(),
    categoryId: "",
    frequency: "once",
    note: "",
  };
  const selected = tx.categoryId || categoriesOf(tx.type)[0]?.id || "";
  const selectedFreq = tx.frequency || "once";

  openDialog(`
    <h2 id="dialog-title">${existing ? "Edit entry" : "Add entry"}</h2>
    <p class="lede">Expenses track spending. Income shows what is left for savings and debt.</p>
    <form id="tx-form">
      <div class="seg full" role="group" aria-label="Entry type">
        <button type="button" data-action="tx-type" data-type="expense" aria-pressed="${tx.type === "expense"}">Expense</button>
        <button type="button" data-action="tx-type" data-type="income" aria-pressed="${tx.type === "income"}">Income</button>
      </div>
      ${formError()}
      <div class="row2">
        <label class="field">
          <span>Amount</span>
          <input name="amount" inputmode="decimal" required value="${existing ? moneyInput(tx.amountCents) : ""}" placeholder="0.00" />
        </label>
        <label class="field">
          <span>Date</span>
          <input name="date" type="date" required value="${esc(tx.date)}" />
        </label>
      </div>
      <div class="row2">
        <label class="field">
          <span>Category</span>
          <select name="category" id="tx-category">${categoryOptions(tx.type, selected)}</select>
        </label>
        <label class="field">
          <span>Frequency</span>
          <select name="frequency" id="tx-frequency">${frequencyOptions(selectedFreq)}</select>
        </label>
      </div>
      <label class="field">
        <span>Note</span>
        <input name="note" maxlength="140" value="${esc(tx.note || "")}" placeholder="Store, bill, or bi-weekly paycheck" />
      </label>
      <div class="dialog-actions">
        <button class="ghost" type="button" data-action="close-dialog">Cancel</button>
        <button class="primary" type="submit">${existing ? "Save" : "Add"}</button>
      </div>
    </form>
  `);
  dialog.dataset.txId = existing ? existing.id : "";
  dialog.dataset.txType = tx.type;
}

function openCategoryDialog(existing) {
  const category = existing || { name: "", kind: "expense", color: PALETTE[0], fallback: false };
  const kindSelector = category.fallback
    ? `<p class="hint">This category stays as ${esc(category.kind)} so uncategorized entries have a home.</p>`
    : `
      <div class="seg full">
        <button type="button" data-action="cat-kind" data-kind="expense" aria-pressed="${category.kind === "expense"}">Expense</button>
        <button type="button" data-action="cat-kind" data-kind="income" aria-pressed="${category.kind === "income"}">Income</button>
      </div>
    `;

  openDialog(`
    <h2 id="dialog-title">${existing ? "Edit category" : "Add category"}</h2>
    <form id="cat-form">
      ${formError()}
      <label class="field">
        <span>Name</span>
        <input name="name" maxlength="40" required value="${esc(category.name)}" />
      </label>
      ${kindSelector}
      <label class="field">
        <span>Color</span>
        ${colorPicker(category.color)}
      </label>
      <div class="dialog-actions">
        <button class="ghost" type="button" data-action="close-dialog">Cancel</button>
        <button class="primary" type="submit">Save</button>
      </div>
    </form>
  `);
  dialog.dataset.catId = existing ? existing.id : "";
  dialog.dataset.catKind = category.kind;
}

function openDebtDialog(existing) {
  const debt = existing || { name: "", balanceCents: 0, apr: "", minPaymentCents: 0 };
  const aprVal = debt.apr === 0 || debt.apr ? esc(debt.apr) : "";
  const minVal = debt.minPaymentCents ? moneyInput(debt.minPaymentCents) : "";

  openDialog(`
    <h2 id="dialog-title">${existing ? "Edit debt" : "Add debt"}</h2>
    <p class="lede">Use the current balance. Editing the balance is a correction, not a payment.</p>
    <form id="debt-form">
      ${formError()}
      <label class="field">
        <span>Name</span>
        <input name="name" maxlength="40" required value="${esc(debt.name)}" />
      </label>
      <div class="row2">
        <label class="field">
          <span>Balance</span>
          <input name="balance" inputmode="decimal" required value="${existing ? moneyInput(debt.balanceCents) : ""}" />
        </label>
        <label class="field">
          <span>APR %</span>
          <input name="apr" inputmode="decimal" value="${aprVal}" placeholder="0" />
        </label>
      </div>
      <label class="field">
        <span>Minimum payment</span>
        <input name="minimum" inputmode="decimal" value="${minVal}" placeholder="Optional" />
      </label>
      <div class="dialog-actions">
        <button class="ghost" type="button" data-action="close-dialog">Cancel</button>
        <button class="primary" type="submit">Save</button>
      </div>
    </form>
  `);
  dialog.dataset.debtId = existing ? existing.id : "";
}

function openPaymentDialog(debt) {
  const defaultAmount = debt.minPaymentCents
    ? moneyInput(Math.min(debt.minPaymentCents, debt.balanceCents))
    : "";

  openDialog(`
    <h2 id="dialog-title">Payment toward ${esc(debt.name)}</h2>
    <p class="lede">This lowers the balance and adds an expense in Debt payments.</p>
    <form id="pay-form">
      ${formError()}
      <div class="row2">
        <label class="field">
          <span>Amount</span>
          <input name="amount" inputmode="decimal" required value="${defaultAmount}" />
        </label>
        <label class="field">
          <span>Date</span>
          <input name="date" type="date" required value="${todayISO()}" />
        </label>
      </div>
      <label class="field">
        <span>Note</span>
        <input name="note" maxlength="140" value="${esc(`Payment toward ${debt.name}`)}" />
      </label>
      <div class="dialog-actions">
        <button class="ghost" type="button" data-action="close-dialog">Cancel</button>
        <button class="primary" type="submit">Record payment</button>
      </div>
    </form>
  `);
  dialog.dataset.payDebtId = debt.id;
}

function openGoalDialog() {
  const currentGoal = state.settings.monthlyGoalCents
    ? moneyInput(state.settings.monthlyGoalCents)
    : "";

  openDialog(`
    <h2 id="dialog-title">Monthly savings goal</h2>
    <p class="lede">The amount you want left after this month’s spending.</p>
    <form id="goal-form">
      ${formError()}
      <label class="field">
        <span>Goal amount</span>
        <input name="amount" inputmode="decimal" required value="${currentGoal}" placeholder="0.00" />
      </label>
      <div class="dialog-actions">
        <button class="ghost" type="button" data-action="close-dialog">Cancel</button>
        <button class="primary" type="submit">Save goal</button>
      </div>
    </form>
  `);
}

function openConfirm({ title, body, confirmLabel, danger, onConfirm }) {
  openDialog(`
    <h2 id="dialog-title">${esc(title)}</h2>
    <p class="lede">${esc(body)}</p>
    <div class="dialog-actions">
      <button class="ghost" type="button" data-action="close-dialog">Cancel</button>
      <button class="${danger ? "danger" : "primary"}" type="button" data-action="confirm">${esc(confirmLabel)}</button>
    </div>
  `);
  dialog.dataset.confirm = "1";
  dialog._confirm = onConfirm;
}

/* ==========================================================================
   7. Form Submissions & Event Dispatchers
   ========================================================================== */

function handleTransactionSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const amount = parseMoney(form.amount.value);
  if (!amount) return showFormError("Enter an amount greater than zero, like 12.50.");
  const date = form.date.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return showFormError("Choose a date.");
  const categoryId = form.category.value;
  const category = categoryById(categoryId);
  const type = dialog.dataset.txType || "expense";
  if (!category || category.kind !== type) return showFormError("Choose a category.");
  const frequency = form.frequency && FREQUENCY_LABELS[form.frequency.value] ? form.frequency.value : "once";

  const existing = state.transactions.find((tx) => tx.id === dialog.dataset.txId);
  const error = upsertTransaction(existing, {
    amountCents: amount,
    date,
    categoryId,
    frequency,
    note: form.note.value.trim(),
    type,
    debtId: existing ? existing.debtId : null,
  });
  if (error) return showFormError(error);

  save();
  closeDialog();
  render();
}

function handleCategorySubmit(event) {
  event.preventDefault();
  const form = event.target;
  const name = form.name.value.trim();
  if (!name) return showFormError("Name the category.");
  const kind = dialog.dataset.catKind || "expense";
  const color = (form.color && form.color.value) || PALETTE[0];
  const existing = state.categories.find((category) => category.id === dialog.dataset.catId);

  const duplicate = state.categories.some(
    (category) =>
      category !== existing &&
      category.kind === kind &&
      category.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) return showFormError(`You already have a ${kind} category with that name.`);
  if (existing && existing.fallback && kind !== existing.kind) {
    return showFormError("This category’s type stays fixed.");
  }

  if (existing && existing.kind !== kind) {
    state.transactions.forEach((tx) => {
      if (tx.categoryId !== existing.id) return;
      if (kind === "income" && tx.debtId && tx.type === "expense") {
        syncDebtPayment(tx.debtId, tx.amountCents, 0);
        tx.debtId = null;
      }
      tx.type = kind;
    });
  }

  if (existing) {
    existing.name = name;
    existing.kind = kind;
    existing.color = color;
  } else {
    state.categories.push({ id: uid(), name, kind, color, fallback: false });
  }

  save();
  closeDialog();
  render();
}

function handleDebtSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const name = form.name.value.trim();
  if (!name) return showFormError("Name the debt.");
  const balance = parseMoney(form.balance.value, true);
  if (balance == null) return showFormError("Enter the current balance.");

  let apr = 0;
  if (String(form.apr.value).trim()) {
    const parsed = Number(String(form.apr.value).trim());
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      return showFormError("APR should be between 0 and 100.");
    }
    apr = Math.round(parsed * 100) / 100;
  }

  let minPaymentCents = 0;
  if (String(form.minimum.value).trim()) {
    minPaymentCents = parseMoney(form.minimum.value);
    if (!minPaymentCents) {
      return showFormError("Minimum payment should look like 50.00, or be left blank.");
    }
  }

  const existing = state.debts.find((debt) => debt.id === dialog.dataset.debtId);
  if (existing) {
    existing.name = name;
    existing.balanceCents = balance;
    existing.apr = apr;
    existing.minPaymentCents = minPaymentCents;
    if (balance > existing.startingBalanceCents) existing.startingBalanceCents = balance;
  } else {
    state.debts.push({
      id: uid(),
      name,
      balanceCents: balance,
      apr,
      minPaymentCents,
      startingBalanceCents: balance,
    });
  }

  save();
  closeDialog();
  render();
}

function handlePaymentSubmit(event) {
  event.preventDefault();
  const debt = state.debts.find((item) => item.id === dialog.dataset.payDebtId);
  if (!debt) return closeDialog();
  const form = event.target;
  const amount = parseMoney(form.amount.value);
  if (!amount) return showFormError("Enter a payment greater than zero.");
  if (amount > debt.balanceCents) {
    return showFormError(`That is more than the remaining ${money(debt.balanceCents)}.`);
  }
  const date = form.date.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return showFormError("Choose a date.");

  const error = upsertTransaction(null, {
    amountCents: amount,
    date,
    categoryId: debtPaymentCategoryId(),
    frequency: "once",
    note: form.note.value.trim(),
    type: "expense",
    debtId: debt.id,
  });
  if (error) return showFormError(error);

  save();
  closeDialog();
  ui.view = "debts";
  render();
}

function handleGoalSubmit(event) {
  event.preventDefault();
  const amount = parseMoney(event.target.amount.value);
  if (!amount) return showFormError("Enter a goal greater than zero.");
  state.settings.monthlyGoalCents = amount;
  save();
  closeDialog();
  render();
}

const ACTION_HANDLERS = {
  view(button) {
    ui.view = button.dataset.view;
    closeDialog();
    render();
  },
  theme(button) {
    const mode = button.dataset.themeMode;
    if (["light", "dark", "system"].includes(mode)) {
      state.settings.theme = mode;
      save();
      applyTheme();
    }
  },
  "checkin-today"() {
    const today = todayISO();
    if (!Array.isArray(state.checkIns)) state.checkIns = [];
    if (!state.checkIns.includes(today)) {
      state.checkIns.push(today);
      save();
      render();
    }
  },
  period(button) {
    ui.period = button.dataset.period;
    render();
  },
  shift(button) {
    ui.anchor = shiftAnchor(ui.period, ui.anchor, Number(button.dataset.dir));
    render();
  },
  today() {
    ui.anchor = todayISO();
    render();
  },
  filter(button) {
    ui.filter = button.dataset.filter;
    render();
  },
  "add-transaction"() {
    openTransactionDialog(null);
  },
  "edit-transaction"(button) {
    const tx = state.transactions.find((item) => item.id === button.dataset.id);
    if (tx) openTransactionDialog(tx);
  },
  "delete-transaction"(button) {
    const tx = state.transactions.find((item) => item.id === button.dataset.id);
    if (!tx) return;
    openConfirm({
      title: "Delete this entry?",
      body: `${money(tx.amountCents)}${tx.note ? ` · ${tx.note}` : ""} will be removed from the log.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => {
        if (tx.debtId && tx.type === "expense") syncDebtPayment(tx.debtId, tx.amountCents, 0);
        state.transactions = state.transactions.filter((item) => item.id !== tx.id);
        save();
        closeDialog();
        render();
      },
    });
  },
  "tx-type"(button) {
    dialog.dataset.txType = button.dataset.type;
    dialog.querySelectorAll("[data-action='tx-type']").forEach((node) => {
      node.setAttribute("aria-pressed", String(node === button));
    });
    const select = document.getElementById("tx-category");
    if (select) select.innerHTML = categoryOptions(button.dataset.type, "");
  },
  "add-category"() {
    openCategoryDialog(null);
  },
  "edit-category"(button) {
    const category = categoryById(button.dataset.id);
    if (category) openCategoryDialog(category);
  },
  "cat-kind"(button) {
    dialog.dataset.catKind = button.dataset.kind;
    dialog.querySelectorAll("[data-action='cat-kind']").forEach((node) => {
      node.setAttribute("aria-pressed", String(node === button));
    });
  },
  "delete-category"(button) {
    const category = categoryById(button.dataset.id);
    if (!category || category.fallback) return;
    const affected = state.transactions.filter((tx) => tx.categoryId === category.id);
    const fallback = state.categories.find(
      (item) => item.fallback && item.kind === category.kind
    );
    const moveWord = affected.length === 1 ? "entry will move" : "entries will move";
    openConfirm({
      title: `Delete ${category.name}?`,
      body: affected.length
        ? `${affected.length} ${moveWord} to ${fallback ? fallback.name : "another category"}.`
        : "No entries use this category.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => {
        if (fallback) {
          affected.forEach((tx) => {
            tx.categoryId = fallback.id;
          });
        }
        state.categories = state.categories.filter((item) => item.id !== category.id);
        save();
        closeDialog();
        render();
      },
    });
  },
  "add-debt"() {
    openDebtDialog(null);
  },
  "edit-debt"(button) {
    const debt = state.debts.find((item) => item.id === button.dataset.id);
    if (debt) openDebtDialog(debt);
  },
  "delete-debt"(button) {
    const debt = state.debts.find((item) => item.id === button.dataset.id);
    if (!debt) return;
    openConfirm({
      title: `Delete ${debt.name}?`,
      body: "The balance leaves the debt list. Payments already in the expense log stay there.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => {
        state.transactions.forEach((tx) => {
          if (tx.debtId === debt.id) tx.debtId = null;
        });
        state.debts = state.debts.filter((item) => item.id !== debt.id);
        save();
        closeDialog();
        render();
      },
    });
  },
  "pay-debt"(button) {
    const debt = state.debts.find((item) => item.id === button.dataset.id);
    if (debt) openPaymentDialog(debt);
  },
  "set-goal"() {
    openGoalDialog();
  },
  export() {
    exportData();
  },
  "pick-import"() {
    const input = document.getElementById("import-file");
    if (input) input.click();
  },
  "close-dialog"() {
    closeDialog();
  },
  confirm() {
    if (typeof dialog._confirm === "function") {
      const run = dialog._confirm;
      dialog._confirm = null;
      run();
    }
  },
};

const FORM_HANDLERS = {
  "tx-form": handleTransactionSubmit,
  "cat-form": handleCategorySubmit,
  "debt-form": handleDebtSubmit,
  "pay-form": handlePaymentSubmit,
  "goal-form": handleGoalSubmit,
};

function onClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const handler = ACTION_HANDLERS[button.dataset.action];
  if (handler) handler(button);
}

function onSubmit(event) {
  const handler = FORM_HANDLERS[event.target.id];
  if (handler) handler(event);
}

function onInput(event) {
  if (event.target.id === "search") {
    ui.query = event.target.value;
    render();
  }
}

function onChange(event) {
  if (event.target.id === "import-file" && event.target.files?.[0]) {
    const file = event.target.files[0];
    event.target.value = "";
    readImport(file);
  }
}

if (systemDarkQuery && systemDarkQuery.addEventListener) {
  systemDarkQuery.addEventListener("change", () => {
    if ((state.settings?.theme || "system") === "system") {
      applyTheme();
    }
  });
}

document.body.addEventListener("click", onClick);
document.body.addEventListener("submit", onSubmit);
document.body.addEventListener("input", onInput);
document.body.addEventListener("change", onChange);
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog();
});

load();
syncRecurringTransactions();
applyTheme();
render();
