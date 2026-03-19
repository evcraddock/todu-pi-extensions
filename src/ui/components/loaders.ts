export interface TaskLoaderViewModel {
  label: string;
  isLoading: boolean;
}

const createTaskLoaderViewModel = (label: string): TaskLoaderViewModel => ({
  label,
  isLoading: true,
});

export { createTaskLoaderViewModel };
