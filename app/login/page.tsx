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

  return <main className="loginPage"><div className="loginShell">
    <section className="loginBrand">
      <div className="portalTag"><span>●</span> MYNTMORE / OUTREACH</div>
      <div className="loginStory"><p className="eyebrow">A CALMER WAY TO GROW</p><h1>Outreach that feels <span>considered.</span></h1><p>Bring us your audience and point of view. We’ll turn them into conversations worth having.</p><div className="proofRow"><strong>12,000+</strong><span>meetings booked<br/>for ambitious teams</span></div></div>
      <small>STRATEGY · EXECUTION · REPORTING</small>
    </section>
    <section className="loginPanel"><div className="loginCard"><div className="loginLogo"><Image src="/myntmore-logo.png" alt="Myntmore" width={2058} height={1336} priority /></div><p className="eyebrow">CLIENT PORTAL</p><h2>Welcome back.</h2><p>Sign in to manage your campaigns, lead lists, and performance updates.</p><form className="loginForm" onSubmit={signIn}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required autoComplete="email"/></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required autoComplete="current-password"/></label>{error && <p className="formError" role="alert">{error}</p>}<button className="loginButton" type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in to workspace"}<span>→</span></button></form><div className="secureNote"><span>✓</span><p><strong>Private by design</strong><br/>Your campaign data is only visible to your team and Myntmore.</p></div></div></section>
  </div></main>;
}
