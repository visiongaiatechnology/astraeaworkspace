import React from 'react';

interface Props {
  message: string;
}

export const PresentStudioErrorAlert: React.FC<Props> = ({ message }) => (
  <div role="alert" aria-live="assertive" aria-atomic="true" className="break-words rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-red-200">
    {message}
  </div>
);
