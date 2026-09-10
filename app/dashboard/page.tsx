"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LEAD_CSV_HEADERS, LEAD_FIELD_LABELS, LEAD_FIELD_REQUIRED, MAX_LEAD_FILE_BYTES, MissingHeadersError, buildLeadRowsFromMapping, describeColumnOptions, findMappingConflicts, guessColumnMapping, leadRowsToCsv, parseWaalaxyContactsCsv, rowsToCsv, validateAndParseLeadsCsv, type ColumnMapping, type LeadField } from "@/lib/csv";

type Campaign = { id: string; name: string; audience: string; status: string; progress: number; client?: string; clientId?: string; submittedAt?: string; connectionsSent: number; connectionsAccepted: number; repliesReceived: number };
type Account = { id: string; fullName: string; email: string; role: string; createdAt: string };
type Alert = { id: string; clientId: string; campaignId: string | null; leadReference: string | null; severity: string; message: string; resolved: boolean; createdAt: string };

const STATUS_OPTIONS = ["Submitted", "In review", "In setup", "Live", "Completed"];

// Preset swatches for lead categories (Hot/Cold/etc) -- a fixed palette
// rather than a free-form color picker, so every client's labels stay
// visually consistent with the rest of the app instead of introducing
// arbitrary colors.
const LEAD_CATEGORY_COLORS = ["#C2410C", "#3B5BDB", "#1F8F5D", "#6D3FD1", "#B42318", "#0F766E", "#A16207", "#656c68"];

function defaultCampaignForm() {
  return { name: "", goal: "Book qualified discovery calls", offer: "", tone: "Warm, credible, and concise", message: "", connectionNote: "", followUpCount: 1, followUps: ["", "", ""] };
}

const CLIENT_FAQS = [
  { q: "What happens after I submit a campaign?", a: "Your brief, lead list, and message sequence go straight to the Myntmore team. We review it and configure your sequence, moving your campaign from “Submitted” to “In review” and then “In setup.” You'll see the status update on your dashboard, and outreach typically goes live within one business day." },
  { q: "What columns does my lead list CSV need?", a: "first_name, last_name, job_title, company, linkedin_url, email, notes, exactly matching the template you can download in step 2 of the campaign wizard. Every row needs a linkedin_url; rows without one won't be imported." },
  { q: "How many follow-up messages can I include?", a: "Up to three, plus your connection request note. Pick 1–3 follow-ups when you build your sequence in step 3." },
  { q: "Can I personalize my messages?", a: "Yes. Insert {{first_name}}, {{last_name}}, or {{company}} anywhere in your connection note or follow-ups, and we'll swap in each lead's real details when the sequence sends." },
  { q: "What do the campaign statuses mean?", a: "Submitted → In review → In setup → Live → Completed. “In review” means we're checking your brief and leads, “In setup” means we're configuring your sequence, and “Live” means outreach is actively sending." },
  { q: "Can I edit a campaign after I submit it?", a: "Not directly from your dashboard yet. Reach out to your Myntmore contact and we'll make the change before it goes live." },
  { q: "My CSV upload failed. What do I do?", a: "Nothing is submitted until both your brief and CSV are saved successfully. Correct the message shown in the campaign wizard and submit again, or contact your Myntmore representative if the issue continues." },
  { q: "Is my data kept private?", a: "Yes. Your lead lists and campaign details are only visible to your team and Myntmore, never shared with other clients." },
  { q: "How do I download the lead list template?", a: "In step 2 of the campaign wizard, click “Download CSV” on the template card. It includes the exact columns we need, with an example row." },
  { q: "Is there a file size limit for my CSV?", a: "Yes, up to 10 MB per file. That's plenty for most lead lists. If yours is larger, split it across two campaigns or check in with your Myntmore contact." },
  { q: "Is there a character limit on my connection note?", a: "300 characters, matching LinkedIn's own connection note limit. You'll see a live counter while you type in step 3." },
  { q: "Can I submit more than one campaign?", a: "Yes. Use “+ New campaign” any time. Each one is tracked separately under “Your campaigns” with its own status and progress." },
  { q: "What does “Active rate” mean on my dashboard?", a: "The share of your campaigns that are still moving: anything not yet marked Completed, divided by your total campaign count." },
  { q: "What does “Avg. progress” mean?", a: "The average progress percentage across all your campaigns, updated by the Myntmore team as each one moves through setup and delivery." },
  { q: "What's the difference between the connection note and follow-ups?", a: "The connection note is the first message sent with your LinkedIn invite. Follow-ups are the messages sent afterward, once someone accepts. You can configure up to three." },
  { q: "Can multiple people from my company have logins?", a: "Yes, but each person needs their own account. Ask your Myntmore contact to set one up. Everyone only sees the campaigns submitted from their own login." },
  { q: "Can I download the CSV I already uploaded?", a: "Not yet from the dashboard directly. Reach out to your Myntmore contact if you need a copy of a lead list you've submitted." },
  { q: "What happens to my lead list file after I upload it?", a: "It's stored privately and is only ever accessible to your account and the Myntmore team. It's never bundled with or visible to other clients." },
];

const ADMIN_FAQS = [
  { q: "How do I move a campaign through statuses?", a: "Open the “⋯” menu on any campaign row in the work queue. The Manage campaign panel has a status dropdown and a progress slider." },
  { q: "How do I sync a client's leads to Waalaxy?", a: "Same “⋯” menu, in the Waalaxy sync section. Create the campaign and message sequence in Waalaxy first, then link it here and push the client's uploaded leads in." },
  { q: "How do I manage client accounts?", a: "Use “User accounts” in the sidebar to see every account, change roles, or revoke Outreach access." },
];

async function readLeadFile(file: File) {
  if (file.size > MAX_LEAD_FILE_BYTES) throw new Error("Your CSV is larger than 10 MB. Please split the list and try again.");
  return validateAndParseLeadsCsv(await file.text());
}

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error("The server returned an unexpected response. Please try again.");
  return response.json() as Promise<T>;
}

function Ring({ percent, track, indicator, size = 96 }: { percent: number; track: string; indicator: string; size?: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, percent)) / 100);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={radius} fill="none" stroke={track} strokeWidth="9" />
      <circle cx="50" cy="50" r={radius} fill="none" stroke={indicator} strokeWidth="9" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 50 50)" />
    </svg>
  );
}

type IconName = "grid" | "users" | "file" | "help" | "logout" | "arrowUpRight" | "chevronDown" | "trendUp" | "eye" | "percent" | "dots" | "send" | "plus" | "alertTriangle" | "checkCircle" | "tag";

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "grid": return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></svg>;
    case "users": return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "file": return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
    case "help": return <svg {...p}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
    case "logout": return <svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
    case "arrowUpRight": return <svg {...p}><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></svg>;
    case "chevronDown": return <svg {...p}><polyline points="6 9 12 15 18 9" /></svg>;
    case "trendUp": return <svg {...p}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
    case "eye": return <svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
    case "percent": return <svg {...p}><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>;
    case "dots": return <svg {...p}><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>;
    case "send": return <svg {...p}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;
    case "plus": return <svg {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
    case "alertTriangle": return <svg {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
    case "checkCircle": return <svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>;
    case "tag": return <svg {...p}><path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.29-8.29a1 1 0 0 0 0-1.42L12 2Z" /><circle cx="6.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" /></svg>;
    default: return null;
  }
}

