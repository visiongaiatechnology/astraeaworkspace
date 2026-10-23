// STATUS: DIAMANT VGT SUPREME — Grid coordinate parsing leaf
export const parseCoord = (coord: string): { colIdx: number; rowIdx: number } => {
  const match = coord.match(/^([A-Z]+)(\d+)$/);
  if (!match) return { colIdx: 0, rowIdx: 0 };
  const colStr = match[1];
  const rowNum = parseInt(match[2], 10) - 1;
  let colIdx = 0;
  for (let i = 0; i < colStr.length; i++) {
    colIdx = colIdx * 26 + (colStr.charCodeAt(i) - 64);
  }
  return { colIdx: colIdx - 1, rowIdx: rowNum };
};
