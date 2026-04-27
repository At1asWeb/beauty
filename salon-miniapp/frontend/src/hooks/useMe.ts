import { useEffect, useState } from 'react';

import { ApiError, type Me, api } from '../lib/api';

type State =
  | { status: 'loading' }
  | { status: 'ready'; me: Me }
  | { status: 'error'; error: string };

export function useMe(): State & { refresh: () => void } {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    api
      .me()
      .then((me) => {
        if (!cancelled) setState({ status: 'ready', me });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          err instanceof ApiError
            ? `${err.status}: ${err.detail}`
            : String(err);
        setState({ status: 'error', error: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { ...state, refresh: () => setTick((t) => t + 1) };
}
