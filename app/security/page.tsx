import type { Metadata } from "next";
import { LegalHeader } from "@/app/components/layout/legal/legal-header";

export const metadata: Metadata = {
  title: "Security Policy - OS Chat",
  description:
    "OS Chat Security Policy - Our commitment to protecting your data and ensuring secure AI interactions",
};

export default function SecurityPage() {
  return (
    <div>
      <LegalHeader />
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="prose dark:prose-invert prose-headings:mt-8 prose-headings:mb-4 prose-ol:mb-6 prose-p:mb-4 prose-ul:mb-6 max-w-none">
          <h1>Security Policy</h1>

          <p>
            <strong>Last Updated:</strong> September 9, 2025
          </p>

          <p>
            At OS Chat, we take security seriously. This policy outlines how we
            protect your data and maintain the security of our AI application.
          </p>

          <h3>1. Data Protection</h3>

          <p>
            <strong>Encryption:</strong>
          </p>
          <ul>
            <li>
              <strong>API Keys:</strong> Encrypted using AES-GCM 256-bit
              encryption with PBKDF2 key derivation (100,000 iterations)
            </li>
            <li>
              <strong>Data in Transit:</strong> All communications use HTTPS/TLS
              encryption
            </li>
            <li>
              <strong>User Isolation:</strong> User-specific encryption keys
              ensure data isolation
            </li>
          </ul>

          <p>
            <strong>Access Controls:</strong>
          </p>
          <ul>
            <li>Authentication via Google OAuth through Convex Auth</li>
            <li>Users can only access their own data</li>
            <li>Server-side validation for all data access requests</li>
            <li>
              Rate limiting: 5 messages/day anonymous, 20 messages/day
              authenticated
            </li>
            <li>Session management with automatic expiration</li>
          </ul>

          <h3>2. Infrastructure Security</h3>

          <p>
            <strong>Technology Stack:</strong>
          </p>
          <ul>
            <li>
              <strong>Convex Backend:</strong> Managed serverless backend with
              built-in security features
            </li>
            <li>
              <strong>Next.js 15:</strong> Modern framework with security best
              practices
            </li>
            <li>
              <strong>TypeScript:</strong> Type-safe development to reduce bugs
            </li>
            <li>
              <strong>Vercel Hosting:</strong> Secure hosting with DDoS
              protection
            </li>
          </ul>

          <p>
            <strong>Application Security:</strong>
          </p>
          <ul>
            <li>Input validation and sanitization</li>
            <li>Protection against common web vulnerabilities (XSS, CSRF)</li>
            <li>Secure session management</li>
            <li>Environment variables for sensitive configuration</li>
          </ul>

          <h3>3. Third-Party Services</h3>

          <p>
            <strong>AI Providers:</strong>
          </p>
          <ul>
            <li>
              We use established AI providers (OpenAI, Anthropic, Google, etc.)
            </li>
            <li>API calls are made over encrypted connections</li>
            <li>Only necessary message data is sent to AI providers</li>
            <li>API keys are encrypted and stored securely</li>
          </ul>

          <p>
            <strong>Other Services:</strong>
          </p>
          <ul>
            <li>
              <strong>Convex:</strong> Database and backend infrastructure
            </li>
            <li>
              <strong>Vercel:</strong> Hosting and analytics
            </li>
            <li>
              <strong>Polar:</strong> Payment processing (PCI compliant)
            </li>
            <li>We don't store payment card information</li>
          </ul>

          <h3>4. Data Storage and Retention</h3>

          <p>
            <strong>What We Store:</strong>
          </p>
          <ul>
            <li>Account information (name, email from Google OAuth)</li>
            <li>Chat messages and conversation history</li>
            <li>Encrypted API keys (if provided)</li>
            <li>User preferences and settings</li>
          </ul>

          <p>
            <strong>Data Deletion:</strong>
          </p>
          <ul>
            <li>Users can delete their chat history at any time</li>
            <li>Account deletion removes all associated data</li>
            <li>
              We retain data only as long as necessary for service functionality
            </li>
          </ul>

          <h3>5. Security Practices</h3>

          <ul>
            <li>Regular updates of dependencies and frameworks</li>
            <li>Code reviews for security-sensitive changes</li>
            <li>Monitoring for known vulnerabilities in dependencies</li>
            <li>Following security best practices for web applications</li>
            <li>Using environment variables for sensitive configuration</li>
          </ul>

          <h3>6. Incident Response</h3>

          <p>If a security incident occurs:</p>
          <ol>
            <li>We'll investigate the issue promptly</li>
            <li>Take steps to contain and fix the problem</li>
            <li>Notify affected users if their data was compromised</li>
            <li>Work to prevent similar incidents in the future</li>
          </ol>

          <h3>7. Your Security Responsibilities</h3>

          <p>You can help keep your account secure by:</p>
          <ul>
            <li>Keeping your Google account secure</li>
            <li>Not sharing your API keys with others</li>
            <li>Logging out when using shared devices</li>
            <li>Reporting any suspicious activity to us</li>
          </ul>

          <h3>8. Reporting Security Issues</h3>

          <p>If you discover a security vulnerability:</p>
          <ul>
            <li>
              Please report it to:{" "}
              <a href="mailto:support@oschat.ai">support@oschat.ai</a>
            </li>
            <li>Include details about the issue and how to reproduce it</li>
            <li>Allow us reasonable time to investigate and fix the issue</li>
            <li>
              Please don't publicly disclose the issue until we've had a chance
              to address it
            </li>
          </ul>

          <h3>9. Updates to This Policy</h3>

          <p>
            We may update this security policy as our practices evolve. Check
            back periodically for updates. The "Last Updated" date shows when we
            last made changes.
          </p>

          <h3>10. Contact Us</h3>

          <p>For security questions or concerns:</p>
          <p>
            <strong>Email:</strong>{" "}
            <a href="mailto:support@oschat.ai">support@oschat.ai</a>
            <br />
            <strong>Website:</strong>{" "}
            <a href="https://oschat.ai">https://oschat.ai</a>
          </p>
        </div>
      </div>
    </div>
  );
}
