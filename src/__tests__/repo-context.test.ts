import { describe, expect, it, vi } from "vitest";

import {
  createRepoContextService,
  normalizeGitRemoteUrl,
  parseGitRemoteOutput,
  selectGitRemote,
} from "@/services/repo-context";

describe("parseGitRemoteOutput", () => {
  it("parses fetch and push remotes deterministically", () => {
    expect(
      parseGitRemoteOutput(
        [
          "origin\tgit@github.com:evcraddock/todu-pi-extensions.git (fetch)",
          "origin\tgit@github.com:evcraddock/todu-pi-extensions.git (push)",
        ].join("\n")
      )
    ).toEqual([
      {
        name: "origin",
        fetchUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
        pushUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
      },
    ]);
  });
});

describe("selectGitRemote", () => {
  it("prefers origin when present", () => {
    expect(
      selectGitRemote(
        [
          { name: "upstream", fetchUrl: "https://git.example.com/org/repo.git", pushUrl: null },
          {
            name: "origin",
            fetchUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
            pushUrl: null,
          },
        ],
        undefined
      )
    ).toEqual({
      name: "origin",
      fetchUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
      pushUrl: null,
    });
  });

  it("returns null when multiple remotes exist without origin", () => {
    expect(
      selectGitRemote(
        [
          { name: "fork", fetchUrl: "https://git.example.com/org/repo.git", pushUrl: null },
          { name: "upstream", fetchUrl: "https://git.example.com/team/repo.git", pushUrl: null },
        ],
        undefined
      )
    ).toBeNull();
  });
});

describe("normalizeGitRemoteUrl", () => {
  it("normalizes github ssh remotes", () => {
    expect(normalizeGitRemoteUrl("git@github.com:evcraddock/todu-pi-extensions.git")).toEqual({
      provider: "github",
      targetRef: "evcraddock/todu-pi-extensions",
    });
  });

  it("normalizes forgejo https remotes", () => {
    expect(normalizeGitRemoteUrl("https://git.example.com/owner/repo.git")).toEqual({
      provider: "forgejo",
      targetRef: "owner/repo",
    });
  });

  it("returns null for unsupported formats", () => {
    expect(normalizeGitRemoteUrl("file:///tmp/repo")).toBeNull();
  });
});

describe("createRepoContextService", () => {
  it("resolves repository context from git commands", async () => {
    const runner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "/tmp/repo\n", stderr: "" })
        .mockResolvedValueOnce({
          stdout: "origin\tgit@github.com:evcraddock/todu-pi-extensions.git (fetch)\n",
          stderr: "",
        }),
    };

    const service = createRepoContextService(runner);

    await expect(service.resolveRepository({ repositoryPath: "/tmp/repo" })).resolves.toEqual({
      kind: "resolved",
      repository: {
        repositoryPath: "/tmp/repo",
        remoteName: "origin",
        remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
        provider: "github",
        targetRef: "evcraddock/todu-pi-extensions",
      },
    });
  });

  it("returns explicit missing context for non-git directories", async () => {
    const service = createRepoContextService({
      run: vi.fn().mockRejectedValue(new Error("not a git repository")),
    });

    await expect(service.resolveRepository({ repositoryPath: "/tmp/nope" })).resolves.toEqual({
      kind: "missing-context",
      reason: "not-a-git-repository",
      repositoryPath: "/tmp/nope",
    });
  });

  it("returns explicit ambiguity for multiple remotes without origin", async () => {
    const runner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "/tmp/repo\n", stderr: "" })
        .mockResolvedValueOnce({
          stdout: [
            "fork\thttps://git.example.com/org/repo.git (fetch)",
            "upstream\thttps://git.example.com/team/repo.git (fetch)",
          ].join("\n"),
          stderr: "",
        }),
    };

    const service = createRepoContextService(runner);

    await expect(service.resolveRepository({ repositoryPath: "/tmp/repo" })).resolves.toEqual({
      kind: "ambiguous",
      reason: "multiple-remotes",
      repositoryPath: "/tmp/repo",
      remotes: ["fork", "upstream"],
    });
  });

  it("returns explicit unsupported format results", async () => {
    const runner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "/tmp/repo\n", stderr: "" })
        .mockResolvedValueOnce({
          stdout: "origin\tfile:///tmp/repo (fetch)\n",
          stderr: "",
        }),
    };

    const service = createRepoContextService(runner);

    await expect(service.resolveRepository({ repositoryPath: "/tmp/repo" })).resolves.toEqual({
      kind: "unsupported",
      reason: "unsupported-remote-format",
      repositoryPath: "/tmp/repo",
      remoteName: "origin",
      remoteUrl: "file:///tmp/repo",
    });
  });
});
