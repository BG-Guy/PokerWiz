// Loads data from an async function when a page mounts, and tracks loading and error state.
import { useCallback, useEffect, useState } from 'react';

// loader: () => Promise. Returns { data, error, loading, reload, setData }.
export function useApi(loader) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    loader()
      .then((data) => active && setState({ data, error: null, loading: false }))
      .catch((error) => active && setState({ data: null, error, loading: false }));
    return () => {
      active = false;
    };
    // The loader is meant to be stable for the page's lifetime; reload() re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((update) => {
    setState((current) => ({ ...current, data: typeof update === 'function' ? update(current.data) : update }));
  }, []);

  return { ...state, reload, setData };
}
