import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id, TableNames } from "../../../convex/_generated/dataModel";
import {
  getOrderedGroupKeys,
  getRelativeTimeDescription,
  getTimeGroup,
  groupChatsByTime,
  hasChatsInGroup,
} from "../chat-utils/time-grouping";

// Test ids only need to be distinct, non-empty strings
const isTestId = <Table extends TableNames>(id: string): id is Id<Table> =>
  id !== "";
const testId = <Table extends TableNames>(id: string): Id<Table> => {
  if (!isTestId<Table>(id)) {
    throw new TypeError("Test ids must be non-empty");
  }
  return id;
};

const chat = (
  id: string,
  times: Pick<Doc<"chats">, "_creationTime" | "createdAt" | "updatedAt">
): Doc<"chats"> => ({
  _id: testId<"chats">(id),
  userId: testId<"users">("user"),
  ...times,
});

// Calls groupChatsByTime with input its type rules out, as an untyped caller could
const groupUntyped = (input: unknown): unknown =>
  Reflect.apply(groupChatsByTime, undefined, [input]);

describe(getTimeGroup, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Older" for invalid timestamps', () => {
    expect(getTimeGroup(0)).toBe("Older");
    expect(getTimeGroup(-1)).toBe("Older");
    expect(getTimeGroup(Number.NaN)).toBe("Older");
    expect(getTimeGroup(Number.POSITIVE_INFINITY)).toBe("Older");
  });

  it('returns "Today" for today\'s timestamp', () => {
    const now = new Date("2024-12-25T12:00:00");
    vi.setSystemTime(now);
    const todayTimestamp = new Date("2024-12-25T10:00:00").getTime();
    expect(getTimeGroup(todayTimestamp)).toBe("Today");
  });

  it('returns "Today" for future timestamps', () => {
    const now = new Date("2024-12-25T12:00:00");
    vi.setSystemTime(now);
    const futureTimestamp = new Date("2024-12-26T12:00:00").getTime();
    expect(getTimeGroup(futureTimestamp)).toBe("Today");
  });

  it('returns "Yesterday" for yesterday\'s timestamp', () => {
    const now = new Date("2024-12-25T12:00:00");
    vi.setSystemTime(now);
    const yesterdayTimestamp = new Date("2024-12-24T12:00:00").getTime();
    expect(getTimeGroup(yesterdayTimestamp)).toBe("Yesterday");
  });

  it('returns "Last 7 Days" for timestamps within the week', () => {
    const now = new Date("2024-12-25T12:00:00");
    vi.setSystemTime(now);
    const fiveDaysAgo = new Date("2024-12-20T12:00:00").getTime();
    expect(getTimeGroup(fiveDaysAgo)).toBe("Last 7 Days");
  });

  it('returns "Last 30 Days" for timestamps within the month', () => {
    const now = new Date("2024-12-25T12:00:00");
    vi.setSystemTime(now);
    const fifteenDaysAgo = new Date("2024-12-10T12:00:00").getTime();
    expect(getTimeGroup(fifteenDaysAgo)).toBe("Last 30 Days");
  });

  it('returns "Older" for timestamps older than 30 days', () => {
    const now = new Date("2024-12-25T12:00:00");
    vi.setSystemTime(now);
    const sixtyDaysAgo = new Date("2024-10-25T12:00:00").getTime();
    expect(getTimeGroup(sixtyDaysAgo)).toBe("Older");
  });
});

describe(groupChatsByTime, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty groups for non-array input", () => {
    const result = groupUntyped(null);
    expect(result).toStrictEqual({
      Today: [],
      Yesterday: [],
      "Last 7 Days": [],
      "Last 30 Days": [],
      Older: [],
    });
  });

  it("groups chats correctly", () => {
    const now = new Date("2024-12-25T12:00:00");
    vi.setSystemTime(now);

    const chats = [
      chat("1", {
        _creationTime: new Date("2024-12-25T10:00:00").getTime(),
      }),
      chat("2", {
        _creationTime: new Date("2024-12-24T10:00:00").getTime(),
      }),
      chat("3", {
        _creationTime: new Date("2024-12-20T10:00:00").getTime(),
      }),
      chat("4", {
        _creationTime: new Date("2024-12-10T10:00:00").getTime(),
      }),
      chat("5", {
        _creationTime: new Date("2024-10-25T10:00:00").getTime(),
      }),
    ];

    const result = groupChatsByTime(chats);

    expect(result.Today).toHaveLength(1);
    expect(result.Yesterday).toHaveLength(1);
    expect(result["Last 7 Days"]).toHaveLength(1);
    expect(result["Last 30 Days"]).toHaveLength(1);
    expect(result.Older).toHaveLength(1);
  });

  it("sorts chats within each group by timestamp descending", () => {
    const now = new Date("2024-12-25T12:00:00");
    vi.setSystemTime(now);

    const chats = [
      chat("1", {
        _creationTime: new Date("2024-12-25T08:00:00").getTime(),
      }),
      chat("2", {
        _creationTime: new Date("2024-12-25T10:00:00").getTime(),
      }),
      chat("3", {
        _creationTime: new Date("2024-12-25T09:00:00").getTime(),
      }),
    ];

    const result = groupChatsByTime(chats);

    expect(result.Today[0]._id).toBe("2");
    expect(result.Today[1]._id).toBe("3");
    expect(result.Today[2]._id).toBe("1");
  });

  it("uses updatedAt over createdAt over _creationTime", () => {
    const now = new Date("2024-12-25T12:00:00");
    vi.setSystemTime(now);

    const chats = [
      chat("1", {
        // Older
        _creationTime: new Date("2024-10-25T10:00:00").getTime(),
        // Last 30 Days
        createdAt: new Date("2024-12-10T10:00:00").getTime(),
        // Today
        updatedAt: new Date("2024-12-25T10:00:00").getTime(),
      }),
    ];

    const result = groupChatsByTime(chats);
    expect(result.Today).toHaveLength(1);
  });

  it("skips invalid chat objects", () => {
    const result = groupUntyped([null, undefined, "string", 123]);
    expect(result).toMatchObject({ Today: [], Older: [] });
  });
});

