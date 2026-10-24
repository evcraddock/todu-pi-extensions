import { describe, expect, it, vi } from "vitest";

import { createTaskUpdateQueue } from "@/tools/task-update-queue";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("task update queue", () => {
  it("keeps FIFO order for one ID without blocking another ID", async () => {
    const queue = createTaskUpdateQueue();
    const entered = deferred();
    const release = deferred();
    const order: string[] = [];
    const first = queue.run({
      taskId: "one",
      action: async () => {
        order.push("first");
        entered.resolve();
        await release.promise;
      },
    });
    await entered.promise;
    const second = queue.run({
      taskId: "one",
      action: async () => {
        order.push("second");
      },
    });
    const third = queue.run({
      taskId: "one",
      action: async () => {
        order.push("third");
      },
    });
    await queue.run({
      taskId: "other",
      action: async () => {
        order.push("other");
      },
    });
    expect(order).toEqual(["first", "other"]);
    release.resolve();
    await Promise.all([first, second, third]);
    expect(order).toEqual(["first", "other", "second", "third"]);
  });

  it.each(["middle", "tail"] as const)(
    "a cancelled %s waiter cannot release the active predecessor",
    async (position) => {
      const queue = createTaskUpdateQueue();
      const entered = deferred();
      const release = deferred();
      const first = queue.run({
        taskId: "one",
        action: async () => {
          entered.resolve();
          await release.promise;
        },
      });
      await entered.promise;
      const controller = new AbortController();
      const skipped = vi.fn(async () => undefined);
      const cancelled = queue.run({ taskId: "one", signal: controller.signal, action: skipped });
      const rejection = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
      const next = vi.fn(async () => undefined);
      let nextResult: Promise<void> | undefined;
      if (position === "middle") nextResult = queue.run({ taskId: "one", action: next });
      controller.abort();
      await rejection;
      // A cancelled tail must not delete the still-active ID from the map.
      if (position === "tail") nextResult = queue.run({ taskId: "one", action: next });
      await queue.run({ taskId: "other", action: async () => undefined });
      expect(next).not.toHaveBeenCalled();
      expect(skipped).not.toHaveBeenCalled();
      release.resolve();
      await Promise.all([first, nextResult]);
      expect(next).toHaveBeenCalledTimes(1);
    }
  );

  it("does not release a running action just because its signal aborts", async () => {
    const queue = createTaskUpdateQueue();
    const controller = new AbortController();
    const entered = deferred();
    const release = deferred();
    const first = queue.run({
      taskId: "one",
      signal: controller.signal,
      action: async () => {
        entered.resolve();
        await release.promise;
        return "confirmed";
      },
    });
    await entered.promise;
    controller.abort();
    const next = vi.fn(async () => undefined);
    const second = queue.run({ taskId: "one", action: next });
    await queue.run({ taskId: "other", action: async () => undefined });
    expect(next).not.toHaveBeenCalled();
    release.resolve();
    await expect(first).resolves.toBe("confirmed");
    await second;
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("releases after a rejected action and removes abort listeners", async () => {
    const queue = createTaskUpdateQueue();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await expect(
      queue.run({
        taskId: "one",
        signal: controller.signal,
        action: async () => {
          throw new Error("failure");
        },
      })
    ).rejects.toThrow("failure");
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    await expect(queue.run({ taskId: "one", action: async () => "recovered" })).resolves.toBe(
      "recovered"
    );
  });

  it("rejects already-cancelled calls without executing or poisoning future work", async () => {
    const queue = createTaskUpdateQueue();
    const controller = new AbortController();
    controller.abort("untrusted reason");
    const action = vi.fn(async () => undefined);
    await expect(
      queue.run({ taskId: "one", signal: controller.signal, action })
    ).rejects.toMatchObject({
      name: "AbortError",
      message: "Task update cancelled before write dispatch",
    });
    expect(action).not.toHaveBeenCalled();
    await queue.run({ taskId: "one", action });
    expect(action).toHaveBeenCalledTimes(1);
  });
});
