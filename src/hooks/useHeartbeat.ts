import { useEffect, useRef } from 'react';
import { authRefreshToken } from '../lib/restClient';
import { getSession, setSession } from '../lib/usersTableAuth';

const INTERVAL_MS = 60 * 1000; // every 1 minute

export function useHeartbeat() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const beat = async () => {
      const session = getSession();
      if (!session) return;
      const { data } = await authRefreshToken();
      if (data?.access_token) {
        setSession({ ...session, access_token: data.access_token });
      }
    };

    timerRef.current = setInterval(beat, INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);
}
