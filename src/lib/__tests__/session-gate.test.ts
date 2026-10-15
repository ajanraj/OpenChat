import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionGate, SESSION_TIMEOUT_MS } from "../session-gate";

const LOADING = { isLoading: true, isAuthenticated: false };
const SIGNED_OUT = { isLoading: false, isAuthenticated: false };
const SIGNED_IN = { isLoading: false, isAuthenticated: true };

function signInMock(signingIn = true) {
  return vi.fn<() => Promise<{ signingIn: boolean }>>(async () => ({ signingIn }));
}

/** Lets pending promise callbacks run. */
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

describe("createSessionGate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves without signing in when a session already exists", async () => {
    const gate = createSessionGate(SIGNED_IN);
    const signIn = signInMock();

    await gate.ensure(signIn);

    expect(signIn).not.toHaveBeenCalled();
  });

  it("waits for a returning user's session to load instead of creating a guest", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(LOADING);
    const signIn = signInMock();
    const done = vi.fn<() => void>();

    void gate.ensure(signIn).then(done);
    await flush();
    expect(done).not.toHaveBeenCalled();

    gate.update(SIGNED_IN);
    await flush();

    expect(done).toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("signs in anonymously and resolves only once Convex confirms the token", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    const signIn = signInMock();
    const done = vi.fn<() => void>();

    void gate.ensure(signIn).then(done);
    await flush();
    // signIn has resolved, but the websocket is not authenticated yet
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();

    gate.update(SIGNED_IN);
    await flush();

    expect(done).toHaveBeenCalled();
  });

  it("shares one sign-in between concurrent sends", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    const signIn = signInMock();

    const first = gate.ensure(signIn);
    const second = gate.ensure(signIn);
    await flush();
    gate.update(SIGNED_IN);
    await Promise.all([first, second]);

    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("rejects when sign-in does not start a session", async () => {
    const gate = createSessionGate(SIGNED_OUT);

    await expect(gate.ensure(signInMock(false))).rejects.toThrow(/did not start a session/);
  });

  it("rejects when Convex never confirms the token, then retries on the next send", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    const signIn = signInMock();

    const failure = gate.ensure(signIn).catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);
    expect((await failure)?.message).toMatch(/Timed out/);

    const retry = gate.ensure(signIn);
    await flush();
    gate.update(SIGNED_IN);
    await retry;

    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it("bounds a stalled sign-in, and the retry reuses it rather than creating a second guest", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    let finishSignIn: (result: { signingIn: boolean }) => void = () => {};
    const signIn = vi.fn<() => Promise<{ signingIn: boolean }>>(
      () =>
        new Promise((resolve) => {
          finishSignIn = resolve;
        }),
    );

    const failure = gate.ensure(signIn).catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);
    expect((await failure)?.message).toMatch(/Timed out/);

    const retry = gate.ensure(signIn);
    finishSignIn({ signingIn: true });
    await flush();
    gate.update(SIGNED_IN);
    await retry;

    expect(signIn).toHaveBeenCalledTimes(1);
  });
});
