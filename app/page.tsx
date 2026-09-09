"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Sales/marketing landing page, served at "/". Existing users get in via the
// "Log in" link, which checks for a live session before deciding where to
// send them -- straight to /dashboard if one exists, /login otherwise. The
// dashboard itself re-validates the session and profile on mount regardless,
// so this check only saves an unnecessary detour through the login form.
const DEMO_NOTE = "Hi {{first_name}}, I came across your work at {{company}} and would love to connect.";

export default function LandingPage() {
  const router = useRouter();
  const [loginChecking, setLoginChecking] = useState(false);
  const noteBoxRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const metricsRef = useRef<HTMLDivElement>(null);
  const csvTableRef = useRef<HTMLTableElement>(null);
  const csvMapFromRef = useRef<HTMLSpanElement>(null);
  const csvMapToRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const box = noteBoxRef.current;
    const counter = counterRef.current;
    if (!box || !counter) return;
    const total = DEMO_NOTE.length;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      box.textContent = DEMO_NOTE;
      counter.textContent = `${total} / 300`;
      return;
    }
    let cancelled = false;
    let timeoutId = 0;
    const caret = document.createElement("span");
    caret.className = "mm-caret";
    const render = (index: number) => {
      box.textContent = DEMO_NOTE.slice(0, index);
      box.appendChild(caret);
      counter.textContent = `${index} / 300`;
    };
    // Loops continuously -- type out, hold so it's readable, erase, hold
    // briefly empty, retype -- rather than typing once and sitting on a
    // blinking cursor forever.
    const loop = (index: number, typing: boolean) => {
      if (cancelled) return;
      render(index);
      if (typing && index >= total) { timeoutId = window.setTimeout(() => loop(index, false), 1800); return; }
      if (!typing && index <= 0) { timeoutId = window.setTimeout(() => loop(0, true), 500); return; }
      const next = typing ? index + 1 : index - 1;
      const delay = typing ? 18 + Math.random() * 30 : 12;
      timeoutId = window.setTimeout(() => loop(next, typing), delay);
    };
    timeoutId = window.setTimeout(() => loop(0, true), 500);
    return () => { cancelled = true; window.clearTimeout(timeoutId); };
  }, []);

  // Scroll-reveal for everything below the hero (the hero itself renders
  // fully visible immediately -- it's the first frame, never gated behind a
  // scroll trigger). Elements opt in with a "mm-reveal" class; this just
  // watches for them entering the viewport and flips "mm-in" once, which the
  // CSS transitions. Skipped entirely under reduced motion, where the CSS
  // already renders everything at full opacity with no transition.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const targets = document.querySelectorAll(".mm-landing .mm-reveal");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("mm-in");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  // Counts the metrics card's numbers up from zero the first time it scrolls
  // into view, purely a decorative reinforcement of "these update live" --
  // the real values are what's in the markup, so reduced motion (or this
  // effect never running at all) just leaves them at their true value.
  useEffect(() => {
    const card = metricsRef.current;
    if (!card || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const targets = [...card.querySelectorAll<HTMLElement>("[data-count-to]")];
    for (const target of targets) target.textContent = `0${target.dataset.countSuffix || ""}`;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      const start = performance.now();
      const duration = 900;
      const frame = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - progress) ** 3;
        for (const target of targets) target.textContent = `${Math.round(Number(target.dataset.countTo) * eased)}${target.dataset.countSuffix || ""}`;
        if (progress < 1) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }, { threshold: 0.4 });
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  // CSV mockup: cycles which source column is "being mapped", highlighting
  // that table header in sync with the from/to caption underneath it, so the
  // "we match your columns" claim reads as something actually happening
  // rather than a static screenshot.
  useEffect(() => {
    const table = csvTableRef.current;
    const fromEl = csvMapFromRef.current;
    const toEl = csvMapToRef.current;
    if (!table || !fromEl || !toEl) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const pairs: [string, string][] = [["Surname", "last_name"], ["Employer", "company"], ["LinkedIn Profile", "linkedin_url"], ["First Name", "first_name"]];
    let index = 0;
    const apply = () => {
      const [from, to] = pairs[index];
      table.querySelectorAll("th").forEach((th) => th.classList.toggle("mm-mapping", th.textContent === from));
      fromEl.textContent = from;
      toEl.textContent = to;
    };
    apply();
    const intervalId = window.setInterval(() => { index = (index + 1) % pairs.length; apply(); }, 2200);
    return () => window.clearInterval(intervalId);
  }, []);

  async function goToApp() {
    setLoginChecking(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.push("/login"); return; }
      // Also check access here, not just that a session exists -- otherwise
      // a stale/revoked session bounces through a full /dashboard mount
      // (which re-checks the same thing) before hard-reloading back to
      // /login with no explanation. Checking it here means a revoked
      // session goes straight to /login in one clean navigation.
      const { data: profileRow, error: profileError } = await supabase.schema("outreach").from("profiles").select("id").eq("id", data.user.id).is("access_revoked_at", null).single();
      if (profileError || !profileRow) {
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }
      router.push("/dashboard");
    } catch {
      router.push("/login");
    }
  }

  return (
    <div className="mm-landing">
      <style>{LANDING_CSS}</style>

      <nav className="nav">
        <div className="wrap">
          <div className="navmark"><Image src="/myntmore-logo.png" alt="Myntmore" width={102} height={66} priority /></div>
          <div className="navlinks">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#who">Who it&apos;s for</a>
            <a href="#faq">FAQ</a>
            <button type="button" className="btn btn-ghost btn-small" disabled={loginChecking} onClick={goToApp}>{loginChecking ? "Checking…" : "Log in"}</button>
            <a className="btn btn-primary btn-small" href="mailto:hello@myntmore.com?subject=Starting%20a%20campaign">Start a campaign</a>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap">
          <div>
            <p className="eyebrow">LinkedIn outreach, done for you</p>
            <h1>Turn lead lists into real conversations.</h1>
            <p className="sub">Send us your leads and your message. We configure the sequence, send the connection requests, and hand you a dashboard that shows exactly where every campaign stands, no outreach software for you to learn.</p>
            <div className="ctas">
              <a className="btn btn-primary" href="mailto:hello@myntmore.com?subject=Starting%20a%20campaign">Start your first campaign</a>
              <a className="btn btn-ghost" href="#how">See how it works</a>
            </div>
            <p className="fine">Most briefs move from submitted to live within one business day.</p>
            <div className="hero-annotation" aria-hidden="true">
              <svg viewBox="0 0 130 60" fill="none">
                <path d="M4 50C34 54 74 44 100 14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M78 10L100 14L96 36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              <span>Just the note. We handle the rest.</span>
            </div>
          </div>

          <div className="demo">
            <div className="demo-top">
              <span className="label">Connection note</span>
              <span className="pill pill-submitted">Submitted</span>
            </div>
            <div className="demo-body">
              <div className="demo-field-label"><span>Draft</span><span ref={counterRef}>0 / 300</span></div>
              <div className="note-box" ref={noteBoxRef} />
              <div className="tokens">
                <span className="token">{"{{first_name}}"}</span>
                <span className="token">{"{{last_name}}"}</span>
                <span className="token">{"{{company}}"}</span>
              </div>
              <div className="stepper-mini">
                <div className="node on" /><div className="seg" />
                <div className="node" /><div className="seg" />
                <div className="node" /><div className="seg" />
                <div className="node" /><div className="seg" />
                <div className="node" />
              </div>
              <div className="stepper-mini labels">
                <span>Submitted</span><span>Review</span><span>Setup</span><span>Live</span><span>Done</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="stats-strip">
        <div className="wrap">
          <div className="stat mm-reveal mm-r1"><strong>300</strong><span>characters per connection note. That is LinkedIn&apos;s own limit, and every draft is checked against it before it goes out.</span></div>
          <div className="stat mm-reveal mm-r2"><strong>1 to 3</strong><span>personalized follow ups per campaign, sent only after someone accepts your connection.</span></div>
          <div className="stat mm-reveal mm-r3"><strong>1 day</strong><span>typical turnaround from a submitted brief to a live campaign in your queue.</span></div>
        </div>
      </div>

      <section id="how">
        <div className="wrap">
          <div className="section-head mm-reveal">
            <p className="eyebrow">How it works</p>
            <h2>Four stages. You can see all of them.</h2>
            <p>No black box. Every campaign moves through the same stages in your dashboard, in this order, and you always know which one it is in.</p>
          </div>
          <div className="flow">
            <div className="flow-step mm-reveal mm-r1">
              <span className="pill pill-submitted stage">01 · Submitted</span>
              <h3>Brief us once</h3>
              <p>Goal, offer, tone, your connection note, and up to three follow ups. Takes about ten minutes the first time.</p>
            </div>
            <div className="flow-step mm-reveal mm-r2">
              <span className="pill pill-review stage">02 · In review</span>
              <h3>We check it</h3>
              <p>A person on our team reads the note, the offer, and the lead list before anything is scheduled to send under your name.</p>
            </div>
            <div className="flow-step mm-reveal mm-r3">
              <span className="pill pill-setup stage">03 · In setup</span>
              <h3>We build the sequence</h3>
              <p>Your connection note and follow ups get configured and queued against your uploaded leads.</p>
            </div>
            <div className="flow-step mm-reveal mm-r4">
              <span className="pill pill-live stage">04 · Live</span>
              <h3>It runs, you watch</h3>
              <p>Connection requests go out. Acceptance rate, replies, and progress update in your dashboard as they happen.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="compare">
        <div className="wrap">
          <div className="section-head mm-reveal">
            <p className="eyebrow">The difference</p>
            <h2>Outreach without the second job.</h2>
            <p>Same goal, real conversations on LinkedIn, a very different amount of your own time spent getting there.</p>
          </div>
          <div className="compare-wrap">
            <div className="compare-col compare-bad mm-reveal mm-r1">
              <span className="compare-label">Doing it yourself</span>
              <ul>
                <li><span className="compare-mark">✕</span>Piece together a LinkedIn tool, a spreadsheet, and hours of your own time</li>
                <li><span className="compare-mark">✕</span>Manually pace connection requests so you do not trip LinkedIn&apos;s limits</li>
                <li><span className="compare-mark">✕</span>Remember to send your own follow ups, or lose the reply</li>
                <li><span className="compare-mark">✕</span>Wait until month end to find out if a list or message actually worked</li>
              </ul>
            </div>
            <div className="compare-col compare-good mm-reveal mm-r2">
              <span className="compare-label">Working with Myntmore</span>
              <ul>
                <li><span className="compare-mark">✓</span>Send us a brief and a lead list. We configure and run the sequence</li>
                <li><span className="compare-mark">✓</span>A person reviews your note and offer before anything sends under your name</li>
                <li><span className="compare-mark">✓</span>Follow ups send automatically, only after someone accepts</li>
                <li><span className="compare-mark">✓</span>Acceptance rate and replies update in your dashboard as they happen</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="features">
        <div className="wrap">
          <div className="section-head mm-reveal">
            <p className="eyebrow">What you get</p>
            <h2>Built around what outreach actually needs.</h2>
            <p>Not a general automation platform with a learning curve. A short list of things that matter for LinkedIn outreach specifically, handled properly.</p>
          </div>
          <div className="feature-grid">
            <div className="feature mm-reveal mm-r1">
              <div className="icon" style={{ background: "var(--blue-tint)", color: "#3B5BDB" }}>🧰</div>
              <h3>We run the software, not you</h3>
              <p>LinkedIn logins, sequence setup, and delivery all happen on our side, using our own tools. You send a brief and a lead list. That is the whole learning curve.</p>
            </div>
            <div className="feature mm-reveal mm-r2">
              <div className="icon" style={{ background: "var(--violet-tint)", color: "#6D3FD1" }}>📍</div>
              <h3>Always know where you stand</h3>
              <p>Every campaign shows its real status right now: Submitted, In review, In setup, Live, or Completed. No waiting on an update email to find out.</p>
            </div>
            <div className="feature mm-reveal mm-r3">
              <div className="icon" style={{ background: "var(--green-tint)", color: "var(--green)" }}>📈</div>
              <h3>See what is actually working</h3>
              <p>Acceptance rate and reply rate, updated as your campaign runs, so you can tell within days whether a list or a message is landing, not guess at the end of the month.</p>
            </div>
            <div className="feature mm-reveal mm-r1">
              <div className="icon" style={{ background: "var(--amber-tint)", color: "var(--amber)" }}>👤</div>
              <h3>A person reviews every brief</h3>
              <p>Before a single connection request goes out, someone checks the note, the offer, and the list against what you actually asked for.</p>
            </div>
            <div className="feature mm-reveal mm-r2">
              <div className="icon" style={{ background: "var(--blue-tint)", color: "#3B5BDB" }}>💬</div>
              <h3>Personalize without the busywork</h3>
              <p>Drop in {"{{first_name}}"}, {"{{last_name}}"}, or {"{{company}}"} anywhere in your note or follow ups. We fill in the real details per lead.</p>
            </div>
            <div className="feature mm-reveal mm-r3">
              <div className="icon" style={{ background: "var(--violet-tint)", color: "#6D3FD1" }}>🔔</div>
              <h3>Problems reach you the same day</h3>
              <p>A bad LinkedIn URL, a login that needs your attention, anything that could stall a campaign shows up as an alert on your dashboard right away, not weeks later when you ask why nothing sent.</p>
            </div>
            <div className="feature mm-reveal mm-r1">
              <div className="icon" style={{ background: "var(--green-tint)", color: "var(--green)" }}>🔁</div>
              <h3>Add leads anytime</h3>
              <p>Upload another batch whenever you have one, a new week, a fresh list pull, and we merge it into the same campaign. Anyone already on the list is skipped automatically.</p>
            </div>
            <div className="feature mm-reveal mm-r2">
              <div className="icon" style={{ background: "var(--amber-tint)", color: "var(--amber)" }}>🗂️</div>
              <h3>Run multiple campaigns at once</h3>
              <p>Each one tracked separately, with its own brief, leads, status, and results, all from the same dashboard.</p>
            </div>
            <div className="feature mm-reveal mm-r3">
              <div className="icon" style={{ background: "var(--blue-tint)", color: "#3B5BDB" }}>🛡️</div>
              <h3>Your data stays private</h3>
              <p>Lead lists, messages, and results are visible only to your account and our team, never shared or bundled with anyone else&apos;s.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="who">
        <div className="wrap">
          <div className="section-head mm-reveal">
            <p className="eyebrow">Who this is for</p>
            <h2>Built for the people who&apos;d rather be doing something else.</h2>
            <p>If any of this sounds like your week, that is exactly the gap Myntmore fills.</p>
          </div>
          <div className="feature-grid">
            <div className="feature mm-reveal mm-r1">
              <div className="icon" style={{ background: "var(--blue-tint)", color: "#3B5BDB" }}>🎯</div>
              <h3>Founders and solo operators</h3>
              <p>Outreach that keeps running without becoming the thing you do instead of the rest of your job.</p>
            </div>
            <div className="feature mm-reveal mm-r2">
              <div className="icon" style={{ background: "var(--violet-tint)", color: "#6D3FD1" }}>📊</div>
              <h3>Sales and growth teams</h3>
              <p>A steady stream of LinkedIn conversations for the pipeline, without adding another tool for the team to learn.</p>
            </div>
            <div className="feature mm-reveal mm-r3">
              <div className="icon" style={{ background: "var(--green-tint)", color: "var(--green)" }}>🧩</div>
              <h3>Agencies and consultants</h3>
              <p>Run outreach for more than one client at once, each campaign tracked separately with its own dashboard.</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head mm-reveal">
            <p className="eyebrow">Your lead list</p>
            <h2>Upload it as is. We will match the columns.</h2>
            <p>Most CSV tools reject a file the moment a header does not match exactly. We do not. If your export uses different column names, you map them once and we take it from there.</p>
          </div>
          <div className="csv-wrap">
            <div className="csv-card mm-reveal mm-r1">
              <div className="csv-head">your-leads-export.csv</div>
              <div className="csv-table-scroll">
                <table className="csv-table" ref={csvTableRef}>
                  <tbody>
                    <tr><th>First Name</th><th>Surname</th><th>Employer</th><th>LinkedIn Profile</th></tr>
                    <tr><td>Amara</td><td>Okafor</td><td>Blume Analytics</td><td>linkedin.com/in/amara-o</td></tr>
                    <tr><td>Devon</td><td>Reyes</td><td>Northfield Labs</td><td>linkedin.com/in/devon-r</td></tr>
                    <tr><td>Priya</td><td>Nair</td><td>Solace Health</td><td>linkedin.com/in/priya-nair</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="csv-map"><span ref={csvMapFromRef}>Surname</span><span className="arrow">→</span><span ref={csvMapToRef}>last_name</span><span style={{ marginLeft: "auto", color: "var(--muted)" }}>mapped automatically</span></div>
            </div>
            <div className="mm-reveal mm-r2">
              <h3 style={{ fontSize: 19, marginBottom: 12 }}>No reformatting. No rejected uploads.</h3>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.7 }}>Every lead still needs a LinkedIn URL, that part is not optional, LinkedIn is how the outreach reaches them. Everything else, job title, company, notes, is optional and can be mapped or left out entirely.</p>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.7, marginTop: 14 }}>Files up to 10 MB. That covers a few thousand leads for most campaigns.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="metrics">
        <div className="wrap">
          <div className="section-head mm-reveal">
            <p className="eyebrow">What you will see</p>
            <h2>Your dashboard, with example numbers.</h2>
            <p>This is the same view you get once a campaign is live. The figures below are a worked example, not a promise, your results depend on your list and your offer.</p>
          </div>
          <div className="metrics-card mm-reveal" ref={metricsRef}>
            <div className="metrics-head">
              <div>
                <strong>DTC Brand Founders, Q3</strong>
                <span>Example campaign · 180 leads · live for 18 days</span>
              </div>
              <span className="pill pill-live">Live</span>
            </div>
            <div className="metrics-grid">
              <div className="metric-tile"><span>Connections sent</span><strong data-count-to="172">172</strong></div>
              <div className="metric-tile"><span>Accepted</span><strong data-count-to="76">76</strong></div>
              <div className="metric-tile"><span>Acceptance rate</span><strong data-count-to="44" data-count-suffix="%">44%</strong></div>
              <div className="metric-tile"><span>Positive replies</span><strong data-count-to="14">14</strong></div>
            </div>
            <div className="metrics-foot">Figures update automatically as connections are accepted and replies come in, tracked per campaign so you can compare across your account.</div>
          </div>
        </div>
      </section>

      <section id="faq">
        <div className="wrap">
          <div className="section-head mm-reveal">
            <p className="eyebrow">Questions</p>
            <h2>Before you start.</h2>
          </div>
          <div className="faq">
            <details className="faq-item mm-reveal mm-r1" open>
              <summary>What happens after I submit a campaign?<span className="plus">+</span></summary>
              <p>Your brief, lead list, and message sequence go to our team. We review it, configure the sequence, and move your campaign from Submitted to In review and then In setup. You will see the status change on your dashboard as it happens.</p>
            </details>
            <details className="faq-item mm-reveal mm-r2">
              <summary>What columns does my lead list need?<span className="plus">+</span></summary>
              <p>First name, last name, job title, company, LinkedIn URL, email, and notes, matching a template you can download in the campaign wizard. Every lead needs a LinkedIn URL. If your file uses different column names, you can map them instead of reformatting.</p>
            </details>
            <details className="faq-item mm-reveal mm-r3">
              <summary>Can I personalize the messages?<span className="plus">+</span></summary>
              <p>Yes. Insert {"{{first_name}}"}, {"{{last_name}}"}, or {"{{company}}"} anywhere in your connection note or follow ups, and we swap in each lead&apos;s real details when the sequence sends.</p>
            </details>
            <details className="faq-item mm-reveal mm-r1">
              <summary>How is my LinkedIn login handled?<span className="plus">+</span></summary>
              <p>It is encrypted the moment you submit it and never stored in plain text. Our team unlocks it only to run your campaign, and if LinkedIn asks for a verification code or a phone approval, you handle that directly from your dashboard.</p>
            </details>
            <details className="faq-item mm-reveal mm-r2">
              <summary>Is my data shared with other clients?<span className="plus">+</span></summary>
              <p>No. Your lead lists, messages, and results are visible only to your account and our team.</p>
            </details>
            <details className="faq-item mm-reveal mm-r3">
              <summary>Can I add more leads to a campaign that is already running?<span className="plus">+</span></summary>
              <p>Yes. Upload another batch any time from your campaign&apos;s details, a new week, a fresh list pull, and we merge it in. Anyone already on the list is skipped automatically.</p>
            </details>
            <details className="faq-item mm-reveal mm-r1">
              <summary>How long does it take to go live?<span className="plus">+</span></summary>
              <p>Most campaigns move from submitted to live within one business day, once your brief and lead list are in and reviewed.</p>
            </details>
            <details className="faq-item mm-reveal mm-r2">
              <summary>Can I run more than one campaign at a time?<span className="plus">+</span></summary>
              <p>Yes. Each campaign is tracked separately, with its own brief, leads, status, and results, all in the same dashboard.</p>
            </details>
            <details className="faq-item mm-reveal mm-r3">
              <summary>Can I change a campaign after I submit it?<span className="plus">+</span></summary>
              <p>Not directly from your dashboard yet. Reach out to your Myntmore contact and we will make the change before it goes live.</p>
            </details>
            <details className="faq-item mm-reveal mm-r1">
              <summary>Do I need to install any software?<span className="plus">+</span></summary>
              <p>No. There is nothing to download or configure. You send a brief and a lead list, and our team runs the sequence on our own tools.</p>
            </details>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="cta-band mm-reveal">
            <div className="cta-inner">
              <p className="eyebrow">Ready when you are</p>
              <h2>Send us a lead list and a message. We will handle the rest.</h2>
              <p>No setup call required to get started, though we are happy to have one. Submit a brief, upload your leads, and watch your first campaign move to live.</p>
              <div className="ctas">
                <a className="btn btn-primary" href="mailto:hello@myntmore.com?subject=Starting%20a%20campaign">Start your first campaign</a>
                <a className="btn btn-ghost" href="mailto:hello@myntmore.com?subject=Question%20about%20Myntmore%20Outreach">Ask a question first</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="foot-wrap">
            <div>
              <div className="foot-brand">Myntmore Outreach</div>
              <p className="foot-tag">LinkedIn outreach for teams who want real conversations, not another dashboard to manage.</p>
            </div>
            <div className="foot-links">
              <a href="#how">How it works</a>
              <a href="#features">Features</a>
              <a href="#who">Who it&apos;s for</a>
              <a href="#faq">FAQ</a>
              <button type="button" disabled={loginChecking} onClick={goToApp}>{loginChecking ? "Checking…" : "Log in"}</button>
              <a href="mailto:hello@myntmore.com">Contact</a>
            </div>
          </div>
          <p className="foot-copy">Myntmore Outreach. Built for LinkedIn campaigns, start to finish.</p>
        </div>
      </footer>
    </div>
  );
}

