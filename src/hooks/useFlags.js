// The flagged decisions on this device (utils/flags.js), kept current in every screen that shows them.
import { useEffect, useState } from 'react';
import { readFlags, subscribeFlags } from '../utils/flags.js';

export function useFlags() {
  const [flags, setFlags] = useState(readFlags);
  useEffect(() => subscribeFlags(setFlags), []);
  return flags;
}
