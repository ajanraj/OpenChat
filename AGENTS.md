## Global Rules

- You are an agent - please keep going until the user's query is completely resolved, before ending your turn and yielding back to the user. Only terminate your turn when you are sure that the problem is solved.
- If you are not sure about file content or codebase structure pertaining to the user's request, use search subagent where appropriate to gather the relevant information: do NOT guess or make up an answer.
- You MUST plan extensively before each function call, and reflect extensively on the outcomes of the previous function calls.
- Your thinking should be thorough and so it's fine if it's very long. You can think step by step before and after each action you decide to take.
- You MUST iterate and keep going until the problem is solved.
- Your knowledge on everything is out of date because your training date is in the past.
- You CANNOT successfully complete this task without using web search or context7 tool to verify your understanding of third party packages and dependencies is up to date.
- Take your time and think hard through every step - remember to check your solution rigorously and watch out for boundary cases.
- LESS COMPLEXITY IS BETTER, the fewer lines, the less complex logic the better.
- Do not assume anything. Use the docs from context7 tool.
- If there is a lint error (`bun run lint`), fix it before moving on.
- Use `agent_rules/commit.md` for commit instructions.

## Project Details

### Tech Stack

- **Framework**: TanStack Start (full-stack React framework with SSR)
- **Routing**: TanStack Router (type-safe file-based routing)
- **Data Fetching**: TanStack Query (powerful data fetching and caching)
- **Build Tool**: Vite 8 (next-generation frontend tooling)
- **Server**: Nitro v3 (universal server engine)
- **UI Library**: React 19
- **Package Manager**: Bun
- **Styling**: Tailwind CSS v4
- **Environment Variables**: `import.meta.env` for client-side (`VITE_` prefixed), `process.env` for server-side
- **AI Integration**: Vercel AI SDK v5
- **Backend**: Convex (real-time database, authentication, file storage, serverless functions)
- **Integrations**: Composio (Gmail, Calendar, Notion, GitHub, Slack, etc.)
- **State Management**: Zustand
- **Animations**: Framer Motion
- **Toast Notifications**: Sonner
- **Icons**: Phosphor Icons, Lucide React
- **UI Components**: Shadcn/UI, Radix UI primitives
- **Testing**: Vitest
- **Linting**: oxlint (with type-aware linting via tsgolint)
- **Formatting**: oxfmt
- **Type Checking**: tsgo (TypeScript native compiler)
- **Analytics**: PostHog, Vercel Analytics
- **Caching**: Upstash Redis
- **Object Storage**: Cloudflare R2 (via @convex-dev/r2)

## Code Standards

- Use TypeScript with strict mode enabled. Avoid `any` and `unknown` types. Prefer explicit types and interfaces. Do not use `@ts-ignore` or disable type checks.
- Use functional React components. Always use hooks at the top level. Do not use default exports for components or functions.
- When working on anything, try to split off components, utils, anything reusable to ensure better loading speed and less complexity.
- Follow TanStack Start and React 19 best practices.
- Use Tailwind CSS utility classes for styling. Avoid inline styles.
- Use Bun for all package management and scripts (`bun install`).
- Follow Convex guidelines in `agent_rules/convex_rules.md`.
- Use shadcn/ui components as documented. Do not modify library code directly. Prefer composition over modification. Follow guidelines in `agent_rules/shadcn.md` when creating or editing UI components.
- Use oxlint for linting and oxfmt for formatting. Run `bun run lint` and `bun run format` before committing. Do not use other linters or formatters (like ESLint or Prettier).
- Ensure accessibility: use semantic HTML, provide alt text for images, and follow accessibility guidelines in `agent_rules/design_guidelines.md`.
- Use `Icon` suffix for Phosphor React icons (e.g., `CaretIcon` not `Caret`).
- Access environment variables directly via `import.meta.env` for client-side and `process.env` for server-side code.
- Before using `useEffect`, always read https://react.dev/learn/you-might-not-need-an-effect to ensure it's actually needed. Most effects can be replaced with event handlers, useMemo, or derived state.

## Architecture Overview

### Frontend Architecture

- **TanStack Start**: Full-stack React framework with SSR, using file-based routing
- **Component Structure**:
  - `src/components/`: React components organized by feature (chat, layout, history, auth, etc.)
  - Components are functional with TypeScript interfaces for props
