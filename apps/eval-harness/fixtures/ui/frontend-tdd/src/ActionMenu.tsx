import { useState } from 'react';

export function ActionMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div role="button" tabIndex={0} onClick={() => setOpen(true)}>Actions</div>
      {open ? <div role="menu">Archive</div> : null}
    </div>
  );
}
