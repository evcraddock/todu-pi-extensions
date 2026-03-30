import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type RepoProvider = "github" | "forgejo";

export interface GitRemote {
  name: string;
  fetchUrl: string | null;
  pushUrl: string | null;
}

export interface ResolvedRepositoryContext {
  repositoryPath: string;
  remoteName: string;
  remoteUrl: string;
  provider: RepoProvider;
  targetRef: string;
}

export type RepoContextResult =
  | {
      kind: "resolved";
      repository: ResolvedRepositoryContext;
    }
  | {
      kind: "missing-context";
      reason: "not-a-git-repository" | "no-remotes";
      repositoryPath?: string;
    }
  | {
      kind: "ambiguous";
      reason: "multiple-remotes";
      repositoryPath?: string;
      remotes: string[];
    }
  | {
      kind: "unsupported";
      reason: "unsupported-remote-format";
      repositoryPath?: string;
      remoteName: string;
      remoteUrl: string;
    };

export interface ResolveRepoContextInput {
  repositoryPath?: string;
  remoteName?: string;
}

export interface RepoCommandRunner {
  run(cwd: string | undefined, args: string[]): Promise<{ stdout: string; stderr: string }>;
}

export interface RepoContextService {
  resolveRepository(input?: ResolveRepoContextInput): Promise<RepoContextResult>;
}

const createRepoContextService = (
  runner: RepoCommandRunner = createDefaultRepoCommandRunner()
): RepoContextService => ({
  async resolveRepository(input: ResolveRepoContextInput = {}): Promise<RepoContextResult> {
    const resolvedRoot = await resolveGitRoot(runner, input.repositoryPath);
    if (!resolvedRoot) {
      return {
        kind: "missing-context",
        reason: "not-a-git-repository",
        repositoryPath: input.repositoryPath,
      };
    }

    const remotes = await listGitRemotes(runner, resolvedRoot);
    if (remotes.length === 0) {
      return {
        kind: "missing-context",
        reason: "no-remotes",
        repositoryPath: resolvedRoot,
      };
    }

    const selectedRemote = selectGitRemote(remotes, input.remoteName);
    if (!selectedRemote) {
      return {
        kind: "ambiguous",
        reason: "multiple-remotes",
        repositoryPath: resolvedRoot,
        remotes: remotes.map((remote) => remote.name),
      };
    }

    const normalizedRemote = normalizeGitRemoteUrl(
      selectedRemote.fetchUrl ?? selectedRemote.pushUrl ?? ""
    );
    if (!normalizedRemote) {
      return {
        kind: "unsupported",
        reason: "unsupported-remote-format",
        repositoryPath: resolvedRoot,
        remoteName: selectedRemote.name,
        remoteUrl: selectedRemote.fetchUrl ?? selectedRemote.pushUrl ?? "",
      };
    }

    return {
      kind: "resolved",
      repository: {
        repositoryPath: resolvedRoot,
        remoteName: selectedRemote.name,
        remoteUrl: selectedRemote.fetchUrl ?? selectedRemote.pushUrl ?? "",
        provider: normalizedRemote.provider,
        targetRef: normalizedRemote.targetRef,
      },
    };
  },
});

const resolveGitRoot = async (
  runner: RepoCommandRunner,
  repositoryPath?: string
): Promise<string | null> => {
  try {
    const result = await runner.run(repositoryPath, ["rev-parse", "--show-toplevel"]);
    const root = result.stdout.trim();
    return root.length > 0 ? root : null;
  } catch {
    return null;
  }
};

const listGitRemotes = async (
  runner: RepoCommandRunner,
  repositoryPath: string
): Promise<GitRemote[]> => {
  const result = await runner.run(repositoryPath, ["remote", "-v"]);
  return parseGitRemoteOutput(result.stdout);
};

const parseGitRemoteOutput = (stdout: string): GitRemote[] => {
  const remotes = new Map<string, GitRemote>();
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!match) {
      continue;
    }

    const [, name, url, kind] = match;
    const remote = remotes.get(name) ?? { name, fetchUrl: null, pushUrl: null };
    if (kind === "fetch") {
      remote.fetchUrl = url;
    } else {
      remote.pushUrl = url;
    }
    remotes.set(name, remote);
  }

  return [...remotes.values()].filter((remote) => remote.fetchUrl || remote.pushUrl);
};

const selectGitRemote = (remotes: GitRemote[], requestedRemoteName?: string): GitRemote | null => {
  if (requestedRemoteName) {
    return remotes.find((remote) => remote.name === requestedRemoteName) ?? null;
  }

  const originRemote = remotes.find((remote) => remote.name === "origin");
  if (originRemote) {
    return originRemote;
  }

  return remotes.length === 1 ? (remotes[0] ?? null) : null;
};

const normalizeGitRemoteUrl = (
  remoteUrl: string
): { provider: RepoProvider; targetRef: string } | null => {
  const sshMatch = remoteUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return normalizeRemoteParts(sshMatch[1], sshMatch[2]);
  }

  const sshProtocolMatch = remoteUrl.match(/^ssh:\/\/git@([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshProtocolMatch) {
    return normalizeRemoteParts(sshProtocolMatch[1], sshProtocolMatch[2]);
  }

  const httpMatch = remoteUrl.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (httpMatch) {
    return normalizeRemoteParts(httpMatch[1], httpMatch[2]);
  }

  return null;
};

const normalizeRemoteParts = (
  host: string | undefined,
  rawTargetRef: string | undefined
): { provider: RepoProvider; targetRef: string } | null => {
  const normalizedHost = host?.trim().toLowerCase();
  const normalizedTargetRef = rawTargetRef?.trim().replace(/^\/+|\/+$/g, "") ?? "";
  if (!normalizedHost || normalizedTargetRef.length === 0 || !normalizedTargetRef.includes("/")) {
    return null;
  }

  return {
    provider: normalizedHost === "github.com" ? "github" : "forgejo",
    targetRef: normalizedTargetRef,
  };
};

const createDefaultRepoCommandRunner = (): RepoCommandRunner => ({
  async run(cwd: string | undefined, args: string[]) {
    const result = await execFileAsync("git", args, { cwd });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  },
});

export {
  createDefaultRepoCommandRunner,
  createRepoContextService,
  listGitRemotes,
  normalizeGitRemoteUrl,
  parseGitRemoteOutput,
  selectGitRemote,
};
