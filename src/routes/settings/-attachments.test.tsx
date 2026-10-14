// The "-" prefix keeps TanStack Router from treating this test as a route.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentsSettingsPage } from "./attachments";

type Status = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

const mocks = vi.hoisted(() => ({
  usePaginatedQuery: vi.fn<() => { results: object[]; status: Status; loadMore: unknown }>(),
  loadMore: vi.fn<(numItems: number) => void>(),
  deleteAttachments: vi.fn<(args: { attachmentIds: string[] }) => Promise<null>>(async () => null),
}));

vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => () => ({}) }));
vi.mock("convex/react", () => ({
  usePaginatedQuery: mocks.usePaginatedQuery,
  useMutation: () => mocks.deleteAttachments,
}));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn<() => void>() }));

function attachments(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    _id: `chat_attachments:${i}`,
    _creationTime: i,
    key: `key-${i}`,
    fileName: `file-${i}.pdf`,
    fileType: "application/pdf",
    fileSize: 1024,
  }));
}

function renderWith(count: number, status: Status) {
  mocks.usePaginatedQuery.mockReturnValue({
    results: attachments(count),
    status,
    loadMore: mocks.loadMore,
  });
  render(<AttachmentsSettingsPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AttachmentsSettingsPage", () => {
  it("labels loaded totals with a plus while more pages exist and loads the next page", () => {
    renderWith(2, "CanLoadMore");

    expect(screen.getByText("2+ files")).toBeTruthy();
    expect(screen.getByText("2.00 KB+")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(mocks.loadMore).toHaveBeenCalledWith(50);
  });

  it("shows exact totals once every page is loaded", () => {
    renderWith(1, "Exhausted");

    expect(screen.getByText("1 file")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("deletes large selections in capped batches", async () => {
    renderWith(150, "Exhausted");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select All" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete (150)" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mocks.deleteAttachments).toHaveBeenCalledTimes(2));
    expect(mocks.deleteAttachments.mock.calls.map(([args]) => args.attachmentIds.length)).toEqual([
      100, 50,
    ]);
  });
});