- **Routing**: File-based routing in `src/routes/` with `__root.tsx` shell pattern and API routes as `api.*.ts` files
- **State Management**:
  - Zustand stores in `src/lib/store/` for complex persisted state (e.g., theme editor)
  - TanStack Query + Convex via `convexQuery()` wrapper for server state
  - React Context providers in `src/providers/` for app-wide state (ChatSession, Sidebar, User)
- **Styling**: Tailwind CSS v4 with custom themes and animations

### Backend Architecture (Convex)

- **Real-time Database**: Convex provides real-time updates across all clients
- **Authentication**: Convex Auth with Google OAuth integration
- **File Storage**: Built-in file storage for attachments and images (with R2 integration)
- **Schema**: Defined in `convex/schema/` with modular table definitions
- **API Functions**:
  - Queries for reading data (`convex/*.ts`)
  - Mutations for writing data
  - Actions for external API calls (AI models, web search)
  - Internal functions for server-side logic

### AI Integration

- **Multi-model Support**: OpenAI, Anthropic, Google, Mistral, xAI, DeepSeek, Meta/Llama, Fal (images)
- **Vercel AI SDK v5**: Handles streaming, tool calling, model switching, plus @ai-sdk-tools packages (agents, memory, store)
- **Gateway Pattern**: Uses `@ai-sdk/gateway` for xAI, DeepSeek, Meta providers; direct SDKs for OpenAI, Anthropic, Google, Mistral
- **Model Selection**: Dynamic model switching with per-chat preferences
- **API Key Management**: Secure encryption of user-provided API keys
- **Web Search**: Exa (primary), Tavily, and Brave APIs via factory pattern
- **Service Integrations**: Composio for Gmail, Calendar, Notion, GitHub, Slack, Linear, and more

### Key Features

- **Real-time Chat**: Live message streaming with Convex subscriptions
- **Multi-modal**: Text, images, and reasoning model support
- **Background Agents**: Scheduled AI agents with email notifications
- **Chat Management**: Pinning, branching, export/import, time-based organization
- **Search**: Full-text search across chat history
- **Personalization**: User customization with traits and preferences
- **Responsive Design**: Mobile-first with drawer navigation

## Development Commands

| Command                | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `bun install`          | Install dependencies                            |
| `bun dev`              | Start development server on port 3000           |
| `bun build`            | Build for production                            |
| `bun preview`          | Preview production build                        |
| `bun run test`         | Run tests with Vitest                           |
| `bun run lint`         | Run oxlint with type-aware linting and auto-fix |
| `bun run format`       | Format code with oxfmt                          |
| `bun run format:check` | Check formatting without writing changes        |
| `bun run typecheck`    | Run TypeScript type checking with tsgo          |
| `bunx convex dev`      | Run Convex development server                   |

## Quality Assurance

- Run `bun run format` and `bun run lint` before committing to ensure code quality
- All TypeScript errors must be resolved (`bun run typecheck`)
- Test responsive design on mobile and desktop
- Verify real-time features work across multiple clients

## Testing Practices

- After every code change, create and run tests using Vitest to verify the fix works correctly
- Write test files that cover:
  - Normal use cases (happy path)
  - Edge cases (boundaries, special values)
  - Error cases (what was originally broken)
- Test approach:
  1. Create a test file in the appropriate location
  2. Test various scenarios including the specific issue that was fixed
  3. Run with `bun run test` to verify behavior
- Always verify that your changes don't break existing functionality
- Test both the specific fix and related functionality that might be affected

## Reference Files

**You MUST read these files before working on related areas:**

- `agent_rules/commit.md` - Read before making any commits
- `agent_rules/convex_rules.md` - Read before working with Convex (database, auth, mutations, queries)
- `agent_rules/oxc.md` - Read before writing code to avoid lint errors
- `agent_rules/shadcn.md` - Read before creating or editing UI components
- `agent_rules/design_guidelines.md` - Read before building any UI

## Important Reminders

- Do what has been asked; nothing more, nothing less.
- NEVER create files unless they're absolutely necessary for achieving your goal.
- ALWAYS prefer editing an existing file to creating a new one.
- NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
