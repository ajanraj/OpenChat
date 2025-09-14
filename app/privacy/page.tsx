import type { Metadata } from "next";
import { LegalHeader } from "@/app/components/layout/legal/legal-header";

export const metadata: Metadata = {
  title: "Privacy Policy - OS Chat",
  description:
    "OS Chat Privacy Policy - How we collect, use, and protect your personal information",
};

export default function PrivacyPage() {
  return (
    <div>
      <LegalHeader />
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="prose dark:prose-invert prose-headings:mt-8 prose-headings:mb-4 prose-ol:mb-6 prose-p:mb-4 prose-ul:mb-6 max-w-none">
          <h1>Privacy Policy</h1>

          <p>
            <strong>Last Updated:</strong> September 9, 2025
            <br />
            <strong>Effective Date:</strong> September 9, 2025
          </p>

          <p>
            At OS Chat, we're committed to protecting your privacy. This policy
            explains how we collect, use, and protect your information when you
            use our AI application.
          </p>

          <p>
            <strong>Important:</strong> You're interacting with AI systems that
            process your messages to generate responses. While we strive for
            accuracy, AI content may not always be correct.
          </p>

          <h3>1. Information We Collect</h3>

          <p>
            <strong>When you create an account:</strong>
          </p>
          <ul>
            <li>Name, email address, and profile image (via Google OAuth)</li>
            <li>
              Optional profile information like occupation and preferences
            </li>
            <li>Your AI model preferences and settings</li>
          </ul>

          <p>
            <strong>When you use OS Chat:</strong>
          </p>
          <ul>
            <li>Your chat messages and any files you upload</li>
            <li>
              API keys you provide (encrypted with AES-GCM 256-bit encryption)
            </li>
            <li>Usage statistics like message counts and model usage</li>
            <li>Technical information like browser type and IP address</li>
          </ul>

          <p>
            <strong>Analytics data:</strong>
          </p>
          <ul>
            <li>
              We use Vercel Analytics, Umami, and PostHog (EU servers) for
              service improvement
            </li>
            <li>Personal identifiers are removed from analytics data</li>
          </ul>

          <h3>2. How We Use Your Information</h3>
          <ul>
            <li>
              <strong>Provide AI services:</strong> Process your messages
              through AI models
            </li>
            <li>
              <strong>Account management:</strong> Create and manage your
              account and preferences
            </li>
            <li>
              <strong>Rate limiting:</strong> Enforce usage limits (5/day
              anonymous, 20/day registered)
            </li>
            <li>
              <strong>Customer support:</strong> Respond to your questions and
              provide help
            </li>
            <li>
              <strong>Service improvement:</strong> Analyze usage patterns to
              improve our service
            </li>
            <li>
              <strong>Legal compliance:</strong> Comply with applicable laws and
              regulations
            </li>
          </ul>

          <h3>3. Information Sharing</h3>

          <p>
            <strong>AI Providers:</strong> Your messages are processed by
            third-party AI services including:
          </p>
          <ul>
            <li>
              OpenAI, Anthropic, Google, Mistral, xAI, Together AI, Meta, and
              others
            </li>
            <li>
              These providers may be located outside your country, including in
              the US
            </li>
          </ul>

          <p>
            <strong>Other Third Parties:</strong>
          </p>
          <ul>
            <li>
              <strong>Analytics:</strong> Vercel Analytics, Umami, PostHog (EU
              servers)
            </li>
            <li>
              <strong>Search:</strong> Exa, Tavily, Brave Search for enhanced AI
              responses
            </li>
            <li>
              <strong>Authentication:</strong> Convex Auth for secure login
            </li>
            <li>
              <strong>Payments:</strong> Polar for subscription billing
            </li>
            <li>
              <strong>Infrastructure:</strong> Convex for backend services
            </li>
          </ul>

          <p>
            <strong>Legal Requirements:</strong>
          </p>
          <p>
            We may disclose information if required by law or to protect our
            rights and users' safety.
          </p>

          <h3>4. Data Security</h3>
          <ul>
            <li>
              <strong>Encryption:</strong> API keys encrypted with AES-GCM
              256-bit encryption
            </li>
            <li>
              <strong>Secure transmission:</strong> All communications use TLS
              1.3 encryption
            </li>
            <li>
              <strong>Access controls:</strong> Server-side authentication and
              authorization
            </li>
            <li>
              <strong>Rate limiting:</strong> Protection against abuse and
              unauthorized access
            </li>
          </ul>

          <h3>5. Data Retention</h3>
          <ul>
            <li>
              <strong>Account information:</strong> Until you delete your
              account
            </li>
            <li>
              <strong>Chat messages:</strong> Retained for service
              functionality; you can delete chats
            </li>
            <li>
              <strong>Analytics data:</strong> Aggregated data kept up to 3
              years
            </li>
            <li>
              <strong>Legal records:</strong> As required by law
            </li>
          </ul>

          <h3>6. Your Rights</h3>

          <p>
            <strong>General Rights:</strong>
          </p>
          <ul>
            <li>
              <strong>Access:</strong> Request information about your data
            </li>
            <li>
              <strong>Correction:</strong> Fix inaccurate information
            </li>
            <li>
              <strong>Deletion:</strong> Request deletion of your data
            </li>
            <li>
              <strong>Portability:</strong> Receive your data in
              machine-readable format
            </li>
          </ul>

          <p>
            <strong>California Residents (CCPA):</strong>
          </p>
          <ul>
            <li>
              Right to know what personal information is collected and shared
            </li>
            <li>Right to delete personal information</li>
            <li>Right to opt-out of sale/sharing (we don't sell your data)</li>
            <li>Right to non-discrimination for exercising your rights</li>
          </ul>

          <p>
            <strong>EU Residents (GDPR):</strong>
          </p>
          <ul>
            <li>Right not to be subject to automated decision-making</li>
            <li>Right to human review of automated decisions</li>
            <li>Right to lodge complaints with supervisory authorities</li>
          </ul>

          <h3>7. Automated Decision-Making</h3>
          <p>
            Our AI systems automatically generate responses and may flag
            inappropriate content. You can request human review of automated
            decisions by contacting us at{" "}
            <a href="mailto:support@oschat.ai">support@oschat.ai</a>.
          </p>

          <h3>8. International Transfers</h3>
          <p>
            Your data may be transferred to countries outside your jurisdiction,
            including the US. We ensure appropriate safeguards are in place for
            these transfers.
          </p>

          <h3>9. Data Breach Notification</h3>
          <p>
            If a data breach affects your information, we'll notify relevant
            authorities within 72 hours (where required) and inform affected
            users without undue delay when there's high risk.
          </p>

          <h3>10. Children</h3>
          <p>
            Our Site and the Services are not intended for children under 13
            years of age, and you must be at least 13 years old to have our
            permission to use OS Chat. We do not knowingly collect, use, or
            disclose personally identifiable information from children under 13.
            If you believe that we have collected, used, or disclosed personally
            identifiable information of a child under the age of 13, please
            contact us using the contact information below so that we can take
            appropriate action.
          </p>

          <h3>11. Cookies and Tracking</h3>
          <p>We use cookies for:</p>
          <ul>
            <li>Authentication and session management</li>
            <li>User preferences and settings</li>
            <li>Analytics and performance monitoring</li>
            <li>Security and fraud prevention</li>
          </ul>
          <p>You can control cookies through your browser settings.</p>

          <h3>12. Do Not Track</h3>
          <p>
            We currently do not support the Do Not Track browser setting or
            respond to Do Not Track signals. Do Not Track (or DNT) is a
            preference you can set in your browser to let the websites you visit
            know that you do not want them collecting certain information about
            you. For more details about Do Not Track, including how to enable or
            disable this preference, visit{" "}
            <a href="https://www.allaboutdnt.com/">
              https://www.allaboutdnt.com
            </a>
            .
          </p>

          <h3>13. Updates to This Privacy Policy</h3>
          <p>
            We reserve the right to change this Privacy Policy at any time. If
            we make any material changes to this Privacy Policy, we will post
            the revised version to our website and update the "Effective Date"
            at the top of this Privacy Policy. Except as otherwise indicated,
            any changes will become effective when we post the revised Privacy
            Policy on our website.
          </p>

          <h3>14. Contact Us</h3>
          <p>Questions about privacy? Contact us:</p>
          <p>
            <strong>Email:</strong>{" "}
            <a href="mailto:support@oschat.ai">support@oschat.ai</a>
            <br />
            <strong>Website:</strong>{" "}
            <a href="https://oschat.ai">https://oschat.ai</a>
          </p>

          <p>
            <strong>California residents:</strong> You may also contact the
            California Attorney General at{" "}
            <a href="https://oag.ca.gov/contact/consumer-complaint-against-business-or-company">
              oag.ca.gov/contact/consumer-complaint-against-business-or-company
            </a>
          </p>

          <p>
            <strong>EU residents:</strong> You can lodge complaints with
            supervisory authorities in your jurisdiction.
          </p>
        </div>
      </div>
    </div>
  );
}
