import { chatGPTSignInPath } from "../chatgpt-auth";

export default function LoginPage() {
  return <main className="loginPage">
    <section className="loginBrand">
      <div className="brand loginLogo"><span className="brandMark">m</span><span>myntmore</span></div>
      <div><p className="eyebrow">CLIENT OUTREACH PORTAL</p><h1>Outreach that feels<br/><span className="handUnderline">considered,</span> not cold.</h1><p>Brief campaigns, share your lead lists, and follow every step from setup to replies.</p><span className="loginNote">built by people, for people ↗</span></div>
      <small>STRATEGY · EXECUTION · REPORTING</small>
    </section>
    <section className="loginPanel"><div className="loginCard"><p className="eyebrow">WELCOME TO MYNTMORE</p><h2>Sign in to your workspace</h2><p>Access your campaigns, lead lists, messaging briefs, and performance updates.</p><a className="loginButton" href={chatGPTSignInPath("/")}><span>✦</span> Continue with ChatGPT</a><div className="secureNote"><span>✓</span><p><strong>Private client workspace</strong><br/>Your campaign information is only visible to you and the Myntmore team.</p></div></div></section>
  </main>;
}
