"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type Campaign = { name: string; audience: string; status: string; progress: number; client?: string };

export default function Home() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [fileName, setFileName] = useState("");
  const [leadFile, setLeadFile] = useState<File | null>(null);
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState({ fullName: "", email: "", role: "client" });
  const [showUserSetup, setShowUserSetup] = useState(false);
  const [userForm, setUserForm] = useState({ fullName: "", email: "", password: "" });
  const [userError, setUserError] = useState("");
  const [userCreated, setUserCreated] = useState("");
  const [userLoading, setUserLoading] = useState(false);
  const [form, setForm] = useState({ name: "", goal: "Book qualified discovery calls", offer: "", tone: "Warm, credible, and concise", message: "" });

  function update(field: string, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.replace("/login"); return; }
      setUserId(data.user.id);
      const { data: profileRow } = await supabase.schema("outreach").from("profiles").select("full_name,email,role").eq("id", data.user.id).single();
      if (!profileRow) { await supabase.auth.signOut(); window.location.replace("/login"); return; }
      setProfile({ fullName: profileRow.full_name, email: profileRow.email, role: profileRow.role });
      const { data: rows } = await supabase.schema("outreach").from("campaigns").select("name,lead_count,status,progress,client_id").order("created_at", { ascending: false });
      const clients = profileRow.role === "admin" ? await supabase.schema("outreach").from("profiles").select("id,full_name,email").eq("role", "client") : { data: [] };
      const clientNames = new Map((clients.data || []).map((client) => [client.id, client.full_name || client.email]));
      setCampaigns((rows || []).map((row) => ({ name: row.name, audience: `${row.lead_count} leads`, status: row.status.replaceAll("_", " ").replace(/^./, (letter: string) => letter.toUpperCase()), progress: row.progress, client: clientNames.get(row.client_id) })));
      setWorkspaceLoading(false);
    });
  }, []);
  function openWizard() { setStep(1); setSubmitted(false); setShowWizard(true); }
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
    const supabase = createClient();
    const { data: campaign, error } = await supabase.schema("outreach").from("campaigns").insert({ client_id: userId, name: form.name || "Untitled campaign", goal: form.goal, offer: form.offer, tone: form.tone, messaging_strategy: form.message, status: "submitted", progress: 15, submitted_at: new Date().toISOString() }).select("id").single();
    if (error || !campaign) return;
    if (leadFile) {
      const storagePath = `${userId}/${campaign.id}/${leadFile.name}`;
      const { error: uploadError } = await supabase.storage.from("outreach-leads").upload(storagePath, leadFile);
      if (!uploadError) await supabase.schema("outreach").from("lead_files").insert({ campaign_id: campaign.id, client_id: userId, storage_path: storagePath, original_name: leadFile.name, content_type: leadFile.type || "text/csv", size_bytes: leadFile.size });
    }
    setCampaigns((current) => [{ name: form.name || "Untitled campaign", audience: fileName ? "CSV uploaded" : "Leads pending", status: "Submitted", progress: 15 }, ...current]);
    setSubmitted(true);
  }
  async function signOut() { await createClient().auth.signOut(); window.location.assign("/login"); }
  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setUserLoading(true); setUserError(""); setUserCreated("");
    const { data: sessionData } = await createClient().auth.getSession();
    const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token || ""}` }, body: JSON.stringify(userForm) });
    const result = await response.json();
    if (!response.ok) { setUserError(result.error || "Unable to create the user."); setUserLoading(false); return; }
    setUserCreated(result.existing ? `${result.email} already had a Myntmore login and now has access to Outreach. Their existing password is unchanged.` : `${result.email} can now sign in with the temporary password.`); setUserForm({ fullName: "", email: "", password: "" }); setUserLoading(false);
  }
  const isAdmin = profile.role === "admin";
  const activeCampaigns = campaigns.filter((campaign) => ["Live", "In setup", "Submitted", "In review"].includes(campaign.status)).length;
  const totalLeads = campaigns.reduce((sum, campaign) => sum + (Number.parseInt(campaign.audience) || 0), 0);
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand brandAsset"><Image src="/myntmore-logo.png" alt="Myntmore" width={2058} height={1336} priority /></div>
        <nav aria-label="Main navigation">{isAdmin ? <><a className="navItem active" href="#campaigns"><span>◫</span> Campaign operations</a><button className="navItem navButton" onClick={() => setShowUserSetup(true)}><span>＋</span> User accounts</button></> : <><a className="navItem active" href="#campaigns"><span>◫</span> Campaigns</a><a className="navItem" href="#leads"><span>♙</span> Lead lists</a><a className="navItem" href="#templates"><span>◇</span> Templates</a></>}</nav>
        <div className="sidebarBottom">
          <a className="navItem" href="#help"><span>?</span> Help & support</a>
          <button className="navItem navButton" onClick={signOut}><span>↪</span> Sign out</button>
          <div className="profile"><div className="avatar">{(profile.fullName || profile.email || "U").slice(0,2).toUpperCase()}</div><div><strong>{profile.fullName || profile.email || "Workspace user"}</strong><small>{profile.role === "admin" ? "Admin workspace" : "Client workspace"}</small></div><button aria-label="Profile menu">•••</button></div>
        </div>
      </aside>

      <section className="content" id="campaigns">
        <header className="topbar"><div><p className="eyebrow">{isAdmin ? "ADMIN WORKSPACE" : "OUTREACH WORKSPACE"}</p><h1>{isAdmin ? "Operations" : "Campaigns"}</h1></div><button className="primary" onClick={isAdmin ? () => setShowUserSetup(true) : openWizard}>{isAdmin ? "＋ Create client account" : "＋ New campaign"}</button></header>
        <section className={`welcome ${isAdmin ? "adminWelcome" : ""}`}><div><p className="eyebrow dark">{isAdmin ? "MYNTMORE TEAM" : "OUTREACH, MANAGED"}</p><h2>{isAdmin ? <>Client campaigns,<br/>in one clear queue.</> : <>Turn lead lists into<br/>real conversations.</>}</h2><p>{isAdmin ? "Review new submissions, coordinate campaign setup, and manage who can access the portal." : "Share the right people and your point of view. We’ll handle campaign setup, execution, and reporting."}</p>{!isAdmin && <button className="lightButton" onClick={openWizard}>Start a campaign <span>→</span></button>}</div></section>
        <section className="stats" aria-label="Campaign summary">
          <div className="statYellow"><span>Active campaigns</span><strong>{workspaceLoading ? "—" : activeCampaigns}</strong><small>{isAdmin ? "Across all clients" : "In your workspace"}</small></div>
          <div className="statPurple"><span>Total leads</span><strong>{workspaceLoading ? "—" : totalLeads}</strong><small>Across submitted campaigns</small></div>
          <div className="statGreen"><span>{isAdmin ? "Client accounts" : "Campaigns submitted"}</span><strong>{workspaceLoading ? "—" : isAdmin ? new Set(campaigns.map((campaign) => campaign.client).filter(Boolean)).size : campaigns.length}</strong><small>{isAdmin ? "With campaign activity" : "All time"}</small></div>
        </section>
        <section className="campaignSection">
          <div className="sectionHeading"><div><h3>{isAdmin ? "Campaign queue" : "Your campaigns"}</h3><p>{isAdmin ? "Real submissions from Outreach clients." : "Track every campaign from brief to replies."}</p></div><button className="filter">All campaigns⌄</button></div>
          <div className="campaignList">
            {campaigns.map((campaign) => <article className="campaign" key={campaign.name}>
              <div className="campaignIcon">↗</div><div className="campaignInfo"><strong>{campaign.name}</strong><span>{campaign.client ? `${campaign.client} · ` : ""}{campaign.audience} · LinkedIn outreach</span></div>
              <div className="progress"><div><span>Campaign progress</span><b>{campaign.progress}%</b></div><div className="track"><i style={{width: `${campaign.progress}%`}}/></div></div>
              <span className={`status ${campaign.status.replaceAll(" ", "-").toLowerCase()}`}>{campaign.status}</span><button className="more" aria-label={`More options for ${campaign.name}`}>•••</button>
            </article>)}
            {!workspaceLoading && campaigns.length === 0 && <div className="emptyCampaigns"><strong>{isAdmin ? "No client submissions yet." : "No campaigns yet."}</strong><p>{isAdmin ? "New campaigns will appear here as clients submit their briefs." : "Create your first campaign when your lead list and messaging direction are ready."}</p>{!isAdmin && <button className="primary" onClick={openWizard}>Create campaign</button>}</div>}
          </div>
        </section>
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
            {step === 3 && <div className="modalBody"><p className="eyebrow">STEP 3 OF 3 · MESSAGING</p><h2 id="wizard-title">Set the conversation strategy.</h2><p className="modalIntro">We’ll use this direction to write and configure your Waalaxy sequence.</p>
              <label>Voice and tone<input value={form.tone} onChange={(e) => update("tone", e.target.value)}/></label>
              <label>Key message, proof points, or constraints<textarea value={form.message} onChange={(e) => update("message", e.target.value)} placeholder="Mention relevant proof, phrases to avoid, preferred CTA, and anything else we should know." rows={5}/></label>
              <div className="reviewStrip"><span>Campaign</span><strong>{form.name || "Untitled campaign"}</strong><span>Lead file</span><strong>{fileName || "Not added yet"}</strong></div>
            </div>}
            <footer className="modalFooter"><button className="secondary" onClick={() => step === 1 ? setShowWizard(false) : setStep(step - 1)}>{step === 1 ? "Cancel" : "Back"}</button><button className="primary" disabled={step === 1 && !form.name.trim()} onClick={() => step < 3 ? setStep(step + 1) : submitCampaign()}>{step < 3 ? "Continue →" : "Submit campaign →"}</button></footer>
          </> : <div className="success"><div className="successIcon">✓</div><p className="eyebrow">CAMPAIGN RECEIVED</p><h2 id="wizard-title">It’s with the Myntmore team.</h2><p>We’ll review your leads and messaging, configure the sequence in Waalaxy, and update the status here. You’ll see progress within one business day.</p><button className="primary" onClick={() => setShowWizard(false)}>Back to campaigns</button></div>}
        </section>
      </div>}
      {showUserSetup && profile.role === "admin" && <div className="modalBackdrop"><button className="modalDismiss" onClick={() => setShowUserSetup(false)} aria-label="Close user setup"/><section className="modal accountModal" role="dialog" aria-modal="true" aria-labelledby="user-setup-title"><button className="close" onClick={() => setShowUserSetup(false)} aria-label="Close user setup">×</button><div className="modalBody"><p className="eyebrow">ADMIN · USER ACCOUNTS</p><h2 id="user-setup-title">Create a client login.</h2><p className="modalIntro">The account is confirmed immediately. Share these credentials securely with your client.</p><form className="loginForm" onSubmit={createUser}><label>Client name<input value={userForm.fullName} onChange={(event) => setUserForm({...userForm, fullName:event.target.value})} placeholder="Client or company name" required/></label><label>Email address<input type="email" value={userForm.email} onChange={(event) => setUserForm({...userForm, email:event.target.value})} placeholder="client@company.com" required/></label><label>Temporary password<input type="password" minLength={8} value={userForm.password} onChange={(event) => setUserForm({...userForm, password:event.target.value})} placeholder="At least 8 characters" required/></label>{userError && <p className="formError" role="alert">{userError}</p>}{userCreated && <p className="formSuccess" role="status">{userCreated}</p>}<button className="loginButton" disabled={userLoading}>{userLoading ? "Creating user…" : "Create client account"}<span>→</span></button></form></div></section></div>}
    </main>
  );
}
