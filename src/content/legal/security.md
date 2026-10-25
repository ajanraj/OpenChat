**Last Updated:** September 9, 2025

At OS Chat, we take security seriously. This policy outlines how we protect your data and maintain the security of our AI application.

### 1. Data Protection

**Encryption:**

- **API Keys:** Encrypted using AES-GCM 256-bit encryption with PBKDF2 key derivation (100,000 iterations)
- **Data in Transit:** All communications use HTTPS/TLS encryption
- **User Isolation:** User-specific encryption keys ensure data isolation

**Access Controls:**

- Authentication via Google OAuth through Convex Auth
- Users can only access their own data
- Server-side validation for all data access requests
- Rate limiting: 5 messages/day anonymous, 20 messages/day authenticated
- Session management with automatic expiration

### 2. Infrastructure Security

**Technology Stack:**

- **Convex Backend:** Managed serverless backend with built-in security features
- **TanStack Start:** Modern framework with security best practices
- **TypeScript:** Type-safe development to reduce bugs
- **Vercel Hosting:** Secure hosting with DDoS protection

**Application Security:**

- Input validation and sanitization
- Protection against common web vulnerabilities (XSS, CSRF)
- Secure session management
- Environment variables for sensitive configuration

### 3. Third-Party Services

**AI Providers:**

- We use established AI providers (OpenAI, Anthropic, Google, etc.)
- API calls are made over encrypted connections
- Only necessary message data is sent to AI providers
- API keys are encrypted and stored securely

**Other Services:**

- **Convex:** Database and backend infrastructure
- **Vercel:** Hosting and analytics
- **Stripe:** Payment processing via Stripe Managed Payments (PCI compliant)
- We don't store payment card information

### 4. Data Storage and Retention

**What We Store:**

- Account information (name, email from Google OAuth)
- Chat messages and conversation history
- Encrypted API keys (if provided)
- User preferences and settings

**Data Deletion:**

- Users can delete their chat history at any time
- Account deletion removes all associated data
- We retain data only as long as necessary for service functionality

### 5. Security Practices

- Regular updates of dependencies and frameworks
- Code reviews for security-sensitive changes
- Monitoring for known vulnerabilities in dependencies
- Following security best practices for web applications
- Using environment variables for sensitive configuration

### 6. Incident Response

If a security incident occurs:

1. We'll investigate the issue promptly
2. Take steps to contain and fix the problem
3. Notify affected users if their data was compromised
4. Work to prevent similar incidents in the future

### 7. Your Security Responsibilities

You can help keep your account secure by:

- Keeping your Google account secure
- Not sharing your API keys with others
- Logging out when using shared devices
- Reporting any suspicious activity to us

### 8. Reporting Security Issues

If you discover a security vulnerability:

- Please report it to: [support@oschat.ai](mailto:support@oschat.ai)
- Include details about the issue and how to reproduce it
- Allow us reasonable time to investigate and fix the issue
- Please don't publicly disclose the issue until we've had a chance to address it

### 9. Updates to This Policy

We may update this security policy as our practices evolve. Check back periodically for updates. The "Last Updated" date shows when we last made changes.

### 10. Contact Us

For security questions or concerns:

**Email:** [support@oschat.ai](mailto:support@oschat.ai)\
**Website:** [https://oschat.ai](https://oschat.ai)
