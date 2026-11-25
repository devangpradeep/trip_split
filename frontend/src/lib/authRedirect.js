const LOCAL_ORIGIN = 'https://tripsplit.invalid';

export const getAuthReturnPath = (next) => {
  if (!next?.startsWith('/') || next.startsWith('//') || /[\\\p{Cc}]/u.test(next)) return '/';

  try {
    const destination = new URL(next, LOCAL_ORIGIN);
    const path = decodeURIComponent(destination.pathname);
    const supportedPath = /^\/(?:join\/[A-Za-z0-9_-]+|groups\/[A-Za-z0-9_-]+|profile)?\/?$/;

    if (destination.origin !== LOCAL_ORIGIN || !supportedPath.test(path)) return '/';

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return '/';
  }
};
