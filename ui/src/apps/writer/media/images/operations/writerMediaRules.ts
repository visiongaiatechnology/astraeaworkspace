// STATUS: DIAMANT VGT SUPREME — pure Writer media placement predicates
import type { WriterImageBlockData } from '../../../../../shared/contracts/workspace';

export function isWriterImageFixedToPage(image: WriterImageBlockData): boolean {
  return image.fixPositionOnPage === true
    || image.moveWithText === false
    || image.anchorTarget === 'page'
    || image.anchorTarget === 'margin'
    || image.anchorTarget === 'column';
}
