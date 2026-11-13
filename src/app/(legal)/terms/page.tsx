import type { Metadata } from "next";
import { Prose } from "@/components/ops/prose";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <Prose>
      <h1>Terms of use</h1>
      <p className="lead">
        Effective {COMPANY.effectiveDate}. These terms apply to {COMPANY.product}, published by {COMPANY.name}. By installing or using the app, your organization agrees to
        them.
      </p>

      <h2>1. The app</h2>
      <p>
        {COMPANY.product} is an app for SitecoreAI that helps you change, publish and maintain pages. It runs inside your Sitecore environment and acts with each user’s own
        Sitecore permissions.
      </p>

      <h2>2. Your use</h2>
      <ul>
        <li>Use the app only with Sitecore environments your organization is licensed to use, and in line with your agreement with Sitecore.</li>
        <li>You are responsible for the changes your users make with the app, including publishing them, and for reviewing content before it goes live.</li>
        <li>Don’t attempt to break, overload or reverse engineer the app, or use it to harm anyone.</li>
      </ul>

      <h2>3. Your content and data</h2>
      <p>
        Your content stays yours and stays in your Sitecore environment. We don’t claim any rights to it. How the app handles data is described in the{" "}
        <a href="/privacy">privacy policy</a>.
      </p>

      <h2>4. AI features</h2>
      <p>
        Translation and the brand voice check use Sitecore’s AI services under your agreement with Sitecore. AI output can be wrong. It is always created as a suggestion or a
        draft version for a person to review, and nothing is published automatically.
      </p>

      <h2>5. Third-party services</h2>
      <p>
        The app relies on Sitecore’s platform and, if you choose to connect it, Google Search Console. Their own terms apply, and we aren’t responsible for their availability
        or changes.
      </p>

      <h2>6. Changes and availability</h2>
      <p>
        We may update the app, add or change features, or stop offering it. We aim to keep it available and working but don’t guarantee uninterrupted or error-free operation.
      </p>

      <h2>7. Disclaimer</h2>
      <p>
        The app is provided “as is”. To the extent the law allows, we disclaim all warranties, including fitness for a particular purpose. Most changes can be undone in the app,
        but keep backups and use your normal review and publishing processes.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the extent the law allows, we aren’t liable for indirect, incidental or consequential losses, or for loss of data, revenue or profits, arising from use of the app.
        Our total liability is limited to the amount your organization paid for the app in the 12 months before the claim.
      </p>

      <h2>9. Ending use</h2>
      <p>
        You can stop using the app and uninstall it at any time. We may suspend access if these terms are breached. Data the app stored in your Sitecore environment stays there
        for you to keep or delete.
      </p>

      <h2>10. Law</h2>
      <p>These terms are governed by the laws of {COMPANY.jurisdiction}, and its courts have jurisdiction over any dispute.</p>

      <h2>11. Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>.
      </p>
    </Prose>
  );
}
