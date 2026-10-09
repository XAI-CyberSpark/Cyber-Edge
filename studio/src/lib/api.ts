const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const getApiBaseUrl = () => {
  const envValue = (import.meta.env.VITE_API_URL || "").trim();
  if (envValue) {
    return trimTrailingSlash(envValue);
  }

  if (typeof window !== "undefined") {
    return trimTrailingSlash(window.location.origin);
  }

  return "http://localhost:8000";
};

export const apiUrl = (path: string) => {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
};

export const deviceApiBaseUrl = (targetDevice?: string) => {
  const currentBase = getApiBaseUrl();
  const currentHost = currentBase.replace(/^https?:\/\//, "");

  if (!targetDevice) {
    return currentBase;
  }

  if (/^https?:\/\//.test(targetDevice)) {
    return trimTrailingSlash(targetDevice);
  }

  if (targetDevice === currentHost) {
    return currentBase;
  }

  return targetDevice.includes(":")
    ? `http://${targetDevice}`
    : `http://${targetDevice}:8000`;
};

export const defaultTargetDevice = () => {
  const apiBase = getApiBaseUrl();
  return apiBase.replace(/^https?:\/\//, "");
};
