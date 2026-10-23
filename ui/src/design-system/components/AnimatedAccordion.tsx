// STATUS: PLATIN
import React, { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

type HeadingLevel = 2 | 3 | 4 | 5 | 6;

interface AnimatedAccordionProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  headingLevel?: HeadingLevel;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

export const AnimatedAccordion: React.FC<AnimatedAccordionProps> = ({
  title,
  children,
  defaultOpen = false,
  headingLevel = 3,
  className = '',
  triggerClassName = '',
  contentClassName = '',
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const generatedId = useId();
  const id = `vgt-accordion-${generatedId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const headingTag = `h${headingLevel}` as const;

  return (
    <section className={`vgt-animated-accordion ${className}`} data-expanded={open}>
      {React.createElement(headingTag, { className: 'm-0 text-inherit font-inherit' },
        <button
          id={`${id}-trigger`}
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          className={`vgt-animated-accordion__trigger ${triggerClassName}`}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{title}</span>
          <ChevronDown aria-hidden="true" focusable="false" className="vgt-animated-accordion__icon" />
        </button>,
      )}
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-trigger`}
        aria-hidden={!open}
        inert={!open}
        className="vgt-animated-accordion__panel"
      >
        <div className="vgt-animated-accordion__panel-inner">
          <div className={contentClassName}>{children}</div>
        </div>
      </div>
    </section>
  );
};
