// The "-" prefix keeps TanStack Router from treating this test as a route.
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  ReactMutation,
  useMutation,
  usePaginatedQuery,
} from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { toast } from "@/components/ui/toast";
import type { api } from "@/convex/_generated/api";

import { AttachmentsSettingsPage } from "./attachments";

type DeleteAttachments = ReactMutation<typeof api.files.deleteAttachments>;

const mocks = vi.hoisted(() => ({
  usePaginatedQuery: vi.fn<typeof usePaginatedQuery>(),
  useMutation: vi.fn<typeof useMutation>(),
  loadMore: vi.fn<(numItems: number) => void>(),
  deleteAttachments: vi.fn<DeleteAttachments>().mockResolvedValue(null),
}));

vi.mock(import("convex/react"), () => ({
  usePaginatedQuery: mocks.usePaginatedQuery,
  useMutation: mocks.useMutation,
}));
vi.mock(import("@/components/ui/toast"), () => ({
  toast: vi.fn<typeof toast>(),
}));

// The mutation the page gets from useMutation; it never applies optimistic updates
const deleteMutation: DeleteAttachments = Object.assign(
  mocks.deleteAttachments,
  { withOptimisticUpdate: () => deleteMutation }
);

const attachments = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    _id: `chat_attachments:${i}`,
    _creationTime: i,
    key: `key-${i}`,
    fileName: `file-${i}.pdf`,
    fileType: "application/pdf",
    fileSize: 1024,
  }));

const renderWith = (count: number, status: "CanLoadMore" | "Exhausted") => {
  mocks.usePaginatedQuery.mockReturnValue({
    results: attachments(count),
    status,
    isLoading: false,
    loadMore: mocks.loadMore,
  });
  mocks.useMutation.mockReturnValue(deleteMutation);
  render(<AttachmentsSettingsPage />);
};

describe(AttachmentsSettingsPage, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" })
    );

    await waitFor(() => {
      expect(mocks.deleteAttachments).toHaveBeenCalledTimes(2);
    });
    expect(
      mocks.deleteAttachments.mock.calls.map(
        ([args]) => args.attachmentIds.length
      )
    ).toStrictEqual([100, 50]);
  });
});
