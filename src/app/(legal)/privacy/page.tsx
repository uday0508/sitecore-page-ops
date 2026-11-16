import type { Metadata } from "next";
import { Prose } from "@/components/ops/prose";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <Prose>
      <h1>Privacy policy</h1>
      <p className="lead">
        Effective {COMPANY.effectiveDate}. This policy explains what data {COMPANY.product} uses, where it is kept and who can see it. {COMPANY.product} is published by{" "}
        {COMPANY.name} (“we”).
      </p>

      <h2>The short version</h2>
      <ul>
        <li>{COMPANY.product} runs in your browser inside SitecoreAI. It has no server of its own that stores your data.</li>
        <li>Your content stays in your Sitecore environment. We don’t receive it.</li>
        <li>There is no analytics, tracking or advertising, and no cookies are set by the app.</li>
      </ul>

      <h2>Data the app uses</h2>
      <h3>Your Sitecore content</h3>
      <p>
        The app reads and changes pages, redirect maps and publishing through Sitecore’s APIs, using the signed-in user’s own permissions. This content stays in your Sitecore
        environment and is not sent to us.
      </p>

      <h3>Stored in your Sitecore environment</h3>
      <p>So that teams share one setup and one history, the app keeps the following in your Sitecore environment:</p>
      <ul>
        <li>
          A <strong>Page Operations</strong> folder in each site’s Settings with the app’s settings, an activity history and the list of changes waiting to be published. Activity
          entries contain the name or email of the user who made the change, the page title and URL, and what changed.
        </li>
        <li>
          A <strong>Page Operations Bin</strong> folder holding pages deleted through the app, with a note of where each came from.
        </li>
      </ul>
      <p>Both folders are set to never publish, so they never reach your live site. They stay until you delete them. You control this data like any other content in Sitecore.</p>

      <h3>Stored in the user’s browser</h3>
      <p>
        Local copies of settings and activity, site scan results, imported not-found URLs and the last chosen environment are kept in the browser’s local storage, so the app
        stays fast. They remain until the user clears browser data.
      </p>

      <h3>Google Search Console (optional)</h3>
      <p>
        Only if your organization adds its own Google OAuth client ID. Sign-in happens in the user’s browser with read-only access. Page URLs and click counts go directly from
        Google to the browser and are kept only there. They are never sent to us. Google’s own privacy policy applies to that sign-in.
      </p>

      <h2>AI</h2>
      <p>
        The app uses AI only through Sitecore’s services and only when a user asks: page translation, and the brand voice check if your site has a Sitecore Stream brand kit.
        Those requests are handled by Sitecore under your agreement with Sitecore. We don’t use any other AI provider, and we don’t train AI models on your content.
      </p>

      <h2>Hosting</h2>
      <p>
        The app’s files are served from {COMPANY.hosting}. The host keeps standard web request logs, such as IP address, browser type and time of request, for security and
        operations, according to its own retention policy. These logs don’t contain your Sitecore content.
      </p>

      <h2>Sharing</h2>
      <p>We don’t sell or share personal data. We don’t receive your Sitecore content, so there is none to share.</p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>Delete the Page Operations and Page Operations Bin folders in Sitecore to remove the app’s stored data for a site.</li>
        <li>Clear the browser’s site data to remove local copies.</li>
        <li>Uninstall the app from the Sitecore Cloud Portal at any time.</li>
        <li>
          For questions or requests about personal data, email <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        The app connects only through the Sitecore Marketplace SDK, which handles authentication. It can only be opened inside Sitecore’s own domains. It never asks for or
        stores Sitecore passwords or API keys.
      </p>

      <h2>Changes to this policy</h2>
      <p>If this policy changes, we’ll update this page and the effective date above.</p>
    </Prose>
  );
}