describe(getOrderedGroupKeys, () => {
  it("returns groups in correct order", () => {
    const keys = getOrderedGroupKeys();
    expect(keys).toStrictEqual([
      "Today",
      "Yesterday",
      "Last 7 Days",
      "Last 30 Days",
      "Older",
    ]);
  });
});

describe(hasChatsInGroup, () => {
  it("returns true when group has chats", () => {
    const groups = {
      Today: [chat("1", { _creationTime: 1 })],
      Yesterday: [],
      "Last 7 Days": [],
      "Last 30 Days": [],
      Older: [],
    };
    expect(hasChatsInGroup(groups, "Today")).toBeTruthy();
  });

  it("returns false when group is empty", () => {
    const groups = {
      Today: [],
      Yesterday: [],
      "Last 7 Days": [],
      "Last 30 Days": [],
      Older: [],
    };
    expect(hasChatsInGroup(groups, "Today")).toBeFalsy();
  });
});

describe(getRelativeTimeDescription, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Unknown" for invalid timestamps', () => {
    expect(getRelativeTimeDescription(0)).toBe("Unknown");
    expect(getRelativeTimeDescription(-1)).toBe("Unknown");
    expect(getRelativeTimeDescription(Number.NaN)).toBe("Unknown");
  });

  it('returns "Future" for future timestamps', () => {
    const now = new Date("2024-12-25T12:00:00");
    vi.setSystemTime(now);
    const future = new Date("2024-12-26T12:00:00").getTime();
    expect(getRelativeTimeDescription(future)).toBe("Future");
  });

  it('returns "Just now" for very recent timestamps', () => {
    const now = new Date("2024-12-25T12:00:30");
    vi.setSystemTime(now);
    const recent = new Date("2024-12-25T12:00:00").getTime();
    expect(getRelativeTimeDescription(recent)).toBe("Just now");
  });

  it("returns minutes ago for recent timestamps", () => {
    const now = new Date("2024-12-25T12:30:00");
    vi.setSystemTime(now);
    const thirtyMinutesAgo = new Date("2024-12-25T12:00:00").getTime();
    expect(getRelativeTimeDescription(thirtyMinutesAgo)).toBe("30m ago");
  });

  it("returns hours ago for timestamps within the day", () => {
    const now = new Date("2024-12-25T15:00:00");
    vi.setSystemTime(now);
    const threeHoursAgo = new Date("2024-12-25T12:00:00").getTime();
    expect(getRelativeTimeDescription(threeHoursAgo)).toBe("3h ago");
  });

  it('returns "Yesterday" for yesterday\'s timestamp', () => {
    const now = new Date("2024-12-25T12:00:00");
    vi.setSystemTime(now);
    const yesterday = new Date("2024-12-24T12:00:00").getTime();
    expect(getRelativeTimeDescription(yesterday)).toBe("Yesterday");
  });

  it("returns days ago for timestamps within the week", () => {
    const now = new Date("2024-12-25T12:00:00");
    vi.setSystemTime(now);
    const threeDaysAgo = new Date("2024-12-22T12:00:00").getTime();
    expect(getRelativeTimeDescription(threeDaysAgo)).toBe("3d ago");
  });

  it("returns localized date for older timestamps", () => {
    const now = new Date("2024-12-25T12:00:00");
    vi.setSystemTime(now);
    const twoWeeksAgo = new Date("2024-12-11T12:00:00").getTime();
    const result = getRelativeTimeDescription(twoWeeksAgo);
    // Should be a date string, not relative
    expect(result).toBeTruthy();
    expect(result).not.toBe("Unknown");
  });
});
