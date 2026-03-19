export interface KeyHint {
  key: string;
  description: string;
}

const formatKeyHint = ({ key, description }: KeyHint): string => `${key}: ${description}`;

export { formatKeyHint };
