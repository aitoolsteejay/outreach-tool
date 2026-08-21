"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { error: signInError } = await createClient().auth.signInWithPassword({ email, password });
    if (signInError) { setError(signInError.message); setLoading(false); return; }
    window.location.assign("/");
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
      <aside className="loginAside"><div className="loginCard"><p className="eyebrow">CLIENT ACCESS</p><h2>Welcome back.</h2><p>Sign in to manage campaigns, leads, and performance.</p><form className="loginForm" onSubmit={signIn}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required autoComplete="email"/></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required autoComplete="current-password"/></label>{error && <p className="formError" role="alert">{error}</p>}<button className="loginButton" type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in to workspace"}<span>→</span></button></form><div className="secureNote"><span>✓</span><p><strong>Private by design</strong><br/>Only your team and Myntmore can access campaign data.</p></div></div></aside>
    </div>
    <footer className="landingFooter"><span>© 2026 Myntmore</span><span>Strategy · Execution · Reporting</span></footer>
  </main>;
}
