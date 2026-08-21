"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

const initialCampaigns = [
  { name: "India SaaS Founders", audience: "248 leads", status: "Live", progress: 68 },
  { name: "D2C Growth Leaders", audience: "184 leads", status: "In setup", progress: 32 },
  { name: "Fintech Partnerships", audience: "96 leads", status: "Draft", progress: 8 },
];

export default function Home() {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [fileName, setFileName] = useState("");
  const [leadFile, setLeadFile] = useState<File | null>(null);
  const [userId, setUserId] = useState("");
  const [form, setForm] = useState({ name: "", goal: "Book qualified discovery calls", offer: "", tone: "Warm, credible, and concise", message: "" });

  function update(field: string, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.replace("/login"); return; }
      setUserId(data.user.id);
      const { data: rows } = await supabase.schema("outreach").from("campaigns").select("name,lead_count,status,progress").order("created_at", { ascending: false });
      if (rows?.length) setCampaigns(rows.map((row) => ({ name: row.name, audience: `${row.lead_count} leads`, status: row.status.replaceAll("_", " ").replace(/^./, (letter: string) => letter.toUpperCase()), progress: row.progress })));
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
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand brandAsset"><Image src="/myntmore-logo.png" alt="Myntmore" width={2058} height={1336} priority /></div>
        <nav aria-label="Main navigation">
          <a className="navItem active" href="#campaigns"><span>◫</span> Campaigns</a>
          <a className="navItem" href="#leads"><span>♙</span> Lead lists</a>
          <a className="navItem" href="#templates"><span>◇</span> Templates</a>
        </nav>
        <div className="sidebarBottom">
          <a className="navItem" href="#help"><span>?</span> Help & support</a>
          <button className="navItem navButton" onClick={signOut}><span>↪</span> Sign out</button>
          <div className="profile"><div className="avatar">SG</div><div><strong>Sanyam G.</strong><small>Client workspace</small></div><button aria-label="Profile menu">•••</button></div>
        </div>
      </aside>

      <section className="content" id="campaigns">
        <header className="topbar"><div><p className="eyebrow">OUTREACH WORKSPACE</p><h1>Campaigns</h1></div><button className="primary" onClick={openWizard}>＋ New campaign</button></header>
        <section className="welcome">
          <div><p className="eyebrow dark">OUTREACH, MANAGED</p><h2>Turn lead lists into<br/>real conversations.</h2><p>Share the right people and your point of view. We’ll handle campaign setup, execution, and reporting.</p><button className="lightButton" onClick={openWizard}>Start a campaign <span>→</span></button></div>
        </section>
        <section className="stats" aria-label="Campaign summary">
          <div className="statYellow"><span>Active campaigns</span><strong>2</strong><small><b>↑ 1</b> this month</small></div>
          <div className="statPurple"><span>Total leads</span><strong>528</strong><small>Across all campaigns</small></div>
          <div className="statGreen"><span>Reply rate</span><strong>18.4%</strong><small><b>↑ 3.2%</b> vs last month</small></div>
        </section>
        <section className="campaignSection">
          <div className="sectionHeading"><div><h3>Your campaigns</h3><p>Track every campaign from brief to replies.</p></div><button className="filter">All campaigns⌄</button></div>
          <div className="campaignList">
            {campaigns.map((campaign) => <article className="campaign" key={campaign.name}>
              <div className="campaignIcon">↗</div><div className="campaignInfo"><strong>{campaign.name}</strong><span>{campaign.audience} · LinkedIn outreach</span></div>
              <div className="progress"><div><span>Campaign progress</span><b>{campaign.progress}%</b></div><div className="track"><i style={{width: `${campaign.progress}%`}}/></div></div>
              <span className={`status ${campaign.status.replaceAll(" ", "-").toLowerCase()}`}>{campaign.status}</span><button className="more" aria-label={`More options for ${campaign.name}`}>•••</button>
            </article>)}
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
    </main>
  );
}
