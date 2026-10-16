import { afterEach, describe, expect, it, vi } from "vitest";

import { createSessionGate, SESSION_TIMEOUT_MS } from "../session-gate";

const SIGNED_OUT = {
  isLoading: false,
  isAuthenticated: false,
  hasToken: false,
};
// A returning user's stored token, before the backend confirms it
const RESTORING = { isLoading: true, isAuthenticated: false, hasToken: true };
// A token the backend hasn't accepted: a fresh sign-in's until it is confirmed, or a stored one it
// rejected. useConvexAuth() reads both as signed out
const UNCONFIRMED = {
  isLoading: false,
  isAuthenticated: false,
  hasToken: true,
};
const SIGNED_IN = { isLoading: false, isAuthenticated: true, hasToken: true };

const guestAuth = (
  signIn = vi
    .fn<() => Promise<{ signingIn: boolean }>>()
    .mockResolvedValue({ signingIn: true })
) => ({
  signIn,
  signOut: vi.fn<() => Promise<void>>().mockResolvedValue(),
});

/** Lets pending promise callbacks run. */
const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

/** Settles with what `promise` rejects with, so a test can advance timers before asserting on it. */
const errorFrom = async (promise: Promise<void>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
};

describe(createSessionGate, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves without signing in when a session already exists", async () => {
    const gate = createSessionGate(SIGNED_IN);
    const auth = guestAuth();

    await gate.ensure(auth);

    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it("waits for a returning user's session to load instead of creating a guest", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(RESTORING);
    const auth = guestAuth();
    const onResolved = vi.fn<() => void>();

    void gate.ensure(auth).then(() => {
      onResolved();
    });
    await flush();
    expect(onResolved).not.toHaveBeenCalled();

    gate.update(SIGNED_IN);
    await flush();

    expect(onResolved).toHaveBeenCalledExactlyOnceWith();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it("signs in anonymously and resolves only once Convex confirms the token", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    const auth = guestAuth();
    const onResolved = vi.fn<() => void>();

    void gate.ensure(auth).then(() => {
      onResolved();
    });
    await flush();
    // signIn has resolved, but the websocket is not authenticated yet
    gate.update(UNCONFIRMED);
    await flush();
    expect(auth.signIn).toHaveBeenCalledOnce();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();

    gate.update(SIGNED_IN);
    await flush();

    expect(onResolved).toHaveBeenCalledExactlyOnceWith();
  });

  it("shares one sign-in between concurrent sends", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    const auth = guestAuth();

    const first = gate.ensure(auth);
    const second = gate.ensure(auth);
    await flush();
    gate.update(SIGNED_IN);
    await Promise.all([first, second]);

    expect(auth.signIn).toHaveBeenCalledOnce();
  });

  it("rejects when sign-in does not start a session, and the next send signs in again", async () => {
    const gate = createSessionGate(SIGNED_OUT);
    const auth = guestAuth(
      vi
        .fn<() => Promise<{ signingIn: boolean }>>()
        .mockResolvedValue({ signingIn: false })
    );

    await expect(gate.ensure(auth)).rejects.toThrow(/did not start a session/u);
    await expect(gate.ensure(auth)).rejects.toThrow(/did not start a session/u);

    expect(auth.signIn).toHaveBeenCalledTimes(2);
  });

  it("times out a slow confirmation, and the retry waits on the same guest's token", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    const auth = guestAuth();

    const failure = errorFrom(gate.ensure(auth));
    await flush();
    gate.update(UNCONFIRMED);
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);
    await expect(failure).resolves.toHaveProperty(
      "message",
      expect.stringMatching(/Timed out/u)
    );

    const retry = gate.ensure(auth);
    await flush();
    gate.update(SIGNED_IN);
    await retry;

    expect(auth.signIn).toHaveBeenCalledOnce();
  });

  it("uses a confirmation that lands just as the retry starts", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    const auth = guestAuth();

    const failure = errorFrom(gate.ensure(auth));
    await flush();
    gate.update(UNCONFIRMED);
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);
    await expect(failure).resolves.toHaveProperty(
      "message",
      expect.stringMatching(/Timed out/u)
    );

    // Confirmed after the retry's first check, before its next step runs
    const retry = gate.ensure(auth);
    gate.update(SIGNED_IN);
    await flush();

    expect(auth.signOut).not.toHaveBeenCalled();
    expect(auth.signIn).toHaveBeenCalledOnce();
    await retry;
  });

  it("waits on an unconfirmed guest for one retry only, then signs in afresh", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    const auth = guestAuth();

    // Convex Auth keeps the new token, and the backend never confirms it
    const first = errorFrom(gate.ensure(auth));
    await flush();
    gate.update(UNCONFIRMED);
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);
    await expect(first).resolves.toHaveProperty(
      "message",
      expect.stringMatching(/Timed out/u)
    );

    const second = errorFrom(gate.ensure(auth));
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);
    await expect(second).resolves.toHaveProperty(
      "message",
      expect.stringMatching(/Timed out/u)
    );
    expect(auth.signIn).toHaveBeenCalledOnce();

    const third = gate.ensure(auth);
    await flush();
    expect(auth.signOut).toHaveBeenCalledOnce();
    gate.update(SIGNED_OUT);
    await flush();
    gate.update(SIGNED_IN);
    await third;

    expect(auth.signIn).toHaveBeenCalledTimes(2);
  });

  it("signs in again when the new token is gone before React state shows it", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    const auth = guestAuth();

    // e.g. another tab signs out in the same render batch: the gate never sees a token
    const failure = errorFrom(gate.ensure(auth));
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);
    await expect(failure).resolves.toHaveProperty(
      "message",
      expect.stringMatching(/Timed out/u)
    );

    const retry = gate.ensure(auth);
    await flush();
    gate.update(SIGNED_IN);
    await retry;

    expect(auth.signIn).toHaveBeenCalledTimes(2);
  });

  it("signs out a stored token the backend rejected, then signs in once React sees it gone", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(RESTORING);
    const auth = guestAuth();
    const onResolved = vi.fn<() => void>();

    // Convex Auth keeps a stored token it has no refresh token for
    gate.update(UNCONFIRMED);
    void gate.ensure(auth).then(() => {
      onResolved();
    });
    await flush();
    expect(auth.signOut).toHaveBeenCalledOnce();
    // Signing in now would swap tokens without Convex noticing
    expect(auth.signIn).not.toHaveBeenCalled();

    gate.update(SIGNED_OUT);
    await flush();
    expect(auth.signIn).toHaveBeenCalledOnce();

    gate.update(SIGNED_IN);
    await flush();
    expect(onResolved).toHaveBeenCalledExactlyOnceWith();
  });

  it("gives a sign-out that outlasts its attempt a fresh wait for the token to go", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(UNCONFIRMED);
    const signOutDone: PromiseWithResolvers<void> = Promise.withResolvers();
    const finishSignOut = () => {
      signOutDone.resolve();
    };
    const auth = guestAuth();
    auth.signOut.mockImplementation(async () => {
      await signOutDone.promise;
    });

    const failure = errorFrom(gate.ensure(auth));
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);
    await expect(failure).resolves.toHaveProperty(
      "message",
      expect.stringMatching(/Timed out/u)
    );

    // The retry reuses the stalled sign-out, which then finishes
    const retry = gate.ensure(auth);
    finishSignOut();
    await flush();
    gate.update(SIGNED_OUT);
    await flush();
    expect(auth.signIn).toHaveBeenCalledOnce();

    gate.update(SIGNED_IN);
    await retry;
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it("signs in again once Convex Auth drops a token the backend rejected", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    const auth = guestAuth();

    const failure = errorFrom(gate.ensure(auth));
    await flush();
    gate.update(UNCONFIRMED);
    gate.update(SIGNED_OUT);
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);
    await expect(failure).resolves.toHaveProperty(
      "message",
      expect.stringMatching(/Timed out/u)
    );

    const retry = gate.ensure(auth);
    await flush();
    gate.update(SIGNED_IN);
    await retry;

    expect(auth.signIn).toHaveBeenCalledTimes(2);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("bounds a stalled sign-in, and the retry reuses it rather than creating a second guest", async () => {
    vi.useFakeTimers();
    const gate = createSessionGate(SIGNED_OUT);
    const signInDone = Promise.withResolvers<{ signingIn: boolean }>();
    const finishSignIn = (result: { signingIn: boolean }) => {
      signInDone.resolve(result);
    };
    const auth = guestAuth(vi.fn(async () => await signInDone.promise));

    const failure = errorFrom(gate.ensure(auth));
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);
    await expect(failure).resolves.toHaveProperty(
      "message",
      expect.stringMatching(/Timed out/u)
    );

    const retry = gate.ensure(auth);
    finishSignIn({ signingIn: true });
    await flush();
    gate.update(SIGNED_IN);
    await retry;

    expect(auth.signIn).toHaveBeenCalledOnce();
  });
});
