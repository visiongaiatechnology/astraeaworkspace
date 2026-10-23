// STATUS: GOLD — Writer: der eine Zwischenablage-Zugriff der Oberfläche
//
// ## Warum das eine eigene Datei ist
//
// `navigator.clipboard` war an zwei Stellen im Writer je einmal direkt angefasst: im Absatzkontextmenü
// (`navigator.clipboard?.writeText(...)`) und im Gleichungsblock (`navigator.clipboard.writeText(...)`).
// Zwei Funktionen für dieselbe Sache — und genau deshalb trug eine von beiden den Fehler weiter, den die
// andere schon nicht mehr hatte. Hier steht der Zugriff **einmal**, als Wert.
//
// Die Befehlsfunktionen (`writerClipboardCommand.ts`) nehmen diesen Wert als Parameter. Das ist der Grund,
// warum sie ohne DOM fahrbar sind: die einzige DOM-Berührung des Zwischenablage-Pfades liegt in dieser
// Datei, und sie beantwortet "es gibt hier keine Zwischenablage" mit `null` statt mit einem `?.`.
import type { WriterClipboardPort } from './writerClipboardCommand';

/**
 * Liefert den Zugriff des Browsers oder `null`.
 *
 * `null` ist ein **Fall**, kein Ausrutscher: die Befehlsfunktionen machen daraus `clipboard-unavailable`
 * und melden ihn sichtbar. Ein unsicherer Kontext (kein HTTPS), ein fehlendes Browser-Objekt und eine
 * Umgebung ohne `navigator` landen alle in derselben, benannten Ursache.
 */
export function resolveWriterClipboardPort(): WriterClipboardPort | null {
  if (typeof navigator === 'undefined') return null;
  const clipboard: Clipboard | undefined = navigator.clipboard;
  if (!clipboard) return null;
  return {
    writeText: (text: string) => clipboard.writeText(text),
    readText: () => clipboard.readText(),
  };
}
