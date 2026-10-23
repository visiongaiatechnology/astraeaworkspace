// STATUS: PLATIN — Integration & Release, **Paket 12**: die gebundene Ablagefläche der Notes-Oberfläche
//
// ## Warum es diese dünne Schicht gibt
//
// Die Notes-Oberfläche hat **zwei** Orte, an denen ein Workspace-Objekt ankommen darf: die **Leinwand**
// (`NotesFreeCanvas`, freie Anordnung) und die **Seitenliste** (`NotesPagesList`). Beide werden hier **einmal**
// gebunden — mit **einem** Zustand (Paket 12, rein) und **je einem** Satz Handler. Die Komponente **entscheidet
// nichts**: sie nennt dem reinen Modul ihre Fläche und reicht die Ereignisse weiter.
//
// ## Warum sie **außerhalb** der vorhandenen Komponenten liegt
//
// Die Ablagezone ist ein **Geschwister** der Fläche, kein Kind: die Seitenliste bleibt die Seitenliste (ihr
// Baumvertrag, ihre eine Tab-Stelle, ihre eigene Ablage für Seitenverweise), und die Leinwand behält ihre
// Zeigergesten. *Ein Umbau der vorhandenen Komponenten hätte ihren geprüften Vertrag verändert — für eine Zone,
// die daneben gehört.*
//
// ## Die Tastatur ist ein **eigener** Zugang, kein Zusatz
//
// Die Region ist **immer** fokussierbar (`tabIndex={0}`) — nicht erst, während ein Zeiger sie überfährt. *Ein
// Ablageziel, das man nur mit dem Zeiger erreicht, ist ein Befund.* Ihre Beschreibung ist die dauerhaft
// vorhandene Ansageregion (`aria-describedby`), Enter bestätigt, Ziffern wählen die Absicht, Esc verwirft —
// und **ohne** Träger ist die Antwort ein **benannter** Grund (`notes-drop-transfer-missing`), kein stiller
// No-op.
//
// ## Die Touch-Entscheidung wird gesetzt, nicht behauptet
//
// `touchAction` kommt aus `notesDropZoneTouch.ts` (`manipulation`, **nie** `none`): die Notes-Leinwand ist ein
// Scroll-Container, und eine Zone, die Touch **stiehlt**, macht das Verschieben unerreichbar. Diese Komponente
// **beginnt** keine Geste: der einzige Zeiger-Handler hier **liest** die Zeigerart für die Anzeige
// (`notePointerType`) — kein `preventDefault`, kein `setPointerCapture`, kein `pointermove`.
import React from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  notesDropZoneAnnouncerId,
  notesDropZoneTargetLabel,
} from './notesDropZoneContract';
import type { NotesDropZoneSurface } from './notesDropZoneContract';
import { NOTES_DROP_ZONE_TOUCH_ACTION } from './notesDropZoneTouch';
import { NotesWorkspaceDropZoneOverlay } from './NotesWorkspaceDropZoneOverlay';
import type { NotesWorkspaceDropZoneBindings } from './useNotesWorkspaceDropZone';

export interface NotesWorkspaceDropZoneSurfaceProps {
  /** **Welche** der benannten Flächen diese Komponente bindet — sie wird nicht geraten. */
  surface: NotesDropZoneSurface;
  /**
   * Die Bindung aus `useNotesWorkspaceDropZone`. **Fehlt** sie, wird **nichts** gerendert außer den Kindern —
   * *eine Fläche ohne Zone ist keine Zone* (und die vorhandene Oberfläche bleibt dann unverändert).
   */
  zone?: NotesWorkspaceDropZoneBindings;
  /** Die Klassen der Fläche — sie bleiben Sache des Aufrufers (Layout unverändert). */
  className?: string;
  children?: React.ReactNode;
}

export const NotesWorkspaceDropZoneSurface: React.FC<NotesWorkspaceDropZoneSurfaceProps> = ({
  surface,
  zone,
  className,
  children,
}) => {
  if (!zone) return <>{children}</>;
  const handlers = zone.surfaces[surface];
  return (
    <section
      role="group"
      aria-label={notesDropZoneTargetLabel(surface)}
      aria-describedby={notesDropZoneAnnouncerId(surface)}
      // **Immer** fokussierbar: die Tastatur braucht keinen Zeiger, um die Zone zu erreichen.
      tabIndex={0}
      // Die Entscheidung aus dem reinen Modul — **eine** Quelle, kein zweiter Wert in einer Stilregel.
      style={{ touchAction: NOTES_DROP_ZONE_TOUCH_ACTION }}
      className={className === undefined ? 'notes-drop-zone-surface' : `notes-drop-zone-surface ${className}`}
      data-vgt-notes-drop-zone-target={surface}
      onDragEnter={handlers.onDragEnter}
      onDragOver={handlers.onDragOver}
      onDragLeave={handlers.onDragLeave}
      onDrop={handlers.onDrop}
      onKeyDown={handlers.onKeyDown}
      // **Nur beobachten:** keine Geste beginnen, nichts abfangen. Die Zeigerart entscheidet die *angezeigte*
      // Strategie (Langdruck), nicht einen Zug — *ein Zeigerereignis ist keine Touch-Strategie.*
      onPointerDown={(event: ReactPointerEvent<HTMLElement>) => zone.notePointerType(event.pointerType)}
    >
      {children}
      <NotesWorkspaceDropZoneOverlay
        state={zone.state}
        surface={surface}
        inputKind={zone.inputKind}
        onConfirm={zone.confirm}
        onChooseIntent={zone.chooseIntent}
        onDismiss={zone.dismiss}
        onKeyDown={handlers.onKeyDown}
      />
    </section>
  );
};