export default function Home() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [clientCount, setClientCount] = useState(0);
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [fileName, setFileName] = useState("");
  const [leadFile, setLeadFile] = useState<File | null>(null);
  const [columnMapping, setColumnMapping] = useState<{ headers: string[]; rows: string[][]; mapping: ColumnMapping; sourceFileName: string } | null>(null);
  const [mappingError, setMappingError] = useState("");
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState({ fullName: "", email: "", role: "client" });
  const [showUserSetup, setShowUserSetup] = useState(false);
  const [userForm, setUserForm] = useState({ fullName: "", email: "", password: "", role: "client" });
  const [userError, setUserError] = useState("");
  const [userCreated, setUserCreated] = useState("");
  const [userLoading, setUserLoading] = useState(false);
  const [form, setForm] = useState(defaultCampaignForm());
  const [waalaxyModal, setWaalaxyModal] = useState<{ id: string; name: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [heroTimeFilter, setHeroTimeFilter] = useState("all");
  const [heroCampaignFilter, setHeroCampaignFilter] = useState("all");
  // Captured once via a lazy useState initializer (which React runs exactly
  // once, on mount) rather than a bare Date.now() in the render body -- see
  // the heroCampaigns filter below.
  const [nowMs] = useState(() => Date.now());
  const [campaignStatus, setCampaignStatus] = useState("Submitted");
  const [campaignProgress, setCampaignProgress] = useState(0);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [adminView, setAdminView] = useState<"campaigns" | "users">("campaigns");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountModal, setAccountModal] = useState<Account | null>(null);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountConfirmRemove, setAccountConfirmRemove] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [waalaxyLoading, setWaalaxyLoading] = useState(false);
  const [waalaxyNotConfigured, setWaalaxyNotConfigured] = useState(false);
  const [waalaxyError, setWaalaxyError] = useState("");
  const [waalaxyCampaignsList, setWaalaxyCampaignsList] = useState<{ id: string; name: string }[]>([]);
  const [waalaxyListsList, setWaalaxyListsList] = useState<{ id: string; name: string }[]>([]);
  const [waalaxyLink, setWaalaxyLink] = useState({ waalaxyCampaignId: "", waalaxyListId: "" });
  const [waalaxySyncInfo, setWaalaxySyncInfo] = useState<{ status: string; error?: string | null; imported?: number; syncedAt?: string | null } | null>(null);
  const [waalaxySaving, setWaalaxySaving] = useState(false);
  const [waalaxyPushing, setWaalaxyPushing] = useState(false);
  type CampaignBrief = { goal: string; offer: string; tone: string; messagingStrategy: string; connectionNote: string; followUps: string[] };
  const [campaignBrief, setCampaignBrief] = useState<CampaignBrief | null>(null);
  const [campaignMetrics, setCampaignMetrics] = useState({ connectionsSent: 0, connectionsAccepted: 0, repliesReceived: 0, positiveReplies: 0 });
  const [metricsSaving, setMetricsSaving] = useState(false);
  const [metricsError, setMetricsError] = useState("");
  const [metricsCsvName, setMetricsCsvName] = useState("");
  const [metricsCsvError, setMetricsCsvError] = useState("");
  const [metricsCsvSummary, setMetricsCsvSummary] = useState<{ total: number; sent: number; accepted: number; replied: number } | null>(null);
  const [leadsDownloading, setLeadsDownloading] = useState(false);
  const [leadsDownloadError, setLeadsDownloadError] = useState("");
  const [campaignsExportLoading, setCampaignsExportLoading] = useState(false);
  const [campaignsExportError, setCampaignsExportError] = useState("");
  // Read-only campaign detail view for clients -- kept separate from the
  // admin-only campaignBrief/campaignMetrics state above, which is editable.
  const [clientCampaignModal, setClientCampaignModal] = useState<Campaign | null>(null);
  const [clientCampaignLoading, setClientCampaignLoading] = useState(false);
  const [clientCampaignError, setClientCampaignError] = useState("");
  const [clientCampaignDetail, setClientCampaignDetail] = useState<(CampaignBrief & { connectionsSent: number; connectionsAccepted: number; repliesReceived: number; positiveReplies: number; submittedAt?: string }) | null>(null);
  type LeadStatus = { id: string; linkedinUrl: string; firstName: string; lastName: string; company: string; connectionRequestDate: string | null; connectedAt: string | null; repliedAt: string | null; categoryId: string | null };
  const [clientLeadStatuses, setClientLeadStatuses] = useState<LeadStatus[]>([]);
  const [leadStatusExpanded, setLeadStatusExpanded] = useState(false);
  // Client-defined lead categories (Hot/Cold/etc, managed from "Lead
  // labels" in the sidebar) -- separate from the date-derived pipeline
  // stage above (Sent/Accepted/Replied), which stays admin-authoritative.
  type LeadCategory = { id: string; name: string; color: string; position: number };
  const [leadCategories, setLeadCategories] = useState<LeadCategory[]>([]);
  const [leadCategorySavingId, setLeadCategorySavingId] = useState<string | null>(null);
  const [leadCategoryError, setLeadCategoryError] = useState("");
  const [showLeadCategorySettings, setShowLeadCategorySettings] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#C2410C");
  const [categorySettingsError, setCategorySettingsError] = useState("");
  const [categorySettingsSaving, setCategorySettingsSaving] = useState(false);
  const [clientCampaignDeleting, setClientCampaignDeleting] = useState(false);
  const [clientCampaignDeleteError, setClientCampaignDeleteError] = useState("");
  const [clientCampaignConfirmDelete, setClientCampaignConfirmDelete] = useState(false);
  // Editing an already-submitted campaign's brief/messaging -- separate from
  // the wizard's own `form` state (different field names, and the two are
  // never open at once, but keeping them independent avoids either leaking
  // stale data into the other).
  const [editingCampaign, setEditingCampaign] = useState(false);
  const [editCampaignForm, setEditCampaignForm] = useState<CampaignBrief & { followUpCount: number }>({ goal: "", offer: "", tone: "", messagingStrategy: "", connectionNote: "", followUpCount: 1, followUps: ["", "", ""] });
  const [editCampaignSaving, setEditCampaignSaving] = useState(false);
  const [editCampaignError, setEditCampaignError] = useState("");
  const activeClientCampaignIdRef = useRef<string | null>(null);
  // Adding a fresh batch of leads to an already-submitted campaign -- state
  // kept separate from the wizard's own leadFile/columnMapping so the two
  // flows never interfere with each other.
  const [addLeadsFile, setAddLeadsFile] = useState<File | null>(null);
  const [addLeadsFileName, setAddLeadsFileName] = useState("");
  const [addLeadsMapping, setAddLeadsMapping] = useState<{ headers: string[]; rows: string[][]; mapping: ColumnMapping; sourceFileName: string } | null>(null);
  const [addLeadsMappingError, setAddLeadsMappingError] = useState("");
  const [addLeadsUploading, setAddLeadsUploading] = useState(false);
  const [addLeadsError, setAddLeadsError] = useState("");
  const [addLeadsResult, setAddLeadsResult] = useState<{ added: number; duplicates: number; total: number } | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertForm, setAlertForm] = useState({ severity: "error", leadReference: "", message: "" });
  const [alertPosting, setAlertPosting] = useState(false);
  const [alertError, setAlertError] = useState("");
  type LinkedinStatus = { linkedin_email?: string; status: string; code_requested_at?: string | null; code_submitted_at?: string | null; failure_reason?: string | null; has_code?: boolean; updated_at?: string } | null;
  const [linkedinStatus, setLinkedinStatus] = useState<LinkedinStatus>(null);
  const [linkedinLoading, setLinkedinLoading] = useState(true);
  const [linkedinForm, setLinkedinForm] = useState({ email: "", password: "" });
  const [linkedinCode, setLinkedinCode] = useState("");
  const [linkedinSaving, setLinkedinSaving] = useState(false);
  const [linkedinError, setLinkedinError] = useState("");
  const [adminLinkedinStatus, setAdminLinkedinStatus] = useState<LinkedinStatus>(null);
  const [adminLinkedinLoading, setAdminLinkedinLoading] = useState(false);
  const [adminLinkedinActing, setAdminLinkedinActing] = useState(false);
  const [adminLinkedinError, setAdminLinkedinError] = useState("");
  const [adminLinkedinReveal, setAdminLinkedinReveal] = useState<{ password: string; revealedAt: string } | null>(null);
  const [adminLinkedinCodeReveal, setAdminLinkedinCodeReveal] = useState<{ code: string; revealedAt: string } | null>(null);
  const [adminLinkedinFailReason, setAdminLinkedinFailReason] = useState("");
  // Guards against a stale async response from a previously-open client's panel
  // landing on whichever client's panel happens to be open now (e.g. admin
  // opens client A, then quickly switches to client B before A's fetch
  // resolves) -- every setState below checks this still matches before firing.
  const activeLinkedinClientIdRef = useRef<string | null>(null);
  const activeWaalaxyCampaignIdRef = useRef<string | null>(null);

  function update(field: string, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  function addPlaceholder(field: "connectionNote" | "followUp", token: string, index = 0) {
    setForm((current) => field === "connectionNote" ? { ...current, connectionNote: `${current.connectionNote}${current.connectionNote ? " " : ""}${token}` } : { ...current, followUps: current.followUps.map((message, messageIndex) => messageIndex === index ? `${message}${message ? " " : ""}${token}` : message) });
  }
  function updateFollowUp(index: number, value: string) { setForm((current) => ({ ...current, followUps: current.followUps.map((message, messageIndex) => messageIndex === index ? value : message) })); }
  async function chooseLeadFile(file: File | null) {
    setSubmitError("");
    setColumnMapping(null);
    setMappingError("");
    if (!file) { setLeadFile(null); setFileName(""); return; }
    try { await readLeadFile(file); setLeadFile(file); setFileName(file.name); }
    catch (error) {
      setLeadFile(null); setFileName("");
      // Headers didn't match our template exactly -- offer to map the
      // client's own columns instead of flatly rejecting the file.
      if (error instanceof MissingHeadersError) { setColumnMapping({ headers: error.headers, rows: error.rows, mapping: guessColumnMapping(error.headers), sourceFileName: file.name }); return; }
      setSubmitError(error instanceof Error ? error.message : "Choose a valid CSV file.");
    }
  }
  function updateColumnMapping(field: LeadField, source: string) {
    setColumnMapping((current) => current ? { ...current, mapping: { ...current.mapping, [field]: source === "" ? undefined : Number(source) } } : current);
  }
  function cancelColumnMapping() { setColumnMapping(null); setMappingError(""); }
  function applyColumnMapping() {
    if (!columnMapping) return;
    setMappingError("");
    const conflicts = findMappingConflicts(columnMapping.mapping);
    if (conflicts.length) { setMappingError(`${conflicts.map((fields) => fields.join(" and ")).join("; ")} can't share the same column -- choose a different column for each.`); return; }
    try {
      const leadRows = buildLeadRowsFromMapping(columnMapping.headers, columnMapping.rows, columnMapping.mapping);
      const mappedFile = new File([leadRowsToCsv(leadRows)], columnMapping.sourceFileName, { type: "text/csv" });
      setLeadFile(mappedFile);
      setFileName(columnMapping.sourceFileName);
      setColumnMapping(null);
    } catch (error) { setMappingError(error instanceof Error ? error.message : "Unable to map these columns."); }
  }
  // "Add leads" (an existing campaign's own upload flow, opened from the
  // campaign-details modal) mirrors chooseLeadFile/applyColumnMapping above
  // -- same column-mapping fallback -- but targets its own state so it never
  // interferes with the new-campaign wizard.
  async function chooseAddLeadsFile(file: File | null) {
    setAddLeadsError("");
    setAddLeadsMapping(null);
    setAddLeadsMappingError("");
    setAddLeadsResult(null);
    if (!file) { setAddLeadsFile(null); setAddLeadsFileName(""); return; }
    try { await readLeadFile(file); setAddLeadsFile(file); setAddLeadsFileName(file.name); }
    catch (error) {
      setAddLeadsFile(null); setAddLeadsFileName("");
      if (error instanceof MissingHeadersError) { setAddLeadsMapping({ headers: error.headers, rows: error.rows, mapping: guessColumnMapping(error.headers), sourceFileName: file.name }); return; }
      setAddLeadsError(error instanceof Error ? error.message : "Choose a valid CSV file.");
    }
  }
  function updateAddLeadsMapping(field: LeadField, source: string) {
    setAddLeadsMapping((current) => current ? { ...current, mapping: { ...current.mapping, [field]: source === "" ? undefined : Number(source) } } : current);
  }
  function cancelAddLeadsMapping() { setAddLeadsMapping(null); setAddLeadsMappingError(""); }
  function applyAddLeadsMapping() {
    if (!addLeadsMapping) return;
    setAddLeadsMappingError("");
    const conflicts = findMappingConflicts(addLeadsMapping.mapping);
    if (conflicts.length) { setAddLeadsMappingError(`${conflicts.map((fields) => fields.join(" and ")).join("; ")} can't share the same column -- choose a different column for each.`); return; }
    try {
      const leadRows = buildLeadRowsFromMapping(addLeadsMapping.headers, addLeadsMapping.rows, addLeadsMapping.mapping);
      const mappedFile = new File([leadRowsToCsv(leadRows)], addLeadsMapping.sourceFileName, { type: "text/csv" });
      setAddLeadsFile(mappedFile);
      setAddLeadsFileName(addLeadsMapping.sourceFileName);
      setAddLeadsMapping(null);
    } catch (error) { setAddLeadsMappingError(error instanceof Error ? error.message : "Unable to map these columns."); }
  }
  async function uploadMoreLeads() {
    if (!clientCampaignModal || !addLeadsFile || !userId) return;
    const campaignId = clientCampaignModal.id;
    setAddLeadsUploading(true);
    setAddLeadsError("");
    setAddLeadsResult(null);
    const supabase = createClient();
    let storagePath = "";
    try {
      storagePath = `${userId}/${campaignId}/pending/${crypto.randomUUID()}-${addLeadsFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage.from("outreach-leads").upload(storagePath, addLeadsFile);
      if (uploadError) throw uploadError;
      const headers = await authHeader();
      const response = await fetch(`/api/client/campaigns/${campaignId}/leads`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ storagePath, originalName: addLeadsFile.name }) });
      const data = await readJson<{ error?: string; added?: number; duplicates?: number; total?: number }>(response);
      if (!response.ok || data.total === undefined) throw new Error(data.error || "Unable to add these leads.");
      if (activeClientCampaignIdRef.current !== campaignId) return;
      setAddLeadsResult({ added: data.added || 0, duplicates: data.duplicates || 0, total: data.total });
      setAddLeadsFile(null);
      setAddLeadsFileName("");
      setCampaigns((current) => current.map((campaign) => campaign.id === campaignId ? { ...campaign, audience: `${data.total} leads` } : campaign));
      setClientCampaignModal((current) => current && current.id === campaignId ? { ...current, audience: `${data.total} leads` } : current);
    } catch (error) {
      if (storagePath) await supabase.storage.from("outreach-leads").remove([storagePath]).catch(() => {});
      if (activeClientCampaignIdRef.current !== campaignId) return;
      setAddLeadsError(error instanceof Error ? error.message : "Unable to add these leads.");
    } finally { if (activeClientCampaignIdRef.current === campaignId) setAddLeadsUploading(false); }
  }
  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError || !data.user) { window.location.replace("/login"); return; }
        setUserId(data.user.id);
        const { data: profileRow, error: profileError } = await supabase.schema("outreach").from("profiles").select("full_name,email,role").eq("id", data.user.id).is("access_revoked_at", null).single();
        if (profileError || !profileRow) { await supabase.auth.signOut(); window.location.replace("/login"); return; }
        setProfile({ fullName: profileRow.full_name, email: profileRow.email, role: profileRow.role });
        const campaignsPromise = supabase.schema("outreach").from("campaigns").select("id,name,lead_count,status,progress,client_id,submitted_at,connections_sent,connections_accepted,replies_received").order("created_at", { ascending: false });
        const profilesPromise = profileRow.role === "admin" ? supabase.schema("outreach").from("profiles").select("id,full_name,email,role,created_at").is("access_revoked_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null });
        const alertsPromise = supabase.schema("outreach").from("campaign_alerts").select("id,client_id,campaign_id,lead_reference,severity,message,resolved,created_at").order("created_at", { ascending: false });
        const categoriesPromise = profileRow.role === "client" ? supabase.schema("outreach").from("lead_categories").select("id,name,color,position").eq("client_id", data.user.id).order("position", { ascending: true }) : Promise.resolve({ data: [], error: null });
        const [campaignsResult, profilesResult, alertsResult, categoriesResult] = await Promise.all([campaignsPromise, profilesPromise, alertsPromise, categoriesPromise]);
        const loadError = campaignsResult.error || profilesResult.error || alertsResult.error || categoriesResult.error;
        if (loadError) throw loadError;
        const allProfiles = profilesResult.data || [];
        setAccounts(allProfiles.map((account) => ({ id: account.id, fullName: account.full_name || account.email, email: account.email, role: account.role, createdAt: account.created_at })));
        setClientCount(allProfiles.filter((account) => account.role === "client").length);
        const clientNames = new Map(allProfiles.filter((account) => account.role === "client").map((account) => [account.id, account.full_name || account.email]));
        setCampaigns((campaignsResult.data || []).map((row) => ({ id: row.id, name: row.name, audience: `${row.lead_count} leads`, status: row.status.replaceAll("_", " ").replace(/^./, (letter: string) => letter.toUpperCase()), progress: row.progress, client: clientNames.get(row.client_id), clientId: row.client_id, submittedAt: row.submitted_at, connectionsSent: row.connections_sent || 0, connectionsAccepted: row.connections_accepted || 0, repliesReceived: row.replies_received || 0 })));
        setAlerts((alertsResult.data || []).map((alert) => ({ id: alert.id, clientId: alert.client_id, campaignId: alert.campaign_id, leadReference: alert.lead_reference, severity: alert.severity, message: alert.message, resolved: alert.resolved, createdAt: alert.created_at })));
        if (profileRow.role === "client") {
          if (categoriesResult.data && categoriesResult.data.length > 0) {
            setLeadCategories(categoriesResult.data.map((row) => ({ id: row.id, name: row.name, color: row.color, position: row.position })));
          } else {
            // First time this client has ever loaded the workspace with the
            // feature live -- the migration backfilled existing clients,
            // but this covers anyone created after it ran.
            const { data: seeded } = await supabase.schema("outreach").from("lead_categories")
              .insert([{ client_id: data.user.id, name: "Hot", color: "#C2410C", position: 0 }, { client_id: data.user.id, name: "Cold", color: "#3B5BDB", position: 1 }])
              .select("id,name,color,position");
            if (seeded) setLeadCategories(seeded.map((row) => ({ id: row.id, name: row.name, color: row.color, position: row.position })));
          }
        }
      } catch (error) { setWorkspaceError(error instanceof Error ? error.message : "Unable to load the workspace."); }
      finally { setWorkspaceLoading(false); }
    })();
  }, []);
  function openWizard() { setStep(1); setSubmitted(false); setSubmitError(""); setForm(defaultCampaignForm()); setLeadFile(null); setFileName(""); setColumnMapping(null); setMappingError(""); setShowWizard(true); }
  function downloadTemplate() {
    const csv = "first_name,last_name,job_title,company,linkedin_url,email,notes\nAarav,Mehta,Founder,Acme,https://linkedin.com/in/example,aarav@example.com,Priority lead\n";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "myntmore-leads-template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }
  async function submitCampaign() {
    if (!userId) return;
    setSubmitting(true);
    setSubmitError("");
    const supabase = createClient();
    let storagePath = "";
    let campaignId = "";
    try {
      const leads = leadFile ? await readLeadFile(leadFile) : [];
      if (leadFile) {
        storagePath = `${userId}/pending/${crypto.randomUUID()}-${leadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error } = await supabase.storage.from("outreach-leads").upload(storagePath, leadFile);
        if (error) throw error;
      }
      const { data: campaign, error } = await supabase.schema("outreach").from("campaigns").insert({ client_id: userId, name: form.name || "Untitled campaign", goal: form.goal, offer: form.offer, tone: form.tone, messaging_strategy: form.message, connection_note: form.connectionNote, follow_up_count: form.followUpCount, follow_up_messages: form.followUps.slice(0, form.followUpCount), lead_count: leads.length, status: "submitted", progress: 15, submitted_at: new Date().toISOString() }).select("id").single();
      if (error || !campaign) throw error || new Error("Unable to create the campaign.");
      campaignId = campaign.id;
      if (leadFile) {
        const { error } = await supabase.schema("outreach").from("lead_files").insert({ campaign_id: campaignId, client_id: userId, storage_path: storagePath, original_name: leadFile.name, content_type: leadFile.type || "text/csv", size_bytes: leadFile.size });
        if (error) throw error;
      }
      setCampaigns((current) => [{ id: campaignId, name: form.name || "Untitled campaign", audience: `${leads.length} leads`, status: "Submitted", progress: 15, submittedAt: new Date().toISOString(), connectionsSent: 0, connectionsAccepted: 0, repliesReceived: 0 }, ...current]);
      setSubmitted(true);
    } catch (error) {
      if (campaignId) await supabase.schema("outreach").from("campaigns").delete().eq("id", campaignId);
      if (storagePath) await supabase.storage.from("outreach-leads").remove([storagePath]);
      setSubmitError(error instanceof Error ? error.message : "Unable to submit your campaign. Please try again.");
    } finally { setSubmitting(false); }
  }
  async function signOut() { await createClient().auth.signOut(); router.push("/login"); }
  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setUserLoading(true); setUserError(""); setUserCreated("");
    try {
      const { data: sessionData } = await createClient().auth.getSession();
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token || ""}` }, body: JSON.stringify(userForm) });
      const result = await readJson<{ error?: string; role: string; existing: boolean; email: string }>(response);
      if (!response.ok) throw new Error(result.error || "Unable to create the user.");
      const accountLabel = result.role === "admin" ? "admin" : "client";
      setUserCreated(result.existing ? `${result.email} already had a Myntmore login and now has ${accountLabel} access to Outreach. Their existing password is unchanged.` : `${result.email} now has ${accountLabel} access and can sign in with the temporary password.`); setUserForm({ fullName: "", email: "", password: "", role: "client" });
    } catch (error) { setUserError(error instanceof Error ? error.message : "Unable to create the user."); }
    finally { setUserLoading(false); }
  }
  async function authHeader() {
    const { data } = await createClient().auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token || ""}` };
  }
  async function submitLinkedinCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLinkedinSaving(true);
    setLinkedinError("");
    try {
      const headers = await authHeader();
      const response = await fetch("/api/client/linkedin-credentials", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(linkedinForm) });
      const data = await readJson<LinkedinStatus & { error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to save your LinkedIn details.");
      setLinkedinStatus(data);
      setLinkedinForm({ email: "", password: "" });
    } catch (error) { setLinkedinError(error instanceof Error ? error.message : "Unable to save your LinkedIn details."); }
    finally { setLinkedinSaving(false); }
  }
  async function submitLinkedinCode(event: FormEvent<HTMLFormElement> | null, codeOverride?: string) {
    event?.preventDefault();
    const codeToSend = codeOverride ?? linkedinCode;
    setLinkedinSaving(true);
    setLinkedinError("");
    try {
      const headers = await authHeader();
      const response = await fetch("/api/client/linkedin-credentials/code", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ code: codeToSend }) });
      const data = await readJson<LinkedinStatus & { error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to submit your code.");
      setLinkedinStatus(data);
      setLinkedinCode("");
    } catch (error) { setLinkedinError(error instanceof Error ? error.message : "Unable to submit your code."); }
    finally { setLinkedinSaving(false); }
  }
  async function loadAdminLinkedinStatus(clientId: string) {
    setAdminLinkedinLoading(true);
    setAdminLinkedinError("");
    setAdminLinkedinReveal(null);
    setAdminLinkedinCodeReveal(null);
    try {
      const headers = await authHeader();
      const response = await fetch(`/api/admin/linkedin-credentials/${clientId}`, { headers });
      const data = await readJson<LinkedinStatus>(response);
      if (activeLinkedinClientIdRef.current !== clientId) return;
      setAdminLinkedinStatus(data);
    } catch (error) {
      if (activeLinkedinClientIdRef.current !== clientId) return;
      setAdminLinkedinError(error instanceof Error ? error.message : "Unable to load LinkedIn status.");
    } finally { if (activeLinkedinClientIdRef.current === clientId) setAdminLinkedinLoading(false); }
  }
  async function performLinkedinAction(clientId: string, action: string, reason?: string) {
    setAdminLinkedinActing(true);
    setAdminLinkedinError("");
    try {
      const headers = await authHeader();
      const response = await fetch(`/api/admin/linkedin-credentials/${clientId}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }) });
      const data = await readJson<LinkedinStatus & { error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to update this record.");
      if (activeLinkedinClientIdRef.current !== clientId) return;
      setAdminLinkedinStatus(data);
      setAdminLinkedinFailReason("");
      setAdminLinkedinReveal(null);
      setAdminLinkedinCodeReveal(null);
    } catch (error) {
      if (activeLinkedinClientIdRef.current !== clientId) return;
      setAdminLinkedinError(error instanceof Error ? error.message : "Unable to update this record.");
    } finally { if (activeLinkedinClientIdRef.current === clientId) setAdminLinkedinActing(false); }
  }
  // Resets this client's LinkedIn connection back to the credential form
  // (reusing the "failed" status, which is what already makes the form
  // reappear client-side) and posts an account-wide alert at the same time,
  // so asking a client to log in again is one click instead of two separate
  // manual steps (mark failed, then remember to also post an alert).
  async function requestClientRelogin(clientId: string) {
    const reason = "Please log in to LinkedIn again to keep your outreach running.";
    setAdminLinkedinActing(true);
    setAdminLinkedinError("");
    try {
      const headers = await authHeader();
      const response = await fetch(`/api/admin/linkedin-credentials/${clientId}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_failed", reason }) });
      const data = await readJson<LinkedinStatus & { error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to update this record.");
      const { data: alertRow, error: alertError } = await createClient().schema("outreach").from("campaign_alerts").insert({
        client_id: clientId, campaign_id: null, severity: "warning", message: reason, created_by: userId,
      }).select("id,client_id,campaign_id,lead_reference,severity,message,resolved,created_at").single();
      if (activeLinkedinClientIdRef.current !== clientId) return;
      setAdminLinkedinStatus(data);
      setAdminLinkedinFailReason("");
      setAdminLinkedinReveal(null);
      setAdminLinkedinCodeReveal(null);
      if (alertRow) {
        setAlerts((current) => [{ id: alertRow.id, clientId: alertRow.client_id, campaignId: alertRow.campaign_id, leadReference: alertRow.lead_reference, severity: alertRow.severity, message: alertRow.message, resolved: alertRow.resolved, createdAt: alertRow.created_at }, ...current]);
      } else {
        // The credential status update above already went through, so don't
        // pretend it didn't -- but the client won't see an alert explaining
        // why their LinkedIn card reappeared unless we tell the admin to
        // follow up manually.
        setAdminLinkedinError(`Marked as failed, but the alert to the client didn't post${alertError?.message ? ` (${alertError.message})` : ""}. They won't see an explanation until you retry.`);
      }
    } catch (error) {
      if (activeLinkedinClientIdRef.current !== clientId) return;
      setAdminLinkedinError(error instanceof Error ? error.message : "Unable to ask this client to log in again.");
    } finally { if (activeLinkedinClientIdRef.current === clientId) setAdminLinkedinActing(false); }
  }
  async function revealLinkedinPassword(clientId: string) {
    setAdminLinkedinActing(true);
    setAdminLinkedinError("");
    try {
      const headers = await authHeader();
      const response = await fetch(`/api/admin/linkedin-credentials/${clientId}/reveal`, { method: "POST", headers });
      const data = await readJson<{ error?: string; password?: string; revealedAt?: string }>(response);
      if (!response.ok || !data.password || !data.revealedAt) throw new Error(data?.error || "Unable to reveal this password.");
      if (activeLinkedinClientIdRef.current !== clientId) return;
      setAdminLinkedinReveal({ password: data.password, revealedAt: data.revealedAt });
    } catch (error) {
      if (activeLinkedinClientIdRef.current !== clientId) return;
      setAdminLinkedinError(error instanceof Error ? error.message : "Unable to reveal this password.");
    } finally { if (activeLinkedinClientIdRef.current === clientId) setAdminLinkedinActing(false); }
  }
  async function revealLinkedinCode(clientId: string) {
    setAdminLinkedinActing(true);
    setAdminLinkedinError("");
    try {
      const headers = await authHeader();
      const response = await fetch(`/api/admin/linkedin-credentials/${clientId}/reveal-code`, { method: "POST", headers });
      const data = await readJson<{ error?: string; code?: string; revealedAt?: string }>(response);
      if (!response.ok || !data.code || !data.revealedAt) throw new Error(data?.error || "Unable to reveal this code.");
      if (activeLinkedinClientIdRef.current !== clientId) return;
      setAdminLinkedinCodeReveal({ code: data.code, revealedAt: data.revealedAt });
    } catch (error) {
      if (activeLinkedinClientIdRef.current !== clientId) return;
      setAdminLinkedinError(error instanceof Error ? error.message : "Unable to reveal this code.");
    } finally { if (activeLinkedinClientIdRef.current === clientId) setAdminLinkedinActing(false); }
  }
  useEffect(() => {
    if (!userId || profile.role !== "client") return;
    let cancelled = false;
    async function fetchLinkedinStatus(showLoading: boolean) {
      if (showLoading) setLinkedinLoading(true);
      try {
        const headers = await authHeader();
        const response = await fetch("/api/client/linkedin-credentials", { headers });
        const data = await readJson<LinkedinStatus>(response);
        if (!cancelled) setLinkedinStatus(data);
      } catch { /* non-fatal -- the form below just shows as not-yet-submitted */ }
      finally { if (!cancelled && showLoading) setLinkedinLoading(false); }
    }
    void fetchLinkedinStatus(true);
    // There's no realtime subscription in this app -- without this, a
    // client who already has the dashboard open never sees an admin's "ask
    // this client to log in again" take effect (the card stays hidden)
    // until they happen to reload the page. A light poll closes that gap.
    const intervalId = window.setInterval(() => { void fetchLinkedinStatus(false); }, 60000);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, [userId, profile.role]);
  async function openWaalaxyModal(campaign: Campaign) {
    activeWaalaxyCampaignIdRef.current = campaign.id;
    setWaalaxyModal({ id: campaign.id, name: campaign.name });
    setCampaignStatus(campaign.status);
    setCampaignProgress(campaign.progress);
    setStatusError("");
    setAlertForm({ severity: "error", leadReference: "", message: "" });
    setAlertError("");
    setWaalaxyError("");
    setWaalaxyNotConfigured(false);
    setWaalaxySyncInfo(null);
    setWaalaxyLink({ waalaxyCampaignId: "", waalaxyListId: "" });
    setWaalaxyCampaignsList([]);
    setWaalaxyListsList([]);
    setWaalaxyLoading(true);
    setCampaignBrief(null);
    setCampaignMetrics({ connectionsSent: 0, connectionsAccepted: 0, repliesReceived: 0, positiveReplies: 0 });
    setMetricsError("");
    setMetricsSaving(false);
    setMetricsCsvName("");
    setMetricsCsvError("");
    setMetricsCsvSummary(null);
    setLeadsDownloadError("");
    setLeadsDownloading(false);
    try {
      const headers = await authHeader();
      const supabase = createClient();
      const [linkRes, campaignsRes, listsRes, briefResult] = await Promise.all([
      fetch(`/api/admin/campaigns/${campaign.id}/waalaxy`, { headers }),
      fetch("/api/admin/waalaxy/campaigns", { headers }),
      fetch("/api/admin/waalaxy/lists", { headers }),
      supabase.schema("outreach").from("campaigns").select("goal,offer,tone,messaging_strategy,connection_note,follow_up_count,follow_up_messages,connections_sent,connections_accepted,replies_received,positive_replies").eq("id", campaign.id).single(),
    ]);
      const [linkData, campaignsData, listsData] = await Promise.all([readJson<Record<string, unknown>>(linkRes), readJson<Record<string, unknown>>(campaignsRes), readJson<Record<string, unknown>>(listsRes)]);
    if (activeWaalaxyCampaignIdRef.current !== campaign.id) return;
    if (linkRes.ok) {
      setWaalaxyLink({ waalaxyCampaignId: String(linkData.waalaxy_campaign_id || ""), waalaxyListId: String(linkData.waalaxy_list_id || "") });
      setWaalaxySyncInfo({ status: String(linkData.waalaxy_sync_status || "not_linked"), error: linkData.waalaxy_sync_error as string | null, imported: linkData.waalaxy_prospects_imported as number, syncedAt: linkData.waalaxy_synced_at as string | null });
    }
    if (campaignsRes.status === 501 || listsRes.status === 501) {
      setWaalaxyNotConfigured(true);
    } else if (!campaignsRes.ok) {
      setWaalaxyError(String(campaignsData.error || "Unable to load Waalaxy campaigns."));
    } else if (!listsRes.ok) {
      setWaalaxyError(String(listsData.error || "Unable to load Waalaxy prospect lists."));
    } else {
      setWaalaxyCampaignsList((campaignsData.campaigns || []) as { id: string; name: string }[]);
      setWaalaxyListsList((listsData.lists || []) as { id: string; name: string }[]);
    }
    if (!briefResult.error && briefResult.data) {
      const row = briefResult.data;
      setCampaignBrief({
        goal: row.goal || "", offer: row.offer || "", tone: row.tone || "", messagingStrategy: row.messaging_strategy || "",
        connectionNote: row.connection_note || "", followUps: (row.follow_up_messages || []).slice(0, row.follow_up_count || 1),
      });
      setCampaignMetrics({
        connectionsSent: row.connections_sent || 0, connectionsAccepted: row.connections_accepted || 0,
        repliesReceived: row.replies_received || 0, positiveReplies: row.positive_replies || 0,
      });
    }
    } catch (error) {
      if (activeWaalaxyCampaignIdRef.current !== campaign.id) return;
      setWaalaxyError(error instanceof Error ? error.message : "Unable to load Waalaxy.");
    } finally { if (activeWaalaxyCampaignIdRef.current === campaign.id) setWaalaxyLoading(false); }
  }
  // Lets the admin refresh a campaign's sent/accepted/replied counts by
  // uploading Waalaxy's own contact export instead of counting by hand --
  // this only fills the number fields below, it doesn't save on its own, so
  // the admin still reviews (and sets positive replies, which the export
  // doesn't cleanly encode) before clicking "Save metrics".
  async function chooseMetricsCsv(file: File | null) {
    if (!file || !waalaxyModal) return;
    const campaignId = waalaxyModal.id;
    const clientId = campaigns.find((campaign) => campaign.id === campaignId)?.clientId;
    setMetricsCsvName(file.name);
    setMetricsCsvError("");
    setMetricsCsvSummary(null);
    try {
      const { summary, leads } = parseWaalaxyContactsCsv(await file.text());
      if (activeWaalaxyCampaignIdRef.current !== campaignId) return;
      setCampaignMetrics((current) => ({ ...current, connectionsSent: summary.sent, connectionsAccepted: summary.accepted, repliesReceived: summary.replied }));
      // Also refreshes each lead's own status (see outreach.lead_statuses),
      // which is what the client's per-lead view is built from -- keyed on
      // (campaign_id, linkedin_url) so re-uploading the same export later
      // updates these rows instead of duplicating them.
      if (clientId && leads.length) {
        const rows = leads.map((lead) => ({
          campaign_id: campaignId, client_id: clientId, linkedin_url: lead.linkedinUrl,
          first_name: lead.firstName, last_name: lead.lastName, company: lead.company,
          connection_request_date: lead.connectionRequestDate || null,
          connected_at: lead.connectedAt || null,
          replied_at: lead.repliedAt || null,
          updated_at: new Date().toISOString(),
        }));
        const { error: leadStatusError } = await createClient().schema("outreach").from("lead_statuses").upsert(rows, { onConflict: "campaign_id,linkedin_url" });
        if (activeWaalaxyCampaignIdRef.current !== campaignId) return;
        if (leadStatusError) throw new Error(leadStatusError.message);
      }
      setMetricsCsvSummary(summary);
    } catch (error) {
      if (activeWaalaxyCampaignIdRef.current !== campaignId) return;
      setMetricsCsvError(error instanceof Error ? error.message : "Unable to read this file.");
    }
  }
  async function saveCampaignMetrics() {
    if (!waalaxyModal) return;
    const campaignId = waalaxyModal.id;
    if (campaignMetrics.connectionsAccepted > campaignMetrics.connectionsSent) { setMetricsError("Connections accepted can't be more than connections sent."); return; }
    if (campaignMetrics.positiveReplies > campaignMetrics.repliesReceived) { setMetricsError("Positive replies can't be more than replies received."); return; }
    setMetricsSaving(true);
    setMetricsError("");
    const { error } = await createClient().schema("outreach").from("campaigns").update({
      connections_sent: campaignMetrics.connectionsSent,
      connections_accepted: campaignMetrics.connectionsAccepted,
      replies_received: campaignMetrics.repliesReceived,
      positive_replies: campaignMetrics.positiveReplies,
      metrics_updated_at: new Date().toISOString(),
    }).eq("id", campaignId);
    if (activeWaalaxyCampaignIdRef.current !== campaignId) return;
    if (error) { setMetricsError(error.message); setMetricsSaving(false); return; }
    setMetricsSaving(false);
  }
  async function downloadCampaignLeads(campaignId: string, campaignName: string) {
    setLeadsDownloading(true);
    setLeadsDownloadError("");
    try {
      const headers = await authHeader();
      const response = await fetch(`/api/admin/campaigns/${campaignId}/leads-csv`, { headers });
      if (!response.ok) {
        const data = await readJson<{ error?: string }>(response).catch(() => ({ error: undefined }));
        throw new Error(data.error || "Unable to download this campaign's leads.");
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${campaignName.replace(/[^a-zA-Z0-9._-]/g, "_") || "campaign"}-leads.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      if (activeWaalaxyCampaignIdRef.current !== campaignId) return;
      setLeadsDownloadError(error instanceof Error ? error.message : "Unable to download this campaign's leads.");
    } finally { if (activeWaalaxyCampaignIdRef.current === campaignId) setLeadsDownloading(false); }
  }
  async function downloadAllCampaigns() {
    setCampaignsExportLoading(true);
    setCampaignsExportError("");
    try {
      // Query everything fresh at click time instead of reusing the
      // `campaigns` state captured once at mount -- that state can be
      // arbitrarily stale on a work queue an admin leaves open for a
      // while, silently omitting campaigns created since mount and
      // showing phantom all-zero rows for ones since deleted.
      const supabase = createClient();
      const campaignsPromise = supabase.schema("outreach").from("campaigns")
        .select("id,name,lead_count,status,progress,client_id,submitted_at,connections_sent,connections_accepted,replies_received,positive_replies")
        .order("created_at", { ascending: false });
      // Unlike the accounts list shown elsewhere, this export intentionally
      // does NOT filter out clients whose access has since been revoked --
      // their past campaigns are kept around specifically to preserve
      // historical data (see access_revoked_at), so the export shouldn't
      // blank out who they belonged to.
      const profilesPromise = supabase.schema("outreach").from("profiles").select("id,full_name,email,access_revoked_at").eq("role", "client");
      const [campaignsResult, profilesResult] = await Promise.all([campaignsPromise, profilesPromise]);
      if (campaignsResult.error) throw campaignsResult.error;
      if (profilesResult.error) throw profilesResult.error;
      if (!campaignsResult.data || campaignsResult.data.length === 0) { setCampaignsExportError("There are no campaigns to export yet."); return; }
      const clientNames = new Map((profilesResult.data || []).map((account) => [account.id, `${account.full_name || account.email}${account.access_revoked_at ? " (access revoked)" : ""}`]));
      const rows = campaignsResult.data.map((row) => {
        const sent = row.connections_sent || 0;
        const accepted = row.connections_accepted || 0;
        return [
          clientNames.get(row.client_id) || "", row.name, row.status.replaceAll("_", " ").replace(/^./, (letter: string) => letter.toUpperCase()), row.progress, row.lead_count || 0,
          sent, accepted, sent ? Math.round((accepted / sent) * 100) : 0,
          row.replies_received || 0, row.positive_replies || 0,
          row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : "",
        ];
      });
      const csv = rowsToCsv(
        ["Client", "Campaign", "Status", "Progress %", "Leads", "Connections sent", "Connections accepted", "Acceptance rate %", "Replies received", "Positive replies", "Submitted"],
        rows,
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `myntmore-campaigns-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      setCampaignsExportError(error instanceof Error ? error.message : "Unable to export campaigns.");
    } finally { setCampaignsExportLoading(false); }
  }
  function resetAddLeadsState() {
    setAddLeadsFile(null);
    setAddLeadsFileName("");
    setAddLeadsMapping(null);
    setAddLeadsMappingError("");
    setAddLeadsError("");
    setAddLeadsResult(null);
  }
  async function openClientCampaignModal(campaign: Campaign) {
    activeClientCampaignIdRef.current = campaign.id;
    setClientCampaignModal(campaign);
    setClientCampaignError("");
    setClientCampaignDetail(null);
    setClientLeadStatuses([]);
    setLeadStatusExpanded(false);
    setLeadCategoryError("");
    setEditingCampaign(false);
    setEditCampaignError("");
    setEditCampaignSaving(false);
    setClientCampaignConfirmDelete(false);
    setClientCampaignDeleteError("");
    setClientCampaignDeleting(false);
    setClientCampaignLoading(true);
    resetAddLeadsState();
    try {
      const supabase = createClient();
      const [campaignResult, leadStatusesResult] = await Promise.all([
        supabase.schema("outreach").from("campaigns")
          .select("goal,offer,tone,messaging_strategy,connection_note,follow_up_count,follow_up_messages,connections_sent,connections_accepted,replies_received,positive_replies,submitted_at")
          .eq("id", campaign.id).single(),
        supabase.schema("outreach").from("lead_statuses")
          .select("id,linkedin_url,first_name,last_name,company,connection_request_date,connected_at,replied_at,category_id")
          .eq("campaign_id", campaign.id)
          .order("replied_at", { ascending: false, nullsFirst: false })
          .order("connected_at", { ascending: false, nullsFirst: false }),
      ]);
      if (activeClientCampaignIdRef.current !== campaign.id) return;
      const { data, error } = campaignResult;
      if (error || !data) throw error || new Error("Unable to load this campaign.");
      setClientCampaignDetail({
        goal: data.goal || "", offer: data.offer || "", tone: data.tone || "", messagingStrategy: data.messaging_strategy || "",
        connectionNote: data.connection_note || "", followUps: (data.follow_up_messages || []).slice(0, data.follow_up_count || 1),
        connectionsSent: data.connections_sent || 0, connectionsAccepted: data.connections_accepted || 0,
        repliesReceived: data.replies_received || 0, positiveReplies: data.positive_replies || 0, submittedAt: data.submitted_at,
      });
      // Non-fatal: the per-lead list is a supplementary view inside this
      // modal, not the thing it exists for, so a failure loading it
      // shouldn't block the rest of the campaign detail from showing.
      if (!leadStatusesResult.error) {
        setClientLeadStatuses((leadStatusesResult.data || []).map((row) => ({
          id: row.id, linkedinUrl: row.linkedin_url, firstName: row.first_name || "", lastName: row.last_name || "", company: row.company || "",
          connectionRequestDate: row.connection_request_date, connectedAt: row.connected_at, repliedAt: row.replied_at, categoryId: row.category_id,
        })));
      }
    } catch (error) {
      if (activeClientCampaignIdRef.current !== campaign.id) return;
      setClientCampaignError(error instanceof Error ? error.message : "Unable to load this campaign.");
    } finally { if (activeClientCampaignIdRef.current === campaign.id) setClientCampaignLoading(false); }
  }
  function closeClientCampaignModal() {
    activeClientCampaignIdRef.current = null;
    setClientCampaignModal(null);
  }
  function startEditingCampaign() {
    if (!clientCampaignDetail) return;
    const followUpCount = Math.max(1, Math.min(3, clientCampaignDetail.followUps.length || 1));
    const followUps = [...clientCampaignDetail.followUps, "", "", ""].slice(0, 3);
    setEditCampaignForm({ goal: clientCampaignDetail.goal, offer: clientCampaignDetail.offer, tone: clientCampaignDetail.tone, messagingStrategy: clientCampaignDetail.messagingStrategy, connectionNote: clientCampaignDetail.connectionNote, followUpCount, followUps });
    setEditCampaignError("");
    setEditingCampaign(true);
  }
  function updateEditField(field: keyof Omit<CampaignBrief, "followUps">, value: string) {
    setEditCampaignForm((current) => ({ ...current, [field]: value }));
  }
  function updateEditFollowUp(index: number, value: string) {
    setEditCampaignForm((current) => ({ ...current, followUps: current.followUps.map((message, messageIndex) => messageIndex === index ? value : message) }));
  }
  function addEditPlaceholder(field: "connectionNote" | "followUp", token: string, index = 0) {
    setEditCampaignForm((current) => field === "connectionNote"
      ? { ...current, connectionNote: `${current.connectionNote}${current.connectionNote ? " " : ""}${token}` }
      : { ...current, followUps: current.followUps.map((message, messageIndex) => messageIndex === index ? `${message}${message ? " " : ""}${token}` : message) });
  }
  async function saveCampaignEdits() {
    if (!clientCampaignModal) return;
    const campaignId = clientCampaignModal.id;
    if (!editCampaignForm.connectionNote.trim() || editCampaignForm.followUps.slice(0, editCampaignForm.followUpCount).some((message) => !message.trim())) {
      setEditCampaignError("The connection note and every follow-up need a message.");
      return;
    }
    setEditCampaignSaving(true);
    setEditCampaignError("");
    try {
      const headers = await authHeader();
      const response = await fetch(`/api/client/campaigns/${campaignId}`, {
        method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: editCampaignForm.goal, offer: editCampaignForm.offer, tone: editCampaignForm.tone, messagingStrategy: editCampaignForm.messagingStrategy,
          connectionNote: editCampaignForm.connectionNote, followUpCount: editCampaignForm.followUpCount, followUps: editCampaignForm.followUps,
        }),
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Unable to save these changes.");
      if (activeClientCampaignIdRef.current !== campaignId) return;
      setClientCampaignDetail((current) => current && ({
        ...current, goal: editCampaignForm.goal, offer: editCampaignForm.offer, tone: editCampaignForm.tone, messagingStrategy: editCampaignForm.messagingStrategy,
        connectionNote: editCampaignForm.connectionNote, followUps: editCampaignForm.followUps.slice(0, editCampaignForm.followUpCount),
      }));
      setEditingCampaign(false);
    } catch (error) {
      if (activeClientCampaignIdRef.current !== campaignId) return;
      setEditCampaignError(error instanceof Error ? error.message : "Unable to save these changes.");
    } finally { if (activeClientCampaignIdRef.current === campaignId) setEditCampaignSaving(false); }
  }
  // Sets (or clears, via categoryId=null) which category a lead is tagged
  // with. Applied optimistically -- the dropdown updates immediately -- and
  // rolled back if the PATCH fails, since this is a small enough change
  // that waiting on the network before showing it would feel laggy for
  // something this lightweight.
  async function chooseLeadCategory(leadStatusId: string, categoryId: string | null) {
    const previous = clientLeadStatuses.find((lead) => lead.id === leadStatusId)?.categoryId ?? null;
    setLeadCategorySavingId(leadStatusId);
    setLeadCategoryError("");
    setClientLeadStatuses((current) => current.map((lead) => lead.id === leadStatusId ? { ...lead, categoryId } : lead));
    try {
      const headers = await authHeader();
      const response = await fetch(`/api/client/lead-statuses/${leadStatusId}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ categoryId }) });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Unable to save this category.");
    } catch (error) {
      setClientLeadStatuses((current) => current.map((lead) => lead.id === leadStatusId ? { ...lead, categoryId: previous } : lead));
      setLeadCategoryError(error instanceof Error ? error.message : "Unable to save this category.");
    } finally { setLeadCategorySavingId(null); }
  }
  function openLeadCategorySettings() {
    setNewCategoryName("");
    setNewCategoryColor(LEAD_CATEGORY_COLORS[0]);
    setCategorySettingsError("");
    setShowLeadCategorySettings(true);
  }
  async function addLeadCategory() {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) { setCategorySettingsError("Give this category a name."); return; }
    if (leadCategories.some((category) => category.name.toLowerCase() === trimmedName.toLowerCase())) {
      setCategorySettingsError("You already have a category with this name.");
      return;
    }
    setCategorySettingsSaving(true);
    setCategorySettingsError("");
    try {
      const { data, error } = await createClient().schema("outreach").from("lead_categories").insert({
        client_id: userId, name: trimmedName, color: newCategoryColor, position: leadCategories.length,
      }).select("id,name,color,position").single();
      if (error || !data) throw new Error(error?.message || "Unable to add this category.");
      setLeadCategories((current) => [...current, data]);
      setNewCategoryName("");
    } catch (error) {
      setCategorySettingsError(error instanceof Error ? error.message : "Unable to add this category.");
    } finally { setCategorySettingsSaving(false); }
  }
  function updateLeadCategoryField(id: string, field: "name" | "color", value: string) {
    setLeadCategories((current) => current.map((category) => category.id === id ? { ...category, [field]: value } : category));
  }
  async function commitLeadCategoryUpdate(id: string) {
    const category = leadCategories.find((current) => current.id === id);
    if (!category) return;
    const trimmedName = category.name.trim();
    if (!trimmedName) { setCategorySettingsError("A category needs a name."); return; }
    if (leadCategories.some((other) => other.id !== id && other.name.toLowerCase() === trimmedName.toLowerCase())) {
      setCategorySettingsError("You already have a category with this name.");
      return;
    }
    setCategorySettingsSaving(true);
    setCategorySettingsError("");
    try {
      const { error } = await createClient().schema("outreach").from("lead_categories").update({ name: trimmedName, color: category.color }).eq("id", id);
      if (error) throw new Error(error.message);
    } catch (error) {
      setCategorySettingsError(error instanceof Error ? error.message : "Unable to save this category.");
    } finally { setCategorySettingsSaving(false); }
  }
  async function deleteLeadCategory(id: string) {
    setCategorySettingsSaving(true);
    setCategorySettingsError("");
    try {
      const { error } = await createClient().schema("outreach").from("lead_categories").delete().eq("id", id);
      if (error) throw new Error(error.message);
      setLeadCategories((current) => current.filter((category) => category.id !== id));
      // The FK's own "on delete set null" already cleared category_id in
      // the database for any lead that had this category -- mirror that
      // here too so an open campaign modal's Leads list doesn't keep
      // showing a category that no longer exists until it's reopened.
      setClientLeadStatuses((current) => current.map((lead) => lead.categoryId === id ? { ...lead, categoryId: null } : lead));
    } catch (error) {
      setCategorySettingsError(error instanceof Error ? error.message : "Unable to delete this category.");
    } finally { setCategorySettingsSaving(false); }
  }
  async function deleteClientCampaign() {
    if (!clientCampaignModal) return;
    if (!clientCampaignConfirmDelete) { setClientCampaignConfirmDelete(true); return; }
    const campaignId = clientCampaignModal.id;
    setClientCampaignDeleting(true);
    setClientCampaignDeleteError("");
    const { error } = await createClient().schema("outreach").from("campaigns").delete().eq("id", campaignId);
    if (activeClientCampaignIdRef.current !== campaignId) return;
    if (error) { setClientCampaignDeleteError(error.message); setClientCampaignDeleting(false); setClientCampaignConfirmDelete(false); return; }
    setCampaigns((current) => current.filter((campaign) => campaign.id !== campaignId));
    setClientCampaignDeleting(false);
    closeClientCampaignModal();
  }
  async function saveCampaignStatus() {
    if (!waalaxyModal) return;
    setStatusSaving(true);
    setStatusError("");
    const { error } = await createClient().schema("outreach").from("campaigns").update({ status: campaignStatus.toLowerCase(), progress: campaignProgress }).eq("id", waalaxyModal.id);
    if (error) { setStatusError(error.message); setStatusSaving(false); return; }
    setCampaigns((current) => current.map((campaign) => campaign.id === waalaxyModal.id ? { ...campaign, status: campaignStatus, progress: campaignProgress } : campaign));
    setStatusSaving(false);
  }
  async function postAlert(clientId: string, campaignId: string | null) {
    if (!alertForm.message.trim()) { setAlertError("Write a message for the client."); return; }
    setAlertPosting(true);
    setAlertError("");
    const { data, error } = await createClient().schema("outreach").from("campaign_alerts").insert({
      client_id: clientId,
      campaign_id: campaignId,
      lead_reference: alertForm.leadReference.trim() || null,
      severity: alertForm.severity,
      message: alertForm.message.trim(),
      created_by: userId,
    }).select("id,client_id,campaign_id,lead_reference,severity,message,resolved,created_at").single();
    if (error || !data) { setAlertError(error?.message || "Unable to post this alert."); setAlertPosting(false); return; }
    setAlerts((current) => [{ id: data.id, clientId: data.client_id, campaignId: data.campaign_id, leadReference: data.lead_reference, severity: data.severity, message: data.message, resolved: data.resolved, createdAt: data.created_at }, ...current]);
    setAlertForm({ severity: "error", leadReference: "", message: "" });
    setAlertPosting(false);
  }
  async function resolveAlert(id: string) {
    const { error } = await createClient().schema("outreach").from("campaign_alerts").update({ resolved: true, resolved_at: new Date().toISOString() }).eq("id", id);
    if (error) return;
    setAlerts((current) => current.map((alert) => alert.id === id ? { ...alert, resolved: true } : alert));
  }
  function openAccountModal(account: Account) {
    activeLinkedinClientIdRef.current = account.role === "client" ? account.id : null;
    setAccountModal(account);
    setAccountError("");
    setAccountConfirmRemove(false);
    setAlertForm({ severity: "error", leadReference: "", message: "" });
    setAlertError("");
    setAdminLinkedinStatus(null);
    setAdminLinkedinError("");
    setAdminLinkedinReveal(null);
    setAdminLinkedinCodeReveal(null);
    setAdminLinkedinFailReason("");
    if (account.role === "client") void loadAdminLinkedinStatus(account.id);
  }
  function closeAccountModal() {
    activeLinkedinClientIdRef.current = null;
    setAccountModal(null);
  }
  function closeWaalaxyModal() {
    activeWaalaxyCampaignIdRef.current = null;
    setWaalaxyModal(null);
  }
  async function changeAccountRole(newRole: string) {
    if (!accountModal || newRole === accountModal.role) return;
    setAccountSaving(true);
    setAccountError("");
    try {
      const headers = await authHeader();
      const response = await fetch(`/api/admin/users/${accountModal.id}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ role: newRole }) });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Unable to update this account.");
      setAccounts((current) => current.map((account) => account.id === accountModal.id ? { ...account, role: newRole } : account));
      setAccountModal((current) => current ? { ...current, role: newRole } : current);
    } catch (error) { setAccountError(error instanceof Error ? error.message : "Unable to update this account."); }
    finally { setAccountSaving(false); }
  }
  async function removeAccountAccess() {
    if (!accountModal) return;
    if (!accountConfirmRemove) { setAccountConfirmRemove(true); return; }
    setAccountSaving(true);
    setAccountError("");
    try {
      const headers = await authHeader();
      const response = await fetch(`/api/admin/users/${accountModal.id}`, { method: "DELETE", headers });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Unable to remove this account.");
      setAccounts((current) => current.filter((account) => account.id !== accountModal.id));
      closeAccountModal();
    } catch (error) { setAccountError(error instanceof Error ? error.message : "Unable to remove this account."); }
    finally { setAccountSaving(false); }
  }
  async function saveWaalaxyLink() {
    if (!waalaxyModal) return;
    setWaalaxySaving(true);
    setWaalaxyError("");
    try {
      const headers = await authHeader();
      const response = await fetch(`/api/admin/campaigns/${waalaxyModal.id}/waalaxy`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(waalaxyLink) });
      const result = await readJson<{ error?: string; waalaxy_sync_status: string; waalaxy_sync_error?: string | null; waalaxy_prospects_imported?: number; waalaxy_synced_at?: string | null }>(response);
      if (!response.ok) throw new Error(result.error || "Unable to link this campaign.");
      setWaalaxySyncInfo({ status: result.waalaxy_sync_status, error: result.waalaxy_sync_error, imported: result.waalaxy_prospects_imported, syncedAt: result.waalaxy_synced_at });
    } catch (error) { setWaalaxyError(error instanceof Error ? error.message : "Unable to link this campaign."); }
    finally { setWaalaxySaving(false); }
  }
  async function pushLeadsToWaalaxy() {
    if (!waalaxyModal) return;
    setWaalaxyPushing(true);
    setWaalaxyError("");
    try {
      const headers = await authHeader();
      const response = await fetch(`/api/admin/campaigns/${waalaxyModal.id}/push-to-waalaxy`, { method: "POST", headers });
      const result = await readJson<{ error?: string; imported?: number; status?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Unable to push leads to Waalaxy.");
      setWaalaxySyncInfo({ status: result.status || "synced", error: result.error, imported: result.imported, syncedAt: new Date().toISOString() });
    } catch (error) { setWaalaxyError(error instanceof Error ? error.message : "Unable to push leads to Waalaxy."); }
    finally { setWaalaxyPushing(false); }
  }
  if (workspaceLoading) return <main className="workspaceGate" aria-busy="true"><Image src="/myntmore-logo.png" alt="Myntmore" width={2058} height={1336} priority /><p>Loading your workspace…</p></main>;
  const isAdmin = profile.role === "admin";
  const activeCampaigns = campaigns.filter((campaign) => ["Live", "In setup", "Submitted", "In review"].includes(campaign.status)).length;
  const totalLeads = campaigns.reduce((sum, campaign) => sum + (Number.parseInt(campaign.audience) || 0), 0);
  const inReviewCount = campaigns.filter((campaign) => ["Submitted", "In review"].includes(campaign.status)).length;
  const visibleCampaigns = statusFilter === "all" ? campaigns : campaigns.filter((campaign) => campaign.status === statusFilter);
  // The client hero's "All time" / "All campaigns" pickers only narrow the
  // ring cards + stat tiles above the campaign list -- the list itself keeps
  // its own independent status filter (visibleCampaigns, above). nowMs comes
  // from state (set once on mount, see the effect below) rather than a bare
  // Date.now() here, since reading the clock directly during render is an
  // impure call React's purity rules flag.
  const heroCutoffDays = heroTimeFilter === "all" ? null : Number(heroTimeFilter);
  // Falls back to "all" if the selected campaign no longer exists (e.g. it
  // was just deleted) -- otherwise the stat tiles would silently filter to
  // an empty set while the <select> visually resets to "All campaigns".
  const heroCampaignFilterValid = heroCampaignFilter === "all" || campaigns.some((campaign) => campaign.id === heroCampaignFilter) ? heroCampaignFilter : "all";
  const heroCampaigns = campaigns.filter((campaign) => {
    if (heroCampaignFilterValid !== "all" && campaign.id !== heroCampaignFilterValid) return false;
    if (heroCutoffDays !== null) {
      if (!campaign.submittedAt) return false;
      const ageDays = (nowMs - new Date(campaign.submittedAt).getTime()) / 86400000;
      if (ageDays > heroCutoffDays) return false;
    }
    return true;
  });
  const heroSubmittedCount = heroCampaigns.filter((campaign) => campaign.status === "Submitted").length;
  const heroActiveCampaigns = heroCampaigns.filter((campaign) => ["Live", "In setup", "Submitted", "In review"].includes(campaign.status)).length;
  const heroTotalLeads = heroCampaigns.reduce((sum, campaign) => sum + (Number.parseInt(campaign.audience) || 0), 0);
  const heroAvgProgress = heroCampaigns.length ? Math.round(heroCampaigns.reduce((sum, campaign) => sum + campaign.progress, 0) / heroCampaigns.length) : 0;
  const heroActiveRate = heroCampaigns.length ? Math.round((heroActiveCampaigns / heroCampaigns.length) * 100) : 0;
  const heroLiveCount = heroCampaigns.filter((campaign) => campaign.status === "Live").length;
  const heroInReviewCount = heroCampaigns.filter((campaign) => ["Submitted", "In review"].includes(campaign.status)).length;
  const heroConnectionsSent = heroCampaigns.reduce((sum, campaign) => sum + campaign.connectionsSent, 0);
  const heroConnectionsAccepted = heroCampaigns.reduce((sum, campaign) => sum + campaign.connectionsAccepted, 0);
  const heroRepliesReceived = heroCampaigns.reduce((sum, campaign) => sum + campaign.repliesReceived, 0);
  const heroAcceptanceRate = heroConnectionsSent ? Math.round((heroConnectionsAccepted / heroConnectionsSent) * 100) : 0;
  const heroReplyRate = heroConnectionsSent ? Math.round((heroRepliesReceived / heroConnectionsSent) * 100) : 0;
  const campaignAlerts = waalaxyModal ? alerts.filter((alert) => alert.campaignId === waalaxyModal.id) : [];
  const accountAlerts = accountModal ? alerts.filter((alert) => alert.campaignId === null && alert.clientId === accountModal.id) : [];
  const clientCampaignAlerts = clientCampaignModal ? alerts.filter((alert) => alert.campaignId === clientCampaignModal.id) : [];
  const activeAlerts = alerts.filter((alert) => !alert.resolved);
  return (
    <main className={`shell ${isAdmin ? "adminShell" : ""}`}>
      <aside className="sidebar">
        <div className="brand brandAsset"><Image src="/myntmore-logo.png" alt="Myntmore" width={2058} height={1336} priority /></div>
        <nav aria-label="Main navigation">{isAdmin ? <><button className={`navItem navButton ${adminView === "campaigns" ? "active" : ""}`} onClick={() => setAdminView("campaigns")}><span><Icon name="grid" /></span> Campaign operations</button><button className={`navItem navButton ${adminView === "users" ? "active" : ""}`} onClick={() => setAdminView("users")}><span><Icon name="users" /></span> User accounts</button></> : <><a className="navItem active" href="#campaigns"><span><Icon name="grid" /></span> Campaigns</a><button className="navItem navButton" onClick={() => { openWizard(); setStep(2); }}><span><Icon name="users" /></span> Upload leads</button><button className="navItem navButton" onClick={downloadTemplate}><span><Icon name="file" /></span> Download template</button><button className="navItem navButton" onClick={openLeadCategorySettings}><span><Icon name="tag" /></span> Lead labels</button></>}</nav>
        <div className="sidebarInsight">
          <div className="sidebarInsightHead"><span><Icon name={isAdmin ? "eye" : "trendUp"} size={15} /></span><div><strong>{isAdmin ? "Needs attention" : "This month"}</strong><small>Workspace pulse</small></div></div>
          <div className="sidebarInsightStats">
            {isAdmin ? <>
              <div><b>{workspaceLoading ? "-" : inReviewCount}</b><span>In review</span></div>
              <div><b>{workspaceLoading ? "-" : clientCount}</b><span>Clients</span></div>
            </> : <>
              <div><b>{workspaceLoading ? "-" : activeCampaigns}</b><span>Active</span></div>
              <div><b>{workspaceLoading ? "-" : totalLeads}</b><span>Leads reached</span></div>
            </>}
          </div>
          <button className="sidebarInsightCta" onClick={isAdmin ? () => setShowUserSetup(true) : openWizard}>{isAdmin ? "Add client" : "New campaign"} <Icon name="arrowUpRight" size={13} /></button>
        </div>
        <div className="sidebarBottom">
          <button className="navItem navButton" onClick={() => setShowHelp(true)}><span><Icon name="help" /></span> Help & support</button>
          <button className="navItem navButton" onClick={signOut}><span><Icon name="logout" /></span> Sign out</button>
          <div className="profile"><div className="avatar">{(profile.fullName || profile.email || "U").slice(0,2).toUpperCase()}</div><div><strong>{profile.fullName || profile.email || "Workspace user"}</strong><small>{profile.role === "admin" ? "Admin workspace" : "Client workspace"}</small></div><button aria-label="Profile menu"><Icon name="dots" /></button></div>
        </div>
      </aside>

      <section className="content" id="campaigns">
        <header className="topbar"><div><p className="eyebrow">{isAdmin ? "ADMIN WORKSPACE" : "OUTREACH WORKSPACE"}</p><h1>{isAdmin ? (adminView === "users" ? "User accounts" : "Operations") : "Campaigns"}</h1></div><button className="primary" onClick={isAdmin ? () => setShowUserSetup(true) : openWizard}>{isAdmin ? "＋ Create client account" : "＋ New campaign"}</button></header>
        {workspaceError && <p className="formError workspaceError" role="alert">We couldn&apos;t load your workspace: {workspaceError} <button type="button" onClick={() => window.location.reload()}>Retry</button></p>}
        {isAdmin ? adminView === "users" ? <div className="adminDashboard">
          <section className="campaignSection adminQueue accountsSection"><div className="sectionHeading"><div><p className="eyebrow">CLIENT ACCESS</p><h3>All accounts</h3><p>{accounts.length} total · {clientCount} client{clientCount === 1 ? "" : "s"}</p></div></div><div className="campaignList">{accounts.map((account) => { const campaignCount = campaigns.filter((campaign) => campaign.clientId === account.id).length; return <div className="accountRow" key={account.id} role="button" tabIndex={0} aria-label={`Manage ${account.fullName}`} onClick={() => openAccountModal(account)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAccountModal(account); } }}><div className="accountAvatar">{account.fullName.slice(0, 2).toUpperCase()}</div><div className="accountInfo"><strong>{account.fullName}</strong><span>{account.email}</span></div><span className={`accountRole ${account.role}`}>{account.role === "admin" ? "Admin" : "Client"}</span><div className="accountMeta">{account.role === "client" ? `${campaignCount} campaign${campaignCount === 1 ? "" : "s"} · ` : ""}Joined {new Date(account.createdAt).toLocaleDateString()}</div><span className="more" aria-hidden="true"><Icon name="dots" /></span></div>; })}{accounts.length === 0 && <div className="adminEmpty"><span>·</span><strong>No accounts yet.</strong><p>Create the first client or admin account.</p></div>}</div></section>
        </div> : <div className="adminDashboard">
          <section className="adminSummary"><div><p className="eyebrow">TODAY’S OVERVIEW</p><h2>Keep every client<br/>moving forward.</h2><p>Review what needs attention, manage access, and keep campaign delivery on track.</p></div><div className="adminMetrics"><div><span>Needs review</span><strong>{campaigns.filter((campaign) => ["Submitted", "In review"].includes(campaign.status)).length}</strong></div><div><span>Active</span><strong>{activeCampaigns}</strong></div><div><span>Total leads</span><strong>{totalLeads}</strong></div><div><span>Clients</span><strong>{clientCount}</strong></div></div></section>
          <div className="adminGrid"><section className="campaignSection adminQueue"><div className="sectionHeading"><div><p className="eyebrow">CAMPAIGN DELIVERY</p><h3>Work queue</h3><p>Submissions requiring action appear first.</p></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}><select className="filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option>{STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select><button type="button" className="secondary" disabled={campaignsExportLoading} onClick={downloadAllCampaigns}>{campaignsExportLoading ? "Preparing…" : "Download all campaigns"}</button></div></div>{campaignsExportError && <p className="formError" role="alert" style={{ margin: "0 25px 14px" }}>{campaignsExportError}</p>}<div className="campaignList">{visibleCampaigns.map((campaign) => <div className="campaign" key={campaign.id} role="button" tabIndex={0} aria-label={`Manage ${campaign.name}`} onClick={() => openWaalaxyModal(campaign)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openWaalaxyModal(campaign); } }}><div className="campaignIcon"><Icon name="arrowUpRight" size={15} /></div><div className="campaignInfo"><strong>{campaign.name}{alerts.some((alert) => alert.campaignId === campaign.id && !alert.resolved) && <Icon name="alertTriangle" size={12} />}</strong><span>{campaign.client ? `${campaign.client} · ` : ""}{campaign.audience}</span></div><div className="progress"><div><span>Progress</span><b>{campaign.progress}%</b></div><div className="track"><i style={{width:`${campaign.progress}%`}}/></div></div><span className={`status ${campaign.status.replaceAll(" ", "-").toLowerCase()}`}>{campaign.status}</span><span className="more" aria-hidden="true"><Icon name="dots" /></span></div>)}{!workspaceLoading && campaigns.length === 0 && <div className="adminEmpty"><span>✓</span><strong>Nothing needs attention.</strong><p>Client submissions will appear here as soon as they arrive.</p></div>}{!workspaceLoading && campaigns.length > 0 && visibleCampaigns.length === 0 && <div className="adminEmpty"><span>·</span><strong>No campaigns match this filter.</strong><p>Try a different status.</p></div>}</div></section>
          <aside className="adminPanel"><div className="adminPanelHead"><span>CLIENT ACCESS</span><strong>{clientCount}</strong></div><h3>Manage your clients</h3><p>Create portal access for a new client or connect an existing Myntmore login.</p><button className="primary" onClick={() => setShowUserSetup(true)}>＋ Add client account</button><div className="adminChecklist"><p>HOW IT WORKS</p><div><b>1</b><span>Create the client login</span></div><div><b>2</b><span>Client submits their brief</span></div><div><b>3</b><span>Campaign enters your queue</span></div></div></aside></div>
        </div> : <div className="clientDashboard">
          {activeAlerts.length > 0 && <div className="alertBanner">{activeAlerts.map((alert) => <div className={`alertBannerItem ${alert.severity}`} key={alert.id}><Icon name="alertTriangle" size={16} /><div><strong>{alert.message}</strong><span>{alert.campaignId ? `${campaigns.find((campaign) => campaign.id === alert.campaignId)?.name || "Campaign"}${alert.leadReference ? ` · ${alert.leadReference}` : ""}` : "Account-wide"}</span></div></div>)}</div>}
          <section className="clientHero"><div className="clientHeroText"><p className="eyebrow">YOUR OUTREACH</p><h2>Hello {(profile.fullName || profile.email || "there").split(" ")[0]}.</h2><p>Brief the Myntmore team once, then follow every campaign from setup to conversations.</p></div><div className="clientHeroFilters">
            <select className="filter" value={heroTimeFilter} onChange={(e) => setHeroTimeFilter(e.target.value)} aria-label="Filter stats by time"><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select>
            <select className="filter" value={heroCampaignFilterValid} onChange={(e) => setHeroCampaignFilter(e.target.value)} aria-label="Filter stats by campaign"><option value="all">All campaigns</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select>
          </div></section>
          <div className="ringCards">
            <div className="ringCard ringCardGold"><div className="ringCardHead"><span><Icon name="grid" size={14} /></span> Campaigns</div><div className="ringCardBody"><div className="ringCardCount"><strong>{workspaceLoading ? "-" : heroCampaigns.length}</strong><span>Total campaigns</span></div><div className="ringSide"><div className="ringWrap"><Ring percent={heroActiveRate} track="#ffffff35" indicator="#ffffff" /><div className="ringCenter"><b>{heroActiveRate}%</b></div></div><span className="ringCaption">Active rate</span></div></div></div>
            <div className="ringCard ringCardInk"><div className="ringCardHead"><span><Icon name="users" size={14} /></span> Leads</div><div className="ringCardBody"><div className="ringCardCount"><strong>{workspaceLoading ? "-" : heroTotalLeads}</strong><span>Total leads reached</span></div><div className="ringSide"><div className="ringWrap"><Ring percent={heroAvgProgress} track="#ffffff35" indicator="#ffffff" /><div className="ringCenter"><b>{heroAvgProgress}%</b></div></div><span className="ringCaption">Avg. progress</span></div></div></div>
          </div>
          <div className="actionTiles">
            <div className="tileInk"><span><Icon name="send" size={15} /></span><strong>{workspaceLoading ? "-" : heroSubmittedCount}</strong><small>Submitted</small></div>
            <div className="tileGreen"><span><Icon name="trendUp" size={15} /></span><strong>{workspaceLoading ? "-" : heroLiveCount}</strong><small>Live</small></div>
            <div className="tilePurple"><span><Icon name="eye" size={15} /></span><strong>{workspaceLoading ? "-" : heroInReviewCount}</strong><small>In review</small></div>
            <div className="tileGold"><span><Icon name="users" size={15} /></span><strong>{workspaceLoading ? "-" : heroTotalLeads}</strong><small>Leads reached</small></div>
            <div className="tileAmber"><span><Icon name="percent" size={15} /></span><strong>{workspaceLoading ? "-" : `${heroAvgProgress}%`}</strong><small>Avg. progress</small></div>
            <div className="tileTeal"><span><Icon name="checkCircle" size={15} /></span><strong>{workspaceLoading ? "-" : `${heroAcceptanceRate}%`}</strong><small>Acceptance rate</small></div>
            <div className="tileViolet"><span><Icon name="percent" size={15} /></span><strong>{workspaceLoading ? "-" : `${heroReplyRate}%`}</strong><small>Reply rate</small></div>
          </div>
          <div className="clientGrid">
            <section className="campaignSection clientCampaigns"><div className="sectionHeading"><div><p className="eyebrow">CAMPAIGN TRACKER</p><h3>Your campaigns</h3><p>Every brief, status update, and result in one place.</p></div><select className="filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option>{STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></div><div className="campaignList">{visibleCampaigns.map((campaign) => <div className="campaign" key={campaign.id} role="button" tabIndex={0} aria-label={`Open ${campaign.name}`} onClick={() => openClientCampaignModal(campaign)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openClientCampaignModal(campaign); } }}><div className="campaignIcon"><Icon name="arrowUpRight" size={15} /></div><div className="campaignInfo"><strong>{campaign.name}{alerts.some((alert) => alert.campaignId === campaign.id && !alert.resolved) && <Icon name="alertTriangle" size={12} />}</strong><span>{campaign.audience} · LinkedIn outreach</span></div><div className="progress"><div><span>Progress</span><b>{campaign.progress}%</b></div><div className="track"><i style={{width:`${campaign.progress}%`}}/></div></div><span className={`status ${campaign.status.replaceAll(" ", "-").toLowerCase()}`}>{campaign.status}</span><span className="more" aria-hidden="true"><Icon name="dots" /></span></div>)}{!workspaceLoading && campaigns.length === 0 && <div className="clientEmpty"><span>01</span><strong>Your first campaign starts here.</strong><p>Share your lead list and messaging direction. We’ll take it from there.</p><button className="primary" onClick={openWizard}>Start a campaign</button></div>}{!workspaceLoading && campaigns.length > 0 && visibleCampaigns.length === 0 && <div className="clientEmpty"><span>·</span><strong>No campaigns match this filter.</strong><p>Try a different status.</p></div>}</div></section>
            <aside className="clientSidebar">
              <div className="sidebarProfileCard"><div className="sidebarProfileTop"><div className="avatar">{(profile.fullName || profile.email || "U").slice(0,2).toUpperCase()}</div><span className="roleChip">Client</span></div><strong>{profile.fullName || profile.email || "Workspace user"}</strong><span>{profile.email || "Client workspace"}</span><div className="sidebarProfileStats"><div><b>{workspaceLoading ? "-" : activeCampaigns}</b><small>Active</small></div><div><b>{workspaceLoading ? "-" : totalLeads}</b><small>Leads</small></div><div><b>{workspaceLoading ? "-" : campaigns.length}</b><small>Total</small></div></div></div>
              {linkedinStatus?.status !== "logged_in" && <div className="sidebarProfileCard linkedinCard">
                <div className="sidebarInsightHead"><span><Icon name="logout" size={15} /></span><div><strong>LinkedIn access</strong><small>For your outreach campaigns</small></div></div>
                {linkedinLoading ? <p className="modalIntro">Loading…</p> : <>
                  {(!linkedinStatus || linkedinStatus.status === "failed") && <>
                    {linkedinStatus?.status === "failed" && <p className="formError" role="alert">{linkedinStatus.failure_reason || "Login failed. Please check your details and try again."}</p>}
                    <form className="loginForm" onSubmit={submitLinkedinCredentials}>
                      <label>LinkedIn email<input type="email" value={linkedinForm.email} onChange={(e) => setLinkedinForm({ ...linkedinForm, email: e.target.value })} required /></label>
                      <label>LinkedIn password<input type="password" value={linkedinForm.password} onChange={(e) => setLinkedinForm({ ...linkedinForm, password: e.target.value })} minLength={4} required /></label>
                      {linkedinError && <p className="formError" role="alert">{linkedinError}</p>}
                      <button className="secondary" disabled={linkedinSaving} style={{ width: "100%", marginTop: 4 }}>{linkedinSaving ? "Saving…" : "Submit details"}</button>
                    </form>
                  </>}
                  {linkedinStatus?.status === "pending" && <p className="modalIntro">Login Successful.</p>}
                  {linkedinStatus?.status === "awaiting_code" && <form className="loginForm" onSubmit={(e) => submitLinkedinCode(e)}>
                    <p className="formError" role="alert">LinkedIn sent a verification code. Enter it below so we can finish signing in.</p>
                    <label>Verification code<input value={linkedinCode} onChange={(e) => setLinkedinCode(e.target.value)} required /></label>
                    {linkedinError && <p className="formError" role="alert">{linkedinError}</p>}
                    <button className="secondary" disabled={linkedinSaving} style={{ width: "100%", marginTop: 4 }}>{linkedinSaving ? "Submitting…" : "Submit code"}</button>
                  </form>}
                  {linkedinStatus?.status === "awaiting_approval" && <>
                    <p className="formError" role="alert">Check your phone and tap Yes / Approve in the LinkedIn app, then confirm below.</p>
                    {linkedinError && <p className="formError" role="alert">{linkedinError}</p>}
                    <button className="secondary" disabled={linkedinSaving} style={{ width: "100%", marginTop: 4 }} onClick={() => submitLinkedinCode(null, "approved")}>{linkedinSaving ? "Confirming…" : "I've approved it"}</button>
                  </>}
                  {linkedinStatus?.status === "code_submitted" && <p className="modalIntro">Thanks. We&apos;re finishing your login now.</p>}
                </>}
              </div>}
              <div className="clientAction"><p className="eyebrow">NEW CAMPAIGN</p><h3>Ready to reach<br/>the right people?</h3><p>Send us the audience and your point of view. We handle the sequence, launch, and reporting.</p><button className="lightButton" onClick={openWizard}>Create campaign <span><Icon name="arrowUpRight" size={14} /></span></button><div className="clientSteps"><div><b>1</b><span>Campaign brief</span></div><div><b>2</b><span>Lead list upload</span></div><div><b>3</b><span>Messaging direction</span></div></div></div>
            </aside>
          </div>
        </div>}
      </section>
      {showWizard && <div className="modalBackdrop">
        <button className="modalDismiss" onClick={() => setShowWizard(false)} aria-label="Close campaign setup" />
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
          <button className="close" onClick={() => setShowWizard(false)} aria-label="Close campaign setup">×</button>
          {!submitted ? <>
            <div className="stepper"><span className={step >= 1 ? "done" : ""}>1</span><i/><span className={step >= 2 ? "done" : ""}>2</span><i/><span className={step >= 3 ? "done" : ""}>3</span></div>
            {step === 1 && <div className="modalBody"><p className="eyebrow">STEP 1 OF 3 · CAMPAIGN BRIEF</p><h2 id="wizard-title">What are we building?</h2><p className="modalIntro">Give our team the context we need to shape your outreach.</p>
              <label>Campaign name<input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. India SaaS founders, September"/></label>
              <label>Primary goal<select value={form.goal} onChange={(e) => update("goal", e.target.value)}><option>Book qualified discovery calls</option><option>Build strategic partnerships</option><option>Recruit candidates</option><option>Start investor conversations</option></select></label>
              <label>Your offer or value proposition<textarea value={form.offer} onChange={(e) => update("offer", e.target.value)} placeholder="What makes this conversation valuable for the recipient?" rows={3}/></label>
            </div>}
            {step === 2 && <div className="modalBody"><p className="eyebrow">STEP 2 OF 3 · LEAD LIST</p><h2 id="wizard-title">Add the right people.</h2><p className="modalIntro">Use our template so your campaign can move into setup without delays.</p>
              <div className="templateCard"><div><strong>Myntmore lead template</strong><small>Includes the exact columns our team needs.</small></div><button onClick={downloadTemplate}>↓ Download CSV</button></div>
              {!columnMapping ? <>
                <label className={`dropzone ${fileName ? "hasFile" : ""}`}><input type="file" accept=".csv,text/csv" onChange={(e) => void chooseLeadFile(e.target.files?.[0] || null)}/><span>{fileName ? "✓" : "↑"}</span><strong>{fileName || "Drop your completed CSV here"}</strong><small>{fileName ? "Validated and ready" : "or click to choose a file · CSV up to 10 MB"}</small></label>
                {submitError && <p className="formError" role="alert">{submitError}</p>}
              </> : <div className="columnMapper">
                <p className="modalIntro"><strong>{columnMapping.sourceFileName}</strong> doesn&apos;t use our exact column names. Match your columns to the fields below. LinkedIn URL is required, the rest are optional.</p>
                {LEAD_CSV_HEADERS.map((field) => (
                  <label key={field}>{LEAD_FIELD_LABELS[field]}{LEAD_FIELD_REQUIRED[field] ? " *" : <span className="fieldHint">Optional</span>}
                    <select value={columnMapping.mapping[field] ?? ""} onChange={(e) => updateColumnMapping(field, e.target.value)}>
                      <option value="">(Not in file)</option>
                      {describeColumnOptions(columnMapping.headers).map((option) => <option key={option.index} value={option.index}>{option.label}</option>)}
                    </select>
                  </label>
                ))}
                {mappingError && <p className="formError" role="alert">{mappingError}</p>}
                <div className="waalaxyActions">
                  <button type="button" className="secondary" onClick={cancelColumnMapping}>Choose a different file</button>
                  <button type="button" className="primary" disabled={columnMapping.mapping.linkedin_url === undefined} onClick={applyColumnMapping}>Use these columns</button>
                </div>
              </div>}
            </div>}
            {step === 3 && <div className="modalBody sequenceBuilder"><p className="eyebrow">STEP 3 OF 3 · SEQUENCE</p><h2 id="wizard-title">Build the conversation.</h2><p className="modalIntro">Add the exact connection note and follow-ups you want us to configure for your outreach.</p>
              <label>Voice and tone<input value={form.tone} onChange={(e) => update("tone", e.target.value)}/></label>
              <label>Connection request note <span className="fieldHint">{form.connectionNote.length}/300</span><textarea value={form.connectionNote} maxLength={300} onChange={(e) => update("connectionNote", e.target.value)} placeholder="Hi {{first_name}}, I came across your work at {{company}} and would love to connect." rows={3}/></label>
              <div className="placeholderRow"><span>Insert placeholder</span>{[["First name","{{first_name}}"],["Last name","{{last_name}}"],["Company","{{company}}"]].map(([label,token]) => <button type="button" key={token} onClick={() => addPlaceholder("connectionNote",token)}>{label}</button>)}</div>
              <fieldset className="followUpChoice"><legend>Number of follow-ups</legend>{[1,2,3].map((count) => <button type="button" className={form.followUpCount === count ? "selected" : ""} key={count} onClick={() => setForm({...form,followUpCount:count})}>{count}</button>)}</fieldset>
              {form.followUps.slice(0,form.followUpCount).map((followUp,index) => <div className="followUpField" key={index}><label>Follow-up {index + 1}<textarea value={followUp} onChange={(event) => updateFollowUp(index,event.target.value)} placeholder={index === 0 ? "Thanks for connecting, {{first_name}}. I wanted to share…" : "A short, useful follow-up with a clear next step."} rows={3}/></label><div className="placeholderRow"><span>Personalize</span>{[["First name","{{first_name}}"],["Last name","{{last_name}}"],["Company","{{company}}"]].map(([label,token]) => <button type="button" key={token} onClick={() => addPlaceholder("followUp",token,index)}>{label}</button>)}</div></div>)}
              <label>Supporting context <span className="fieldHint">Optional</span><textarea value={form.message} onChange={(e) => update("message", e.target.value)} placeholder="Proof points, phrases to avoid, preferred CTA, or other constraints." rows={3}/></label>
              <div className="reviewStrip"><span>Campaign</span><strong>{form.name || "Untitled campaign"}</strong><span>Sequence</span><strong>Connection note + {form.followUpCount} follow-up{form.followUpCount > 1 ? "s" : ""}</strong></div>
              {step === 3 && submitError && <p className="formError" role="alert">{submitError}</p>}
            </div>}
            <footer className="modalFooter"><button className="secondary" onClick={() => step === 1 ? setShowWizard(false) : setStep(step - 1)} disabled={submitting}>{step === 1 ? "Cancel" : "Back"}</button><button className="primary" disabled={submitting || (step === 1 && !form.name.trim()) || (step === 2 && !leadFile) || (step === 3 && (!form.connectionNote.trim() || form.followUps.slice(0,form.followUpCount).some((message) => !message.trim())))} onClick={() => step < 3 ? setStep(step + 1) : submitCampaign()}>{step < 3 ? "Continue →" : submitting ? "Submitting…" : "Submit campaign →"}</button></footer>
          </> : <div className="success"><div className="successIcon">✓</div><p className="eyebrow">CAMPAIGN RECEIVED</p><h2 id="wizard-title">It’s with the Myntmore team.</h2><p>We’ll review your leads and messaging, configure your sequence, and update the status here. You’ll see progress within one business day.</p><button className="primary" onClick={() => setShowWizard(false)}>Back to campaigns</button></div>}
        </section>
      </div>}
      {showUserSetup && profile.role === "admin" && <div className="modalBackdrop"><button className="modalDismiss" onClick={() => setShowUserSetup(false)} aria-label="Close user setup"/><section className="modal accountModal" role="dialog" aria-modal="true" aria-labelledby="user-setup-title"><button className="close" onClick={() => setShowUserSetup(false)} aria-label="Close user setup">×</button><div className="modalBody"><p className="eyebrow">ADMIN · USER ACCOUNTS</p><h2 id="user-setup-title">Create a user account.</h2><p className="modalIntro">Choose the access level, then share the credentials securely with the user.</p><form className="loginForm" onSubmit={createUser}><fieldset className="accountType"><legend>Account type</legend><button type="button" className={userForm.role === "client" ? "selected" : ""} onClick={() => setUserForm({...userForm,role:"client"})}><b>Client</b><span>Submit and track campaigns</span></button><button type="button" className={userForm.role === "admin" ? "selected" : ""} onClick={() => setUserForm({...userForm,role:"admin"})}><b>Admin</b><span>Manage clients and operations</span></button></fieldset><label>Full name<input value={userForm.fullName} onChange={(event) => setUserForm({...userForm, fullName:event.target.value})} placeholder="Full name or company" required/></label><label>Email address<input type="email" value={userForm.email} onChange={(event) => setUserForm({...userForm, email:event.target.value})} placeholder={userForm.role === "admin" ? "admin@myntmore.com" : "client@company.com"} required/></label><label>Temporary password<input type="password" minLength={8} value={userForm.password} onChange={(event) => setUserForm({...userForm, password:event.target.value})} placeholder="At least 8 characters" required/></label>{userError && <p className="formError" role="alert">{userError}</p>}{userCreated && <p className="formSuccess" role="status">{userCreated}</p>}<button className="loginButton" disabled={userLoading}>{userLoading ? "Creating user…" : `Create ${userForm.role} account`}<span>→</span></button></form></div></section></div>}
      {waalaxyModal && <div className="modalBackdrop">
        <button className="modalDismiss" onClick={() => closeWaalaxyModal()} aria-label="Close manage campaign" />
        <section className="modal accountModal" role="dialog" aria-modal="true" aria-labelledby="waalaxy-title">
          <button className="close" onClick={() => closeWaalaxyModal()} aria-label="Close manage campaign">×</button>
          <div className="modalBody">
            <p className="eyebrow">MANAGE CAMPAIGN</p>
            <h2 id="waalaxy-title">{waalaxyModal.name}</h2>
            <h3 className="modalSectionTitle">Delivery status</h3>
            <label>Status<select value={campaignStatus} onChange={(e) => setCampaignStatus(e.target.value)}>{STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <label>Progress <span className="fieldHint">{campaignProgress}%</span><input type="range" min={0} max={100} step={5} value={campaignProgress} onChange={(e) => setCampaignProgress(Number(e.target.value))} style={{ "--range-progress": `${campaignProgress}%` } as React.CSSProperties} /></label>
            {statusError && <p className="formError" role="alert">{statusError}</p>}
            <button className="secondary" onClick={saveCampaignStatus} disabled={statusSaving} style={{ width: "100%", marginTop: 14 }}>{statusSaving ? "Saving…" : "Save status"}</button>
            <div className="waalaxyDivider" />
            <h3 className="modalSectionTitle">Alerts</h3>
            <p className="modalIntro">Post an issue for the client to see on their dashboard. Leave the lead field blank for a campaign-wide alert, or name a specific lead (e.g. their LinkedIn URL) to flag just that row.</p>
            <label>Lead <span className="fieldHint">Optional</span><input value={alertForm.leadReference} onChange={(e) => setAlertForm({ ...alertForm, leadReference: e.target.value })} placeholder="e.g. linkedin.com/in/jane-doe" /></label>
            <label>Message<textarea value={alertForm.message} onChange={(e) => setAlertForm({ ...alertForm, message: e.target.value })} placeholder="e.g. LinkedIn URL incorrect, please check and resubmit." rows={2} /></label>
            <fieldset className="severityChoice"><legend className="srOnly">Severity</legend>{["info", "warning", "error"].map((level) => <button type="button" key={level} className={alertForm.severity === level ? `selected ${level}` : level} onClick={() => setAlertForm({ ...alertForm, severity: level })}>{level}</button>)}</fieldset>
            {alertError && <p className="formError" role="alert">{alertError}</p>}
            <button className="secondary" style={{ width: "100%", marginTop: 14 }} disabled={alertPosting} onClick={() => postAlert(campaigns.find((campaign) => campaign.id === waalaxyModal.id)?.clientId || "", waalaxyModal.id)}>{alertPosting ? "Posting…" : "Post alert"}</button>
            {campaignAlerts.length > 0 && <div className="alertList">{campaignAlerts.map((alert) => <div className={`alertItem ${alert.severity} ${alert.resolved ? "resolved" : ""}`} key={alert.id}><Icon name={alert.resolved ? "checkCircle" : "alertTriangle"} size={15} /><div><strong>{alert.leadReference || "Campaign-wide"}</strong><span>{alert.message}</span></div>{!alert.resolved && <button onClick={() => resolveAlert(alert.id)}>Resolve</button>}</div>)}</div>}
            <div className="waalaxyDivider" />
            <h3 className="modalSectionTitle">Brief, messages &amp; leads</h3>
            <p className="modalIntro">Everything needed to configure this campaign in Waalaxy by hand.</p>
            {waalaxyLoading ? <p className="modalIntro">Loading…</p> : !campaignBrief ? (
              <p className="formError" role="alert">Unable to load this campaign&apos;s brief.</p>
            ) : <>
              <div className="reviewStrip">
                <span>Goal</span><strong>{campaignBrief.goal || "-"}</strong>
                <span>Offer</span><strong>{campaignBrief.offer || "-"}</strong>
                <span>Tone</span><strong>{campaignBrief.tone || "-"}</strong>
              </div>
              {campaignBrief.messagingStrategy && <div className="briefField"><span className="briefLabel">Messaging strategy</span><p>{campaignBrief.messagingStrategy}</p></div>}
              <div className="briefField"><span className="briefLabel">Connection request note</span><p>{campaignBrief.connectionNote || "-"}</p></div>
              {campaignBrief.followUps.map((message, index) => <div className="briefField" key={index}><span className="briefLabel">Follow-up {index + 1}</span><p>{message || "-"}</p></div>)}
              {leadsDownloadError && <p className="formError" role="alert">{leadsDownloadError}</p>}
              <button className="secondary" style={{ width: "100%", marginTop: 14 }} disabled={leadsDownloading} onClick={() => downloadCampaignLeads(waalaxyModal.id, waalaxyModal.name)}>{leadsDownloading ? "Downloading…" : "Download leads (CSV)"}</button>
            </>}
            <div className="waalaxyDivider" />
            <h3 className="modalSectionTitle">Performance metrics</h3>
            <p className="modalIntro">Upload Waalaxy&apos;s contact export for this campaign and we will count connections sent, accepted, and replied to from each lead&apos;s own dates, and update every lead&apos;s individual status on the client&apos;s dashboard. Positive replies is still your call, the export doesn&apos;t say which replies were positive.</p>
            <label className={`dropzone ${metricsCsvName ? "hasFile" : ""}`}>
              <input type="file" accept=".csv,text/csv" onChange={(e) => void chooseMetricsCsv(e.target.files?.[0] || null)} />
              <span>{metricsCsvName ? "✓" : "↑"}</span>
              <strong>{metricsCsvName || "Drop a Waalaxy contact export here"}</strong>
              <small>{metricsCsvName ? "Parsed -- review the numbers below" : "or click to choose a file"}</small>
            </label>
            {metricsCsvError && <p className="formError" role="alert">{metricsCsvError}</p>}
            {metricsCsvSummary && !metricsCsvError && <p className="formSuccess" role="status">{metricsCsvSummary.total} lead{metricsCsvSummary.total === 1 ? "" : "s"} in this export: {metricsCsvSummary.sent} sent, {metricsCsvSummary.accepted} accepted, {metricsCsvSummary.replied} replied. Each lead&apos;s status is already updated for the client -- set positive replies below, then save these totals.</p>}
            <div className="metricsGrid">
              <label>Connections sent<input type="number" min={0} value={campaignMetrics.connectionsSent} onChange={(e) => setCampaignMetrics({ ...campaignMetrics, connectionsSent: Math.max(0, Number(e.target.value) || 0) })} /></label>
              <label>Connections accepted<input type="number" min={0} value={campaignMetrics.connectionsAccepted} onChange={(e) => setCampaignMetrics({ ...campaignMetrics, connectionsAccepted: Math.max(0, Number(e.target.value) || 0) })} /></label>
              <label>Replies received<input type="number" min={0} value={campaignMetrics.repliesReceived} onChange={(e) => setCampaignMetrics({ ...campaignMetrics, repliesReceived: Math.max(0, Number(e.target.value) || 0) })} /></label>
              <label>Positive replies<input type="number" min={0} value={campaignMetrics.positiveReplies} onChange={(e) => setCampaignMetrics({ ...campaignMetrics, positiveReplies: Math.max(0, Number(e.target.value) || 0) })} /></label>
            </div>
            <div className="metricRates">
              <div className="metricRate"><strong>{campaignMetrics.connectionsSent ? Math.round((campaignMetrics.connectionsAccepted / campaignMetrics.connectionsSent) * 100) : 0}%</strong><span>Acceptance rate</span></div>
              <div className="metricRate"><strong>{campaignMetrics.repliesReceived ? Math.round((campaignMetrics.positiveReplies / campaignMetrics.repliesReceived) * 100) : 0}%</strong><span>Positive reply rate</span></div>
            </div>
            {metricsError && <p className="formError" role="alert">{metricsError}</p>}
            <button className="secondary" style={{ width: "100%", marginTop: 14 }} disabled={metricsSaving} onClick={saveCampaignMetrics}>{metricsSaving ? "Saving…" : "Save metrics"}</button>
            <div className="waalaxyDivider" />
            <h3 className="modalSectionTitle">Waalaxy sync</h3>
            <p className="modalIntro">Link this campaign to the Waalaxy campaign your team already created for it, then push the client&apos;s uploaded leads straight in. No manual CSV upload into Waalaxy.</p>
            {waalaxyLoading ? <p className="modalIntro">Loading…</p> : waalaxyNotConfigured ? (
              <p className="formError" role="alert">Waalaxy integration isn&apos;t configured yet. Set WAALAXY_API_KEY on the server, then reopen this.</p>
            ) : <>
              <label>Waalaxy campaign<select value={waalaxyLink.waalaxyCampaignId} onChange={(e) => setWaalaxyLink({ ...waalaxyLink, waalaxyCampaignId: e.target.value })}><option value="">Select a campaign…</option>{waalaxyCampaignsList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label>Waalaxy prospect list<select value={waalaxyLink.waalaxyListId} onChange={(e) => setWaalaxyLink({ ...waalaxyLink, waalaxyListId: e.target.value })}><option value="">Select a list…</option>{waalaxyListsList.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
              {waalaxyError && <p className="formError" role="alert">{waalaxyError}</p>}
              {waalaxySyncInfo?.status === "synced" && <p className="formSuccess" role="status">Synced {waalaxySyncInfo.imported ?? 0} lead{waalaxySyncInfo.imported === 1 ? "" : "s"} to Waalaxy{waalaxySyncInfo.syncedAt ? ` on ${new Date(waalaxySyncInfo.syncedAt).toLocaleString()}` : ""}.{waalaxySyncInfo.error ? ` ${waalaxySyncInfo.error}` : ""}</p>}
              {waalaxySyncInfo?.status === "partial" && <p className="formError" role="alert">Partially synced: {waalaxySyncInfo.imported ?? 0} leads imported. {waalaxySyncInfo.error}</p>}
              {waalaxySyncInfo?.status === "failed" && waalaxySyncInfo.error && <p className="formError" role="alert">Last sync attempt failed: {waalaxySyncInfo.error}</p>}
              <div className="waalaxyActions">
                <button className="secondary" onClick={saveWaalaxyLink} disabled={waalaxySaving || !waalaxyLink.waalaxyCampaignId || !waalaxyLink.waalaxyListId}>{waalaxySaving ? "Saving…" : "Save link"}</button>
                <button className="primary" onClick={pushLeadsToWaalaxy} disabled={waalaxyPushing || !waalaxyLink.waalaxyCampaignId || !waalaxyLink.waalaxyListId}>{waalaxyPushing ? "Pushing leads…" : "Push leads to Waalaxy"}</button>
              </div>
            </>}
          </div>
        </section>
      </div>}
      {clientCampaignModal && <div className="modalBackdrop campaignPageBackdrop">
        <button className="modalDismiss" onClick={closeClientCampaignModal} aria-label="Close campaign details" />
        <section className="modal campaignPageModal" role="dialog" aria-modal="true" aria-labelledby="client-campaign-title">
          <button className="close" onClick={closeClientCampaignModal} aria-label="Close campaign details">×</button>
          <div className="modalBody">
            <p className="eyebrow">CAMPAIGN DETAILS</p>
            <h2 id="client-campaign-title">{clientCampaignModal.name}</h2>
            <p className="modalIntro">{clientCampaignModal.status} · {clientCampaignModal.progress}% complete{clientCampaignDetail?.submittedAt ? ` · Submitted ${new Date(clientCampaignDetail.submittedAt).toLocaleDateString()}` : ""}</p>
            {clientCampaignLoading ? <p className="modalIntro">Loading…</p> : clientCampaignError ? (
              <p className="formError" role="alert">{clientCampaignError}</p>
            ) : clientCampaignDetail && <>
              <div className="sectionHeadRow">
                <h3 className="modalSectionTitle" style={{ marginTop: 0 }}>Campaign brief</h3>
                {!editingCampaign && clientCampaignModal.status !== "Completed" && <button type="button" className="expandToggle" onClick={startEditingCampaign}>Edit</button>}
              </div>
              {!editingCampaign ? <>
                <div className="reviewStrip">
                  <span>Goal</span><strong>{clientCampaignDetail.goal || "-"}</strong>
                  <span>Offer</span><strong>{clientCampaignDetail.offer || "-"}</strong>
                  <span>Tone</span><strong>{clientCampaignDetail.tone || "-"}</strong>
                </div>
                {clientCampaignDetail.messagingStrategy && <div className="briefField"><span className="briefLabel">Messaging strategy</span><p>{clientCampaignDetail.messagingStrategy}</p></div>}
                <div className="briefField"><span className="briefLabel">Connection request note</span><p>{clientCampaignDetail.connectionNote || "-"}</p></div>
                {clientCampaignDetail.followUps.map((message, index) => <div className="briefField" key={index}><span className="briefLabel">Follow-up {index + 1}</span><p>{message || "-"}</p></div>)}
              </> : <div className="sequenceBuilder">
                <p className="modalIntro">Editing this campaign flags it for our team to review before we continue outreach with the new messaging.</p>
                <label>Primary goal<select value={editCampaignForm.goal} onChange={(e) => updateEditField("goal", e.target.value)}><option>Book qualified discovery calls</option><option>Build strategic partnerships</option><option>Recruit candidates</option><option>Start investor conversations</option></select></label>
                <label>Your offer or value proposition<textarea value={editCampaignForm.offer} onChange={(e) => updateEditField("offer", e.target.value)} placeholder="What makes this conversation valuable for the recipient?" rows={3} /></label>
                <label>Voice and tone<input value={editCampaignForm.tone} onChange={(e) => updateEditField("tone", e.target.value)} /></label>
                <label>Connection request note <span className="fieldHint">{editCampaignForm.connectionNote.length}/300</span><textarea value={editCampaignForm.connectionNote} maxLength={300} onChange={(e) => updateEditField("connectionNote", e.target.value)} rows={3} /></label>
                <div className="placeholderRow"><span>Insert placeholder</span>{[["First name", "{{first_name}}"], ["Last name", "{{last_name}}"], ["Company", "{{company}}"]].map(([label, token]) => <button type="button" key={token} onClick={() => addEditPlaceholder("connectionNote", token)}>{label}</button>)}</div>
                <fieldset className="followUpChoice"><legend>Number of follow-ups</legend>{[1, 2, 3].map((count) => <button type="button" className={editCampaignForm.followUpCount === count ? "selected" : ""} key={count} onClick={() => setEditCampaignForm({ ...editCampaignForm, followUpCount: count })}>{count}</button>)}</fieldset>
                {editCampaignForm.followUps.slice(0, editCampaignForm.followUpCount).map((followUp, index) => <div className="followUpField" key={index}><label>Follow-up {index + 1}<textarea value={followUp} onChange={(e) => updateEditFollowUp(index, e.target.value)} rows={3} /></label><div className="placeholderRow"><span>Personalize</span>{[["First name", "{{first_name}}"], ["Last name", "{{last_name}}"], ["Company", "{{company}}"]].map(([label, token]) => <button type="button" key={token} onClick={() => addEditPlaceholder("followUp", token, index)}>{label}</button>)}</div></div>)}
                <label>Supporting context <span className="fieldHint">Optional</span><textarea value={editCampaignForm.messagingStrategy} onChange={(e) => updateEditField("messagingStrategy", e.target.value)} placeholder="Proof points, phrases to avoid, preferred CTA, or other constraints." rows={3} /></label>
                {editCampaignError && <p className="formError" role="alert">{editCampaignError}</p>}
                <div className="waalaxyActions">
                  <button type="button" className="secondary" onClick={() => setEditingCampaign(false)} disabled={editCampaignSaving}>Cancel</button>
                  <button type="button" className="primary" disabled={editCampaignSaving || !editCampaignForm.connectionNote.trim() || editCampaignForm.followUps.slice(0, editCampaignForm.followUpCount).some((message) => !message.trim())} onClick={saveCampaignEdits}>{editCampaignSaving ? "Saving…" : "Save changes"}</button>
                </div>
              </div>}
              {(clientCampaignDetail.connectionsSent > 0 || clientCampaignDetail.repliesReceived > 0) && <>
                <div className="waalaxyDivider" />
                <h3 className="modalSectionTitle">Performance</h3>
                <div className="metricRates">
                  <div className="metricRate"><strong>{clientCampaignDetail.connectionsSent ? Math.round((clientCampaignDetail.connectionsAccepted / clientCampaignDetail.connectionsSent) * 100) : 0}%</strong><span>Acceptance rate</span></div>
                  <div className="metricRate"><strong>{clientCampaignDetail.repliesReceived ? Math.round((clientCampaignDetail.positiveReplies / clientCampaignDetail.repliesReceived) * 100) : 0}%</strong><span>Positive reply rate</span></div>
                </div>
              </>}
              {clientLeadStatuses.length > 0 && <>
                <div className="waalaxyDivider" />
                <div className="sectionHeadRow"><h3 className="modalSectionTitle">Leads ({clientLeadStatuses.length})</h3>{clientLeadStatuses.length > 5 && <button type="button" className="expandToggle" onClick={() => setLeadStatusExpanded((current) => !current)}>{leadStatusExpanded ? "Show less" : "Expand"}</button>}</div>
                <p className="modalIntro">Status for each lead in this campaign, current as of your last metrics update. Tag a lead with your own label from the dropdown -- manage your labels from <button type="button" className="inlineLink" onClick={openLeadCategorySettings}>Lead labels</button> in the sidebar.</p>
                {leadCategoryError && <p className="formError" role="alert">{leadCategoryError}</p>}
                <div className={`leadStatusList ${leadStatusExpanded ? "expanded" : ""}`}>
                  {clientLeadStatuses.map((lead) => {
                    const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed lead";
                    const stage = lead.repliedAt ? "Replied" : lead.connectedAt ? "Accepted" : lead.connectionRequestDate ? "Sent" : "Not yet sent";
                    const stageClass = lead.repliedAt ? "replied" : lead.connectedAt ? "accepted" : lead.connectionRequestDate ? "sent" : "pending";
                    const category = leadCategories.find((current) => current.id === lead.categoryId);
                    return (
                      <div className="leadStatusRow" key={lead.linkedinUrl}>
                        <div className="leadStatusName"><strong>{name}</strong>{lead.company && <span>{lead.company}</span>}</div>
                        <span className={`leadStatusPill ${stageClass}`}>{stage}</span>
                        <select className="leadCategorySelect" value={lead.categoryId || ""} disabled={leadCategorySavingId === lead.id} style={category ? { color: category.color, borderColor: category.color } : undefined} aria-label={`Label for ${name}`} onChange={(e) => chooseLeadCategory(lead.id, e.target.value || null)}>
                          <option value="">Unlabeled</option>
                          {leadCategories.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </>}
              {clientCampaignAlerts.length > 0 && <>
                <div className="waalaxyDivider" />
                <h3 className="modalSectionTitle">Alerts</h3>
                <div className="alertList">{clientCampaignAlerts.map((alert) => <div className={`alertItem ${alert.severity} ${alert.resolved ? "resolved" : ""}`} key={alert.id}><Icon name={alert.resolved ? "checkCircle" : "alertTriangle"} size={15} /><div><strong>{alert.leadReference || "Campaign-wide"}</strong><span>{alert.message}</span></div></div>)}</div>
              </>}
              {clientCampaignModal.status !== "Completed" && <>
                <div className="waalaxyDivider" />
                <h3 className="modalSectionTitle">Add leads</h3>
                <p className="modalIntro">Currently {clientCampaignModal.audience}. Upload another batch, e.g. this week&apos;s new leads, and we&apos;ll add them to this campaign. Anyone already on the list is skipped automatically.</p>
                {!addLeadsMapping ? <>
                  <label className={`dropzone ${addLeadsFileName ? "hasFile" : ""}`}>
                    <input type="file" accept=".csv,text/csv" onChange={(e) => void chooseAddLeadsFile(e.target.files?.[0] || null)} />
                    <span>{addLeadsFileName ? "✓" : "↑"}</span>
                    <strong>{addLeadsFileName || "Drop a CSV of new leads here"}</strong>
                    <small>{addLeadsFileName ? "Validated and ready" : "or click to choose a file · CSV up to 10 MB"}</small>
                  </label>
                  {addLeadsError && <p className="formError" role="alert">{addLeadsError}</p>}
                  {addLeadsResult && <p className="formSuccess" role="status">Added {addLeadsResult.added} new lead{addLeadsResult.added === 1 ? "" : "s"}{addLeadsResult.duplicates ? ` (skipped ${addLeadsResult.duplicates} already in this campaign)` : ""}. This campaign now has {addLeadsResult.total} leads.</p>}
                  <button type="button" className="secondary" style={{ width: "100%", marginTop: 14 }} disabled={!addLeadsFile || addLeadsUploading} onClick={uploadMoreLeads}>{addLeadsUploading ? "Adding leads…" : "Add leads"}</button>
                </> : <div className="columnMapper">
                  <p className="modalIntro"><strong>{addLeadsMapping.sourceFileName}</strong> doesn&apos;t use our exact column names. Match your columns to the fields below. LinkedIn URL is required, the rest are optional.</p>
                  {LEAD_CSV_HEADERS.map((field) => (
                    <label key={field}>{LEAD_FIELD_LABELS[field]}{LEAD_FIELD_REQUIRED[field] ? " *" : <span className="fieldHint">Optional</span>}
                      <select value={addLeadsMapping.mapping[field] ?? ""} onChange={(e) => updateAddLeadsMapping(field, e.target.value)}>
                        <option value="">(Not in file)</option>
                        {describeColumnOptions(addLeadsMapping.headers).map((option) => <option key={option.index} value={option.index}>{option.label}</option>)}
                      </select>
                    </label>
                  ))}
                  {addLeadsMappingError && <p className="formError" role="alert">{addLeadsMappingError}</p>}
                  <div className="waalaxyActions">
                    <button type="button" className="secondary" onClick={cancelAddLeadsMapping}>Choose a different file</button>
                    <button type="button" className="primary" disabled={addLeadsMapping.mapping.linkedin_url === undefined} onClick={applyAddLeadsMapping}>Use these columns</button>
                  </div>
                </div>}
              </>}
              {clientCampaignModal.status === "Submitted" && !clientCampaignAlerts.some((alert) => !alert.resolved) && <>
                <div className="waalaxyDivider" />
                {clientCampaignDeleteError && <p className="formError" role="alert">{clientCampaignDeleteError}</p>}
                <button className="dangerButton" disabled={clientCampaignDeleting} onClick={deleteClientCampaign}>{clientCampaignDeleting ? "Removing…" : clientCampaignConfirmDelete ? "Click again to confirm removal" : "Remove this campaign"}</button>
              </>}
            </>}
          </div>
        </section>
      </div>}
      {accountModal && <div className="modalBackdrop">
        <button className="modalDismiss" onClick={() => closeAccountModal()} aria-label="Close manage account" />
        <section className="modal accountModal" role="dialog" aria-modal="true" aria-labelledby="account-title">
          <button className="close" onClick={() => closeAccountModal()} aria-label="Close manage account">×</button>
          <div className="modalBody">
            <p className="eyebrow">MANAGE ACCOUNT</p>
            <h2 id="account-title">{accountModal.fullName}</h2>
            <p className="modalIntro">{accountModal.email} · Joined {new Date(accountModal.createdAt).toLocaleDateString()}</p>
            <h3 className="modalSectionTitle">Account type</h3>
            <fieldset className="accountType"><legend className="srOnly">Account type</legend>
              <button type="button" className={accountModal.role === "client" ? "selected" : ""} disabled={accountSaving} onClick={() => changeAccountRole("client")}><b>Client</b><span>Submit and track campaigns</span></button>
              <button type="button" className={accountModal.role === "admin" ? "selected" : ""} disabled={accountSaving} onClick={() => changeAccountRole("admin")}><b>Admin</b><span>Manage clients and operations</span></button>
            </fieldset>
            {accountError && <p className="formError" role="alert">{accountError}</p>}
            {accountModal.role === "client" && <>
              <div className="waalaxyDivider" />
              <h3 className="modalSectionTitle">LinkedIn access</h3>
              {adminLinkedinLoading ? <p className="modalIntro">Loading…</p> : !adminLinkedinStatus ? (
                <p className="modalIntro">This client hasn&apos;t submitted LinkedIn credentials yet.</p>
              ) : <>
                <p className="modalIntro">{adminLinkedinStatus.linkedin_email}: <strong>{adminLinkedinStatus.status.replaceAll("_", " ")}</strong></p>
                {adminLinkedinStatus.status === "code_submitted" && adminLinkedinStatus.has_code && !adminLinkedinCodeReveal && <div className="alertItem warning"><Icon name="alertTriangle" size={15} /><div><strong>Code from client</strong><span>Ready to reveal</span></div><button className="secondary" disabled={adminLinkedinActing} onClick={() => revealLinkedinCode(accountModal.id)}>Reveal code</button></div>}
                {adminLinkedinCodeReveal && <div className="alertItem warning"><Icon name="alertTriangle" size={15} /><div><strong>Code from client</strong><span>{adminLinkedinCodeReveal.code}</span></div></div>}
                {adminLinkedinStatus.failure_reason && <p className="formError" role="alert">Last failure: {adminLinkedinStatus.failure_reason}</p>}
                {adminLinkedinReveal && <div className="alertItem info"><Icon name="eye" size={15} /><div><strong>Password</strong><span>{adminLinkedinReveal.password}</span></div></div>}
                {adminLinkedinError && <p className="formError" role="alert">{adminLinkedinError}</p>}
                <div className="waalaxyActions">
                  <button className="secondary" disabled={adminLinkedinActing} onClick={() => revealLinkedinPassword(accountModal.id)}>Reveal password</button>
                  <button className="secondary" disabled={adminLinkedinActing} onClick={() => performLinkedinAction(accountModal.id, "request_code")}>Request code</button>
                </div>
                <div className="waalaxyActions" style={{ marginTop: 8 }}>
                  <button className="secondary" disabled={adminLinkedinActing} onClick={() => performLinkedinAction(accountModal.id, "request_approval")}>Request phone approval</button>
                  <button className="secondary" disabled={adminLinkedinActing} onClick={() => performLinkedinAction(accountModal.id, "mark_logged_in")}>Mark logged in</button>
                </div>
                {adminLinkedinStatus.status === "logged_in" && <button className="secondary" style={{ width: "100%", marginTop: 8 }} disabled={adminLinkedinActing} onClick={() => requestClientRelogin(accountModal.id)}>Ask client to log in again</button>}
                <label>Failure reason <span className="fieldHint">Optional</span><input value={adminLinkedinFailReason} onChange={(e) => setAdminLinkedinFailReason(e.target.value)} placeholder="e.g. Incorrect password" /></label>
                <button className="dangerButton" style={{ marginTop: 8 }} disabled={adminLinkedinActing} onClick={() => performLinkedinAction(accountModal.id, "mark_failed", adminLinkedinFailReason)}>Mark failed</button>
              </>}
              <div className="waalaxyDivider" />
              <h3 className="modalSectionTitle">Alerts</h3>
              <p className="modalIntro">Post an account-wide issue, for something affecting all of this client&apos;s outreach, not one campaign (e.g. a LinkedIn login problem).</p>
              <label>Message<textarea value={alertForm.message} onChange={(e) => setAlertForm({ ...alertForm, message: e.target.value })} placeholder="e.g. LinkedIn login failed, please log in again." rows={2} /></label>
              <fieldset className="severityChoice"><legend className="srOnly">Severity</legend>{["info", "warning", "error"].map((level) => <button type="button" key={level} className={alertForm.severity === level ? `selected ${level}` : level} onClick={() => setAlertForm({ ...alertForm, severity: level })}>{level}</button>)}</fieldset>
              {alertError && <p className="formError" role="alert">{alertError}</p>}
              <button className="secondary" style={{ width: "100%", marginTop: 14 }} disabled={alertPosting} onClick={() => postAlert(accountModal.id, null)}>{alertPosting ? "Posting…" : "Post alert"}</button>
              {accountAlerts.length > 0 && <div className="alertList">{accountAlerts.map((alert) => <div className={`alertItem ${alert.severity} ${alert.resolved ? "resolved" : ""}`} key={alert.id}><Icon name={alert.resolved ? "checkCircle" : "alertTriangle"} size={15} /><div><strong>Account-wide</strong><span>{alert.message}</span></div>{!alert.resolved && <button onClick={() => resolveAlert(alert.id)}>Resolve</button>}</div>)}</div>}
            </>}
            <div className="waalaxyDivider" />
            <h3 className="modalSectionTitle">Remove access</h3>
            <p className="modalIntro">Revokes this person&apos;s access to Outreach only. Their Myntmore login for other tools is unaffected.</p>
            <button className="dangerButton" disabled={accountSaving} onClick={removeAccountAccess}>{accountSaving ? "Removing…" : accountConfirmRemove ? "Click again to confirm" : "Remove access"}</button>
          </div>
        </section>
      </div>}
      {showHelp && <div className="modalBackdrop">
        <button className="modalDismiss" onClick={() => setShowHelp(false)} aria-label="Close help and support" />
        <section className="modal accountModal helpModal" role="dialog" aria-modal="true" aria-labelledby="help-title">
          <button className="close" onClick={() => setShowHelp(false)} aria-label="Close help and support">×</button>
          <div className="modalBody">
            <p className="eyebrow">HELP & SUPPORT</p>
            <h2 id="help-title">Frequently asked questions</h2>
            <div className="faqList">
              {(isAdmin ? ADMIN_FAQS : CLIENT_FAQS).map((faq) => (
                <details className="faqItem" key={faq.q}>
                  <summary>{faq.q}<Icon name="chevronDown" size={14} /></summary>
                  <p>{faq.a}</p>
                </details>
              ))}
            </div>
            <div className="faqContact"><span>Still stuck?</span><a href="mailto:hello@myntmore.com">Email hello@myntmore.com <Icon name="arrowUpRight" size={13} /></a></div>
          </div>
        </section>
      </div>}
      {showLeadCategorySettings && <div className="modalBackdrop">
        <button className="modalDismiss" onClick={() => setShowLeadCategorySettings(false)} aria-label="Close lead labels" />
        <section className="modal accountModal" role="dialog" aria-modal="true" aria-labelledby="lead-categories-title">
          <button className="close" onClick={() => setShowLeadCategorySettings(false)} aria-label="Close lead labels">×</button>
          <div className="modalBody">
            <p className="eyebrow">YOUR SETTINGS</p>
            <h2 id="lead-categories-title">Lead labels.</h2>
            <p className="modalIntro">Tag leads across every campaign as Hot, Cold, or however you want to track them. Rename, recolor, or remove a label any time -- leads using it just go back to unlabeled.</p>
            <div className="categoryList">
              {leadCategories.map((category) => (
                <div className="categoryRow" key={category.id}>
                  <div className="categorySwatches">
                    {LEAD_CATEGORY_COLORS.map((color) => (
                      <button type="button" key={color} className={`categorySwatch ${category.color === color ? "selected" : ""}`} style={{ background: color }} aria-label={`Set ${category.name} to this color`} onClick={() => { updateLeadCategoryField(category.id, "color", color); void commitLeadCategoryUpdate(category.id); }} />
                    ))}
                  </div>
                  <input value={category.name} onChange={(e) => updateLeadCategoryField(category.id, "name", e.target.value)} onBlur={() => commitLeadCategoryUpdate(category.id)} aria-label="Label name" />
                  <button type="button" className="categoryDelete" aria-label={`Delete ${category.name}`} disabled={categorySettingsSaving} onClick={() => deleteLeadCategory(category.id)}>×</button>
                </div>
              ))}
              {leadCategories.length === 0 && <p className="modalIntro">No labels yet -- add your first one below.</p>}
            </div>
            <div className="waalaxyDivider" />
            <h3 className="modalSectionTitle">Add a label</h3>
            <div className="categorySwatches" style={{ marginTop: 12 }}>
              {LEAD_CATEGORY_COLORS.map((color) => (
                <button type="button" key={color} className={`categorySwatch ${newCategoryColor === color ? "selected" : ""}`} style={{ background: color }} aria-label={`Choose color ${color}`} onClick={() => setNewCategoryColor(color)} />
              ))}
            </div>
            <div className="categoryAddRow">
              <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="e.g. Warm, Not now, VIP" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addLeadCategory(); } }} />
              <button type="button" className="secondary" disabled={categorySettingsSaving} onClick={addLeadCategory}>{categorySettingsSaving ? "Saving…" : "Add"}</button>
            </div>
            {categorySettingsError && <p className="formError" role="alert">{categorySettingsError}</p>}
          </div>
        </section>
      </div>}
    </main>
  );
}
