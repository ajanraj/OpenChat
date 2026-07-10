# Installation Guide

This guide will help you set up OS Chat for local development or self-hosting.

## Prerequisites

- Bun (required)
- Git
- A Convex account (free tier available)
- API keys for the AI models you want to use

## 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/ajanraj/OpenChat.git
cd OpenChat

# Install dependencies (using Bun - recommended)
bun install
```

## 2. Set up Convex Backend

OS Chat uses [Convex](https://convex.dev) for real-time backend, authentication, and database management.

```bash
# Login to Convex (creates account if needed)
bunx convex login

# Set up a new Convex project (this creates .env with Convex URLs)
bunx convex dev --once
```

This will:

- Create a new Convex project in your dashboard
- Generate a `convex/` directory with your schema
- Create a `.env` file with your Convex deployment URLs

## 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Add the additional variables to your `.env` file:

- AI model API keys (OpenAI, Google, Anthropic, xAI, etc.)
- Analytics keys (PostHog, Umami)
- Search provider keys (Exa, Brave, Tavily)
- Composio API key and auth config IDs
- Upstash Redis credentials (for Composio caching)

> **Note:** Environment variables are validated at runtime using [t3-env](https://env.t3.gg) with Zod schemas. Client-side variables must be prefixed with `VITE_`.

## 4. Set up Convex Configuration

Configure the required and optional Convex environment variables for your application.

### A. Authentication (Required)

OS Chat uses Convex Auth for authentication with Google OAuth.

1. **Initialize Convex Auth:**

   ```bash
   bunx @convex-dev/auth
   ```

2. **Set up Google OAuth:**
   - Follow the [Google OAuth Setup Guide](https://labs.convex.dev/auth/config/oauth/google)
   - Set your Google OAuth credentials in Convex:

   ```bash
   bunx convex env set AUTH_GOOGLE_ID your-google-client-id
   bunx convex env set AUTH_GOOGLE_SECRET your-google-client-secret
   ```

3. **Set Required Environment Variables:**

   ```bash
   # Generate and set API key encryption secret in Convex (REQUIRED)
   bunx convex env set API_KEY_SECRET $(openssl rand -hex 64)

   # Set site URL for development
   bunx convex env set SITE_URL http://localhost:3000
   ```

### B. Cloudflare R2 Storage (Required for file uploads)

OS Chat uses Cloudflare R2 for file attachments and image storage.

1. **Create a Public Cloudflare R2 Bucket:**
   - Sign up for a [Cloudflare account](https://dash.cloudflare.com/sign-up)
   - Navigate to R2 Object Storage in your dashboard
   - Create a new bucket (e.g., `oschat-files`)
   - **Important**: Configure the bucket for public access:
     - Go to Settings > Public Access
     - Enable "Allow public access"
     - Set up a custom domain or use the R2.dev subdomain
   - Configure CORS to allow GET and PUT requests from your domain

2. **Generate R2 API Credentials:**
   - Go to R2 > Manage R2 API tokens
   - Create a new API token with Object Read & Write permissions
   - Save the Access Key ID and Secret Access Key

3. **Set R2 Environment Variables in Convex:**

   ```bash
   bunx convex env set R2_BUCKET your-bucket-name
   bunx convex env set R2_TOKEN your-r2-api-token
   bunx convex env set R2_ACCESS_KEY_ID your-access-key-id
   bunx convex env set R2_SECRET_ACCESS_KEY your-secret-access-key
   bunx convex env set R2_ENDPOINT https://your-account-id.r2.cloudflarestorage.com
   bunx convex env set R2_PUBLIC_URL_BASE https://your-bucket.your-domain.com/
   ```

### C. Composio Integration (Optional - for service connectors)

Set up [Composio](https://composio.dev) to enable Gmail, Calendar, Notion, GitHub, and other integrations.

1. **Get your Composio API key** from the Composio dashboard
2. **Configure auth config IDs** for each service you want to enable
3. **Set up Upstash Redis** for caching Composio tools

```bash
# In your .env file
COMPOSIO_API_KEY=your_composio_api_key
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token

