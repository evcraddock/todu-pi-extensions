import { Type, type TStringOptions, type TUnsafe } from "typebox";

const stringEnum = <TValues extends readonly string[]>(
  values: TValues,
  options?: TStringOptions
): TUnsafe<TValues[number]> =>
  Type.Unsafe<TValues[number]>({
    ...options,
    type: "string",
    enum: [...values],
  });

export { stringEnum };
