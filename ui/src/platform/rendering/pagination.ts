// STATUS: DIAMANT VGT SUPREME — shared deterministic pagination primitive

export interface PaginationBlock<T> {
  id: string;
  height: number;
  keepWithNext?: boolean;
  breakBefore?: boolean;
  payload: T;
}

export interface PaginationPage<T> {
  index: number;
  usedHeight: number;
  blocks: PaginationBlock<T>[];
}

export function paginateBlocks<T>(blocks: readonly PaginationBlock<T>[], pageHeight: number): PaginationPage<T>[] {
  const height = Math.max(1, pageHeight);
  if (blocks.length > 1_000_000) throw new Error('render_pagination_block_limit');
  const pages: PaginationPage<T>[] = [];
  let current: PaginationPage<T> = { index: 0, usedHeight: 0, blocks: [] };
  const push = () => { if (current.blocks.length) pages.push(current); current = { index: pages.length, usedHeight: 0, blocks: [] }; };
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    if (!Number.isFinite(block.height) || block.height < 0) throw new Error('render_pagination_height_invalid');
    const next = blocks[index + 1];
    const pairHeight = block.height + (block.keepWithNext && next ? next.height : 0);
    if (block.breakBefore && current.blocks.length) push();
    if (current.blocks.length && current.usedHeight + Math.min(pairHeight, height) > height) push();
    current.blocks.push(block);
    current.usedHeight += block.height;
    if (current.usedHeight >= height) push();
  }
  push();
  return pages;
}