# Auth config IDs for each service
VITE_GMAIL_AUTH_CONFIG_ID=your_gmail_auth_config_id
VITE_CALENDAR_AUTH_CONFIG_ID=your_calendar_auth_config_id
# ... add more as needed
```

### D. Polar Payments (Optional)

```bash
bunx convex env set POLAR_ORGANIZATION_TOKEN your-polar-organization-token
bunx convex env set POLAR_PREMIUM_PRODUCT_ID your-product-id
bunx convex env set POLAR_WEBHOOK_SECRET your-polar-webhook-secret
```

**Reference Documentation:**

- [Convex Auth Setup Guide](https://labs.convex.dev/auth/setup)
- [Google OAuth Configuration](https://labs.convex.dev/auth/config/oauth/google)
- [Cloudflare R2 Component](https://www.convex.dev/components/cloudflare-r2)
- [Composio Documentation](https://docs.composio.dev)
- [Polar Component Documentation](https://www.convex.dev/components/polar)

## 5. Deploy Convex Functions

Deploy your Convex schema and functions:

```bash
# Deploy to Convex (this pushes your functions and schema)
bunx convex deploy

# Or for development with hot reload
bunx convex dev
```

## 6. Run the Development Server

```bash
# Start the Vite development server
bun dev
```

Visit [http://localhost:3000](http://localhost:3000) to see OS Chat running locally!

## 7. Production Deployment

For production deployment:

1. **Deploy Convex**:

   ```bash
   bunx convex deploy --prod
   ```

2. **Deploy Frontend** (Vercel recommended):

   ```bash
   # Install Vercel CLI
   bun add -g vercel

   # Deploy to Vercel
   vercel --prod
   ```

3. **Update Environment Variables**:
   - Add your production API keys to Vercel
   - Update `SITE_URL` in Convex production dashboard to your production URL

## Development Commands

| Command             | Description                           |
| ------------------- | ------------------------------------- |
| `bun dev`           | Start development server on port 3000 |
| `bun build`         | Build for production                  |
| `bun preview`       | Preview production build              |
| `bun test`          | Run tests with Vitest                 |
| `bun run lint`      | Run oxlint with auto-fix              |
| `bun run format`    | Format code with oxfmt                |
| `bun run typecheck` | Run TypeScript type checking with tsc |
| `bunx convex dev`   | Run Convex development server         |

## Troubleshooting

### Convex Connection Issues

- Ensure you're logged into Convex: `bunx convex login`
- Check your deployment URL in `.env`
- Run `bunx convex dev` to sync functions

### Authentication Issues

- Verify OAuth credentials in Convex dashboard
- Check `SITE_URL` matches your development/production URL
- Ensure Convex Auth is properly configured

### API Key Issues

- Verify API keys are correctly set in `.env`
- Check API key permissions and quotas
- Environment variables are validated with Zod - check console for validation errors

### File Upload Issues

- Ensure R2 bucket is configured for public access
- Verify R2_PUBLIC_URL_BASE is set correctly with trailing slash
- Check CORS settings allow your domain
- Confirm all R2 environment variables are set in Convex

### Composio Integration Issues

- Verify COMPOSIO_API_KEY is set correctly
- Check auth config IDs match your Composio dashboard
- Ensure Upstash Redis is configured for caching

### Need Help?

- Check the [Convex Documentation](https://docs.convex.dev)
- Review the [Convex Auth Setup Guide](https://labs.convex.dev/auth/setup)
- See [Google OAuth Configuration](https://labs.convex.dev/auth/config/oauth/google) for authentication
- Configure [Cloudflare R2](https://www.convex.dev/components/cloudflare-r2) for file storage
- Get an [Exa API key](https://exa.ai/) for web search functionality
- Set up [Polar payments](https://www.convex.dev/components/polar) for premium features
- Read [Composio docs](https://docs.composio.dev) for service integrations
- Open an issue in this repository
