// services/pdfConfig.ts
// Single authoritative source of truth for PDF generation configuration.
// Values are preserved verbatim from the previous pdfGenerator.ts defaults
// so visual output does not change. Do not duplicate these in constants.ts.

export interface PdfOptions {
  // Colors
  COLOR_PRIMARY: string;
  COLOR_PRIMARY_LIGHT: string;
  COLOR_SECONDARY: string;
  COLOR_WHITE: string;
  COLOR_BORDER: string;
  COLOR_TEXT: string;
  COLOR_TEXT_SECONDARY: string;
  COLOR_BACKGROUND: string;
  COLOR_DANGER: string;
  COLOR_SUCCESS: string;

  // Layout
  PAGE_MARGIN: number;
  CARD_PADDING: number;
  CARD_MARGIN: number;
  CARD_BORDER_RADIUS: number;
  CARD_SHADOW: string;
  CONTENT_WIDTH: number;
  CARD_WIDTH: number;

  // Typography
  FONT_FAMILY: string;
  FONT_FAMILY_BOLD: string;
  FONT_FAMILY_ITALIC: string;
  FONT_SIZE_SMALL: number;
  FONT_SIZE_NORMAL: number;
  FONT_SIZE_MEDIUM: number;
  FONT_SIZE_LARGE: number;
  FONT_SIZE_XLARGE: number;
  FONT_SIZE_XXLARGE: number;
  FONT_SIZE_TITLE: number;
  FONT_SIZE_HEADER: number;
  FONT_SIZE_SUBHEADER: number;

  // Spacing
  LINE_HEIGHT: number;
  ELEMENT_MARGIN: number;

  // Images - High resolution settings
  IMAGE_QUALITY: number;
  IMAGE_MAX_WIDTH: number;
  IMAGE_MAX_HEIGHT: number;
  IMAGE_PADDING: number;
  IMAGE_CARD_PADDING: number;
  IMAGE_BORDER_RADIUS: number;
  CAPTION_HEIGHT: number;
  CAPTION_MARGIN_TOP: number;
  CAPTION_FONT_SIZE: number;
  CAPTION_PADDING: number;
  CARD_SHADOW_OPACITY: number;

  // Header & Footer
  HEADER_HEIGHT: number;
  FOOTER_HEIGHT: number;
}

export const PDF_OPTIONS: PdfOptions = {
  // Colors - Improved contrast for better readability
  COLOR_PRIMARY: '#1D4ED8',
  COLOR_PRIMARY_LIGHT: '#EFF6FF',
  COLOR_SECONDARY: '#374151',
  COLOR_TEXT: '#111827',
  COLOR_TEXT_SECONDARY: '#6B7280',
  COLOR_BACKGROUND: '#FFFFFF',
  COLOR_WHITE: '#FFFFFF',
  COLOR_BORDER: '#E5E7EB',
  COLOR_DANGER: '#B91C1C',
  COLOR_SUCCESS: '#166534',

  // Layout - Adjusted for better spacing
  PAGE_MARGIN: 30,
  CARD_PADDING: 20,
  CARD_MARGIN: 15,
  CARD_BORDER_RADIUS: 8,
  CARD_SHADOW: '1px 1px 5px rgba(0,0,0,0.1)',
  CONTENT_WIDTH: 0, // Will be calculated based on page width
  CARD_WIDTH: 0, // Will be calculated based on content width

  // Typography - Improved for better readability
  // Using standard fonts that are available by default in jsPDF
  FONT_FAMILY: 'helvetica',
  FONT_FAMILY_BOLD: 'helvetica',
  FONT_FAMILY_ITALIC: 'helvetica',
  FONT_SIZE_SMALL: 10,
  FONT_SIZE_NORMAL: 12,
  FONT_SIZE_MEDIUM: 14,
  FONT_SIZE_LARGE: 16,
  FONT_SIZE_XLARGE: 18,
  FONT_SIZE_XXLARGE: 24,
  FONT_SIZE_TITLE: 16,
  FONT_SIZE_HEADER: 18,
  FONT_SIZE_SUBHEADER: 14,

  // Spacing - Improved vertical rhythm
  LINE_HEIGHT: 1.5,
  ELEMENT_MARGIN: 12,

  // Images - High resolution settings
  IMAGE_QUALITY: 1.0,
  IMAGE_MAX_WIDTH: 500,
  IMAGE_MAX_HEIGHT: 600,
  IMAGE_PADDING: 15,
  IMAGE_CARD_PADDING: 10,
  IMAGE_BORDER_RADIUS: 4,
  CAPTION_HEIGHT: 22,
  CAPTION_MARGIN_TOP: 10,
  CAPTION_FONT_SIZE: 10,
  CAPTION_PADDING: 8,
  CARD_SHADOW_OPACITY: 0.1,

  // Header & Footer
  HEADER_HEIGHT: 80,
  FOOTER_HEIGHT: 30,
};
