// A view that lives in the address (?view=bankroll), so the phone's back gesture and the browser's Back button
// close it. open() adds a history entry with the flag; close() goes back when this visit added it (so Back
// doesn't reopen the view) and otherwise just drops the flag (a link straight to the view).
import { useNavigate, useSearchParams } from 'react-router-dom';

// The flags this visit put in the address ("view=bankroll"). Kept outside the component so it survives a
// remount (turning the phone can swap the sheet a view sits in), and forgotten on a reload.
const opened = new Set();

// Returns { on, here, open, close }. on: the flag is in the address. here: it was put there in this visit
// (false for a flag left over from a reload, which a view inside a sheet shouldn't reopen on).
export function useUrlFlag(name, value) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const key = `${name}=${value}`;
  const on = params.get(name) === value;

  const open = () => {
    opened.add(key);
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set(name, value);
      return next;
    });
  };
  const close = () => {
    if (opened.has(key)) navigate(-1);
    else
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete(name);
          return next;
        },
        { replace: true }
      );
    opened.delete(key);
  };

  return { on, here: on && opened.has(key), open, close };
}