// Scoped under .mm-landing (a single wrapper class) rather than :root, so
// these tokens and rules never leak onto /dashboard or /login, which define
// their own (different) versions of similarly-named tokens and classes in
// app/globals.css.
const LANDING_CSS = `
.mm-landing{
  --paper:#F6F4EE;
  --raised:#FFFFFF;
  --ink:#14151C;
  --ink-soft:#4B4C5C;
  --muted:#8B897F;
  --line:#E6E1D3;
  --blue:#4C6EF5;
  --violet:#8B5CF6;
  --blue-tint:#EEF0FF;
  --violet-tint:#F1EBFE;
  --green:#1F8F5D;
  --green-tint:#E4F7ED;
  --amber:#C2410C;
  --amber-tint:#FDE7F1;
  --shadow:0 20px 50px -20px rgba(20,21,28,0.18);
  --band-bg:#FFFFFF;
  --band-fg:#14151C;
  --band-muted:#4B4C5C;
  --serif:'Fraunces',Georgia,serif;
  --sans:'Manrope',-apple-system,'Segoe UI',Arial,sans-serif;
  --mono:'IBM Plex Mono','SF Mono',Menlo,monospace;
  --hand:'Caveat',cursive;
  min-height:100vh;
  background:var(--paper);
  color:var(--ink);
  font-family:var(--sans);
  line-height:1.5;
  -webkit-font-smoothing:antialiased;
}
.mm-landing *{box-sizing:border-box}
.mm-landing h1,.mm-landing h2,.mm-landing h3{font-family:var(--serif);font-weight:560;letter-spacing:-0.02em;margin:0;text-wrap:balance}
.mm-landing p{margin:0}
.mm-landing a{color:inherit}
.mm-landing button{font:inherit;background:none;border:0;cursor:pointer;color:inherit}
.mm-landing ::selection{background:var(--blue);color:#fff}
.mm-landing .wrap{max-width:1120px;margin:0 auto;padding:0 32px}
.mm-landing .eyebrow{font-family:var(--sans);font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:var(--blue);margin:0 0 14px}
.mm-landing section{padding:88px 0}
@media(max-width:760px){.mm-landing section{padding:56px 0}.mm-landing .wrap{padding:0 20px}}

/* Scroll-reveal: fades and lifts .mm-reveal elements in once "mm-in" is
   added (see the IntersectionObserver in the component). Staggered via
   mm-r1..mm-r4 so a row of siblings cascades instead of popping in at once. */
.mm-landing .mm-reveal{opacity:0;transform:translateY(22px);transition:opacity .7s cubic-bezier(.16,.84,.44,1),transform .7s cubic-bezier(.16,.84,.44,1)}
.mm-landing .mm-reveal.mm-in{opacity:1;transform:translateY(0)}
.mm-landing .mm-r1.mm-in{transition-delay:.05s}
.mm-landing .mm-r2.mm-in{transition-delay:.14s}
.mm-landing .mm-r3.mm-in{transition-delay:.23s}
.mm-landing .mm-r4.mm-in{transition-delay:.32s}
@media (prefers-reduced-motion: reduce){
  .mm-landing .mm-reveal{opacity:1;transform:none;transition:none}
}

/* app/globals.css has a bare, unscoped "nav { display:grid }" rule (for the
   dashboard's sidebar) that would otherwise leak onto this nav too, since
   Next.js loads all global CSS app-wide regardless of route -- override it
   explicitly rather than relying on our higher-specificity .nav rules alone,
   since we never otherwise declare a display value for .nav itself. */
.mm-landing .nav{display:block;position:sticky;top:0;z-index:20;backdrop-filter:blur(10px);background:color-mix(in srgb, var(--paper) 82%, transparent);border-bottom:1px solid var(--line)}
.mm-landing .nav .wrap{display:flex;align-items:center;justify-content:space-between;padding-top:16px;padding-bottom:16px}
.mm-landing .navmark{display:flex;align-items:center}
.mm-landing .navlinks{display:flex;align-items:center;gap:22px;font-size:13px;font-weight:600;color:var(--ink-soft)}
.mm-landing .navlinks a{text-decoration:none;transition:color .2s ease}
.mm-landing .navlinks a:hover{color:var(--ink)}
@media(max-width:760px){.mm-landing .navlinks a:not(.btn){display:none}}

.mm-landing .btn{display:inline-flex;align-items:center;gap:8px;border-radius:11px;padding:12px 20px;font-size:13px;font-weight:800;text-decoration:none;border:1px solid transparent;cursor:pointer;font-family:var(--sans);transition:background .2s ease,color .2s ease,border-color .2s ease,transform .2s ease,box-shadow .2s ease}
.mm-landing .btn:disabled{opacity:.6;cursor:not-allowed}
.mm-landing .btn-primary{background:var(--ink);color:#fff;box-shadow:var(--shadow)}
.mm-landing .btn-primary:hover:not(:disabled){background:var(--blue);color:#fff;transform:translateY(-2px);box-shadow:0 16px 30px -12px rgba(76,110,245,.55)}
.mm-landing .btn-ghost{border-color:var(--line);color:var(--ink)}
.mm-landing .btn-ghost:hover:not(:disabled){border-color:var(--blue);color:var(--blue);transform:translateY(-2px)}
.mm-landing .btn-small{padding:9px 14px;font-size:12px;border-radius:9px}

.mm-landing .hero{padding:76px 0 40px}
.mm-landing .hero .wrap{display:grid;grid-template-columns:1.05fr 0.95fr;gap:56px;align-items:center}
@media(max-width:900px){.mm-landing .hero .wrap{grid-template-columns:1fr}}
.mm-landing .hero h1{font-size:clamp(34px,4.6vw,58px);line-height:1.02}
.mm-landing .hero .sub{margin-top:20px;font-size:16px;line-height:1.65;color:var(--ink-soft);max-width:480px}
.mm-landing .hero .ctas{margin-top:30px;display:flex;gap:12px;flex-wrap:wrap}
.mm-landing .hero .fine{margin-top:16px;font-size:11.5px;color:var(--muted)}
.mm-landing .hero-annotation{margin-top:22px;display:flex;align-items:center;gap:10px;color:var(--blue)}
.mm-landing .hero-annotation svg{width:64px;height:auto;flex:none;transform:rotate(-4deg)}
.mm-landing .hero-annotation svg path{stroke-dasharray:140;stroke-dashoffset:140;animation:mmDrawArrow 1s .9s cubic-bezier(.16,.84,.44,1) forwards}
.mm-landing .hero-annotation span{font-family:var(--hand);font-size:19px;font-weight:700;color:var(--ink);transform:rotate(-1.5deg)}
@keyframes mmDrawArrow{to{stroke-dashoffset:0}}
@media(max-width:900px){.mm-landing .hero-annotation{display:none}}

.mm-landing .demo{background:var(--raised);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);overflow:hidden;animation:mmDemoIn .8s cubic-bezier(.16,.84,.44,1) both}
@keyframes mmDemoIn{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}
.mm-landing .demo-top{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line)}
.mm-landing .demo-top .label{font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted)}
.mm-landing .pill{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:99px;font-size:10px;font-weight:800}
.mm-landing .pill-submitted{background:var(--blue-tint);color:#3B5BDB;animation:mmPulse 2.4s ease-in-out infinite}
@keyframes mmPulse{0%,100%{box-shadow:0 0 0 0 rgba(59,91,219,.35)}50%{box-shadow:0 0 0 5px rgba(59,91,219,0)}}
.mm-landing .pill-review{background:var(--violet-tint);color:#6D3FD1}
.mm-landing .pill-setup{background:var(--amber-tint);color:var(--amber)}
.mm-landing .pill-live{background:var(--green-tint);color:var(--green)}
.mm-landing .demo-body{padding:22px 20px 20px}
.mm-landing .demo-field-label{font-size:10.5px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);display:flex;justify-content:space-between}
.mm-landing .note-box{margin-top:9px;border:1px solid var(--line);border-radius:12px;padding:14px 15px;font-size:13.5px;line-height:1.6;background:var(--paper);min-height:78px}
.mm-landing .note-box .mm-caret{display:inline-block;width:2px;height:15px;background:var(--blue);vertical-align:-2px;animation:mmBlink 1s step-end infinite}
@keyframes mmBlink{50%{opacity:0}}
.mm-landing .tokens{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap}
.mm-landing .token{font-family:var(--mono);font-size:10.5px;padding:4px 8px;border-radius:7px;background:var(--blue-tint);color:#3B5BDB}
.mm-landing .stepper-mini{margin-top:20px;display:flex;align-items:center}
.mm-landing .stepper-mini .node{width:8px;height:8px;border-radius:50%;background:var(--line);transition:background .3s ease}
.mm-landing .stepper-mini .node.on{background:var(--blue)}
.mm-landing .stepper-mini .seg{flex:1;height:1px;background:var(--line);margin:0 5px}
.mm-landing .stepper-mini.labels{display:flex;justify-content:space-between;margin-top:8px;font-size:9px;color:var(--muted);font-weight:700}

.mm-landing .stats-strip{border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.mm-landing .stats-strip .wrap{display:grid;grid-template-columns:repeat(3,1fr);padding:0}
.mm-landing .stat{padding:34px 28px;border-right:1px solid var(--line)}
.mm-landing .stat:last-child{border-right:0}
.mm-landing .stat strong{display:block;font-family:var(--serif);font-size:32px;font-weight:560}
.mm-landing .stat span{display:block;margin-top:6px;font-size:12.5px;color:var(--muted);line-height:1.5}
@media(max-width:760px){.mm-landing .stats-strip .wrap{grid-template-columns:1fr}.mm-landing .stat{border-right:0;border-bottom:1px solid var(--line);padding:24px 4px}.mm-landing .stat:last-child{border-bottom:0}}

.mm-landing .section-head{max-width:600px;margin-bottom:48px}
.mm-landing .section-head h2{font-size:clamp(26px,3.2vw,38px)}
.mm-landing .section-head p{margin-top:14px;font-size:14.5px;color:var(--ink-soft);line-height:1.65}

.mm-landing .flow{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:var(--raised)}
@media(max-width:900px){.mm-landing .flow{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.mm-landing .flow{grid-template-columns:1fr}}
.mm-landing .flow-step{padding:26px 24px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);position:relative}
.mm-landing .flow-step:nth-child(4){border-right:0}
@media(max-width:900px){.mm-landing .flow-step:nth-child(2){border-right:0}.mm-landing .flow-step:nth-child(4){border-right:1px solid var(--line)}}
@media(max-width:560px){.mm-landing .flow-step{border-right:0!important}}
.mm-landing .flow-step .stage{display:inline-block;margin-bottom:14px;transition:transform .2s ease}
.mm-landing .flow-step:hover .stage{transform:scale(1.06)}
.mm-landing .flow-step h3{font-size:16.5px;font-weight:650;margin-bottom:8px}
.mm-landing .flow-step p{font-size:12.5px;color:var(--ink-soft);line-height:1.6}

.mm-landing .compare-wrap{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media(max-width:760px){.mm-landing .compare-wrap{grid-template-columns:1fr}}
.mm-landing .compare-col{border:1px solid var(--line);border-radius:18px;padding:30px 28px}
.mm-landing .compare-bad{background:var(--paper)}
.mm-landing .compare-good{background:var(--raised);box-shadow:var(--shadow);border-color:var(--blue)}
.mm-landing .compare-label{display:inline-block;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:18px}
.mm-landing .compare-good .compare-label{color:var(--blue)}
.mm-landing .compare-col ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:16px}
.mm-landing .compare-col li{display:flex;gap:12px;font-size:13.5px;line-height:1.6;color:var(--ink-soft)}
.mm-landing .compare-mark{flex:none;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:800;margin-top:1px}
.mm-landing .compare-bad .compare-mark{background:#FBEAEA;color:#C0392B}
.mm-landing .compare-good .compare-mark{background:var(--green-tint);color:var(--green)}

.mm-landing .feature-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:18px;overflow:hidden}
@media(max-width:900px){.mm-landing .feature-grid{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.mm-landing .feature-grid{grid-template-columns:1fr}}
.mm-landing .feature{background:var(--raised);padding:28px 26px;transition:background .25s ease}
.mm-landing .feature:hover{background:color-mix(in srgb, var(--raised) 92%, var(--blue))}
.mm-landing .feature .icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;margin-bottom:16px;font-size:15px;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.mm-landing .feature:hover .icon{transform:scale(1.12) rotate(-4deg)}
.mm-landing .feature h3{font-size:15px;font-weight:700;margin-bottom:8px}
.mm-landing .feature p{font-size:12.5px;color:var(--ink-soft);line-height:1.6}

.mm-landing .csv-wrap{display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:center}
@media(max-width:900px){.mm-landing .csv-wrap{grid-template-columns:1fr}}
.mm-landing .csv-card{background:var(--raised);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
.mm-landing .csv-head{display:flex;align-items:center;gap:8px;padding:14px 18px;border-bottom:1px solid var(--line);font-size:11px;font-weight:800;color:var(--muted);letter-spacing:0.05em;text-transform:uppercase}
.mm-landing .csv-table{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:11px}
.mm-landing .csv-table th{text-align:left;padding:10px 12px;background:var(--blue-tint);color:#3B5BDB;font-weight:600;white-space:nowrap;transition:background .35s ease,color .35s ease}
.mm-landing .csv-table th.mm-mapping{background:#3B5BDB;color:#fff}
.mm-landing .csv-map span:first-child,.mm-landing .csv-map span:nth-child(3){display:inline-block;min-width:74px;transition:opacity .2s ease}
.mm-landing .csv-table td{padding:9px 12px;border-top:1px solid var(--line);color:var(--ink-soft);white-space:nowrap}
.mm-landing .csv-table-scroll{overflow-x:auto}
.mm-landing .csv-map{padding:14px 18px;display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--ink-soft);border-top:1px solid var(--line);background:var(--paper)}
.mm-landing .csv-map .arrow{color:var(--blue);font-weight:800;display:inline-block;animation:mmArrow 1.6s ease-in-out infinite}
@keyframes mmArrow{0%,100%{transform:translateX(0)}50%{transform:translateX(4px)}}

.mm-landing .metrics-card{background:var(--raised);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);overflow:hidden}
.mm-landing .metrics-head{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid var(--line)}
.mm-landing .metrics-head strong{font-family:var(--serif);font-size:18px;font-weight:600}
.mm-landing .metrics-head span{display:block;font-size:11.5px;color:var(--muted);margin-top:3px}
.mm-landing .metrics-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line)}
@media(max-width:700px){.mm-landing .metrics-grid{grid-template-columns:1fr 1fr}}
.mm-landing .metric-tile{background:var(--raised);padding:22px 20px}
.mm-landing .metric-tile span{display:block;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em}
.mm-landing .metric-tile strong{display:block;margin-top:8px;font-family:var(--serif);font-size:26px;font-weight:560;font-variant-numeric:tabular-nums}
.mm-landing .metrics-foot{padding:14px 24px;font-size:11px;color:var(--muted);border-top:1px solid var(--line)}

.mm-landing .faq{max-width:760px}
.mm-landing .faq-item{border-top:1px solid var(--line);padding:22px 0}
.mm-landing .faq-item:last-child{border-bottom:1px solid var(--line)}
.mm-landing .faq-item summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:20px;font-size:15px;font-weight:650;font-family:var(--serif)}
.mm-landing .faq-item summary::-webkit-details-marker{display:none}
.mm-landing .faq-item summary .plus{flex:none;width:22px;height:22px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;font-size:13px;color:var(--muted);transition:transform .3s cubic-bezier(.34,1.56,.64,1),color .2s ease,border-color .2s ease}
.mm-landing .faq-item[open] summary .plus{transform:rotate(45deg);color:var(--blue);border-color:var(--blue)}
.mm-landing .faq-item p{margin-top:12px;font-size:13.5px;line-height:1.65;color:var(--ink-soft);animation:mmFadeIn .35s ease both}
@keyframes mmFadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}

.mm-landing .cta-band{background:var(--band-bg);color:var(--band-fg);border:1px solid var(--line);border-radius:24px;padding:60px 52px;position:relative;overflow:hidden;box-shadow:var(--shadow)}
.mm-landing .cta-band:before{content:"";position:absolute;width:420px;height:420px;border-radius:50%;right:-160px;top:-160px;background:radial-gradient(circle,rgba(76,110,245,0.22),transparent 70%);animation:mmDrift1 9s ease-in-out infinite}
.mm-landing .cta-band:after{content:"";position:absolute;width:340px;height:340px;border-radius:50%;left:-140px;bottom:-160px;background:radial-gradient(circle,rgba(139,92,246,0.18),transparent 70%);animation:mmDrift2 11s ease-in-out infinite}
@keyframes mmDrift1{0%,100%{transform:translate(0,0)}50%{transform:translate(-14px,10px)}}
@keyframes mmDrift2{0%,100%{transform:translate(0,0)}50%{transform:translate(12px,-10px)}}
.mm-landing .cta-inner{position:relative;z-index:1;max-width:560px}
.mm-landing .cta-band h2{font-size:clamp(26px,3.4vw,36px);color:var(--band-fg)}
.mm-landing .cta-band p{margin-top:14px;font-size:14px;color:var(--band-muted);line-height:1.65}
.mm-landing .cta-band .ctas{margin-top:28px;display:flex;gap:12px;flex-wrap:wrap}
.mm-landing .cta-band .btn-primary{background:linear-gradient(135deg,#4C6EF5,#8B5CF6);color:#fff;box-shadow:0 14px 30px -8px rgba(76,110,245,0.5)}
.mm-landing .cta-band .btn-ghost{border-color:var(--line);color:var(--band-fg)}
.mm-landing .cta-band .btn-ghost:hover:not(:disabled){border-color:var(--blue);color:var(--blue)}

.mm-landing footer{padding:48px 0 60px}
.mm-landing .foot-wrap{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap;padding-top:32px;border-top:1px solid var(--line)}
.mm-landing .foot-brand{font-family:var(--serif);font-size:15px;font-weight:600}
.mm-landing .foot-tag{margin-top:6px;font-size:12px;color:var(--muted);max-width:320px;line-height:1.6}
.mm-landing .foot-links{display:flex;align-items:center;gap:22px;font-size:12px;color:var(--muted)}
.mm-landing .foot-links a,.mm-landing .foot-links button{text-decoration:none;transition:color .2s ease}
.mm-landing .foot-links a:hover,.mm-landing .foot-links button:hover{color:var(--ink)}
.mm-landing .foot-links button{font-size:12px}
.mm-landing .foot-copy{font-size:11px;color:var(--muted);margin-top:20px}

@media (prefers-reduced-motion: reduce){
  .mm-landing *{animation:none!important;transition:none!important}
}
`;
