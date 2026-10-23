// STATUS: DIAMANT VGT SUPREME — Writer Text and paragraph schema contracts
import type { WriterHeadingLevel, WriterHyphenationMode, WriterLanguageTag, WriterLineBreakMode, WriterParagraphBorders, WriterParagraphDirection, WriterParagraphShading, WriterParagraphStyleName, WriterTabStop, WriterTextAlignment } from './workspaceWriterLayout';
import type { WriterListNumberFormat } from './workspaceWriterList';

export type WriterTextLink =
  | { kind: 'internal'; paragraphId: string }
  | { kind: 'external'; url: string };

export interface TextSpan {
  text: string;
  character_style_id?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  font_family?: string;
  font_size_pt?: number;
  text_color?: string;
  background_color?: string;
  highlight_color?: string;
  language?: WriterLanguageTag;
  link?: WriterTextLink;
}

export interface TextBlockObject {
  id: string;
  paragraphs: Paragraph[];
}

export interface Paragraph {
  id: string;
  style: ParagraphStyle;
  spans: TextSpan[];
}

export interface ParagraphStyle {
  style_name?: WriterParagraphStyleName;
  heading_level?: WriterHeadingLevel;
  alignment: WriterTextAlignment;
  line_height: number;
  line_spacing_mode?: 'preset' | 'exact' | 'minimum' | 'multiple';
  line_spacing_value?: number;
  space_before: number;
  space_after: number;
  list_style?: 'bullet' | 'number' | 'checklist';
  list_number_format?: WriterListNumberFormat;
  list_id?: string;
  list_restart_numbering?: boolean;
  list_start_value?: number;
  list_override_glyph?: string;
  heading_outline_numbered?: boolean;
  list_style_id?: string;
  linked_style_id?: string;
  list_level?: number;
  left_indent_mm?: number;
  right_indent_mm?: number;
  first_line_indent_mm?: number;
  hanging_indent_mm?: number;
  keep_with_next?: boolean;
  keep_lines_together?: boolean;
  widow_orphan_control?: boolean;
  page_break_before?: boolean;
  column_break_before?: boolean;
  borders?: WriterParagraphBorders;
  shading?: WriterParagraphShading;
  tab_stops?: WriterTabStop[];
  text_direction?: WriterParagraphDirection;
  line_break_mode?: WriterLineBreakMode;
  hyphenation_mode?: WriterHyphenationMode;
  border_top?: string;
  border_bottom?: string;
  background_color?: string;
}
