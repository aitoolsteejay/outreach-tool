import { redirect } from "next/navigation";

// The marketing/sales landing page that used to live here is gone -- this
// app is only ever reached by an existing client or admin, so "/" now sends
// everyone straight to the sign-in form instead of a page meant for
// prospective visitors.
export default function Home() {
  redirect("/login");
}
