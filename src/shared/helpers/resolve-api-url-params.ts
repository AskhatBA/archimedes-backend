export const resolveApiUrlParams = (url: string, params: Record<string, string>) => {
  return Object.entries(params).reduce(
    (url, [key, value]) => url.replace(`:${key}`, String(value)),
    url
  );
};
