import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionGate, SESSION_TIMEOUT_MS } from "../session-gate";

const SIGNED_OUT = { isLoading: false, isAuthenticated: false, hasToken: false };
// A returning user's stored token, before the backend confirms it
const RESTORING = { isLoading: true, isAuthenticated: false, hasToken: true };
// A token the backend hasn't accepted: a fresh sign-in's until it is confirmed, or a stored one it
// rejected. useConvexAuth() reads both as signed out
const UNCONFIRMED = { isLoading: false, isAuthenticated: false, hasToken: true };
const SIGNED_IN = { isLoading: false, isAuthenticated: true, hasToken: true };

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
    const gate = createSessionGate(RESTORING);
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
    gate.update(UNCONFIRMED);
    await flush();
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

  it("rejects when sign-in does not start a session, and the next send signs in again", async () => {
    const gate = createSessionGate(SIGNED_OUT);
    const signIn = signInMock(false);

    await expect(gate.ensure(signIn)).rejects.toThrow(/did not start a session/);
    await expect(gate.ensure(signIn)).rejects.toThrow(/did not start a session/);

    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it("times out a slow confirmation, and the retry waits on the same guest's token", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    const signIn = signInMock();

    const failure = gate.ensure(signIn).catch((error: Error) => error);
    await flush();
    gate.update(UNCONFIRMED);
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);
    expect((await failure)?.message).toMatch(/Timed out/);

    const retry = gate.ensure(signIn);
    await flush();
    gate.update(SIGNED_IN);
    await retry;

    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("waits on an unconfirmed guest for one retry only, then signs in afresh", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    const signIn = signInMock();

    // Convex Auth keeps the new token, and the backend never confirms it
    const first = gate.ensure(signIn).catch((error: Error) => error);
    await flush();
    gate.update(UNCONFIRMED);
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);
    expect((await first)?.message).toMatch(/Timed out/);

    const second = gate.ensure(signIn).catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);
    expect((await second)?.message).toMatch(/Timed out/);
    expect(signIn).toHaveBeenCalledTimes(1);

    const third = gate.ensure(signIn);
    await flush();
    gate.update(SIGNED_IN);
    await third;

    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it("signs in again when the new token is gone before React state shows it", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    const signIn = signInMock();

    // e.g. another tab signs out in the same render batch: the gate never sees a token
    const failure = gate.ensure(signIn).catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);
    expect((await failure)?.message).toMatch(/Timed out/);

    const retry = gate.ensure(signIn);
    await flush();
    gate.update(SIGNED_IN);
    await retry;

    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it("replaces a stored token the backend rejected instead of waiting on it", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(RESTORING);
    const signIn = signInMock();
    const done = vi.fn<() => void>();

    // Convex Auth keeps a stored token it has no refresh token for
    gate.update(UNCONFIRMED);
    void gate.ensure(signIn).then(done);
    await flush();
    expect(signIn).toHaveBeenCalledTimes(1);

    gate.update(SIGNED_IN);
    await flush();
    expect(done).toHaveBeenCalled();
  });

  it("signs in again once Convex Auth drops a token the backend rejected", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    const signIn = signInMock();

    const failure = gate.ensure(signIn).catch((error: Error) => error);
    await flush();
    gate.update(UNCONFIRMED);
    gate.update(SIGNED_OUT);
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
