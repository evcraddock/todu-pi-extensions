import { describe, expect, it, vi } from "vitest";

import type { ToduDaemonClient } from "@/services/todu/daemon-client";
import { ToduDaemonClientError } from "@/services/todu/daemon-client";
import { createToduNoteService, ToduNoteServiceError } from "@/services/todu/todu-note-service";

const createClientMock = () =>
  ({
    listNotes: vi.fn().mockResolvedValue([]),
    getNote: vi.fn().mockResolvedValue(null),
  }) as unknown as ToduDaemonClient;

describe("createToduNoteService", () => {
  it("delegates listNotes to the daemon client", async () => {
    const client = createClientMock();
    const notes = [
      {
        id: "note-1",
        content: "Hello",
        authorActorId: "actor-user",
        authorDisplayName: "Erik",
        author: "user",
        contentApproval: null,
        entityType: null,
        entityId: null,
        tags: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      },
    ];
    vi.mocked(client.listNotes).mockResolvedValue(notes);

    const service = createToduNoteService({ client });
    const result = await service.listNotes({ journal: true });

    expect(client.listNotes).toHaveBeenCalledWith({ journal: true });
    expect(result).toEqual(notes);
  });

  it("delegates getNote to the daemon client", async () => {
    const client = createClientMock();
    const note = {
      id: "note-1",
      content: "Hello",
      authorActorId: null,
      authorDisplayName: "Erik",
      author: "user",
      contentApproval: null,
      entityType: null,
      entityId: null,
      tags: [],
      createdAt: "2026-03-20T00:00:00.000Z",
    };
    vi.mocked(client.getNote).mockResolvedValue(note);

    const service = createToduNoteService({ client });
    const result = await service.getNote("note-1");

    expect(client.getNote).toHaveBeenCalledWith("note-1");
    expect(result).toEqual(note);
  });

  it("wraps daemon client errors in ToduNoteServiceError", async () => {
    const client = createClientMock();
    vi.mocked(client.listNotes).mockRejectedValue(
      new ToduDaemonClientError({
        code: "unavailable",
        method: "note.list",
        message: "connection lost",
      })
    );

    const service = createToduNoteService({ client });

    await expect(service.listNotes()).rejects.toThrow(ToduNoteServiceError);
    await expect(service.listNotes()).rejects.toThrow("listNotes failed: connection lost");
  });

  it("wraps getNote daemon client errors in ToduNoteServiceError", async () => {
    const client = createClientMock();
    vi.mocked(client.getNote).mockRejectedValue(
      new ToduDaemonClientError({
        code: "unavailable",
        method: "note.get",
        message: "connection lost",
      })
    );

    const service = createToduNoteService({ client });

    await expect(service.getNote("note-1")).rejects.toThrow(ToduNoteServiceError);
    await expect(service.getNote("note-1")).rejects.toThrow("getNote failed: connection lost");
  });

  it("re-throws non-daemon errors as-is", async () => {
    const client = createClientMock();
    vi.mocked(client.listNotes).mockRejectedValue(new TypeError("unexpected"));

    const service = createToduNoteService({ client });

    await expect(service.listNotes()).rejects.toThrow(TypeError);
  });
});
