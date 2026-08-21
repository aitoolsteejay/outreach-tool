import Link from "next/link";
import Image from "next/image";

export default function LoginPage() {
  return <main className="loginPage">
    <section className="loginBrand">
      <div className="brand loginLogo brandAsset"><Image src="/myntmore-logo.png" alt="Myntmore" width={2058} height={1336} priority /></div>
      <div><p className="eyebrow">CLIENT OUTREACH PORTAL</p><h1>Outreach that feels<br/><span className="handUnderline">considered,</span> not cold.</h1><p>Brief campaigns, share your lead lists, and follow every step from setup to replies.</p><span className="loginNote">built by people, for people ↗</span></div>
      <small>STRATEGY · EXECUTION · REPORTING</small>
    </section>
    <section className="loginPanel"><div className="loginCard"><p className="eyebrow">WELCOME TO MYNTMORE</p><h2>Sign in to your workspace</h2><p>Access your campaigns, lead lists, messaging briefs, and performance updates.</p><Link className="loginButton" href="/"><span>✦</span> Preview workspace</Link><div className="secureNote"><span>✓</span><p><strong>Authentication-ready</strong><br/>Connect Supabase Auth before inviting clients to the production workspace.</p></div></div></section>
  </main>;
}
