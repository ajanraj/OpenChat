import { DefaultChatTransport } from "ai";
import { API_ROUTE_CHAT } from "./routes";

let authToken: string | null = null;

/** Records the Convex Auth token chat requests send; <Chat> calls it whenever the token changes. */
export function setChatAuthToken(token: string | null) {
  authToken = token;
}

/**
 * The transport every chat instance shares. Headers resolve per request, so an instance created
 * before the visitor's first-message sign-in (or before a token refresh) sends the current token.
 */
export const chatTransport = new DefaultChatTransport({
  api: API_ROUTE_CHAT,
  headers: (): Record<string, string> =>
    authToken ? { Authorization: `Bearer ${authToken}` } : {},
});
