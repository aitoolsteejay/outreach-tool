"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type Campaign = { name: string; audience: string; status: string; progress: number; client?: string };

export default function Home() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [clientCount, setClientCount] = useState(0);
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
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
      const { data: rows } = await supabase.schema("outreach").from("campaigns").select("name,lead_count,status,progress,client_id").order("created_at", { ascending: false });
      const clients = profileRow.role === "admin" ? await supabase.schema("outreach").from("profiles").select("id,full_name,email").eq("role", "client") : { data: [] };
      setClientCount((clients.data || []).length);
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
    const { data: campaign, error } = await supabase.schema("outreach").from("campaigns").insert({ client_id: userId, name: form.name || "Untitled campaign", goal: form.goal, offer: form.offer, tone: form.tone, messaging_strategy: form.message, connection_note: form.connectionNote, follow_up_count: form.followUpCount, follow_up_messages: form.followUps.slice(0, form.followUpCount), status: "submitted", progress: 15, submitted_at: new Date().toISOString() }).select("id").single();
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
    const accountLabel = result.role === "admin" ? "admin" : "client";
    setUserCreated(result.existing ? `${result.email} already had a Myntmore login and now has ${accountLabel} access to Outreach. Their existing password is unchanged.` : `${result.email} now has ${accountLabel} access and can sign in with the temporary password.`); setUserForm({ fullName: "", email: "", password: "", role: "client" }); setUserLoading(false);
  }
  const isAdmin = profile.role === "admin";
  const activeCampaigns = campaigns.filter((campaign) => ["Live", "In setup", "Submitted", "In review"].includes(campaign.status)).length;
  const totalLeads = campaigns.reduce((sum, campaign) => sum + (Number.parseInt(campaign.audience) || 0), 0);
  return (
    <main className={`shell ${isAdmin ? "adminShell" : ""}`}>
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
        {isAdmin ? <div className="adminDashboard">
          <section className="adminSummary"><div><p className="eyebrow">TODAY’S OVERVIEW</p><h2>Keep every client<br/>moving forward.</h2><p>Review what needs attention, manage access, and keep campaign delivery on track.</p></div><div className="adminMetrics"><div><span>Needs review</span><strong>{campaigns.filter((campaign) => ["Submitted", "In review"].includes(campaign.status)).length}</strong></div><div><span>Active</span><strong>{activeCampaigns}</strong></div><div><span>Total leads</span><strong>{totalLeads}</strong></div><div><span>Clients</span><strong>{clientCount}</strong></div></div></section>
          <div className="adminGrid"><section className="campaignSection adminQueue"><div className="sectionHeading"><div><p className="eyebrow">CAMPAIGN DELIVERY</p><h3>Work queue</h3><p>Submissions requiring action appear first.</p></div><button className="filter">All statuses⌄</button></div><div className="campaignList">{campaigns.map((campaign) => <article className="campaign" key={campaign.name}><div className="campaignIcon">↗</div><div className="campaignInfo"><strong>{campaign.name}</strong><span>{campaign.client ? `${campaign.client} · ` : ""}{campaign.audience}</span></div><div className="progress"><div><span>Progress</span><b>{campaign.progress}%</b></div><div className="track"><i style={{width:`${campaign.progress}%`}}/></div></div><span className={`status ${campaign.status.replaceAll(" ", "-").toLowerCase()}`}>{campaign.status}</span><button className="more" aria-label={`More options for ${campaign.name}`}>•••</button></article>)}{!workspaceLoading && campaigns.length === 0 && <div className="adminEmpty"><span>✓</span><strong>Nothing needs attention.</strong><p>Client submissions will appear here as soon as they arrive.</p></div>}</div></section>
          <aside className="adminPanel"><div className="adminPanelHead"><span>CLIENT ACCESS</span><strong>{clientCount}</strong></div><h3>Manage your clients</h3><p>Create portal access for a new client or connect an existing Myntmore login.</p><button className="primary" onClick={() => setShowUserSetup(true)}>＋ Add client account</button><div className="adminChecklist"><p>HOW IT WORKS</p><div><b>1</b><span>Create the client login</span></div><div><b>2</b><span>Client submits their brief</span></div><div><b>3</b><span>Campaign enters your queue</span></div></div></aside></div>
        </div> : <div className="clientDashboard"><section className="clientSummary"><div><p className="eyebrow">YOUR OUTREACH</p><h2>Campaigns,<br/>without the chaos.</h2><p>Brief the Myntmore team once, then follow every campaign from setup to conversations.</p></div><div className="clientMetrics"><div><span>Active</span><strong>{workspaceLoading ? "—" : activeCampaigns}</strong><small>campaigns</small></div><div><span>Total reach</span><strong>{workspaceLoading ? "—" : totalLeads}</strong><small>leads</small></div><div><span>Submitted</span><strong>{workspaceLoading ? "—" : campaigns.length}</strong><small>all time</small></div></div></section><div className="clientGrid"><section className="campaignSection clientCampaigns"><div className="sectionHeading"><div><p className="eyebrow">CAMPAIGN TRACKER</p><h3>Your campaigns</h3><p>Every brief, status update, and result in one place.</p></div><button className="filter">All statuses⌄</button></div><div className="campaignList">{campaigns.map((campaign) => <article className="campaign" key={campaign.name}><div className="campaignIcon">↗</div><div className="campaignInfo"><strong>{campaign.name}</strong><span>{campaign.audience} · LinkedIn outreach</span></div><div className="progress"><div><span>Progress</span><b>{campaign.progress}%</b></div><div className="track"><i style={{width:`${campaign.progress}%`}}/></div></div><span className={`status ${campaign.status.replaceAll(" ", "-").toLowerCase()}`}>{campaign.status}</span><button className="more" aria-label={`More options for ${campaign.name}`}>•••</button></article>)}{!workspaceLoading && campaigns.length === 0 && <div className="clientEmpty"><span>01</span><strong>Your first campaign starts here.</strong><p>Share your lead list and messaging direction. We’ll take it from there.</p><button className="primary" onClick={openWizard}>Start a campaign</button></div>}</div></section><aside className="clientAction"><p className="eyebrow">NEW CAMPAIGN</p><h3>Ready to reach<br/>the right people?</h3><p>Send us the audience and your point of view. We handle the sequence, launch, and reporting.</p><button className="lightButton" onClick={openWizard}>Create campaign <span>→</span></button><div className="clientSteps"><div><b>1</b><span>Campaign brief</span></div><div><b>2</b><span>Lead list upload</span></div><div><b>3</b><span>Messaging direction</span></div></div></aside></div></div>}
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
            </div>}
            <footer className="modalFooter"><button className="secondary" onClick={() => step === 1 ? setShowWizard(false) : setStep(step - 1)}>{step === 1 ? "Cancel" : "Back"}</button><button className="primary" disabled={(step === 1 && !form.name.trim()) || (step === 3 && (!form.connectionNote.trim() || form.followUps.slice(0,form.followUpCount).some((message) => !message.trim())))} onClick={() => step < 3 ? setStep(step + 1) : submitCampaign()}>{step < 3 ? "Continue →" : "Submit campaign →"}</button></footer>
          </> : <div className="success"><div className="successIcon">✓</div><p className="eyebrow">CAMPAIGN RECEIVED</p><h2 id="wizard-title">It’s with the Myntmore team.</h2><p>We’ll review your leads and messaging, configure the sequence in Waalaxy, and update the status here. You’ll see progress within one business day.</p><button className="primary" onClick={() => setShowWizard(false)}>Back to campaigns</button></div>}
        </section>
      </div>}
      {showUserSetup && profile.role === "admin" && <div className="modalBackdrop"><button className="modalDismiss" onClick={() => setShowUserSetup(false)} aria-label="Close user setup"/><section className="modal accountModal" role="dialog" aria-modal="true" aria-labelledby="user-setup-title"><button className="close" onClick={() => setShowUserSetup(false)} aria-label="Close user setup">×</button><div className="modalBody"><p className="eyebrow">ADMIN · USER ACCOUNTS</p><h2 id="user-setup-title">Create a user account.</h2><p className="modalIntro">Choose the access level, then share the credentials securely with the user.</p><form className="loginForm" onSubmit={createUser}><fieldset className="accountType"><legend>Account type</legend><button type="button" className={userForm.role === "client" ? "selected" : ""} onClick={() => setUserForm({...userForm,role:"client"})}><b>Client</b><span>Submit and track campaigns</span></button><button type="button" className={userForm.role === "admin" ? "selected" : ""} onClick={() => setUserForm({...userForm,role:"admin"})}><b>Admin</b><span>Manage clients and operations</span></button></fieldset><label>Full name<input value={userForm.fullName} onChange={(event) => setUserForm({...userForm, fullName:event.target.value})} placeholder="Full name or company" required/></label><label>Email address<input type="email" value={userForm.email} onChange={(event) => setUserForm({...userForm, email:event.target.value})} placeholder={userForm.role === "admin" ? "admin@myntmore.com" : "client@company.com"} required/></label><label>Temporary password<input type="password" minLength={8} value={userForm.password} onChange={(event) => setUserForm({...userForm, password:event.target.value})} placeholder="At least 8 characters" required/></label>{userError && <p className="formError" role="alert">{userError}</p>}{userCreated && <p className="formSuccess" role="status">{userCreated}</p>}<button className="loginButton" disabled={userLoading}>{userLoading ? "Creating user…" : `Create ${userForm.role} account`}<span>→</span></button></form></div></section></div>}
    </main>
  );
}
