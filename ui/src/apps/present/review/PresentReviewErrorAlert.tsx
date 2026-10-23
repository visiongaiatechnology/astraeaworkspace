import React from 'react';

interface Props {
  message: string;
}

export const PresentReviewErrorAlert: React.FC<Props> = ({ message }) => (
  <div role="alert" aria-live="assertive" aria-atomic="true" className="break-words text-[0.625rem] text-red-300">
    {message}
  </div>
);
