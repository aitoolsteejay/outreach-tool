"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type Campaign = { id: string; name: string; audience: string; status: string; progress: number; client?: string };

async function countCsvRows(file: File): Promise<number> {
  const text = await file.text();
  const lines = text.split(/\r\n|\n|\r/).map((line) => line.trim()).filter(Boolean);
  return Math.max(0, lines.length - 1);
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

type IconName = "grid" | "users" | "file" | "help" | "logout" | "arrowUpRight" | "chevronDown" | "trendUp" | "eye" | "percent" | "dots" | "send" | "plus";

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
    default: return null;
  }
}

export default function Home() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [clientCount, setClientCount] = useState(0);
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [uploadFailed, setUploadFailed] = useState(false);
  const [fileName, setFileName] = useState("");
  const [leadFile, setLeadFile] = useState<File | null>(null);
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState({ fullName: "", email: "", role: "client" });
  const [showUserSetup, setShowUserSetup] = useState(false);
  const [userForm, setUserForm] = useState({ fullName: "", email: "", password: "", role: "client" });
  const [userError, setUserError] = useState("");
  const [userCreated, setUserCreated] = useState("");
  const [userLoading, setUserLoading] = useState(false);
  const [form, setForm] = useState({ name: "", goal: "Book qualified discovery calls", offer: "", tone: "Warm, credible, and concise", message: "", connectionNote: "", followUpCount: 1, followUps: ["", "", ""] });
  const [waalaxyModal, setWaalaxyModal] = useState<{ id: string; name: string } | null>(null);
  const [waalaxyLoading, setWaalaxyLoading] = useState(false);
  const [waalaxyNotConfigured, setWaalaxyNotConfigured] = useState(false);
  const [waalaxyError, setWaalaxyError] = useState("");
  const [waalaxyCampaignsList, setWaalaxyCampaignsList] = useState<{ id: string; name: string }[]>([]);
  const [waalaxyListsList, setWaalaxyListsList] = useState<{ id: string; name: string }[]>([]);
  const [waalaxyLink, setWaalaxyLink] = useState({ waalaxyCampaignId: "", waalaxyListId: "" });
  const [waalaxySyncInfo, setWaalaxySyncInfo] = useState<{ status: string; error?: string | null; imported?: number; syncedAt?: string | null } | null>(null);
  const [waalaxySaving, setWaalaxySaving] = useState(false);
  const [waalaxyPushing, setWaalaxyPushing] = useState(false);

  function update(field: string, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  function addPlaceholder(field: "connectionNote" | "followUp", token: string, index = 0) {
    setForm((current) => field === "connectionNote" ? { ...current, connectionNote: `${current.connectionNote}${current.connectionNote ? " " : ""}${token}` } : { ...current, followUps: current.followUps.map((message, messageIndex) => messageIndex === index ? `${message}${message ? " " : ""}${token}` : message) });
  }
  function updateFollowUp(index: number, value: string) { setForm((current) => ({ ...current, followUps: current.followUps.map((message, messageIndex) => messageIndex === index ? value : message) })); }
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.replace("/login"); return; }
      setUserId(data.user.id);
      const { data: profileRow } = await supabase.schema("outreach").from("profiles").select("full_name,email,role").eq("id", data.user.id).single();
      if (!profileRow) { await supabase.auth.signOut(); window.location.replace("/login"); return; }
      setProfile({ fullName: profileRow.full_name, email: profileRow.email, role: profileRow.role });
      const { data: rows } = await supabase.schema("outreach").from("campaigns").select("id,name,lead_count,status,progress,client_id").order("created_at", { ascending: false });
      const clients = profileRow.role === "admin" ? await supabase.schema("outreach").from("profiles").select("id,full_name,email").eq("role", "client") : { data: [] };
      setClientCount((clients.data || []).length);
      const clientNames = new Map((clients.data || []).map((client) => [client.id, client.full_name || client.email]));
      setCampaigns((rows || []).map((row) => ({ id: row.id, name: row.name, audience: `${row.lead_count} leads`, status: row.status.replaceAll("_", " ").replace(/^./, (letter: string) => letter.toUpperCase()), progress: row.progress, client: clientNames.get(row.client_id) })));
      setWorkspaceLoading(false);
    });
  }, []);
  function openWizard() { setStep(1); setSubmitted(false); setSubmitError(""); setUploadFailed(false); setShowWizard(true); }
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
    setUploadFailed(false);
    const supabase = createClient();
    const leadCount = leadFile ? await countCsvRows(leadFile) : 0;
    const { data: campaign, error } = await supabase.schema("outreach").from("campaigns").insert({ client_id: userId, name: form.name || "Untitled campaign", goal: form.goal, offer: form.offer, tone: form.tone, messaging_strategy: form.message, connection_note: form.connectionNote, follow_up_count: form.followUpCount, follow_up_messages: form.followUps.slice(0, form.followUpCount), lead_count: leadCount, status: "submitted", progress: 15, submitted_at: new Date().toISOString() }).select("id").single();
    if (error || !campaign) {
      setSubmitError(error?.message || "Unable to submit your campaign. Please try again.");
      setSubmitting(false);
      return;
    }
    let fileUploaded = true;
    if (leadFile) {
      const storagePath = `${userId}/${campaign.id}/${leadFile.name}`;
      const { error: uploadError } = await supabase.storage.from("outreach-leads").upload(storagePath, leadFile);
      if (uploadError) {
        fileUploaded = false;
      } else {
        const { error: fileRowError } = await supabase.schema("outreach").from("lead_files").insert({ campaign_id: campaign.id, client_id: userId, storage_path: storagePath, original_name: leadFile.name, content_type: leadFile.type || "text/csv", size_bytes: leadFile.size });
        if (fileRowError) fileUploaded = false;
      }
    }
    setUploadFailed(leadFile !== null && !fileUploaded);
    setCampaigns((current) => [{ id: campaign.id, name: form.name || "Untitled campaign", audience: `${leadCount} leads`, status: "Submitted", progress: 15 }, ...current]);
    setSubmitting(false);
    setSubmitted(true);
  }
  async function signOut() { await createClient().auth.signOut(); window.location.assign("/login"); }
  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setUserLoading(true); setUserError(""); setUserCreated("");
    const { data: sessionData } = await createClient().auth.getSession();
    const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token || ""}` }, body: JSON.stringify(userForm) });
    const result = await response.json();
    if (!response.ok) { setUserError(result.error || "Unable to create the user."); setUserLoading(false); return; }
    const accountLabel = result.role === "admin" ? "admin" : "client";
    setUserCreated(result.existing ? `${result.email} already had a Myntmore login and now has ${accountLabel} access to Outreach. Their existing password is unchanged.` : `${result.email} now has ${accountLabel} access and can sign in with the temporary password.`); setUserForm({ fullName: "", email: "", password: "", role: "client" }); setUserLoading(false);
  }
  async function authHeader() {
    const { data } = await createClient().auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token || ""}` };
  }
  async function openWaalaxyModal(campaign: Campaign) {
    setWaalaxyModal({ id: campaign.id, name: campaign.name });
    setWaalaxyError("");
    setWaalaxyNotConfigured(false);
    setWaalaxySyncInfo(null);
    setWaalaxyLoading(true);
    const headers = await authHeader();
    const [linkRes, campaignsRes, listsRes] = await Promise.all([
      fetch(`/api/admin/campaigns/${campaign.id}/waalaxy`, { headers }),
      fetch("/api/admin/waalaxy/campaigns", { headers }),
      fetch("/api/admin/waalaxy/lists", { headers }),
    ]);
    const [linkData, campaignsData, listsData] = await Promise.all([linkRes.json(), campaignsRes.json(), listsRes.json()]);
    if (linkRes.ok) {
      setWaalaxyLink({ waalaxyCampaignId: linkData.waalaxy_campaign_id || "", waalaxyListId: linkData.waalaxy_list_id || "" });
      setWaalaxySyncInfo({ status: linkData.waalaxy_sync_status, error: linkData.waalaxy_sync_error, imported: linkData.waalaxy_prospects_imported, syncedAt: linkData.waalaxy_synced_at });
    }
    if (campaignsRes.status === 501 || listsRes.status === 501) {
      setWaalaxyNotConfigured(true);
    } else if (!campaignsRes.ok) {
      setWaalaxyError(campaignsData.error || "Unable to load Waalaxy campaigns.");
    } else if (!listsRes.ok) {
      setWaalaxyError(listsData.error || "Unable to load Waalaxy prospect lists.");
    } else {
      setWaalaxyCampaignsList(campaignsData.campaigns || []);
      setWaalaxyListsList(listsData.lists || []);
    }
    setWaalaxyLoading(false);
  }
  async function saveWaalaxyLink() {
    if (!waalaxyModal) return;
    setWaalaxySaving(true);
    setWaalaxyError("");
    const headers = await authHeader();
    const response = await fetch(`/api/admin/campaigns/${waalaxyModal.id}/waalaxy`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(waalaxyLink) });
    const result = await response.json();
    if (!response.ok) { setWaalaxyError(result.error || "Unable to link this campaign."); setWaalaxySaving(false); return; }
    setWaalaxySyncInfo({ status: result.waalaxy_sync_status, error: result.waalaxy_sync_error, imported: result.waalaxy_prospects_imported, syncedAt: result.waalaxy_synced_at });
    setWaalaxySaving(false);
  }
  async function pushLeadsToWaalaxy() {
    if (!waalaxyModal) return;
    setWaalaxyPushing(true);
    setWaalaxyError("");
    const headers = await authHeader();
    const response = await fetch(`/api/admin/campaigns/${waalaxyModal.id}/push-to-waalaxy`, { method: "POST", headers });
    const result = await response.json();
    if (!response.ok) { setWaalaxyError(result.error || "Unable to push leads to Waalaxy."); setWaalaxyPushing(false); return; }
    setWaalaxySyncInfo({ status: "synced", imported: result.imported, syncedAt: new Date().toISOString() });
    setWaalaxyPushing(false);
  }
  const isAdmin = profile.role === "admin";
  const activeCampaigns = campaigns.filter((campaign) => ["Live", "In setup", "Submitted", "In review"].includes(campaign.status)).length;
  const totalLeads = campaigns.reduce((sum, campaign) => sum + (Number.parseInt(campaign.audience) || 0), 0);
  const avgProgress = campaigns.length ? Math.round(campaigns.reduce((sum, campaign) => sum + campaign.progress, 0) / campaigns.length) : 0;
  const activeRate = campaigns.length ? Math.round((activeCampaigns / campaigns.length) * 100) : 0;
  const liveCount = campaigns.filter((campaign) => campaign.status === "Live").length;
  const inReviewCount = campaigns.filter((campaign) => ["Submitted", "In review"].includes(campaign.status)).length;
  return (
    <main className={`shell ${isAdmin ? "adminShell" : ""}`}>
      <aside className="sidebar">
        <div className="brand brandAsset"><Image src="/myntmore-logo.png" alt="Myntmore" width={2058} height={1336} priority /></div>
        <nav aria-label="Main navigation">{isAdmin ? <><a className="navItem active" href="#campaigns"><span><Icon name="grid" /></span> Campaign operations</a><button className="navItem navButton" onClick={() => setShowUserSetup(true)}><span><Icon name="plus" /></span> User accounts</button></> : <><a className="navItem active" href="#campaigns"><span><Icon name="grid" /></span> Campaigns</a><a className="navItem" href="#leads"><span><Icon name="users" /></span> Lead lists</a><a className="navItem" href="#templates"><span><Icon name="file" /></span> Templates</a></>}</nav>
        <div className="sidebarInsight">
          <div className="sidebarInsightHead"><span><Icon name={isAdmin ? "eye" : "trendUp"} size={15} /></span><div><strong>{isAdmin ? "Needs attention" : "This month"}</strong><small>Workspace pulse</small></div></div>
          <div className="sidebarInsightStats">
            {isAdmin ? <>
              <div><b>{workspaceLoading ? "—" : inReviewCount}</b><span>In review</span></div>
              <div><b>{workspaceLoading ? "—" : clientCount}</b><span>Clients</span></div>
            </> : <>
              <div><b>{workspaceLoading ? "—" : activeCampaigns}</b><span>Active</span></div>
              <div><b>{workspaceLoading ? "—" : totalLeads}</b><span>Leads reached</span></div>
            </>}
          </div>
          <button className="sidebarInsightCta" onClick={isAdmin ? () => setShowUserSetup(true) : openWizard}>{isAdmin ? "Add client" : "New campaign"} <Icon name="arrowUpRight" size={13} /></button>
        </div>
        <div className="sidebarBottom">
          <a className="navItem" href="#help"><span><Icon name="help" /></span> Help & support</a>
          <button className="navItem navButton" onClick={signOut}><span><Icon name="logout" /></span> Sign out</button>
          <div className="profile"><div className="avatar">{(profile.fullName || profile.email || "U").slice(0,2).toUpperCase()}</div><div><strong>{profile.fullName || profile.email || "Workspace user"}</strong><small>{profile.role === "admin" ? "Admin workspace" : "Client workspace"}</small></div><button aria-label="Profile menu"><Icon name="dots" /></button></div>
        </div>
      </aside>

      <section className="content" id="campaigns">
        <header className="topbar"><div><p className="eyebrow">{isAdmin ? "ADMIN WORKSPACE" : "OUTREACH WORKSPACE"}</p><h1>{isAdmin ? "Operations" : "Campaigns"}</h1></div><button className="primary" onClick={isAdmin ? () => setShowUserSetup(true) : openWizard}>{isAdmin ? "＋ Create client account" : "＋ New campaign"}</button></header>
        {isAdmin ? <div className="adminDashboard">
          <section className="adminSummary"><div><p className="eyebrow">TODAY’S OVERVIEW</p><h2>Keep every client<br/>moving forward.</h2><p>Review what needs attention, manage access, and keep campaign delivery on track.</p></div><div className="adminMetrics"><div><span>Needs review</span><strong>{campaigns.filter((campaign) => ["Submitted", "In review"].includes(campaign.status)).length}</strong></div><div><span>Active</span><strong>{activeCampaigns}</strong></div><div><span>Total leads</span><strong>{totalLeads}</strong></div><div><span>Clients</span><strong>{clientCount}</strong></div></div></section>
          <div className="adminGrid"><section className="campaignSection adminQueue"><div className="sectionHeading"><div><p className="eyebrow">CAMPAIGN DELIVERY</p><h3>Work queue</h3><p>Submissions requiring action appear first.</p></div><button className="filter">All statuses <Icon name="chevronDown" size={13} /></button></div><div className="campaignList">{campaigns.map((campaign) => <article className="campaign" key={campaign.id}><div className="campaignIcon"><Icon name="arrowUpRight" size={15} /></div><div className="campaignInfo"><strong>{campaign.name}</strong><span>{campaign.client ? `${campaign.client} · ` : ""}{campaign.audience}</span></div><div className="progress"><div><span>Progress</span><b>{campaign.progress}%</b></div><div className="track"><i style={{width:`${campaign.progress}%`}}/></div></div><span className={`status ${campaign.status.replaceAll(" ", "-").toLowerCase()}`}>{campaign.status}</span><button className="more" aria-label={`Waalaxy sync for ${campaign.name}`} onClick={() => openWaalaxyModal(campaign)}><Icon name="dots" /></button></article>)}{!workspaceLoading && campaigns.length === 0 && <div className="adminEmpty"><span>✓</span><strong>Nothing needs attention.</strong><p>Client submissions will appear here as soon as they arrive.</p></div>}</div></section>
          <aside className="adminPanel"><div className="adminPanelHead"><span>CLIENT ACCESS</span><strong>{clientCount}</strong></div><h3>Manage your clients</h3><p>Create portal access for a new client or connect an existing Myntmore login.</p><button className="primary" onClick={() => setShowUserSetup(true)}>＋ Add client account</button><div className="adminChecklist"><p>HOW IT WORKS</p><div><b>1</b><span>Create the client login</span></div><div><b>2</b><span>Client submits their brief</span></div><div><b>3</b><span>Campaign enters your queue</span></div></div></aside></div>
        </div> : <div className="clientDashboard">
          <section className="clientHero"><div className="clientHeroText"><p className="eyebrow">YOUR OUTREACH</p><h2>Hello {(profile.fullName || profile.email || "there").split(" ")[0]}.</h2><p>Brief the Myntmore team once, then follow every campaign from setup to conversations.</p></div><div className="clientHeroFilters"><button className="filter">All time <Icon name="chevronDown" size={13} /></button><button className="filter">All campaigns <Icon name="chevronDown" size={13} /></button></div></section>
          <div className="ringCards">
            <div className="ringCard ringCardGold"><div className="ringCardHead"><span><Icon name="grid" size={14} /></span> Campaigns</div><div className="ringCardBody"><div className="ringCardCount"><strong>{workspaceLoading ? "—" : campaigns.length}</strong><span>Total campaigns</span></div><div className="ringSide"><div className="ringWrap"><Ring percent={activeRate} track="#ffffff35" indicator="#ffffff" /><div className="ringCenter"><b>{activeRate}%</b></div></div><span className="ringCaption">Active rate</span></div></div></div>
            <div className="ringCard ringCardInk"><div className="ringCardHead"><span><Icon name="users" size={14} /></span> Leads</div><div className="ringCardBody"><div className="ringCardCount"><strong>{workspaceLoading ? "—" : totalLeads}</strong><span>Total leads reached</span></div><div className="ringSide"><div className="ringWrap"><Ring percent={avgProgress} track="#ffffff35" indicator="#ffffff" /><div className="ringCenter"><b>{avgProgress}%</b></div></div><span className="ringCaption">Avg. progress</span></div></div></div>
          </div>
          <div className="actionTiles">
            <div className="tileInk"><span><Icon name="send" size={15} /></span><strong>{workspaceLoading ? "—" : campaigns.length}</strong><small>Submitted</small></div>
            <div className="tileGreen"><span><Icon name="trendUp" size={15} /></span><strong>{workspaceLoading ? "—" : liveCount}</strong><small>Live</small></div>
            <div className="tilePurple"><span><Icon name="eye" size={15} /></span><strong>{workspaceLoading ? "—" : inReviewCount}</strong><small>In review</small></div>
            <div className="tileGold"><span><Icon name="users" size={15} /></span><strong>{workspaceLoading ? "—" : totalLeads}</strong><small>Leads reached</small></div>
            <div className="tileAmber"><span><Icon name="percent" size={15} /></span><strong>{workspaceLoading ? "—" : `${avgProgress}%`}</strong><small>Avg. progress</small></div>
          </div>
          <div className="clientGrid">
            <section className="campaignSection clientCampaigns"><div className="sectionHeading"><div><p className="eyebrow">CAMPAIGN TRACKER</p><h3>Your campaigns</h3><p>Every brief, status update, and result in one place.</p></div><button className="filter">All statuses <Icon name="chevronDown" size={13} /></button></div><div className="campaignList">{campaigns.map((campaign) => <article className="campaign" key={campaign.id}><div className="campaignIcon"><Icon name="arrowUpRight" size={15} /></div><div className="campaignInfo"><strong>{campaign.name}</strong><span>{campaign.audience} · LinkedIn outreach</span></div><div className="progress"><div><span>Progress</span><b>{campaign.progress}%</b></div><div className="track"><i style={{width:`${campaign.progress}%`}}/></div></div><span className={`status ${campaign.status.replaceAll(" ", "-").toLowerCase()}`}>{campaign.status}</span><button className="more" aria-label={`More options for ${campaign.name}`}><Icon name="dots" /></button></article>)}{!workspaceLoading && campaigns.length === 0 && <div className="clientEmpty"><span>01</span><strong>Your first campaign starts here.</strong><p>Share your lead list and messaging direction. We’ll take it from there.</p><button className="primary" onClick={openWizard}>Start a campaign</button></div>}</div></section>
            <aside className="clientSidebar">
              <div className="sidebarProfileCard"><div className="sidebarProfileTop"><div className="avatar">{(profile.fullName || profile.email || "U").slice(0,2).toUpperCase()}</div><span className="roleChip">Client</span></div><strong>{profile.fullName || profile.email || "Workspace user"}</strong><span>{profile.email || "Client workspace"}</span><div className="sidebarProfileStats"><div><b>{workspaceLoading ? "—" : activeCampaigns}</b><small>Active</small></div><div><b>{workspaceLoading ? "—" : totalLeads}</b><small>Leads</small></div><div><b>{workspaceLoading ? "—" : campaigns.length}</b><small>Total</small></div></div></div>
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
              <label>Campaign name<input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. India SaaS founders — September"/></label>
              <label>Primary goal<select value={form.goal} onChange={(e) => update("goal", e.target.value)}><option>Book qualified discovery calls</option><option>Build strategic partnerships</option><option>Recruit candidates</option><option>Start investor conversations</option></select></label>
              <label>Your offer or value proposition<textarea value={form.offer} onChange={(e) => update("offer", e.target.value)} placeholder="What makes this conversation valuable for the recipient?" rows={3}/></label>
            </div>}
            {step === 2 && <div className="modalBody"><p className="eyebrow">STEP 2 OF 3 · LEAD LIST</p><h2 id="wizard-title">Add the right people.</h2><p className="modalIntro">Use our template so your campaign can move into setup without delays.</p>
              <div className="templateCard"><div><strong>Myntmore lead template</strong><small>Includes the exact columns our team needs.</small></div><button onClick={downloadTemplate}>↓ Download CSV</button></div>
              <label className={`dropzone ${fileName ? "hasFile" : ""}`}><input type="file" accept=".csv,text/csv" onChange={(e) => { const file = e.target.files?.[0] || null; setLeadFile(file); setFileName(file?.name || ""); }}/><span>{fileName ? "✓" : "↑"}</span><strong>{fileName || "Drop your completed CSV here"}</strong><small>{fileName ? "Ready for review" : "or click to choose a file · CSV up to 10 MB"}</small></label>
            </div>}
            {step === 3 && <div className="modalBody sequenceBuilder"><p className="eyebrow">STEP 3 OF 3 · SEQUENCE</p><h2 id="wizard-title">Build the conversation.</h2><p className="modalIntro">Add the exact connection note and follow-ups you want us to configure in Waalaxy.</p>
              <label>Voice and tone<input value={form.tone} onChange={(e) => update("tone", e.target.value)}/></label>
              <label>Connection request note <span className="fieldHint">{form.connectionNote.length}/300</span><textarea value={form.connectionNote} maxLength={300} onChange={(e) => update("connectionNote", e.target.value)} placeholder="Hi {{first_name}}, I came across your work at {{company}} and would love to connect." rows={3}/></label>
              <div className="placeholderRow"><span>Insert placeholder</span>{[["First name","{{first_name}}"],["Last name","{{last_name}}"],["Company","{{company}}"]].map(([label,token]) => <button type="button" key={token} onClick={() => addPlaceholder("connectionNote",token)}>{label}</button>)}</div>
              <fieldset className="followUpChoice"><legend>Number of follow-ups</legend>{[1,2,3].map((count) => <button type="button" className={form.followUpCount === count ? "selected" : ""} key={count} onClick={() => setForm({...form,followUpCount:count})}>{count}</button>)}</fieldset>
              {form.followUps.slice(0,form.followUpCount).map((followUp,index) => <div className="followUpField" key={index}><label>Follow-up {index + 1}<textarea value={followUp} onChange={(event) => updateFollowUp(index,event.target.value)} placeholder={index === 0 ? "Thanks for connecting, {{first_name}}. I wanted to share…" : "A short, useful follow-up with a clear next step."} rows={3}/></label><div className="placeholderRow"><span>Personalize</span>{[["First name","{{first_name}}"],["Last name","{{last_name}}"],["Company","{{company}}"]].map(([label,token]) => <button type="button" key={token} onClick={() => addPlaceholder("followUp",token,index)}>{label}</button>)}</div></div>)}
              <label>Supporting context <span className="fieldHint">Optional</span><textarea value={form.message} onChange={(e) => update("message", e.target.value)} placeholder="Proof points, phrases to avoid, preferred CTA, or other constraints." rows={3}/></label>
              <div className="reviewStrip"><span>Campaign</span><strong>{form.name || "Untitled campaign"}</strong><span>Sequence</span><strong>Connection note + {form.followUpCount} follow-up{form.followUpCount > 1 ? "s" : ""}</strong></div>
              {step === 3 && submitError && <p className="formError" role="alert">{submitError}</p>}
            </div>}
            <footer className="modalFooter"><button className="secondary" onClick={() => step === 1 ? setShowWizard(false) : setStep(step - 1)} disabled={submitting}>{step === 1 ? "Cancel" : "Back"}</button><button className="primary" disabled={submitting || (step === 1 && !form.name.trim()) || (step === 3 && (!form.connectionNote.trim() || form.followUps.slice(0,form.followUpCount).some((message) => !message.trim())))} onClick={() => step < 3 ? setStep(step + 1) : submitCampaign()}>{step < 3 ? "Continue →" : submitting ? "Submitting…" : "Submit campaign →"}</button></footer>
          </> : <div className="success"><div className="successIcon">✓</div><p className="eyebrow">CAMPAIGN RECEIVED</p><h2 id="wizard-title">It’s with the Myntmore team.</h2><p>We’ll review your leads and messaging, configure the sequence in Waalaxy, and update the status here. You’ll see progress within one business day.</p>{uploadFailed && <p className="formError" role="alert">Your brief was submitted, but your lead list CSV didn’t upload. Please re-attach it from a new campaign, or send it to your Myntmore contact directly.</p>}<button className="primary" onClick={() => setShowWizard(false)}>Back to campaigns</button></div>}
        </section>
      </div>}
      {showUserSetup && profile.role === "admin" && <div className="modalBackdrop"><button className="modalDismiss" onClick={() => setShowUserSetup(false)} aria-label="Close user setup"/><section className="modal accountModal" role="dialog" aria-modal="true" aria-labelledby="user-setup-title"><button className="close" onClick={() => setShowUserSetup(false)} aria-label="Close user setup">×</button><div className="modalBody"><p className="eyebrow">ADMIN · USER ACCOUNTS</p><h2 id="user-setup-title">Create a user account.</h2><p className="modalIntro">Choose the access level, then share the credentials securely with the user.</p><form className="loginForm" onSubmit={createUser}><fieldset className="accountType"><legend>Account type</legend><button type="button" className={userForm.role === "client" ? "selected" : ""} onClick={() => setUserForm({...userForm,role:"client"})}><b>Client</b><span>Submit and track campaigns</span></button><button type="button" className={userForm.role === "admin" ? "selected" : ""} onClick={() => setUserForm({...userForm,role:"admin"})}><b>Admin</b><span>Manage clients and operations</span></button></fieldset><label>Full name<input value={userForm.fullName} onChange={(event) => setUserForm({...userForm, fullName:event.target.value})} placeholder="Full name or company" required/></label><label>Email address<input type="email" value={userForm.email} onChange={(event) => setUserForm({...userForm, email:event.target.value})} placeholder={userForm.role === "admin" ? "admin@myntmore.com" : "client@company.com"} required/></label><label>Temporary password<input type="password" minLength={8} value={userForm.password} onChange={(event) => setUserForm({...userForm, password:event.target.value})} placeholder="At least 8 characters" required/></label>{userError && <p className="formError" role="alert">{userError}</p>}{userCreated && <p className="formSuccess" role="status">{userCreated}</p>}<button className="loginButton" disabled={userLoading}>{userLoading ? "Creating user…" : `Create ${userForm.role} account`}<span>→</span></button></form></div></section></div>}
      {waalaxyModal && <div className="modalBackdrop">
        <button className="modalDismiss" onClick={() => setWaalaxyModal(null)} aria-label="Close Waalaxy sync" />
        <section className="modal accountModal" role="dialog" aria-modal="true" aria-labelledby="waalaxy-title">
          <button className="close" onClick={() => setWaalaxyModal(null)} aria-label="Close Waalaxy sync">×</button>
          <div className="modalBody">
            <p className="eyebrow">WAALAXY SYNC</p>
            <h2 id="waalaxy-title">{waalaxyModal.name}</h2>
            <p className="modalIntro">Link this campaign to the Waalaxy campaign your team already created for it, then push the client&apos;s uploaded leads straight in — no manual CSV upload into Waalaxy.</p>
            {waalaxyLoading ? <p className="modalIntro">Loading…</p> : waalaxyNotConfigured ? (
              <p className="formError" role="alert">Waalaxy integration isn&apos;t configured yet — set WAALAXY_API_KEY on the server, then reopen this.</p>
            ) : <>
              <label>Waalaxy campaign<select value={waalaxyLink.waalaxyCampaignId} onChange={(e) => setWaalaxyLink({ ...waalaxyLink, waalaxyCampaignId: e.target.value })}><option value="">Select a campaign…</option>{waalaxyCampaignsList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label>Waalaxy prospect list<select value={waalaxyLink.waalaxyListId} onChange={(e) => setWaalaxyLink({ ...waalaxyLink, waalaxyListId: e.target.value })}><option value="">Select a list…</option>{waalaxyListsList.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
              {waalaxyError && <p className="formError" role="alert">{waalaxyError}</p>}
              {waalaxySyncInfo?.status === "synced" && <p className="formSuccess" role="status">Synced {waalaxySyncInfo.imported ?? 0} lead{waalaxySyncInfo.imported === 1 ? "" : "s"} to Waalaxy{waalaxySyncInfo.syncedAt ? ` on ${new Date(waalaxySyncInfo.syncedAt).toLocaleString()}` : ""}.</p>}
              {waalaxySyncInfo?.status === "failed" && waalaxySyncInfo.error && <p className="formError" role="alert">Last sync attempt failed: {waalaxySyncInfo.error}</p>}
              <div className="waalaxyActions">
                <button className="secondary" onClick={saveWaalaxyLink} disabled={waalaxySaving || !waalaxyLink.waalaxyCampaignId || !waalaxyLink.waalaxyListId}>{waalaxySaving ? "Saving…" : "Save link"}</button>
                <button className="primary" onClick={pushLeadsToWaalaxy} disabled={waalaxyPushing || !waalaxyLink.waalaxyCampaignId || !waalaxyLink.waalaxyListId}>{waalaxyPushing ? "Pushing leads…" : "Push leads to Waalaxy"}</button>
              </div>
            </>}
          </div>
        </section>
      </div>}
    </main>
  );
}
