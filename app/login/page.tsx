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

  return <main className="loginPage">
    <section className="loginBrand">
      <div className="brand loginLogo brandAsset"><Image src="/myntmore-logo.png" alt="Myntmore" width={2058} height={1336} priority /></div>
      <div><p className="eyebrow">CLIENT OUTREACH PORTAL</p><h1>Outreach that feels<br/><span className="handUnderline">considered,</span> not cold.</h1><p>Brief campaigns, share your lead lists, and follow every step from setup to replies.</p><span className="loginNote">built by people, for people ↗</span></div>
      <small>STRATEGY · EXECUTION · REPORTING</small>
    </section>
    <section className="loginPanel"><div className="loginCard"><p className="eyebrow">WELCOME TO MYNTMORE</p><h2>Sign in to your workspace</h2><p>Access your campaigns, lead lists, messaging briefs, and performance updates.</p><form className="loginForm" onSubmit={signIn}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required autoComplete="email"/></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required autoComplete="current-password"/></label>{error && <p className="formError" role="alert">{error}</p>}<button className="loginButton" type="submit" disabled={loading}><span>✦</span>{loading ? "Signing in…" : "Sign in"}</button></form><div className="secureNote"><span>✓</span><p><strong>Private client workspace</strong><br/>Campaign data is protected by account-level access controls.</p></div></div></section>
  </main>;
}
