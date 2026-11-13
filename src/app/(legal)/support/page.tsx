import type { Metadata } from "next";
import { Prose } from "@/components/ops/prose";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Support" };

export default function SupportPage() {
  return (
    <Prose>
      <h1>Support</h1>
      <p className="lead">Help with {COMPANY.product}, the app for changing, publishing and cleaning up SitecoreAI pages without breaking links.</p>

      <h2>Contact us</h2>
      <p>
        Email <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>. We reply {COMPANY.responseTime}.
      </p>
      <p>To help us answer quickly, include:</p>
      <ul>
        <li>Your SitecoreAI environment and site name.</li>
        <li>Where it happened: the Pages panel, Full screen or Standalone.</li>
        <li>What you did, what you expected and what happened, with a screenshot if you can.</li>
        <li>The result of the setup check (gear icon → Setup check).</li>
      </ul>

      <h2>Before you contact us</h2>
      <h3>Run the setup check</h3>
      <p>
        Open {COMPANY.product}, click the gear icon and choose <strong>Setup check</strong>. It tests everything the app relies on in your environment and says what to fix, for
        example the redirects folder, the Redirect Map template, link search, page content access and live status.
      </p>

      <h3>Redirects don’t appear or can’t be saved</h3>
      <p>
        {COMPANY.product} reads redirect maps from <code>{"{site}"}/Settings/Redirects</code> by default. If yours are elsewhere, set the folder in Settings. If the Redirect
        Map template isn’t found, set its path there too.
      </p>

      <h3>A change isn’t on the live site</h3>
      <p>
        Changes are saved in Sitecore first. Anything not yet published appears under <strong>“not live”</strong> in the top bar (and at the top of the Pages panel). Click{" "}
        <strong>Publish all</strong>. Publishing reaches the live site in a minute or two.
      </p>

      <h3>Undo a change</h3>
      <p>
        Most changes can be undone from the confirmation screen or later from <strong>Activity</strong>, including by a teammate in another browser. Deleted pages wait in{" "}
        <strong>Pages → Bin</strong> until you restore them or delete them for good.
      </p>

      <h3>Live status or screenshots don’t show</h3>
      <p>These come from optional SitecoreAI services. If your environment doesn’t provide them, those details are hidden and everything else keeps working.</p>

      <h3>Search Console for the 404 report</h3>
      <p>
        This is optional. Add your own Google OAuth client ID and Search Console property in Settings. Without it, import the “Not found (404)” CSV that Search Console exports,
        or any CSV of URLs from your logs.
      </p>

      <h2>Permissions</h2>
      <p>
        {COMPANY.product} acts with the signed-in user’s own Sitecore permissions. If someone can’t rename, move, delete or publish a page in SitecoreAI, they can’t do it in{" "}
        {COMPANY.product} either, and the app says why.
      </p>

      <h2>More</h2>
      <ul>
        <li>
          <a href="/privacy">Privacy policy</a>: what data the app uses and where it’s stored.
        </li>
        <li>
          <a href="/terms">Terms of use</a>.
        </li>
      </ul>
    </Prose>
  );
}
