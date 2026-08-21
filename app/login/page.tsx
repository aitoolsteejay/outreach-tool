"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [canCreateAdmin, setCanCreateAdmin] = useState(true);
  const [showAdminSetup, setShowAdminSetup] = useState(false);
  const [adminForm, setAdminForm] = useState({ fullName: "", email: "", password: "" });
  const [adminError, setAdminError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);

  useEffect(() => {
    createClient().schema("outreach").rpc("has_admin").then(({ data, error: lookupError }) => {
      if (!lookupError) setCanCreateAdmin(!data);
    });
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { error: signInError } = await createClient().auth.signInWithPassword({ email, password });
    if (signInError) { setError(signInError.message); setLoading(false); return; }
    window.location.assign("/");
  }

  async function createAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminLoading(true);
    setAdminError("");
    const response = await fetch("/api/bootstrap/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(adminForm) });
    const result = await response.json();
    if (!response.ok) { setAdminError(result.error || "Unable to create the admin account."); setAdminLoading(false); return; }
    setCanCreateAdmin(false);
    setShowAdminSetup(false);
    setEmail(adminForm.email);
    setPassword(adminForm.password);
    setAdminLoading(false);
  }

  return <main className="landingPage">
    <nav className="landingNav"><Image src="/myntmore-logo.png" alt="Myntmore" width={2058} height={1336} priority /><span>Client outreach portal</span></nav>
    <div className="landingMain">
      <section className="landingHero">
        <p className="landingBadge"><span>●</span> OUTBOUND, MANAGED END-TO-END</p>
        <h1>More conversations.<br/><em>Less outbound chaos.</em></h1>
        <p className="landingCopy">Give us the right people and your point of view. Myntmore turns them into thoughtful campaigns, qualified replies, and meetings worth taking.</p>
        <div className="landingStats"><div><strong>12k+</strong><span>meetings booked</span></div><div><strong>18.4%</strong><span>average reply rate</span></div><div><strong>48h</strong><span>to launch-ready</span></div></div>
        <div className="landingSteps"><div><b>01</b><span>Upload your<br/>lead list</span></div><i>→</i><div><b>02</b><span>Share your<br/>strategy</span></div><i>→</i><div><b>03</b><span>We launch<br/>& report</span></div></div>
      </section>
      <aside className="loginAside"><div className="loginCard"><p className="eyebrow">CLIENT ACCESS</p><h2>Welcome back.</h2><p>Sign in to manage campaigns, leads, and performance.</p><form className="loginForm" onSubmit={signIn}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required autoComplete="email"/></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required autoComplete="current-password"/></label>{error && <p className="formError" role="alert">{error}</p>}<button className="loginButton" type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in to workspace"}<span>→</span></button></form>{canCreateAdmin && <button className="adminSetupLink" type="button" onClick={() => setShowAdminSetup(true)}>Create an admin account</button>}<div className="secureNote"><span>✓</span><p><strong>Private by design</strong><br/>Only your team and Myntmore can access campaign data.</p></div></div></aside>
    </div>
    <footer className="landingFooter"><span>© 2026 Myntmore</span><span>Strategy · Execution · Reporting</span></footer>
    {showAdminSetup && <div className="modalBackdrop"><button className="modalDismiss" onClick={() => setShowAdminSetup(false)} aria-label="Close admin setup"/><section className="modal accountModal" role="dialog" aria-modal="true" aria-labelledby="admin-setup-title"><button className="close" onClick={() => setShowAdminSetup(false)} aria-label="Close admin setup">×</button><div className="modalBody"><p className="eyebrow">ONE-TIME SETUP</p><h2 id="admin-setup-title">Create the admin account.</h2><p className="modalIntro">This option disappears permanently after the first admin is created.</p><form className="loginForm" onSubmit={createAdmin}><label>Full name<input value={adminForm.fullName} onChange={(event) => setAdminForm({...adminForm, fullName:event.target.value})} placeholder="Your name" required/></label><label>Email address<input type="email" value={adminForm.email} onChange={(event) => setAdminForm({...adminForm, email:event.target.value})} placeholder="admin@myntmore.com" required/></label><label>Password<input type="password" minLength={8} value={adminForm.password} onChange={(event) => setAdminForm({...adminForm, password:event.target.value})} placeholder="At least 8 characters" required/></label>{adminError && <p className="formError" role="alert">{adminError}</p>}<button className="loginButton" disabled={adminLoading}>{adminLoading ? "Creating admin…" : "Create admin account"}<span>→</span></button></form></div></section></div>}
  </main>;
}
