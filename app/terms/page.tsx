import type { Metadata } from "next";
import { LegalHeader } from "@/app/components/layout/legal/legal-header";

export const metadata: Metadata = {
  title: "Terms of Service - OS Chat",
  description:
    "OS Chat Terms of Service - Legal terms and conditions for using our AI application",
};

export default function TermsPage() {
  return (
    <div>
      <LegalHeader />
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="prose dark:prose-invert prose-headings:mt-8 prose-headings:mb-4 prose-ol:mb-6 prose-p:mb-4 prose-ul:mb-6 max-w-none">
          <h1>Terms of Service</h1>

          <p>
            <strong>Last Updated:</strong> September 9, 2025
          </p>

          <h3>1. Introduction</h3>
          <p>
            Welcome to OS Chat! These Terms of Service govern your use of our AI
            application and related services. By using OS Chat, you agree to
            these terms. If you don't agree, please don't use our services.
          </p>
          <p>
            <strong>AI Service Notice:</strong> You're interacting with AI
            systems that generate responses. AI-generated content may contain
            inaccuracies and should not be relied upon for critical decisions
            without verification.
          </p>

          <h3>2. Eligibility</h3>
          <p>
            You must be at least 13 years old to use OS Chat. If you're between
            13-18, you need parental consent. We don't knowingly collect
            information from children under 13.
          </p>

          <h3>3. Your Account</h3>
          <ul>
            <li>
              You can use OS Chat anonymously or create an account through
              Google OAuth
            </li>
            <li>
              Keep your account secure and notify us of any unauthorized access
            </li>
            <li>You're responsible for all activity under your account</li>
            <li>Provide accurate information and keep it updated</li>
          </ul>

          <h3>4. Acceptable Use</h3>
          <p>
            <strong>You may use OS Chat for:</strong>
          </p>
          <ul>
            <li>
              Personal, educational, and professional communication with AI
            </li>
            <li>Creative writing and content generation</li>
            <li>Research and learning</li>
            <li>Business and productivity applications</li>
          </ul>

          <p>
            <strong>You may NOT use OS Chat for:</strong>
          </p>
          <ul>
            <li>Illegal activities or violating laws</li>
            <li>Generating harmful, offensive, or inappropriate content</li>
            <li>Attempting to hack or breach our security</li>
            <li>Excessive use that impacts other users</li>
            <li>Spreading misinformation or impersonating others</li>
            <li>Infringing on intellectual property rights</li>
          </ul>

          <h3>5. Usage Limits</h3>
          <p>To ensure fair access for everyone:</p>
          <ul>
            <li>
              <strong>Anonymous users:</strong> 5 messages per day
            </li>
            <li>
              <strong>Registered users:</strong> 20 messages per day
            </li>
            <li>
              <strong>Premium users:</strong> Enhanced limits based on
              subscription
            </li>
          </ul>

          <h3>6. Your Content</h3>
          <ul>
            <li>You own the content you submit to OS Chat</li>
            <li>
              You grant us permission to process your content to provide our
              services
            </li>
            <li>
              AI-generated responses are provided to you but may not be unique
            </li>
            <li>
              You're responsible for ensuring your content complies with these
              terms and applicable laws
            </li>
          </ul>

          <h3>7. AI Limitations</h3>
          <p>Important disclaimers about our AI services:</p>
          <ul>
            <li>
              AI responses may contain errors, biases, or inappropriate content
            </li>
            <li>
              Don't rely on AI for medical, legal, financial, or other
              professional advice
            </li>
            <li>AI outputs don't reflect OS Chat's views or opinions</li>
            <li>We don't guarantee accuracy of AI-generated content</li>
          </ul>

          <h3>8. Third-Party AI Providers</h3>
          <p>
            Your messages may be processed by third-party AI providers including
            OpenAI, Anthropic, Google, Mistral, and others. By using our
            service, you consent to this processing in accordance with our
            Privacy Policy.
          </p>

          <h3>9. Premium Services</h3>
          <ul>
            <li>
              We offer premium subscriptions with enhanced features and higher
              limits
            </li>
            <li>
              Subscription fees are processed through Polar and are
              non-refundable except as required by law
            </li>
            <li>You can cancel your subscription at any time</li>
            <li>
              Cancellation takes effect at the end of your current billing
              period
            </li>
          </ul>

          <h3>10. Privacy</h3>
          <p>
            Your privacy is important to us. Our Privacy Policy explains how we
            collect, use, and protect your information. By using OS Chat, you
            agree to our data practices described in the Privacy Policy.
          </p>

          <h3>11. Termination</h3>
          <p>
            You can stop using OS Chat at any time. We may suspend or terminate
            your access for violating these terms, illegal activity, or extended
            inactivity. Upon termination, your right to use our services ends
            immediately.
          </p>

          <h3>12. Limitation of Liability</h3>
          <p>
            To the maximum extent permitted by law, OS Chat is not liable for
            indirect, incidental, or consequential damages. Our total liability
            for any claims will not exceed the amount you paid us in the twelve
            months before the claim.
          </p>

          <h3>13. Dispute Resolution</h3>
          <p>
            Before pursuing legal action, please contact us at support@oschat.ai
            to resolve disputes informally. These terms are governed by
            applicable law where OS Chat operates.
          </p>

          <h3>14. Changes to Terms</h3>
          <p>
            We may update these terms occasionally. When we make material
            changes, we'll notify you and update the "Last Updated" date. Your
            continued use after changes means you accept the updated terms.
          </p>

          <h3>15. Contact Us</h3>
          <p>Questions about these terms? Contact us:</p>
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
