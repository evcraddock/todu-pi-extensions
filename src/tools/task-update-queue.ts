export interface TaskUpdateQueueOptions<T> {
  taskId: string;
  signal?: AbortSignal;
  action: () => Promise<T>;
}

export interface TaskUpdateQueue {
  run<T>(options: TaskUpdateQueueOptions<T>): Promise<T>;
}

const cancellationError = (): Error => {
  const error = new Error("Task update cancelled before write dispatch");
  error.name = "AbortError";
  return error;
};

export const throwIfTaskUpdateAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw cancellationError();
};

const waitForTurn = (previous: Promise<void>, signal?: AbortSignal): Promise<void> => {
  if (!signal) return previous;
  return new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener("abort", onAbort);
      reject(cancellationError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void previous.then(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    });
    if (signal.aborted) onAbort();
  });
};

/** One queue per registered task_update tool; unrelated task IDs never share a tail. */
export const createTaskUpdateQueue = (): TaskUpdateQueue => {
  const tails = new Map<string, Promise<void>>();
  return {
    async run<T>({ taskId, signal, action }: TaskUpdateQueueOptions<T>): Promise<T> {
      throwIfTaskUpdateAborted(signal);
      const previous = tails.get(taskId) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      // The tail always fulfills, including failed or cancelled actions. A cancelled
      // waiter releases its own gate but cannot let later work bypass its predecessor.
      const tail = previous.then(() => gate);
      tails.set(taskId, tail);
      void tail.then(() => {
        if (tails.get(taskId) === tail) tails.delete(taskId);
      });
      try {
        await waitForTurn(previous, signal);
        throwIfTaskUpdateAborted(signal);
        // Do not race the action against abort: a read/write already in flight must
        // settle before another update can safely enter this critical section.
        return await action();
      } finally {
        release();
      }
    },
  };
};
