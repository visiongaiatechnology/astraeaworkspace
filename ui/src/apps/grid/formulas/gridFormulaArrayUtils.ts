// STATUS: DIAMANT VGT SUPREME
//
// Runde 243: `normalizeToArray2D` stand hier und wurde in `gridFormulaTypes.toFormulaArray`
// **anders** beantwortet — `ein Element pro Zeile` gegen `[[vector]]`. Die Entscheidung
// `DECISION_FLAT_VECTOR_IN_SCALAR_POSITION.md` hat diese Funktion als die **Referenz**
// benannt und verlangt, dass der Widerspruch verschwindet, statt dass eine der beiden
// Antworten gewinnt. Die Regel steht deshalb jetzt **einmal** in `gridFormulaTypes.ts`;
// diese Datei reicht sie durch, damit die bestehenden Importe unveraendert bleiben.
//
// Nebenbefund: die frueheren Zeilen `as SingleFormulaValue[]` und `as SingleFormulaValue`
// sind damit entfallen. Der Projektstandard verbietet `as`-Casts, und diese beiden waren
// die Ursache dafuer, dass die Regel hier von der in `toFormulaArray` abweichen konnte:
// der Cast hat die Abweichung typstumm gemacht.
export { normalizeToArray2D } from './gridFormulaTypes';

